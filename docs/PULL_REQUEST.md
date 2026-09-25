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
- Removed the non-functional "Free API key" button and the placeholder
  scaffolding that advertised work not yet done ("Step 2 preview", "Step 1
  shipped…"). The landing surface itself — hero, view-mode preview, theme
  gallery, typography studio, clip palette, feature grid — was restored at the
  owner's request and now sits above the working studio on `/`; its fake URL bar
  is the real `UrlBar`, so pasting a link there loads the transcript below.
- **Zen Paper is now the default theme**, and preferences persist in a **cookie**
  (`transtudio.prefs`) instead of localStorage, so `layout.tsx` renders the saved
  theme and typography in the first HTML response — no boot script, no flash.
  Verified: `curl -H 'Cookie: transtudio.prefs=…'` returns
  `<html data-theme="cyberpunk" data-scheme="dark">` server-side.
- Light-theme (Zen Paper) contrast fixes with `scheme-light`/`scheme-dark`
  variants; removed dead exports across `lib/` and the stores.

### Restored — the landing UI, one-to-one, minus the API-key button

The previous landing screen is back on `/` byte-for-byte where it matters:
hero ("Read it. Clip it. Ship it."), Fluid panes (live view-mode preview),
Four complete themes, Typography studio, 16-tint clip palette, and the six-card
feature grid. The deleted components were restored from the earlier commit and
verified identical by hash.

Two deliberate differences, both required by the merge:

- The hero's fake URL bar is now the **real** `UrlBar` — same panel, same width
  (`max-w-2xl`), same icon and Extract button — so a link pasted at the top
  loads an actual transcript.
- The "Get a free Gemini API key" header button stays removed, as asked.

The studio now renders *below* the landing and stays unmounted until something
is being read; when a link is pasted in the hero it glides into view. Empty
state, slogan and URL bar live on the landing, so there is exactly one of each.

### Fix — transcripts actually load for real videos

`"No transcript found for every video"` was **not** the videos' fault:

- YouTube decides *per client identity*. The WEB client answers datacenter IPs
  with `LOGIN_REQUIRED — Sign in to confirm you're not a bot`, and hides caption
  tracks even when the video plays.
- `youtube-transcript@1.3.1` only understood classic `<text start="…">` XML. The
  json3 / srv3 / WebVTT bodies YouTube actually serves were parsed as **zero
  rows** and reported as "no captions" — a silent failure for 100% of videos.

Replaced with a ladder that tries identities and says what it did:

| # | Strategy | Notes |
| - | -------- | ----- |
| 1 | Innertube `WEB` → `ANDROID_VR` → `IOS` → `ANDROID` → `WEB_EMBEDDED_PLAYER` | each with its own API key, client id, version, User-Agent |
| 2 | unsigned `api/timedtext` | manual tracks, no player round-trip |
| 3 | watch-page `ytInitialPlayerResponse` | last-resort scrape |
| 4 | `youtube-transcript`, then the demo transcript | demo **only** for environmental failures |

- Caption bodies are parsed per format and each parser reports its own time unit
  (json3/srv3 = ms, classic XML/WebVTT = s) — no ms/s guessing, no 1000× errors.
- Word-level ASR events are rebuilt into readable lines; line-level tracks keep
  YouTube's own granularity (Step 5's clip mapping depends on that).
- Attributes are read separately from the tag regex, so an optional group can
  never silently drop a duration again.
- **Every attempt is visible**: the workspace error state lists *"What was tried
  (N)"*, the transcript header shows the winning strategy, and `/status` reports
  `strategy` + `attempts`. "No transcript" is never a silent verdict.
- Whole-ladder time budget: a blocked host fails fast with an explanation.
- `TRANSCRIPT_PROXY_URL` now covers **every** request (Innertube POSTs, signed
  and unsigned `timedtext`, watch page) — previously only the library path.
- Restored the **"Read it. Clip it. Ship it."** slogan as the animated
  empty-state hero (decorative words `aria-hidden`, one `sr-only` copy).

Verified end-to-end with a YouTube stand-in that bot-walls WEB exactly like the
live site does (real HTTP, no mocks in the ladder):

```text
✗ innertube:web        — LOGIN_REQUIRED — Sign in to confirm you're not a bot
✗ innertube:android-vr — LOGIN_REQUIRED
✓ innertube:ios        — json3, 3 lines, lang=en (asr)     → captions rendered
```

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
npm run test       # 135 unit tests (+3 live integration tests, opt-in)
npm run lint
npm run typecheck
npm run build && npm start
# then open http://localhost:3000/status
```

### Verifying captions on the live deploy

The caption probe names the identity that answered and every attempt it made:

```bash
curl -s "https://<your-app>.vercel.app/api/health?deep=1" | grep -A 20 youtube-captions
```

Expect `"status": "pass"` with a `strategy` and a `✓` line in `attempts`. If every
line is `✗` with `LOGIN_REQUIRED`, that host's IP range is being challenged —
set `TRANSCRIPT_PROXY_URL` (documented in `docs/DEPLOY.md`) and re-check. The
studio keeps working meanwhile: it shows the bundled demo transcript **and says
why**, instead of claiming the video has no captions.

The integration suite can be run against any YouTube stand-in:

```bash
TRANSTUDIO_TEST_FAKE_YOUTUBE=http://127.0.0.1:4010/   ./node_modules/.bin/vitest run src/lib/youtube/pipeline.integration.test.ts
```
