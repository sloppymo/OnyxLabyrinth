import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/OnyxLabyrinth/",
  build: {
    assetsInlineLimit: 10240,
  },
  test: {
    // Tests run in the default Node environment. The renderer math tests
    // are pure functions with no DOM dependencies.
    include: ["src/**/*.test.ts"],
    coverage: {
      exclude: ["src/**/*.test.ts"],
    },
  },
});
