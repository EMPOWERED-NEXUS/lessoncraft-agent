import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { hmemPersistDir, repoRoot } from "./paths.ts";

const PIN = "1742dec56a66e58eef9dda2d2b865823758ca8cd";

type HMEMCtor = new (opts: {
  clock?: () => number;
  persistDir?: string;
  actor?: string;
}) => HmemInstance;

export interface HmemInstance {
  add(input: {
    content: string;
    type?: string;
    source: string;
    tags?: string[];
    chatId?: string;
    confidence?: number;
  }): { id: string; content: string };
  mine(
    event: string,
    text: string,
    opts?: { chatId?: string },
  ): Promise<Array<{ id: string; content: string }>>;
  query(
    query: string,
    opts?: { topN?: number; threshold?: number; chatId?: string },
  ): {
    memories: Array<{ memory: { id: string; content: string }; relevance: number }>;
    context: string;
    trace: { strategy: string; retrievalReason: string };
  };
  feedback(memoryId: string, kind: "helpful" | "not_helpful" | "wrong"): void;
  ledger: { history: (id: string) => unknown[] };
}

export interface LoadedHmem {
  hmem: HmemInstance;
  source: string;
  pin: string;
}

const CANDIDATES = [
  {
    label: "vendor/hmem",
    entry: path.join(repoRoot, "vendor", "hmem", "src", "index.ts"),
  },
];

export async function loadHMEM(opts?: {
  persistDir?: string;
  clock?: () => number;
  actor?: string;
}): Promise<LoadedHmem> {
  for (const c of CANDIDATES) {
    if (!fs.existsSync(c.entry)) continue;
    const mod = (await import(pathToFileURL(c.entry).href)) as { HMEM: HMEMCtor };
    const persistDir = opts?.persistDir ?? hmemPersistDir;
    fs.mkdirSync(persistDir, { recursive: true });
    const hmem = new mod.HMEM({
      persistDir,
      clock: opts?.clock,
      actor: opts?.actor ?? "lessoncraft",
    });
    return { hmem, source: c.label, pin: PIN };
  }
  throw new Error(
    `Meterless H-MEM not found (pin ${PIN}). From the repo root run: npm run setup`,
  );
}

export function hmemSetupHint(): string {
  return `npm run setup  # degit Meterless H-MEM reference @ ${PIN}`;
}
