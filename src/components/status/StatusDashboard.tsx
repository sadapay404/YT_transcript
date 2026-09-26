"use client";

/**
 * /status — the "is it actually working?" dashboard.
 *
 * Runs `/api/health` (shallow, then deep) and renders each check with the exact
 * failure reason and the fix. Because the report is produced by the *runtime
 * that served the request*, it correctly distinguishes "my code is broken" from
 * "this sandbox has no internet".
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  CircleSlash,
  Cpu,
  ExternalLink,
  Gauge,
  Loader2,
  Play,
  RefreshCw,
  XCircle,
} from "lucide-react";

import type { HealthCheck, HealthReport, HealthStatus } from "@/lib/health";
import { cn } from "@/lib/utils";

type State =
  | { phase: "idle" }
  | { phase: "loading"; deep: boolean }
  | { phase: "ready"; report: HealthReport }
  | { phase: "error"; message: string };

const STATUS_STYLE: Record<
  HealthStatus,
  { icon: React.ReactNode; ring: string; text: string; label: string }
> = {
  pass: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    ring: "border-emerald-500/40 bg-emerald-500/10",
    // Light themes (Zen Paper) need much darker text for contrast.
    text: "text-emerald-700 scheme-dark:text-emerald-300",
    label: "Pass",
  },
  warn: {
    icon: <AlertTriangle className="h-4 w-4" />,
    ring: "border-amber-500/40 bg-amber-500/10",
    text: "text-amber-700 scheme-dark:text-amber-300",
    label: "Attention",
  },
  fail: {
    icon: <XCircle className="h-4 w-4" />,
    ring: "border-rose-500/40 bg-rose-500/10",
    text: "text-rose-700 scheme-dark:text-rose-300",
    label: "Fail",
  },
  skipped: {
    icon: <CircleSlash className="h-4 w-4" />,
    ring: "border-line bg-ink/[0.04]",
    text: "text-ink-faint",
    label: "Skipped",
  },
};

export function StatusDashboard() {
  const [state, setState] = useState<State>({ phase: "idle" });
  const [video, setVideo] = useState("");
  const [copied, setCopied] = useState(false);

  const run = useCallback(
    async (deep: boolean) => {
      setState({ phase: "loading", deep });
      try {
        const params = new URLSearchParams();
        if (deep) params.set("deep", "1");
        if (video.trim()) params.set("video", video.trim());

        const response = await fetch(`/api/health?${params.toString()}`, {
          cache: "no-store",
        });
        const report = (await response.json()) as HealthReport;
        setState({ phase: "ready", report });
      } catch (error) {
        setState({
          phase: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [video],
  );

  // Shallow first (instant feedback), then the deep probes automatically.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await run(false);
      if (!cancelled) await run(true);
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const report = state.phase === "ready" ? state.report : null;
  const loadingDeep = state.phase === "loading" && state.deep;
  const loadingShallow = state.phase === "loading" && !state.deep;

  const headline = useMemo(() => {
    if (!report) return { text: "Running checks…", tone: "text-ink-soft" };
    const warnings = report.checks.filter((check) => check.status === "warn").length;
    if (report.ok && warnings > 0)
      return {
        text: `${warnings} check${warnings === 1 ? "" : "s"} needs attention`,
        tone: "text-amber-700 scheme-dark:text-amber-300",
      };
    if (report.ok)
      return {
        text: "Everything checks out",
        tone: "text-emerald-700 scheme-dark:text-emerald-300",
      };
    const failed = report.checks.filter((c) => c.status === "fail").length;
    return {
      text: `${failed} check${failed === 1 ? "" : "s"} failing`,
      tone: "text-rose-700 scheme-dark:text-rose-300",
    };
  }, [report]);

  const copyReport = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pt-8 pb-20 sm:px-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="chip chip-accent">
            <Gauge className="h-3 w-3" />
            Diagnostics
          </span>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-ink">
            System status
          </h1>
          <p className={cn("mt-1 text-[13px]", headline.tone)}>
            {headline.text}
            {report && (
              <span className="text-ink-faint">
                {" "}
                · {report.deep ? "deep" : "shallow"} probe · v{report.version}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copyReport}
            disabled={!report}
            className="btn h-9 gap-2 border border-line px-3"
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
            {copied ? "Copied" : "Copy report"}
          </button>
          <button
            type="button"
            onClick={() => void run(true)}
            disabled={state.phase === "loading"}
            className="btn btn-primary h-9 gap-2 px-3"
          >
            {loadingDeep ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Re-run
          </button>
        </div>
      </div>

      {/* ── Custom probe target ─────────────────────────────────────────── */}
      <div className="panel mt-5 flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
        <label htmlFor="probe-video" className="text-[12px] font-medium text-ink-soft">
          Probe a specific video
        </label>
        <input
          id="probe-video"
          value={video}
          onChange={(event) => setVideo(event.target.value)}
          placeholder="https://www.youtube.com/watch?v=… (defaults to a known-good test video)"
          className="field h-9 flex-1 py-0 font-mono text-[12px]"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => void run(true)}
          disabled={state.phase === "loading"}
          className="btn btn-outline h-9 gap-2 px-3"
        >
          <Play className="h-3.5 w-3.5" />
          Test it
        </button>
      </div>

      {/* ── Warnings ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {report?.warnings.map((warning) => (
          <motion.div
            key={warning}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-[12.5px] text-amber-800 scheme-dark:text-amber-200"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{warning}</span>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* ── Checks ──────────────────────────────────────────────────────── */}
      <div className="mt-5 flex flex-col gap-2.5">
        {loadingShallow && (
          <div className="panel flex items-center gap-2 p-4 text-[13px] text-ink-soft">
            <Loader2 className="h-4 w-4 animate-spin" /> Contacting the server…
          </div>
        )}

        {state.phase === "error" && (
          <div className="panel border-rose-500/40 p-4 text-[13px] text-rose-800 scheme-dark:text-rose-200">
            Could not load the health report: {state.message}
          </div>
        )}

        {report?.checks.map((check, index) => (
          <CheckCard key={check.id} check={check} index={index} />
        ))}

        {loadingDeep && (
          <div className="panel flex items-center gap-2 p-4 text-[13px] text-ink-soft">
            <Loader2 className="h-4 w-4 animate-spin" />
            Running live probes against YouTube and the Gemini API…
          </div>
        )}
      </div>

      {/* ── Environment ─────────────────────────────────────────────────── */}
      {report && (
        <div className="panel mt-5 p-4">
          <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-ink-faint uppercase">
            <Cpu className="h-3.5 w-3.5" /> Runtime environment
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px] sm:grid-cols-3">
            {[
              ["Host", report.environment.runtime],
              ["Node", report.environment.nodeVersion],
              ["Platform", report.environment.platform],
              ["Region", report.environment.region ?? "n/a"],
              ["NODE_ENV", report.environment.nodeEnv],
              ["Uptime", `${report.uptimeSeconds}s`],
              ["Report mode", report.deep ? "deep" : "shallow"],
              ["Checked at", new Date(report.timestamp).toLocaleTimeString()],
              ["Sandbox detected", report.environment.sandboxLikely ? "yes" : "no"],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="truncate text-[11px] text-ink-faint">{label}</dt>
                <dd className="truncate font-mono text-[12px] text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* ── Making it green ─────────────────────────────────────────────── */}
      <div className="panel mt-5 p-4">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-ink-faint uppercase">
          Making it green
        </p>
        <ol className="mt-3 flex flex-col gap-2.5 text-[12.5px] text-ink-soft">
          <Step n={1}>
            <strong className="text-ink">Gemini key</strong> — create a free key at{" "}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-accent underline decoration-dotted"
            >
              aistudio.google.com/apikey <ExternalLink className="h-3 w-3" />
            </a>{" "}
            and set <code className="kbd">GEMINI_API_KEY</code> in{" "}
            <code className="kbd">.env.local</code>, then restart{" "}
            <code className="kbd">npm run dev</code>.
          </Step>
          <Step n={2}>
            <strong className="text-ink">Captions blocked?</strong> Some cloud IP
            ranges cannot reach YouTube. The studio automatically tries the
            visitor&apos;s browser connection; this server-only check may show
            <strong className="text-ink"> attention</strong> because it cannot borrow that IP.
          </Step>
          <Step n={3}>
            <strong className="text-ink">Want the server rung green?</strong> Set
            an optional <code className="kbd">TRANSCRIPT_PROXY_URL</code> to a
            permitted egress and retry. Browser CORS can still require paste for
            some videos.
          </Step>
          <Step n={4}>
            <strong className="text-ink">From a terminal instead?</strong>{" "}
            <code className="kbd">curl -s &quot;localhost:3000/api/health?deep=1&quot; | jq</code>
          </Step>
        </ol>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-[10px] font-bold text-accent">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

function CheckCard({ check, index }: { check: HealthCheck; index: number }) {
  const style = STATUS_STYLE[check.status];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, type: "spring", stiffness: 340, damping: 30 }}
      className="panel p-3.5"
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
            style.ring,
            style.text,
          )}
        >
          {style.icon}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13.5px] font-semibold text-ink">{check.label}</p>
            <span className={cn("chip !text-[9px]", style.text)}>{style.label}</span>
            {typeof check.latencyMs === "number" && (
              <span className="font-mono text-[10.5px] text-ink-faint">
                {check.latencyMs}ms
              </span>
            )}
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">{check.detail}</p>

          {check.hint && (
            <p className="mt-1.5 rounded-lg border border-line bg-ink/[0.04] px-2.5 py-1.5 text-[12px] leading-relaxed text-ink-soft">
              {check.hint}
            </p>
          )}

          {check.meta && Object.keys(check.meta).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {Object.entries(check.meta).map(([key, value]) => (
                <span key={key} className="font-mono text-[10.5px] text-ink-faint">
                  {key}: <span className="text-ink-soft">{String(value)}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
