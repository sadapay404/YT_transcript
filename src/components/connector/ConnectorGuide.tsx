"use client";

/**
 * /connector — what the TranStudio Connector is, whether it is installed in
 * this browser, and how to add it (Chrome, Edge, Firefox).
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

import { CONNECTOR_DOWNLOAD_PATH } from "@/lib/connector/client";
import { cn } from "@/lib/utils";
import { useConnectorStore } from "@/stores/useConnectorStore";

type BrowserId = "chrome" | "edge" | "firefox";

const BROWSERS: Array<{ id: BrowserId; label: string }> = [
  { id: "chrome", label: "Chrome · Brave · Opera" },
  { id: "edge", label: "Microsoft Edge" },
  { id: "firefox", label: "Firefox" },
];

function detectBrowser(userAgent: string): BrowserId {
  if (/Firefox\//.test(userAgent)) return "firefox";
  if (/Edg\//.test(userAgent)) return "edge";
  return "chrome";
}

const noopSubscribe = () => () => {};

const STEPS: Record<BrowserId, Array<React.ReactNode>> = {
  chrome: [
    <>Download the Connector and <b>extract the zip</b> (right-click, then Extract All). Keep that folder; the browser loads the add-on from it.</>,
    <>Open <code>chrome://extensions</code> in a new tab.</>,
    <>Turn on <b>Developer mode</b> (top-right switch).</>,
    <>Click <b>Load unpacked</b> and choose the extracted folder.</>,
    <>Come back here and press <b>Check again</b>. That&apos;s it.</>,
  ],
  edge: [
    <>Download the Connector and <b>extract the zip</b> (right-click, then Extract All). Keep that folder; the browser loads the add-on from it.</>,
    <>Open <code>edge://extensions</code> in a new tab.</>,
    <>Turn on <b>Developer mode</b> (left sidebar).</>,
    <>Click <b>Load unpacked</b> and choose the extracted folder.</>,
    <>Come back here and press <b>Check again</b>. That&apos;s it.</>,
  ],
  firefox: [
    <>Download the Connector and <b>extract the zip</b>.</>,
    <>Open <code>about:debugging#/runtime/this-firefox</code> in a new tab.</>,
    <>Click <b>Load Temporary Add-on…</b> and pick <code>manifest.json</code> inside the extracted folder.</>,
    <>Come back here and press <b>Check again</b>.</>,
    <>Firefox removes temporary add-ons when it restarts. For a permanent install, ask Mubashir for the signed Firefox version.</>,
  ],
};

export function ConnectorGuide() {
  const status = useConnectorStore((s) => s.status);
  const version = useConnectorStore((s) => s.version);
  const check = useConnectorStore((s) => s.check);

  const detected = useSyncExternalStore(
    noopSubscribe,
    () => detectBrowser(navigator.userAgent),
    () => "chrome" as BrowserId,
  );
  const [picked, setPicked] = useState<BrowserId | null>(null);
  const browser = picked ?? detected;

  useEffect(() => {
    void check(true);
  }, [check]);

  const installed = status === "installed";
  const checking = status === "checking" || status === "unknown";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-20 sm:px-6" data-connector-guide>
      <div className="mb-4">
        <Link href="/" className="btn h-8 gap-1.5 border border-line px-2.5 text-[11.5px]">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to TranStudio
        </Link>
      </div>

      <span className="chip chip-accent">
        <PlugZap className="h-3 w-3" />
        Free add-on
      </span>
      <h1 className="mt-3 text-3xl font-black tracking-tight text-ink">TranStudio Connector</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-soft">
        YouTube blocks caption requests from cloud servers, the hosted site included. The Connector is a tiny
        browser add-on that fetches captions over <b className="text-ink">your own internet connection</b>, the
        same way the desktop app does. It&apos;s free, and there&apos;s no account or key to set up.
      </p>

      {/* ── Status ─────────────────────────────────────────────────────── */}
      <div
        data-connector-status={status}
        className={cn(
          "panel mt-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between",
          installed && "border-emerald-500/40",
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
              installed
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 scheme-dark:text-emerald-300"
                : "border-line bg-ink/[0.04] text-ink-soft",
            )}
          >
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : installed ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <PlugZap className="h-4 w-4" />
            )}
          </span>
          <div>
            <p className="text-[14px] font-semibold text-ink">
              {checking
                ? "Checking this browser…"
                : installed
                  ? `Installed · v${version} · you're all set`
                  : "Not installed in this browser yet"}
            </p>
            <p className="text-[12px] text-ink-faint">
              {installed
                ? "Paste any YouTube link on the home page. Captions now come from your connection."
                : "Takes about a minute. The steps for your browser are below."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap">
          {!installed && (
            <a
              href={CONNECTOR_DOWNLOAD_PATH}
              download="transtudio-connector.zip"
              data-connector-download
              className="btn btn-primary h-9 gap-2 px-3"
            >
              <Download className="h-3.5 w-3.5" />
              Download Connector
            </a>
          )}
          <button
            type="button"
            onClick={() => void check(true)}
            disabled={status === "checking"}
            className="btn h-9 gap-2 border border-line px-3"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", status === "checking" && "animate-spin")} />
            Check again
          </button>
          {installed && (
            <Link href="/" className="btn btn-primary h-9 gap-2 px-3">
              Open TranStudio
            </Link>
          )}
        </div>
      </div>

      {/* ── Install steps ──────────────────────────────────────────────── */}
      <section className="panel mt-4 p-4 sm:p-5">
        <h2 className="text-[15px] font-semibold text-ink">Install in 1 minute</h2>
        <div role="tablist" aria-label="Your browser" className="mt-3 flex flex-wrap gap-1.5">
          {BROWSERS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={browser === option.id}
              onClick={() => setPicked(option.id)}
              className={cn(
                "btn h-8 border px-3 text-[12px]",
                browser === option.id
                  ? "border-accent/50 bg-accent/10 font-semibold text-accent"
                  : "border-line text-ink-soft",
              )}
            >
              {option.label}
              {detected === option.id && <span className="ml-1 text-[10.5px] text-ink-faint">(this browser)</span>}
            </button>
          ))}
        </div>
        <ol className="mt-4 flex flex-col gap-2.5">
          {STEPS[browser].map((step, index) => (
            <li key={index} className="flex gap-3 text-[13px] leading-relaxed text-ink-soft">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line bg-ink/[0.04] font-mono text-[11px] text-ink">
                {index + 1}
              </span>
              <span className="pt-0.5 [&_b]:text-ink [&_code]:rounded [&_code]:bg-ink/[0.06] [&_code]:px-1 [&_code]:font-mono [&_code]:text-[12px]">
                {step}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Trust ──────────────────────────────────────────────────────── */}
      <section className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="panel p-4">
          <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
            <ShieldCheck className="h-4 w-4 text-accent" />
            What it can do
          </h3>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[12.5px] leading-relaxed text-ink-soft">
            <li>Read three public YouTube endpoints: the player, captions and the watch page.</li>
            <li>Work only on TranStudio pages, and only when you load a video.</li>
          </ul>
        </div>
        <div className="panel p-4">
          <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
            <ShieldCheck className="h-4 w-4 text-accent" />
            What it never does
          </h3>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[12.5px] leading-relaxed text-ink-soft">
            <li>Send your YouTube cookies or touch your Google account.</li>
            <li>Visit any other site, store history, or collect data.</li>
          </ul>
        </div>
      </section>

      <p className="mt-4 flex items-start gap-2 text-[12px] leading-relaxed text-ink-faint">
        <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        On a phone, most browsers can&apos;t run add-ons. Use &ldquo;Paste a transcript&rdquo; there, or the
        Windows desktop app on a PC.
      </p>
    </div>
  );
}
