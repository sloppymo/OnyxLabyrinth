/**
 * Palette-crumble visual regression gate.
 *
 * Runs Playwright against a local OnyxLabyrinth dev server, drives a
 * controlled enemy death, and enforces that the palette-crumble ash is visible
 * in the world `effects` layer while the DOM UI and the Phaser world transform
 * behave correctly.
 *
 * Usage:
 *   npm run dev
 *   node scripts/playtests/visual-animation-gate.mjs
 *
 * Or with a custom URL / evidence dir:
 *   ONYX_URL=http://127.0.0.1:5173/OnyxLabyrinth/?debug=1 \
 *     ONYX_EVIDENCE=playtest-screenshots/palette-crumble-gate \
 *     node scripts/playtests/visual-animation-gate.mjs
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE = process.env.ONYX_URL ?? "http://127.0.0.1:5173/OnyxLabyrinth/?debug=1";
const EVIDENCE = process.env.ONYX_EVIDENCE ?? "/tmp/palette-crumble-gate";

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}
ensureDir(EVIDENCE);

const shotPath = (n) => path.join(EVIDENCE, `${n}.png`);
const jsonPath = (n) => path.join(EVIDENCE, `${n}.json`);

async function shot(page, name) {
  const p = shotPath(name);
  await page.screenshot({ path: p });
  return p;
}

async function assertNoErrors(errors) {
  if (errors.length === 0) return;
  const text = errors.map((e) => (typeof e === "string" ? e : JSON.stringify(e))).join("\n");
  throw new Error(`Browser / console / network errors:\n${text}`);
}

async function main() {
  const launchOptions = {
    headless: true,
    args: ["--no-sandbox", "--use-gl=swiftshader"],
  };
  if (process.env.PLAYWRIGHT_EXECUTABLE) {
    launchOptions.executablePath = process.env.PLAYWRIGHT_EXECUTABLE;
  }

  const browser = await chromium.launch(launchOptions);

  const errors = [];
  let page;

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    page = await context.newPage();

    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        errors.push(`console.${msg.type()}: ${msg.text()}`);
      }
    });
    page.on("pageerror", (err) => errors.push(`pageerror: ${err.message ?? String(err)}`));
    page.on("requestfailed", (req) => errors.push(`requestfailed: ${req.url()} ${req.failure()?.errorText ?? ""}`));

    console.log(`navigating to ${BASE}`);
    await page.goto(BASE, { waitUntil: "networkidle" });

    if (!page.url().includes("?debug=1")) {
      throw new Error(`?debug=1 was dropped from URL: ${page.url()}`);
    }

    await page.waitForFunction(() => typeof window.__onyxDebug !== "undefined", null, { timeout: 20000 });
    console.log("__onyxDebug ready");

    // Build a fresh game state and start a controlled combat.
    const setup = await page.evaluate(() => {
      const floor = window.__onyxDebug.FLOORS[0];
      if (!floor) throw new Error("FLOORS[0] is not available");
      const fresh = window.__onyxDebug.createGameState(floor);
      // Mutate the live state rather than swapping the reference, because
      // __onyxDebug.startCombat uses the same state object as __onyxDebug.state.
      window.__onyxDebug.state.floor = floor;
      window.__onyxDebug.state.party = fresh.party;

      const p = window.__onyxDebug.state.party;
      for (const c of p) {
        c.sp = c.maxSp = 999;
      }
      for (const c of p) {
        c.stats.agi = c.id === "c1" ? 10000 : 0;
      }

      const entry = { weight: 1, spawns: [{ enemyId: "slime", row: "front" }, { enemyId: "slime", row: "front" }] };
      const resolved = window.__onyxDebug.resolveEncounter(entry);
      const combat = window.__onyxDebug.createCombatFromEncounter(
        p,
        resolved,
        window.__onyxDebug.SPELLS_BY_ID,
        window.__onyxDebug.ITEMS_BY_ID,
        window.__onyxDebug.state.equipment,
        [],
        false
      );
      // First slime dies on the first hit; the second slime survives.
      combat.enemies.front[0].currentHp = 1;
      combat.enemies.front[0].agi = 0;
      combat.enemies.front[1].currentHp = 9999;
      combat.enemies.front[1].agi = 0;

      return window.__onyxDebug.startCombat(combat);
    });
    if (setup !== undefined) {
      console.log(`startCombat resolved: ${JSON.stringify(setup)}`);
    }

    await page.waitForFunction(
      () => {
        const s = window.__onyxDebug.snapshot();
        return s.combat && s.combat.phase === "palette" && s.combat.actingCharId === "c1";
      },
      null,
      { timeout: 20000 }
    );
    console.log("palette open for c1");

    const combatWrap = await page.evaluate(() => {
      const wrap = document.querySelector("#combat-wrap");
      return { className: wrap?.className ?? "missing", hasCanvas: !!document.querySelector("#combat-canvas"), phaserCanvasCount: document.querySelectorAll("canvas").length };
    });
    console.log("combat wrap:", JSON.stringify(combatWrap));

    const hooks = await page.evaluate(() => ({
      worldLayer: typeof window.__onyxPhaserWorldLayer === "function",
      worldTransform: typeof window.__onyxPhaserWorldTransform === "function",
      webgl: typeof window.WebGL2RenderingContext !== "undefined" || typeof window.WebGLRenderingContext !== "undefined",
    }));

    if (!hooks.worldLayer) throw new Error("__onyxPhaserWorldLayer is not exposed");
    if (!hooks.worldTransform) throw new Error("__onyxPhaserWorldTransform is not exposed");
    if (!hooks.webgl) throw new Error("WebGL is not available in this browser");
    console.log("world hooks, Phaser, and WebGL are active");

    const preShot = await shot(page, "01-palette");

    await page.evaluate(() => window.__onyxDebug.getCombatController().handleKey("Enter"));
    await page.waitForFunction(() => window.__onyxDebug.snapshot().combat?.phase === "selectTarget", null, { timeout: 10000 });

    const attackPreludeShot = await shot(page, "02-attack-prelude");
    const preUi = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".ff6-window, .ff6-battle")).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          class: el.className,
          text: el.textContent?.slice(0, 40) ?? "",
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
        };
      })
    );
    console.log(`pre-transform UI boxes: ${preUi.length}`);

    // Fire the attack.
    await page.evaluate(() => window.__onyxDebug.getCombatController().handleKey("Enter"));

    // Wait for the palette-crumble ash to register in the world effects layer.
    await page.waitForFunction(
      () => {
        try {
          return window.__onyxPhaserWorldLayer().layerCounts.effects > 0;
        } catch {
          return false;
        }
      },
      null,
      { timeout: 10000 }
    );

    // Capture the untransformed crumble immediately.
    const untransformedLayer = await page.evaluate(() => window.__onyxPhaserWorldLayer());
    if (untransformedLayer.layerCounts.effects <= 0) {
      throw new Error("effectsLayer was empty at the untransformed capture");
    }
    const untransformedShot = await shot(page, "03-untransformed-death");
    console.log(`untransformed effects: ${untransformedLayer.layerCounts.effects}`);

    // Transform the world while the same effect is still active.
    const transformed = await page.evaluate(() => {
      const box = () =>
        Array.from(document.querySelectorAll(".ff6-window, .ff6-battle")).map((el) => {
          const r = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            class: el.className,
            text: el.textContent?.slice(0, 40) ?? "",
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
          };
        });
      const beforeUi = box();
      window.__onyxPhaserWorldTransform(true);
      const afterUi = box();
      return { beforeUi, afterUi, layer: window.__onyxPhaserWorldLayer() };
    });

    // Allow exactly one rendered frame under the transform.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

    const transformedLayer = await page.evaluate(() => window.__onyxPhaserWorldLayer());
    if (transformedLayer.layerCounts.effects <= 0) {
      throw new Error("effectsLayer was no longer active during the transformed capture");
    }
    const transformedShot = await shot(page, "04-transformed-death");
    console.log(`transformed effects: ${transformedLayer.layerCounts.effects}`);

    if (transformed.beforeUi.length !== transformed.afterUi.length) {
      throw new Error(`UI element count changed under world transform: ${transformed.beforeUi.length} -> ${transformed.afterUi.length}`);
    }
    for (let i = 0; i < transformed.beforeUi.length; i++) {
      const a = transformed.beforeUi[i];
      const b = transformed.afterUi[i];
      if (a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height) {
        throw new Error(
          `UI box moved under world transform: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`
        );
      }
    }
    console.log("UI positions unchanged under world transform");

    // Restore the world and capture the final state.
    const restored = await page.evaluate(() => {
      window.__onyxPhaserWorldTransform(false);
      return window.__onyxPhaserWorldLayer();
    });
    const restoredShot = await shot(page, "05-restored");

    const t = restored.worldTransform;
    if (t.x !== 0 || t.y !== 0 || t.scaleX !== 1 || t.scaleY !== 1) {
      throw new Error(`World transform did not restore to identity: ${JSON.stringify(t)}`);
    }

    const maxEffects = Math.max(untransformedLayer.layerCounts.effects, transformedLayer.layerCounts.effects, restored.layerCounts.effects);
    const maxActors = Math.max(untransformedLayer.layerCounts.actors, transformedLayer.layerCounts.actors, restored.layerCounts.actors);

    await assertNoErrors(errors);

    const report = {
      ok: true,
      url: page.url(),
      screenshots: {
        pre: preShot,
        attackPrelude: attackPreludeShot,
        untransformed: untransformedShot,
        transformed: transformedShot,
        restored: restoredShot,
      },
      evidenceDir: EVIDENCE,
      untransformedEffects: untransformedLayer.layerCounts.effects,
      transformedEffects: transformedLayer.layerCounts.effects,
      maxEffects,
      maxActors,
      untransformedLayer,
      transformedLayer,
      restoredLayer: restored,
      uiBoxes: { before: transformed.beforeUi, after: transformed.afterUi },
      errors,
    };
    fs.writeFileSync(jsonPath("report"), JSON.stringify(report, null, 2));

    console.log(`\nPASS: palette-crumble gate`);
    console.log(`  untransformed effects: ${untransformedLayer.layerCounts.effects}`);
    console.log(`  transformed effects:   ${transformedLayer.layerCounts.effects}`);
    console.log(`  max effects:           ${maxEffects}`);
    console.log(`  screenshots:           ${EVIDENCE}`);
    console.log(`  report:                ${jsonPath("report")}`);
    return report;
  } catch (e) {
    console.error("collected errors:", JSON.stringify(errors, null, 2));
    if (page) {
      try {
        console.error("page url at failure:", page.url());
        await page.screenshot({ path: shotPath("FAILURE") });
      } catch {}
    }
    throw e;
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
