# TranStudio for Windows

TranStudio can be packaged as a Windows desktop application without changing the
existing Next.js/React studio. The installer wraps the same Steps 1–3 UI,
Framer Motion animations, player, transcript data layer, paste fallback, AI
surfaces, and `Read it. Clip it. Ship it.` branding in Electron.

## What the desktop build does

- Electron opens the existing web UI in a hardened `BrowserWindow`.
- A production Next.js standalone server runs as a child process on
  `127.0.0.1` inside the installed app.
- Server actions and `/api/*` routes therefore make outbound requests from the
  user's Windows machine and native network/IP, not from Vercel.
- The server is stopped when the desktop app exits.
- The web deployment is unchanged and remains a separate target.
- YouTube captions still use the existing server-first ladder. If YouTube
  refuses the local network, the existing browser-connection fallback and paste
  remedies remain honest alternatives. Desktop packaging is not a promise that
  YouTube will accept every IP or video.

No Node.js installation is required on the user's PC: the standalone Next
server and its traced production dependencies are included in the installer.

## Development

Use the ordinary web commands when working on the UI:

```bash
npm install
npm run dev
```

The Electron development command builds a production standalone server first,
prepares its static assets, and then opens Electron:

```bash
npm run desktop:dev
```

The local desktop shell does not call Vercel. It starts the packaged-equivalent
Next server on an available loopback port and loads that URL in the Electron
window.

## Build the Windows installer

The supported installer build is:

```bash
npm ci
npm run desktop:build
```

The command performs these steps:

1. `next build` creates `.next/standalone`.
2. `scripts/prepare-electron.mjs` copies `.next/static` and `public` into the
   standalone tree, as required by Next's standalone output.
3. `electron-builder --win` creates an unsigned NSIS installer in `release/`.

`npm run desktop:dir` creates an unpacked Electron directory for inspection
instead of an installer. The final `.exe` must be built on Windows (or by the
Windows GitHub Actions job); a Linux-only check is not evidence that the
installer installs or launches correctly on Windows.

The repeatable workflow is `.github/workflows/desktop.yml`. It runs on Windows,
builds the installer, and uploads `TranStudio-Setup-*.exe` as an artifact for a
pull request, tag, or manual dispatch. The artifact is unsigned. A release
process can add code signing later without changing the app architecture.

## Optional Gemini configuration

Transcript extraction, the player, paste import, reading, search, and exports do
not require Gemini. The AI UI stays in a plain setup state when no key is
configured; there is no card, paid tier, sign-up flow, or in-app “get a free API
key” button.

To enable the optional AI features in the installed Windows app, create this
file and restart TranStudio:

```text
%APPDATA%\TranStudio\.env.local
```

Example:

```dotenv
GEMINI_API_KEY=your-key-here
# Optional model or endpoint overrides:
# GEMINI_MODEL=gemini-2.5-flash
# GEMINI_FALLBACK_MODEL=gemini-2.5-flash-lite
# GEMINI_BASE_URL=https://generativelanguage.googleapis.com
```

The desktop main process reads this small environment file and passes its
values to the local Next server. It does not send the file anywhere or render
the key in the UI. The same variables can also be supplied through the Windows
user/system environment. A key is optional and is not needed for the core
transcript workflow.

`TRANSCRIPT_PROXY_URL` remains an advanced server configuration for operators
who already have a suitable proxy. It is not bundled, required, or a guaranteed
YouTube workaround.

## Verification checklist

Before describing a Windows build as working, verify the artifact on a real
Windows machine or inspect a completed Windows Actions run:

1. Download the uploaded `.exe` artifact.
2. Install it into a non-default directory using the NSIS installer.
3. Launch TranStudio from the Start menu or desktop shortcut.
4. Confirm the app opens with the Zen Paper default theme and the slogan
   “Read it. Clip it. Ship it.”
5. Load the built-in demo, then test a public YouTube URL with captions.
6. Confirm the transcript action completes without a Vercel deployment.
7. Confirm a server-blocked case still presents browser-connection and paste
   remedies rather than blaming the video.
8. If a Gemini key is configured, verify the AI request; without one, verify the
   plain setup state.
9. Close the window and confirm no TranStudio Next server process remains.
10. Uninstall and confirm the installer completes normally.

The Windows Actions run [36219488278](https://github.com/sadapay404/YT_transcript/actions/runs/36219488278)
completed the Windows build and uploaded the unsigned installer artifact. That
proves the `.exe` can be produced on `windows-latest`, but this sandbox has not
installed or launched it on a Windows desktop. Do not describe the installer as
working end-to-end until the install, launch, transcript, and cleanup checks
above have been completed.

## Boundaries

- The desktop app is a local web server plus Electron shell, not a rewrite in a
  different UI toolkit.
- It does not guarantee access to private, age-gated, authenticated, disabled,
  or otherwise unavailable YouTube captions.
- Browser caption reads remain subject to CORS and YouTube policy.
- `yt-dlp` is not bundled or treated as a guaranteed solution. It could be
  evaluated later as an explicitly packaged and tested local provider, but it
  would still be subject to YouTube/network policy.
- The web/Vercel version continues to run independently.
