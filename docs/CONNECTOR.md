# TranStudio Connector (browser add-on)

**The problem.** YouTube refuses caption requests from cloud-server IP ranges
(Vercel, AWS, Render, Cloudflare and others). The hosted site therefore can't
read captions itself. The Windows desktop app is fine because it uses your
home connection.

**The fix.** The Connector is a tiny Manifest V3 add-on (`/extension`). When
it's installed, the site sends each caption request through the add-on, and
the add-on makes it from the visitor's own connection. Each friend uses their
own internet, so nothing depends on your PC being on.

Without the add-on, the site behaves as before: it tries the server, falls
back to the demo transcript with an honest notice, and offers "Paste a
transcript". When YouTube blocked the server, that notice now also shows a
**"Fix this for good — free add-on"** button that links to `/connector`.

## How it works

```
TranStudio page ──postMessage──▶ content.js ──runtime message──▶ background.js ──fetch──▶ youtube.com
                  (only on pages with <meta name="transtudio-connector">)   (policy.js allow-list)
```

* The page runs the same caption ladder as the server (`fetchCaptionsDirect`).
  It just swaps in `connectorFetch` (`src/lib/connector/client.ts`) as the
  `fetch` it uses. That means fixes to the ladder ship with the website, and
  the add-on rarely needs an update.
* `extension/policy.js` refuses everything except these three YouTube endpoints:
  * `https://www.youtube.com/youtubei/v1/player`
  * `/api/timedtext`
  * `/watch`

  It also limits requests to GET/POST, small bodies and a few plain headers.
  Requests always go out with `credentials: "omit"`, so the visitor's YouTube
  cookies and account are never used.
* With the add-on installed, the site tries it **first**: a ping costs about a
  millisecond, and the blocked server ladder is skipped. If the add-on can't
  get captions, the server path still runs as the fallback.

## Where it's served

`npm run build` runs `prebuild` → `scripts/pack-connector.mjs`, which zips
`/extension` into `public/transtudio-connector.zip`. Every deployment
therefore serves the matching version at `/transtudio-connector.zip`, and the
`/connector` page links to it. The zip is a build artifact (git-ignored).

## Installing (what your friends do)

The `/connector` page walks through this and detects when the add-on is working:

* **Chrome / Brave / Opera / Edge:**
  1. Download the zip and extract it.
  2. Open `chrome://extensions` (or `edge://extensions`) and turn on
     **Developer mode**.
  3. Click **Load unpacked** and choose the extracted folder.
* **Firefox:**
  1. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on…**
  2. Pick the add-on's `manifest.json`.

  A temporary add-on lasts until Firefox restarts. For a permanent install,
  see the signed-version steps below.

## Optional: publish it so installing is one click (all free except Chrome)

| Store | Cost | Notes |
| --- | --- | --- |
| Microsoft Edge Add-ons | Free | Partner Center → Edge → upload `transtudio-connector.zip`. Review usually takes a few days |
| Firefox (AMO) | Free | addons.mozilla.org → Submit → choose **"On your own"** (unlisted). You get a signed `.xpi` that friends install permanently |
| Chrome Web Store | One-time $5 developer fee | Optional; "Load unpacked" works without it |

## Using a custom domain

The content script runs on `https://*.vercel.app/*`, `http://localhost/*` and
`http://127.0.0.1/*`. If you attach your own domain, add it to
`content_scripts[0].matches` in `extension/manifest.json`, bump `version`, and
redeploy.

## Limits, honestly

* Phones: most mobile browsers can't run add-ons (Firefox for Android is the
  exception). On a phone, use "Paste a transcript".
* Rate limits: YouTube can still rate-limit a single home connection if it
  makes a very large number of requests. Normal use is far below that.
* YouTube changes its internals from time to time. Because the ladder lives in
  the website, a fix normally ships with a redeploy, without an add-on update.

## Tests

* `src/lib/connector/client.test.ts` covers request serialisation, response
  rebuilding and the add-on's allow-list.
* `src/lib/connector/bridge.integration.test.ts` loads the real add-on files
  into VM contexts and runs the whole chain against a YouTube stand-in where
  the WEB identity is bot-walled.
