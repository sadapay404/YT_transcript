/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  TranStudio for Windows — release information shown on `/app`
 * ─────────────────────────────────────────────────────────────────────────────
 *  The installer is **not** committed to this repository and is **not** hosted
 *  on Vercel. Two reasons:
 *
 *   1. Vercel's free (Hobby) plan caps static file uploads at 100 MB, and the
 *      current installer is ~168 MB — the deployment would be rejected. Even
 *      under the cap, every deploy would re-upload the whole binary.
 *   2. Git is a poor place for build artifacts; the repository stays small.
 *
 *  So the build lives in Google Drive and `/app` links to it. When a new
 *  installer ships, edit `WINDOWS_RELEASE` below — that is the only place the
 *  file id, version and size are written down. `/app`, the redirect route and
 *  the shared download link all read from here.
 *
 *  ⚠️  The Drive file must be shared as **"Anyone with the link → Viewer"**.
 *      A private file makes the download button bounce to a Google sign-in
 *      page, which looks like a broken site.
 */

/** A downloadable Windows build. */
export interface WindowsRelease {
  /** App version inside the installer (`package.json` → `version`). */
  version: string;
  /**
   * Public file name of the download — the `.exe` users double-click. The
   * owner renames the NSIS output for sharing, so this is the *published*
   * name, not necessarily the one electron-builder wrote.
   */
  fileName: string;
  /** File size in bytes (measured, not guessed — the UI formats it). */
  sizeBytes: number;
  /** ISO date (YYYY-MM-DD) the build was produced. */
  releasedAt: string;
  /** Google Drive file id of the installer. Empty string = no download yet. */
  driveFileId: string;
  /**
   * Optional absolute URL that takes priority over the Drive file — use it the
   * day the build moves to a GitHub Release (or any CDN). Leave unset to keep
   * serving the Drive link.
   */
  externalUrl?: string;
  /**
   * Optional SHA-256 of the installer, shown only when known. Never invent
   * one: a wrong hash is worse than no hash.
   */
  sha256?: string;
  /** Minimum supported Windows release. */
  minimumWindows: string;
  /** Approximate installed footprint. */
  installedSize: string;
  /** `true` while the build is unsigned (SmartScreen will warn). */
  unsigned: boolean;
}

/**
 * The build currently offered on `/app`.
 *
 * Produced by `.github/workflows/desktop.yml` on `windows-latest` from commit
 * `4c75727` and published to Google Drive (shared "Anyone with the link →
 * Viewer"), because the Actions artifact link is private to the repository
 * owner and expires.
 */
export const WINDOWS_RELEASE: WindowsRelease = {
  version: "0.1.0",
  fileName: "TranStudio - By Mubashir.exe",
  sizeBytes: 175_959_790,
  releasedAt: "2026-10-31",
  driveFileId: "1FX9iGKNkZKgqbHCzarlLv3XlnOy8xmzD",
  minimumWindows: "Windows 10 or 11 (64-bit)",
  // Estimate: the Electron runtime plus the traced standalone Next server.
  installedSize: "about 600 MB",
  unsigned: true,
};

/** `true` when `/app` has somewhere real to send the download button. */
export function hasWindowsDownload(release: WindowsRelease = WINDOWS_RELEASE): boolean {
  return Boolean(release.externalUrl?.trim()) || release.driveFileId.trim().length > 0;
}

/**
 * Where the download button actually goes: an explicit external URL when one is
 * configured, otherwise the Drive direct-download link.
 */
export function windowsDownloadUrl(
  release: WindowsRelease = WINDOWS_RELEASE,
): string {
  const external = release.externalUrl?.trim();
  if (external) return external;
  return driveDownloadUrl(release.driveFileId);
}

/** URL that starts the download with no intermediate Drive viewer page. */
export function driveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}&confirm=t`;
}

/** URL that opens the file's Google Drive page (preview, share, save a copy). */
export function driveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

/**
 * The stable, pretty link to hand out: `https://<site>/api/download/windows`.
 * It redirects to whatever `WINDOWS_RELEASE` currently points at, so a link in
 * a tweet or a video description never breaks when the host changes.
 */
export const WINDOWS_DOWNLOAD_PATH = "/api/download/windows";

/** Human-readable size, switching to GB past 1024 MiB (1 decimal place). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const mib = bytes / (1024 * 1024);
  if (mib >= 1024) return `${(mib / 1024).toFixed(1)} GB`;
  if (mib >= 10) return `${Math.round(mib)} MB`;
  return `${mib.toFixed(1)} MB`;
}

/** `26 September 2026` — stable between server and client (fixed locale). */
export function formatReleaseDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
