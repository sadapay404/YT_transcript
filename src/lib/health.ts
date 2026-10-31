/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Deployment health reporting — server only.
 * ─────────────────────────────────────────────────────────────────────────────
 *  Answers "is it actually working *here*?" for the runtime that is serving the
 *  request. That distinction matters: caption scraping and Gemini calls can be
 *  blocked in a sandbox but fine on Vercel, so the report is explicit about
 *  *where* it ran and *what* was reachable.
 *
 *  Two levels:
 *   • shallow (default) — zero external calls, safe to hit from an uptime
 *     monitor every 30s. Reports config + a deterministic self-test.
 *   • deep (`?deep=1`) — live probes of YouTube captions and the Gemini API.
 */
import packageJson from "../../package.json";

import { APP_NAME, GEMINI } from "@/lib/constants";
import {
  getGeminiFallbackModel,
  getGeminiModel,
  isGeminiConfigured,
  probeGemini,
} from "@/lib/gemini/client";
import { isGroqConfigured } from "@/lib/ai/groq";
import { probeTranscript } from "@/lib/youtube/probe";
import { normalizeSegments } from "@/lib/youtube/normalize";
import { parseYouTubeUrl } from "@/lib/utils";

export const APP_VERSION = (packageJson as { version?: string }).version ?? "0.0.0";

/** Default video for the caption probe: short, popular, reliably captioned. */
export const HEALTH_PROBE_VIDEO = "aircAruvnKk";

export type HealthStatus = "pass" | "warn" | "fail" | "skipped";

export interface HealthCheck {
  id: string;
  label: string;
  status: HealthStatus;
  /** One-line, human-readable result. */
  detail: string;
  /** What to do about it — only present when something is off. */
  hint?: string;
  latencyMs?: number;
  meta?: Record<string, string | number | boolean>;
}

export interface HealthReport {
  ok: boolean;
  app: string;
  version: string;
  deep: boolean;
  timestamp: string;
  uptimeSeconds: number;
  environment: {
    nodeEnv: string;
    nodeVersion: string;
    platform: string;
    /** Vercel/AWS region, when available. */
    region: string | null;
    runtime: "vercel" | "netlify" | "cloudflare" | "local" | "unknown";
    /** True when outbound HTTPS is likely restricted (heuristic for sandboxes). */
    sandboxLikely: boolean;
    /** Which deployment this is (Vercel only) — scope of its env vars. */
    deployment: DeploymentContext;
  };
  checks: HealthCheck[];
  warnings: string[];
  /** Ready-to-copy diagnostics blob for bug reports. */
  summary: string;
}

/* ───────────────────────────── config checks ────────────────────────────── */

function detectRuntime(): HealthReport["environment"]["runtime"] {
  if (process.env.VERCEL) return "vercel";
  if (process.env.NETLIFY) return "netlify";
  if (process.env.CF_PAGES) return "cloudflare";
  if (process.env.NODE_ENV === "development") return "local";
  return process.env.NODE_ENV === "production" ? "unknown" : "local";
}

/**
 * Best-effort guess that we're inside a restricted sandbox. Used only to
 * phrase the hints kindly — a failure here is not treated as a fault.
 */
function detectSandbox(): boolean {
  if (process.env.VERCEL || process.env.NETLIFY || process.env.CF_PAGES) return false;
  // Arena/E2B sandboxes and GitHub Codespaces export identifiable markers.
  return Boolean(
    process.env.E2B_SANDBOX_ID ||
      process.env.ARENA_SANDBOX ||
      process.env.CODESPACES ||
      process.env.GITPOD_WORKSPACE_ID,
  );
}

/**
 * Where is this build actually running?
 *
 * Vercel bakes the environment into each deployment: a variable scoped to
 * *Production* is simply not present in a *Preview* deployment. Without that
 * context a missing key looks like a mystery, so the report carries it.
 */
export interface DeploymentContext {
  /** `production` | `preview` | `development` on Vercel, else null. */
  vercelEnv: string | null;
  /** Branch (or tag) the deployment was built from. */
  commitRef: string | null;
  /** Short commit SHA the deployment was built from. */
  commitSha: string | null;
  /** The deployment's own hostname. */
  url: string | null;
  deploymentId: string | null;
}

export function readDeploymentContext(
  env: Record<string, string | undefined> = process.env,
): DeploymentContext {
  return {
    vercelEnv: env.VERCEL_ENV?.trim() || null,
    commitRef: env.VERCEL_GIT_COMMIT_REF?.trim() || null,
    commitSha: env.VERCEL_GIT_COMMIT_SHA?.trim().slice(0, 7) || null,
    url: env.VERCEL_URL?.trim() || null,
    deploymentId: env.VERCEL_DEPLOYMENT_ID?.trim() || null,
  };
}

/**
 * Why isn't GEMINI_API_KEY visible here, and what exactly fixes it?
 *
 * The single most common cause is not a typo — it is scope. Vercel only
 * injects a variable into the environments you selected, and only into
 * deployments created *after* you saved it. Both facts are invisible from the
 * outside, which is why this explains the specific case rather than saying
 * "the key is not set".
 */
export function geminiKeyHint(deployment: DeploymentContext): string {
  switch (deployment.vercelEnv) {
    case "preview":
      return (
        "This is a Preview deployment. Variables scoped to Production are not " +
        "passed to Preview deployments — set GEMINI_API_KEY for Preview (or All " +
        "Environments) in Vercel, then Redeploy: environment changes only reach " +
        "deployments created after you save them."
      );
    case "production":
      return (
        "This is the Production deployment. Set GEMINI_API_KEY for Production, " +
        "then Redeploy — Vercel bakes the environment into each deployment, so a " +
        "deployment keeps whatever it was built with."
      );
    case "development":
      return (
        "Add GEMINI_API_KEY to .env.local (or run `vercel env pull`), then restart " +
        "the dev server."
      );
    default:
      return (
        "Add GEMINI_API_KEY to .env.local locally, or to your host's environment " +
        "variables, then redeploy/restart so the running process picks it up."
      );
  }
}

function configCheck(): HealthCheck {
  const configured = isGeminiConfigured();
  const deployment = readDeploymentContext();
  return {
    id: "gemini-key",
    label: "Gemini API key",
    status: configured ? "pass" : "warn",
    detail: configured
      ? `Configured — model "${getGeminiModel()}" (fallback "${getGeminiFallbackModel()}")`
      : "GEMINI_API_KEY is not set, so the AI sidebar (Steps 4–5) is disabled.",
    ...(configured
      ? {}
      : {
          hint:
            "Get a free key at https://aistudio.google.com/apikey. " +
            geminiKeyHint(deployment),
        }),
    meta: {
      model: getGeminiModel(),
      fallbackModel: getGeminiFallbackModel(),
      demoMode: process.env.TRANSTUDIO_DEMO_MODE === "1",
      transcriptProxy: Boolean(process.env.TRANSCRIPT_PROXY_URL),
      contextLimitChars: GEMINI.maxContextCharacters,
      ...(deployment.vercelEnv ? { vercelEnv: deployment.vercelEnv } : {}),
      ...(deployment.commitRef ? { deployedRef: deployment.commitRef } : {}),
      ...(deployment.commitSha ? { deployedSha: deployment.commitSha } : {}),
    },
  };
}

/** Optional free backup provider — never a failure when it is absent. */
function groqConfigCheck(): HealthCheck {
  const configured = isGroqConfigured();
  return {
    id: "groq-key",
    label: "Groq backup (optional)",
    status: configured ? "pass" : "skipped",
    detail: configured
      ? "Configured — NexAI falls back to Groq when Gemini is busy or unavailable."
      : "GROQ_API_KEY is not set — NexAI uses Gemini only.",
    ...(configured
      ? {}
      : {
          hint:
            "Optional: add GROQ_API_KEY (free, no card) where GEMINI_API_KEY lives, then redeploy/restart.",
        }),
  };
}

/**
 * Deterministic self-test of the timestamp normaliser. This runs the exact
 * shipped code path against known fixtures, so a broken bundle or a bad
 * refactor shows up in the health report instead of in the transcript UI.
 */
function normalizerCheck(): HealthCheck {
  const milliseconds = [
    { text: "one", offset: 0, duration: 2000 },
    { text: "two", offset: 2000, duration: 2000 },
    { text: "three", offset: 4000, duration: 1500 },
  ];
  const seconds = [
    { text: "one", offset: 0, duration: 2 },
    { text: "two", offset: 2, duration: 2 },
    { text: "three", offset: 4, duration: 1.5 },
  ];

  const fromMs = normalizeSegments(milliseconds);
  const fromSeconds = normalizeSegments(seconds);
  const matches =
    JSON.stringify(fromMs.segments) === JSON.stringify(fromSeconds.segments);
  const duration = fromMs.durationSeconds;

  return {
    id: "timestamp-normalizer",
    label: "Timestamp normalizer",
    status: matches && Math.abs(duration - 5.5) < 0.001 ? "pass" : "fail",
    detail:
      matches && Math.abs(duration - 5.5) < 0.001
        ? "Millisecond and second caption payloads normalise identically (5.5s total)."
        : `Mismatch: ms→${fromMs.unit}/${duration}s, s→${fromSeconds.unit}/${fromSeconds.durationSeconds}s.`,
    ...(matches
      ? {}
      : {
          hint: "The caption normaliser is producing different results for the two upstream formats — a regression in src/lib/youtube/normalize.ts.",
        }),
    meta: { detectedMs: fromMs.unit, detectedSeconds: fromSeconds.unit },
  };
}

function appShellCheck(): HealthCheck {
  const runtime = detectRuntime();
  return {
    id: "app-shell",
    label: "App shell & routing",
    status: "pass",
    detail: `Serving ${APP_NAME} v${APP_VERSION} on ${runtime} (Node ${process.version}).`,
    meta: { runtime, version: APP_VERSION },
  };
}

/* ────────────────────────────── deep checks ─────────────────────────────── */

async function geminiApiCheck(): Promise<HealthCheck> {
  if (!isGeminiConfigured()) {
    return {
      id: "gemini-api",
      label: "Gemini API reachability",
      status: "skipped",
      detail: "Skipped — no API key configured.",
      hint: "Set GEMINI_API_KEY and run the deep check again.",
    };
  }

  const result = await probeGemini();
  if (result.ok) {
    const switched = result.switched
      ? ` Switched from "${result.requestedModel}" — Google refused that model for this account.`
      : "";
    return {
      id: "gemini-api",
      label: "Gemini API reachability",
      status: "pass",
      detail: `Answered in ${result.latencyMs}ms — model "${result.model}" replied "${result.reply}".${switched}`,
      latencyMs: result.latencyMs,
      meta: {
        model: result.model,
        requestedModel: result.requestedModel,
        switched: result.switched,
        reply: result.reply,
      },
    };
  }

  return {
    id: "gemini-api",
    label: "Gemini API reachability",
    status: "fail",
    detail: `${result.failure.kind}: ${result.failure.message}`,
    ...(result.failure.remedy ? { hint: result.failure.remedy } : {}),
    meta: {
      model: result.model,
      requestedModel: result.requestedModel,
      retryable: result.failure.retryable,
      attempts: result.attempts.map((attempt) => attempt.model).join(", "),
    },
  };
}

async function captionsCheck(video: string): Promise<HealthCheck> {
  const result = await probeTranscript(video);

  if (result.ok) {
    return {
      id: "youtube-captions",
      label: "YouTube caption scraping",
      status: "pass",
      detail: `Fetched ${result.segmentCount} caption lines${
        result.language ? ` (${result.language})` : ""
      } in ${result.latencyMs}ms via ${result.strategy ?? "the caption API"}.`,
      latencyMs: result.latencyMs,
      meta: {
        videoId: result.videoId,
        segmentCount: result.segmentCount,
        timeUnit: result.timeUnit ?? "unknown",
        durationSeconds: Math.round(result.durationSeconds ?? 0),
        ...(result.strategy ? { strategy: result.strategy } : {}),
        ...(result.format ? { format: result.format } : {}),
        ...(result.sample ? { sample: result.sample.slice(0, 120) } : {}),
        // Which identities were tried before this one succeeded — the whole
        // point of the ladder is that a blocked identity is not a dead end.
        attempted: result.diagnostics.length,
        ...(result.diagnostics.length > 0
          ? { attempts: result.diagnostics.join(" · ").slice(0, 600) }
          : {}),
      },
    };
  }

  const probeVideoId = parseYouTubeUrl(video)?.videoId;
  const serverError = result.error;
  const serverOnlyFailure =
    probeVideoId === HEALTH_PROBE_VIDEO &&
    serverError &&
    ["blocked", "empty", "network", "not-found", "too-many-requests"].includes(
      serverError.code,
    );

  if (serverOnlyFailure && serverError) {
    return {
      id: "youtube-captions",
      label: "YouTube caption scraping",
      status: "warn",
      detail:
        `The server runtime could not read the known-good probe (${serverError.code}: ` +
        `${serverError.message}), so the app will use the visitor-browser fallback.`,
      hint:
        "This server check cannot borrow a visitor's IP. The app tries the visitor connection automatically; CORS, private videos and ordinary network failures can still require paste.",
      latencyMs: result.latencyMs,
      meta: {
        videoId: result.videoId || video,
        requested: video,
        serverFallback: "visitor-browser",
        ...(result.strategy ? { strategy: result.strategy } : {}),
        attempted: result.diagnostics.length,
        ...(result.diagnostics.length > 0
          ? { attempts: result.diagnostics.join(" · ").slice(0, 600) }
          : {}),
      },
    };
  }

  return {
    id: "youtube-captions",
    label: "YouTube caption scraping",
    status: "fail",
    detail: result.error
      ? `${result.error.code}: ${result.error.message}`
      : "Unknown failure.",
    ...(result.error?.hint ? { hint: result.error.hint } : {}),
    latencyMs: result.latencyMs,
    meta: {
      videoId: result.videoId || video,
      requested: video,
      ...(result.strategy ? { strategy: result.strategy } : {}),
      attempted: result.diagnostics.length,
      ...(result.diagnostics.length > 0
        ? { attempts: result.diagnostics.join(" · ").slice(0, 600) }
        : {}),
    },
  };
}

/* ───────────────────────────── report builder ───────────────────────────── */

export interface BuildHealthOptions {
  deep?: boolean;
  /** Video URL or id used for the caption probe. */
  video?: string;
}

export async function buildHealthReport(
  options: BuildHealthOptions = {},
): Promise<HealthReport> {
  const deep = options.deep ?? false;
  const video = options.video?.trim() || HEALTH_PROBE_VIDEO;

  const checks: HealthCheck[] = [
    appShellCheck(),
    configCheck(),
    groqConfigCheck(),
    normalizerCheck(),
  ];

  if (deep) {
    // Run both network probes concurrently — they are independent and slow.
    const [captions, gemini] = await Promise.all([
      captionsCheck(video),
      geminiApiCheck(),
    ]);
    checks.push(captions, gemini);
  }

  const warnings: string[] = [];
  const sandboxLikely = detectSandbox();

  if (!isGeminiConfigured()) {
    const deployment = readDeploymentContext();
    warnings.push(
      `GEMINI_API_KEY is not configured for this deployment${
        deployment.vercelEnv ? ` (Vercel env: ${deployment.vercelEnv})` : ""
      } — AI features are disabled. ${geminiKeyHint(deployment)}`,
    );
  }
  for (const check of checks) {
    if (check.status === "fail" && sandboxLikely) {
      warnings.push(
        "A probe failed while running inside a restricted sandbox — external network calls are usually blocked there. Re-check locally or on your deploy host.",
      );
      break;
    }
  }

  const failures = checks.filter((check) => check.status === "fail");
  const ok = failures.length === 0;

  const environment: HealthReport["environment"] = {
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    nodeVersion: process.version,
    platform: process.platform,
    region:
      process.env.VERCEL_REGION ?? process.env.AWS_REGION ?? process.env.FLY_REGION ?? null,
    runtime: detectRuntime(),
    sandboxLikely,
    deployment: readDeploymentContext(),
  };

  return {
    ok,
    app: APP_NAME,
    version: APP_VERSION,
    deep,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    environment,
    checks,
    warnings,
    summary: buildSummary(checks, environment, deep),
  };
}

/** Compact text blob the /status page can copy into a bug report. */
function buildSummary(
  checks: HealthCheck[],
  environment: HealthReport["environment"],
  deep: boolean,
): string {
  return [
    `${APP_NAME} v${APP_VERSION} health report`,
    `when: ${new Date().toISOString()}`,
    `runtime: ${environment.runtime} / node ${environment.nodeVersion} / ${environment.platform}`,
    `region: ${environment.region ?? "n/a"} / env: ${environment.nodeEnv}`,
    `mode: ${deep ? "deep" : "shallow"}`,
    "",
    ...checks.map(
      (check) =>
        `[${check.status.toUpperCase().padEnd(7)}] ${check.label} — ${check.detail}`,
    ),
  ].join("\n");
}

/** HTTP status for the health endpoint (monitor-friendly). */
export function statusCodeFor(report: HealthReport): number {
  if (!report.deep) return 200;
  const core = report.checks.filter(
    (check) => check.id === "youtube-captions" || check.id === "gemini-api",
  );
  const hardFailures = core.filter(
    (check) => check.status === "fail" && !report.environment.sandboxLikely,
  );
  if (core.length > 0 && hardFailures.length === core.length) return 503;
  return 200;
}
