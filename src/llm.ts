import { isTestMode } from "./env.ts";

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

export function llmConfigured(): boolean {
  const url = (process.env.LLM_BASE_URL ?? "").trim();
  const key = (process.env.LLM_API_KEY ?? "").trim();
  const model = (process.env.LLM_MODEL ?? "").trim();
  return Boolean(url && key && model);
}

export async function chatComplete(messages: ChatTurn[], opts?: { json?: boolean }): Promise<string> {
  if (isTestMode() || !llmConfigured()) {
    throw new Error("LLM skipped: test mode or model not configured.");
  }
  const base = (process.env.LLM_BASE_URL ?? "").replace(/\/$/, "");
  const model = (process.env.LLM_MODEL ?? "").trim();
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LLM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages,
      ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const body = (await res.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (!res.ok) {
    throw new Error(`LLM HTTP ${res.status}: ${body.error?.message ?? "unknown error"}`);
  }
  const text = body.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("LLM returned empty content.");
  return text;
}

export function parseJsonObject(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced?.[1] ?? text).trim();
  return JSON.parse(raw) as Record<string, unknown>;
}
