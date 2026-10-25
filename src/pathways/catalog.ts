import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "../paths.ts";
import type { PathwayFile, SourceRecord } from "./types.ts";

const BLOCKED = ["ny_taxi", "tpcds", "estudyuniverse", "kamerpower", "meetlearn", "openexamprep"];

export function pathwayFilePath(): string {
  return path.join(repoRoot, "data", "pathways", "pw-workplace-status-update.json");
}

export function loadFixture(): PathwayFile {
  const raw = JSON.parse(fs.readFileSync(pathwayFilePath(), "utf8")) as PathwayFile;
  assertFixture(raw);
  return raw;
}

export function assertFixture(file: PathwayFile): void {
  if (file.pathway_id !== "pw-workplace-status-update") {
    throw new Error("Unexpected pathway file.");
  }
  const sources = new Map(file.sources.map((source) => [source.source_id, source]));
  for (const requirement of file.requirements) {
    requireReusable(sources.get(requirement.source_id), requirement.requirement_id);
  }
  for (const resource of file.resources) {
    requireReusable(sources.get(resource.source_id), resource.resource_id);
    if (isBlockedRecord(resource.source_id, resource.title, resource.body)) {
      throw new Error(`Fixture resource is blocked: ${resource.resource_id}`);
    }
  }
  for (const item of file.quiz) {
    if (!item.answer || !sources.get(item.source_id)?.reuse_ok) {
      throw new Error(`Quiz item ${item.id} is missing a keyed answer or source.`);
    }
  }
}

function requireReusable(source: SourceRecord | undefined, ownerId: string): void {
  if (!source?.reuse_ok || source.source_class === "citation_only") {
    throw new Error(`Fixture record ${ownerId} has no reusable source.`);
  }
  for (const key of ["source_title", "source_owner", "licence_or_permission", "attribution"] as const) {
    if (!source[key]?.trim()) throw new Error(`Source ${source.source_id} is missing ${key}.`);
  }
}

export function isBlockedRecord(...parts: Array<string | null | undefined>): boolean {
  const haystack = parts.filter(Boolean).join(" ").toLowerCase();
  return BLOCKED.some((marker) => haystack.includes(marker));
}

export function sourceById(file: PathwayFile, sourceId: string): SourceRecord | undefined {
  return file.sources.find((source) => source.source_id === sourceId);
}
