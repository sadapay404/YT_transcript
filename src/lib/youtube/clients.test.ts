import { afterEach, describe, expect, it, vi } from "vitest";

import {
  INNERTUBE_CLIENTS,
  PRIMARY_CLIENT,
  playerRequest,
  proxiedFetcher,
  timedTextHeaders,
  unsignedTimedTextUrl,
} from "@/lib/youtube/clients";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TRANSCRIPT_PROXY_URL;
});

describe("client identities", () => {
  it("tries several identities, since YouTube reveals captions per client", () => {
    const ids = INNERTUBE_CLIENTS.map((client) => client.id);
    expect(ids).toEqual(["web", "android-vr", "web-embedded", "tv-embedded"]);
    // ios and android return HTTP 400 in production — a configuration failure,
    // not a fact about the video — so they must never be on the ladder.
    expect(ids).not.toContain("ios");
    expect(ids).not.toContain("android");
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("web");
    // The client used for follow-up requests must be one of the ladder's own.
    expect(ids).toContain(PRIMARY_CLIENT.id);
  });

  it("gives every client the three things YouTube validates", () => {
    for (const client of INNERTUBE_CLIENTS) {
      const request = playerRequest(client);

      // 1. Its own public API key.
      expect(request.url).toContain(`key=${client.apiKey}`);
      // 2. Its numeric client id.
      expect(request.headers["x-youtube-client-name"]).toBe(String(client.clientNameId));
      // 3. A client version that matches the body context.
      const version = (client.context.client as { clientVersion?: string }).clientVersion;
      expect(version).toBeTruthy();
      expect(request.headers["x-youtube-client-version"]).toBe(String(version));
      // And a User-Agent that belongs to that client.
      expect(client.headers["user-agent"]).toBeTruthy();
    }
  });

  it("never sends the web consent cookie as an unsupported client", () => {
    for (const client of INNERTUBE_CLIENTS) {
      const headers = timedTextHeaders(client);
      if (client.consent) {
        expect(headers.cookie).toBeTruthy();
      } else {
        expect(headers.cookie).toBeUndefined();
      }
    }
  });
});

describe("unsignedTimedTextUrl", () => {
  it("builds a plain json3 caption URL, optionally as ASR", () => {
    const url = new URL(unsignedTimedTextUrl("dQw4w9WgXcQ", "es"));
    expect(url.pathname).toBe("/api/timedtext");
    expect(url.searchParams.get("v")).toBe("dQw4w9WgXcQ");
    expect(url.searchParams.get("lang")).toBe("es");
    expect(url.searchParams.get("fmt")).toBe("json3");
    expect(url.searchParams.get("kind")).toBeNull();

    const asr = new URL(unsignedTimedTextUrl("dQw4w9WgXcQ", "en", true));
    expect(asr.searchParams.get("kind")).toBe("asr");
  });
});

describe("proxiedFetcher", () => {
  it("returns undefined (a no-op) when no proxy is configured", () => {
    expect(proxiedFetcher()).toBeUndefined();
  });

  it("prefixes the target URL when the proxy is a prefix", async () => {
    process.env.TRANSCRIPT_PROXY_URL = "https://proxy.example/";
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(typeof input === "string" ? input : input.toString());
        return new Response("ok");
      }),
    );

    const proxy = proxiedFetcher();
    expect(proxy).toBeTypeOf("function");
    await proxy!("https://www.youtube.com/youtubei/v1/player");
    expect(calls[0]).toBe("https://proxy.example/https://www.youtube.com/youtubei/v1/player");
  });

  it("substitutes {url} when the proxy is a template", async () => {
    process.env.TRANSCRIPT_PROXY_URL = "https://proxy.example/?target={url}";
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(typeof input === "string" ? input : input.toString());
        return new Response("ok");
      }),
    );

    await proxiedFetcher()!("https://www.youtube.com/api/timedtext?v=abc");
    expect(calls[0]).toBe(
      `https://proxy.example/?target=${encodeURIComponent("https://www.youtube.com/api/timedtext?v=abc")}`,
    );
  });

  it("passes the request body through untouched (Innertube needs its POST)", async () => {
    process.env.TRANSCRIPT_PROXY_URL = "https://proxy.example/";
    const inits: Array<RequestInit | undefined> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        inits.push(init);
        return new Response("ok");
      }),
    );

    await proxiedFetcher()!("https://www.youtube.com/youtubei/v1/player", {
      method: "POST",
      body: '{"videoId":"abc"}',
    });
    expect(inits[0]?.method).toBe("POST");
    expect(inits[0]?.body).toBe('{"videoId":"abc"}');
  });
});
