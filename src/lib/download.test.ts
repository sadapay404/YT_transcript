import { describe, expect, it } from "vitest";

import {
  WINDOWS_DOWNLOAD_PATH,
  WINDOWS_RELEASE,
  driveDownloadUrl,
  driveViewUrl,
  formatBytes,
  formatReleaseDate,
  hasWindowsDownload,
  isDirectDownload,
  releaseAssetUrl,
  releasePageUrl,
  windowsDownloadUrl,
} from "./download";

describe("formatBytes", () => {
  it("formats the shipped installer in whole megabytes", () => {
    expect(formatBytes(WINDOWS_RELEASE.sizeBytes)).toBe("168 MB");
  });

  it("keeps one decimal for small files and switches to GB past 1 GiB", () => {
    expect(formatBytes(2.4 * 1024 * 1024)).toBe("2.4 MB");
    expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe("1.5 GB");
  });

  it("refuses to invent a size for nonsense input", () => {
    expect(formatBytes(0)).toBe("—");
    expect(formatBytes(Number.NaN)).toBe("—");
    expect(formatBytes(-5)).toBe("—");
  });
});

describe("download target", () => {
  const directUrl = releaseAssetUrl("v0.1.0", "TranStudio-Setup-0.1.0.exe");

  it("builds a direct GitHub Releases asset URL", () => {
    expect(directUrl).toBe(
      "https://github.com/sadapay404/YT_transcript/releases/download/v0.1.0/TranStudio-Setup-0.1.0.exe",
    );
  });

  it("links straight at the asset, with no redirect in between", () => {
    const release = { ...WINDOWS_RELEASE, downloadUrl: directUrl };
    expect(windowsDownloadUrl(release)).toBe(directUrl);
    expect(isDirectDownload(release)).toBe(true);
    expect(hasWindowsDownload(release)).toBe(true);
  });

  it("falls back to the Drive mirror only when no direct URL is published", () => {
    const release = { ...WINDOWS_RELEASE, downloadUrl: null, driveFileId: "abc123" };
    expect(windowsDownloadUrl(release)).toBe(driveDownloadUrl("abc123"));
    expect(isDirectDownload(release)).toBe(false);
  });

  it("reports no download at all rather than a dead link", () => {
    const release = { ...WINDOWS_RELEASE, downloadUrl: null, driveFileId: "  " };
    expect(windowsDownloadUrl(release)).toBeNull();
    expect(hasWindowsDownload(release)).toBe(false);
  });

  it("escapes file names in asset URLs", () => {
    expect(releaseAssetUrl("v1", "a b.exe")).toContain("a%20b.exe");
  });

  it("keeps the shared short link pointing at this site", () => {
    expect(WINDOWS_DOWNLOAD_PATH).toBe("/api/download/windows");
  });

  it("points the release-notes link at the tag page", () => {
    expect(releasePageUrl("v0.1.0")).toBe(
      "https://github.com/sadapay404/YT_transcript/releases/tag/v0.1.0",
    );
  });
});

describe("Drive mirror links", () => {
  it("builds a download URL that skips the viewer page", () => {
    expect(driveDownloadUrl("abc123")).toBe(
      "https://drive.google.com/uc?export=download&id=abc123&confirm=t",
    );
  });

  it("builds a preview URL", () => {
    expect(driveViewUrl("abc123")).toBe("https://drive.google.com/file/d/abc123/view");
  });

  it("escapes ids instead of letting them break the URL", () => {
    expect(driveDownloadUrl("a/b c")).toContain("a%2Fb%20c");
  });
});

describe("WINDOWS_RELEASE", () => {
  it("downloads a single .exe and advertises a real file size", () => {
    expect(WINDOWS_RELEASE.fileName.endsWith(".exe")).toBe(true);
    expect(WINDOWS_RELEASE.sizeBytes).toBeGreaterThan(0);
  });

  it("keeps the version, tag and asset name in step", () => {
    expect(WINDOWS_RELEASE.tag).toBe(`v${WINDOWS_RELEASE.version}`);
    expect(WINDOWS_RELEASE.fileName).toContain(WINDOWS_RELEASE.version);
  });
});

describe("formatReleaseDate", () => {
  it("renders a fixed, locale-independent date", () => {
    expect(formatReleaseDate("2026-09-26")).toBe("26 September 2026");
  });

  it("passes through anything unparseable", () => {
    expect(formatReleaseDate("not-a-date")).toBe("not-a-date");
  });
});
