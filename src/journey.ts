import { randomUUID } from "node:crypto";
import { defaultPackId, getPack } from "./catalog.ts";
import { isTestMode } from "./env.ts";
import { loadHMEM, type HmemInstance } from "./hmem.ts";
import { chatComplete, llmConfigured, parseJsonObject } from "./llm.ts";
import {
  citationOnlyRecords,
  evidenceText,
  teachableEvidence,
} from "./provenance.ts";
import type { CurriculumPack, TeachableEvidence, TraceEvent } from "./types.ts";
import { dropUnsupported, verifyExplanation } from "./verify.ts";

export interface DiagnoseInput {
  learnerId: string;
  packId?: string;
  diagnosticAnswer: string;
}

export interface CheckInput {
  sessionId: string;
  answer: string;
}

interface Session {
  id: string;
  learnerId: string;
  pack: CurriculumPack;
  evidence: TeachableEvidence[];
  evidenceOrigin: "local-catalog" | "zetaris";
  misconceptionId: string | null;
  explanation: string;
  mermaid: string;
  checkPrompt: string;
  acceptable: string[];
  memoryIds: string[];
  hmemSource: string;
  hmemPin: string;
}

const sessions = new Map<string, Session>();

function nowIso(): string {
  return new Date().toISOString();
}

function trace(
  events: TraceEvent[],
  step: string,
  role: TraceEvent["role"],
  summary: string,
  detail?: Record<string, unknown>,
): void {
  events.push({ at: nowIso(), step, role, summary, detail });
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function matchesSignals(answer: string, signals: string[]): boolean {
  const n = normalize(answer);
  return signals.some((s) => n.includes(normalize(s)));
}

function diagnoseMisconception(pack: CurriculumPack, answer: string): string | null {
  for (const m of pack.misconception_catalog) {
    if (matchesSignals(answer, m.signals)) return m.id;
  }
  return null;
}

function answerLooksCorrect(answer: string, acceptable: string[]): boolean {
  const n = normalize(answer);
  return acceptable.some((a) => n.includes(normalize(a)));
}

function pickArtefact(pack: CurriculumPack) {
  const art = pack.artefacts.find((a) => a.reuse_ok && a.body && a.diagnostic);
  if (!art || !art.body) throw new Error(`Pack ${pack.pack_id} has no teachable lesson artefact.`);
  return art;
}

function deterministicTutor(opts: {
  pack: CurriculumPack;
  evidence: TeachableEvidence[];
  answer: string;
  misconceptionId: string | null;
  memories: string[];
  reteach: boolean;
}): { explanation: string; mermaid: string } {
  const evidence = opts.evidence[0];
  const mis = opts.pack.misconception_catalog.find((m) => m.id === opts.misconceptionId);
  const memoryNote = opts.memories[0]
    ? ` Earlier learning memory: ${opts.memories[0]}`
    : "";
  const core =
    "Multiplying 1/2 × 1/2 means taking a part of a part. Because each factor is less than 1, the product 1/4 is smaller than 1/2, not larger. Adding 1/2 + 1/2 would make 1; multiplying does not.";
  if (opts.reteach) {
    return {
      explanation: `A whole bar can be split into two equal parts. If you take 1/2 of that 1/2, that piece is 1/4 of the original bar. ${core}`,
      mermaid: evidence.reteach_visual_spec?.mermaid ?? evidence.visual_spec?.mermaid ?? "",
    };
  }
  if (mis) {
    return {
      explanation: `${core} A whole bar can be split into two equal parts, and 1/2 of that 1/2 is 1/4 of the original bar.${memoryNote}`,
      mermaid: evidence.visual_spec?.mermaid ?? "",
    };
  }
  return {
    explanation: `${core}${memoryNote}`,
    mermaid: evidence.visual_spec?.mermaid ?? "",
  };
}

async function tutorOnce(opts: {
  pack: CurriculumPack;
  evidence: TeachableEvidence[];
  answer: string;
  misconceptionId: string | null;
  memories: string[];
  reteach: boolean;
  critique?: string;
}): Promise<{ explanation: string; mermaid: string; mode: string }> {
  const fallback = deterministicTutor(opts);
  if (isTestMode() || !llmConfigured()) {
    return { ...fallback, mode: isTestMode() ? "deterministic-test" : "deterministic-no-llm" };
  }
  const prompt = [
    {
      role: "system" as const,
      content:
        "You are a LessonCraft tutor. Teach only from permitted evidence. Use language suited to the pack grade/level. Return JSON with explanation and mermaid. Do not claim official national curriculum status. Do not use citation-only URLs as quotations.",
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        pack: {
          pack_id: opts.pack.pack_id,
          country_code: opts.pack.country_code,
          education_subsystem: opts.pack.education_subsystem,
          grade_or_level: opts.pack.grade_or_level,
          subject: opts.pack.subject,
          language_code: opts.pack.language_code,
          disclaimer: opts.pack.disclaimer,
        },
        learner_answer: opts.answer,
        misconception_id: opts.misconceptionId,
        memories: opts.memories,
        reteach: opts.reteach,
        critique: opts.critique ?? null,
        evidence: opts.evidence.map((e) => ({
          artefact_id: e.artefact_id,
          section: e.page_or_section,
          body: e.body,
          visual: e.visual_spec?.mermaid,
          reteach_visual: e.reteach_visual_spec?.mermaid,
        })),
      }),
    },
  ];
  try {
    const raw = await chatComplete(prompt, { json: true });
    const obj = parseJsonObject(raw);
    const explanation = String(obj.explanation ?? "").trim() || fallback.explanation;
    const mermaid = String(obj.mermaid ?? "").trim() || fallback.mermaid;
    return { explanation, mermaid, mode: "foundation-model" };
  } catch {
    return { ...fallback, mode: "deterministic-llm-error" };
  }
}

let sharedHmem: { hmem: HmemInstance; source: string; pin: string } | null = null;

export async function getSharedHmem(): Promise<{ hmem: HmemInstance; source: string; pin: string }> {
  if (!sharedHmem) sharedHmem = await loadHMEM();
  return sharedHmem;
}

export function resetSessions(): void {
  sessions.clear();
}

export async function diagnose(input: DiagnoseInput) {
  const events: TraceEvent[] = [];
  const pack = getPack(input.packId || defaultPackId());
  const art = pickArtefact(pack);
  const evidence = teachableEvidence(pack.artefacts);
  const citations = citationOnlyRecords(pack.artefacts);
  if (evidence.length === 0) {
    throw new Error("No permitted teachable evidence in this pack.");
  }

  trace(events, "retrieve", "retrieval", "Loaded permitted evidence from local catalog (Zetaris writes are disabled).", {
    origin: "local-catalog",
    artefact_ids: evidence.map((e) => e.artefact_id),
    citation_only: citations.map((c) => c.artefact_id),
    zetaris_lesson_table: process.env.ZETARIS_LESSON_TABLE || null,
  });

  const loaded = await getSharedHmem();
  const recalled = loaded.hmem.query(
    `learner ${input.learnerId} pack ${pack.pack_id} ${input.diagnosticAnswer}`,
    { topN: 5, threshold: 0.05, chatId: input.learnerId },
  );
  const memorySnippets = recalled.memories.map((m) => m.memory.content);
  trace(events, "recall", "hmem", "Queried Meterless H-MEM for this learner.", {
    engine: "MemoryRetrievalService",
    source: loaded.source,
    pin: loaded.pin,
    strategy: recalled.trace.strategy,
    ids: recalled.memories.map((m) => m.memory.id),
  });

  const misconceptionId = diagnoseMisconception(pack, input.diagnosticAnswer);
  trace(events, "diagnose", "tutor", "Mapped the diagnostic answer to a known difficulty when signals matched.", {
    misconception_id: misconceptionId,
  });

  let taught = await tutorOnce({
    pack,
    evidence,
    answer: input.diagnosticAnswer,
    misconceptionId,
    memories: memorySnippets,
    reteach: false,
  });
  trace(events, "explain", "tutor", "Produced a level-appropriate explanation and visual.", {
    mode: taught.mode,
  });

  let verification = verifyExplanation(taught.explanation, evidence);
  if (!verification.ok) {
    trace(events, "verify", "verifier", "Claims were not fully supported. Requesting one revision.", {
      unsupported: verification.unsupported,
    });
    taught = await tutorOnce({
      pack,
      evidence,
      answer: input.diagnosticAnswer,
      misconceptionId,
      memories: memorySnippets,
      reteach: false,
      critique: `Remove unsupported sentences: ${verification.unsupported.join(" | ")}`,
    });
    verification = verifyExplanation(taught.explanation, evidence);
    verification.revised = true;
    if (!verification.ok) {
      const dropped = dropUnsupported(taught.explanation, evidence);
      taught.explanation = dropped.text || deterministicTutor({
        pack,
        evidence,
        answer: input.diagnosticAnswer,
        misconceptionId,
        memories: memorySnippets,
        reteach: false,
      }).explanation;
      verification = {
        ...verifyExplanation(taught.explanation, evidence),
        revised: true,
        notes: "Forced evidence-only wording after one failed revision.",
      };
    }
  } else {
    trace(events, "verify", "verifier", verification.notes, { revised: false });
  }

  const mined = await loaded.hmem.mine(
    "chat_message",
    `learner=${input.learnerId} pack=${pack.pack_id} diagnostic="${input.diagnosticAnswer}" misconception=${misconceptionId ?? "none"}`,
    { chatId: input.learnerId },
  );
  const stored = loaded.hmem.add({
    content: `Learner ${input.learnerId} in pack ${pack.pack_id} (${pack.country_code} ${pack.grade_or_level} ${pack.subject} ${pack.language_code}) answered a diagnostic. misconception=${misconceptionId ?? "none"}`,
    type: "factual",
    source: "lessoncraft:diagnostic",
    tags: ["learner-state", pack.pack_id, pack.country_code],
    chatId: input.learnerId,
  });
  const memoryIds = [...mined.map((m) => m.id), stored.id];
  trace(events, "remember-diagnostic", "hmem", "Stored diagnostic state in H-MEM.", {
    engine: "MemoryMiningService+MemoryStoreService",
    memory_ids: memoryIds,
  });

  const session: Session = {
    id: randomUUID(),
    learnerId: input.learnerId,
    pack,
    evidence,
    evidenceOrigin: "local-catalog",
    misconceptionId,
    explanation: taught.explanation,
    mermaid: taught.mermaid,
    checkPrompt: art.check?.prompt ?? "Explain the idea in your own words.",
    acceptable: art.check?.acceptable ?? [],
    memoryIds,
    hmemSource: loaded.source,
    hmemPin: loaded.pin,
  };
  sessions.set(session.id, session);

  return {
    sessionId: session.id,
    pack: {
      pack_id: pack.pack_id,
      country_code: pack.country_code,
      country_name: pack.country_name,
      education_subsystem: pack.education_subsystem,
      grade_or_level: pack.grade_or_level,
      subject: pack.subject,
      language_code: pack.language_code,
      assessment_style: pack.assessment_style,
      learning_objectives: pack.learning_objectives,
      prerequisites: pack.prerequisites,
      disclaimer: pack.disclaimer,
    },
    diagnosis: {
      misconception_id: misconceptionId,
      statement:
        pack.misconception_catalog.find((m) => m.id === misconceptionId)?.statement ??
        "No catalogued misconception matched; teaching the core objective anyway.",
    },
    evidence: evidence.map((e) => ({
      artefact_id: e.artefact_id,
      source_title: e.source_title,
      source_owner: e.source_owner,
      source_url: e.source_url,
      page_or_section: e.page_or_section,
      attribution: e.attribution,
      licence_or_permission: e.licence_or_permission,
    })),
    citations,
    explanation: taught.explanation,
    visual: { mermaid: taught.mermaid },
    check: { prompt: session.checkPrompt },
    verification,
    evidenceCorpusPreview: evidenceText(evidence).slice(0, 800),
    hmem: { source: loaded.source, pin: loaded.pin, recalled: memorySnippets },
    trace: events,
  };
}

export async function checkAnswer(input: CheckInput) {
  const session = sessions.get(input.sessionId);
  if (!session) throw new Error("Unknown session. Complete the diagnostic first.");
  const events: TraceEvent[] = [];
  const loaded = await getSharedHmem();
  const correct = answerLooksCorrect(input.answer, session.acceptable);
  trace(events, "assess", "assessor", correct ? "Check answer matched permitted acceptable forms." : "Check answer did not match.", {
    correct,
  });

  const branch = correct ? "advance" : "reteach";
  for (const id of session.memoryIds) {
    try {
      loaded.hmem.feedback(id, correct ? "helpful" : "not_helpful");
    } catch {
      /* memory id from mining may not always accept feedback */
    }
  }

  const stored = loaded.hmem.add({
    content: `Learner ${session.learnerId} pack=${session.pack.pack_id} check="${input.answer}" result=${branch}`,
    type: "factual",
    source: "lessoncraft:check",
    tags: ["learner-state", session.pack.pack_id, branch],
    chatId: session.learnerId,
  });
  trace(events, "remember-check", "hmem", "Updated H-MEM with check outcome.", {
    engine: "MemoryStoreService+feedback",
    memory_id: stored.id,
    branch,
  });

  const art = pickArtefact(session.pack);
  let followUp = {
    explanation: session.explanation,
    mermaid: session.mermaid,
    prompt: null as string | null,
    next_objective: null as string | null,
  };

  if (branch === "reteach") {
    const taught = await tutorOnce({
      pack: session.pack,
      evidence: session.evidence,
      answer: input.answer,
      misconceptionId: session.misconceptionId,
      memories: [
        `Previous check was incorrect: ${input.answer}`,
      ],
      reteach: true,
    });
    let verification = verifyExplanation(taught.explanation, session.evidence);
    if (!verification.ok) {
      const dropped = dropUnsupported(taught.explanation, session.evidence);
      taught.explanation = dropped.text || deterministicTutor({
        pack: session.pack,
        evidence: session.evidence,
        answer: input.answer,
        misconceptionId: session.misconceptionId,
        memories: [],
        reteach: true,
      }).explanation;
      verification = { ...verifyExplanation(taught.explanation, session.evidence), revised: true };
    }
    followUp = {
      explanation: taught.explanation,
      mermaid: taught.mermaid,
      prompt: art.reteach_check?.prompt ?? art.check?.prompt ?? null,
      next_objective: null,
    };
    trace(events, "adapt", "adapter", "Branched to reteach with a second visual.", {
      verification,
    });
  } else {
    const next = session.pack.learning_objectives[1]?.statement ?? "Ready for the next objective in this pack.";
    followUp = {
      explanation: `That matches the permitted evidence: multiplying two unit fractions takes a part of a part. ${next}`,
      mermaid: session.mermaid,
      prompt: null,
      next_objective: next,
    };
    trace(events, "adapt", "adapter", "Branched to advance.", { next_objective: next });
  }

  return {
    sessionId: session.id,
    correct,
    branch,
    followUp,
    packDisclaimer: session.pack.disclaimer,
    trace: events,
  };
}
