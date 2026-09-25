import { describe, expect, it } from "vitest";

import {
  decodeEntities,
  detectCaptionFormat,
  extractInitialPlayerResponse,
  parseCaptionBody,
  parseClassicXml,
  parseJson3Body,
  parseSrv3Xml,
  parseVtt,
  readPlayerResponse,
} from "@/lib/youtube/parse";

/* ──────────────────────────── format detection ──────────────────────────── */

describe("detectCaptionFormat", () => {
  it("recognises every shape YouTube serves", () => {
    expect(detectCaptionFormat('{"wireMagic":"pb3","events":[]}')).toBe("json3");
    expect(detectCaptionFormat('{"events":[{"tStartMs":0}]}')).toBe("json3");
    expect(detectCaptionFormat('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi')).toBe("vtt");
    expect(detectCaptionFormat('<?xml version="1.0"?><timedtext><body><p t="100" d="900">hi</p></body></timedtext>')).toBe("srv3");
    expect(detectCaptionFormat('<?xml version="1.0"?><transcript><text start="1.5" dur="2">hi</text></transcript>')).toBe("classic");
  });

  it("handles leading whitespace and the srv3 root without <body>", () => {
    expect(detectCaptionFormat('  \n  {"events":[]}')).toBe("json3");
    expect(detectCaptionFormat('<timedtext format="3"><p t="0" d="10">x</p></timedtext>')).toBe("srv3");
  });

  it("reports unknown instead of guessing (a consent page, an error body)", () => {
    expect(detectCaptionFormat("<!DOCTYPE html><html>consent</html>")).toBe("unknown");
    expect(detectCaptionFormat("")).toBe("unknown");
    // JSON that is not a caption payload must not be mistaken for json3.
    expect(detectCaptionFormat('{"error":"nope"}')).toBe("unknown");
  });
});

/* ─────────────────────────────── json3 ──────────────────────────────────── */

describe("parseJson3Body", () => {
  it("parses line-level events with millisecond timings", () => {
    const body = JSON.stringify({
      wireMagic: "pb3",
      events: [
        { tStartMs: 240, dDurationMs: 2000, segs: [{ utf8: "Hello and welcome " }, { utf8: "to the show." }] },
        { tStartMs: 3240, dDurationMs: 1500, segs: [{ utf8: "Today we talk pricing." }] },
      ],
    });

    const result = parseJson3Body(body);
    expect(result.unit).toBe("ms");
    expect(result.empty).toBe(false);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toMatchObject({
      text: "Hello and welcome to the show.",
      offset: 240,
      duration: 2000,
    });
  });

  it("rebuilds readable lines from word-level ASR events using the \\n marker", () => {
    // Auto-captions arrive as many tiny events; "\n" marks a line break.
    const body = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 400, segs: [{ utf8: "So " }] },
        { tStartMs: 400, dDurationMs: 400, segs: [{ utf8: "the " }] },
        { tStartMs: 800, dDurationMs: 400, segs: [{ utf8: "first " }] },
        { tStartMs: 1200, dDurationMs: 400, segs: [{ utf8: "thing\n" }] },
        { tStartMs: 1600, dDurationMs: 500, segs: [{ utf8: "is " }] },
        { tStartMs: 2100, dDurationMs: 500, segs: [{ utf8: "attention." }] },
      ],
    });

    const result = parseJson3Body(body);
    expect(result.segments.map((s) => s.text)).toEqual([
      "So the first thing",
      "is attention.",
    ]);
    expect(result.segments[0].offset).toBe(0);
    // Duration spans the whole line, not just the first word.
    expect(result.segments[0].duration).toBe(1600);
  });

  it("splits lines on long pauses", () => {
    const body = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 800, segs: [{ utf8: "First thought." }] },
        { tStartMs: 5000, dDurationMs: 800, segs: [{ utf8: "Much later." }] },
      ],
    });

    expect(parseJson3Body(body).segments.map((s) => s.text)).toEqual([
      "First thought.",
      "Much later.",
    ]);
  });

  it("ignores segs-less and empty events (real ASR payloads are full of them)", () => {
    const body = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 500, aAppend: 1 },
        { tStartMs: 500, dDurationMs: 500, segs: [] },
        { tStartMs: 1000, dDurationMs: 500, segs: [{ utf8: "\n" }] },
        { tStartMs: 1500, dDurationMs: 900, segs: [{ utf8: "Real text." }] },
      ],
    });

    const result = parseJson3Body(body);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].text).toBe("Real text.");
  });

  it("gives instantaneous events a visible window", () => {
    const body = JSON.stringify({
      events: [{ tStartMs: 1000, dDurationMs: 0, segs: [{ utf8: "Blip" }] }],
    });
    const segment = parseJson3Body(body).segments[0];
    expect(segment.duration).toBeGreaterThanOrEqual(200);
  });

  it("survives malformed JSON without throwing", () => {
    const result = parseJson3Body("{not json");
    expect(result.empty).toBe(true);
    expect(result.segments).toEqual([]);
  });

  it("flushes a run-on line rather than emitting a 3-minute caption", () => {
    const events = Array.from({ length: 400 }, (_, index) => ({
      tStartMs: index * 400,
      dDurationMs: 400,
      segs: [{ utf8: "word " }],
    }));
    const result = parseJson3Body(JSON.stringify({ events }));
    expect(result.segments.length).toBeGreaterThan(1);
    for (const segment of result.segments) {
      expect(segment.text.length).toBeLessThanOrEqual(130);
      expect(segment.duration).toBeLessThanOrEqual(9_200);
    }
  });
});

/* ───────────────────────────── XML shapes ───────────────────────────────── */

describe("parseSrv3Xml", () => {
  it("parses <p t d> with word nodes and reports milliseconds", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?><timedtext format="3"><body>
      <p t="0" d="2200"><s>Hello</s><s> world</s></p>
      <p t="2200" d="1800"><s>Second line.</s></p>
    </body></timedtext>`;

    const result = parseSrv3Xml(xml);
    expect(result.unit).toBe("ms");
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toMatchObject({ text: "Hello world", offset: 0, duration: 2200 });
  });

  it("handles paragraphs without word nodes and missing d attributes", () => {
    const xml = `<body><p t="1000">Bare text</p><p t="2000" d="500">With duration</p></body>`;
    const result = parseSrv3Xml(xml);
    expect(result.segments.map((s) => s.text)).toEqual(["Bare text", "With duration"]);
    expect(result.segments[0].duration).toBeGreaterThan(0);
  });

  it("decodes entities", () => {
    const xml = `<p t="0" d="100"><s>Tom &amp; Jerry &#39;quote&#39;</s></p>`;
    expect(parseSrv3Xml(xml).segments[0].text).toBe("Tom & Jerry 'quote'");
  });
});

describe("parseClassicXml", () => {
  it("parses <text start dur> and reports seconds", () => {
    const xml = `<?xml version="1.0"?><transcript>
      <text start="0" dur="2.2">Hello and welcome</text>
      <text start="2.2" dur="1.8">to the show.</text>
    </transcript>`;

    const result = parseClassicXml(xml);
    expect(result.unit).toBe("s");
    expect(result.segments[1]).toMatchObject({
      text: "to the show.",
      offset: 2.2,
      duration: 1.8,
    });
  });

  it("decodes entities and tolerates missing dur", () => {
    const xml = `<transcript><text start="5">A &amp; B</text></transcript>`;
    const result = parseClassicXml(xml);
    expect(result.segments[0].text).toBe("A & B");
    expect(result.segments[0].duration).toBeGreaterThan(0);
  });
});

/* ───────────────────────────────── VTT ──────────────────────────────────── */

describe("parseVtt", () => {
  it("parses WEBVTT cues with and without hours", () => {
    const vtt = `WEBVTT
Kind: captions
Language: en

00:00:01.000 --> 00:00:03.500
Hello and welcome

01:02:03.000 --> 01:02:05.000 align:start position:0%
Today we talk pricing.
`;

    const result = parseVtt(vtt);
    expect(result.unit).toBe("s");
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toMatchObject({ text: "Hello and welcome", offset: 1, duration: 2.5 });
    expect(result.segments[1].offset).toBeCloseTo(3723, 3);
  });

  it("strips inline tags and speaker prefixes", () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
<v SPEAKER>Hello <c.yellow>there</c></v>

00:00:03.000 --> 00:00:04.000
SPEAKER 1: Second line
`;
    const result = parseVtt(vtt);
    expect(result.segments[0].text).toBe("Hello there");
    expect(result.segments[1].text).toBe("Second line");
  });

  it("ignores headers and malformed blocks", () => {
    expect(parseVtt("WEBVTT\n\nNOTE nothing here\n\n").segments).toEqual([]);
  });
});

/* ────────────────────────── parseCaptionBody ────────────────────────────── */

describe("parseCaptionBody", () => {
  it("dispatches on the detected format and reports the unit", () => {
    const json = parseCaptionBody('{"events":[{"tStartMs":0,"dDurationMs":1000,"segs":[{"utf8":"a"}]}]}');
    expect(json).toMatchObject({ format: "json3", unit: "ms", empty: false });

    const xml = parseCaptionBody('<transcript><text start="1" dur="2">a</text></transcript>');
    expect(xml).toMatchObject({ format: "classic", unit: "s", empty: false });
  });

  it("flags an unrecognised body as empty instead of pretending it parsed", () => {
    const result = parseCaptionBody("<html>consent page</html>");
    expect(result.empty).toBe(true);
    expect(result.format).toBe("unknown");
  });
});

/* ─────────────────────────── entity decoding ────────────────────────────── */

describe("decodeEntities", () => {
  it("decodes named, decimal and hex entities", () => {
    expect(decodeEntities("a &amp; b &lt;c&gt; &quot;d&quot;")).toBe('a & b <c> "d"');
    expect(decodeEntities("&#39;quoted&#39;")).toBe("'quoted'");
    expect(decodeEntities("&#x1F600;")).toBe("😀");
  });

  it("leaves bare ampersands intact instead of eating them", () => {
    expect(decodeEntities("AT&T and R&D")).toBe("AT&T and R&D");
  });
});

/* ──────────────────── watch page / player response ──────────────────────── */

describe("extractInitialPlayerResponse", () => {
  it("extracts JSON containing nested braces and escapes", () => {
    const player = {
      playabilityStatus: { status: "OK" },
      videoDetails: { videoId: "abc", title: 'He said "hi" {really}', lengthSeconds: "90" },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [{ baseUrl: "https://x/timedtext?a=1", languageCode: "en" }],
        },
      },
    };
    const html = `<script>var ytInitialPlayerResponse = ${JSON.stringify(player)};</script>`;

    const extracted = extractInitialPlayerResponse(html) as typeof player;
    expect(extracted.videoDetails.title).toBe('He said "hi" {really}');
    expect(extracted.captions.playerCaptionsTracklistRenderer.captionTracks).toHaveLength(1);
  });

  it("returns null for a consent page with no player response", () => {
    expect(extractInitialPlayerResponse("<html>Before you continue…</html>")).toBeNull();
  });

  it("returns null instead of throwing on truncated JSON", () => {
    expect(extractInitialPlayerResponse('ytInitialPlayerResponse = {"a":{')).toBeNull();
  });
});

describe("readPlayerResponse", () => {
  it("normalises tracks, details and the auto-generated flag", () => {
    const info = readPlayerResponse({
      playabilityStatus: { status: "OK" },
      videoDetails: { videoId: "v1", title: "T", author: "A", lengthSeconds: "120" },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            { baseUrl: "https://x/1", languageCode: "en", name: { simpleText: "English" } },
            { baseUrl: "https://x/2", languageCode: "en", kind: "asr", name: { runs: [{ text: "English (auto-generated)" }] } },
          ],
        },
      },
    });

    expect(info.status).toBe("OK");
    expect(info.title).toBe("T");
    expect(info.lengthSeconds).toBe(120);
    expect(info.captionTracks).toHaveLength(2);
    expect(info.captionTracks[1].name).toBe("English (auto-generated)");
    expect(info.onlyAutoGenerated).toBe(false);
  });

  it("flags tracks that are all auto-generated, and drops unusable ones", () => {
    const info = readPlayerResponse({
      playabilityStatus: { status: "OK" },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            { languageCode: "en", kind: "asr" }, // no baseUrl → dropped
            { baseUrl: "https://x/1", languageCode: "en", kind: "asr" },
          ],
        },
      },
    });

    expect(info.captionTracks).toHaveLength(1);
    expect(info.onlyAutoGenerated).toBe(true);
  });

  it("reports a bot wall with its reason", () => {
    const info = readPlayerResponse({
      playabilityStatus: {
        status: "LOGIN_REQUIRED",
        reason: "Sign in to confirm you're not a bot",
      },
    });
    expect(info.status).toBe("LOGIN_REQUIRED");
    expect(info.reason).toContain("not a bot");
    expect(info.captionTracks).toEqual([]);
  });
});
