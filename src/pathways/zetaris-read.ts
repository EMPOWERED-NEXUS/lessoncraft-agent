import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "../env.ts";
import { repoRoot } from "../paths.ts";
import { assertReadOnlySql } from "../zetaris.ts";
import type { SupportingPassage } from "./types.ts";

export interface ZetarisPassageRead {
  ok: boolean;
  configured: boolean;
  databases: string[];
  note: string;
  passages: SupportingPassage[];
}

export type PassageQuery = (sql: string) => Promise<JdbcTable>;

const FIXTURE_PASSAGE =
  "Fixture mode. No approved Zetaris passage was returned. The pathway structure comes from the local fixture.";

export const PASSAGE_SQL =
  "SELECT passage_id, passage_text, section_locator, lessoncraft_competency_ids, lessoncraft_mapping_note, source_id, source_title, creators, editor, source_url, licence, licence_url, attribution, review_status, not_official_standard, official_standard_marker, access_scope, share_status, content_origin, training_use, language_code FROM NEXUS_PATHWAYS.passages WHERE access_scope = 'approved_public' AND share_status = 'published' AND training_use = 'retrieval_only' AND content_origin = 'approved public resource' LIMIT 20";

interface JdbcTable {
  columns: string[];
  rows: Array<Record<string, string | null>>;
  rowCount: number;
}

let cache: ZetarisPassageRead | null = null;

export function jdbcConfigured(): boolean {
  return Boolean(jdbcUser() && jdbcPassword() && jdbcJar());
}

export function resetZetarisCache(): void {
  cache = null;
}

export async function readPassages(query: PassageQuery = lightningQuery): Promise<ZetarisPassageRead> {
  const remember = query === lightningQuery;
  if (remember && cache) return cache;
  if (query === lightningQuery && !jdbcConfigured()) {
    const missed = empty(
      "Fixture mode. Zetaris JDBC is not configured. No approved passage was returned. The pathway structure comes from the local fixture.",
    );
    cache = missed;
    return missed;
  }
  try {
    const listed = await query("SHOW LIGHTNING DATABASES");
    const databases = listed.rows.map((row) => Object.values(row).filter(Boolean).join(" "));
    const pathwayDb = databases.find((name) => /^NEXUS_PATHWAYS\b/i.test(name.trim()));
    if (!pathwayDb) {
      const missed = {
        ...empty(
          "Fixture mode. Lightning JDBC connected, but no NEXUS_PATHWAYS database was found. No approved passage was returned. The pathway structure comes from the local fixture.",
        ),
        configured: true,
        databases,
      };
      if (remember) cache = missed;
      return missed;
    }
    const table = await query(PASSAGE_SQL);
    const passages = table.rows.map(passageFromRow).filter((row): row is SupportingPassage => row !== null);
    const found = passages.length > 0;
    const first = passages[0];
    const result: ZetarisPassageRead = {
      ok: found,
      configured: true,
      databases,
      note: found && first
        ? `Pathway structure comes from the local fixture. Supporting passage from Zetaris: ${first.passage_id}, ${first.section_locator}. ${first.licence}.`
        : FIXTURE_PASSAGE,
      passages,
    };
    if (remember) cache = result;
    return result;
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : String(error));
    const loginRejected = /validating the login|password is invalid/i.test(message);
    const missed = empty(
      loginRejected
        ? "Fixture mode. Zetaris JDBC rejected the login. No approved passage was returned. The pathway structure comes from the local fixture."
        : "Fixture mode. The Zetaris passage query did not return an approved passage. The pathway structure comes from the local fixture.",
    );
    missed.configured = true;
    if (remember) cache = missed;
    return missed;
  }
}

export function passageFromRow(row: Record<string, string | null>): SupportingPassage | null {
  const passage: SupportingPassage = {
    passage_id: cell(row, "passage_id"),
    passage_text: cell(row, "passage_text"),
    section_locator: cell(row, "section_locator"),
    lessoncraft_competency_ids: cell(row, "lessoncraft_competency_ids").split(";").map((item) => item.trim()).filter(Boolean),
    lessoncraft_mapping_note: cell(row, "lessoncraft_mapping_note"),
    source_id: cell(row, "source_id"),
    source_title: cell(row, "source_title"),
    creators: cell(row, "creators"),
    editor: cell(row, "editor"),
    source_url: cell(row, "source_url"),
    licence: cell(row, "licence"),
    licence_url: cell(row, "licence_url"),
    attribution: cell(row, "attribution"),
    review_status: cell(row, "review_status"),
    not_official_standard: cell(row, "not_official_standard"),
    official_standard_marker: cell(row, "official_standard_marker"),
    access_scope: cell(row, "access_scope"),
    share_status: cell(row, "share_status"),
    content_origin: cell(row, "content_origin"),
    training_use: cell(row, "training_use"),
    language_code: cell(row, "language_code"),
  };
  if (!passage.passage_text) return null;
  if (passage.access_scope !== "approved_public") return null;
  if (passage.share_status !== "published") return null;
  if (passage.training_use !== "retrieval_only") return null;
  if (passage.content_origin !== "approved public resource") return null;
  if (!passage.lessoncraft_competency_ids.length) return null;
  if (!/lessoncraft mapping/i.test(passage.lessoncraft_mapping_note)) return null;
  for (const key of ["passage_id", "section_locator", "source_id", "source_title", "creators", "source_url", "licence", "licence_url", "attribution", "review_status"] as const) {
    if (!passage[key]) return null;
  }
  return passage;
}

function empty(note: string): ZetarisPassageRead {
  return { ok: false, configured: false, databases: [], note, passages: [] };
}

export async function lightningQuery(sql: string): Promise<JdbcTable> {
  loadEnv();
  const safe = assertReadOnlySql(sql);
  const jar = jdbcJar();
  const java = javaBin();
  if (!jar || !java) throw new Error("Lightning JDBC jar or Java 17 is not available.");
  const classDir = path.join(repoRoot, "tools", "zetaris-jdbc");
  const classFile = path.join(classDir, "LightningQuery.class");
  const source = path.join(classDir, "LightningQuery.java");
  if (!fs.existsSync(classFile) || fs.statSync(source).mtimeMs > fs.statSync(classFile).mtimeMs) {
    await run(path.join(path.dirname(java), process.platform === "win32" ? "javac.exe" : "javac"), [
      "-encoding",
      "UTF-8",
      "-cp",
      jar,
      "-d",
      classDir,
      source,
    ]);
  }
  const stdout = await run(java, ["-cp", `${jar}${path.delimiter}${classDir}`, "LightningQuery", safe], {
    ZETARIS_JDBC_URL: process.env.ZETARIS_JDBC_URL?.trim() || "jdbc:zetaris:lightning@127.0.0.1:10000",
    ZETARIS_JDBC_USER: jdbcUser(),
    ZETARIS_JDBC_PASSWORD: jdbcPassword(),
  });
  const parsed = JSON.parse(stdout) as JdbcTable;
  if (!parsed || !Array.isArray(parsed.rows)) throw new Error("JDBC client returned an unexpected payload.");
  return parsed;
}

function jdbcUser(): string {
  loadEnv();
  return (process.env.ZETARIS_JDBC_USER ?? "").trim();
}

function jdbcPassword(): string {
  loadEnv();
  return (process.env.ZETARIS_JDBC_PASSWORD ?? "").trim();
}

function jdbcJar(): string | null {
  const configured = (process.env.ZETARIS_JDBC_JAR ?? "").trim();
  if (configured && fs.existsSync(configured)) return configured;
  const fallback = "\\\\wsl$\\Ubuntu\\home\\melx\\zetaris-cloud-gateway\\jdbc\\ndp-jdbc-driver-2.4.3.1-7eff043-driver.jar";
  if (fs.existsSync(fallback)) return fallback;
  return null;
}

function javaBin(): string | null {
  const configured = (process.env.JAVA_BIN ?? "").trim();
  if (configured && fs.existsSync(configured)) return configured;
  const portable = path.join(repoRoot, "tools", "jdk");
  if (fs.existsSync(portable)) {
    const found = findJava(portable);
    if (found) return found;
  }
  return null;
}

function findJava(dir: string): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findJava(full);
      if (nested) return nested;
    } else if (entry.name === "java.exe" || entry.name === "java") {
      if (full.includes(`${path.sep}bin${path.sep}`)) return full;
    }
  }
  return null;
}

function run(bin: string, args: string[], extraEnv?: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      env: { ...process.env, ...extraEnv },
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Lightning JDBC timed out."));
    }, 45_000);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(redact(stderr || stdout || `JDBC client exited ${code}`).slice(0, 500)));
        return;
      }
      const jsonStart = stdout.indexOf("{");
      resolve(jsonStart >= 0 ? stdout.slice(jsonStart) : stdout);
    });
  });
}

function redact(message: string): string {
  let text = message.replace(/jdbc:zetaris:\S+/gi, "jdbc:zetaris:[redacted]");
  const password = jdbcPassword();
  if (password) text = text.split(password).join("[redacted]");
  return text;
}

function cell(row: Record<string, string | null>, key: string): string {
  const found = Object.entries(row).find(([name]) => name.toLowerCase() === key.toLowerCase());
  return (found?.[1] ?? "").trim();
}

