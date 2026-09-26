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

/**
 * The model the environment asks for (env override → project default). This is
 * a *preference*: Google may refuse it for a given account.
 */
export function getConfiguredGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || GEMINI.defaultModel;
}

/**
 * The model that actually answered most recently.
 *
 * Google retires models for new accounts while leaving them working for older
 * ones (live example: `gemini-2.5-flash` answering 404 — "no longer available
 * to new users — use models/gemini-3.8-flash"). Rather than failing until
 * someone edits an env var, the first successful call records the model here
 * and every later call starts from it.
 */
let discoveredModel: string | null = null;
/** A model stays in the candidate list, but moves behind the working model after a refusal. */
const refusedModels = new Set<string>();

/** Remember a model that completed a request, including streaming requests. */
export function rememberGeminiModel(model: string): void {
  const normalized = model.trim();
  if (!normalized) return;
  discoveredModel = normalized;
  refusedModels.delete(normalized);
}

/** Record only a model-level refusal; quota and transport failures never call this. */
export function markGeminiModelUnavailable(model: string): void {
  const normalized = model.trim();
  if (normalized) refusedModels.add(normalized);
}

/**
 * Resolved model id. An explicit GEMINI_MODEL leads until this process observes
 * a model-level refusal; after that the best-known-good model gets the first
 * attempt while the explicit pin remains as a later fallback. That makes an
 * operator's pin recoverable without burning a 404 on every request.
 */
export function getGeminiModel(): string {
  const configured = process.env.GEMINI_MODEL?.trim();
  if (configured && !refusedModels.has(configured)) return configured;
  if (discoveredModel && !refusedModels.has(discoveredModel))
    return discoveredModel;
  return process.env.GEMINI_MODEL?.trim()
    ? getGeminiFallbackModel()
    : GEMINI.defaultModel;
}

/** What the last successful call used, if the fallback logic has run. */
export function getDiscoveredGeminiModel(): string | null {
  return discoveredModel;
}

/** Test seam: forget a runtime discovery. */
export function resetDiscoveredGeminiModel(): void {
  discoveredModel = null;
  refusedModels.clear();
}

export function getGeminiFallbackModel(): string {
  return process.env.GEMINI_FALLBACK_MODEL?.trim() || GEMINI.fallbackModel;
}

/**
 * Pull a replacement model name out of Google's error text, e.g.
 * `…please update your code to use models/gemini-3.8-flash …`.
 * Google knows which model this account should use; believing it beats
 * guessing from a hardcoded list.
 */
export function extractRecommendedModel(message: string): string | null {
  const patterns = [
    /use\s+models\/([\w.\-]+)/i,
    /use\s+model\s+([\w.\-]+)/i,
    /models\/([\w.\-]+)\s+instead/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1] && match[1] !== "models") return match[1];
  }
  return null;
}

/**
 * Candidate order is discovery-aware. A fresh process starts with the explicit
 * preference; once a model has answered, later calls start there. A refused
 * explicit pin is deliberately retained later in the list rather than erased,
 * so changing the account or model availability can recover without a restart.
 */
export function modelCandidates(): string[] {
  const explicit = process.env.GEMINI_MODEL?.trim() || null;
  const configured = getConfiguredGeminiModel();
  const staticCandidates = [
    configured,
    // The lite model is the intentional high-demand backstop; speculative
    // model names stay behind it and are only useful after a model-level 404.
    getGeminiFallbackModel(),
    ...GEMINI.modelFallbacks,
  ];
  const first =
    explicit && !refusedModels.has(explicit)
      ? explicit
      : !explicit && discoveredModel && !refusedModels.has(discoveredModel)
        ? discoveredModel
        : explicit &&
            refusedModels.has(explicit) &&
            discoveredModel &&
            !refusedModels.has(discoveredModel)
          ? discoveredModel
          : configured && !refusedModels.has(configured)
            ? configured
            : getGeminiFallbackModel();

  return [...new Set([first, ...staticCandidates].filter(Boolean))];
}

/** Put Google's suggested replacement at the front of a pending model queue. */
export function queueSuggestion(
  queue: string[],
  suggestion: string | null | undefined,
): void {
  const model = suggestion?.trim();
  if (!model) return;
  const existingIndex = queue.indexOf(model);
  if (existingIndex >= 0) queue.splice(existingIndex, 1);
  queue.unshift(model);
}

/**
 * The single SDK entry point. Throws a *friendly* error when unconfigured so
 * the message can be surfaced verbatim in the UI.
 */
export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiConfigError("Gemini is not configured on this installation.");
  }

  // Optional endpoint override: a regional endpoint, a self-hosted gateway, or
  // a local stub in tests. Unset means Google's default.
  const baseUrl = process.env.GEMINI_BASE_URL?.trim();
  return new GoogleGenAI({
    apiKey,
    ...(baseUrl ? { httpOptions: { baseUrl } } : {}),
  });
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
    | "temporarily-unavailable"
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
      remedy: "Add GEMINI_API_KEY to the app environment to enable the Assistant.",
      retryable: false,
    };
  }

  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "object"
        ? JSON.stringify(error) || String(error)
        : String(error);
  // Keep both the original spelling and a separator-normalised copy, so
  // `"status":"NOT_FOUND"`, `not-found` and `not_found` match the same rule,
  // without hiding `api_key_invalid` / `resource_exhausted` from the checks
  // that still look for those spellings.
  const lower = raw.toLowerCase();
  const text = `${lower}\n${lower.replace(/[_-]+/g, " ")}`;

  if (
    text.includes("api key not valid") ||
    text.includes("api_key_invalid") ||
    text.includes("invalid api key")
  ) {
    return {
      kind: "invalid-key",
      message: "That Gemini API key was rejected.",
      remedy:
        "Double-check the key value (no quotes or spaces) — or generate a fresh one at aistudio.google.com/apikey.",
      retryable: false,
    };
  }
  if (
    text.includes("quota") ||
    text.includes("429") ||
    text.includes("resource_exhausted")
  ) {
    return {
      kind: "quota",
      message: "Gemini free-tier quota reached for now.",
      remedy:
        "Wait a minute, then use Retry assistant. A different model may have separate availability.",
      retryable: true,
    };
  }
  if (
    text.includes("does not exist") ||
    text.includes("not found") ||
    text.includes("no longer available") ||
    text.includes("unsupported model")
  ) {
    const recommended = extractRecommendedModel(raw);
    return {
      kind: "model-unavailable",
      message: recommended
        ? `That model isn't available to this account. Google suggests "${recommended}".`
        : "That model isn't available to this account.",
      remedy: recommended
        ? `Set GEMINI_MODEL=${recommended} for a permanent fix, or just retry — the app switches automatically and remembers what worked.`
        : "Set GEMINI_MODEL to a model your account can use (aistudio.google.com has the list).",
      retryable: false,
    };
  }
  // Google uses 503 UNAVAILABLE for short demand spikes. Treat it as a
  // bounded, recoverable service condition: the caller may retry once and then
  // try another configured model, but it must never expose Google's JSON blob.
  if (
    text.includes("503") ||
    text.includes("unavailable") ||
    text.includes("high demand") ||
    text.includes("temporarily busy") ||
    text.includes("overloaded") ||
    text.includes("service unavailable")
  ) {
    return {
      kind: "temporarily-unavailable",
      message: "Gemini is temporarily busy right now.",
      remedy:
        "The app retried other Gemini models automatically. Wait a moment and choose Retry assistant.",
      retryable: true,
    };
  }
  if (
    text.includes("safety") ||
    text.includes("blocked") ||
    text.includes("finish_reason")
  ) {
    return {
      kind: "blocked",
      message: "The model refused this request (safety filter).",
      remedy:
        "Rephrase the prompt or ask about a different part of the transcript.",
      retryable: false,
    };
  }
  if (
    text.includes("fetch failed") ||
    text.includes("enotfound") ||
    text.includes("econnrefused") ||
    text.includes("network")
  ) {
    return {
      kind: "network",
      message: "Could not reach the Gemini API from this server.",
      remedy:
        "Some sandboxes block outbound traffic. Deploy to Vercel or run locally where the network is open.",
      retryable: true,
    };
  }
  if (
    text.includes("aborted") ||
    text.includes("timeout") ||
    text.includes("etimedout")
  ) {
    return {
      kind: "timeout",
      message: "The Gemini request timed out.",
      remedy:
        "Try a shorter question, or retry — long transcripts with thinking enabled take longer.",
      retryable: true,
    };
  }
  // Provider exceptions can contain request ids, URLs, or raw JSON. Keep those
  // in server logs/debuggers only; the Assistant should always have a calm next
  // step instead of printing an opaque provider payload.
  return {
    kind: "unknown",
    message: "Gemini could not complete that request.",
    remedy:
      "Wait a moment and choose Retry assistant. If it keeps happening, run diagnostics.",
    retryable: true,
  };
}

/** One attempt in a fallback run. */
export interface ModelAttempt {
  model: string;
  ok: boolean;
  failure?: GeminiFailure;
  /** Model Google's error told us to use instead, when it said so. */
  recommended?: string | null;
}

export type ModelRunResult<T> =
  | { ok: true; value: T; model: string; attempts: ModelAttempt[] }
  | {
      ok: false;
      failure: GeminiFailure;
      model: string;
      attempts: ModelAttempt[];
    };

/**
 * Call the API, rotating models only when the failure is *about the model*.
 *
 * A quota error, a bad key or a network blip must not trigger a silent model
 * change — that would disguise the real problem and burn quota on repeats. A
 * "model unavailable" answer is the one case where a different name is the fix,
 * and Google usually names it, so that name is queued ahead of the backstop
 * list. The winner is remembered for the rest of the process.
 */
export async function runWithModelFallback<T>(
  call: (model: string) => Promise<T>,
  options: {
    candidates?: string[];
    /** Total provider calls, including the one bounded transient retry. */
    maxAttempts?: number;
    /** Delay before retrying a temporary 503 on the same model. */
    transientRetryDelayMs?: number;
  } = {},
): Promise<ModelRunResult<T>> {
  // De-duplicate defensively: the caller's list comes from env vars and a
  // hardcoded backstop, and a repeated name would mean two identical calls —
  // wasted quota against a free tier. Four calls is a hard ceiling for one
  // user action, so a provider spike cannot turn into a long spinner.
  const queue = [
    ...new Set((options.candidates ?? modelCandidates()).filter(Boolean)),
  ];
  const attempts: ModelAttempt[] = [];
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 4));
  const retryDelayMs = Math.max(
    0,
    Math.floor(options.transientRetryDelayMs ?? 350),
  );
  const retriedTemporarily = new Set<string>();

  while (queue.length > 0 && attempts.length < maxAttempts) {
    const model = queue.shift() as string;
    try {
      const value = await call(model);
      rememberGeminiModel(model);
      attempts.push({ model, ok: true });
      return { ok: true, value, model, attempts };
    } catch (error) {
      const failure = classifyGeminiError(error);
      const recommended =
        failure.kind === "model-unavailable"
          ? extractRecommendedModel(
              error instanceof Error ? error.message : String(error),
            )
          : null;
      attempts.push({
        model,
        ok: false,
        failure,
        ...(recommended ? { recommended } : {}),
      });

      if (failure.kind === "temporarily-unavailable" || failure.kind === "timeout") {
        // A single same-model retry catches a short 503 spike or a stalled
        // request. If it still fails, the normal queue supplies a bounded
        // model fallback.
        if (!retriedTemporarily.has(model) && attempts.length < maxAttempts) {
          retriedTemporarily.add(model);
          await wait(retryDelayMs);
          queue.unshift(model);
        }
        continue;
      }

      if (failure.kind !== "model-unavailable") {
        return { ok: false, failure, model, attempts };
      }

      markGeminiModelUnavailable(model);
      // Believe Google's suggestion before our own list, and never retry a
      // name we have already burned.
      const tried = new Set(attempts.map((attempt) => attempt.model));
      if (recommended && !tried.has(recommended)) {
        queueSuggestion(queue, recommended);
      }
    }
  }

  const last = attempts.at(-1);
  return {
    ok: false,
    model: last?.model ?? "",
    failure:
      last?.failure ??
      classifyGeminiError(
        new Error("No Gemini model candidates were available."),
      ),
    attempts,
  };
}

function wait(milliseconds: number): Promise<void> {
  return milliseconds > 0
    ? new Promise((resolve) => setTimeout(resolve, milliseconds))
    : Promise.resolve();
}

/**
 * Ask the model for a two-token answer. Used by `/api/health?deep=1` and the
 * /status page to prove the key works end-to-end, with thinking disabled so it
 * costs roughly nothing against the free quota.
 *
 * Rotates models if Google refuses the configured one, and reports which model
 * actually answered — a green tick on a model you did not configure should be
 * visible, not hidden.
 */
export async function probeGemini(
  options: { model?: string; timeoutMs?: number } = {},
): Promise<
  | {
      ok: true;
      model: string;
      requestedModel: string;
      switched: boolean;
      attempts: ModelAttempt[];
      latencyMs: number;
      reply: string;
    }
  | {
      ok: false;
      model: string;
      requestedModel: string;
      attempts: ModelAttempt[];
      failure: GeminiFailure;
    }
> {
  /** The preference: env override, else the project default. What we report against. */
  const requestedModel = options.model ?? getConfiguredGeminiModel();
  /**
   * Where this call actually starts. If a previous call discovered that the
   * preference is refused, it starts there instead — otherwise every probe would
   * re-burn free-tier quota rediscovering the same 404.
   */
  const startModel = options.model ?? getGeminiModel();
  const timeoutMs = options.timeoutMs ?? 15_000;
  const startedAt = Date.now();

  const run = await runWithModelFallback(
    async (model) => {
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
        return (response.text ?? "").trim().slice(0, 40) || "(empty response)";
      } finally {
        clearTimeout(timer);
      }
    },
    // Start from the best-known model, then this project's known-good list.
    {
      candidates: [
        startModel,
        ...modelCandidates().filter((m) => m !== startModel),
      ],
    },
  );

  if (!run.ok) {
    return {
      ok: false,
      model: run.model,
      requestedModel,
      attempts: run.attempts,
      failure: run.failure,
    };
  }

  return {
    ok: true,
    model: run.model,
    requestedModel,
    /**
     * True when the model in use is not the configured preference — i.e. Google
     * refuses what this project asks for. Deliberately *stable* across calls
     * (not "did we rotate just now"), because that is the state worth warning
     * about and pinning with GEMINI_MODEL.
     */
    switched: run.model !== requestedModel,
    attempts: run.attempts,
    latencyMs: Date.now() - startedAt,
    reply: run.value,
  };
}
