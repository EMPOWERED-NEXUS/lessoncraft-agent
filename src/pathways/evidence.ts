import { sourceById } from "./catalog.ts";
import { containsBanned, matchesAny } from "./text-rules.ts";
import type { Claim, ClaimState, EvidenceItem, RunState } from "./types.ts";

const CONTENT = ["comp-known-fact", "comp-unknown", "comp-next-action"];

export function evidenceAnalyst(state: RunState, input: {
  quizAnswers?: Record<string, string> | null;
  certificate?: { shared: boolean; title: string; claimedCompetencyIds: string[]; sourceId: string } | null;
  workSample?: string;
}): void {
  const evidence: EvidenceItem[] = [];
  const partials = new Map<string, Array<{ state: ClaimState; evidenceId: string; sourceId: string; rationale: string }>>();
  const extras: Claim[] = [];
  let sampleDecisive = false;
  state.sampleBanned = false;

  const quiz = input.quizAnswers;
  if (quiz) {
    for (const item of state.pathway.quiz) {
      const given = (quiz[item.id] ?? "").trim().toLowerCase();
      if (!given) continue;
      const evidenceId = `quiz:${item.id}`;
      evidence.push({
        evidence_id: evidenceId,
        kind: "quiz",
        source_ids: [item.source_id],
        label: `${item.id} answered`,
      });
      const correct = given === item.answer.toLowerCase();
      for (const competencyId of item.competency_ids) {
        pushPartial(partials, competencyId, {
          state: correct ? "demonstrated" : "needs_more_evidence",
          evidenceId,
          sourceId: item.source_id,
          rationale: correct
            ? `${item.id} matched the stored answer key.`
            : `${item.id} did not match the stored answer key.`,
        });
      }
    }
  }

  const sample = (input.workSample ?? "").trim();
  if (sample) {
    evidence.push({
      evidence_id: "work-sample",
      kind: "work_sample",
      source_ids: ["src-np-rubric-01"],
      label: "Work sample the learner chose to type",
    });
    state.sampleBanned = containsBanned(sample);
    const words = sample.split(/\s+/).filter(Boolean).length;
    const hits: Record<string, boolean> = {};
    for (const signal of state.pathway.sample_signals) {
      const patterns = signal.languages[state.languageCode] ?? signal.languages.en ?? [];
      hits[signal.competency_id] = matchesAny(sample, patterns);
      if (hits[signal.competency_id]) sampleDecisive = true;
    }
    for (const competencyId of CONTENT) {
      pushPartial(partials, competencyId, {
        state: hits[competencyId] ? "demonstrated" : "needs_more_evidence",
        evidenceId: "work-sample",
        sourceId: "src-np-rubric-01",
        rationale: hits[competencyId]
          ? "The work sample matches the teacher-approved rubric for this part."
          : "The work sample does not match the teacher-approved rubric for this part.",
      });
    }
    const three = CONTENT.every((id) => hits[id]);
    const plain: ClaimState =
      state.sampleBanned || !three || words > 60 ? "needs_more_evidence" : "demonstrated";
    const over: ClaimState = state.sampleBanned ? "needs_more_evidence" : three ? "demonstrated" : "needs_more_evidence";
    pushPartial(partials, "comp-plain-language", {
      state: plain,
      evidenceId: "work-sample",
      sourceId: "src-np-rubric-01",
      rationale: "Plain language requires the three parts in a short note without a hiring or grade claim.",
    });
    pushPartial(partials, "comp-no-overclaim", {
      state: over,
      evidenceId: "work-sample",
      sourceId: "src-np-rubric-01",
      rationale: state.sampleBanned
        ? "The note includes a job, grade, or eligibility claim."
        : "The note does not add a job, grade, or eligibility claim.",
    });
  }

  const certificate = input.certificate;
  if (certificate?.shared) {
    const source = sourceById(state.pathway, certificate.sourceId);
    const allowed = new Set(source?.supports_competencies ?? []);
    const usable = Boolean(source?.reuse_ok) && source?.source_class !== "citation_only";
    evidence.push({
      evidence_id: "certificate",
      kind: "certificate",
      source_ids: certificate.sourceId ? [certificate.sourceId] : [],
      label: certificate.title || "Shared certificate",
    });
    const claimed = certificate.claimedCompetencyIds.length ? certificate.claimedCompetencyIds : ["unspecified"];
    for (const competencyId of claimed) {
      const known = state.pathway.competencies.some((item) => item.id === competencyId);
      const ok = usable && known && allowed.has(competencyId);
      if (ok) {
        pushPartial(partials, competencyId, {
          state: "demonstrated",
          evidenceId: "certificate",
          sourceId: source!.source_id,
          rationale: "The learner chose to share a synthetic certificate that lists this competency.",
        });
      } else {
        extras.push({
          claim_id: `claim-rejected-${competencyId}`,
          competency_id: competencyId,
          state: "needs_more_evidence",
          evidence_ids: ["certificate"],
          source_ids: certificate.sourceId ? [certificate.sourceId] : [],
          rationale: "This shared certificate is not an approved source for that claim.",
          rejected: true,
        });
      }
    }
  }

  const claims: Claim[] = [];
  for (const competency of state.pathway.competencies) {
    const parts = partials.get(competency.id) ?? [];
    claims.push(mergeClaim(competency.id, parts, state.sampleBanned));
  }
  claims.push(...extras);
  state.evidenceItems = evidence;
  state.claims = claims;
  state.rejectedOverclaim = extras.some((claim) => claim.rejected);
  const quizDecisive = Boolean(quiz && Object.values(quiz).some((value) => value?.trim()));
  const certDecisive = claims.some(
    (claim) => claim.state === "demonstrated" && claim.evidence_ids.includes("certificate") && !claim.rejected,
  );
  state.decisive = quizDecisive || sampleDecisive || certDecisive;
}

function pushPartial(
  map: Map<string, Array<{ state: ClaimState; evidenceId: string; sourceId: string; rationale: string }>>,
  competencyId: string,
  part: { state: ClaimState; evidenceId: string; sourceId: string; rationale: string },
): void {
  const list = map.get(competencyId) ?? [];
  list.push(part);
  map.set(competencyId, list);
}

function mergeClaim(
  competencyId: string,
  parts: Array<{ state: ClaimState; evidenceId: string; sourceId: string; rationale: string }>,
  sampleBanned: boolean,
): Claim {
  if (parts.length === 0) {
    return {
      claim_id: `claim-${competencyId}`,
      competency_id: competencyId,
      state: "unknown",
      evidence_ids: [],
      source_ids: [],
      rationale: "No chosen evidence addresses this competency.",
    };
  }
  const negativeWins =
    sampleBanned && (competencyId === "comp-no-overclaim" || competencyId === "comp-plain-language");
  let state: ClaimState = "unknown";
  if (negativeWins && parts.some((part) => part.state === "needs_more_evidence")) {
    state = "needs_more_evidence";
  } else if (parts.some((part) => part.state === "demonstrated")) {
    state = "demonstrated";
  } else if (parts.some((part) => part.state === "needs_more_evidence")) {
    state = "needs_more_evidence";
  }
  const used = parts.filter((part) => part.state === state);
  return {
    claim_id: `claim-${competencyId}`,
    competency_id: competencyId,
    state,
    evidence_ids: [...new Set(used.map((part) => part.evidenceId))],
    source_ids: [...new Set(used.map((part) => part.sourceId))],
    rationale: used.map((part) => part.rationale).join(" "),
  };
}
