import { GEMINI } from "@/lib/constants";
import { CLIP_PLAN_SCHEMA, ASSISTANT_SYSTEM_PROMPT, buildUserPrompt } from "@/lib/gemini/prompts";
import {
  classifyGeminiError,
  getGeminiClient,
  isGeminiConfigured,
  modelCandidates,
  runWithModelFallback,
  sanitizeModelId,
} from "@/lib/gemini/client";
import { discoverGeminiModels } from "@/lib/gemini/models";
import {
  GroqError,
  estimateTokens,
  groqComplete,
  groqPromptBudgetCharacters,
  groqStream,
  isGroqConfigured,
  listGroqModels,
  planGroqModels,
} from "@/lib/ai/groq";
import { parseClipPlan } from "@/lib/clips/parse";
import { providerOrder } from "@/lib/ai/providers";
import type {
  AiProviderChoice,
  AiProviderId,
  AiProviderStatus,
  ChatHistoryEntry,
  ChatMode,
  ChatRequest,
  ChatStreamEvent,
  ChatTranscriptContext,
  ClipPlan,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const MODES = new Set<ChatMode>(["chat", "clips", "summary", "chapters"]);
const PROVIDERS = new Set<AiProviderChoice>(["auto", "gemini", "groq"]);
const MAX_MESSAGE = 4_000;
const MAX_HISTORY_TURNS = 8;
const MAX_HISTORY_CHARACTERS = 6_000;
const MAX_SEGMENTS = 6_000;
/** Whole-request budget, inside the route's 60s limit. */
const ROUTE_BUDGET_MS = 54_000;
/** Time kept back for the backup provider when the first one stalls. */
const BACKUP_RESERVE_MS = 14_000;
/** A clip plan is one long JSON answer; give it room. */
const CLIP_ATTEMPT_TIMEOUT_MS = 38_000;
/** Streaming answers must start within this, or the next model gets a turn. */
const FIRST_TOKEN_TIMEOUT_MS = 18_000;
const GROQ_ATTEMPT_TIMEOUT_MS = 25_000;

const LABEL: Record<AiProviderId, string> = { gemini: "Google Gemini", groq: "Groq" };

/** Which providers this installation can use — drives the NexAI picker. */
export async function GET(): Promise<Response> {
  const status: AiProviderStatus = { gemini: isGeminiConfigured(), groq: isGroqConfigured() };
  return Response.json(status, { headers: { "cache-control": "no-store" } });
}

/**
 * The assistant is a public API route, so it validates and caps its input even
 * though the first caller is our own UI. It returns NDJSON for valid requests:
 * one final `done` is guaranteed, including configuration and network errors.
 */
export async function POST(request: Request): Promise<Response> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return invalidBody("Request body must be valid JSON.");
  }

  const payload = validateRequest(input);
  if (!payload) return invalidBody("Expected mode, message, transcript and history.");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let doneSent = false;
      const emit = (event: ChatStreamEvent) => {
        if (event.type === "done") {
          if (doneSent) return;
          doneSent = true;
        }
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      void produce(payload, emit)
        .catch(() => {
          emit({ type: "error", code: "unknown", message: FAILURE_TEXT.unknown });
        })
        .finally(() => {
          emit({ type: "done" });
          controller.close();
        });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      "x-content-type-options": "nosniff",
    },
  });
}

/* ───────────────────────────── Orchestration ───────────────────────────── */

type ProviderOutcome =
  | { ok: true }
  | { ok: false; kind: string; emittedText: boolean };

async function produce(
  payload: ChatRequest,
  emit: (event: ChatStreamEvent) => void,
): Promise<void> {
  const deadline = Date.now() + ROUTE_BUDGET_MS;
  const configured: AiProviderStatus = { gemini: isGeminiConfigured(), groq: isGroqConfigured() };
  const choice = payload.provider ?? "auto";
  const order = providerOrder(choice, configured);

  if (order.length === 0) {
    emit({ type: "error", code: "missing-key", message: FAILURE_TEXT["missing-key"] });
    return;
  }

  const failures: string[] = [];
  for (let index = 0; index < order.length; index += 1) {
    const provider = order[index];
    const isLast = index === order.length - 1;
    // An honest, quiet note whenever the answer isn't from the chosen provider.
    let note: string | undefined;
    if (choice !== "auto" && provider !== choice) {
      note = configured[choice]
        ? `${LABEL[choice]} couldn't answer just now — answered by ${LABEL[provider]} instead.`
        : `${LABEL[choice]} isn't set up on this installation — answered by ${LABEL[provider]}.`;
    } else if (index > 0) {
      note = `${LABEL[order[0]]} was busy — answered by ${LABEL[provider]} (backup).`;
    }

    const budgetEnd = isLast ? deadline : deadline - BACKUP_RESERVE_MS;
    const outcome =
      provider === "gemini"
        ? await runGemini(payload, emit, budgetEnd, note)
        : await runGroq(payload, emit, deadline, note);
    if (outcome.ok) return;
    failures.push(outcome.kind);
    // Once words have reached the reader, switching provider would splice two
    // different answers together. Stop and offer Retry instead.
    if (outcome.emittedText) break;
    if (Date.now() >= deadline - 2_000) break;
  }

  emit({ type: "error", code: failureCode(failures), message: failureText(failures) });
}

/* ──────────────────────────────── Gemini ──────────────────────────────── */

async function runGemini(
  payload: ChatRequest,
  emit: (event: ChatStreamEvent) => void,
  deadline: number,
  note?: string,
): Promise<ProviderOutcome> {
  const discovered = await discoverGeminiModels();
  const candidates = modelCandidates({ preferred: [payload.preferredModels?.gemini], discovered });
  const prompt = buildUserPrompt(payload.mode, payload.message, payload.transcript, payload.history);

  if (payload.mode === "clips") {
    const result = await runWithModelFallback(
      async (model) => {
        const timeout = Math.max(1_000, Math.min(CLIP_ATTEMPT_TIMEOUT_MS, deadline - Date.now()));
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
          const ai = getGeminiClient();
          const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              systemInstruction: ASSISTANT_SYSTEM_PROMPT,
              temperature: GEMINI.temperature.clips,
              maxOutputTokens: GEMINI.maxOutputTokens.clips,
              responseMimeType: "application/json",
              responseJsonSchema: CLIP_PLAN_SCHEMA,
              abortSignal: controller.signal,
            },
          });
          // A plan we cannot read counts as this model's failure, so the next
          // model (or Groq) still gets a chance within the same click.
          return parseClipPlan(response.text ?? "");
        } finally {
          clearTimeout(timer);
        }
      },
      { candidates, deadline, maxAttempts: 6 },
    );
    if (!result.ok) return { ok: false, kind: result.failure.kind, emittedText: false };
    emitPlan(emit, result.value, result.model, "gemini", note);
    return { ok: true };
  }

  let emittedText = false;
  const result = await runWithModelFallback(
    async (model) => {
      const controller = new AbortController();
      const firstTokenBudget = Math.max(1_000, Math.min(FIRST_TOKEN_TIMEOUT_MS, deadline - Date.now()));
      let timer = setTimeout(() => controller.abort(), firstTokenBudget);
      try {
        const ai = getGeminiClient();
        const stream = await ai.models.generateContentStream({
          model,
          contents: prompt,
          config: {
            systemInstruction: ASSISTANT_SYSTEM_PROMPT,
            temperature: payload.mode === "summary" ? GEMINI.temperature.summary : GEMINI.temperature.chat,
            maxOutputTokens:
              payload.mode === "summary" ? GEMINI.maxOutputTokens.summary : GEMINI.maxOutputTokens.chat,
            abortSignal: controller.signal,
          },
        });
        for await (const chunk of stream) {
          const text = (chunk.text ?? "").toString();
          if (!text) continue;
          if (!emittedText) {
            emit({ type: "meta", model, provider: "gemini", ...(note ? { note } : {}) });
            // The answer has started: now only the whole-route budget applies.
            clearTimeout(timer);
            timer = setTimeout(() => controller.abort(), Math.max(1_000, deadline + BACKUP_RESERVE_MS - Date.now()));
          }
          emittedText = true;
          emit({ type: "delta", text });
        }
        if (!emittedText) throw new Error("empty response");
        return true;
      } catch (error) {
        // After text has reached the reader a retry would duplicate the answer:
        // surface it as a non-retryable failure so the fallback loop stops.
        if (emittedText) throw new StreamInterrupted(error);
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
    { candidates, deadline, maxAttempts: 6 },
  );
  if (!result.ok) return { ok: false, kind: result.failure.kind, emittedText };
  return { ok: true };
}

class StreamInterrupted extends Error {
  constructor(readonly original: unknown) {
    super("stream interrupted after text");
    this.name = "StreamInterrupted";
  }
}

/* ───────────────────────────────── Groq ───────────────────────────────── */

async function runGroq(
  payload: ChatRequest,
  emit: (event: ChatStreamEvent) => void,
  deadline: number,
  note?: string,
): Promise<ProviderOutcome> {
  const available = await listGroqModels();
  const clips = payload.mode === "clips";
  const outputTokens = clips ? 3_400 : payload.mode === "summary" ? 900 : 1_600;
  const compact = clips || payload.mode === "chapters";

  let prompt = buildUserPrompt(payload.mode, payload.message, payload.transcript, payload.history, { compact });
  const systemTokens = estimateTokens(ASSISTANT_SYSTEM_PROMPT);
  let models = planGroqModels(estimateTokens(prompt) + systemTokens, outputTokens, available);
  let trimNote: string | undefined;
  if (models.length === 0) {
    // Too long for any free Groq model: read as much as fits, and say so.
    const overhead = prompt.length - contextLength(payload, compact);
    const budget = groqPromptBudgetCharacters(outputTokens + systemTokens, available) - Math.max(0, overhead);
    if (budget < 2_000) return { ok: false, kind: "too-large", emittedText: false };
    prompt = buildUserPrompt(payload.mode, payload.message, payload.transcript, payload.history, {
      compact,
      maxCharacters: budget,
    });
    const share = Math.max(1, Math.min(99, Math.round((budget / Math.max(1, contextLength(payload, compact))) * 100)));
    trimNote = `Groq's free tier read about the first ${share}% of this transcript.`;
    models = planGroqModels(estimateTokens(prompt) + systemTokens, outputTokens, available);
    if (models.length === 0) return { ok: false, kind: "too-large", emittedText: false };
  }
  const hint = sanitizeModelId(payload.preferredModels?.groq);
  if (hint && models.includes(hint)) models = [hint, ...models.filter((model) => model !== hint)];
  const fullNote = [note, trimNote].filter(Boolean).join(" ") || undefined;

  let lastKind = "unknown";
  let emittedText = false;
  for (const model of models.slice(0, 3)) {
    const remaining = deadline - Date.now();
    if (remaining < 2_500) break;
    const signal = AbortSignal.timeout(Math.min(GROQ_ATTEMPT_TIMEOUT_MS, remaining));
    try {
      const request = {
        model,
        system: ASSISTANT_SYSTEM_PROMPT,
        prompt,
        temperature: clips ? GEMINI.temperature.clips : payload.mode === "summary" ? GEMINI.temperature.summary : GEMINI.temperature.chat,
        maxTokens: outputTokens,
        json: clips,
        signal,
      };
      if (clips) {
        const text = await groqComplete(request);
        const plan = parseClipPlan(text);
        emitPlan(emit, plan, model, "groq", fullNote);
        return { ok: true };
      }
      for await (const text of groqStream(request)) {
        if (!emittedText) emit({ type: "meta", model, provider: "groq", ...(fullNote ? { note: fullNote } : {}) });
        emittedText = true;
        emit({ type: "delta", text });
      }
      if (emittedText) return { ok: true };
      lastKind = "unknown";
    } catch (error) {
      if (emittedText) return { ok: false, kind: "interrupted", emittedText: true };
      if (error instanceof GroqError) {
        lastKind = error.kind === "too-large" ? "quota" : error.kind;
        if (error.kind === "invalid-key") break;
        continue;
      }
      const failure = classifyGeminiError(error);
      lastKind = failure.kind === "unknown" && error instanceof Error && /no usable clip plan/i.test(error.message)
        ? "invalid-response"
        : failure.kind;
    }
  }
  return { ok: false, kind: lastKind, emittedText };
}

function contextLength(payload: ChatRequest, compact: boolean): number {
  const timed = payload.mode === "clips" || payload.mode === "chapters";
  if (timed && payload.transcript.segments.length) {
    return payload.transcript.segments.reduce(
      (total, segment) => total + segment.x.length + (compact ? 8 : 30),
      0,
    );
  }
  return payload.transcript.text.length;
}

function emitPlan(
  emit: (event: ChatStreamEvent) => void,
  plan: ClipPlan,
  model: string,
  provider: AiProviderId,
  note?: string,
) {
  emit({ type: "meta", model, provider, ...(note ? { note } : {}) });
  emit({ type: "clips", plan });
  if (plan.summary) emit({ type: "delta", text: plan.summary });
}

/* ─────────────────────────────── Failures ─────────────────────────────── */

/**
 * What the reader sees when nothing answered. Deliberately free of model
 * names, env-var instructions for the wrong audience, and provider JSON.
 */
const FAILURE_TEXT: Record<string, string> = {
  "missing-key":
    "NexAI isn't set up on this installation yet. Add GEMINI_API_KEY or GROQ_API_KEY to the app environment, then restart.",
  "invalid-key":
    "The AI key on this installation was rejected. Check GEMINI_API_KEY / GROQ_API_KEY in the app environment.",
  quota: "The free AI limits are used up for the moment. Wait about a minute, then retry.",
  blocked: "The AI declined this request. Try rephrasing it.",
  network: "NexAI couldn't reach the AI service from this server. Check the connection, then retry.",
  "invalid-response": "The AI's clip list came back unreadable. Retry — it usually works on the next try.",
  interrupted: "The answer was cut off. Retry to get the full answer.",
  unknown: "NexAI couldn't get an answer right now. Retry in a moment.",
};

function failureCode(kinds: string[]): string {
  if (kinds.includes("interrupted")) return "interrupted";
  if (kinds.length && kinds.every((kind) => kind === "invalid-key")) return "invalid-key";
  if (kinds.includes("blocked")) return "blocked";
  if (kinds.length && kinds.every((kind) => kind === "quota")) return "quota";
  if (kinds.includes("invalid-response")) return "invalid-response";
  if (kinds.length && kinds.every((kind) => kind === "network")) return "network";
  return kinds.at(-1) === "invalid-key" ? "invalid-key" : "unknown";
}

function failureText(kinds: string[]): string {
  return FAILURE_TEXT[failureCode(kinds)] ?? FAILURE_TEXT.unknown;
}

function validateRequest(value: unknown): ChatRequest | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const mode = raw.mode;
  const message = raw.message;
  if (typeof mode !== "string" || !MODES.has(mode as ChatMode)) return null;
  if (typeof message !== "string" || !message.trim()) return null;

  const transcript = normalizeTranscript(raw.transcript);
  if (!transcript) return null;

  const history = normalizeHistory(raw.history);
  const provider =
    typeof raw.provider === "string" && PROVIDERS.has(raw.provider as AiProviderChoice)
      ? (raw.provider as AiProviderChoice)
      : "auto";
  const hints =
    raw.preferredModels && typeof raw.preferredModels === "object"
      ? (raw.preferredModels as Record<string, unknown>)
      : {};
  const preferredModels: Partial<Record<AiProviderId, string>> = {};
  const geminiHint = sanitizeModelId(hints.gemini);
  const groqHint = sanitizeModelId(hints.groq);
  if (geminiHint) preferredModels.gemini = geminiHint;
  if (groqHint) preferredModels.groq = groqHint;
  return {
    mode: mode as ChatMode,
    message: message.trim().slice(0, MAX_MESSAGE),
    transcript,
    history,
    provider,
    preferredModels,
  };
}

function normalizeTranscript(value: unknown): ChatTranscriptContext | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.videoId !== "string") return null;
  const rawSegments = Array.isArray(raw.segments) ? raw.segments : [];
  const segments = rawSegments
    .slice(0, MAX_SEGMENTS)
    .flatMap((segment, index) => {
      if (!segment || typeof segment !== "object") return [];
      const item = segment as Record<string, unknown>;
      const t = finiteNumber(item.t);
      const d = finiteNumber(item.d);
      const x = typeof item.x === "string" ? item.x.trim() : "";
      if (t === null || d === null || !x) return [];
      return [{ i: finiteNumber(item.i) ?? index, t: Math.max(0, t), d: Math.max(0, d), x: x.slice(0, 2_000) }];
    });

  return {
    videoId: raw.videoId.trim().slice(0, 200),
    title: typeof raw.title === "string" ? raw.title.trim().slice(0, 300) : "Untitled video",
    durationSeconds: Math.max(0, finiteNumber(raw.durationSeconds) ?? 0),
    text: typeof raw.text === "string" ? raw.text.trim().slice(0, GEMINI.maxContextCharacters) : "",
    segments,
    language: typeof raw.language === "string" ? raw.language.trim().slice(0, 40) : "und",
  };
}

function normalizeHistory(value: unknown): ChatHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const result: ChatHistoryEntry[] = [];
  let characters = 0;
  for (const item of value.slice(-MAX_HISTORY_TURNS)) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const role = raw.role === "assistant" ? "assistant" : raw.role === "user" ? "user" : null;
    const content = typeof raw.content === "string" ? raw.content.trim() : "";
    if (!role || !content || characters >= MAX_HISTORY_CHARACTERS) continue;
    const remaining = MAX_HISTORY_CHARACTERS - characters;
    const clipped = content.slice(0, remaining);
    result.push({ role, content: clipped });
    characters += clipped.length;
  }
  return result;
}

function invalidBody(message: string): Response {
  return Response.json({ error: "invalid-body", message }, { status: 400 });
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}
