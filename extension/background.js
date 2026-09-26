/*
 * TranStudio Connector — background worker.
 *
 * Receives a caption request from the content script, re-checks it against
 * the policy, fetches it from the visitor's own connection and hands back the
 * status and text. Chrome/Edge run this as a service worker (policy.js is
 * pulled in with importScripts); Firefox loads both files as background scripts.
 */
if (typeof importScripts === "function" && !globalThis.TranStudioPolicy) {
  importScripts("policy.js");
}

const api = globalThis.chrome ?? globalThis.browser;
const policy = globalThis.TranStudioPolicy;

/*
 * Requests sent by an extension carry `Origin: chrome-extension://…`. Strip it
 * and present youtube.com as the referrer, so the request looks like any other
 * caption read. The rule only matches requests this add-on starts itself
 * (initiator = our own extension host); YouTube's own traffic is never touched.
 */
async function installHeaderRule() {
  try {
    const dnr = api.declarativeNetRequest;
    if (!dnr || typeof dnr.updateSessionRules !== "function") return;
    const ownHost = new URL(api.runtime.getURL("")).host;
    await dnr.updateSessionRules({
      removeRuleIds: [1],
      addRules: [
        {
          id: 1,
          priority: 1,
          action: {
            type: "modifyHeaders",
            requestHeaders: [
              { header: "origin", operation: "remove" },
              { header: "referer", operation: "set", value: "https://www.youtube.com/" },
            ],
          },
          condition: {
            requestDomains: ["youtube.com"],
            initiatorDomains: [ownHost],
            resourceTypes: ["xmlhttprequest", "other"],
          },
        },
      ],
    });
  } catch {
    // Best effort — the relay still works without the header tidy-up.
  }
}

api.runtime.onInstalled?.addListener(installHeaderRule);
api.runtime.onStartup?.addListener(installHeaderRule);
installHeaderRule();

async function relay(raw) {
  const checked = policy.checkRequest(raw);
  if (!checked.ok) return { ok: false, error: checked.error };

  const { url, method, headers, body } = checked.request;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), policy.TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      credentials: "omit",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
    });
    let text = await response.text();
    if (text.length > policy.MAX_RESPONSE_CHARS) text = text.slice(0, policy.MAX_RESPONSE_CHARS);
    return {
      ok: true,
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      contentType: response.headers.get("content-type") || "",
      body: text,
    };
  } catch (error) {
    const aborted = error && error.name === "AbortError";
    return {
      ok: false,
      error: aborted ? "YouTube took too long to answer." : String((error && error.message) || error),
    };
  } finally {
    clearTimeout(timer);
  }
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "tt-fetch") return false;
  // Only our own content script may ask.
  if (sender.id !== api.runtime.id) return false;
  relay(message.request).then(sendResponse, (error) =>
    sendResponse({ ok: false, error: String((error && error.message) || error) }),
  );
  return true; // keep the channel open for the async answer
});
