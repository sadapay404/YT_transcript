# Publishing the Windows build (`/app`)

The download page is `https://<your-site>/app`. It never hosts the binary: Vercel's
free plan rejects static uploads over **100 MB**, and the Windows archive is ~168 MB.
Every release is therefore uploaded once to Google Drive (or a GitHub Release) and
`/app` links to it.

Everything the page shows comes from **one file**:

```text
src/lib/download.ts  →  WINDOWS_RELEASE
```

| Field            | What it is                                                        |
| ---------------- | ----------------------------------------------------------------- |
| `version`        | Version inside the installer (`package.json` → `version`).        |
| `installerName`  | `TranStudio-Setup-<version>.exe` — the file inside the archive.    |
| `archiveName`    | Name of the uploaded archive, for the record.                     |
| `sizeBytes`      | Measured archive size in bytes (the UI formats it).               |
| `releasedAt`     | ISO date (`YYYY-MM-DD`) of the build.                             |
| `driveFileId`    | Google Drive file id of the uploaded archive.                     |
| `externalUrl`    | Optional override (GitHub Release asset, CDN). Wins over Drive.   |
| `sha256`         | Optional installer hash, shown only when you actually have it.     |
| `minimumWindows` | e.g. `Windows 10 or 11 (64-bit)`.                                 |
| `installedSize`  | Approximate installed footprint.                                  |
| `unsigned`       | `true` while the build has no code-signing certificate.           |

`https://<your-site>/api/download/windows` is a stable link that redirects to
whatever `WINDOWS_RELEASE` points at — hand that URL out instead of a Drive URL, so
links in tweets, READMEs and video descriptions keep working when the host changes.

---

## Releasing a new build

1. **Build it.** Run the *Windows desktop installer* workflow
   (`.github/workflows/desktop.yml`) — either from a pull request touching
   `electron/**` or `src/**`, from a `v*` tag, or manually via **Run workflow**.
2. **Download the artifact.** On the run page, download
   `TranStudio-Windows-<sha>.zip`. It contains `release/TranStudio-Setup-<version>.exe`.
3. **Upload it to Drive** (folder: *TranStudio — Windows builds*).
4. **Share it publicly**: right-click → **Share** → **Anyone with the link** →
   **Viewer** → *Copy link*.
   A private file makes the download button bounce to a Google sign-in page, which
   looks like a broken website.
5. **Take the file id** from the link — `.../file/d/<FILE_ID>/view`.
6. **Update `WINDOWS_RELEASE`** in `src/lib/download.ts` (`version`,
   `installerName`, `archiveName`, `sizeBytes`, `releasedAt`, `driveFileId`).
7. Commit, let Vercel deploy, then open `/app` and click the button once. The
   168 MB download should start without a Drive preview page in between.

### Verifying the size and hash locally (Windows)

```powershell
Get-Item .\TranStudio-Setup-0.1.0.exe | Select-Object Length
Get-FileHash .\TranStudio-Setup-0.1.0.exe -Algorithm SHA256
```

Put the byte count in `sizeBytes`. Only add `sha256` when you paste the real value.

---

## Moving to GitHub Releases instead (recommended long term)

GitHub Releases are free, public, permanent, support files up to 2 GB, and give a
stable, versioned URL — much better than a Drive link for a downloadable app.

1. Publish the installer as a release asset, e.g.
   `https://github.com/<owner>/<repo>/releases/download/v0.1.0/TranStudio-Setup-0.1.0.exe`.
2. Set it in `src/lib/download.ts`:

   ```ts
   externalUrl:
     "https://github.com/sadapay404/YT_transcript/releases/download/v0.1.0/TranStudio-Setup-0.1.0.exe",
   ```

3. Leave `driveFileId` in place if you want the "Google Drive copy" button; clear it
   to hide that button.

Nothing else changes: `/app`, the metadata and `/api/download/windows` all follow.

---

## Why not put the `.exe` in `public/`?

- Vercel Hobby caps static file uploads at 100 MB; the deploy fails.
- Git is not a file host — a 168 MB blob would live in history forever.
- Every deploy would re-upload the binary, and every visitor would count against the
  100 GB/month Fast Data Transfer allowance.

Drive (or a GitHub Release) keeps the deploy small and the download free.

---

## Keep the repository's honesty rules

The page already says the build is **unsigned**, that SmartScreen will warn once, and
that it does not guarantee access to private, age-gated or otherwise unavailable
YouTube captions. Do not remove those notes to make the page look cleaner — they are
the difference between a download page and a promise the app cannot keep.
