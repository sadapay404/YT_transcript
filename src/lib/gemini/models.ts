/**
 * Gemini model discovery — server only.
 *
 * Google renames and retires Gemini models often, and retires them per
 * account ("no longer available to new users"). Hardcoding names is what made
 * the assistant fail before it answered. Instead, ask Google which models this
 * key can call (ListModels) and rank them for the job: the newest stable Flash
 * first (quality), then Flash-Lite (the most generous free-tier limits).
 * Pro models are skipped — they are not part of the free tier.
 */
import { GEMINI } from "@/lib/constants";
import { getGeminiClient } from "@/lib/gemini/client";

export interface ListedModel {
  name?: string;
  supportedActions?: string[];
}

/** Anything that is not a plain text-generation Flash model. */
const EXCLUDED = /(tts|live|image|audio|embedding|embed|transcri|vision|robotics|computer-use|aqa|native|learnlm|nano|banana|veo|imagen|gemma|thinking-exp|exp-\d|-pro\b|pro-)/i;

/**
 * Rank ListModels output, best first. Pure and exported for tests.
 *
 * Order: family (flash → flash-lite → other), stable before preview, then
 * newest version, with Google's `-latest` aliases after the stable versions of
 * their family.
 */
export function rankGeminiModels(models: ListedModel[]): string[] {
  const seen = new Set<string>();
  const ranked: Array<{ id: string; family: number; stability: number; version: number }> = [];
  for (const model of models) {
    const id = (model.name ?? "").replace(/^models\//, "").trim();
    if (!id || seen.has(id) || !/^gemini-/i.test(id)) continue;
    if (model.supportedActions && !model.supportedActions.includes("generateContent")) continue;
    if (EXCLUDED.test(id)) continue;
    const lite = /flash-lite/i.test(id);
    const flash = /flash/i.test(id);
    if (!flash) continue;
    seen.add(id);
    const versionMatch = id.match(/gemini-(\d+(?:\.\d+)?)/i);
    const version = versionMatch ? Number(versionMatch[1]) : 0;
    const alias = /latest/i.test(id);
    const preview = /preview|exp/i.test(id);
    ranked.push({
      id,
      family: lite ? 1 : 0,
      // stable (0) → alias (1) → preview (2)
      stability: preview ? 2 : alias ? 1 : 0,
      version: alias ? 999 : version,
    });
  }
  ranked.sort(
    (a, b) =>
      a.family - b.family ||
      a.stability - b.stability ||
      b.version - a.version ||
      // Undated ids (`gemini-3.5-flash`) before dated snapshots (`-001`).
      a.id.length - b.id.length ||
      a.id.localeCompare(b.id),
  );
  // Interleave so a quota hit on one Flash still finds a Lite quickly:
  // best flash, best lite, then the rest in rank order.
  const flash = ranked.filter((entry) => entry.family === 0).map((entry) => entry.id);
  const lite = ranked.filter((entry) => entry.family === 1).map((entry) => entry.id);
  const head = [flash[0], lite[0]].filter(Boolean) as string[];
  return [...new Set([...head, ...flash, ...lite])];
}

let cache: { at: number; models: string[] } | null = null;
let inflight: Promise<string[]> | null = null;

/**
 * The ranked models this key can call, cached per server instance. Never
 * throws: an unreachable ListModels just means the static fallbacks are used.
 */
export async function discoverGeminiModels(timeoutMs = 2_500): Promise<string[]> {
  if (cache && Date.now() - cache.at < GEMINI.modelCacheTtlMs) return cache.models;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const ai = getGeminiClient();
      const listed: ListedModel[] = [];
      const listing = (async () => {
        const pager = await ai.models.list({ config: { pageSize: 200 } });
        for await (const model of pager) {
          listed.push({ name: model.name, supportedActions: model.supportedActions });
          if (listed.length >= 400) break;
        }
      })();
      await Promise.race([
        listing,
        new Promise((_, reject) => setTimeout(() => reject(new Error("list timeout")), timeoutMs)),
      ]);
      const models = rankGeminiModels(listed).slice(0, 8);
      cache = { at: Date.now(), models };
      return models;
    } catch {
      // Remember the miss briefly so every request doesn't pay the timeout.
      cache = { at: Date.now() - GEMINI.modelCacheTtlMs + 60_000, models: [] };
      return [];
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Test seam. */
export function resetGeminiModelDiscovery(): void {
  cache = null;
  inflight = null;
}
