/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Gemini client factory — server only (never import this into a component).
 * ─────────────────────────────────────────────────────────────────────────────
 *  One place resolves the API key and the model name, so Step 4 (chat) and
 *  Step 5 (clipper) can never disagree about which model they're calling.
 *
 *  Free tier notes:
 *   • A key from https://aistudio.google.com/apikey needs no credit card.
 *   • `gemini-2.5-flash` has a 1M-token context, so a full transcript fits.
 *   • If the key is absent the app must degrade gracefully — every consumer
 *     checks `isGeminiConfigured()` first and shows setup help instead of
 *     throwing a stack trace at the user.
 */
import { GoogleGenAI } from "@google/genai";

import { GEMINI } from "@/lib/constants";

/** Is a key present in the environment? */
export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

/** Resolved model id (env override → default). */
export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || GEMINI.defaultModel;
}

export function getGeminiFallbackModel(): string {
  return process.env.GEMINI_FALLBACK_MODEL?.trim() || GEMINI.fallbackModel;
}

/**
 * The single SDK entry point. Throws a *friendly* error when unconfigured so
 * the message can be surfaced verbatim in the UI.
 */
export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiConfigError(
      "GEMINI_API_KEY is not set. Add it to .env.local (local) or your host's environment variables (production).",
    );
  }
  return new GoogleGenAI({ apiKey });
}

export class GeminiConfigError extends Error {
  readonly code = "missing-api-key";
  constructor(message: string) {
    super(message);
    this.name = "GeminiConfigError";
  }
}

/* ─────────────────────────── Failures & retries ─────────────────────────── */

export interface GeminiFailure {
  /** Machine-readable bucket so the UI can pick an icon + advice. */
  kind:
    | "missing-key"
    | "invalid-key"
    | "quota"
    | "model-unavailable"
    | "blocked"
    | "network"
    | "timeout"
    | "unknown";
  message: string;
  /** What the user should actually do about it. */
  remedy?: string;
  retryable: boolean;
}

/** Normalise any thrown value from the SDK into something a human can act on. */
export function classifyGeminiError(error: unknown): GeminiFailure {
  if (error instanceof GeminiConfigError) {
    return {
      kind: "missing-key",
      message: error.message,
      remedy: "Create a free key at aistudio.google.com/apikey and add it as GEMINI_API_KEY.",
      retryable: false,
    };
  }

  const raw = error instanceof Error ? error.message : String(error);
  const text = raw.toLowerCase();

  if (text.includes("api key not valid") || text.includes("api_key_invalid") || text.includes("invalid api key")) {
    return {
      kind: "invalid-key",
      message: "That Gemini API key was rejected.",
      remedy: "Double-check the key value (no quotes or spaces) — or generate a fresh one at aistudio.google.com/apikey.",
      retryable: false,
    };
  }
  if (text.includes("quota") || text.includes("429") || text.includes("resource_exhausted")) {
    return {
      kind: "quota",
      message: "Gemini free-tier quota reached for now.",
      remedy: "Wait a minute, or switch GEMINI_MODEL to gemini-2.5-flash-lite.",
      retryable: true,
    };
  }
  if (text.includes("does not exist") || text.includes("not found") || text.includes("unsupported model")) {
    return {
      kind: "model-unavailable",
      message: "That model isn't available to this key.",
      remedy: "Set GEMINI_MODEL=gemini-2.5-flash in your environment.",
      retryable: false,
    };
  }
  if (text.includes("safety") || text.includes("blocked") || text.includes("finish_reason")) {
    return {
      kind: "blocked",
      message: "The model refused this request (safety filter).",
      remedy: "Rephrase the prompt or ask about a different part of the transcript.",
      retryable: false,
    };
  }
  if (text.includes("fetch failed") || text.includes("enotfound") || text.includes("econnrefused") || text.includes("network")) {
    return {
      kind: "network",
      message: "Could not reach the Gemini API from this server.",
      remedy: "Some sandboxes block outbound traffic. Deploy to Vercel or run locally where the network is open.",
      retryable: true,
    };
  }
  if (text.includes("aborted") || text.includes("timeout") || text.includes("etimedout")) {
    return {
      kind: "timeout",
      message: "The Gemini request timed out.",
      remedy: "Try a shorter question, or retry — long transcripts with thinking enabled take longer.",
      retryable: true,
    };
  }
  return { kind: "unknown", message: raw, retryable: true };
}

/**
 * Ask the model for a two-token answer. Used by `/api/health?deep=1` and the
 * /status page to prove the key works end-to-end, with thinking disabled so it
 * costs roughly nothing against the free quota.
 */
export async function probeGemini(
  options: { model?: string; timeoutMs?: number } = {},
): Promise<
  | { ok: true; model: string; latencyMs: number; reply: string }
  | { ok: false; model: string; failure: GeminiFailure }
> {
  const model = options.model ?? getGeminiModel();
  const timeoutMs = options.timeoutMs ?? 15_000;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model,
      contents: "Reply with exactly: pong",
      config: {
        maxOutputTokens: 2048, // room for the answer; thinking is disabled below
        temperature: 0,
        abortSignal: controller.signal,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    return {
      ok: true,
      model,
      latencyMs: Date.now() - startedAt,
      reply: (response.text ?? "").trim().slice(0, 40) || "(empty response)",
    };
  } catch (error) {
    return { ok: false, model, failure: classifyGeminiError(error) };
  } finally {
    clearTimeout(timer);
  }
}
