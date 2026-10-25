import fs from "node:fs";
import path from "node:path";
import { packsDir } from "./paths.ts";
import { sanitizeArtefact } from "./provenance.ts";
import type { CurriculumPack } from "./types.ts";

function walkJson(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walkJson(full, acc);
    else if (name === "pack.json") acc.push(full);
  }
  return acc;
}

export function loadPacks(): CurriculumPack[] {
  const packs: CurriculumPack[] = [];
  for (const file of walkJson(packsDir)) {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as CurriculumPack;
    packs.push({
      ...raw,
      artefacts: (raw.artefacts ?? []).map(sanitizeArtefact),
    });
  }
  return packs.sort((a, b) => a.pack_id.localeCompare(b.pack_id));
}

export function getPack(packId: string): CurriculumPack {
  const pack = loadPacks().find((p) => p.pack_id === packId);
  if (!pack) throw new Error(`Unknown pack_id: ${packId}`);
  return pack;
}

export function defaultPackId(): string {
  const requested = (process.env.LESSON_PACK_ID ?? "").trim();
  const packs = loadPacks();
  if (requested) {
    if (!packs.some((p) => p.pack_id === requested)) {
      throw new Error(`LESSON_PACK_ID not found: ${requested}`);
    }
    return requested;
  }
  const draft = packs.find((p) => p.status === "draft") ?? packs[0];
  if (!draft) throw new Error("No curriculum packs found under packs/");
  return draft.pack_id;
}
