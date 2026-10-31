/**
 * `GET /api/download/windows` — the stable Windows download link.
 *
 * Redirects to wherever `WINDOWS_RELEASE` currently points (Google Drive
 * today; a GitHub Release later, without changing a single shared link).
 * Kept dynamic so the redirect is never cached across a release bump.
 */
import {
  WINDOWS_RELEASE,
  hasWindowsDownload,
  windowsDownloadUrl,
} from "@/lib/download";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  if (!hasWindowsDownload()) {
    return Response.json(
      {
        ok: false,
        message:
          "No Windows build is published yet. See /app for the current status.",
      },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }

  return new Response(null, {
    status: 307,
    headers: {
      location: windowsDownloadUrl(WINDOWS_RELEASE),
      "cache-control": "no-store, max-age=0",
    },
  });
}
