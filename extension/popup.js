const api = globalThis.chrome ?? globalThis.browser;
document.getElementById("version").textContent = api.runtime.getManifest().version;
