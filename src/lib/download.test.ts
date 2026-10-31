import { describe, expect, it } from "vitest";

import {
  WINDOWS_DOWNLOAD_PATH,
  WINDOWS_RELEASE,
  driveDownloadUrl,
  driveViewUrl,
  formatBytes,
  formatReleaseDate,
  hasWindowsDownload,
  windowsDownloadUrl,
} from "./download";

describe("formatBytes", () => {
  it("formats the shipped archive in whole megabytes", () => {
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

describe("Drive links", () => {
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
  it("is considered available once a Drive file id is set", () => {
    expect(hasWindowsDownload()).toBe(true);
    expect(hasWindowsDownload({ ...WINDOWS_RELEASE, driveFileId: "  " })).toBe(false);
  });

  it("points the stable download path at this site", () => {
    expect(WINDOWS_DOWNLOAD_PATH).toBe("/api/download/windows");
  });

  it("prefers an explicit external URL, then falls back to Drive", () => {
    const external = "https://github.com/owner/repo/releases/download/v0.1.0/app.exe";
    expect(windowsDownloadUrl({ ...WINDOWS_RELEASE, externalUrl: external })).toBe(external);
    expect(windowsDownloadUrl({ ...WINDOWS_RELEASE, externalUrl: "  " })).toBe(
      driveDownloadUrl(WINDOWS_RELEASE.driveFileId),
    );
  });

  it("names an installer that matches the advertised version", () => {
    expect(WINDOWS_RELEASE.installerName).toContain(WINDOWS_RELEASE.version);
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
