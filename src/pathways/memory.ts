import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadHMEM, type LoadedHmem } from "../hmem.ts";
import { repoRoot } from "../paths.ts";
import type { MemoryDelta, PublicMemory, RunState } from "./types.ts";

let shared: LoadedHmem | null = null;

export function pathwaysMemoryDir(): string {
  return path.join(repoRoot, ".lessoncraft", "pathways-hmem");
}

export async function pathwayMemory(dir?: string): Promise<LoadedHmem> {
  if (dir) return loadHMEM({ persistDir: dir, actor: "nexus-pathways" });
  if (!shared) shared = await loadHMEM({ persistDir: pathwaysMemoryDir(), actor: "nexus-pathways" });
  return shared;
}

export async function rememberLearner(state: RunState, feedback: "helpful" | "not_helpful"): Promise<{
  mined: string[];
  stored: string;
  retrieved: string[];
}> {
  const loaded = await pathwayMemory();
  const demonstrated = state.claims
    .filter((claim) => claim.state === "demonstrated" && !claim.rejected)
    .map((claim) => claim.competency_id)
    .join(" ") || "none";
  const outcome = state.transferResult?.open.result ?? state.practiceResult?.open.result ?? "not_submitted";
  const text =
    `Learner ${state.learnerId} should remember goal ${state.pathway.pathway_id}. ` +
    `Demonstrated skills: ${demonstrated}. Outcome: ${outcome}. Feedback: ${feedback}.`;
  const mined = await loaded.hmem.mining.mineInteraction("plan_completion", text, { chatId: state.learnerId });
  const stored = loaded.hmem.store.add({
    content: text,
    type: "factual",
    source: "nexus-pathways:learner-memory",
    tags: ["learner-state", state.pathway.pathway_id],
    chatId: state.learnerId,
    confidence: 0.7,
  });
  const retrieved = loaded.hmem.retrieval.query(
    `goal ${state.pathway.pathway_id} demonstrated ${demonstrated}`,
    { topN: 5, threshold: 0.05, chatId: state.learnerId },
  );
  loaded.hmem.retrieval.feedback(stored.id, feedback);
  return {
    mined: mined.map((item) => item.id),
    stored: stored.id,
    retrieved: retrieved.memories.map((item) => item.memory.id),
  };
}

const MEMORY_TEXT =
  /^Learner \S+ should remember goal (\S+)\. Demonstrated skills: ([^.]+)\. Outcome: (\S+)\. Feedback: (\S+)\.$/;

export function parseLearnerMemory(id: string, content: string): PublicMemory | null {
  const match = MEMORY_TEXT.exec(content);
  if (!match) return null;
  return {
    id,
    goal: match[1],
    demonstrated: match[2] === "none" ? [] : match[2].split(" ").filter(Boolean),
    outcome: match[3],
    feedback: match[4],
  };
}

export function memoryDelta(prior: PublicMemory[], demonstratedNow: string[], outcome: string): MemoryDelta {
  const before = prior.length ? prior[prior.length - 1].demonstrated : [];
  return {
    priorDemonstrated: before,
    added: demonstratedNow.filter((id) => !before.includes(id)),
    noLongerListed: before.filter((id) => !demonstratedNow.includes(id)),
    outcome,
  };
}

export async function recallLearner(learnerId: string): Promise<{ records: PublicMemory[]; retrievedIds: string[] }> {
  const loaded = await pathwayMemory();
  const retrieved = loaded.hmem.retrieval.query(`goal ${learnerId}`, {
    topN: 8,
    threshold: 0.01,
    chatId: learnerId,
  });
  const records = loaded.hmem.store
    .all()
    .filter((record: { chatId?: string }) => record.chatId === learnerId)
    .map((record: { id: string; content: string }) => parseLearnerMemory(record.id, record.content))
    .filter((item: PublicMemory | null): item is PublicMemory => item !== null);
  return {
    records,
    retrievedIds: retrieved.memories.map((item) => item.memory.id),
  };
}

export async function resetLearner(learnerId: string): Promise<string[]> {
  const loaded = await pathwayMemory();
  const ids = loaded.hmem.store
    .all()
    .filter((record) => record.chatId === learnerId)
    .map((record) => record.id);
  for (const id of ids) loaded.hmem.store.delete(id, "learner reset");
  return ids;
}

export async function tempMemoryDir(): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-hmem-"));
  return dir;
}
