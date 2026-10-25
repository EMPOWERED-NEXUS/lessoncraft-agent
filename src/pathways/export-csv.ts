import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "../paths.ts";
import { loadFixture } from "./catalog.ts";

const file = loadFixture();
const dir = path.join(repoRoot, "data", "zetaris");
fs.mkdirSync(dir, { recursive: true });

function quote(value: unknown): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function write(name: string, headers: string[], rows: Array<Record<string, unknown>>): void {
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((header) => quote(row[header])).join(","));
  fs.writeFileSync(path.join(dir, name), `${lines.join("\n")}\n`);
}

write("requirements.csv", ["requirement_id", "competency_id", "statement", "language_code", "country_code", "source_id"], file.requirements);
write(
  "resources.csv",
  ["resource_id", "language_code", "country_code", "kind", "targets", "title", "body", "source_id"],
  file.resources.map((resource) => ({ ...resource, targets: resource.targets.join("|") })),
);
write(
  "sources.csv",
  ["source_id", "source_class", "source_title", "source_owner", "source_url", "licence_or_permission", "attribution", "page_or_section", "language_code", "country_scope", "reuse_ok", "not_official_standard"],
  file.sources.map((source) => ({
    ...source,
    source_url: source.source_url ?? "",
    page_or_section: source.page_or_section ?? "",
    language_code: source.language_code ?? "",
    country_scope: source.country_scope.join("|"),
    reuse_ok: String(source.reuse_ok),
    not_official_standard: String(source.not_official_standard),
  })),
);

console.log(`Wrote CSV files to ${dir}`);
