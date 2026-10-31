/**
 * End-to-end check of the TranStudio Connector bridge, without a browser:
 *
 *   page (connectorFetch) ──postMessage──▶ extension/content.js
 *        ──runtime.sendMessage──▶ extension/background.js (+ policy.js)
 *        ──fetch──▶ a YouTube stand-in
 *
 * The real add-on files are loaded into their own VM contexts with minimal
 * `chrome.*` / `window` stand-ins, and the real caption ladder
 * (`fetchCaptionsDirect`) runs on top. The stand-in reproduces the cloud-IP
 * situation from the visitor's side: the WEB identity is bot-walled, another
 * identity returns captions.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectorFetch, detectConnector } from "@/lib/connector/client";
import { fetchCaptionsViaConnector } from "@/lib/transcript/browser-captions";

const ORIGIN = "https://yt-transcript.vercel.app";
const EXTENSION_ID = "transtudioconnectortest";
const extensionFile = (name: string) => readFileSync(join(process.cwd(), "extension", name), "utf8");

type Listener = (event: { source: unknown; origin: string; data: unknown }) => void;

function makeWindow() {
  const listeners = new Set<Listener>();
  const win = {
    location: { origin: ORIGIN },
    navigator: { userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/140.0 Safari/537.36" },
    addEventListener: (type: string, fn: Listener) => {
      if (type === "message") listeners.add(fn);
    },
    removeEventListener: (_type: string, fn: Listener) => {
      listeners.delete(fn);
    },
    postMessage: (data: unknown, targetOrigin: string) => {
      if (targetOrigin !== ORIGIN) return;
      const cloned = structuredClone(data);
      setTimeout(() => {
        for (const fn of [...listeners]) fn({ source: win, origin: ORIGIN, data: cloned });
      }, 0);
    },
  };
  return win;
}

/** What reached "YouTube" — used to prove the add-on sends nothing extra. */
const seen: Array<{ url: string; method: string; headers: Record<string, string>; credentials?: string }> = [];

const JSON3 = JSON.stringify({
  wireMagic: "pb3",
  events: [
    { tStartMs: 0, dDurationMs: 1800, segs: [{ utf8: "hello from" }, { utf8: " your own connection" }] },
    { tStartMs: 2000, dDurationMs: 2000, segs: [{ utf8: "the cloud block never saw this request" }] },
    { tStartMs: 4200, dDurationMs: 1800, segs: [{ utf8: "and the transcript still arrives" }] },
  ],
});

async function youtubeStandIn(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input.toString());
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((value, name) => {
    headers[name] = value;
  });
  seen.push({ url: url.toString(), method: init.method ?? "GET", headers, credentials: init.credentials });

  if (url.pathname === "/youtubei/v1/player") {
    const body = JSON.parse(String(init.body)) as { context: { client: { clientName: string } }; videoId: string };
    if (body.context.client.clientName === "WEB") {
      return Response.json({
        playabilityStatus: { status: "LOGIN_REQUIRED", reason: "Sign in to confirm you’re not a bot" },
      });
    }
    return Response.json({
      playabilityStatus: { status: "OK" },
      videoDetails: { videoId: body.videoId, title: "Connector demo", author: "TranStudio", lengthSeconds: "6" },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            {
              baseUrl: `https://www.youtube.com/api/timedtext?v=${body.videoId}&lang=en&kind=asr&signature=abc`,
              languageCode: "en",
              kind: "asr",
              name: { simpleText: "English (auto-generated)" },
            },
          ],
        },
      },
    });
  }
  if (url.pathname === "/api/timedtext") {
    return new Response(JSON3, { headers: { "content-type": "application/json; charset=UTF-8" } });
  }
  return new Response("not found", { status: 404 });
}

let win: ReturnType<typeof makeWindow>;
let optedIn = true;
let sessionRules: unknown = null;

beforeAll(() => {
  win = makeWindow();
  (globalThis as { window?: unknown }).window = win;

  // ── background worker ───────────────────────────────────────────────────
  let onMessage:
    | ((message: unknown, sender: { id: string }, sendResponse: (response: unknown) => void) => boolean)
    | null = null;
  const backgroundChrome = {
    runtime: {
      id: EXTENSION_ID,
      getURL: (path: string) => `chrome-extension://${EXTENSION_ID}/${path}`,
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
      onMessage: { addListener: (fn: typeof onMessage) => (onMessage = fn) },
    },
    declarativeNetRequest: {
      updateSessionRules: async (rules: unknown) => {
        sessionRules = rules;
      },
    },
  };
  const background = vm.createContext({
    chrome: backgroundChrome,
    fetch: youtubeStandIn,
    URL,
    Headers,
    AbortController,
    setTimeout,
    clearTimeout,
    console,
  });
  vm.runInContext(extensionFile("policy.js"), background);
  vm.runInContext(extensionFile("background.js"), background);

  // ── content script ──────────────────────────────────────────────────────
  const contentChrome = {
    runtime: {
      id: EXTENSION_ID,
      lastError: undefined,
      getManifest: () => JSON.parse(extensionFile("manifest.json")),
      sendMessage: (message: unknown, callback: (response: unknown) => void) => {
        onMessage?.(structuredClone(message), { id: EXTENSION_ID }, (response) =>
          setTimeout(() => callback(structuredClone(response)), 0),
        );
      },
    },
  };
  const content = vm.createContext({
    chrome: contentChrome,
    window: win,
    document: {
      querySelector: (selector: string) =>
        optedIn && selector.includes("transtudio-connector") ? { content: "1" } : null,
    },
  });
  vm.runInContext(extensionFile("content.js"), content);
});

afterAll(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("TranStudio Connector bridge", () => {
  it("answers the page's ping with the add-on version", async () => {
    const manifest = JSON.parse(extensionFile("manifest.json")) as { version: string };
    await expect(detectConnector(500, true)).resolves.toBe(manifest.version);
  });

  it("installs a header rule that only matches the add-on's own requests", () => {
    const rules = sessionRules as { addRules: Array<{ condition: { initiatorDomains: string[] } }> };
    expect(rules.addRules[0].condition.initiatorDomains).toEqual([EXTENSION_ID]);
  });

  it("runs the full caption ladder through the add-on and recovers from a bot-walled identity", async () => {
    seen.length = 0;
    const result = await fetchCaptionsViaConnector("dQw4w9WgXcQ", { detectTimeoutMs: 500 });
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;

    expect(result.via).toBe("connector");
    expect(result.title).toBe("Connector demo");
    expect(result.segments.map((segment) => segment.text)).toEqual([
      "hello from your own connection",
      "the cloud block never saw this request",
      "and the transcript still arrives",
    ]);
    // The WEB identity was refused first, then another identity succeeded.
    expect(result.attempts[0]).toMatch(/✗ innertube:web — LOGIN_REQUIRED/);
    expect(result.attempts.some((line) => line.startsWith("✓"))).toBe(true);

    // Nothing but plain headers left the add-on, and never with cookies.
    for (const request of seen) {
      expect(request.credentials).toBe("omit");
      expect(Object.keys(request.headers).every((name) => !["cookie", "origin", "referer"].includes(name))).toBe(
        true,
      );
    }
  });

  it("refuses anything outside the YouTube caption endpoints, before any network request", async () => {
    seen.length = 0;
    await expect(connectorFetch("https://example.com/steal")).rejects.toThrow(/Only youtube\.com/);
    await expect(connectorFetch("https://www.youtube.com/account")).rejects.toThrow(/path is not relayed/);
    expect(seen).toHaveLength(0);
  });

  it("stays silent on pages without the opt-in tag", async () => {
    optedIn = false;
    try {
      await expect(detectConnector(150, true)).resolves.toBeNull();
    } finally {
      optedIn = true;
    }
  });
});
