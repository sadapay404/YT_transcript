"use client";

/**
 * /app — "TranStudio for Windows".
 *
 * Deliberately mirrors the landing hero (`LandingView`): the same kinetic
 * "Read it. Clip it. Ship it." headline and the same centred column, but where
 * the home page offers a URL bar this page offers the download button — and a
 * way back home.
 */
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  FolderOpen,
  ShieldAlert,
} from "lucide-react";

import {
  WINDOWS_RELEASE,
  driveViewUrl,
  formatBytes,
  formatReleaseDate,
  isDirectDownload,
  releasePageUrl,
  windowsDownloadUrl,
} from "@/lib/download";

const HEADLINE = ["Read", "it.", "Clip", "it.", "Ship", "it."];

const STEPS = [
  {
    title: "Download the installer",
    body: `One ${formatBytes(WINDOWS_RELEASE.sizeBytes)} .exe — no zip, nothing else to install.`,
  },
  {
    title: `Run ${WINDOWS_RELEASE.fileName}`,
    body: "Pick a folder, finish the wizard. Start-menu and desktop shortcuts are created for you.",
  },
  {
    title: "Get past SmartScreen once",
    body: "The build is unsigned, so Windows shows “Windows protected your PC” → More info → Run anyway.",
  },
] as const;

const FAQ = [
  {
    q: "Why does Windows warn about the file?",
    a: "The installer is unsigned — a code-signing certificate costs money and this project is free. Unsigned means Windows cannot prove who built it, not that something is wrong with it. If you would rather not trust a binary, the web app does the same job in a tab.",
  },
  {
    q: "Do I need Node.js or a Gemini key?",
    a: "No Node.js — the local server ships inside the app. The AI key is optional: transcripts, exports and the player work without one.",
  },
  {
    q: "Does it replace the website?",
    a: "No. Both are built from the same code. The app exists because YouTube blocks caption requests from cloud IPs; on your PC the request leaves from your own network.",
  },
] as const;

export function WindowsAppPage() {
  const release = WINDOWS_RELEASE;
  // A GitHub Release asset is a direct file, so the button links straight to it.
  const href = windowsDownloadUrl(release);
  const available = href !== null;
  const direct = isDirectDownload(release);

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 pt-10 pb-20 sm:px-6">
      {/* ── Hero — the landing lockup, with a download instead of a URL bar ── */}
      <section className="flex flex-col items-center text-center">
        <motion.p
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-4 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-ink-soft uppercase"
        >
          Windows app · v{release.version} · {formatBytes(release.sizeBytes)}
        </motion.p>

        <h1 className="text-4xl leading-[1.05] font-black tracking-tight sm:text-6xl lg:text-7xl">
          {HEADLINE.map((word, index) => (
            <motion.span
              key={word + index}
              initial={{ opacity: 0, y: 24, filter: "blur(12px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{
                delay: 0.08 * index,
                duration: 0.7,
                ease: [0.22, 1, 0.36, 1],
              }}
              className={`mr-[0.28em] inline-block ${
                index % 2 === 1 ? "text-gradient" : "text-ink"
              }`}
            >
              {word}
            </motion.span>
          ))}
        </h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-5 max-w-2xl text-[15px] leading-relaxed text-ink-soft"
        >
          The whole studio as a Windows app — same player, same synced
          transcript, same NexAI. It runs on your PC, so YouTube captions come
          from your own connection instead of a cloud server that YouTube
          refuses.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, type: "spring", stiffness: 260, damping: 28 }}
          className="mt-8 flex w-full max-w-2xl flex-col items-center justify-center gap-2.5 sm:flex-row"
        >
          {available ? (
            <a
              href={href}
              data-app-download
              {...(direct ? { download: release.fileName } : {})}
              rel="noreferrer noopener"
              className="btn btn-primary h-12 w-full gap-2 px-6 text-[14px] sm:w-auto"
            >
              <Download className="h-4 w-4" />
              Download for Windows
            </a>
          ) : (
            <span className="btn h-12 w-full cursor-not-allowed gap-2 border border-line px-6 text-[14px] text-ink-faint sm:w-auto">
              <Download className="h-4 w-4" />
              Build not published yet
            </span>
          )}

          <Link
            href="/"
            className="btn h-12 w-full gap-2 border border-line px-6 text-[14px] sm:w-auto"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.75 }}
          className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[12px] text-ink-faint"
        >
          <span>{release.minimumWindows}</span>
          <span className="flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" />
            Unsigned build — SmartScreen asks once
          </span>
          <span>Released {formatReleaseDate(release.releasedAt)}</span>
          {direct && (
            <a
              href={releasePageUrl(release.tag)}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-ink"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Release notes &amp; older builds
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {!direct && release.driveFileId.trim().length > 0 && (
            <a
              href={driveViewUrl(release.driveFileId)}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-ink"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Google Drive copy
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </motion.div>
      </section>

      {/* ── Install ──────────────────────────────────────────────────────── */}
      <section className="mt-14">
        <p className="text-center text-[11px] font-semibold tracking-[0.16em] text-accent uppercase">
          Three steps
        </p>
        <h2 className="mt-1.5 text-center text-2xl font-bold tracking-tight text-ink sm:text-[28px]">
          Install it in a minute
        </h2>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: index * 0.06, duration: 0.45 }}
              className="panel p-4"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-line-strong bg-ink/[0.06] text-[11px] font-bold text-accent">
                {index + 1}
              </span>
              <h3 className="mt-2.5 text-[14px] font-semibold text-ink">{step.title}</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">{step.body}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="panel p-5">
            <h3 className="text-[15px] font-semibold text-ink">What it needs</h3>
            <dl className="mt-3 divide-y divide-line">
              <Row label="Windows" value={release.minimumWindows} />
              <Row
                label="Disk"
                value={`${release.installedSize} (installer ${formatBytes(release.sizeBytes)})`}
              />
              <Row label="Node.js" value="Not required — bundled" />
              <Row label="API key" value="Optional" />
            </dl>
          </div>

          <div className="panel p-5">
            <h3 className="text-[15px] font-semibold text-ink">In the box</h3>
            <ul className="mt-3 space-y-2 text-[12.5px] text-ink-soft">
              {[
                "Synced transcript + player",
                "Follow-along reading and search",
                "NexAI clips, summaries and chapters",
                "txt · md · srt · vtt · json · csv exports",
                "4 themes, 3 reading fonts",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="panel mx-auto mt-4 max-w-3xl p-5">
        <h2 className="text-[15px] font-semibold text-ink">Before you install</h2>
        <div className="mt-2 divide-y divide-line">
          {FAQ.map((entry) => (
            <details key={entry.q} className="group py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13.5px] font-medium text-ink marker:hidden">
                {entry.q}
                <span className="text-ink-faint transition-transform group-open:rotate-90">
                  ›
                </span>
              </summary>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">{entry.a}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-[12px] text-ink-faint">{label}</dt>
      <dd className="text-right text-[12.5px] text-ink-soft">{value}</dd>
    </div>
  );
}
