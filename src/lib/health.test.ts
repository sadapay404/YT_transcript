import { beforeEach, describe, expect, it, vi } from "vitest";

const { probeTranscript } = vi.hoisted(() => ({ probeTranscript: vi.fn() }));
vi.mock("@/lib/youtube/probe", () => ({ probeTranscript }));

import { buildHealthReport, geminiKeyHint, HEALTH_PROBE_VIDEO, readDeploymentContext } from "@/lib/health";

/**
 * Guards the diagnosis for "I added my API key but it isn't showing".
 *
 * The cause is almost always scope, not a typo: Vercel only injects a variable
 * into the environments you selected, and only into deployments created after
 * you saved it. Both facts are invisible from outside, so the app has to say
 * which one applies instead of reporting "not set".
 */
describe("readDeploymentContext", () => {
  it("reads the Vercel environment, ref and commit", () => {
    const context = readDeploymentContext({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "arena/01a0d624-yt-transcript",
      VERCEL_GIT_COMMIT_SHA: "a9b7dfe1e8e4702615323bf44eca34c0459eb8af",
      VERCEL_URL: "yt-transcript-git-arena-yt-transcript.vercel.app",
      VERCEL_DEPLOYMENT_ID: "dpl_abc123",
    });

    expect(context.vercelEnv).toBe("preview");
    expect(context.commitRef).toBe("arena/01a0d624-yt-transcript");
    expect(context.commitSha).toBe("a9b7dfe"); // short form for display
    expect(context.url).toBe("yt-transcript-git-arena-yt-transcript.vercel.app");
    expect(context.deploymentId).toBe("dpl_abc123");
  });

  it("reports nulls off Vercel, and tolerates empty strings", () => {
    expect(readDeploymentContext({})).toEqual({
      vercelEnv: null,
      commitRef: null,
      commitSha: null,
      url: null,
      deploymentId: null,
    });
    expect(readDeploymentContext({ VERCEL_ENV: "   " }).vercelEnv).toBeNull();
  });
});

describe("geminiKeyHint", () => {
  const empty = {
    vercelEnv: null,
    commitRef: null,
    commitSha: null,
    url: null,
    deploymentId: null,
  };

  it("explains the Preview/Production scope trap — the reported case", () => {
    const hint = geminiKeyHint({ ...empty, vercelEnv: "preview" });
    expect(hint).toMatch(/preview/i);
    // The two facts that make this confusing, stated outright:
    expect(hint).toMatch(/production-scoped|scoped to production/i);
    expect(hint).toMatch(/created after|after you save/i);
    // And the fix:
    expect(hint).toMatch(/all environments/i);
    expect(hint).toMatch(/redeploy/i);
  });

  it("tells a production build that it must be rebuilt after saving", () => {
    const hint = geminiKeyHint({ ...empty, vercelEnv: "production" });
    expect(hint).toMatch(/production/i);
    expect(hint).toMatch(/redeploy/i);
    expect(hint).toMatch(/built with/i);
  });

  it("points local runs at .env.local", () => {
    expect(geminiKeyHint({ ...empty, vercelEnv: "development" })).toMatch(/\.env\.local/);
    // No Vercel context at all (plain host, or the sandbox) still gets advice.
    expect(geminiKeyHint(empty)).toMatch(/\.env\.local|host/i);
  });

  it("never returns an empty or vague hint", () => {
    for (const env of ["preview", "production", "development", null]) {
      const hint = geminiKeyHint({ ...empty, vercelEnv: env });
      expect(hint.length).toBeGreaterThan(40);
      expect(hint.trim()).toBe(hint);
    }
  });
});

describe("caption health fallback diagnosis", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("does not call a known-good probe video broken when the Vercel IP is refused", async () => {
    probeTranscript.mockResolvedValue({
      ok: false,
      videoId: HEALTH_PROBE_VIDEO,
      segmentCount: 0,
      diagnostics: ["✗ innertube:web — UNPLAYABLE"],
      latencyMs: 120,
      error: {
        code: "not-found",
        message: "The video is not playable.",
        hint: "Check the link opens in a normal browser tab.",
      },
    });

    const report = await buildHealthReport({ deep: true });
    const captions = report.checks.find((check) => check.id === "youtube-captions");

    expect(captions?.status).toBe("warn");
    expect(captions?.detail).toMatch(/visitor-browser fallback/i);
    expect(report.ok).toBe(true);
  });
});
