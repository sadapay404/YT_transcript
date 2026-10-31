import { describe, expect, it } from "vitest";

import { serializeRequest, toResponse } from "@/lib/connector/client";
import "../../../extension/policy.js";

type Policy = {
  checkRequest: (raw: unknown) =>
    | { ok: true; request: { url: string; method: string; headers: Record<string, string>; body?: string } }
    | { ok: false; error: string };
};
const policy = (globalThis as unknown as { TranStudioPolicy: Policy }).TranStudioPolicy;

describe("connector request serialisation", () => {
  it("keeps method, body and plain headers, and drops browser-forbidden ones", () => {
    const serialized = serializeRequest("https://www.youtube.com/youtubei/v1/player?key=k", {
      method: "post",
      headers: {
        "content-type": "application/json",
        "X-YouTube-Client-Name": "28",
        cookie: "CONSENT=YES",
        origin: "https://www.youtube.com",
        referer: "https://www.youtube.com/",
      },
      body: '{"videoId":"abc"}',
    });
    expect(serialized).toEqual({
      url: "https://www.youtube.com/youtubei/v1/player?key=k",
      method: "POST",
      headers: { "content-type": "application/json", "x-youtube-client-name": "28" },
      body: '{"videoId":"abc"}',
    });
  });

  it("accepts URL objects and defaults to GET without a body", () => {
    const serialized = serializeRequest(new URL("https://www.youtube.com/api/timedtext?v=x&fmt=json3"));
    expect(serialized.method).toBe("GET");
    expect(serialized.body).toBeUndefined();
  });

  it("refuses methods and bodies the add-on would not relay", () => {
    expect(() => serializeRequest("https://www.youtube.com/watch?v=x", { method: "PUT" })).toThrow(/GET and POST/);
    expect(() =>
      serializeRequest("https://www.youtube.com/youtubei/v1/player", {
        method: "POST",
        body: new Uint8Array([1, 2]),
      }),
    ).toThrow(/text request bodies/);
  });
});

describe("connector responses", () => {
  it("rebuilds a real Response with status, type and body", async () => {
    const response = toResponse({ ok: true, status: 200, contentType: "application/json", body: '{"a":1}' });
    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual({ a: 1 });
  });

  it("passes YouTube error statuses through untouched", async () => {
    const response = toResponse({ ok: true, status: 429, body: "slow down" });
    expect(response.status).toBe(429);
    expect(await response.text()).toBe("slow down");
  });

  it("throws like fetch does when the add-on could not reach YouTube", () => {
    expect(() => toResponse({ ok: false, error: "offline" })).toThrow(TypeError);
  });
});

describe("add-on request policy (extension/policy.js)", () => {
  it("allows exactly the caption endpoints the caption ladder uses", () => {
    for (const url of [
      "https://www.youtube.com/youtubei/v1/player?key=k&prettyPrint=false",
      "https://www.youtube.com/api/timedtext?v=x&lang=en&fmt=json3",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&hl=en",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    ]) {
      expect(policy.checkRequest({ url, method: "GET" }).ok, url).toBe(true);
    }
  });

  it("refuses other hosts, paths, schemes and methods", () => {
    const refused = [
      { url: "https://example.com/watch?v=x" },
      { url: "https://www.youtube.com.evil.test/watch?v=x" },
      { url: "http://www.youtube.com/watch?v=x" },
      { url: "https://www.youtube.com/account" },
      { url: "https://www.youtube.com/youtubei/v1/browse" },
      { url: "https://user:pw@www.youtube.com/watch?v=x" },
      { url: "https://www.youtube.com:8443/watch?v=x" },
      { url: "https://www.youtube.com/watch?v=x", method: "DELETE" },
      { url: "not a url" },
      null,
    ];
    for (const raw of refused) {
      expect(policy.checkRequest(raw).ok, JSON.stringify(raw)).toBe(false);
    }
  });

  it("keeps only plain headers and caps request bodies", () => {
    const checked = policy.checkRequest({
      url: "https://www.youtube.com/youtubei/v1/player",
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: "SID=secret", Authorization: "x" },
      body: "{}",
    });
    expect(checked.ok).toBe(true);
    if (checked.ok) expect(checked.request.headers).toEqual({ "content-type": "application/json" });

    const huge = policy.checkRequest({
      url: "https://www.youtube.com/youtubei/v1/player",
      method: "POST",
      body: "x".repeat(70 * 1024),
    });
    expect(huge.ok).toBe(false);
  });
});
