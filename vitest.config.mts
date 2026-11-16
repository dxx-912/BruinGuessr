import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Unit tests (`npm test`). The live tests have their own config,
 * vitest.live.config.mts. Server modules import "server-only", which refuses
 * to load outside Next, so tests get an empty stand-in.
 */
export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
