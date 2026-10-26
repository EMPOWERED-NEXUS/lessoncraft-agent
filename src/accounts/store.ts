import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { hashPassword, verifyPassword, type PasswordRecord } from "./passwords.ts";

export type AccountRole = "teacher" | "learner";

export interface PublicUser {
  id: string;
  email: string;
  role: AccountRole;
}

interface UserRecord extends PublicUser, PasswordRecord {}

export interface SourceRecord {
  id: string;
  packId: string;
  ownerId: string;
  creator: string;
  title: string;
  url: string;
  license: string;
  permissionNote: string;
  attribution: string;
  subject: string;
  level: string;
  topic: string;
  language: string;
  reviewStatus: "draft" | "approved";
  excerpt: string;
  privateUse: boolean;
  classShare: boolean;
  publish: boolean;
  training: boolean;
  uploadedByRole: AccountRole;
}

export interface ObjectiveRecord {
  id: string;
  packId: string;
  text: string;
  reviewed: true;
}

export interface QuestionRecord {
  id: string;
  packId: string;
  objectiveId: string;
  prompt: string;
  requiredIdeas: string[];
  solution: string;
  sourceId: string;
  kind: "practice" | "transfer";
}

export interface PackRecord {
  id: string;
  ownerId: string;
  title: string;
  subject: string;
  level: string;
  language: string;
  countryCode: string;
  curriculum: string;
  createdAt: string;
  sharedWith: string[];
  published: boolean;
}

interface Database {
  users: UserRecord[];
  packs: PackRecord[];
  objectives: ObjectiveRecord[];
  sources: SourceRecord[];
  questions: QuestionRecord[];
}

function emptyDb(): Database {
  return { users: [], packs: [], objectives: [], sources: [], questions: [] };
}

export class AccountStore {
  readonly file: string;
  readonly secretFile: string;

  constructor(readonly dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, "accounts.json");
    this.secretFile = path.join(dir, "session.key");
    if (!fs.existsSync(this.secretFile)) fs.writeFileSync(this.secretFile, randomBytes(32).toString("base64"));
  }

  secret(): string {
    return fs.readFileSync(this.secretFile, "utf8");
  }

  private read(): Database {
    if (!fs.existsSync(this.file)) return emptyDb();
    const parsed = JSON.parse(fs.readFileSync(this.file, "utf8")) as Database;
    return { ...emptyDb(), ...parsed };
  }

  private write(data: Database): void {
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, this.file);
  }

  private update(change: (data: Database) => void): Database {
    const data = this.read();
    change(data);
    this.write(data);
    return data;
  }

  users(): PublicUser[] {
    return this.read().users.map(publicUser);
  }

  findByEmail(email: string): UserRecord | undefined {
    const key = email.trim().toLowerCase();
    return this.read().users.find((user) => user.email === key);
  }

  user(id: string): PublicUser | undefined {
    const found = this.read().users.find((user) => user.id === id);
    return found ? publicUser(found) : undefined;
  }

  register(email: string, password: string, role: AccountRole): PublicUser {
    const key = email.trim().toLowerCase();
    if (this.findByEmail(key)) throw new Error("An account with that email already exists on this computer.");
    const user: UserRecord = { id: randomUUID(), email: key, role, ...hashPassword(password) };
    this.update((data) => data.users.push(user));
    return publicUser(user);
  }

  authenticate(email: string, password: string): PublicUser | null {
    const user = this.findByEmail(email);
    if (!user || !verifyPassword(password, user)) return null;
    return publicUser(user);
  }

  deleteUser(id: string): void {
    this.update((data) => {
      const packIds = new Set(data.packs.filter((pack) => pack.ownerId === id).map((pack) => pack.id));
      data.users = data.users.filter((user) => user.id !== id);
      data.packs = data.packs.filter((pack) => pack.ownerId !== id);
      data.objectives = data.objectives.filter((item) => !packIds.has(item.packId));
      data.sources = data.sources.filter((item) => !packIds.has(item.packId));
      data.questions = data.questions.filter((item) => !packIds.has(item.packId));
      for (const pack of data.packs) pack.sharedWith = pack.sharedWith.filter((userId) => userId !== id);
    });
  }

  packs(): PackRecord[] {
    return this.read().packs;
  }

  pack(id: string): PackRecord | undefined {
    return this.read().packs.find((pack) => pack.id === id);
  }

  addPack(pack: PackRecord): PackRecord {
    this.update((data) => data.packs.push(pack));
    return pack;
  }

  objectives(packId: string): ObjectiveRecord[] {
    return this.read().objectives.filter((item) => item.packId === packId);
  }

  replaceObjectives(packId: string, objectives: ObjectiveRecord[]): void {
    this.update((data) => {
      data.objectives = data.objectives.filter((item) => item.packId !== packId).concat(objectives);
    });
  }

  sources(packId: string): SourceRecord[] {
    return this.read().sources.filter((item) => item.packId === packId);
  }

  source(id: string): SourceRecord | undefined {
    return this.read().sources.find((item) => item.id === id);
  }

  addSource(source: SourceRecord): SourceRecord {
    this.update((data) => data.sources.push(source));
    return source;
  }

  questions(packId: string): QuestionRecord[] {
    return this.read().questions.filter((item) => item.packId === packId);
  }

  question(id: string): QuestionRecord | undefined {
    return this.read().questions.find((item) => item.id === id);
  }

  addQuestion(question: QuestionRecord): QuestionRecord {
    this.update((data) => data.questions.push(question));
    return question;
  }
}

function publicUser(user: UserRecord): PublicUser {
  return { id: user.id, email: user.email, role: user.role };
}

export function newId(): string {
  return randomUUID();
}
