export const NVIDIA_DEFAULT_BASE = "https://integrate.api.nvidia.com/v1";
export const NVIDIA_DEFAULT_MODEL = "nvidia/nemotron-3.5-super-vl-120b-a12b";
export const NVIDIA_MAX_TOKENS = 512;
export const NVIDIA_CHAT_TEMPLATE = { enable_thinking: false };

export class NvidiaCallError extends Error {
  readonly code: "timeout" | "api_error" | "invalid_response";

  constructor(code: "timeout" | "api_error" | "invalid_response") {
    super(code);
    this.name = "NvidiaCallError";
    this.code = code;
  }
}

export interface NvidiaUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface NvidiaCompletion {
  content: string;
  model: string;
  usage: NvidiaUsage | null;
}

export function nvidiaApiKey(): string {
  return (process.env.NVIDIA_API_KEY ?? "").trim();
}

export function nvidiaBaseUrl(): string {
  const configured = (process.env.NVIDIA_BASE_URL ?? "").trim().replace(/\/$/, "");
  return configured || NVIDIA_DEFAULT_BASE;
}

export function nvidiaModel(): string {
  return (process.env.NVIDIA_MODEL ?? "").trim() || NVIDIA_DEFAULT_MODEL;
}

export function nvidiaConfigured(): boolean {
  return Boolean(nvidiaApiKey());
}

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export async function completeNvidiaChat(
  messages: ChatMessage[],
  fetchImpl: typeof fetch = fetch,
): Promise<NvidiaCompletion> {
  const key = nvidiaApiKey();
  if (!key) throw new NvidiaCallError("api_error");
  const model = nvidiaModel();
  const url = `${nvidiaBaseUrl()}/chat/completions`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 1,
        top_p: 0.95,
        max_tokens: NVIDIA_MAX_TOKENS,
        chat_template_kwargs: NVIDIA_CHAT_TEMPLATE,
        messages,
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") throw new NvidiaCallError("timeout");
    throw new NvidiaCallError("api_error");
  }
  if (!response.ok) throw new NvidiaCallError("api_error");
  let body: {
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    choices?: Array<{ message?: { content?: string } }>;
  };
  try {
    body = await response.json() as typeof body;
  } catch {
    throw new NvidiaCallError("invalid_response");
  }
  const rawContent = body.choices?.[0]?.message?.content;
  const content = typeof rawContent === "string" ? rawContent : "";
  return {
    content,
    model: (body.model ?? "").trim() || model,
    usage: readUsage(body.usage),
  };
}

function readUsage(usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined): NvidiaUsage | null {
  if (!usage) return null;
  const promptTokens = usage.prompt_tokens;
  const completionTokens = usage.completion_tokens;
  const totalTokens = usage.total_tokens;
  if (typeof promptTokens !== "number" || typeof completionTokens !== "number" || typeof totalTokens !== "number") {
    return null;
  }
  return { promptTokens, completionTokens, totalTokens };
}
