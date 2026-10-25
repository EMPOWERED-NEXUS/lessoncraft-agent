import type { TeachableEvidence } from "./types.ts";

const STOP = new Set(
  "a an the and or of to in on for is are was were be this that with from as at by it its not".split(
    " ",
  ),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9½¼⅓⅔⅛/\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export function sentenceSplit(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function supportedByEvidence(claim: string, evidence: TeachableEvidence[]): boolean {
  const claimTokens = new Set(tokenize(claim));
  if (claimTokens.size === 0) return false;
  const evidenceTokens = new Set(tokenize(evidence.map((e) => e.body).join(" ")));
  let hits = 0;
  for (const t of claimTokens) if (evidenceTokens.has(t)) hits += 1;
  return hits / claimTokens.size >= 0.45;
}

export interface Verification {
  ok: boolean;
  revised: boolean;
  unsupported: string[];
  notes: string;
}

export function verifyExplanation(
  explanation: string,
  evidence: TeachableEvidence[],
): Verification {
  const claims = sentenceSplit(explanation);
  const unsupported = claims.filter((c) => !supportedByEvidence(c, evidence));
  return {
    ok: unsupported.length === 0,
    revised: false,
    unsupported,
    notes:
      unsupported.length === 0
        ? "All explanation sentences overlap permitted evidence."
        : "Some sentences are not supported by retrieved evidence.",
  };
}

export function dropUnsupported(
  explanation: string,
  evidence: TeachableEvidence[],
): { text: string; dropped: string[] } {
  const claims = sentenceSplit(explanation);
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const c of claims) {
    if (supportedByEvidence(c, evidence)) kept.push(c);
    else dropped.push(c);
  }
  return { text: kept.join(" "), dropped };
}
