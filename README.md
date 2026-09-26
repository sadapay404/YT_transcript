# TranStudio — Transcript & Clip Studio

> Read it. Clip it. Ship it.

Turn any YouTube video into a **synchronized, readable transcript**, then let **Google Gemini** find the viral moments and paint them straight onto the text as colour-coded, playable, copyable clips.

- **100% free to run** — no credit card, ever. YouTube captions use a server-side ladder (`youtube-transcript` plus direct formats), with a best-effort visitor-browser fallback when a datacenter IP is blocked; no YouTube Data API quota is involved. The AI runs on the Gemini **free tier** (no card required). Fonts are self-hosted. Deploy free on Vercel.
- **Zero-cost defaults** — no analytics, no third-party trackers, no paid image optimizer.

---


## Deploy it as a free website (5 minutes)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsadapay404%2FYT_transcript&env=GEMINI_API_KEY&envDescription=Free%20key%20from%20aistudio.google.com%2Fapikey%20%E2%80%94%20no%20credit%20card&envLink=https%3A%2F%2Faistudio.google.com%2Fapikey&project-name=transtudio&repository-name=transtudio)

1. Push to GitHub (done), then import the repo at <https://vercel.com/new>.
2. Add `GEMINI_API_KEY` in **Settings → Environment Variables** (free key, no card).
3. Deploy → you get `https://<project>.vercel.app`.

**Then verify it**: open **`/status`** on the live URL. It probes the runtime that
is actually serving your traffic — API key presence, a live YouTube caption
scrape, a live Gemini call, and a deterministic self-test of the timestamp
normaliser — and prints the exact fix for anything that fails.

```bash
curl -s  https://your-app.vercel.app/api/health          | jq   # shallow, no network
curl -s "https://your-app.vercel.app/api/health?deep=1"  | jq   # live probes
```

Full walkthrough (Vercel, Netlify, Cloudflare, CLI, domains, troubleshooting):
**[docs/DEPLOY.md](docs/DEPLOY.md)**.

---

## Quick start

```bash
# 1) install (already scaffolded in this repo)
npm install

# 2) add your free Gemini key
cp .env.example .env.local
#    → paste a key from https://aistudio.google.com/apikey   (Google account only)

# 3) run
npm run dev            # http://localhost:3000

# verify
npm run typecheck      # next typegen + tsc --noEmit
npm run lint
npm run test           # vitest: URL parsing, timestamp normalising, timecodes
npm run build && npm start
# then open http://localhost:3000/status  ← live diagnostics dashboard
```

If you are scaffolding this project from scratch, the exact command used was:

```bash
npx create-next-app@latest transtudio \
  --ts --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-npm --empty --disable-git

npm install framer-motion lucide-react zustand youtube-transcript @google/genai \
            clsx tailwind-merge \
            @fontsource-variable/inter @fontsource-variable/source-serif-4 \
            @fontsource-variable/jetbrains-mono @fontsource/opendyslexic
```

---

## Stack

| Layer      | Choice                                                              |
| ---------- | ------------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Turbopack, React 19)                        |
| Styling    | Tailwind CSS v4 + CSS custom properties (4 full themes)             |
| Motion     | Framer Motion (shared-layout transitions, kinetic typography)       |
| Player     | YouTube IFrame Player API — raw, no player dependency               |
| Transcript | `youtube-transcript` (server action, server-side scrape, no API key) |
| AI         | `@google/genai` → `gemini-2.5-flash` (1M-token context, free tier)  |
| State      | Zustand + `persist` (settings survive refreshes)                    |
| Fonts      | Self-hosted via `@fontsource` (Inter, Source Serif 4, JetBrains Mono, OpenDyslexic) |
| Icons      | `lucide-react`                                                      |

---

## Architecture

```
src/
├─ app/
│  ├─ layout.tsx          # reads the preferences cookie → SSR theme (no flash)
│  ├─ globals.css         # ⭐ the whole design system (4 themes, tokens, components)
│  ├─ page.tsx            # the studio (workspace)
│  ├─ actions/
│  │  └─ transcript.ts    # ⭐ server action: URL → full transcript payload
│  ├─ status/page.tsx     # diagnostics dashboard ("is it working?")
│  ├─ api/health/route.ts # shallow + deep health JSON (monitor-friendly)
│  ├─ manifest.ts         # PWA manifest
│  └─ icon.png            # PWA / favicon icon
├─ lib/
│  ├─ types.ts            # ⭐ every shared contract (transcript, chat, clips, exports…)
│  ├─ prefs.ts            # cookie preferences: parse, validate, persist
│  ├─ constants.ts        # themes, fonts, clip palette, export presets, Gemini config
│  ├─ utils.ts            # timecodes, URL parsing, formatters
│  ├─ health.ts           # deployment diagnostics + self-tests
│  ├─ gemini/client.ts    # Gemini client factory + error taxonomy (server only)
│  ├─ youtube/
│  │  ├─ fetch.ts         # ⭐ the engine: strategy ladder → normalise → payload (+ demo fallback)
│  │  ├─ captions.ts      # ⭐ multi-client caption ladder + per-attempt diagnostics (tested)
│  │  ├─ clients.ts       # Innertube client identities, proxy fetcher, timedtext URLs (tested)
│  │  ├─ parse.ts         # json3 / srv3 / classic-XML / WebVTT parsers, unit-exact (tested)
│  │  ├─ metadata.ts      # title/author/duration/caption tracks (InnerTube → oEmbed)
│  │  ├─ normalize.ts     # ms-vs-seconds handling, self-healing detection (tested)
│  │  ├─ sync.ts          # playhead ↔ line maths: active line, scroll targets (tested)
│  │  ├─ follow.ts        # is the reader still letting us scroll? gestures vs drift (tested)
│  │  ├─ demo.ts          # bundled demo transcript (never a dead end)
│  │  └─ probe.ts         # caption fetch probe + error classification
│  └─ transcript/
│     └─ browser-captions.ts # visitor-connection fallback (CORS permitting)
├─ hooks/
│  └─ useFollowAlong.ts   # ⭐ Step 3: auto-scroll follow, takeover detection, resume
├─ providers/ThemeProvider.tsx   # settings → <html> data-attributes + CSS variables
├─ stores/
│  ├─ useSettingsStore.ts # theme / typography / layout (cookie-backed)
│  ├─ useTranscriptStore.ts # fetch lifecycle + parsed transcript
│  └─ usePlaybackStore.ts # playhead, duration, active line, clip loop
└─ components/
   ├─ player/YouTubePlayer.tsx   # raw IFrame API + imperative PlaybackController
   ├─ workspace/                 # UrlBar, VideoPane, TranscriptPane, TranscriptLine, Workspace
   ├─ layout/                    # AppShell, StudioHeader, ThemeSwitcher, StylePanel, …
   ├─ studio/TypographyStudio.tsx
   ├─ status/StatusDashboard.tsx
   └─ ui/                        # Segmented, Slider, Switch
```

### Why captions never come back empty

YouTube answers *per client identity*: the WEB client regularly hides caption
tracks or returns `LOGIN_REQUIRED — Sign in to confirm you're not a bot` to
datacenter IPs (Vercel, CI, containers), while another identity answers the same
request perfectly. A single-identity scraper therefore reports "no captions" for
*every* video on such a host.

So the engine runs a ladder and reports what each rung did:

1. **Innertube player** as `WEB` → `ANDROID_VR` → `IOS` → `ANDROID` → `WEB_EMBEDDED_PLAYER`,
   each with its own API key, client id, version and User-Agent.
2. **Unsigned `api/timedtext`** — manual tracks are often served with no player
   round-trip at all.
3. **Watch page** scrape (`ytInitialPlayerResponse`).
4. **`youtube-transcript`** as a last resort, then the bundled demo transcript —
   *only* when the failure is environmental, never to mask a real answer.

Caption bodies arrive as json3, srv3, classic XML or WebVTT; each parser states
its own time unit (json3/srv3 = ms, XML/VTT = s) instead of guessing, and the
whole ladder runs under a time budget so a blocked host fails fast with an
explanation instead of hanging.

Every attempt is surfaced in the UI (*"What was tried (N)"*) and in
`/status` (`Strategy`, `attempts`), so "no transcript" is never a silent verdict.

When the server ladder returns the environmental demo, the browser makes one
best-effort request from the visitor's own connection and replaces the demo if
YouTube allows the caption read. Direct reads are subject to YouTube's CORS
policy, private/authenticated videos and ordinary network failures; if that
request is refused, the demo stays usable and the UI keeps paste and manual
browser-retry remedies visible.

`scripts/fake-youtube.mjs` reproduces the failure locally — it bot-walls the WEB
identity exactly like a datacenter IP — and the opt-in integration suite proves
the ladder recovers from it:

```bash
node scripts/fake-youtube.mjs &
TRANSTUDIO_TEST_FAKE_YOUTUBE=http://127.0.0.1:4010/ \
  ./node_modules/.bin/vitest run src/lib/youtube/pipeline.integration.test.ts
```

### Theming without re-renders

A theme is ~22 CSS variables (`--canvas`, `--surface`, `--ink`, `--accent`, `--glow`, `--blur`, …).
Tailwind is bridged to them once with `@theme inline`, which produces the usual utilities:

```html
<div class="bg-surface text-ink border-line rounded-panel shadow-glow">…</div>
```

Switching themes only writes `data-theme` on `<html>` — **no React re-render, no stylesheet rebuild, no flash**. Preferences are stored in a **cookie**, so `layout.tsx` renders the saved theme straight into the first HTML response: verified with
`curl -H 'Cookie: transtudio.prefs=…' localhost:3000` returning
`<html data-theme="cyberpunk" data-scheme="dark">` server-side. Zen Paper is the default.

Themes: **Pure OLED** (`#000000`, default) · **Cyberpunk** (neon magenta/cyan) · **Aurora Glass** (frosted panels over drifting gradients) · **Zen Paper** (warm light reading mode).

### Typography Studio

`--transcript-font`, `-size`, `-leading`, `-tracking`, `-measure` are set on `<html>` from the settings store, so the transcript restyles as a pure CSS operation. Faces: Inter, Source Serif 4, **OpenDyslexic** (each with its own recommended leading/tracking).

### The transcript follows the voice

While **Follow along** is on, the spoken line is kept in view. Every jump is
computed by `sync.nextScrollTop` — no component does arithmetic of its own:

- **Centered** when *Center the active line* is on, kept in a comfortable band
  (24px clear of the sticky chrome) when it is off.
- **Instantly** when *Reduce motion* is on — the app never animates against the
  reader's stated preference. Otherwise it glides.
- **In Read mode, and on phones**, the rail isn't a scroller at all: the
  transcript flows with the page, so following hands the centring to
  `scrollIntoView` instead of pretending to own a scrollbar.
- **A long seek is checked, not trusted.** `content-visibility: auto` lets the
  browser skip off-screen lines, so a line that has never been painted can
  measure from its placeholder box; after the rail settles the engine looks
  again and finishes the move (capped at two extra passes).

The highlight is **one element**, shared between lines with Framer Motion's
`layoutId`, so it *travels* from sentence to sentence instead of cross-fading —
the CSS has always called it `.active-wash`, and the line is its own stacking
context so the wash sits behind the words but above the line's tint.

**Reading beats following.** The moment a reader scrolls — a wheel, a finger,
a scroll key, or a dragged scrollbar that drifts more than 24px from where the
engine parked the rail — following pauses and **Resume following** appears over
the rail. Clicking it, or any line, hands the rail back to the video. A new
transcript (or switching the setting back on) starts following again.

`.active-wash`, `data-segment-index`, the pause/resume cycle and the resume
button's return trip are exercised against a real `TranscriptPane` in
[`src/verify/follow.verify.tsx`](src/verify/follow.verify.tsx) — an opt-in
suite, like the caption integration one:

```bash
npm i --no-save jsdom          # not a dependency of the app
npx vitest run --config vitest.verify.config.ts
```

---

## Build plan

| Step | Scope | Status |
| ---- | ----- | ------ |
| **1** | Scaffolding, type contracts, design system, 4 themes, typography studio, motion primitives | ✅ shipped |
| **2** | `youtube-transcript` server action + IFrame player + transcript render (click-to-seek) | ✅ shipped |
| **3** | Sync engine: auto-scroll follow, kinetic liquid active line | ✅ shipped |
| **4** | Gemini chat sidebar (streaming, transcript context injected silently) | ⏳ |
| **5** | Viral Clipper: structured JSON clips → colour-coded transcript bands with copy/loop-play | ⏳ |

---

## Free-tier notes

- **Gemini free tier**: `gemini-2.5-flash` gives a 1M-token context (a 3-hour transcript fits in ~40k tokens) and a generous daily request quota. A `.env.local` key is all you need — and if the key is missing, the UI degrades gracefully instead of crashing.
- **Captions**: the server ladder hits YouTube's InnerTube endpoint (with direct-format and HTML fallbacks). No key, no quota — but *some* datacenter IP ranges get rate-limited, so the app then makes a best-effort visitor-browser read. YouTube may still refuse that cross-origin request, so paste and retry remain available; `TRANSCRIPT_PROXY_URL` is the server-side escape hatch.
- **Hosting**: deploy to Vercel's free plan — the server action remains the first path, while the browser fallback uses the visitor's own connection only when the server is environmentally blocked (CORS permitting).
- **Fair use**: this tool is for reading, research and clipping content you have the right to use. Respect YouTube's Terms of Service and creators' rights.
