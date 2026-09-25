# Cadence — build progress (draft, merge when you want it live)

Tracks the step-by-step build of Cadence: a free-tier YouTube transcript, AI
clipping and export studio (Next.js 16 + Gemini).

> **Draft on purpose.** Every commit on this branch gets its own free Vercel
> preview URL, so you can already use the app live without merging. Merge when
> you're happy with the build — `main` becomes the production deployment.

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

## Next

- **Step 2** — `youtube-transcript` server action, YouTube IFrame player, raw transcript render.
- **Step 3** — sync engine: auto-scroll, kinetic active line, click-to-seek.
- **Step 4** — Gemini chat sidebar with the transcript injected as context.
- **Step 5** — viral clipper: structured JSON clips → colour-coded transcript bands with copy/loop-play.

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
