/** Nexus Pathways types. Hackathon work; LessonCraft types stay in src/types.ts. */

export type ClaimState = "demonstrated" | "needs_more_evidence" | "unknown";
export type Outcome = "supported" | "unsupported" | "uncertain";
export type Decision = "propose" | "ask" | "abstain" | "escalate";
export type DataOrigin = "zetaris" | "local-fixture";

export interface SupportingPassage {
  passage_id: string;
  passage_text: string;
  section_locator: string;
  lessoncraft_competency_ids: string[];
  lessoncraft_mapping_note: string;
  source_id: string;
  source_title: string;
  creators: string;
  editor: string;
  source_url: string;
  licence: string;
  licence_url: string;
  attribution: string;
  review_status: string;
  not_official_standard: string;
  official_standard_marker: string;
  access_scope: string;
  share_status: string;
  content_origin: string;
  training_use: string;
  language_code: string;
}
export type ReviewStatus = "pending" | "accepted" | "edited" | "dismissed";

export interface SourceRecord {
  source_id: string;
  source_class: "original" | "licensed_oer" | "creator_authorized" | "citation_only" | "synthetic_demo";
  source_title: string;
  source_owner: string;
  source_url: string | null;
  licence_or_permission: string;
  attribution: string;
  page_or_section: string | null;
  language_code: string | null;
  country_scope: string[];
  reuse_ok: boolean;
  not_official_standard: boolean;
  supports_competencies?: string[];
}

export interface Competency {
  id: string;
  statement: string;
}

export interface Requirement {
  requirement_id: string;
  competency_id: string;
  statement: string;
  language_code: string;
  country_code: string;
  source_id: string;
}

export interface Resource {
  resource_id: string;
  language_code: string;
  country_code: string;
  kind: "practice" | "transfer";
  targets: string[];
  title: string;
  body: string;
  source_id: string;
}

export interface QuizItem {
  id: string;
  competency_ids: string[];
  prompt: string;
  options: Array<{ id: string; text: string }>;
  answer: string;
  source_id: string;
}

export interface RubricItem {
  id: string;
  description: string;
  patterns: string[];
}

export interface Activity {
  prompt: string;
  closed: {
    id: string;
    prompt: string;
    options: Array<{ id: string; text: string }>;
    answer: string;
  };
  open: {
    id: string;
    prompt: string;
    rubric: RubricItem[];
  };
  note: string;
}

export interface SampleSignal {
  competency_id: string;
  languages: Record<string, string[]>;
}

export interface PathwayFile {
  pathway_id: string;
  title: string;
  disclaimer: string;
  country_scope: string[];
  languages: string[];
  competency_order: string[];
  competencies: Competency[];
  requirements: Requirement[];
  resources: Resource[];
  sources: SourceRecord[];
  quiz: QuizItem[];
  sample_signals: SampleSignal[];
  practice: Record<string, Activity>;
  transfer: Record<string, Activity>;
  questions: Record<string, { none: string; ambiguous: string }>;
}

export interface EvidenceItem {
  evidence_id: string;
  kind: "quiz" | "work_sample" | "certificate";
  source_ids: string[];
  label: string;
}

export interface Claim {
  claim_id: string;
  competency_id: string;
  state: ClaimState;
  evidence_ids: string[];
  source_ids: string[];
  rationale: string;
  rejected?: boolean;
}

export interface Proposal {
  resource_id: string;
  addressed_competency_id: string | null;
  why: string;
  evidence_summary: string;
  uncertain: string;
  next_action: string;
  source_ids: string[];
  overstates: boolean;
}

export interface Finding {
  code: string;
  severity: "block" | "warn";
  message: string;
}

export interface RepairRecord {
  attempt: number;
  action: "revise" | "abstain" | "escalate";
  codes: string[];
}

export interface TraceEvent {
  at: string;
  role:
    | "retrieval"
    | "evidence-analyst"
    | "pathway-planner"
    | "verification-agent"
    | "orchestrator"
    | "assessor"
    | "hmem";
  summary: string;
  detail?: Record<string, unknown>;
}

export interface CertificateInput {
  shared: boolean;
  title: string;
  claimedCompetencyIds: string[];
  sourceId: string;
}

export interface RunInput {
  learnerId: string;
  countryCode: string;
  languageCode: string;
  pathwayId?: string;
  quizAnswers?: Record<string, string> | null;
  certificate?: CertificateInput | null;
  workSample?: string;
  catalog?: PathwayFile;
  forceOverclaim?: boolean;
  skipZetaris?: boolean;
}

export interface RunState {
  runId: string;
  learnerId: string;
  countryCode: string;
  languageCode: string;
  pathway: PathwayFile;
  evidenceItems: EvidenceItem[];
  claims: Claim[];
  decisive: boolean;
  rejectedOverclaim: boolean;
  sampleBanned: boolean;
  proposal: Proposal | null;
  question: string | null;
  abstainReason: string | null;
  escalation: string | null;
  decision: Decision;
  outcome: Outcome;
  findings: Finding[];
  findingLog: Finding[];
  repairs: RepairRecord[];
  verificationOk: boolean;
  dataOrigin: DataOrigin;
  zetarisNote: string;
  supportingPassages: SupportingPassage[];
  modelMode: string;
  reviewStatus: ReviewStatus;
  editedText: string | null;
  practiceResult: GradeResult | null;
  transferResult: GradeResult | null;
  memoryIds: string[];
  trace: TraceEvent[];
  forceOverclaim: boolean;
}

export interface GradeResult {
  phase: "practice" | "transfer";
  closedCorrect: boolean;
  open: { met: string[]; missed: string[]; result: "met_rubric" | "partial" | "not_yet" };
  label: string;
}

export interface PublicMemory {
  id: string;
  goal: string;
  demonstrated: string[];
  outcome: string;
  feedback: string;
}

export interface MemoryDelta {
  priorDemonstrated: string[];
  added: string[];
  noLongerListed: string[];
  outcome: string;
}

export interface PublicRun {
  runId: string;
  pathwayId: string;
  title: string;
  disclaimer: string;
  learnerId: string;
  countryCode: string;
  languageCode: string;
  outcome: Outcome;
  decision: Decision;
  dataOrigin: DataOrigin;
  zetarisNote: string;
  supportingPassages: SupportingPassage[];
  modelMode: string;
  claims: Claim[];
  proposal: Proposal | null;
  resource: Resource | null;
  citedSources: SourceRecord[];
  contextSources: SourceRecord[];
  question: string | null;
  abstainReason: string | null;
  escalation: string | null;
  findings: Finding[];
  repairs: RepairRecord[];
  verificationOk: boolean;
  reviewStatus: ReviewStatus;
  editedText: string | null;
  practice: ReturnType<typeof stripActivity> | null;
  transfer: ReturnType<typeof stripActivity> | null;
  practiceResult: GradeResult | null;
  transferResult: GradeResult | null;
  trace: TraceEvent[];
  priorMemory?: PublicMemory[];
  memoryDelta?: MemoryDelta;
}

export function stripActivity(activity: Activity | undefined) {
  if (!activity) return null;
  return {
    prompt: activity.prompt,
    note: activity.note,
    closed: {
      id: activity.closed.id,
      prompt: activity.closed.prompt,
      options: activity.closed.options,
    },
    open: {
      id: activity.open.id,
      prompt: activity.open.prompt,
      rubric: activity.open.rubric.map((item) => ({
        id: item.id,
        description: item.description,
      })),
    },
  };
}
