/*
 * TranStudio Connector — request policy.
 *
 * The only thing this add-on does is fetch a few public YouTube caption
 * endpoints on behalf of a TranStudio page, so the request leaves from the
 * visitor's own connection instead of a blocked cloud server. Everything else
 * is refused here, before any network request is made:
 *   • https only, youtube.com hosts only;
 *   • three paths only: the Innertube player, timedtext captions, the watch page;
 *   • GET/POST only, small bodies, a short list of plain headers;
 *   • no cookies are ever sent (the fetch uses credentials: "omit").
 */
(function (root) {
  "use strict";

  var ALLOWED_HOSTS = ["www.youtube.com", "youtube.com", "m.youtube.com"];
  var ALLOWED_PATHS = ["/youtubei/v1/player", "/api/timedtext", "/watch"];
  var ALLOWED_HEADERS = [
    "accept",
    "accept-language",
    "content-type",
    "user-agent",
    "x-goog-visitor-id",
    "x-youtube-client-name",
    "x-youtube-client-version",
  ];
  var MAX_REQUEST_BODY_CHARS = 64 * 1024;
  var MAX_RESPONSE_CHARS = 8 * 1024 * 1024;
  var TIMEOUT_MS = 12000;

  function fail(error) {
    return { ok: false, error: error };
  }

  function checkRequest(raw) {
    if (!raw || typeof raw !== "object") return fail("Malformed request.");
    if (typeof raw.url !== "string" || raw.url.length > 4096) return fail("Malformed URL.");

    var url;
    try {
      url = new URL(raw.url);
    } catch (error) {
      return fail("Malformed URL" + (error && error.message ? " (" + error.message + ")." : "."));
    }
    if (url.protocol !== "https:") return fail("Only https requests are relayed.");
    if (url.username || url.password || (url.port && url.port !== "443")) {
      return fail("That URL form is not relayed.");
    }
    if (ALLOWED_HOSTS.indexOf(url.hostname) === -1) {
      return fail("Only youtube.com is relayed (asked for " + url.hostname + ").");
    }
    if (ALLOWED_PATHS.indexOf(url.pathname) === -1) {
      return fail("That YouTube path is not relayed (" + url.pathname + ").");
    }

    var method = typeof raw.method === "string" ? raw.method.toUpperCase() : "GET";
    if (method !== "GET" && method !== "POST") return fail("Only GET and POST are relayed.");

    var body;
    if (method === "POST") {
      if (typeof raw.body !== "string") return fail("A POST needs a text body.");
      if (raw.body.length > MAX_REQUEST_BODY_CHARS) return fail("Request body too large.");
      body = raw.body;
    }

    var headers = {};
    var incoming = raw.headers && typeof raw.headers === "object" ? raw.headers : {};
    Object.keys(incoming).forEach(function (name) {
      var key = String(name).toLowerCase();
      var value = incoming[name];
      if (ALLOWED_HEADERS.indexOf(key) !== -1 && typeof value === "string" && value.length <= 1024) {
        headers[key] = value;
      }
    });

    return {
      ok: true,
      request: { url: url.toString(), method: method, headers: headers, body: body },
    };
  }

  root.TranStudioPolicy = {
    ALLOWED_HOSTS: ALLOWED_HOSTS,
    ALLOWED_PATHS: ALLOWED_PATHS,
    ALLOWED_HEADERS: ALLOWED_HEADERS,
    MAX_RESPONSE_CHARS: MAX_RESPONSE_CHARS,
    TIMEOUT_MS: TIMEOUT_MS,
    checkRequest: checkRequest,
  };
})(globalThis);
