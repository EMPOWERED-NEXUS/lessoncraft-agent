import { randomUUID } from "node:crypto";

export type ZetarisStatus =
  | "not_configured"
  | "incomplete"
  | "ok"
  | "error";

export interface ZetarisDiagnostic {
  status: ZetarisStatus;
  configured: boolean;
  route: "ui-proxy" | "rest-preflight" | "none";
  message: string;
  statements: Array<{ sql: string; ok: boolean; preview?: unknown; error?: string }>;
  usedEnv: string[];
  lessonTable: string | null;
}

const WRITE_WORDS =
  /\b(CREATE|DROP|INSERT|UPDATE|DELETE|ALTER|GRANT|REVOKE|CACHE|COMPILE|ACTIVATE|REMOVE|TRUNCATE|MERGE|REPLACE|UPSERT)\b/i;

export function assertReadOnlySql(sql: string): string {
  const stripped = sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .trim();
  if (!stripped) throw new Error("SQL is empty.");
  const parts = stripped
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length !== 1) {
    throw new Error("Read-only adapter accepts exactly one SQL statement.");
  }
  const statement = parts[0];
  const first = statement.split(/\s+/)[0]?.toUpperCase() ?? "";
  const allowed = new Set(["SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN"]);
  if (!allowed.has(first)) {
    throw new Error(`Read-only adapter rejected SQL starting with ${first}.`);
  }
  if (WRITE_WORDS.test(statement)) {
    throw new Error("Read-only adapter rejected a statement that looks like a write.");
  }
  return statement;
}

function presentEnv(): string[] {
  const keys = [
    "ZETARIS_BASE_URL",
    "ZETARIS_REST_URL",
    "ZETARIS_ORG_ID",
    "ZETARIS_API_KEY",
    "ZETARIS_USERNAME",
    "ZETARIS_PASSWORD",
    "ZETARIS_QUERY_LIMIT",
    "ZETARIS_ENGINE_ID",
    "ZETARIS_LESSON_TABLE",
  ];
  return keys.filter((k) => (process.env[k] ?? "").trim() !== "");
}

function originOk(url: string): boolean {
  return /^https?:\/\/[^/\s]+$/i.test(url.replace(/\/$/, ""));
}

function trimSlash(url: string): string {
  return url.replace(/\/$/, "");
}

async function parseResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text.slice(0, 400);
  }
}

async function uiProxyQuery(sql: string): Promise<unknown> {
  const base = trimSlash((process.env.ZETARIS_BASE_URL ?? "").trim());
  const org = (process.env.ZETARIS_ORG_ID ?? "").trim();
  let token = (process.env.ZETARIS_API_KEY ?? "").trim();
  if (!token) {
    const username = (process.env.ZETARIS_USERNAME ?? "").trim();
    const password = (process.env.ZETARIS_PASSWORD ?? "").trim();
    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-ID": randomUUID() },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!login.ok) throw new Error(`Zetaris login failed: HTTP ${login.status}`);
    const body = (await login.json()) as Record<string, unknown>;
    token = String(body.idToken ?? body.token ?? body.accessToken ?? "");
    if (!token) throw new Error("Zetaris login did not return an access token.");
  }
  const limit = Number(process.env.ZETARIS_QUERY_LIMIT ?? "100") || 100;
  const payload: Record<string, unknown> = { sql, limit };
  const engineId = (process.env.ZETARIS_ENGINE_ID ?? "").trim();
  if (engineId) payload.engineId = engineId;
  const res = await fetch(`${base}/api/proxy/sql-editor/sqls/run-query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Org-ID": org,
      "X-Request-ID": randomUUID(),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await parseResponse(res);
  if (!res.ok) throw new Error(`UI proxy query failed: HTTP ${res.status} ${JSON.stringify(data)}`);
  return data;
}

async function restPreflight(): Promise<unknown> {
  const rest = trimSlash((process.env.ZETARIS_REST_URL ?? "").trim());
  const org = (process.env.ZETARIS_ORG_ID ?? "").trim();
  const token = (process.env.ZETARIS_API_KEY ?? "").trim();
  const res = await fetch(`${rest}/datasource/datasources`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Org-ID": org,
      "X-Request-ID": randomUUID(),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const data = await parseResponse(res);
  if (!res.ok) {
    throw new Error(`REST preflight failed: HTTP ${res.status} ${JSON.stringify(data)}`);
  }
  return data;
}

export async function diagnoseZetaris(): Promise<ZetarisDiagnostic> {
  const usedEnv = presentEnv();
  const base = (process.env.ZETARIS_BASE_URL ?? "").trim();
  const rest = (process.env.ZETARIS_REST_URL ?? "").trim();
  const org = (process.env.ZETARIS_ORG_ID ?? "").trim();
  const key = (process.env.ZETARIS_API_KEY ?? "").trim();
  const user = (process.env.ZETARIS_USERNAME ?? "").trim();
  const pass = (process.env.ZETARIS_PASSWORD ?? "").trim();
  const lessonTable = (process.env.ZETARIS_LESSON_TABLE ?? "").trim() || null;
  const auth = Boolean(key) || Boolean(user && pass);

  if (!base && !rest && !org && !key && !user && !pass) {
    return {
      status: "not_configured",
      configured: false,
      route: "none",
      message:
        "Zetaris is not configured. Set confirmed values in .env.local. LessonCraft will not guess URLs or credentials, and will not run CREATE/write SQL.",
      statements: [],
      usedEnv,
      lessonTable,
    };
  }

  if (base && !originOk(base)) {
    return {
      status: "incomplete",
      configured: false,
      route: "none",
      message: "ZETARIS_BASE_URL must be an http(s) origin with no path.",
      statements: [],
      usedEnv,
      lessonTable,
    };
  }
  if (!org || !/^\d+$/.test(org)) {
    return {
      status: "incomplete",
      configured: false,
      route: "none",
      message: "ZETARIS_ORG_ID must be the numeric organisation ID from your instance.",
      statements: [],
      usedEnv,
      lessonTable,
    };
  }
  if (!auth) {
    return {
      status: "incomplete",
      configured: false,
      route: "none",
      message: "Set ZETARIS_API_KEY or both ZETARIS_USERNAME and ZETARIS_PASSWORD.",
      statements: [],
      usedEnv,
      lessonTable,
    };
  }

  if (base) {
    const statements: ZetarisDiagnostic["statements"] = [];
    const checks = ["SELECT 1 AS one", "SHOW LIGHTNING DATABASES"];
    for (const sql of checks) {
      try {
        const preview = await uiProxyQuery(assertReadOnlySql(sql));
        statements.push({ sql, ok: true, preview });
      } catch (error) {
        statements.push({
          sql,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const ok = statements.every((s) => s.ok);
    return {
      status: ok ? "ok" : "error",
      configured: true,
      route: "ui-proxy",
      message: ok
        ? "Read-only UI-proxy checks succeeded. No write SQL was sent."
        : "UI-proxy checks failed. Connection details were used as provided; they were not guessed.",
      statements,
      usedEnv,
      lessonTable,
    };
  }

  try {
    const preview = await restPreflight();
    return {
      status: "ok",
      configured: true,
      route: "rest-preflight",
      message:
        "REST URL is set but UI origin is not, so only GET /datasource/datasources ran. SQL queries need ZETARIS_BASE_URL. No write SQL was sent.",
      statements: [{ sql: "GET /datasource/datasources", ok: true, preview }],
      usedEnv,
      lessonTable,
    };
  } catch (error) {
    return {
      status: "error",
      configured: true,
      route: "rest-preflight",
      message: error instanceof Error ? error.message : String(error),
      statements: [
        {
          sql: "GET /datasource/datasources",
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
      ],
      usedEnv,
      lessonTable,
    };
  }
}

export async function readOnlySelect(sql: string): Promise<unknown> {
  const safe = assertReadOnlySql(sql);
  const base = (process.env.ZETARIS_BASE_URL ?? "").trim();
  if (!base) {
    throw new Error("SQL reads require ZETARIS_BASE_URL (UI origin). It is not set.");
  }
  return uiProxyQuery(safe);
}
