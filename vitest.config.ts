import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/OnyxLabyrinth/",
  build: {
    assetsInlineLimit: 10240,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest-setup.ts"],
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    coverage: {
      exclude: ["src/**/*.test.ts"],
    },
  },
});
