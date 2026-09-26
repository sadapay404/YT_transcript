/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  TranStudio Connector — the page side of the browser add-on bridge.
 * ─────────────────────────────────────────────────────────────────────────────
 *  YouTube refuses caption requests from cloud IPs (Vercel, AWS, …), and a web
 *  page cannot read youtube.com itself because of CORS. The optional
 *  TranStudio Connector add-on (see /extension) closes that gap: its content
 *  script answers `window.postMessage` requests from this page, and its
 *  background worker fetches a small allow-list of YouTube caption endpoints
 *  from the visitor's own connection.
 *
 *  `connectorFetch` is a drop-in `fetch`, so the exact same caption ladder the
 *  server runs (`fetchCaptionsDirect`) runs in the browser through the add-on —
 *  no second implementation to keep in sync.
 */

export const CONNECTOR_PAGE_SOURCE = "transtudio-page";
export const CONNECTOR_SOURCE = "transtudio-connector";
/** Where the site serves the packed add-on (built by scripts/pack-connector.mjs). */
export const CONNECTOR_DOWNLOAD_PATH = "/transtudio-connector.zip";

export interface SerializedRequest {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
}

export interface ConnectorResponsePayload {
  ok: boolean;
  status?: number;
  statusText?: string;
  url?: string;
  contentType?: string;
  body?: string;
  error?: string;
}

/** Headers a page cannot set on a real fetch either; dropped before sending. */
const DROPPED_HEADERS = new Set(["cookie", "origin", "referer", "host", "content-length"]);

/** Turn `fetch(input, init)` arguments into a plain, postMessage-safe object. */
export function serializeRequest(input: RequestInfo | URL, init: RequestInit = {}): SerializedRequest {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const method = (init.method ?? (typeof input === "object" && "method" in input ? input.method : "GET"))
    .toUpperCase();
  if (method !== "GET" && method !== "POST") {
    throw new Error(`The TranStudio Connector only relays GET and POST (got ${method}).`);
  }

  const headers: Record<string, string> = {};
  new Headers(init.headers ?? undefined).forEach((value, name) => {
    if (!DROPPED_HEADERS.has(name.toLowerCase())) headers[name.toLowerCase()] = value;
  });

  let body: string | undefined;
  if (method === "POST") {
    if (typeof init.body !== "string") {
      throw new Error("The TranStudio Connector only relays text request bodies.");
    }
    body = init.body;
  }

  return { url, method, headers, ...(body !== undefined ? { body } : {}) };
}

/** Rebuild a real `Response` from the add-on's answer. Throws like fetch does. */
export function toResponse(payload: ConnectorResponsePayload): Response {
  if (!payload.ok) {
    throw new TypeError(payload.error || "The TranStudio Connector could not reach YouTube.");
  }
  const status = typeof payload.status === "number" && payload.status >= 200 ? payload.status : 502;
  const nullBody = status === 204 || status === 205 || status === 304;
  const headers = new Headers();
  if (payload.contentType) headers.set("content-type", payload.contentType);
  return new Response(nullBody ? null : payload.body ?? "", {
    status,
    statusText: payload.statusText ?? "",
    headers,
  });
}

/* ───────────────────────────── message plumbing ─────────────────────────── */

let counter = 0;
const nextId = () => `tt-${Date.now().toString(36)}-${(counter += 1)}`;

interface ConnectorMessage extends ConnectorResponsePayload {
  source?: string;
  v?: number;
  id?: string;
  type?: string;
  version?: string;
}

function request<T extends ConnectorMessage>(
  type: "ping" | "fetch",
  extra: Record<string, unknown>,
  timeoutMs: number,
  signal?: AbortSignal | null,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("The TranStudio Connector is only available in the browser."));
      return;
    }
    const id = nextId();
    let settled = false;

    const cleanup = () => {
      settled = true;
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data as ConnectorMessage | null;
      if (!data || data.source !== CONNECTOR_SOURCE || data.v !== 1 || data.id !== id) return;
      cleanup();
      resolve(data as T);
    };
    const onAbort = () => {
      if (settled) return;
      cleanup();
      reject(new DOMException("The request was aborted.", "AbortError"));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      cleanup();
      reject(new TypeError("The TranStudio Connector did not answer in time."));
    }, timeoutMs);

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    window.addEventListener("message", onMessage);
    window.postMessage({ source: CONNECTOR_PAGE_SOURCE, v: 1, id, type, ...extra }, window.location.origin);
  });
}

/* ─────────────────────────────── public API ─────────────────────────────── */

let detected: Promise<string | null> | null = null;

/**
 * Resolve to the add-on version when the TranStudio Connector is installed and
 * enabled on this page, otherwise `null`. A positive answer is cached; a
 * negative one is re-checked next time (the visitor may install it meanwhile).
 */
export function detectConnector(timeoutMs = 700): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (detected) return detected;
  const attempt = request<ConnectorMessage>("ping", {}, timeoutMs)
    .then((reply) => (reply.type === "pong" ? reply.version ?? "1" : null))
    .catch(() => null);
  detected = attempt;
  attempt.then((version) => {
    if (!version) detected = null;
  });
  return attempt;
}

/** A `fetch` that goes out through the visitor's own connection via the add-on. */
export const connectorFetch: typeof fetch = async (input, init) => {
  const serialized = serializeRequest(input, init ?? {});
  const reply = await request<ConnectorMessage>(
    "fetch",
    { request: serialized },
    // The add-on has its own 12s timeout; leave room for it to report.
    14_000,
    init?.signal ?? null,
  );
  return toResponse(reply);
};
