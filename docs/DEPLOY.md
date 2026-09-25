# Deploy TranStudio for free (and verify it works)

Everything below costs **$0** and needs **no credit card**. Total time: about 5 minutes.

> **Why this app can be hosted for free:** caption scraping and Gemini calls run in
> Next.js **server actions / route handlers**, not in the browser. That single
> decision removes CORS, keeps your API key secret, and lets any free Node host
> serve it. Nothing here depends on a paid API — no YouTube Data API, no paid
> transcription, no paid image optimisation.

---

## TL;DR — the 3-step version

1. **Push the code to GitHub** (already done: `sadapay404/YT_transcript`).
2. **Import it into Vercel** → <https://vercel.com/new> → *Continue with GitHub* → pick the repo.
3. **Add one environment variable** — `GEMINI_API_KEY` — then hit **Deploy**.

You get `https://<your-project>.vercel.app`. Open `/status` on the live URL to confirm every check is green.

Or use the one-click button (clones the repo and prompts for the key):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsadapay404%2FYT_transcript&env=GEMINI_API_KEY&envDescription=Free%20key%20from%20aistudio.google.com%2Fapikey%20%E2%80%94%20no%20credit%20card&envLink=https%3A%2F%2Faistudio.google.com%2Fapikey&project-name=transtudio&repository-name=transtudio)

---

## Path A — Vercel (recommended, zero config)

Next.js is made by Vercel, so the framework preset, build command and serverless
functions are all detected automatically. The Hobby plan is free and permanent.

### 1. Get a free Gemini key

1. Go to <https://aistudio.google.com/apikey> (Google account only).
2. **Create API key** → copy it. No billing, no card.
3. Keep it out of Git. Never paste it into a chat, an issue or a commit.

> **Read this before importing.** Vercel detects the framework **once, at
> import time**, and saves the result in the project settings forever. If you
> import while your default branch has no `package.json`, it saves the preset as
> `Other` and every build fails with *"No entrypoint found in /vercel/path0"*.
> Always do **Step B first** (get the app code onto the branch you deploy) —
> and this repo's `vercel.json` now pins the Next.js builder so even a
> mis-imported project recovers. Details in [Troubleshooting](#troubleshooting).

### 2. Import the repository

1. Sign in at <https://vercel.com> with **Continue with GitHub**.
2. **Add New… → Project → Import Git Repository** → choose `YT_transcript`.
3. Vercel detects **Next.js** automatically. Leave Build/Output settings alone.

### 3. Add the environment variable

In **Settings → Environment Variables** (or on the import screen, at the bottom):

| Name             | Value                | Environments                     |
| ---------------- | -------------------- | -------------------------------- |
| `GEMINI_API_KEY` | your key             | Production, Preview, Development |
| `GEMINI_MODEL`   | `gemini-2.5-flash`   | optional — this is already the default |

> No key yet? Deploy anyway. The app builds and runs fine without it; only the AI
> sidebar (Steps 4–5) is disabled, and `/status` will tell you exactly that.

### 4. Deploy

Hit **Deploy**. First build takes ~1–2 minutes. Afterwards:

- **Production URL**: `https://<project>.vercel.app` — tracks your production branch (`main` by default).
- **Preview URLs**: *every* branch and PR gets its own free URL. Because the work
  currently lives on `arena/01a0d624-yt-transcript`, you can open
  <https://vercel.com> → your project → **Deployments** and click the newest
  preview to see the current build live *before* merging anything.

### 5. Point production at the right branch — **required in this repo**

Vercel's **Production Branch** defaults to `main`, and **this repo's `main` is
still only the initial README commit** — all the app code lives on
`arena/01a0d624-yt-transcript`. So pick one:

- **Merge PR #1** (fast-forward, no conflicts) → `main` gets the app, and the
  default production flow works from then on. Recommended.
- **Or** **Settings → Git → Production Branch → `arena/01a0d624-yt-transcript`**
  → that branch becomes the live site, nothing merged.

Either way, **every branch already gets a preview URL**, so you can use the app
live right now from the branch deployment regardless of this setting.

### 6. Update the variable without redeploying from scratch

Change it in **Settings → Environment Variables**, then **Deployments → ⋯ → Redeploy**.
Env changes only take effect on a new deployment.

### 7. Vercel CLI alternative

```bash
npm i -g vercel      # free
vercel login         # pick "Continue with GitHub"
vercel               # preview deployment
vercel env add GEMINI_API_KEY production
vercel --prod        # production deployment
vercel logs <url>    # tail runtime logs
```

---

## Path B — other free hosts

| Host                        | Free?                        | Works with TranStudio? | Notes |
| --------------------------- | ---------------------------- | ------------------- | ----- |
| **Vercel (Hobby)**          | Yes, permanent, no card      | ✅ Best fit         | Native Next.js; free SSL + CDN. Non-commercial use per their terms. |
| **Netlify (free)**          | Yes                          | ✅ via `@netlify/plugin-nextjs` | Add the plugin; server actions supported. |
| **Cloudflare Workers**      | Yes (100k req/day)           | ⚠️ needs `@opennextjs/cloudflare` | Extra setup; the scraper's `fetch` works on Workers. |
| **Render (free instance)**  | Yes (sleeps when idle)       | ✅                  | Cold starts after ~15 min idle. |
| **Railway / Fly.io**        | Trial credits, then paid     | ✅                  | Not permanently free. |
| **GitHub Pages / any static host** | Yes                   | ❌ **No**           | Static hosting has no server runtime; caption scraping would hit CORS and your Gemini key would leak to the browser. |

Rule of thumb: if the host can run a Node server function, it can run TranStudio.

---

## Verifying it actually works

### In the browser

Open **`/status`** on your deployment (the pulse icon in the header, or
`https://your-app.vercel.app/status`). It runs two levels of checks:

| Check | What it proves |
| ----- | -------------- |
| App shell & routing | The server is up and reporting its version/runtime. |
| Gemini API key | The variable is present *in this environment* (not just locally). |
| Timestamp normalizer | Deterministic self-test of the millisecond/second caption fix — runs the shipped code path against known fixtures. |
| YouTube caption scraping | A live scrape of a real video returns caption lines. |
| Gemini API reachability | A real (tiny) generation call returns text. |

Green means the deployed app can do its job. Each failing card prints the exact
error class **and** the fix.

> **Heads-up about restricted environments:** this project was built inside a
> sandbox with no outbound internet, so the two *live* probes report
> `blocked`/`network` there — the page detects the sandbox and says so. Those
> same probes go green on Vercel or on your laptop. That is precisely why the
> check runs on the server that will actually serve the traffic.

### From a terminal

```bash
# Shallow: no network calls, safe to poll from an uptime monitor (always 200)
curl -s https://your-app.vercel.app/api/health | jq

# Deep: live YouTube + Gemini probes (503 only if both hard-fail)
curl -s "https://your-app.vercel.app/api/health?deep=1" | jq '.checks[] | {label, status, detail}'

# Probe a specific video
curl -s "https://your-app.vercel.app/api/health?deep=1&video=dQw4w9WgXcQ" | jq
```

Point a free uptime monitor (UptimeRobot, Better Stack, cron-job.org) at the
shallow endpoint — it returns `200` when healthy and `x-transtudio-health: ok`.

### Locally, exactly like production

```bash
npm run test        # 38 unit tests: URL parsing, timestamp normalising, exports
npm run typecheck && npm run lint
npm run build && npm start        # production build on http://localhost:3000
open http://localhost:3000/status
```

### Automatic checks on every push

`.github/workflows/ci.yml` runs typecheck → lint → tests → build on GitHub's free
runners for every branch and PR. No secrets needed: the build is verified to
succeed with an empty environment, so a fresh deploy can never fail over a
missing key.

---

## Troubleshooting

### "No entrypoint found in /vercel/path0. Set package.json `main` to a server file, or add one of: app.js, app.cjs, … src/app.ts …"

**Do not add an `app.js`/`server.js` file** — that message is a symptom, not the
problem. It means Vercel is running its *generic Node* builder instead of the
Next.js builder. Two things cause it, and a fresh project typically has both:

1. **The project's Framework Preset is `Other` (a.k.a. Node).**
   Vercel detects the framework **once, at import**, and stores the result as a
   project setting. If the repo was imported while the default branch held only
   a README, detection found no `package.json` and permanently saved `Other`.
2. **The deployed branch has no application code.**
   This repo's `main` branch is still the one-line initial README commit — all
   of the app lives on the `arena/01a0d624-yt-transcript` branch. Vercel's
   **Production Branch** defaults to `main`, so it clones an empty project.

#### Confirm it in 10 seconds

Open **Deployments → the failed deployment → Source**. Check the commit:

| Commit shown | Meaning | Fix |
| ------------ | ------- | --- |
| `1cbd757 Initial commit` | You're building the empty `main` branch | Do **step B** below |
| Latest `arena/…` commit (e.g. `f0c6d54`) | Builder is wrong, code is fine | Do **step A** below |

#### Step A — force the Next.js builder (already done in this repo)

This repository now ships a `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "installCommand": "npm ci",
  "buildCommand": "npm run build"
}
```

The `"framework": "nextjs"` pin **overrides the saved project setting**, so
import order stops mattering and a re-import can't get it wrong either. If your
project was created before this file existed, you can either redeploy after
pulling it, or fix it by hand:

**Project → Settings → General → Build & Development Settings → Framework Preset → `Next.js`**, then **Root Directory** must be **empty** (not `src`, not `/`).

#### Step B — give the deployed branch the app code (pick one)

- **Merge the pull request (recommended).** PR #1 merges
  `arena/01a0d624-yt-transcript` → `main`. It is a fast-forward (no conflicts),
  so `main` gains the whole app and the normal production flow just works.
- **Or change the production branch.** **Settings → Git → Production
  Branch → `arena/01a0d624-yt-transcript`**. Nothing gets merged, and that
  branch becomes your live site. Useful if you want the site live *before*
  deciding to merge.
- **Or start clean.** Delete the Vercel project and re-import now that the code
  is on `main` — detection then nails Next.js on the first try.

Then hit **Deployments → ⋯ → Redeploy** (env var changes also require a
redeploy).

> Why this can't be fixed from inside the app: Vercel decides *how to build*
> from project settings and branch contents before your code ever runs. Nothing
> in `next.config.ts` can influence it.

### Other symptoms

| Symptom | Cause | Fix |
| ------- | ----- | --- |
| `/status` says `GEMINI_API_KEY is not set` on the live site | Variable added after the deployment, or only for one environment | Add it to **all** environments, then **Redeploy** |
| Captions: `blocked` / `too-many-requests` | YouTube challenged every client identity, or your host's IP range is throttled | Open `/status?deep=1` and read the **captions** check: it names the identity that answered and lists every attempt. Re-check in a few minutes, set `TRANSCRIPT_PROXY_URL`, or move host. The studio falls back to the bundled demo transcript *and says so* rather than pretending the video has no captions |
| Captions: `empty` / `disabled` | A genuine answer about that video | YouTube reports the video's captions as disabled, or none exist yet. Try another video |
| Gemini: `invalid-key` | Placeholder text, quotes or whitespace copied with the key | Re-paste just the key; regenerate if unsure |
| Gemini: `quota` | Free-tier rate limit | Wait ~60s, or set `GEMINI_MODEL=gemini-2.5-flash-lite` |
| Build fails on install | Host forcing a package name with capitals | The repo's `package.json` name is `transtudio`, so any project name is fine |
| Blank page after deploy | Stale build cache | **Deployments → ⋯ → Redeploy** with "Clear cache" |

### "No transcript found for every video"

That is a host/identity problem, not a video problem, and it is what the
multi-client ladder exists to fix. Check it in 10 seconds:

```bash
curl -s "https://<your-app>.vercel.app/api/health?deep=1" | grep -A 20 youtube-captions
```

Read the `attempts` field. Two shapes are possible:

```text
✗ innertube:web     — LOGIN_REQUIRED — Sign in to confirm you're not a bot
✓ innertube:ios     — json3, 412 lines, lang=en        ← working (ladder recovered)
```

```text
✗ innertube:web     — LOGIN_REQUIRED — Sign in to confirm you're not a bot
✗ innertube:android-vr — LOGIN_REQUIRED …
✗ timedtext:unsigned — en: empty; en(asr): empty
✗ watch-page        — consent/bot page returned (no player response in HTML)
```

The second shape means your host's whole IP range is currently challenged. The
studio still works — it shows the bundled demo transcript and explains why — but
for live captions set `TRANSCRIPT_PROXY_URL` (it is applied to *every* request:
Innertube POSTs, signed and unsigned `timedtext`, and the watch page) or deploy
somewhere with a residential-grade egress.

## Environment variables (all optional except the first)

```bash
GEMINI_API_KEY=            # free key — required for the AI sidebar (Steps 4–5)
GEMINI_MODEL=gemini-2.5-flash        # any free-tier Gemini model id
GEMINI_FALLBACK_MODEL=gemini-2.5-flash-lite
TRANSCRIPT_PROXY_URL=      # optional egress proxy for caption scraping
TRANSTUDIO_DEMO_MODE=1     # force the bundled demo transcript (no scraping)
```

See `.env.example` for the annotated list.

---

## PWA, domain and cost hygiene

- **Install it like an app**: open the site in Chrome/Edge/Safari → *Install* / *Add to Home Screen*. `manifest.ts` + `icon.png` are already in place; theme colour follows the active theme.
- **Custom domain**: free on Vercel if you already own the domain — **Settings → Domains → Add**. HTTPS is automatic.
- **Stay free on purpose**:
  - No analytics, trackers or third-party fonts (fonts are self-hosted via `@fontsource`).
  - Images are plain `<img>` — no paid image-optimisation quota is consumed.
  - The Gemini free tier requires no card, so there is nothing to accidentally bill.
  - Hobby plans usually forbid commercial use; if this becomes a paid product, check your host's terms first.
