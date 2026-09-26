import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, PREFERENCES_COOKIE } from "@/lib/constants";
import { parsePreferences, preferencesStorage, serializePreferences } from "@/lib/prefs";

/** Minimal `document.cookie` stand-in (the suite runs in plain node). */
function installCookieJar() {
  const jar = new Map<string, string>();
  (globalThis as { document?: unknown }).document = {
    get cookie() {
      return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    set cookie(line: string) {
      const [pair] = line.split(";");
      const at = pair.indexOf("=");
      jar.set(pair.slice(0, at), pair.slice(at + 1));
    },
  };
  return jar;
}

afterEach(() => {
  delete (globalThis as { document?: unknown }).document;
});

describe("preferences cookie storage (zustand persist adapter)", () => {
  it("returns JSON that zustand can parse, even though the cookie is percent-encoded", () => {
    const jar = installCookieJar();
    const value = serializePreferences({ ...DEFAULT_SETTINGS, theme: "glass", viewMode: "cinema" });
    preferencesStorage.setItem(PREFERENCES_COOKIE, value);

    // The raw cookie really is encoded…
    expect(jar.get(PREFERENCES_COOKIE)?.startsWith("%7B")).toBe(true);
    // …but the adapter hands back plain JSON, so hydration keeps the theme.
    const read = preferencesStorage.getItem();
    expect(read).not.toBeNull();
    const parsed = JSON.parse(read as string) as { state: { theme: string; viewMode: string } };
    expect(parsed.state.theme).toBe("glass");
    expect(parsed.state.viewMode).toBe("cinema");
    expect(parsePreferences(read).theme).toBe("glass");
  });

  it("returns null when no cookie exists", () => {
    installCookieJar();
    expect(preferencesStorage.getItem()).toBeNull();
  });
});
