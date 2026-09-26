/**
 * Groq backup provider — server only.
 *
 * Groq's free plan needs no card and serves open models very fast through an
 * OpenAI-compatible API, so this is a plain `fetch` client (no SDK). Its
 * weakness is a small tokens-per-minute budget per model, so every request is
 * sized first: pick a model whose free-tier TPM fits the prompt, and if none
 * does, trim the transcript and say so honestly.
 */

/** Overridable for a regional gateway or a local stub in tests. */
const GROQ_BASE_URL = (process.env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai/v1").replace(/\/+$/, "");

export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

/**
 * Known free-plan limits (tokens per minute). A request's input + reserved
 * output must fit, or Groq answers 413/429 without doing any work.
 * Order = preference for quality when several fit.
 */
export const GROQ_MODELS: Array<{ id: string; tpm: number; reasoning?: boolean }> = [
  { id: "openai/gpt-oss-120b", tpm: 8_000, reasoning: true },
  { id: "llama-3.3-70b-versatile", tpm: 12_000 },
  { id: "meta-llama/llama-4-scout-17b-16e-instruct", tpm: 30_000 },
  { id: "openai/gpt-oss-20b", tpm: 8_000, reasoning: true },
  { id: "llama-3.1-8b-instant", tpm: 6_000 },
];

/** Rough token estimate (≈3.6 characters per token for English captions). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.6);
}

/**
 * Models to try for a prompt of `promptTokens` + `outputTokens`, best first.
 * Models whose budget cannot fit the request are dropped; `available` (from
 * the live model list) removes anything Groq has retired.
 */
export function planGroqModels(
  promptTokens: number,
  outputTokens: number,
  available?: Set<string> | null,
): string[] {
  const need = promptTokens + outputTokens;
  const live = GROQ_MODELS.filter((model) => !available || available.size === 0 || available.has(model.id));
  const fitting = live.filter((model) => need <= model.tpm * 0.92);
  return fitting.map((model) => model.id);
}

/** Largest prompt (in characters) any live model can take with this output budget. */
export function groqPromptBudgetCharacters(outputTokens: number, available?: Set<string> | null): number {
  const live = GROQ_MODELS.filter((model) => !available || available.size === 0 || available.has(model.id));
  const best = Math.max(0, ...live.map((model) => model.tpm));
  return Math.max(0, Math.floor((best * 0.92 - outputTokens - 400) * 3.6));
}

let modelCache: { at: number; ids: Set<string> } | null = null;

/** Live model ids for this key, cached 10 minutes. Never throws. */
export async function listGroqModels(timeoutMs = 2_000): Promise<Set<string> | null> {
  if (modelCache && Date.now() - modelCache.at < 10 * 60_000) return modelCache.ids;
  try {
    const response = await fetch(`${GROQ_BASE_URL}/models`, {
      headers: { authorization: `Bearer ${process.env.GROQ_API_KEY?.trim()}` },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: Array<{ id?: string; active?: boolean }> };
    const ids = new Set(
      (body.data ?? []).filter((model) => model.id && model.active !== false).map((model) => model.id as string),
    );
    modelCache = { at: Date.now(), ids };
    return ids;
  } catch {
    return null;
  }
}

export class GroqError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: "invalid-key" | "quota" | "too-large" | "model-unavailable" | "temporarily-unavailable" | "unknown",
  ) {
    super(message);
    this.name = "GroqError";
  }
}

export interface GroqRequest {
  model: string;
  system: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
  json?: boolean;
  signal?: AbortSignal;
}

function body(request: GroqRequest, stream: boolean) {
  const reasoning = GROQ_MODELS.find((model) => model.id === request.model)?.reasoning;
  return JSON.stringify({
    model: request.model,
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: request.prompt },
    ],
    temperature: request.temperature,
    max_completion_tokens: request.maxTokens,
    stream,
    ...(request.json ? { response_format: { type: "json_object" } } : {}),
    // gpt-oss thinks before answering; "low" keeps Groq's speed.
    ...(reasoning ? { reasoning_effort: "low" } : {}),
  });
}

async function send(request: GroqRequest, stream: boolean): Promise<Response> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new GroqError("Groq is not configured.", 0, "invalid-key");
  const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: body(request, stream),
    signal: request.signal,
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw classifyGroqStatus(response.status, text);
  }
  return response;
}

export function classifyGroqStatus(status: number, text = ""): GroqError {
  const lower = text.toLowerCase();
  if (status === 401 || status === 403) return new GroqError("Groq rejected the API key.", status, "invalid-key");
  if (status === 413 || lower.includes("request too large")) {
    return new GroqError("That request is too large for Groq's free tier.", status, "too-large");
  }
  if (status === 429) return new GroqError("Groq's free-tier limit was reached.", status, "quota");
  if (status === 404 || lower.includes("model_not_found") || lower.includes("decommissioned")) {
    return new GroqError("That Groq model isn't available.", status, "model-unavailable");
  }
  if (status >= 500) return new GroqError("Groq is temporarily busy.", status, "temporarily-unavailable");
  return new GroqError("Groq could not complete that request.", status, "unknown");
}

/** One-shot completion; returns the message text. */
export async function groqComplete(request: GroqRequest): Promise<string> {
  const response = await send(request, false);
  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? "";
}

/** Streaming completion; yields text deltas from Groq's SSE stream. */
export async function* groqStream(request: GroqRequest): AsyncGenerator<string> {
  const response = await send(request, true);
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
          error?: { message?: string };
        };
        if (parsed.error) throw new GroqError("Groq stopped mid-answer.", 500, "temporarily-unavailable");
        const text = parsed.choices?.[0]?.delta?.content;
        if (text) yield text;
      } catch (error) {
        if (error instanceof GroqError) throw error;
      }
    }
  }
}
