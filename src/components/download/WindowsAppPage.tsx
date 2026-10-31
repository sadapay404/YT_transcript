/**
 * /app — "TranStudio for Windows": what the desktop build is, what it fixes,
 * how to install it, and the download itself.
 *
 * Server component: the page is static, carries no keys, and the download
 * button points at `/api/download/windows`, which redirects to the current
 * release (see `src/lib/download.ts`).
 */
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Download,
  ExternalLink,
  FolderOpen,
  Info,
  MonitorDown,
  ShieldAlert,
  Wifi,
} from "lucide-react";

import {
  WINDOWS_DOWNLOAD_PATH,
  WINDOWS_RELEASE,
  driveViewUrl,
  formatBytes,
  formatReleaseDate,
  hasWindowsDownload,
} from "@/lib/download";
import { APP_TAGLINE } from "@/lib/constants";

const REASONS = [
  {
    icon: Wifi,
    title: "Captions from your connection",
    body: "The hosted site is refused by YouTube on cloud IP ranges. The desktop app runs on your PC, so caption requests leave from your home network instead — the same reason the Connector add-on works.",
  },
  {
    icon: Cpu,
    title: "No server in the middle",
    body: "Transcript scraping and AI calls happen locally, so there is no shared free-tier quota to exhaust and no cold start before the first transcript.",
  },
  {
    icon: MonitorDown,
    title: "The same studio, unchanged",
    body: "Player, synced transcript, follow-along, themes, Typography Studio, exports and NexAI are the same React code — the installer wraps the web app in a window, not a rewrite.",
  },
] as const;

const STEPS = [
  {
    title: "Download the installer",
    body: `One ${formatBytes(WINDOWS_RELEASE.sizeBytes)} .exe — no zip to extract. Chrome or Edge may ask where to save it; Windows may warn about the download because the file is unsigned.`,
  },
  {
    title: `Run ${WINDOWS_RELEASE.fileName}`,
    body: "The NSIS installer lets you pick the install folder and creates Start-menu and desktop shortcuts. Nothing else needs installing — the local Next.js server ships inside the app.",
  },
  {
    title: "Get past SmartScreen once",
    body: "The build is not code-signed, so Windows shows “Windows protected your PC”. Click More info → Run anyway. Only do this for a build you trust.",
  },
] as const;

const FAQ = [
  {
    q: "Windows says the publisher is unknown. Is that expected?",
    a: "Yes. The installer is unsigned — a code-signing certificate costs money and this project is free to run. Unsigned means Windows cannot prove who built it, not that anything is wrong with it. Click More info → Run anyway, or don't install it — the web app stays available either way.",
  },
  {
    q: "Do I need Node.js or any other software installed?",
    a: "No. The installer carries the local Next.js server and its dependencies, so there is nothing else to install. It starts the server on a loopback port when the app opens and stops it when the app closes.",
  },
  {
    q: "Where does the AI key come from?",
    a: "A build may ship with a built-in free-tier key so NexAI works out of the box. You can always use your own: create %APPDATA%\\TranStudio\\.env.local with GEMINI_API_KEY=… and restart. Your file wins over the built-in key. Transcripts, exports and the player never need a key.",
  },
  {
    q: "Does it work offline?",
    a: "Reading a transcript you already loaded works offline. Loading a new video needs the internet: the transcript comes from YouTube and the player is YouTube's iframe.",
  },
  {
    q: "Is the web version going away?",
    a: "No. The website and the desktop app are separate targets built from the same code. The site is the fastest way to try TranStudio; the app is for people whose network the site cannot reach.",
  },
  {
    q: "How do I uninstall it?",
    a: "Settings → Apps → Installed apps → TranStudio → Uninstall. Your preferences and the optional .env.local file under %APPDATA%\\TranStudio are left in place; delete that folder if you want them gone.",
  },
] as const;

export function WindowsAppPage() {
  const release = WINDOWS_RELEASE;
  const available = hasWindowsDownload(release);

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 pt-8 pb-20 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-faint transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to the studio
      </Link>

      {/* ── Hero + download ─────────────────────────────────────────────── */}
      <section className="panel mt-4 overflow-hidden p-5 sm:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-accent uppercase">
              Windows app · {release.minimumWindows}
            </p>
            <h1 className="mt-2 text-3xl leading-[1.08] font-black tracking-tight text-ink sm:text-5xl">
              TranStudio <span className="text-gradient">for Windows</span>
            </h1>
            <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
              The whole studio in a native window, running on your own machine.
              It uses your network for YouTube captions — which is exactly what
              the hosted website cannot do from a cloud IP.
            </p>
            <p className="mt-2 text-[12px] text-ink-faint">{APP_TAGLINE}</p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {available ? (
                <a
                  href={WINDOWS_DOWNLOAD_PATH}
                  data-windows-download
                  className="btn btn-primary h-11 gap-2 px-4 text-[13px]"
                >
                  <Download className="h-4 w-4" />
                  Download for Windows
                </a>
              ) : (
                <span className="btn h-11 cursor-not-allowed gap-2 border border-line px-4 text-[13px] text-ink-faint">
                  <Download className="h-4 w-4" />
                  Build not published yet
                </span>
              )}

              {available && release.driveFileId.trim().length > 0 && (
                <a
                  href={driveViewUrl(release.driveFileId)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="btn h-11 gap-2 border border-line px-4 text-[13px]"
                >
                  <FolderOpen className="h-4 w-4" />
                  Google Drive copy
                  <ExternalLink className="h-3 w-3 text-ink-faint" />
                </a>
              )}

              <Link href="/" className="btn h-11 gap-2 border border-line px-4 text-[13px]">
                Use the web app
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[12px]">
              <Meta label="Version" value={`v${release.version}`} />
              <Meta label="Installer" value={`${formatBytes(release.sizeBytes)} · .exe`} />
              <Meta label="Released" value={formatReleaseDate(release.releasedAt)} />
              <Meta label="Installed" value={release.installedSize} />
            </dl>
          </div>

          {/* A quick "what you get" card keeps the hero from being one long column. */}
          <aside className="w-full shrink-0 rounded-panel border border-line bg-ink/[0.03] p-4 lg:w-[300px]">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-accent uppercase">
              In the box
            </p>
            <ul className="mt-2.5 space-y-2 text-[12.5px] text-ink-soft">
              {[
                "Synced transcript + player",
                "Follow-along reading",
                "NexAI clips & summaries",
                "txt · md · srt · vtt · json · csv exports",
                "4 themes, 3 reading fonts",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                  {item}
                </li>
              ))}
            </ul>
            {release.unsigned && (
              <p className="mt-3 flex items-start gap-2 border-t border-line pt-3 text-[11.5px] leading-relaxed text-ink-faint">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Unsigned build: SmartScreen will ask once. See the notes below.
              </p>
            )}
          </aside>
        </div>
      </section>

      {/* ── Why install it ─────────────────────────────────────────────── */}
      <section className="mt-4 grid gap-4 sm:grid-cols-3">
        {REASONS.map((reason) => (
          <div key={reason.title} className="panel p-4">
            <reason.icon className="h-4 w-4 text-accent" />
            <h2 className="mt-2 text-[14px] font-semibold text-ink">{reason.title}</h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">{reason.body}</p>
          </div>
        ))}
      </section>

      {/* ── Install steps ──────────────────────────────────────────────── */}
      <section className="panel mt-4 p-5 sm:p-6">
        <h2 className="text-[16px] font-semibold text-ink">Install it in three steps</h2>
        <ol className="mt-4 space-y-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-strong bg-ink/[0.06] text-[11px] font-bold text-accent">
                {index + 1}
              </span>
              <div>
                <p className="text-[13.5px] font-semibold text-ink">{step.title}</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-soft">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-5 flex items-start gap-2.5 rounded-panel border border-line bg-ink/[0.03] p-3.5">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p className="text-[12.5px] leading-relaxed text-ink-soft">
            <b className="text-ink">Not code-signed.</b> Windows SmartScreen and
            some antivirus products flag every unsigned installer. If you would
            rather not trust a random binary, use the web app — it does the same
            job in a tab.
          </p>
        </div>
      </section>

      {/* ── Requirements + web comparison ──────────────────────────────── */}
      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h2 className="text-[15px] font-semibold text-ink">What it needs</h2>
          <dl className="mt-3 divide-y divide-line">
            <Row label="Windows" value={release.minimumWindows} />
            <Row label="Disk" value={`${release.installedSize} (installer ${formatBytes(release.sizeBytes)})`} />
            <Row label="Node.js" value="Not required — bundled" />
            <Row label="Internet" value="For new videos and AI answers" />
            <Row label="API key" value="Optional — a built-in free key may be included" />
          </dl>
        </div>

        <div className="panel p-5">
          <h2 className="text-[15px] font-semibold text-ink">Desktop vs. website</h2>
          <div className="mt-3 overflow-hidden rounded-panel border border-line">
            <table className="w-full border-collapse text-left text-[12.5px]">
              <thead>
                <tr className="bg-ink/[0.04] text-[11px] tracking-[0.08em] text-ink-faint uppercase">
                  <th className="px-3 py-2 font-semibold"> </th>
                  <th className="px-3 py-2 font-semibold">Windows</th>
                  <th className="px-3 py-2 font-semibold">Web</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-ink-soft">
                <CompareRow name="Install" windows="Yes" web="No" />
                <CompareRow name="Caption requests from" windows="Your PC" web="Vercel" />
                <CompareRow name="Needs a browser tab" windows="No" web="Yes" />
                <CompareRow name="Updates" windows="Reinstall" web="Automatic" />
                <CompareRow name="Works on phones" windows="No" web="Yes" />
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────── */}
      <section className="panel mt-4 p-5 sm:p-6">
        <h2 className="text-[16px] font-semibold text-ink">Questions people actually ask</h2>
        <div className="mt-3 divide-y divide-line">
          {FAQ.map((entry) => (
            <details key={entry.q} className="group py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13.5px] font-medium text-ink marker:hidden">
                {entry.q}
                <span className="text-ink-faint transition-transform group-open:rotate-90">›</span>
              </summary>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">{entry.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Honest footer note + next steps ────────────────────────────── */}
      <section className="panel mt-4 p-5">
        <div className="flex items-start gap-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p className="text-[12.5px] leading-relaxed text-ink-soft">
            The build above was produced by the repository&apos;s Windows CI job.
            It installs and launches on Windows 10/11; the project still does not
            promise access to private, age-gated or otherwise unavailable YouTube
            captions, because that depends on YouTube and your network, not on the
            app.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/" className="btn btn-primary h-9 gap-2 px-3 text-[12.5px]">
            Open the studio
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link href="/connector" className="btn h-9 gap-2 border border-line px-3 text-[12.5px]">
            Stay in the browser — Connector add-on
          </Link>
          <Link href="/status" className="btn h-9 gap-2 border border-line px-3 text-[12.5px]">
            Check what works right now
          </Link>
        </div>
      </section>
    </main>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold tracking-[0.12em] text-ink-faint uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-ink-soft">{value}</dd>
    </div>
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

function CompareRow({
  name,
  windows,
  web,
}: {
  name: string;
  windows: string;
  web: string;
}) {
  return (
    <tr>
      <th scope="row" className="px-3 py-2 text-left text-[12px] font-medium text-ink-faint">
        {name}
      </th>
      <td className="px-3 py-2">{windows}</td>
      <td className="px-3 py-2">{web}</td>
    </tr>
  );
}
