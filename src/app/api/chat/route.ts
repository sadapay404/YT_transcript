import { GEMINI } from "@/lib/constants";
import { CLIP_PLAN_SCHEMA, ASSISTANT_SYSTEM_PROMPT, buildUserPrompt } from "@/lib/gemini/prompts";
import {
  classifyGeminiError,
  extractRecommendedModel,
  getGeminiClient,
  modelCandidates,
  markGeminiModelUnavailable,
  queueSuggestion,
  rememberGeminiModel,
  runWithModelFallback,
  type GeminiFailure,
} from "@/lib/gemini/client";
import { parseClipPlan } from "@/lib/clips/parse";
import type {
  ChatHistoryEntry,
  ChatMode,
  ChatRequest,
  ChatStreamEvent,
  ChatTranscriptContext,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const MODES = new Set<ChatMode>(["chat", "clips", "summary", "chapters"]);
const MAX_MESSAGE = 4_000;
const MAX_HISTORY_TURNS = 8;
const MAX_HISTORY_CHARACTERS = 6_000;
const MAX_SEGMENTS = 6_000;

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
        .catch((error: unknown) => {
          const failure = classifyGeminiError(error);
          emit({ type: "error", code: failure.kind, message: userFacingFailure(failure) });
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

async function produce(
  payload: ChatRequest,
  emit: (event: ChatStreamEvent) => void,
): Promise<void> {
  if (payload.mode === "clips") {
    await produceClipPlan(payload, emit);
    return;
  }
  await produceStream(payload, emit);
}

async function produceClipPlan(
  payload: ChatRequest,
  emit: (event: ChatStreamEvent) => void,
): Promise<void> {
  const prompt = buildUserPrompt(payload.mode, payload.message, payload.transcript, payload.history);
  const result = await runWithModelFallback(async (model) => {
    const ai = getGeminiClient();
    return ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: ASSISTANT_SYSTEM_PROMPT,
        temperature: GEMINI.temperature.clips,
        maxOutputTokens: GEMINI.maxOutputTokens.clips,
        responseMimeType: "application/json",
        responseJsonSchema: CLIP_PLAN_SCHEMA,
      },
    });
  });

  if (!result.ok) {
    emit({ type: "error", code: result.failure.kind, message: userFacingFailure(result.failure) });
    return;
  }

  emit({ type: "meta", model: result.model });
  try {
    const plan = parseClipPlan(result.value.text ?? "");
    emit({ type: "clips", plan });
    if (plan.summary) emit({ type: "delta", text: plan.summary });
  } catch (error) {
    emit({
      type: "error",
      code: "invalid-response",
      message: error instanceof Error ? error.message : "Gemini returned an unusable clip plan.",
    });
  }
}

async function produceStream(
  payload: ChatRequest,
  emit: (event: ChatStreamEvent) => void,
): Promise<void> {
  const prompt = buildUserPrompt(payload.mode, payload.message, payload.transcript, payload.history);
  const queue = modelCandidates();
  const attempts: Array<{ model: string; failure: GeminiFailure }> = [];
  let emittedText = false;

  while (queue.length > 0) {
    const model = queue.shift() as string;
    try {
      const ai = getGeminiClient();
      const stream = await ai.models.generateContentStream({
        model,
        contents: prompt,
        config: {
          systemInstruction: ASSISTANT_SYSTEM_PROMPT,
          temperature:
            payload.mode === "summary" ? GEMINI.temperature.summary : GEMINI.temperature.chat,
          maxOutputTokens:
            payload.mode === "summary" ? GEMINI.maxOutputTokens.summary : GEMINI.maxOutputTokens.chat,
        },
      });

      let modelAnnounced = false;
      for await (const chunk of stream) {
        const text = (chunk.text ?? "").toString();
        if (!text) continue;
        if (!modelAnnounced) {
          emit({ type: "meta", model });
          modelAnnounced = true;
        }
        emittedText = true;
        emit({ type: "delta", text });
      }

      rememberGeminiModel(model);
      if (!modelAnnounced) emit({ type: "meta", model });
      return;
    } catch (error) {
      const failure = classifyGeminiError(error);
      attempts.push({ model, failure });
      // Retrying after text has reached the client would duplicate the answer.
      // A model refusal before the first delta is the only safe streaming retry.
      if (failure.kind === "model-unavailable" && !emittedText) {
        markGeminiModelUnavailable(model);
        const recommendation =
          extractRecommendedModel(error instanceof Error ? error.message : String(error)) ??
          failure.message.match(/"([\w.\-]+)"/)?.[1];
        queueSuggestion(queue, recommendation);
        continue;
      }
      throw error;
    }
  }

  const last = attempts.at(-1)?.failure;
  if (last) emit({ type: "error", code: last.kind, message: userFacingFailure(last) });
  else emit({ type: "error", code: "model-unavailable", message: "No Gemini model is available to this account." });
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
  return {
    mode: mode as ChatMode,
    message: message.trim().slice(0, MAX_MESSAGE),
    transcript,
    history,
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

function userFacingFailure(failure: GeminiFailure): string {
  return failure.remedy ? `${failure.message} ${failure.remedy}` : failure.message;
}
