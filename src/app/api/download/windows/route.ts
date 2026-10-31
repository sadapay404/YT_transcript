/**
 * `GET /api/download/windows` — the stable Windows download link.
 *
 * The `/app` button points straight at the GitHub Release asset (a direct
 * file). This route exists for printed/shared short links: it 307s to whatever
 * `WINDOWS_RELEASE` currently points at, so the same URL survives a version
 * bump or a host change.
 */
import { windowsDownloadUrl } from "@/lib/download";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const target = windowsDownloadUrl();

  if (!target) {
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
      location: target,
      "cache-control": "no-store, max-age=0",
    },
  });
}
