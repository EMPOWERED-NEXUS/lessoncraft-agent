import { isBlockedRecord, sourceById } from "./catalog.ts";
import { containsBanned, containsOverclaim } from "./text-rules.ts";
import type { Finding, RunState, SourceRecord } from "./types.ts";

export function verificationAgent(state: RunState): void {
  const findings: Finding[] = [];
  for (const claim of state.claims) {
    if (claim.state !== "demonstrated" || claim.rejected) continue;
    if (claim.evidence_ids.length === 0) {
      findings.push(block("claim_without_evidence", `${claim.competency_id} is marked demonstrated without evidence.`));
    }
    for (const evidenceId of claim.evidence_ids) {
      if (!state.evidenceItems.some((item) => item.evidence_id === evidenceId)) {
        findings.push(block("unknown_evidence", `${claim.competency_id} cites missing evidence ${evidenceId}.`));
      }
    }
    if (claim.source_ids.length === 0) {
      findings.push(block("missing_provenance", `${claim.competency_id} has no source id.`));
    }
    for (const sourceId of claim.source_ids) {
      inspectSource(state, sourceId, findings);
    }
  }

  if (state.decision === "propose" && state.proposal) {
    const text = [
      state.proposal.why,
      state.proposal.evidence_summary,
      state.proposal.uncertain,
      state.proposal.next_action,
    ].join("\n");
    const resource = state.pathway.resources.find((item) => item.resource_id === state.proposal?.resource_id);
    if (!resource) {
      findings.push(block("resource_not_retrieved", "The proposed resource was not in the retrieved records."));
    } else {
      if (resource.language_code !== state.languageCode) {
        findings.push(block("language_mismatch", `Resource ${resource.resource_id} is ${resource.language_code}, not ${state.languageCode}.`));
      }
      if (state.countryCode !== "ZZ" && resource.country_code !== state.countryCode) {
        findings.push(block("country_mismatch", `Resource ${resource.resource_id} is scoped to ${resource.country_code}, not ${state.countryCode}.`));
      }
      inspectSource(state, resource.source_id, findings);
      if (isBlockedRecord(resource.resource_id, resource.title, resource.body)) {
        findings.push(block("blocked_dataset", "The resource points at a blocked or sample dataset."));
      }
    }
    for (const sourceId of state.proposal.source_ids) inspectSource(state, sourceId, findings);
    const gap = state.proposal.addressed_competency_id;
    const gapOpen = gap
      ? state.claims.find((claim) => claim.competency_id === gap)?.state !== "demonstrated"
      : state.claims.some((claim) => !claim.rejected && claim.state !== "demonstrated");
    if ((state.proposal.overstates || containsOverclaim(text)) && gapOpen) {
      findings.push(block("overstates_known", "The recommendation treats an open competency as already shown."));
    }
    if (containsBanned(text)) {
      findings.push(block("banned_claim", "The recommendation uses a hiring, grading, eligibility, or diagnosis claim."));
    }
    if (state.claims.some((claim) => claim.rejected && text.toLowerCase().includes(claim.competency_id.toLowerCase()))) {
      findings.push(block("rejected_claim_used", "The recommendation repeats a claim the certificate cannot support."));
    }
    if (!state.proposal.next_action.trim() || state.proposal.source_ids.length === 0) {
      findings.push(block("empty_recommendation", "A factual recommendation needs a next action and a source id."));
    }
  } else if (state.decision === "ask") {
    const question = state.question ?? "";
    if (!question.trim() || question.split("?").length > 2) {
      findings.push(block("empty_recommendation", "The planner should ask one focused question."));
    }
    if (containsBanned(question) || containsOverclaim(question)) {
      findings.push(block("banned_claim", "The question overstates what is known."));
    }
    if (state.proposal) findings.push(block("empty_recommendation", "A question must not also carry a recommendation."));
  } else if (state.decision === "abstain") {
    if (state.proposal) findings.push(block("empty_recommendation", "An abstention must not still recommend an action."));
    if (!state.abstainReason?.trim()) findings.push(block("empty_recommendation", "An abstention needs a reason."));
    if (containsBanned(state.abstainReason ?? "")) {
      findings.push(block("banned_claim", "The abstention reason makes a disallowed claim."));
    }
  }

  state.findings = dedupe(findings);
  state.findingLog.push(...state.findings);
  state.verificationOk = state.findings.every((finding) => finding.severity !== "block");
}

function inspectSource(state: RunState, sourceId: string, findings: Finding[]): void {
  const source = sourceById(state.pathway, sourceId);
  if (!source) {
    findings.push(block("missing_provenance", `Source ${sourceId} was not retrieved.`));
    return;
  }
  if (isBlockedRecord(source.source_id, source.source_title, source.source_url)) {
    findings.push(block("blocked_dataset", `Source ${source.source_id} is a blocked dataset or site.`));
  }
  if (!reusable(source)) {
    findings.push(
      block(
        source.source_class === "citation_only" ? "citation_only" : "missing_provenance",
        `Source ${source.source_id} cannot support a recommendation.`,
      ),
    );
  }
}

function reusable(source: SourceRecord): boolean {
  return (
    source.reuse_ok &&
    source.source_class !== "citation_only" &&
    Boolean(source.source_title && source.source_owner && source.licence_or_permission && source.attribution)
  );
}

function block(code: string, message: string): Finding {
  return { code, severity: "block", message };
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.code}:${finding.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
