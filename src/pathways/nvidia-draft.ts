import { isTestMode } from "../env.ts";
import {
  completeNvidiaChat,
  nvidiaConfigured,
  nvidiaModel,
  NvidiaCallError,
  type NvidiaCompletion,
} from "../nvidia.ts";
import { isBlockedRecord } from "./catalog.ts";
import { containsBanned, containsOverclaim } from "./text-rules.ts";
import type { NvidiaClient, NvidiaDraft, NvidiaReport, NvidiaUsage, QuizItem, RunInput, RunState, SupportingPassage } from "./types.ts";

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export function selectedQuizAnswers(quiz: QuizItem[], answers: Record<string, string> | null | undefined): string[] {
  if (!answers) return [];
  const lines: string[] = [];
  for (const item of quiz) {
    const choice = answers[item.id];
    if (!choice) continue;
    const option = item.options.find((entry) => entry.id === choice);
    if (!option) continue;
    const text = `${item.prompt} ${option.text}`.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]").replace(/\s+/g, " ").trim();
    if (text) lines.push(text.slice(0, 400));
    if (lines.length >= 8) break;
  }
  return lines;
}

export function buildNvidiaMessages(input: {
  languageCode: string;
  selectedAnswers: string[];
  passages: SupportingPassage[];
  repairCodes?: string[];
}): Array<{ role: "system" | "user"; content: string }> {
  const language = input.languageCode === "fr" ? "French" : "English";
  const repair = input.repairCodes?.length
    ? ` The previous draft failed these checks: ${input.repairCodes.map((code) => repairHint(code)).join(" ")} Return JSON only.`
    : "";
  const passages = input.passages.map((passage) => ({
    passage_id: passage.passage_id,
    section_locator: passage.section_locator,
    passage_text: passage.passage_text,
  }));
  return [
    {
      role: "system",
      content:
        "Draft one learning response as JSON with keys explanation, example, followUp, evidenceQuote, and passageId. " +
        "The explanation may paraphrase. " +
        "evidenceQuote must be one short exact copy of consecutive characters from a supplied passage, at least twelve characters. " +
        "passageId must be the id of that same passage. " +
        "Write one worked example and one follow-up question. " +
        `Write the prose in ${language}. ` +
        "Do not claim a job, a grade, eligibility, a diagnosis, or that the whole skill is already shown. " +
        "Do not add names, email addresses, or text that was not supplied." +
        repair,
    },
    {
      role: "user",
      content: JSON.stringify({
        selectedAnswers: input.selectedAnswers,
        passages,
      }),
    },
  ];
}

export function verifyNvidiaDraft(raw: string, passages: SupportingPassage[]): { ok: true; draft: NvidiaDraft } | { ok: false; codes: string[] } {
  const parsed = parseDraft(raw);
  if (!parsed) return { ok: false, codes: ["invalid_structure"] };
  const codes: string[] = [];
  const named = passages.find((passage) => passage.passage_id === parsed.passageId);
  if (!named) codes.push("unknown_passage");
  else if (!exactQuote(parsed.evidenceQuote, named.passage_text)) codes.push("ungrounded");
  const text = `${parsed.explanation}\n${parsed.example}\n${parsed.followUp}`;
  if (containsBanned(text)) codes.push("banned_claim");
  if (containsOverclaim(text)) codes.push("overstates_known");
  if (isBlockedRecord(text)) codes.push("blocked_dataset");
  if (EMAIL.test(text)) codes.push("personal_information");
  if ((parsed.followUp.match(/\?/g) ?? []).length !== 1) codes.push("empty_recommendation");
  if (!parsed.explanation || !parsed.example || !parsed.followUp) codes.push("invalid_structure");
  if (codes.length) return { ok: false, codes: [...new Set(codes)] };
  return { ok: true, draft: parsed };
}

export async function draftLearningResponse(input: {
  consent: boolean;
  testMode: boolean;
  languageCode: string;
  selectedAnswers: string[];
  passages: SupportingPassage[];
  client?: NvidiaClient;
}): Promise<NvidiaReport> {
  const passageIds = input.passages.map((passage) => passage.passage_id);
  if (!input.consent) return idle("no_consent", passageIds);
  if (input.selectedAnswers.length === 0) return idle("no_answer", passageIds);
  if (input.passages.length === 0) return idle("no_passage", passageIds);
  const client = input.client ?? (input.testMode || !nvidiaConfigured() ? undefined : defaultClient);
  if (!client) return idle("not_configured", passageIds);

  const model = nvidiaModel();
  let servedModel = model;
  let repairAttempted = false;
  let usage: NvidiaUsage | null = null;
  let codes: string[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let completion: NvidiaCompletion;
    try {
      completion = await client(buildNvidiaMessages({
        languageCode: input.languageCode,
        selectedAnswers: input.selectedAnswers,
        passages: input.passages,
        repairCodes: attempt === 0 ? undefined : codes,
      }));
    } catch (error) {
      const reason = error instanceof NvidiaCallError ? error.code : "api_error";
      return {
        called: true,
        model: servedModel,
        passageIds,
        verifier: "not_run",
        fallback: true,
        fallbackReason: reason === "timeout" ? "timeout" : reason === "invalid_response" ? "invalid_structure" : "api_error",
        repairAttempted,
        usage,
        draft: null,
        reason: reason === "timeout" ? "timeout" : reason === "invalid_response" ? "invalid_structure" : "api_error",
      };
    }
    usage = mergeUsage(usage, completion.usage);
    if (completion.model) servedModel = completion.model;
    const checked = verifyNvidiaDraft(completion.content, input.passages);
    if (checked.ok) {
      return {
        called: true,
        model: completion.model || model,
        passageIds: [checked.draft.passageId],
        verifier: "passed",
        fallback: false,
        fallbackReason: null,
        repairAttempted,
        usage,
        draft: checked.draft,
        reason: null,
      };
    }
    codes = checked.codes;
    if (attempt === 0) {
      repairAttempted = true;
      continue;
    }
  }
  return {
    called: true,
    model: servedModel,
    passageIds,
    verifier: "failed",
    fallback: true,
    fallbackReason: "verification_failed",
    repairAttempted: true,
    usage,
    draft: null,
    reason: "verification_failed",
    codes,
  };
}

export async function attachNvidiaDraft(state: RunState, input: RunInput): Promise<void> {
  const report = await draftLearningResponse({
    consent: input.nvidiaConsent === true,
    testMode: input.nvidiaClient ? false : isTestMode(),
    languageCode: state.languageCode,
    selectedAnswers: selectedQuizAnswers(state.pathway.quiz, input.quizAnswers),
    passages: state.supportingPassages,
    client: input.nvidiaClient,
  });
  state.nvidia = report;
  const summary = nvidiaSummary(report);
  console.log(`[nexus] run=${state.runId} role=nvidia ${summary}`);
  state.trace.push({
    at: new Date().toISOString(),
    role: "nvidia",
    summary,
    detail: nvidiaTraceDetail(report),
  });
}

export function nvidiaSummary(report: NvidiaReport): string {
  if (!report.called) {
    if (report.reason === "no_consent") return "NVIDIA was not called. Consent was not given.";
    if (report.reason === "no_answer") return "NVIDIA was not called. No selected answer was available.";
    if (report.reason === "no_passage") return "NVIDIA was not called. No approved supporting passage was available.";
    return "NVIDIA was not called. No NVIDIA API key is configured.";
  }
  const tokens = report.usage
    ? ` tokens prompt=${report.usage.promptTokens} completion=${report.usage.completionTokens} total=${report.usage.totalTokens}.`
    : "";
  const codes = report.codes?.length ? ` codes=${report.codes.join(",")}` : "";
  return `NVIDIA was called. model=${report.model ?? "unspecified"} passages=${report.passageIds.join(",") || "none"} verifier=${report.verifier} fallback=${report.fallback ? "yes" : "no"}.${tokens}${codes}`;
}

function nvidiaTraceDetail(report: NvidiaReport): Record<string, unknown> {
  const detail: Record<string, unknown> = {
    called: report.called,
    model: report.model,
    passageIds: report.passageIds,
    verifier: report.verifier,
    fallback: report.fallback,
    fallbackReason: report.fallbackReason,
    repairAttempted: report.repairAttempted,
    codes: report.codes ?? [],
  };
  if (report.usage) detail.usage = report.usage;
  return detail;
}

function idle(reason: string, passageIds: string[]): NvidiaReport {
  return {
    called: false,
    model: null,
    passageIds,
    verifier: "not_run",
    fallback: false,
    fallbackReason: null,
    repairAttempted: false,
    usage: null,
    draft: null,
    reason,
  };
}

function defaultClient(messages: Array<{ role: "system" | "user"; content: string }>): Promise<NvidiaCompletion> {
  return completeNvidiaChat(messages);
}

function parseDraft(raw: string): NvidiaDraft | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = (fenced?.[1] ?? raw).trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const explanation = clip(value.explanation, 800);
  const example = clip(value.example, 800);
  const followUp = clip(value.followUp, 300);
  const evidenceQuote = unwrapQuote(firstString(value, ["evidenceQuote", "evidence_quote", "quote"]));
  const passageId = firstString(value, ["passageId", "passage_id"])
    || (Array.isArray(value.passageIds) && typeof value.passageIds[0] === "string" ? value.passageIds[0].trim() : "");
  if (!explanation || !example || !followUp || !evidenceQuote || !passageId) return null;
  return { explanation, example, followUp, evidenceQuote, passageId };
}

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function repairHint(code: string): string {
  const hints: Record<string, string> = {
    invalid_structure: "Return one JSON object with explanation, example, followUp, evidenceQuote, and passageId.",
    unknown_passage: "passageId must be one supplied passage id.",
    ungrounded: "evidenceQuote must be an exact copy of consecutive characters from that passage.",
    banned_claim: "Remove job, grade, eligibility, and diagnosis claims.",
    overstates_known: "Do not say the whole skill is already shown.",
    empty_recommendation: "followUp must contain exactly one question mark.",
    personal_information: "Remove names and email addresses.",
    blocked_dataset: "Do not mention a blocked dataset.",
  };
  return hints[code] ?? code;
}

function firstString(value: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    if (typeof value[key] === "string" && value[key].trim()) return value[key].trim();
  }
  return "";
}

function unwrapQuote(quote: string): string {
  return quote.replace(/^["“”']+|["“”']+$/g, "").trim();
}

function exactQuote(quote: string, passageText: string): boolean {
  if (quote.length < 12 || quote.length > 180) return false;
  return passageText.includes(quote);
}

function mergeUsage(current: NvidiaUsage | null, next: NvidiaUsage | null): NvidiaUsage | null {
  if (!next) return current;
  if (!current) return next;
  return {
    promptTokens: current.promptTokens + next.promptTokens,
    completionTokens: current.completionTokens + next.completionTokens,
    totalTokens: current.totalTokens + next.totalTokens,
  };
}
