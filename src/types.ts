export type SourceClass =
  | "original"
  | "licensed_oer"
  | "creator_authorized"
  | "citation_only";

export type PackStatus = "draft" | "validated" | "retired";

export interface Objective {
  id: string;
  statement: string;
}

export interface Prerequisite {
  id: string;
  kind: "objective" | "pack";
  statement: string;
}

export interface Misconception {
  id: string;
  statement: string;
  signals: string[];
}

export interface Provenance {
  source_class: SourceClass;
  source_title: string;
  source_owner: string;
  source_url: string | null;
  licence_or_permission: string;
  attribution: string;
  page_or_section: string | null;
  permission_evidence: string;
  reuse_ok: boolean;
}

export interface Artefact extends Provenance {
  artefact_id: string;
  body: string | null;
  visual_spec?: { mermaid: string };
  reteach_visual_spec?: { mermaid: string };
  diagnostic?: {
    prompt: string;
    misconception_id: string;
  };
  check?: {
    prompt: string;
    acceptable: string[];
  };
  reteach_check?: {
    prompt: string;
    acceptable: string[];
  };
}

export interface CurriculumPack {
  pack_id: string;
  country_code: string;
  country_name: string;
  education_subsystem: string;
  grade_or_level: string;
  subject: string;
  language_code: string;
  age_min?: number;
  age_max?: number;
  status: PackStatus;
  disclaimer: string;
  assessment_style: string;
  learning_objectives: Objective[];
  prerequisites: Prerequisite[];
  misconception_catalog: Misconception[];
  artefacts: Artefact[];
}

export interface TraceEvent {
  at: string;
  step: string;
  role: "retrieval" | "hmem" | "tutor" | "verifier" | "assessor" | "adapter" | "system";
  summary: string;
  detail?: Record<string, unknown>;
}

export interface TeachableEvidence {
  artefact_id: string;
  source_title: string;
  source_owner: string;
  source_url: string | null;
  page_or_section: string | null;
  attribution: string;
  licence_or_permission: string;
  body: string;
  visual_spec?: { mermaid: string };
  reteach_visual_spec?: { mermaid: string };
}

export interface CitationOnly {
  artefact_id: string;
  source_title: string;
  source_owner: string;
  source_url: string | null;
  page_or_section: string | null;
  note: string;
}
