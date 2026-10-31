# Repository analysis — TranStudio

Snapshot of the codebase before the first public Vercel deployment.
Checked on `main` (`4c75727`) with Node 22.22.3.

## 1. What this repository is

A single Next.js 16 (App Router, React 19, Tailwind v4) application with **three
delivery targets built from one codebase**:

| Target | Entry point | Notes |
| ------ | ----------- | ----- |
| Website | `npm run dev` / `next build` | The free Vercel deployment. |
| Windows app | `electron/main.cjs` + `electron-builder` | NSIS installer; starts a local standalone Next server. |
| Browser add-on | `extension/` (MV3) | "TranStudio Connector"; lets the *hosted* site borrow the visitor's connection for YouTube captions. |

Everything is TypeScript except the Electron main process, the extension and the
build scripts (`.cjs` / `.mjs` / `.js`).

```
src/app          routes: /, /app, /connector, /status, /api/chat, /api/health, /api/download/windows
src/lib          the engine: youtube ladder, captions, AI providers, clips, exports, health
src/components   UI, grouped by surface (workspace, layout, assistant, studio, download…)
src/stores       Zustand: settings (cookie-backed), transcript, playback, chat, connector
src/hooks        follow-along, clip playback, resizable panels, cinema shrink
```

Scale: ~20,400 lines of `.ts`/`.tsx`, 28 test files, 257 passing unit tests
(3 skipped: opt-in integration suites), one lint config, two GitHub workflows.

## 2. Branch state

| Ref | Commit | Meaning |
| --- | ------ | ------- |
| `main` | `4c75727` | The whole app. This is what Vercel should deploy. |
| `origin/main` | `4c75727` | Same commit — no drift. |

There are **no other branches**, no tags and no stashes. History is a single
squashed commit ("Update LandingView.tsx"), so there is no meaningful
branch-by-branch comparison to do — the earlier `arena/…` feature branch
described in older docs no longer exists, and `main` is now the app.

## 3. Health check (run locally)

| Command | Result |
| ------- | ------ |
| `npm ci` | Needs `ELECTRON_SKIP_BINARY_DOWNLOAD=1` in a sandbox (Electron's postinstall downloads a ~100 MB binary from GitHub). |
| `npm run typecheck` | ✅ pass |
| `npm run lint` | ✅ pass |
| `npm run test` | ✅ 257 passed / 3 skipped |
| `npm run build` | ✅ pass, 8 routes |
| `GET /app`, `/api/download/windows` | ✅ 200 and 307 respectively |

CI (`.github/workflows/ci.yml`) runs typecheck → lint → test → build on every
push, with **no secrets**, so a missing `GEMINI_API_KEY` can never fail a build.

## 4. Strengths

- **Secrets stay server-side.** Caption scraping and Gemini/Groq calls live in a
  server action and route handlers; no key ever reaches the bundle.
- **Degrades honestly.** Missing AI key, blocked captions and network failures
  each have a visible explanation plus a manual remedy (paste transcript,
  connector add-on, `/status` fixes).
- **Real diagnostics.** `/api/health` (shallow + `?deep=1`) and `/status` probe
  the runtime that actually serves traffic instead of assuming.
- **Small dependency surface.** 14 runtime packages, no analytics, no paid image
  optimiser, self-hosted fonts.
- **Theming without re-renders** (CSS variables + cookie-rendered SSR theme) is a
  genuinely good pattern and is documented as such.

## 5. Risks for a free Vercel deployment

| # | Risk | Impact | Mitigation |
| - | ---- | ------ | ---------- |
| 1 | **YouTube blocks datacenter IP ranges.** Vercel's egress is frequently challenged (`LOGIN_REQUIRED`). | Live transcripts can fall back to the bundled demo on the hosted site. This is the single biggest product risk. | The caption ladder (5 client identities → unsigned timedtext → watch page → `youtube-transcript`) already maximises the chance of success; the Connector add-on and the desktop build move requests to the visitor's network. Check `/status` on the live URL, and set `TRANSCRIPT_PROXY_URL` if you have a residential-quality proxy. |
| 2 | **Every route is dynamic.** `layout.tsx` awaits the preferences cookie, so `/`, `/app`, `/connector` and `/status` are server-rendered per request. | Slightly slower first paint; no static CDN cache. Well inside Hobby limits. | Leave as is (the cookie-rendered theme is the reason it exists), or make the landing page static later and accept a theme flash for returning visitors. |
| 3 | **The installer cannot be hosted here.** Vercel Hobby caps static uploads at 100 MB; the Windows archive is ~168 MB. | A `public/*.exe` deploy would fail outright. | `/app` links to the Drive copy through `/api/download/windows`; see `WINDOWS_DOWNLOAD.md`. |
| 4 | **Drive links can rate-limit** ("download quota exceeded") for popular files. | Occasional failed downloads. | Move to a GitHub Release asset (`externalUrl` in `src/lib/download.ts`) when the project gets traffic — releases support 2 GB files and stable URLs. |
| 5 | **The desktop build may bundle a shared API key** (`electron/bundled-keys.cjs`). | Anyone can decode it from `app.asar`; quota is shared by every user. | Already documented in the source. Set a spend/quota cap on that key; ship without `bundled-keys.dat` if that is unacceptable. |
| 6 | **Hobby plan is non-commercial.** | Ads/payments on the site would breach Vercel's terms. | Keep it personal/free, or upgrade before monetising. |
| 7 | **Docs had drifted** (this pass fixed the worst): stale `arena/…` branch instructions, "38 unit tests", Steps 4–5 marked pending though shipped. | Confusing first deployment. | Fixed in `README.md`, `docs/DEPLOY.md`. |
| 8 | No `LICENSE`, no `not-found.tsx`, no error boundary. | Polish, not blockers. | Add later if the repo is shared. |

## 6. What was changed in this pass

- **New `/app` page** — Windows download, install steps, requirements,
  web-vs-desktop table, FAQ, all reading from `src/lib/download.ts`.
- **`GET /api/download/windows`** — one stable redirect link to the current build.
- **Header + footer links** so the page is reachable from every surface.
- **`next.config.ts`** — `output: "standalone"` is now skipped on Vercel (it is
  only needed for the Electron payload), so the platform build does not trace a
  second, unused server tree.
- **Docs** — `README.md`, `docs/DEPLOY.md`, new `docs/WINDOWS_DOWNLOAD.md`, and
  this analysis.

## 7. Suggested next steps (in order)

1. Make the Windows archive public in Drive (**Anyone with the link → Viewer**),
   or move it to a GitHub Release and set `externalUrl`.
2. Deploy to Vercel with `GEMINI_API_KEY` (and optionally `GROQ_API_KEY`).
3. Open `/status` on the live URL and read the `attempts` list for the caption
   probe — that tells you immediately whether Vercel's IP is challenged.
4. If captions are blocked, link `/connector` prominently (already surfaced by
   the UI when the ladder falls back) and mention the desktop app on `/app`.
5. Later: publish installers to GitHub Releases automatically from
   `.github/workflows/desktop.yml` instead of uploading by hand.
