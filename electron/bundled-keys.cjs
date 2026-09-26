/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Built-in AI keys for the Windows app, so friends can use NexAI without
 * setting anything up.
 *
 * The desktop build (scripts/prepare-electron.mjs) writes the keys into
 * `electron/bundled-keys.dat`, which is packed inside app.asar. That file is
 * git-ignored and never committed.
 *
 * The encoding only keeps the keys from showing up as plain text when someone
 * opens the file. It is NOT security: anyone determined can decode it. Keys
 * that the user sets in %APPDATA%\TranStudio\.env.local always win over the
 * built-in ones.
 */
const fs = require("node:fs");
const path = require("node:path");

/** The only variables ever bundled or read back. */
const BUNDLED_KEY_NAMES = Object.freeze([
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GEMINI_FALLBACK_MODEL",
  "GROQ_API_KEY",
  "GROQ_MODELS",
]);

const BUNDLED_KEYS_FILE = path.join(__dirname, "bundled-keys.dat");
const MASK = Buffer.from("TranStudio · Read it. Clip it. Ship it.", "utf8");
const MAGIC = "TSK1:";

function pickAllowed(source) {
  const values = {};
  for (const name of BUNDLED_KEY_NAMES) {
    const value = source && typeof source[name] === "string" ? source[name].trim() : "";
    if (value) values[name] = value;
  }
  return values;
}

function xor(buffer) {
  const out = Buffer.alloc(buffer.length);
  for (let index = 0; index < buffer.length; index += 1) {
    out[index] = buffer[index] ^ MASK[index % MASK.length];
  }
  return out;
}

/** Encode allowed values; returns null when there is nothing to bundle. */
function encodeBundledKeys(source) {
  const values = pickAllowed(source);
  if (!values.GEMINI_API_KEY && !values.GROQ_API_KEY) return null;
  const json = Buffer.from(JSON.stringify(values), "utf8");
  return MAGIC + xor(json).reverse().toString("base64");
}

/** Decode a bundled payload; anything malformed yields {}. */
function decodeBundledKeys(payload) {
  if (typeof payload !== "string" || !payload.startsWith(MAGIC)) return {};
  try {
    const bytes = Buffer.from(payload.slice(MAGIC.length).trim(), "base64").reverse();
    return pickAllowed(JSON.parse(xor(bytes).toString("utf8")));
  } catch {
    return {};
  }
}

/** Read the keys packed into this build (inside app.asar when packaged). */
function readBundledKeys(file = BUNDLED_KEYS_FILE) {
  try {
    return decodeBundledKeys(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

module.exports = {
  BUNDLED_KEY_NAMES,
  BUNDLED_KEYS_FILE,
  encodeBundledKeys,
  decodeBundledKeys,
  readBundledKeys,
};
