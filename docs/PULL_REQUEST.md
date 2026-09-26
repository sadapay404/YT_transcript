# TranStudio — build progress (merge when you want it live)

Tracks the step-by-step build of TranStudio: a free-tier YouTube transcript reader,
AI clipping and export studio (Next.js 16 + Gemini).

> Every commit on this branch gets its own free Vercel preview URL, so the app is
> usable live before merging. Merge when you're happy — `main` becomes production.
> This branch contains the complete five-step studio; the pull request is kept
> deliberately unmerged until the owner asks.

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
- Network-free unit coverage for the caption, sync, Gemini, clip, prompt and
  export logic, plus GitHub Actions CI (typecheck → lint → test → build) with
  an empty environment.

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
- The unit suite includes hermetic fetch-pipeline tests that mock the network
  so they pass in every environment.

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
- When that environmental demo fallback is returned, the client automatically
  tries `src/lib/transcript/browser-captions.ts` from the visitor's connection.
  A successful read hydrates the real transcript with `source: "browser"` and a
  `browser:<format>` strategy. CORS, private/authenticated videos and ordinary
  network failures remain honest: the demo stays usable, and paste plus the
  manual **Try from my connection** action remain available without blaming the
  video.
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

### Step 3 — the transcript follows the voice

**Follow along** now keeps the spoken line in view, and the reader always wins.

- **One scroll authority.** Every jump is computed by `sync.nextScrollTop` —
  centered when *Center the active line* is on, banded 24px clear of the sticky
  chrome when it is off. Components never do positional arithmetic.
- **Reduce motion is honoured**: `behavior` becomes `"auto"`, so the rail jumps
  rather than glides. Motion is never argued with.
- **Read mode and phones**: the rail there is not a scroller — the page is — so
  following hands centring to `scrollIntoView` (with the same center/nearest
  intent) instead of pretending to own a scrollbar.
- **Long seeks are checked, not trusted.** `content-visibility: auto` lets the
  browser measure a never-painted line from its placeholder box, so a seek
  across an hour of video can land short. After the rail settles, the engine
  measures again and finishes the move instantly — capped at two passes, and
  only while following.
- **The reader can take over.** A wheel, a touch drag, a scroll key
  (`↑ ↓ PgUp PgDn Home End` — never `Space`, `J`/`L`, `1–3`, which are the app's
  own shortcuts), or a dragged scrollbar that drifts more than 24px from where
  the engine parked the rail, pauses following and raises **Resume following**
  over the rail. Clicking it — or any line — hands the rail back. Trackpad
  momentum after the click is absorbed by a grace window instead of instantly
  re-pausing.
- **The highlight travels.** The wash is a *single* element shared between lines
  with Framer Motion's `layoutId`, so it slides from sentence to sentence
  instead of cross-fading. CSS has called it `.active-wash` since Step 1; the
  line is now its own stacking context, so the wash paints above the line's tint
  and behind its words.
- **New material starts fresh**: a new video, a pasted transcript, or switching
  *Follow along* back on all resume following — derived from the material key,
  so there is no state-resetting effect anywhere in the hook.

Two latent Step 2 bugs surfaced while wiring this and are fixed here:

1. `TranscriptPane`'s root `<section>` was a plain block inside the panel's flex
   column, so the rail's `flex-1` scroller never had a height to scroll against —
   long transcripts were **clipped, not scrollable**. It is now
   `flex min-h-0 flex-1 flex-col`, which also gives every layout mode a real
   scroller (and the page-scroll fallback above covers the modes where the panel
   grows freely).
2. `data-active` was rendered on the `<li>` while `.transcript-line` — and
   therefore every `[data-active="true"]` rule — sits on the `<button>`. The
   active line never received its full-ink colour or glow. The attribute now
   lives on the button too.

Verified: `9` new unit tests over the pure verdicts
(`src/lib/youtube/follow.test.ts` → **169 passing, 3 skipped**), plus an opt-in
jsdom suite that drives the real `TranscriptPane` through a synthetic 60-line
rail — exact `nextScrollTop` targets, reduce-motion, band vs center, wheel /
key / scrollbar-drag takeovers, the resume button's return trip, line-click
resume, Read-mode `scrollIntoView`, and one `.active-wash` on the active line
only:

```bash
npm i --no-save jsdom                # test-only, not an app dependency
npx vitest run --config vitest.verify.config.ts   # 41 passed (Step 3 + Steps 4–5)
```

No dependency, no API key, no sign-up was added; Zen Paper is still the default
theme, the name is still TranStudio and the slogan is still
**Read it. Clip it. Ship it.**

### Step 4 — the assistant answers

- `POST /api/chat` streams newline-delimited `delta`, `meta`, `clips`, `error` and one final `done` event. The client buffers partial network frames.
- Chat, summary, chapters and clip modes use the right transcript shape: flat text for reading, compact timed records for timestamp work. Requests are capped server-side (message, history, segments and context).
- Missing keys, quota, safety, network and unavailable-model failures are translated into a remedy instead of a stack trace. Model rotation happens only for an unavailable model, and a streaming answer never restarts after text has been emitted.
- The assistant panel is resizable from 340–760px, keyboard accessible, and its width is persisted with the existing preferences cookie. The question is captured before it is appended, so a new turn is never sent twice.

### Step 5 — the clips play and ship

- Gemini clip responses are strict JSON, then parsed defensively (fences, prose and balanced braces) into safe model output.
- `mapClipPlan` verifies every range against the real caption rail: repairs believable millisecond timestamps, clamps and snaps to complete lines, assigns plan-order colours, sorts by start, and drops a range it cannot locate.
- Verified clips paint colour bands on the transcript with floating Copy and loop Play actions. Play arms the range before driving the player, so Read mode switches back to Split and a not-yet-ready player still adopts the loop.
- The export menu has live previews and downloads for TXT, Markdown, SRT, VTT, JSON and CSV, with honest timestamp/header/paragraph toggles.

The complete five-step build is **not** merged yet — merge it only when the owner
explicitly asks. Production confirmation remains a deployment/browser check,
not a claim made from the sandbox.

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
2. **Merging this PR puts the app on `main`.** Keep the PR open while reviewing;
   only the owner should merge it. The branch is based on the current production
   history, so the normal Vercel flow builds the Next.js app after approval.

Full diagnosis and the dashboard click-path live in
[`docs/DEPLOY.md`](../docs/DEPLOY.md#troubleshooting).

## Verification

```bash
npm ci
npm i --no-save jsdom
npm run typecheck
npx eslint .
npx vitest run
npx vitest run --config vitest.verify.config.ts
npx next build
npx next start -p 3000 -H 0.0.0.0
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
