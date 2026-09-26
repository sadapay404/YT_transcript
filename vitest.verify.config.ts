import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Opt-in verification harness
 * ─────────────────────────────────────────────────────────────────────────────
 *  The default suite (`npm run test`) covers the pure logic only, in a node
 *  environment — that stays true. This config adds the layer above it: the real
 *  components, rendered into jsdom, driven through the behaviours that only
 *  exist once there is a DOM (the Step 3 follow engine: scroll targets,
 *  takeovers, resume).
 *
 *  It is deliberately NOT part of `npm run test` or CI, because it needs one
 *  test-only package that the app itself never ships:
 *
 *      npm i --no-save jsdom
 *      npx vitest run --config vitest.verify.config.ts
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
