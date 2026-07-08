import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/OnyxLabyrinth/",
  build: {
    assetsInlineLimit: 10240,
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    coverage: {
      exclude: ["src/**/*.test.ts"],
    },
  },
});
