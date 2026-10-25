import type { Artefact, CitationOnly, TeachableEvidence } from "./types.ts";

const BLOCKED_HOST_MARKERS = [
  "estudyuniverse",
  "kamerpower",
  "meetlearn",
  "openexamprep",
];

const TEACHABLE_CLASSES = new Set([
  "original",
  "licensed_oer",
  "creator_authorized",
]);

export function hostIsBlocked(url: string | null): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return BLOCKED_HOST_MARKERS.some((marker) => lower.includes(marker));
}

export function sanitizeArtefact(artefact: Artefact): Artefact {
  const blocked = hostIsBlocked(artefact.source_url);
  const citationOnly = artefact.source_class === "citation_only" || blocked;
  const reuseOk =
    !citationOnly &&
    artefact.reuse_ok === true &&
    TEACHABLE_CLASSES.has(artefact.source_class) &&
    Boolean(artefact.body && artefact.body.trim());

  return {
    ...artefact,
    reuse_ok: reuseOk,
    body: reuseOk ? artefact.body : null,
    visual_spec: reuseOk ? artefact.visual_spec : undefined,
    reteach_visual_spec: reuseOk ? artefact.reteach_visual_spec : undefined,
    source_class: citationOnly ? "citation_only" : artefact.source_class,
  };
}

export function teachableEvidence(artefacts: Artefact[]): TeachableEvidence[] {
  return artefacts.filter((a) => a.reuse_ok && a.body).map((a) => ({
    artefact_id: a.artefact_id,
    source_title: a.source_title,
    source_owner: a.source_owner,
    source_url: a.source_url,
    page_or_section: a.page_or_section,
    attribution: a.attribution,
    licence_or_permission: a.licence_or_permission,
    body: a.body as string,
    visual_spec: a.visual_spec,
    reteach_visual_spec: a.reteach_visual_spec,
  }));
}

export function citationOnlyRecords(artefacts: Artefact[]): CitationOnly[] {
  return artefacts
    .filter((a) => a.source_class === "citation_only" || !a.reuse_ok)
    .map((a) => ({
      artefact_id: a.artefact_id,
      source_title: a.source_title,
      source_owner: a.source_owner,
      source_url: a.source_url,
      page_or_section: a.page_or_section,
      note: "Link and metadata only. Body was not stored and is not used for teaching.",
    }));
}

export function evidenceText(items: TeachableEvidence[]): string {
  return items
    .map(
      (e) =>
        `[${e.artefact_id} | ${e.source_title} | ${e.page_or_section ?? "n/a"}]\n${e.body}`,
    )
    .join("\n\n");
}
