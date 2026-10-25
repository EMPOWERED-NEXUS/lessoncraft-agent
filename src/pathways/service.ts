import { loadFixture } from "./catalog.ts";
import { memoryDelta, pathwayMemory, recallLearner, rememberLearner, resetLearner } from "./memory.ts";
import { gradeActivity } from "./practice.ts";
import { DEMO_PRESETS } from "./presets.ts";
import { runPathway } from "./run.ts";
import type { PublicRun, RunInput, RunState } from "./types.ts";
import { stripActivity } from "./types.ts";

const sessions = new Map<string, RunState>();

export async function startRun(input: RunInput): Promise<PublicRun> {
  const state = await runPathway(input);
  const recalled = await recallLearner(state.learnerId).catch(() => ({ records: [], retrievedIds: [] as string[] }));
  const demonstrated = demonstratedIds(state);
  const delta = memoryDelta(recalled.records, demonstrated, "not_submitted");
  state.trace.push({
    at: new Date().toISOString(),
    role: "hmem",
    summary: recalled.records.length
      ? `Retrieved ${recalled.records.length} Meterless record(s) for this id. Private evidence is not included.`
      : "No Meterless record is stored for this id yet.",
    detail: {
      retrievedIds: recalled.retrievedIds,
      priorDemonstrated: delta.priorDemonstrated,
      added: delta.added,
    },
  });
  sessions.set(state.runId, state);
  return { ...toPublic(state), priorMemory: recalled.records, memoryDelta: delta };
}

export function reviewRun(runId: string, action: "accept" | "edit" | "dismiss", editedText?: string): PublicRun {
  const state = must(runId);
  if (action === "edit") {
    const text = (editedText ?? "").trim();
    if (!text) throw new Error("An edit needs the next step in your own words.");
    if (text.length > 500) throw new Error("Keep the edit under 500 characters.");
    state.reviewStatus = "edited";
    state.editedText = text;
  } else if (action === "accept") {
    state.reviewStatus = "accepted";
  } else {
    state.reviewStatus = "dismissed";
    state.editedText = null;
  }
  state.trace.push({
    at: new Date().toISOString(),
    role: "orchestrator",
    summary: `Learner ${action}ed the recommendation.`,
    detail: { reviewStatus: state.reviewStatus },
  });
  return toPublic(state);
}

export function submitPractice(
  runId: string,
  phase: "practice" | "transfer",
  closedAnswer: string,
  openAnswer: string,
): PublicRun {
  const state = must(runId);
  if (state.reviewStatus !== "accepted" && state.reviewStatus !== "edited") {
    throw new Error("Accept or edit the recommendation before the practice.");
  }
  if (state.decision !== "propose") {
    throw new Error("There is no practice attached to an abstention or a question.");
  }
  if (phase === "transfer" && !state.practiceResult) {
    throw new Error("Complete the practice before the transfer check.");
  }
  const activity = state.pathway[phase][state.languageCode] ?? state.pathway[phase].en;
  if (!activity) throw new Error("No activity is available in this language.");
  const grade = gradeActivity(phase, activity, closedAnswer, openAnswer);
  if (phase === "practice") state.practiceResult = grade;
  else state.transferResult = grade;
  state.trace.push({
    at: new Date().toISOString(),
    role: "assessor",
    summary: grade.label,
    detail: {
      phase,
      closedCorrect: grade.closedCorrect,
      open: grade.open.result,
      met: grade.open.met,
      missed: grade.open.missed,
    },
  });
  console.log(`[nexus] run=${state.runId} role=assessor ${grade.label}`);
  return toPublic(state);
}

export async function saveMemory(
  runId: string,
  consent: boolean,
  feedback: "helpful" | "not_helpful",
): Promise<PublicRun & { memory?: { mined: string[]; stored: string; retrieved: string[] } }> {
  const state = must(runId);
  if (!consent) {
    state.trace.push({
      at: new Date().toISOString(),
      role: "hmem",
      summary: "Learner did not consent. Nothing was stored.",
    });
    return toPublic(state);
  }
  const before = await recallLearner(state.learnerId);
  const memory = await rememberLearner(state, feedback);
  const after = await recallLearner(state.learnerId);
  const demonstrated = demonstratedIds(state);
  const outcome = state.transferResult?.open.result ?? state.practiceResult?.open.result ?? "not_submitted";
  const delta = memoryDelta(before.records, demonstrated, outcome);
  state.memoryIds.push(memory.stored, ...memory.mined);
  state.trace.push({
    at: new Date().toISOString(),
    role: "hmem",
    summary: "Mined, stored, and retrieved a pseudonymous Meterless record. The work sample was not stored.",
    detail: {
      services: ["MemoryMiningService", "MemoryStoreService", "MemoryRetrievalService", "feedback"],
      stored: memory.stored,
      mined: memory.mined,
      retrieved: memory.retrieved,
      added: delta.added,
      priorDemonstrated: delta.priorDemonstrated,
    },
  });
  console.log(`[nexus] run=${state.runId} role=hmem stored=${memory.stored}`);
  return { ...toPublic(state), memory, priorMemory: after.records, memoryDelta: delta };
}

export async function forgetLearner(learnerId: string): Promise<{ deleted: string[] }> {
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(learnerId)) {
    throw new Error("Use the same pseudonymous id.");
  }
  const deleted = await resetLearner(learnerId);
  return { deleted };
}

export function getRun(runId: string): PublicRun {
  return toPublic(must(runId));
}

export function resetPathwaySessions(): void {
  sessions.clear();
}

function demonstratedIds(state: RunState): string[] {
  return state.claims
    .filter((claim) => claim.state === "demonstrated" && !claim.rejected)
    .map((claim) => claim.competency_id);
}

function must(runId: string): RunState {
  const state = sessions.get(runId);
  if (!state) throw new Error("Unknown run. Start again from the goal.");
  return state;
}

export function toPublic(state: RunState): PublicRun {
  const resource = state.proposal
    ? state.pathway.resources.find((item) => item.resource_id === state.proposal?.resource_id) ?? null
    : null;
  const citedIds = new Set(state.proposal?.source_ids ?? []);
  return {
    runId: state.runId,
    pathwayId: state.pathway.pathway_id,
    title: state.pathway.title,
    disclaimer: state.pathway.disclaimer,
    learnerId: state.learnerId,
    countryCode: state.countryCode,
    languageCode: state.languageCode,
    outcome: state.outcome,
    decision: state.decision,
    dataOrigin: state.dataOrigin,
    zetarisNote: state.zetarisNote,
    supportingPassages: state.supportingPassages,
    modelMode: state.modelMode,
    claims: state.claims,
    proposal: state.proposal,
    resource,
    citedSources: state.pathway.sources.filter((source) => citedIds.has(source.source_id)),
    contextSources: state.pathway.sources.filter((source) => source.source_class === "citation_only"),
    question: state.question,
    abstainReason: state.abstainReason,
    escalation: state.escalation,
    findings: state.findings,
    repairs: state.repairs,
    verificationOk: state.verificationOk,
    reviewStatus: state.reviewStatus,
    editedText: state.editedText,
    practice: stripActivity(state.pathway.practice[state.languageCode] ?? state.pathway.practice.en),
    transfer: stripActivity(state.pathway.transfer[state.languageCode] ?? state.pathway.transfer.en),
    practiceResult: state.practiceResult,
    transferResult: state.transferResult,
    trace: state.trace,
  };
}

export function catalogView() {
  const file = loadFixture();
  return {
    pathwayId: file.pathway_id,
    title: file.title,
    disclaimer: file.disclaimer,
    languages: file.languages,
    countryScope: file.country_scope,
    competencies: file.competencies,
    quiz: file.quiz.map((item) => ({
      id: item.id,
      prompt: item.prompt,
      competency_ids: item.competency_ids,
      options: item.options,
    })),
    presets: DEMO_PRESETS,
  };
}

export async function memoryReady(): Promise<{ source: string; pin: string }> {
  const loaded = await pathwayMemory();
  return { source: loaded.source, pin: loaded.pin };
}
