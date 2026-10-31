# Publishing the Windows build (`/app`)

The download page is `https://<your-site>/app`. Visitors get a **direct file
download** — the browser starts saving `TranStudio-Setup-<version>.exe`
immediately, with no Drive page, no "download anyway" button and no redirect
route in between.

The binary is **not** in this repository and **not** on Vercel:

| Option | Verdict |
| --- | --- |
| `public/*.exe` in this repo | ❌ Vercel's free plan rejects static uploads over **100 MB**; the installer is ~168 MB. Git is also the wrong place for build artifacts. |
| **GitHub Releases** | ✅ **What we use.** Direct URL, 2 GB per asset, free, permanent, versioned, no bandwidth bill. |
| Google Drive | ⚠️ Works, but it is a *redirect* to a viewer page with a confirmation button, and popular files hit "download quota exceeded". Kept only as an optional mirror. |
| Cloudflare R2 / B2 | ✅ Fine (free tier, direct URLs) but needs a bucket + public domain. Unnecessary when Releases is right here. |

**Direct URL format**

```text
https://github.com/sadapay404/YT_transcript/releases/download/v0.1.0/TranStudio-Setup-0.1.0.exe
```

That exact URL lives in `src/lib/download.ts` → `WINDOWS_RELEASE.downloadUrl`
and is the `href` of the button on `/app`.

---

## Shipping a new version (one command)

The Windows workflow publishes the asset for you — nothing to download or
upload by hand:

```bash
# bump "version" in package.json first, e.g. 0.1.1
git commit -am "Release 0.1.1"
git push origin arena/9d5e5350-yt-transcript
git tag v0.1.1
git push origin v0.1.1        # ← this builds the installer AND publishes the release
```

What the tag does:

1. `.github/workflows/desktop.yml` runs on `windows-latest` (~8–12 min).
2. `npm run build` → `.next/standalone`; `scripts/prepare-electron.mjs` packs it.
3. `electron-builder --win` produces `release/TranStudio-Setup-<version>.exe`.
4. **Publish step:** creates (or reuses) the GitHub Release for the tag and
   uploads the installer with `gh release upload`, then prints the direct URL.

Then point the page at the new file — one edit in `src/lib/download.ts`:

```ts
export const WINDOWS_RELEASE: WindowsRelease = {
  version: "0.1.1",
  tag: "v0.1.1",
  fileName: "TranStudio-Setup-0.1.1.exe",
  sizeBytes: 175_959_790,        // exact bytes of the new asset
  releasedAt: "2026-11-02",
  downloadUrl: releaseAssetUrl("v0.1.1", "TranStudio-Setup-0.1.1.exe"),
  driveFileId: "",               // optional mirror
  ...
};
```

Commit → Vercel deploys → `/app` serves the new direct link. (The `downloadUrl`
is the only field the button needs; `sizeBytes` is what the page *advertises*,
so update it from the real file to keep the number honest.)

Get the exact size from the release page or the workflow log line
`Published TranStudio-Setup-0.1.1.exe (175959790 bytes) to release v0.1.1`.

---

## Uploading an installer you already have (no tag)

Useful for a locally built `.exe`:

```bash
gh release create v0.1.0 release/TranStudio-Setup-0.1.0.exe \
  --title "TranStudio v0.1.0" --generate-notes
# or, into an existing release:
gh release upload v0.1.0 "TranStudio - By Mubashir.exe" --clobber
```

> Asset names with spaces get rewritten by GitHub (`TranStudio.-.By.Mubashir.exe`).
> Rename the file to `TranStudio-Setup-<version>.exe` before uploading so the URL
> in `downloadUrl` stays clean and predictable.

---

## The stable short link

`https://<your-site>/api/download/windows` 307s to whatever `WINDOWS_RELEASE`
points at. Hand *that* out where a URL must never break (video descriptions,
READMEs, QR codes) — it keeps working when the version or the host changes.
The `/app` button itself skips the route and links to the asset directly.

---

## Why the button can be disabled

If `downloadUrl` is `null` and there is no Drive mirror, `/app` renders a
disabled "Build not published yet" button instead of a link that 404s. A dead
download button on a release page is worse than an honest empty state.

---

## Keep the repository's honesty rules

The page already says the build is **unsigned**, that SmartScreen will warn once,
and that it does not guarantee access to private, age-gated or otherwise
unavailable YouTube captions. Do not remove those notes to make the page look
cleaner — they are the difference between a download page and a promise the app
cannot keep.
