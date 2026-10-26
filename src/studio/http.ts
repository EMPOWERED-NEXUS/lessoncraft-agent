import type http from "node:http";
import { clearSessionCookie, readCookie, sessionCookie } from "../accounts/session.ts";
import { completeNvidiaChat, nvidiaConfigured } from "../nvidia.ts";
import { StudioApp, StudioError } from "./service.ts";

const MAX_JSON = 12 * 1024 * 1024;

export function studioApp(dataDir: string, memoryDir: string): StudioApp {
  return new StudioApp(dataDir, memoryDir);
}

export async function handleStudio(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  app: StudioApp,
  modelFor: (consent: boolean) => { complete(messages: Array<{ role: "system" | "user"; content: string }>): Promise<{ content: string; model: string }> } | null = defaultModel,
): Promise<boolean> {
  if (!url.pathname.startsWith("/api/studio/")) return false;
  try {
    if (req.method === "POST" && hasOrigin(req) && !originAllowed(req, url)) {
      send(res, 403, { error: "This action must come from this app." });
      return true;
    }
    const token = readCookie(req.headers.cookie, "lc_studio");
    if (req.method === "POST" && url.pathname === "/api/studio/register") {
      const body = await json(req);
      const result = app.register(String(body.email ?? ""), String(body.password ?? ""), body.role === "learner" ? "learner" : "teacher");
      setSession(res, req, result.token);
      send(res, 200, { ok: true, user: result.user, localDemo: true, csrf: csrfOf(app, result.token) });
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/studio/login") {
      const body = await json(req);
      const result = app.login(String(body.email ?? ""), String(body.password ?? ""));
      setSession(res, req, result.token);
      send(res, 200, { ok: true, user: result.user, localDemo: true, csrf: csrfOf(app, result.token) });
      return true;
    }
    if (req.method === "GET" && url.pathname === "/api/studio/session") {
      if (!token) {
        send(res, 200, { authenticated: false, localDemo: true, message: "Local-demo accounts exist only on this computer. They are not a public account service." });
        return true;
      }
      const { user, session } = app.userFromToken(token);
      send(res, 200, { authenticated: true, user, csrf: session.csrf, localDemo: true });
      return true;
    }
    if (req.method === "POST") requireCsrf(req, app, token);
    if (req.method === "POST" && url.pathname === "/api/studio/logout") {
      res.setHeader("Set-Cookie", clearSessionCookie(secure(req)));
      send(res, 200, { ok: true, authenticated: false });
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/studio/account/delete") {
      const body = await json(req);
      app.deleteAccount(token, String(body.password ?? ""));
      res.setHeader("Set-Cookie", clearSessionCookie(secure(req)));
      send(res, 200, { ok: true, deleted: true });
      return true;
    }
    if (req.method === "GET" && url.pathname === "/api/studio/packs") {
      send(res, 200, { packs: app.listPacks(token) });
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/studio/packs") {
      const body = await json(req);
      send(res, 200, { pack: app.createPack(token, body as never) });
      return true;
    }
    const packMatch = url.pathname.match(/^\/api\/studio\/packs\/([^/]+)(?:\/(.+))?$/);
    if (packMatch && req.method === "GET" && !packMatch[2]) {
      send(res, 200, app.getPack(token, decodeURIComponent(packMatch[1])));
      return true;
    }
    if (packMatch && req.method === "POST") {
      const packId = decodeURIComponent(packMatch[1]);
      const action = packMatch[2] || "";
      const body = await json(req);
      if (action === "objectives/propose") {
        send(res, 200, app.propose(token, packId, String(body.text ?? "")));
        return true;
      }
      if (action === "objectives/import") {
        const bytes = Buffer.from(String(body.base64 ?? ""), "base64");
        send(res, 200, await app.importFile(token, packId, String(body.filename ?? "notes.txt"), bytes));
        return true;
      }
      if (action === "objectives") {
        send(res, 200, { objectives: app.saveObjectives(token, packId, Array.isArray(body.objectives) ? body.objectives.map(String) : [], body.reviewed === true) });
        return true;
      }
      if (action === "sources") {
        send(res, 200, { source: app.addSource(token, packId, body as never) });
        return true;
      }
      if (action === "questions") {
        send(res, 200, { question: app.addQuestion(token, packId, body as never) });
        return true;
      }
    }
    if (req.method === "POST" && url.pathname === "/api/studio/lesson") {
      const body = await json(req);
      const lesson = await app.ask(token, String(body.packId ?? ""), String(body.query ?? ""), body.nvidiaConsent === true, modelFor(body.nvidiaConsent === true));
      send(res, 200, publicLesson(lesson));
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/studio/lesson/answer") {
      const body = await json(req);
      send(res, 200, publicLesson(app.answer(token, String(body.lessonId ?? ""), String(body.answer ?? ""))));
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/studio/progress") {
      const body = await json(req);
      send(res, 200, await app.remember(token, String(body.lessonId ?? ""), body.consent === true));
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/studio/progress/reset") {
      send(res, 200, { deleted: await app.reset(token) });
      return true;
    }
    send(res, 404, { error: "Not found" });
  } catch (error) {
    const status = error instanceof StudioError ? error.status : 500;
    send(res, status, { error: error instanceof Error ? error.message : "The request could not be completed." });
  }
  return true;
}

function defaultModel(consent: boolean) {
  if (!consent || !nvidiaConfigured()) return null;
  return { complete: (messages: Array<{ role: "system" | "user"; content: string }>) => completeNvidiaChat(messages) };
}

function publicLesson(lesson: { id: string; packId: string; teaching: { explanation: string; citation: string; hint: string; tryPrompt: string; grounded: boolean; trace: unknown; objective: { id: string; text: string } | null; evidence: { id: string; title: string; attribution: string } | null; question: { id: string; prompt: string; kind: string } | null }; judgement: unknown; modelCalled?: boolean }) {
  return {
    id: lesson.id,
    packId: lesson.packId,
    objective: lesson.teaching.objective,
    evidence: lesson.teaching.evidence ? { id: lesson.teaching.evidence.id, title: lesson.teaching.evidence.title, attribution: lesson.teaching.evidence.attribution } : null,
    explanation: lesson.teaching.explanation,
    citation: lesson.teaching.citation,
    hint: lesson.teaching.hint,
    tryPrompt: lesson.teaching.tryPrompt,
    question: lesson.teaching.question ? { id: lesson.teaching.question.id, prompt: lesson.teaching.question.prompt, kind: lesson.teaching.question.kind } : null,
    grounded: lesson.teaching.grounded,
    trace: lesson.teaching.trace,
    judgement: lesson.judgement,
    modelCalled: lesson.modelCalled === true,
  };
}

function requireCsrf(req: http.IncomingMessage, app: StudioApp, token: string) {
  const { session } = app.userFromToken(token);
  const header = String(req.headers["x-csrf-token"] || "");
  if (!header || header !== session.csrf) throw new StudioError(403, "The page token did not match. Reload and try again.");
}

function csrfOf(app: StudioApp, token: string): string {
  return app.userFromToken(token).session.csrf;
}

function setSession(res: http.ServerResponse, req: http.IncomingMessage, token: string) {
  res.setHeader("Set-Cookie", sessionCookie(token, secure(req)));
}

function secure(req: http.IncomingMessage): boolean {
  return req.headers["x-forwarded-proto"] === "https";
}

function hasOrigin(req: http.IncomingMessage): boolean {
  return Boolean(req.headers.origin);
}

function originAllowed(req: http.IncomingMessage, url: URL): boolean {
  try {
    const origin = new URL(String(req.headers.origin));
    return origin.hostname === "127.0.0.1" || origin.hostname === "localhost";
  } catch {
    return false;
  }
}

async function json(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_JSON) throw new StudioError(413, "The upload is larger than 8 MB and was not saved.");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>;
  } catch {
    throw new StudioError(400, "The request could not be read.");
  }
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}
