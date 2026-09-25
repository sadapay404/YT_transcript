/**
 * `GET /api/health` — deployment diagnostics.
 *
 *   /api/health                         shallow: config + self-test, no network
 *   /api/health?deep=1                  live probes (YouTube captions + Gemini)
 *   /api/health?deep=1&video=<url|id>   probe a specific video
 *
 * Never cached, never statically optimised — a cached health check is a lie.
 * The /status page renders this report; uptime monitors can poll the shallow
 * mode (it makes zero outbound requests and always answers quickly).
 */
import { buildHealthReport, HEALTH_PROBE_VIDEO, statusCodeFor } from "@/lib/health";

export const dynamic = "force-dynamic";
export const revalidate = 0;
/** Deep mode performs two network round-trips; give it room on serverless. */
export const maxDuration = 30;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const deep = url.searchParams.get("deep") === "1";
  const video = url.searchParams.get("video") ?? HEALTH_PROBE_VIDEO;

  const report = await buildHealthReport({ deep, video });

  return Response.json(report, {
    status: statusCodeFor(report),
    headers: {
      "cache-control": "no-store, max-age=0",
      "x-cadence-health": report.ok ? "ok" : "degraded",
    },
  });
}
