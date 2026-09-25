# TranStudio — build progress (merge when you want it live)

Tracks the step-by-step build of TranStudio: a free-tier YouTube transcript reader,
AI clipping and export studio (Next.js 16 + Gemini).

> Every commit on this branch gets its own free Vercel preview URL, so the app is
> usable live before merging. Merge when you're happy — `main` becomes production.
> (See *Deployment prerequisites* below — this repo's `main` is still the empty
> initial commit, so merging is also what makes a normal Vercel deploy work.)

## Shipped

### Step 1 — Scaffolding, type contracts, design system
- Next.js 16 App Router + React 19 + Tailwind v4 + Framer Motion + Zustand.
- Shared contracts in `src/lib/types.ts`: transcript payloads, chat streaming
  events, the clipper JSON shape (`RawClip` → `ViralClip`), exports, playback.
- Four complete themes (Pure OLED, Cyberpunk, Aurora Glass, Zen Paper) as ~22
  CSS variables per theme, bridged into Tailwind with `@theme inline`, applied
  from the settings store with zero React re-renders and no pre-paint flash.
- Typography Studio (Inter / Source Serif 4 / OpenDyslexic), 16-tint clip
  palette, `layoutId` view-mode transitions, self-hosted fonts, PWA manifest.

### Deployment + diagnostics
- One-click free deploy (Vercel), documented in `docs/DEPLOY.md`.
- `/status` dashboard and `GET /api/health` (shallow + `?deep=1`) that probe the
  runtime which actually serves traffic: Gemini key, live caption scrape, live
  Gemini call, plus a deterministic normaliser self-test.
- 38 network-free unit tests and GitHub Actions CI (typecheck → lint → test →
  build) with an empty environment.

### Step 2 — the core engine (fetcher + player + transcript)
- `extractTranscriptAction` server action → `fetchTranscriptForUrl()` pipeline:
  URL validation → metadata (InnerTube, falling back to oEmbed) in parallel with
  caption scraping (`youtube-transcript`) → millisecond/second normalisation with
  a duration cross-check → a complete `TranscriptPayload`.
- Raw **YouTube IFrame Player API** (no player dependency) with an imperative
  `PlaybackController`, a 120ms clock publishing into a playback store, clip-loop
  support ready for Step 5, tab-visibility pause, and mapped embed errors
  (private / not embeddable / removed).
- Studio workspace: URL bar with live validation, custom transport (scrub rail,
  timecode, mute, "open on YouTube"), transcript rail with timestamp badges and
  **click-any-line-to-seek**, three layout modes (Split / Cinema / Read) that
  reflow without remounting the player, keyboard shortcuts
  (`Space`, `J`/`L`, `1`/`2`/`3`), loading skeletons and a diagnostic error state.
- Bundled **demo transcript** so the app is never a dead end: served when the
  host cannot reach YouTube (sandboxes/CI), always labelled as a demo.
- 76 unit tests total, including hermetic fetch-pipeline tests that mock the
  network so they pass in every environment.

### Cleanup + rebrand to TranStudio
- Renamed the app to **TranStudio** (package, metadata, PWA manifest, docs).
- Removed non-functional UI: "Free API key" button, disabled Export button,
  placeholder settings button, and the entire marketing/landing surface
  (feature grid, "Step N" chips, fake URL bar, preview widgets).
- **Zen Paper is now the default theme**, and preferences persist in a **cookie**
  (`transtudio.prefs`) instead of localStorage, so `layout.tsx` renders the saved
  theme and typography in the first HTML response — no boot script, no flash.
  Verified: `curl -H 'Cookie: transtudio.prefs=…'` returns
  `<html data-theme="cyberpunk" data-scheme="dark">` server-side.
- Light-theme (Zen Paper) contrast fixes with `scheme-light`/`scheme-dark`
  variants; removed dead exports across `lib/` and the stores.

## Next

- **Step 3** — sync engine: auto-scroll follow (with resume), kinetic liquid highlight.
- **Step 4** — Gemini chat sidebar with the transcript injected as context.
- **Step 5** — viral clipper: structured JSON clips → colour-coded transcript bands with copy/loop-play, plus the export menu.

## Deployment prerequisites (Vercel)

Vercel detects the framework **once, at import**, and stores it as a project
setting — this repo was imported while `main` still held only the initial
README, so the project's preset was saved as `Other`. That produces:

```
No entrypoint found in "/vercel/path0". Set package.json "main" to a server file…
```

Two fixes, both included/applied from here:

1. **`vercel.json` pins `"framework": "nextjs"`** — overrides the saved project
   setting, so the Next.js builder always runs regardless of import order.
   (`installCommand: npm ci`, `buildCommand: npm run build`, `engines.node: 22.x`.)
2. **Merging this PR puts the app on `main`.** This branch is a fast-forward
   from `main`, so the merge is clean and conflict-free — after which the
   default production flow builds real code instead of an empty README.
   Alternative: set **Settings → Git → Production Branch** to
   `arena/01a0d624-yt-transcript` and skip the merge entirely.

Full diagnosis and the dashboard click-path live in
[`docs/DEPLOY.md`](../docs/DEPLOY.md#troubleshooting).

## Verification

```bash
npm run test       # 38 tests
npm run lint
npm run typecheck
npm run build && npm start
# then open http://localhost:3000/status
```
