import { defineConfig } from "vitest/config";

/**
 * Tests that talk to the real Supabase project. Run with `npm run test:live`
 * (which loads .env.local). They create throwaway accounts and games and
 * delete them afterwards.
 */
export default defineConfig({
  test: {
    include: ["tests/live/**/*.live.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
