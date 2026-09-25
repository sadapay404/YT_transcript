/**
 * A tiny stand-in for YouTube, used to prove the caption ladder works over
 * real HTTP. It deliberately reproduces the reported bug: the WEB identity is
 * bot-walled exactly as it is from datacenter IPs, while another client
 * identity is allowed to see captions.
 *
 * Usage:
 *   node scripts/fake-youtube.mjs
 *   TRANSTUDIO_TEST_FAKE_YOUTUBE=http://127.0.0.1:4010/ \
 *     ./node_modules/.bin/vitest run src/lib/youtube/pipeline.integration.test.ts
 *
 * …or point a running dev server at it to watch the app recover in the browser:
 *
 *   TRANSCRIPT_PROXY_URL=http://127.0.0.1:4010/ npm run dev
 */
import { createServer } from "node:http";

const WORDS = `so the first thing I want to talk about is how a neural network actually learns
which sounds obvious but bear with me because the answer is surprisingly visual
imagine a function with a few thousand inputs and one output
gradient descent is just asking which way is downhill
and the answer comes back as a direction for every single weight`.split(/\s+/);

/** Word-level json3, like a real auto-generated track (times in ms). */
function json3Body() {
  const events = [];
  let t = 240;
  for (let i = 0; i < WORDS.length; i += 1) {
    const word = WORDS[i];
    const dur = 260 + (i % 4) * 70;
    events.push({ tStartMs: t, dDurationMs: dur, segs: [{ utf8: `${word} ` }] });
    t += dur;
  }
  return JSON.stringify({ wireMagic: "pb3", events });
}

const SIGNED_BASE =
  "https://www.youtube.com/api/timedtext?v=aircAruvnKk&lang=en&expire=1767225600&signature=Cg0KC2VLZzR2OE5mZ0FZ&caps=asr";

function playerResponse(clientName) {
  return {
    playabilityStatus: { status: "OK" },
    videoDetails: {
      videoId: "aircAruvnKk",
      title: "But what is a neural network?",
      author: "3Blue1Brown",
      lengthSeconds: "1140",
    },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          {
            baseUrl: SIGNED_BASE,
            languageCode: "en",
            kind: "asr",
            name: { simpleText: "English (auto-generated)" },
          },
        ],
      },
    },
    // Which identity answered — visible in the diagnostics the app prints.
    _answeredAs: clientName,
  };
}

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const target = decodeURIComponent(url.pathname);
  const clientName = req.headers["x-youtube-client-name"] ?? "?";
  const key = url.searchParams.get("key") ?? "";

  const send = (status, body, type = "application/json") => {
    res.writeHead(status, { "content-type": type });
    res.end(body);
  };

  // ── Innertube player: the WEB identity is bot-walled on purpose ──────────
  if (target.includes("youtubei/v1/player")) {
    if (clientName === "1" || key.includes("AO_FJ2SlqU8")) {
      return send(
        200,
        JSON.stringify({
          playabilityStatus: {
            status: "LOGIN_REQUIRED",
            reason: "Sign in to confirm you're not a bot",
          },
        }),
      );
    }
    return send(200, JSON.stringify(playerResponse(clientName)));
  }

  // ── Captions ─────────────────────────────────────────────────────────────
  if (target.includes("api/timedtext")) {
    return send(200, json3Body(), "application/json");
  }

  // ── Watch page (final rung) ─────────────────────────────────────────────
  if (target.includes("/watch")) {
    return send(
      200,
      `<html><body><script>var ytInitialPlayerResponse = ${JSON.stringify(
        playerResponse("watch-page"),
      )};</script></body></html>`,
      "text/html",
    );
  }

  return send(404, JSON.stringify({ error: "not found", target }));
});

server.listen(4010, "0.0.0.0", () => {
  console.log("[fake-youtube] listening on http://0.0.0.0:4010");
});
