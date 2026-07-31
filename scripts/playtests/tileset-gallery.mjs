/**
 * Screenshot the corridor tileset gallery (contact sheet + per-floor sections).
 *
 * Regenerates tileset-gallery.html, serves the repo root briefly, then captures:
 *   - overview grid (all floors × slots)
 *   - each floor section (singles + tiled seam check)
 *
 * Does not pixel-diff. Asserts every floor×slot card is present (or marked missing).
 *
 * Run: node scripts/playtests/tileset-gallery.mjs
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { ensureOutDir, wait } from "./lib.mjs";

const ROOT = resolve(process.cwd());
const OUT = ensureOutDir("playtest-screenshots/tileset-gallery");
const GALLERY = join(ROOT, "tileset-gallery.html");
const PORT = Number(process.env.TILESET_GALLERY_PORT ?? 8765);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".css": "text/css",
  ".js": "text/javascript",
};

function runGenerator() {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["scripts/generate-tileset-gallery.mjs"], {
      cwd: ROOT,
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`generate-tileset-gallery.mjs exited ${code}`));
    });
  });
}

function startStaticServer() {
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const rel = urlPath === "/" ? "/tileset-gallery.html" : urlPath;
    const abs = resolve(ROOT, `.${rel}`);
    if (!abs.startsWith(ROOT) || !existsSync(abs) || !statSync(abs).isFile()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const type = MIME[extname(abs)] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(readFileSync(abs));
  });
  return new Promise((resolvePromise) => {
    server.listen(PORT, "127.0.0.1", () => resolvePromise(server));
  });
}

async function main() {
  await runGenerator();
  if (!existsSync(GALLERY)) {
    throw new Error(`Expected gallery at ${GALLERY}`);
  }

  const server = await startStaticServer();
  const url = `http://127.0.0.1:${PORT}/tileset-gallery.html`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await wait(400);

    // Wait until overview images have decoded (or placeholders are visible).
    await page.waitForSelector("#overview table.overview img, #overview td.missing", {
      timeout: 10000,
    });
    await page.evaluate(() =>
      Promise.all(
        [...document.images].map((img) =>
          img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = r; })
        )
      )
    );

    const inventory = await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".card[data-floor][data-slot]")];
      return cards.map((el) => ({
        floor: Number(el.getAttribute("data-floor")),
        slot: el.getAttribute("data-slot"),
        missing: el.classList.contains("missing"),
        hasImg: !!el.querySelector("img, .tiled"),
      }));
    });

    const expectedSlots = ["wall", "ceiling", "floor_a", "floor_b", "door"];
    const problems = [];
    for (let floor = 1; floor <= 5; floor++) {
      for (const slot of expectedSlots) {
        const any = inventory.filter((c) => c.floor === floor && c.slot === slot);
        if (any.length === 0) {
          problems.push(`no card for f${floor} ${slot}`);
          continue;
        }
        const present = any.some((c) => !c.missing && c.hasImg);
        const markedMissing = any.every((c) => c.missing);
        if (!present && !markedMissing) {
          problems.push(`f${floor} ${slot}: neither image nor missing placeholder`);
        }
        // Required live textures (doors may be absent historically — still expect a card).
        if (slot !== "door" && !present) {
          problems.push(`required texture missing: f${floor}_${slot}_256.png`);
        }
      }
    }

    const overviewPath = join(OUT, "00-overview.png");
    await page.locator("#overview").screenshot({ path: overviewPath });
    console.log(`shot ${overviewPath}`);

    for (let floor = 1; floor <= 5; floor++) {
      const p = join(OUT, `0${floor}-floor-${floor}.png`);
      await page.locator(`#floor-${floor}`).screenshot({ path: p });
      console.log(`shot ${p}`);
    }

    const fullPath = join(OUT, "full-page.png");
    await page.screenshot({ path: fullPath, fullPage: true });
    console.log(`shot ${fullPath}`);

    if (problems.length) {
      console.error("Gallery verification failed:");
      for (const p of problems) console.error(`  - ${p}`);
      process.exitCode = 1;
    } else {
      console.log("OK: floors 1–5 wall/ceiling/floor_a/floor_b present; all slots have cards.");
    }
    console.log(`Gallery: ${url}`);
    console.log(`File:    ${pathToFileURL(GALLERY).href}`);
    console.log(`Shots:   ${OUT}`);
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
