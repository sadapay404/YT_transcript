/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  TranStudio for Windows — release information shown on `/app`
 * ─────────────────────────────────────────────────────────────────────────────
 *  The installer is **not** committed to this repository and is **not** hosted
 *  on Vercel (the free plan rejects static uploads over 100 MB).
 *
 *  It is published as a **GitHub Release asset**, which gives a permanent
 *  *direct* download URL — the browser starts downloading the `.exe`
 *  immediately, with no Drive preview page and no quota errors:
 *
 *    https://github.com/<owner>/<repo>/releases/download/v<version>/<file>.exe
 *
 *  `.github/workflows/desktop.yml` builds the installer on Windows and uploads
 *  it to the release whenever a `v*` tag is pushed, so publishing a version is
 *  `git tag v0.1.0 && git push origin v0.1.0` — no manual file handling.
 *
 *  When a new build ships, update `WINDOWS_RELEASE` below; it is the only place
 *  the URL, version and size are written down. `/app`, the stable redirect and
 *  the JSON in `/status` all read from here.
 */

/** A downloadable Windows build. */
export interface WindowsRelease {
  /** App version inside the installer (`package.json` → `version`). */
  version: string;
  /** Release tag the asset is attached to (`v0.1.0`). */
  tag: string;
  /** Asset file name — what the browser saves. */
  fileName: string;
  /** File size in bytes (measured from the published asset, never guessed). */
  sizeBytes: number;
  /** ISO date (YYYY-MM-DD) the release was published. */
  releasedAt: string;
  /**
   * The direct download URL. `null` means "not published yet": `/app` then
   * shows a disabled button instead of a link that 404s.
   */
  downloadUrl: string | null;
  /**
   * Optional Google Drive mirror id. Only surfaced as a secondary link when it
   * is set *and* a direct URL is not, so visitors never land on a Drive page
   * with a download button that goes nowhere.
   */
  driveFileId: string;
  /**
   * Optional SHA-256 of the installer, shown only when known. Never invent one:
   * a wrong hash is worse than no hash.
   */
  sha256?: string;
  /** Minimum supported Windows release. */
  minimumWindows: string;
  /** Approximate installed footprint. */
  installedSize: string;
  /** `true` while the build is unsigned (SmartScreen will warn). */
  unsigned: boolean;
}

const REPO = "sadapay404/YT_transcript";

/** The direct GitHub Releases URL for an asset. */
export function releaseAssetUrl(tag: string, fileName: string): string {
  return `https://github.com/${REPO}/releases/download/${tag}/${encodeURIComponent(fileName)}`;
}

/**
 * The build currently offered on `/app`.
 *
 * Built by `.github/workflows/desktop.yml` on `windows-latest` from the tagged
 * commit, then attached to the GitHub Release for that tag.
 */
export const WINDOWS_RELEASE: WindowsRelease = {
  version: "0.1.0",
  tag: "v0.1.0",
  fileName: "TranStudio-Setup-0.1.0.exe",
  sizeBytes: 175_959_790,
  releasedAt: "2026-10-31",
  downloadUrl: null,
  driveFileId: "1FX9iGKNkZKgqbHCzarlLv3XlnOy8xmzD",
  minimumWindows: "Windows 10 or 11 (64-bit)",
  // Estimate: the Electron runtime plus the traced standalone Next server.
  installedSize: "about 600 MB",
  unsigned: true,
};

/**
 * Where the download button points.
 *
 * A GitHub Release asset is a direct file, so the button links straight to it —
 * no redirect route in between. If no release is published yet, the Drive
 * mirror (if any) is used as a fallback; with neither, the UI shows a disabled
 * button rather than a dead link.
 */
export function windowsDownloadUrl(
  release: WindowsRelease = WINDOWS_RELEASE,
): string | null {
  const direct = release.downloadUrl?.trim();
  if (direct) return direct;
  const driveId = release.driveFileId.trim();
  return driveId ? driveDownloadUrl(driveId) : null;
}

/** `true` when `/app` has somewhere real to send the download button. */
export function hasWindowsDownload(
  release: WindowsRelease = WINDOWS_RELEASE,
): boolean {
  return windowsDownloadUrl(release) !== null;
}

/**
 * Is the download a direct file (GitHub Release asset) rather than a hosted
 * viewer/redirect? Drives the wording on the page.
 */
export function isDirectDownload(
  release: WindowsRelease = WINDOWS_RELEASE,
): boolean {
  return Boolean(release.downloadUrl?.trim());
}

/** Drive's direct-download endpoint — a redirect, used only as a mirror. */
export function driveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}&confirm=t`;
}

/** URL that opens the file's Google Drive page (preview, share, save a copy). */
export function driveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

/**
 * Stable, pretty link to hand out: `https://<site>/api/download/windows`.
 * It redirects to whatever `windowsDownloadUrl()` returns, so a link printed in
 * a video description keeps working across hosts and versions.
 */
export const WINDOWS_DOWNLOAD_PATH = "/api/download/windows";

/** The public GitHub Release page (notes, checksums, older builds). */
export function releasePageUrl(tag: string = WINDOWS_RELEASE.tag): string {
  return `https://github.com/${REPO}/releases/tag/${tag}`;
}

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
