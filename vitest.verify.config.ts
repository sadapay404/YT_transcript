import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** TEMPORARY harness config (not part of the repo's suite) — run with:
 *    npx vitest run --config vitest.verify.config.ts
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    include: ["src/verify/**/*.verify.tsx"],
    testTimeout: 20_000,
  },
});
