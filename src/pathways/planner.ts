import type { Claim, Proposal, Requirement, Resource, RunState } from "./types.ts";

const HARD_STOP = new Set([
  "blocked_dataset",
  "country_mismatch",
  "language_mismatch",
  "missing_provenance",
  "citation_only",
]);

export function pathwayPlanner(state: RunState): void {
  const blocked = state.findingLog.some((finding) => finding.severity === "block" && HARD_STOP.has(finding.code));
  if (!state.forceOverclaim && state.repairs.length > 0 && blocked) {
    state.decision = "abstain";
    state.proposal = null;
    state.question = null;
    state.abstainReason =
      "I cannot justify a next step from the retrieved records. A person should review the source before any recommendation is used.";
    state.escalation = null;
    return;
  }

  if (!state.forceOverclaim && state.rejectedOverclaim && !state.decisive) {
    state.decision = "abstain";
    state.proposal = null;
    state.question = null;
    state.abstainReason =
      "The shared certificate does not support a competency in this pathway. No recommendation is made from it.";
    return;
  }

  if (!state.forceOverclaim && !state.decisive) {
    const prompts = state.pathway.questions[state.languageCode] ?? state.pathway.questions.en;
    const hasSample = state.evidenceItems.some((item) => item.kind === "work_sample");
    state.decision = "ask";
    state.proposal = null;
    state.abstainReason = null;
    state.question = hasSample ? prompts.ambiguous : prompts.none;
    return;
  }

  const gap = firstGap(state);
  const kind = gap ? "practice" : "transfer";
  const resource = state.pathway.resources.find(
    (item) => item.language_code === state.languageCode && item.kind === kind,
  );
  if (!resource) {
    state.decision = "abstain";
    state.proposal = null;
    state.question = null;
    state.abstainReason = `No approved ${kind} resource is available in the learner's language (${state.languageCode}).`;
    return;
  }
  const requirement = state.pathway.requirements.find(
    (item) =>
      item.competency_id === (gap ?? "comp-known-fact") && item.language_code === state.languageCode,
  );
  const overstates = state.forceOverclaim || (state.repairs.length === 0 && Boolean(gap) && hasDemonstrated(state));
  state.decision = "propose";
  state.question = null;
  state.abstainReason = null;
  state.proposal = buildProposal(state, resource, requirement, gap, overstates);
}

function firstGap(state: RunState): string | null {
  for (const competencyId of state.pathway.competency_order) {
    const claim = claimFor(state, competencyId);
    if (!claim || claim.state !== "demonstrated") return competencyId;
  }
  return null;
}

function hasDemonstrated(state: RunState): boolean {
  return state.claims.some((claim) => claim.state === "demonstrated" && !claim.rejected);
}

function claimFor(state: RunState, competencyId: string): Claim | undefined {
  return state.claims.find((claim) => claim.competency_id === competencyId && !claim.rejected);
}

function buildProposal(
  state: RunState,
  resource: Resource,
  requirement: Requirement | undefined,
  gap: string | null,
  overstates: boolean,
): Proposal {
  const claim = gap ? claimFor(state, gap) : undefined;
  const statement =
    state.pathway.competencies.find((item) => item.id === gap)?.statement ??
    "Use the three-part update on a new situation.";
  const evidenceIds = state.claims
    .filter((item) => item.state === "demonstrated")
    .flatMap((item) => item.evidence_ids);
  const sourceIds = [
    resource.source_id,
    ...(requirement ? [requirement.source_id] : []),
    ...state.claims.filter((item) => item.state === "demonstrated").flatMap((item) => item.source_ids),
  ].filter((id, index, all) => id && all.indexOf(id) === index);

  if (overstates) {
    return {
      resource_id: resource.resource_id,
      addressed_competency_id: gap,
      why: "The evidence shows you can already perform the whole status update and that you are job-ready.",
      evidence_summary: `Evidence ids considered: ${evidenceIds.join(", ") || "none"}.`,
      uncertain: "None.",
      next_action: `Complete ${resource.title}.`,
      source_ids: sourceIds,
      overstates: true,
    };
  }

  if (!gap) {
    return {
      resource_id: resource.resource_id,
      addressed_competency_id: null,
      why: "Why this next step: the evidence you chose shows each competency in this pathway. The transfer check asks for the same three-part update in a new situation.",
      evidence_summary: `Demonstrated evidence ids: ${evidenceIds.join(", ")}. Requirement sources: ${sourceIds.join(", ")}.`,
      uncertain: "A short check does not show how you would do this on another day, in a hiring process, or for a grade.",
      next_action: `When you are ready, complete ${resource.title}. You can still edit or dismiss it.`,
      source_ids: sourceIds,
      overstates: false,
    };
  }

  const stateLabel = claim?.state === "needs_more_evidence" ? "needs more evidence" : "unknown";
  return {
    resource_id: resource.resource_id,
    addressed_competency_id: gap,
    why: `Why this next step: "${statement}" is ${stateLabel}. ${resource.title} practices that part only.`,
    evidence_summary: `${claim?.rationale ?? "No claim was demonstrated for this part."} Evidence ids: ${(claim?.evidence_ids ?? []).join(", ") || "none"}. Sources: ${sourceIds.join(", ")}.`,
    uncertain: "A missed quiz item or a short note does not describe every future task. This is not a score.",
    next_action: `Do this now: ${resource.body}`,
    source_ids: sourceIds,
    overstates: false,
  };
}
