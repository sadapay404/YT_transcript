/*
 * TranStudio Connector — page bridge.
 *
 * Runs on TranStudio pages only (the site must also carry
 * <meta name="transtudio-connector">). It answers two messages from the page:
 *   ping  → pong with the add-on version, so the site knows it is installed;
 *   fetch → forwarded to the background worker, which applies the policy.
 */
(() => {
  const api = globalThis.chrome ?? globalThis.browser;
  const PAGE = "transtudio-page";
  const CONNECTOR = "transtudio-connector";
  const version = api.runtime.getManifest().version;

  const optedIn = () => Boolean(document.querySelector('meta[name="transtudio-connector"]'));

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || typeof data !== "object" || data.source !== PAGE || data.v !== 1) return;
    if (typeof data.id !== "string" || !optedIn()) return;

    const reply = (payload) =>
      window.postMessage({ ...payload, source: CONNECTOR, v: 1, id: data.id }, window.location.origin);

    if (data.type === "ping") {
      reply({ type: "pong", version });
      return;
    }

    if (data.type === "fetch") {
      try {
        api.runtime.sendMessage({ type: "tt-fetch", request: data.request }, (response) => {
          const lastError = api.runtime.lastError;
          if (lastError || !response) {
            reply({
              type: "response",
              ok: false,
              error: (lastError && lastError.message) || "The connector did not answer.",
            });
            return;
          }
          reply({ ...response, type: "response" });
        });
      } catch {
        // Happens after the add-on was updated/reloaded: this tab still has
        // the old script. A page refresh fixes it.
        reply({
          type: "response",
          ok: false,
          error: "The connector was updated — refresh this page once.",
        });
      }
    }
  });
})();
