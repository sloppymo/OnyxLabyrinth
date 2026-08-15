import { defineConfig } from "vite";
import { resolve } from "path";
import { execSync } from "child_process";

function buildIdentity() {
  try {
    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
    return { sha, branch, builtAt: new Date().toISOString() };
  } catch {
    return { sha: "unknown", branch: "unknown", builtAt: new Date().toISOString() };
  }
}

const ONYX_BUILD = buildIdentity();
const ONYX_BUILD_SCRIPT = `<script>window.__onyxBuild = ${JSON.stringify(ONYX_BUILD)};</script>`;

// IMPORTANT: replace 'wizardry-clone' with your actual GitHub repo name
// before deploying, or asset paths will 404 on GitHub Pages.
export default defineConfig({
  base: "/OnyxLabyrinth/",
  plugins: [
    {
      name: "onyx-build-identity",
      enforce: "pre",
      transformIndexHtml(html) {
        return html.replace("<head>", `<head>\n    ${ONYX_BUILD_SCRIPT}`);
      },
    },
  ],
  define: {
    __ONYX_BUILD__: JSON.stringify(ONYX_BUILD),
  },
  build: {
    // Inline all texture images into the JS bundle as data URIs so the game
    // works from file:// or any base path and individual PNG 404s can't break
    // the renderer.
    assetsInlineLimit: 10240,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        combatChoreographyPreview: resolve(__dirname, "combat-choreography-preview.html"),
        vignette: resolve(__dirname, "vfx-vignette.html"),
        dungeonHudPreview: resolve(__dirname, "dungeon-hud-preview.html"),
        floorEditor: resolve(__dirname, "tools/floor-editor.html"),
        isobelArtMockup: resolve(__dirname, "public/isobel-art-mockup.html"),
      },
    },
  },
});
