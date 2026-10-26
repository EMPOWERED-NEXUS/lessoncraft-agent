import { loadHMEM } from "../hmem.ts";

export interface ProgressRecord {
  id: string;
  packId: string;
  objectiveId: string;
  status: string;
  next: string;
}

const MEMORY_TEXT =
  /^Learner \S+ pack (\S+) objective (\S+) status (\S+) next (.+)\.$/;

export function progressSentence(input: {
  learnerId: string;
  packId: string;
  objectiveId: string;
  status: string;
  next: string;
}): string {
  const next = input.next.replace(/\s+/g, " ").trim();
  return `Learner ${input.learnerId} pack ${input.packId} objective ${input.objectiveId} status ${input.status} next ${next}.`;
}

export function parseProgress(id: string, content: string): ProgressRecord | null {
  const match = MEMORY_TEXT.exec(content);
  if (!match) return null;
  return { id, packId: match[1], objectiveId: match[2], status: match[3], next: match[4] };
}

export async function storeProgress(dir: string, learnerId: string, sentence: string): Promise<string> {
  const loaded = await loadHMEM({ persistDir: dir, actor: "lessoncraft-studio" });
  const stored = loaded.hmem.store.add({
    content: sentence,
    type: "factual",
    source: "lessoncraft-studio:progress",
    tags: ["learner-state"],
    chatId: learnerId,
    confidence: 0.7,
  });
  return stored.id;
}

export async function recallProgress(dir: string, learnerId: string): Promise<ProgressRecord[]> {
  const loaded = await loadHMEM({ persistDir: dir, actor: "lessoncraft-studio" });
  return loaded.hmem.store
    .all()
    .filter((record: { chatId?: string; content: string }) => record.chatId === learnerId)
    .map((record: { id: string; content: string }) => parseProgress(record.id, record.content))
    .filter((item: ProgressRecord | null): item is ProgressRecord => item !== null);
}

export async function resetProgress(dir: string, learnerId: string): Promise<string[]> {
  const loaded = await loadHMEM({ persistDir: dir, actor: "lessoncraft-studio" });
  const ids = loaded.hmem.store
    .all()
    .filter((record: { chatId?: string }) => record.chatId === learnerId)
    .map((record: { id: string }) => record.id);
  for (const id of ids) loaded.hmem.store.delete(id, "learner reset");
  return ids;
}
