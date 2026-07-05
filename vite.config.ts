import { defineConfig } from "vite";

// IMPORTANT: replace 'wizardry-clone' with your actual GitHub repo name
// before deploying, or asset paths will 404 on GitHub Pages.
export default defineConfig({
  base: "/OnyxLabyrinth/",
  build: {
    // Inline all texture images into the JS bundle as data URIs so the game
    // works from file:// or any base path and individual PNG 404s can't break
    // the renderer.
    assetsInlineLimit: 10240,
  },
});
