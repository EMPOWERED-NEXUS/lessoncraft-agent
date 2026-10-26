import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { loadPacks, defaultPackId } from "./catalog.ts";
import { loadEnv, isTestMode } from "./env.ts";
import { getSharedHmem, diagnose, checkAnswer } from "./journey.ts";
import { llmConfigured } from "./llm.ts";
import { publicDir, repoRoot } from "./paths.ts";
import {
  catalogView,
  forgetLearner,
  memoryReady,
  reviewRun,
  saveMemory,
  startRun,
  submitPractice,
} from "./pathways/service.ts";
import { attemptLogin, authStatus } from "./auth.ts";
import { diagnoseZetaris } from "./zetaris.ts";
import { jdbcConfigured, readPassages } from "./pathways/zetaris-read.ts";
import { handleStudio, studioApp } from "./studio/http.ts";

loadEnv();

const studio = studioApp(
  path.join(repoRoot, ".lessoncraft", "studio-accounts"),
  path.join(repoRoot, ".lessoncraft", "studio-hmem"),
);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function serveStatic(urlPath: string, res: http.ServerResponse): void {
  const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const file = path.normalize(path.join(publicDir, relative));
  if (!file.startsWith(publicDir)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end("Not found");
    return;
  }
  const ext = path.extname(file);
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://127.0.0.1`);
    if (await handleStudio(req, res, url, studio)) return;
    if (req.method === "GET" && (url.pathname === "/studio" || url.pathname === "/studio/")) {
      serveStatic("/studio/index.html", res);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      let hmem = null;
      try {
        const loaded = await getSharedHmem();
        hmem = { source: loaded.source, pin: loaded.pin };
      } catch (error) {
        hmem = { error: error instanceof Error ? error.message : String(error) };
      }
      sendJson(res, 200, {
        ok: true,
        testMode: isTestMode(),
        llmConfigured: llmConfigured(),
        hmem,
        defaultPackId: defaultPackId(),
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/packs") {
      sendJson(res, 200, {
        packs: loadPacks().map((p) => ({
          pack_id: p.pack_id,
          country_code: p.country_code,
          country_name: p.country_name,
          education_subsystem: p.education_subsystem,
          grade_or_level: p.grade_or_level,
          subject: p.subject,
          language_code: p.language_code,
          assessment_style: p.assessment_style,
          disclaimer: p.disclaimer,
          learning_objectives: p.learning_objectives,
          prerequisites: p.prerequisites,
        })),
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/zetaris/diagnostic") {
      sendJson(res, 200, await diagnoseZetaris());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/diagnose") {
      const body = JSON.parse((await readBody(req)) || "{}") as {
        learnerId?: string;
        packId?: string;
        diagnosticAnswer?: string;
      };
      if (!body.diagnosticAnswer?.trim()) {
        sendJson(res, 400, { error: "diagnosticAnswer is required" });
        return;
      }
      const result = await diagnose({
        learnerId: body.learnerId?.trim() || process.env.LEARNER_ID || "demo-learner",
        packId: body.packId,
        diagnosticAnswer: body.diagnosticAnswer,
      });
      sendJson(res, 200, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/check") {
      const body = JSON.parse((await readBody(req)) || "{}") as {
        sessionId?: string;
        answer?: string;
      };
      if (!body.sessionId || !body.answer?.trim()) {
        sendJson(res, 400, { error: "sessionId and answer are required" });
        return;
      }
      sendJson(res, 200, await checkAnswer({ sessionId: body.sessionId, answer: body.answer }));
      return;
    }
    if (req.method === "GET" && (url.pathname === "/login" || url.pathname === "/login/")) {
      serveStatic("/login/index.html", res);
      return;
    }
    if (req.method === "GET" && (url.pathname === "/api/auth/status" || url.pathname === "/api/auth/session")) {
      sendJson(res, 200, authStatus());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      sendJson(res, 200, authStatus());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const raw = await readBody(req);
      if (raw.length > 2000) {
        sendJson(res, 400, { ok: false, message: "Sign-in details were too long.", errors: {} });
        return;
      }
      let body: { email?: string; password?: string };
      try {
        body = JSON.parse(raw || "{}") as { email?: string; password?: string };
      } catch {
        sendJson(res, 400, { ok: false, message: "Enter an email and password.", errors: {} });
        return;
      }
      const result = attemptLogin(String(body.email ?? ""), String(body.password ?? ""));
      sendJson(res, result.errors.email || result.errors.password ? 400 : 501, result);
      return;
    }
    if (req.method === "GET" && (url.pathname === "/pathways" || url.pathname === "/pathways/")) {
      serveStatic("/pathways/index.html", res);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/pathways/catalog") {
      const memory = await memoryReady().catch((error: unknown) => ({
        error: error instanceof Error ? error.message : String(error),
      }));
      sendJson(res, 200, { ...catalogView(), hmem: memory, jdbcConfigured: jdbcConfigured() });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/pathways/zetaris") {
      sendJson(res, 200, await readPassages());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/pathways/run") {
      const body = JSON.parse((await readBody(req)) || "{}") as {
        learnerId?: string;
        countryCode?: string;
        languageCode?: string;
        quizAnswers?: Record<string, string> | null;
        workSample?: string;
        certificate?: {
          shared: boolean;
          title: string;
          claimedCompetencyIds: string[];
          sourceId: string;
        } | null;
        nvidiaConsent?: boolean;
      };
      sendJson(res, 200, await startRun({
        learnerId: body.learnerId?.trim() || "demo-a",
        countryCode: body.countryCode?.trim() || "ZZ",
        languageCode: body.languageCode?.trim() || "en",
        quizAnswers: body.quizAnswers ?? null,
        workSample: body.workSample ?? "",
        certificate: body.certificate ?? null,
        nvidiaConsent: body.nvidiaConsent === true,
      }));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/pathways/review") {
      const body = JSON.parse((await readBody(req)) || "{}") as {
        runId?: string;
        action?: "accept" | "edit" | "dismiss";
        editedText?: string;
      };
      if (!body.runId || !body.action) {
        sendJson(res, 400, { error: "runId and action are required" });
        return;
      }
      sendJson(res, 200, reviewRun(body.runId, body.action, body.editedText));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/pathways/practice") {
      const body = JSON.parse((await readBody(req)) || "{}") as {
        runId?: string;
        phase?: "practice" | "transfer";
        closedAnswer?: string;
        openAnswer?: string;
      };
      if (!body.runId || !body.phase) {
        sendJson(res, 400, { error: "runId and phase are required" });
        return;
      }
      sendJson(res, 200, submitPractice(body.runId, body.phase, body.closedAnswer ?? "", body.openAnswer ?? ""));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/pathways/memory") {
      const body = JSON.parse((await readBody(req)) || "{}") as {
        runId?: string;
        consent?: boolean;
        feedback?: "helpful" | "not_helpful";
      };
      if (!body.runId) {
        sendJson(res, 400, { error: "runId is required" });
        return;
      }
      sendJson(res, 200, await saveMemory(body.runId, Boolean(body.consent), body.feedback === "not_helpful" ? "not_helpful" : "helpful"));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/pathways/memory/reset") {
      const body = JSON.parse((await readBody(req)) || "{}") as { learnerId?: string };
      sendJson(res, 200, await forgetLearner(body.learnerId?.trim() || ""));
      return;
    }
    if (req.method === "GET") {
      serveStatic(url.pathname, res);
      return;
    }
    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

const port = Number(process.env.PORT ?? "8787");
server.listen(port, "127.0.0.1", () => {
  console.log(`LessonCraft http://127.0.0.1:${port}`);
  console.log("Zetaris writes are disabled. H-MEM pin 1742dec56a66e58eef9dda2d2b865823758ca8cd");
});
