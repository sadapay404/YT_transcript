import { GEMINI } from "@/lib/constants";
import type { ClipPlan, HookType, RawClip } from "@/lib/types";

/** A validated-but-not-yet-timestamp-snapped plan from the model. */
export interface SafePlan {
  clips: RawClip[];
  summary?: string;
  overall_score?: number;
}

const HOOK_TYPES = new Set<HookType>([
  "hook",
  "story",
  "insight",
  "funny",
  "controversial",
  "tutorial",
  "emotional",
  "data",
  "quote",
  "other",
]);

/**
 * Parse Gemini's response without trusting its formatting. Models occasionally
 * add a fence, a preamble, or a second JSON-looking example; brace scanning
 * keeps those quirks out of the UI while still accepting a valid plan.
 */
export function parseClipPlan(raw: string): SafePlan {
  const candidates = extractJsonCandidates(raw);
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      const plan = normalizePlan(parsed);
      if (plan.clips.length > 0) return plan;
    } catch {
      // Try the next balanced object. The route turns a total failure into a
      // friendly model error rather than exposing a JSON parse stack trace.
    }
  }
  throw new Error("Gemini returned no usable clip plan.");
}

/** Backwards-friendly names for callers that describe the result as safe JSON. */
export const parseSafePlan = parseClipPlan;
export const parseClipResponse = parseClipPlan;
export const extractJson = extractJsonCandidates;

/**
 * Return balanced JSON objects/arrays in source order. Markdown fences are
 * intentionally not special-cased: stripping their markers here lets the same
 * scanner handle fenced and unfenced responses.
 */
export function extractJsonCandidates(raw: string): string[] {
  const text = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "");
  const results: string[] = [];
  const seen = new Set<string>();

  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{" && text[start] !== "[") continue;
    const candidate = scanBalanced(text, start);
    if (candidate && !seen.has(candidate)) {
      seen.add(candidate);
      results.push(candidate);
      // Do not report every nested object as a second answer. If the outer
      // object is a wrapper, normalizePlan understands the common clip_plan
      // shape; separate top-level JSON answers are still discovered later.
      start += candidate.length - 1;
    }
  }

  // A plain response containing only one object is common; the loop above
  // handles it. Keeping an empty list for prose makes the failure explicit.
  return results;
}

function scanBalanced(text: string, start: number): string | null {
  const stack: string[] = [];
  let quoted = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === "{" || character === "[") {
      stack.push(character === "{" ? "}" : "]");
      continue;
    }
    if (character === "}" || character === "]") {
      if (stack.at(-1) !== character) return null;
      stack.pop();
      if (stack.length === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

function normalizePlan(value: unknown): SafePlan {
  const object = asRecord(value);
  const rootArray = Array.isArray(value) ? value : null;
  const nested = object && (asRecord(object.clip_plan) || asRecord(object.data));
  const source = nested || object;
  const clipsValue = rootArray
    ? rootArray
    : source && Array.isArray(source.clips)
      ? source.clips
      : [];

  const clips = clipsValue
    .map(normalizeClip)
    .filter((clip): clip is RawClip => clip !== null)
    .slice(0, GEMINI.clipCount.max);

  const summary = asString(source && source.summary, 800);
  const overall = asNumber(source && source.overall_score);
  return {
    clips,
    ...(summary ? { summary } : {}),
    ...(overall !== undefined ? { overall_score: clamp(overall, 0, 100) } : {}),
  };
}

function normalizeClip(value: unknown): RawClip | null {
  const object = asRecord(value);
  if (!object) return null;

  const start = asNumber(object.start_time);
  const end = asNumber(object.end_time);
  // The JSON schema asks for a real forward range. Rejecting malformed ranges
  // here keeps the mapper from having to invent a clip and preserves the
  // all-or-nothing, user-retryable contract for a bad model response.
  if (start === undefined || end === undefined || start < 0 || end <= start) return null;

  const title = asString(object.title, 180) || "Untitled clip";
  const transcriptText = asString(object.transcript_text, 4_000);
  if (!transcriptText) return null;

  const score = asNumber(object.viral_score);
  const hook = asString(object.hook_type, 40)?.toLowerCase();
  const hashtags = normalizeHashtags(object.hashtags);
  return {
    title,
    start_time: start,
    end_time: end,
    transcript_text: transcriptText,
    viral_score: clamp(score ?? 0, 0, 100),
    ...(hook ? { hook_type: HOOK_TYPES.has(hook as HookType) ? hook : "other" } : {}),
    ...(asString(object.reason, 600) ? { reason: asString(object.reason, 600) } : {}),
    ...(asString(object.hook_line, 300) ? { hook_line: asString(object.hook_line, 300) } : {}),
    ...(asString(object.caption, 600) ? { caption: asString(object.caption, 600) } : {}),
    ...(hashtags.length ? { hashtags } : {}),
  };
}

/** Accept ["#a", "b"] or "#a #b" and return up to six clean "#tags". */
function normalizeHashtags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string"
      ? value.split(/[\s,]+/)
      : [];
  const tags = raw
    .map((tag) => tag.trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, ""))
    .filter((tag) => tag.length > 0 && tag.length <= 40)
    .map((tag) => `#${tag}`);
  return [...new Set(tags)].slice(0, 6);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function asNumber(value: unknown): number | undefined {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(number) ? number : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Compile-time check: SafePlan remains assignable to the public plan contract.
export type ParsedClipPlan = ClipPlan & SafePlan;
