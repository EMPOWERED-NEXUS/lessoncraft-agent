import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { AccountStore, newId, type AccountRole, type PublicUser, type QuestionRecord, type SourceRecord } from "../accounts/store.ts";
import { createSession, readSession, type SessionPayload } from "../accounts/session.ts";
import { extractBuffer, MAX_FILE_BYTES } from "../../public/pathways/parsers.js";
import { judgeAnswer, nvidiaMessages, teach, type AnswerJudgement, type Teaching } from "./agents.ts";
import { objectivesNeedReview, proposeObjectives, type ProposedObjective } from "./extract.ts";
import { progressSentence, recallProgress, resetProgress, storeProgress, type ProgressRecord } from "./memory.ts";
import {
  isSamplePack,
  SAMPLE_PACK_ID,
  sampleObjectives,
  samplePack,
  sampleQuestions,
  sampleSource,
} from "./sample.ts";

export class StudioError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface LessonState {
  id: string;
  userId: string;
  packId: string;
  teaching: Teaching;
  judgement: AnswerJudgement | null;
}

interface ModelClient {
  complete(messages: Array<{ role: "system" | "user"; content: string }>): Promise<{ content: string; model: string }>;
}

interface ModelRequest {
  called: boolean;
  messages: Array<{ role: "system" | "user"; content: string }> | null;
}

export class StudioApp {
  readonly store: AccountStore;
  private readonly lessons = new Map<string, LessonState>();
  private readonly modelRequests: ModelRequest[] = [];

  constructor(dir: string, private readonly memoryDir: string) {
    this.store = new AccountStore(dir);
  }

  register(email: string, password: string, role: AccountRole): { user: PublicUser; token: string } {
    validateCredentials(email, password);
    if (role !== "teacher" && role !== "learner") throw new StudioError(400, "Choose a teacher or learner account.");
    const user = this.store.register(email, password, role);
    return { user, token: this.tokenFor(user.id) };
  }

  login(email: string, password: string): { user: PublicUser; token: string } {
    validateCredentials(email, password);
    const user = this.store.authenticate(email, password);
    if (!user) throw new StudioError(401, "The email or password does not match a local account.");
    return { user, token: this.tokenFor(user.id) };
  }

  userFromToken(token: string): { user: PublicUser; session: SessionPayload } {
    const session = readSession(token, this.store.secret());
    const user = session ? this.store.user(session.userId) : undefined;
    if (!session || !user) throw new StudioError(401, "Sign in with a local account.");
    return { user, session };
  }

  deleteAccount(token: string, password: string): void {
    const { user } = this.userFromToken(token);
    if (!this.store.authenticate(user.email, password)) throw new StudioError(401, "The password does not match this account.");
    this.store.deleteUser(user.id);
  }

  createPack(token: string, input: {
    title: string;
    subject: string;
    level: string;
    language: string;
    countryCode?: string;
    curriculum?: string;
  }) {
    const { user } = this.requireRole(token, "teacher");
    const title = input.title.trim();
    if (!title || !input.subject.trim() || !input.level.trim() || !input.language.trim()) {
      throw new StudioError(400, "A pack needs a title, subject, level, and language. Country and curriculum can stay blank.");
    }
    return this.store.addPack({
      id: newId(),
      ownerId: user.id,
      title,
      subject: input.subject.trim(),
      level: input.level.trim(),
      language: input.language.trim(),
      countryCode: (input.countryCode ?? "").trim(),
      curriculum: (input.curriculum ?? "").trim(),
      createdAt: new Date().toISOString(),
      sharedWith: [],
      published: false,
    });
  }

  listPacks(token: string) {
    const { user } = this.userFromToken(token);
    const own = this.store.packs().filter((pack) => this.canRead(user, pack.id));
    return [samplePack, ...own.filter((pack) => pack.id !== SAMPLE_PACK_ID)];
  }

  getPack(token: string, packId: string) {
    const { user } = this.userFromToken(token);
    this.assertRead(user, packId);
    const pack = this.packRecord(packId);
    const teacher = this.canEdit(user, packId);
    const questions = this.questionsFor(packId).map((question) => teacher ? question : publicQuestion(question));
    return {
      pack,
      objectives: this.objectivesFor(packId),
      sources: this.sourcesFor(packId).map((source) => teacher ? source : publicSource(source)),
      questions,
      sample: isSamplePack(packId),
      localDemo: true,
    };
  }

  propose(token: string, packId: string, text: string): { proposals: ProposedObjective[]; saved: false; needsReview: boolean } {
    this.requireOwner(token, packId);
    const proposals = proposeObjectives(text);
    return { proposals, saved: false, needsReview: objectivesNeedReview(proposals) };
  }

  async importFile(token: string, packId: string, filename: string, bytes: Buffer) {
    this.requireOwner(token, packId);
    if (bytes.length > MAX_FILE_BYTES) throw new StudioError(400, "Files are limited to 8 MB and were not saved.");
    const extracted = await extractBuffer(filename, bytes);
    if (extracted.status !== "extracted" || !extracted.text.trim()) {
      return {
        saved: false,
        status: extracted.status,
        message: extractionMessage(filename, extracted.status),
        proposals: [] as ProposedObjective[],
      };
    }
    const proposals = proposeObjectives(extracted.text);
    return { saved: false, status: extracted.status, message: "Review the extracted text before saving.", proposals, text: extracted.text };
  }

  saveObjectives(token: string, packId: string, objectives: string[], reviewed: boolean) {
    this.requireOwner(token, packId);
    const cleaned = objectives.map((item) => item.trim()).filter(Boolean);
    if (!reviewed) throw new StudioError(400, "Review and confirm the objectives before they are saved.");
    if (!cleaned.length) throw new StudioError(400, "Add at least one objective before saving.");
    const records = cleaned.map((text) => ({ id: newId(), packId, text, reviewed: true as const }));
    this.store.replaceObjectives(packId, records);
    return records;
  }

  addSource(token: string, packId: string, input: Omit<SourceRecord, "id" | "packId" | "ownerId" | "uploadedByRole">) {
    const { user } = this.requireOwner(token, packId);
    const source = normalizeSource(input, user.role);
    const record: SourceRecord = { ...source, id: newId(), packId, ownerId: user.id, uploadedByRole: user.role };
    return this.store.addSource(record);
  }

  addQuestion(token: string, packId: string, input: {
    objectiveId: string;
    prompt: string;
    requiredIdeas: string[];
    solution: string;
    sourceId: string;
    kind: "practice" | "transfer";
  }) {
    this.requireOwner(token, packId);
    const source = this.sourcesFor(packId).find((item) => item.id === input.sourceId);
    if (!source) throw new StudioError(400, "Choose a source that belongs to this pack.");
    if (!input.prompt.trim() || !input.solution.trim() || input.requiredIdeas.filter(Boolean).length === 0) {
      throw new StudioError(400, "A question needs a prompt, a reviewed solution or marking note, and at least one idea to check.");
    }
    const question: QuestionRecord = {
      id: newId(),
      packId,
      objectiveId: input.objectiveId,
      prompt: input.prompt.trim(),
      requiredIdeas: input.requiredIdeas.map((idea) => idea.trim()).filter(Boolean),
      solution: input.solution.trim(),
      sourceId: source.id,
      kind: input.kind === "transfer" ? "transfer" : "practice",
    };
    return this.store.addQuestion(question);
  }

  async ask(token: string, packId: string, query: string, consent: boolean, model?: ModelClient | null): Promise<LessonState & { modelCalled: boolean }> {
    const { user } = this.userFromToken(token);
    this.assertRead(user, packId);
    const sources = this.sourcesFor(packId).filter((source) => source.reviewStatus === "approved" && !source.training);
    const questions = this.questionsFor(packId);
    const objectives = this.objectivesFor(packId);
    let teaching = teach({ query, objectives, sources, questions });
    let modelCalled = false;
    if (consent && model && teaching.evidence && teaching.question) {
      const messages = nvidiaMessages({
        question: teaching.question.prompt,
        excerpt: teaching.evidence.excerpt,
        answer: "",
      });
      this.modelRequests.push({ called: true, messages });
      modelCalled = true;
      try {
        const drafted = await model.complete(messages);
        teaching = teach({ query, objectives, sources, questions, modelDraft: drafted.content });
      } catch {
        teaching.trace.push({
          agent: "evaluator",
          action: "The model was unavailable or returned nothing usable.",
          result: "The local explanation remains.",
        });
      }
    } else {
      this.modelRequests.push({ called: false, messages: null });
    }
    const lesson: LessonState = { id: randomUUID(), userId: user.id, packId, teaching, judgement: null };
    this.lessons.set(lesson.id, lesson);
    return { ...lesson, modelCalled };
  }

  answer(token: string, lessonId: string, answerText: string): LessonState {
    const { user } = this.userFromToken(token);
    const lesson = this.lessons.get(lessonId);
    if (!lesson || lesson.userId !== user.id) throw new StudioError(404, "That lesson is not open for this account.");
    const questions = this.questionsFor(lesson.packId);
    const current = lesson.teaching.question;
    const next = current ? questions.find((item) => item.id !== current.id && item.kind === "transfer") ?? null : null;
    lesson.judgement = judgeAnswer(answerText, current, next);
    return lesson;
  }

  async remember(token: string, lessonId: string, consent: boolean): Promise<{ stored: boolean; records: ProgressRecord[] }> {
    const { user } = this.userFromToken(token);
    const lesson = this.lessons.get(lessonId);
    if (!lesson || lesson.userId !== user.id || !lesson.judgement || !lesson.teaching.objective) {
      throw new StudioError(400, "Finish a lesson step before saving progress.");
    }
    if (!consent) return { stored: false, records: await recallProgress(this.memoryDir, user.id) };
    const sentence = progressSentence({
      learnerId: user.id,
      packId: lesson.packId,
      objectiveId: lesson.teaching.objective.id,
      status: lesson.judgement.competency,
      next: lesson.judgement.branch,
    });
    await storeProgress(this.memoryDir, user.id, sentence);
    return { stored: true, records: await recallProgress(this.memoryDir, user.id) };
  }

  async reset(token: string): Promise<string[]> {
    const { user } = this.userFromToken(token);
    return resetProgress(this.memoryDir, user.id);
  }

  lastModelRequest(): ModelRequest | undefined {
    return this.modelRequests.at(-1);
  }

  private tokenFor(userId: string): string {
    return createSession(userId, this.store.secret());
  }

  private requireRole(token: string, role: AccountRole) {
    const current = this.userFromToken(token);
    if (current.user.role !== role) throw new StudioError(403, "This action is limited to a " + role + " account.");
    return current;
  }

  private requireOwner(token: string, packId: string) {
    const current = this.requireRole(token, "teacher");
    if (!this.canEdit(current.user, packId)) throw new StudioError(403, "Only the teacher who created this pack can change it.");
    return current;
  }

  private assertRead(user: PublicUser, packId: string) {
    if (!this.canRead(user, packId)) throw new StudioError(403, "This pack is not shared with this account.");
  }

  private canEdit(user: PublicUser, packId: string): boolean {
    if (isSamplePack(packId)) return false;
    const pack = this.store.pack(packId);
    return Boolean(pack && pack.ownerId === user.id && user.role === "teacher");
  }

  private canRead(user: PublicUser, packId: string): boolean {
    if (isSamplePack(packId)) return true;
    const pack = this.store.pack(packId);
    if (!pack) return false;
    if (pack.ownerId === user.id) return true;
    if (pack.published) return true;
    return pack.sharedWith.includes(user.id);
  }

  private packRecord(packId: string) {
    if (isSamplePack(packId)) return samplePack;
    const pack = this.store.pack(packId);
    if (!pack) throw new StudioError(404, "That pack is not on this computer.");
    return pack;
  }

  private objectivesFor(packId: string) {
    return isSamplePack(packId) ? sampleObjectives : this.store.objectives(packId);
  }

  private sourcesFor(packId: string) {
    return isSamplePack(packId) ? [sampleSource] : this.store.sources(packId);
  }

  private questionsFor(packId: string) {
    return isSamplePack(packId) ? sampleQuestions : this.store.questions(packId);
  }
}

export function tempStudioDir(): { dir: string; memoryDir: string } {
  const root = fsTemp();
  return { dir: path.join(root, "accounts"), memoryDir: path.join(root, "memory") };
}

function fsTemp(): string {
  return path.join(os.tmpdir(), `lc-studio-${randomUUID()}`);
}

function validateCredentials(email: string, password: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new StudioError(400, "Enter a valid email address.");
  if (password.length < 8) throw new StudioError(400, "Use a password of at least 8 characters.");
}

function publicQuestion(question: QuestionRecord) {
  return { id: question.id, packId: question.packId, objectiveId: question.objectiveId, prompt: question.prompt, sourceId: question.sourceId, kind: question.kind };
}

function publicSource(source: SourceRecord) {
  const { training, classShare, publish, ...visible } = source;
  return { ...visible, training: false, classShare, publish };
}

function normalizeSource(input: Omit<SourceRecord, "id" | "packId" | "ownerId" | "uploadedByRole">, role: AccountRole): Omit<SourceRecord, "id" | "packId" | "ownerId" | "uploadedByRole"> {
  const required = ["creator", "title", "attribution", "subject", "level", "topic", "language", "excerpt"] as const;
  for (const field of required) {
    if (!String(input[field] || "").trim()) throw new StudioError(400, "Every source needs a creator, title, attribution, subject, level, topic, language, and excerpt.");
  }
  if (!input.license.trim() && !input.permissionNote.trim()) {
    throw new StudioError(400, "Add a license or a written permission note. A download is not permission to republish or train a model.");
  }
  if (!input.reviewStatus) throw new StudioError(400, "Set the review status.");
  return {
    ...input,
    creator: input.creator.trim(),
    title: input.title.trim(),
    url: input.url.trim(),
    license: input.license.trim(),
    permissionNote: input.permissionNote.trim(),
    attribution: input.attribution.trim(),
    subject: input.subject.trim(),
    level: input.level.trim(),
    topic: input.topic.trim(),
    language: input.language.trim(),
    reviewStatus: input.reviewStatus === "approved" ? "approved" : "draft",
    excerpt: input.excerpt.trim(),
    privateUse: true,
    classShare: input.classShare === true,
    publish: input.publish === true,
    training: role === "teacher" && input.training === true && Boolean(input.license.trim()),
  };
}

function extractionMessage(filename: string, status: string): string {
  const lower = filename.toLowerCase();
  if (/\.(png|jpe?g)$/.test(lower) || status === "needs_ocr") {
    return "This image was not saved. Printed-image reading is a separate Pathways step and was not used here. Type the objectives or paste the text. Equations, tables, diagrams, and scanned pages need a person to correct them before they can be saved.";
  }
  if (lower.endsWith(".pdf") || status === "no_text") {
    return "This PDF had no usable text and was not saved. Scanned pages are not read here. Paste the text or type the objectives.";
  }
  return "This file was not saved because its text could not be read. Paste the text or type the objectives.";
}
