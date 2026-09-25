import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit tests cover the pure logic only — URL parsing, timestamp normalisation,
 * timecode formatting, error classification. That keeps the suite fast and
 * network-free, so it is meaningful in CI and inside restricted sandboxes.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    reporters: process.env.CI ? ["dot"] : ["default"],
  },
});
