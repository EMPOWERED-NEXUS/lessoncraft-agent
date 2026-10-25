import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isTestMode } from "../env.ts";
import { llmConfigured } from "../llm.ts";
import { repoRoot } from "../paths.ts";
import { loadFixture } from "./catalog.ts";
import { evidenceAnalyst } from "./evidence.ts";
import { pathwayPlanner } from "./planner.ts";
import type { Outcome, RunInput, RunState, TraceEvent } from "./types.ts";
import { attachNvidiaDraft } from "./nvidia-draft.ts";
import { verificationAgent } from "./verifier.ts";
import { readPassages, type ZetarisPassageRead } from "./zetaris-read.ts";

const REPAIR_LIMIT = 2;

export function createState(input: RunInput): RunState {
  const pathway = input.catalog ?? loadFixture();
  if (input.pathwayId && input.pathwayId !== pathway.pathway_id && !input.catalog) {
    throw new Error(`This demo includes one pathway: ${pathway.pathway_id}.`);
  }
  return {
    runId: randomUUID(),
    learnerId: input.learnerId,
    countryCode: input.countryCode.toUpperCase(),
    languageCode: input.languageCode.toLowerCase(),
    pathway,
    evidenceItems: [],
    claims: [],
    decisive: false,
    rejectedOverclaim: false,
    sampleBanned: false,
    proposal: null,
    question: null,
    abstainReason: null,
    escalation: null,
    decision: "abstain",
    outcome: "uncertain",
    findings: [],
    findingLog: [],
    repairs: [],
    verificationOk: false,
    dataOrigin: "local-fixture",
    zetarisNote: "Fixture mode. No approved Zetaris passage was returned. The pathway structure comes from the local fixture.",
    supportingPassages: [],
    modelMode: resolveModelMode(),
    reviewStatus: "pending",
    editedText: null,
    practiceResult: null,
    transferResult: null,
    memoryIds: [],
    trace: [],
    forceOverclaim: Boolean(input.forceOverclaim),
    nvidia: {
      called: false,
      model: null,
      passageIds: [],
      verifier: "not_run",
      fallback: false,
      fallbackReason: null,
      repairAttempted: false,
      usage: null,
      draft: null,
      reason: "no_consent",
    },
  };
}

export async function runPathway(input: RunInput): Promise<RunState> {
  validateInput(input);
  const state = createState(input);
  await retrieve(state, input.skipZetaris === true);
  evidenceAnalyst(state, input);
  trace(state, "evidence-analyst", "Mapped chosen evidence to competency claims.", {
    evidence_ids: state.evidenceItems.map((item) => item.evidence_id),
    claims: state.claims.map((claim) => ({
      competency_id: claim.competency_id,
      state: claim.state,
      evidence_ids: claim.evidence_ids,
      source_ids: claim.source_ids,
      rejected: Boolean(claim.rejected),
    })),
    decisive: state.decisive,
  });

  let guard = 0;
  while (guard < 4) {
    guard += 1;
    pathwayPlanner(state);
    trace(state, "pathway-planner", `Planner decision: ${state.decision}.`, {
      resource_id: state.proposal?.resource_id ?? null,
      overstates: state.proposal?.overstates ?? false,
      why: state.proposal?.why ?? null,
      question: state.question,
      abstainReason: state.abstainReason,
    });
    verificationAgent(state);
    trace(state, "verification-agent", state.verificationOk ? "Verification passed." : "Verification blocked the draft.", {
      ok: state.verificationOk,
      codes: state.findings.map((finding) => finding.code),
    });
    if (state.verificationOk) break;
    if (state.repairs.length >= REPAIR_LIMIT) {
      state.decision = "escalate";
      state.proposal = null;
      state.question = null;
      state.escalation =
        "The checker still rejected the draft after the repair limit. A person should review this before a next step is assigned.";
      state.verificationOk = false;
      trace(state, "orchestrator", "Repair limit reached. Escalating to a person.", {
        repairs: state.repairs.length,
      });
      break;
    }
    state.repairs.push({
      attempt: state.repairs.length + 1,
      action: "revise",
      codes: state.findings.map((finding) => finding.code),
    });
    trace(state, "orchestrator", "Sent the draft back to the planner.", {
      attempt: state.repairs.length,
      codes: state.findings.map((finding) => finding.code),
    });
  }

  if (state.repairs.length > 0 && state.verificationOk && state.decision === "propose") {
    const codes = [...new Set(state.repairs.flatMap((repair) => repair.codes))];
    trace(state, "orchestrator", `Correction recorded: removed ${codes.join(", ")}. The revised next step no longer treats an open requirement as already shown.`, {
      correction: true,
      codes,
      revised_action: state.proposal?.next_action ?? null,
    });
  }

  state.outcome = classify(state);
  await attachNvidiaDraft(state, input);
  trace(state, "orchestrator", `Final outcome: ${state.outcome}.`, {
    decision: state.decision,
    data_origin: state.dataOrigin,
    model_mode: state.modelMode,
  });
  persistTrace(state);
  return state;
}

async function retrieve(state: RunState, skip: boolean): Promise<void> {
  if (skip || isTestMode()) {
    state.dataOrigin = "local-fixture";
    state.supportingPassages = [];
    state.zetarisNote = "Fixture mode. This run did not query Zetaris. The pathway structure comes from the local fixture.";
    trace(state, "retrieval", "Fixture mode. This run did not query Zetaris. The pathway structure comes from the local fixture.", {
      pathway_origin: "local-fixture",
      passage_origin: "none",
      requirement_ids: state.pathway.requirements.map((item) => item.requirement_id),
      resource_ids: state.pathway.resources.map((item) => item.resource_id),
      source_ids: state.pathway.sources.map((item) => item.source_id),
    });
    return;
  }
  const remote = await readPassages();
  applyPassageRead(state, remote);
}

export function applyPassageRead(state: RunState, remote: ZetarisPassageRead): void {
  state.dataOrigin = "local-fixture";
  state.zetarisNote = remote.note;
  state.supportingPassages = remote.ok ? remote.passages : [];
  const passage = state.supportingPassages[0];
  trace(state, "retrieval", passage
    ? `Pathway structure comes from the local fixture. Supporting passage ${passage.passage_id} comes from Zetaris.`
    : "Fixture mode. No approved Zetaris passage was returned. The pathway structure comes from the local fixture.", {
    pathway_origin: "local-fixture",
    passage_origin: passage ? "zetaris" : "none",
    passage_id: passage?.passage_id ?? null,
    section_locator: passage?.section_locator ?? null,
    licence: passage?.licence ?? null,
    content_origin: passage?.content_origin ?? null,
    source_url: passage?.source_url ?? null,
    databases: remote.databases,
  });
}

export function classify(state: RunState): Outcome {
  if (state.decision === "escalate") return "uncertain";
  if (state.decision === "propose" && state.verificationOk) return "supported";
  if (state.decision === "ask") return "uncertain";
  if (state.decision === "abstain") {
    const hard = state.findingLog.some((finding) =>
      ["blocked_dataset", "country_mismatch"].includes(finding.code),
    );
    if (hard || state.rejectedOverclaim) return "unsupported";
    return "uncertain";
  }
  return "uncertain";
}

export function modelModeFor(testMode: boolean, configured: boolean): string {
  if (testMode) return "deterministic-test";
  if (!configured) return "deterministic-no-llm";
  return "foundation-model-unused";
}

export function resolveModelMode(): string {
  return modelModeFor(isTestMode(), llmConfigured());
}

function validateInput(input: RunInput): void {
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(input.learnerId)) {
    throw new Error("Use a short pseudonymous id such as demo-a. Do not use an email or a real name.");
  }
  if (!/^[A-Za-z]{2}$/.test(input.countryCode)) throw new Error("Country code must be two letters.");
  if (!/^[A-Za-z]{2}$/.test(input.languageCode)) throw new Error("Language code must be two letters.");
  if ((input.workSample ?? "").length > 500) throw new Error("Work sample is limited to 500 characters.");
}

function trace(state: RunState, role: TraceEvent["role"], summary: string, detail?: Record<string, unknown>): void {
  const event: TraceEvent = { at: new Date().toISOString(), role, summary, detail };
  state.trace.push(event);
  const codes = detail && "codes" in detail ? ` codes=${JSON.stringify(detail.codes)}` : "";
  console.log(`[nexus] run=${state.runId} role=${role} ${summary}${codes}`);
}

function persistTrace(state: RunState): void {
  const dir = path.join(repoRoot, ".lessoncraft", "traces");
  fs.mkdirSync(dir, { recursive: true });
  const safe = JSON.parse(JSON.stringify({
    runId: state.runId,
    outcome: state.outcome,
    decision: state.decision,
    dataOrigin: state.dataOrigin,
    modelMode: state.modelMode,
    repairs: state.repairs,
    trace: state.trace,
  })) as unknown;
  fs.writeFileSync(path.join(dir, `${state.runId}.json`), JSON.stringify(safe, null, 2));
}
