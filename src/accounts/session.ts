import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface SessionPayload {
  userId: string;
  csrf: string;
  exp: number;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function createSession(userId: string, secret: string, now = Date.now(), ttlMs = 1000 * 60 * 60 * 12): string {
  const payload: SessionPayload = {
    userId,
    csrf: randomBytes(18).toString("base64url"),
    exp: now + ttlMs,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function readSession(token: string, secret: string, now = Date.now()): SessionPayload | null {
  const [body, mac] = String(token || "").split(".");
  if (!body || !mac) return null;
  const expected = sign(body, secret);
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.userId || !payload.csrf || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string, secure: boolean): string {
  const parts = [
    `lc_studio=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=43200",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  const parts = ["lc_studio=", "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function readCookie(header: string | undefined, name: string): string {
  for (const part of String(header || "").split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}
