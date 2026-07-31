/**
 * Corridor art pass — pose discovery.
 *
 * Derives a reproducible camera-pose table for the six-view rendering
 * checklist (AGENTS.md § "Rendering verification checklist") plus the
 * special-tile render paths, by walking each campaign floor's grid in-page
 * and classifying (x, y, facing) triples geometrically. Poses are *found*,
 * not eyeballed, so every later before/after comparison is pinned to the
 * same camera and re-derivable after a map edit.
 *
 * Writes: scripts/playtests/corridor-poses.json
 * Run:    node scripts/playtests/corridor-pose-discovery.mjs
 * (assumes `npx vite preview --port 5176 --base /OnyxLabyrinth/` is running)
 */
import fs from "node:fs";
import path from "node:path";
import { launch, wait, jumpTo, waitForIdle, snap, ensureAudioResumed } from "./lib.mjs";

const URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = path.join("scripts", "playtests", "corridor-poses.json");
const FLOORS = [1, 2, 3, 4, 5];

const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });

await page.goto(URL, { waitUntil: "networkidle" });
await wait(400);
await ensureAudioResumed(page);

/**
 * Classify every (cell, facing) on the live floor grid.
 * Facing 0=N,1=E,2=S,3=W; edge indices match DIRS (0=N,1=E,2=S,3=W).
 */
const classify = () =>
  page.evaluate(() => {
    const grid = window.__onyxDebug.state.floor.grid;
    const H = grid.length;
    const W = grid[0].length;
    const DX = [0, 1, 0, -1];
    const DY = [-1, 0, 1, 0];
    const edgeAt = (x, y, d) => {
      const c = grid[y]?.[x];
      if (!c) return "wall";
      return [c.n, c.e, c.s, c.w][d];
    };
    const passable = (e) => e === "open" || e === "door" || e === "locked";
    // A cell is reachable/interior if any edge is not a solid wall.
    const interior = (x, y) => [0, 1, 2, 3].some((d) => passable(edgeAt(x, y, d)));

    const out = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!interior(x, y)) continue;
        const tile = grid[y][x].tile ?? null;
        for (let f = 0; f < 4; f++) {
          // Walk forward counting open cells; record first door and first
          // lateral opening encountered along the view.
          let depth = 0;
          let doorDepth = -1;
          let sideDepth = -1;
          let cx = x;
          let cy = y;
          for (let step = 0; step < 8; step++) {
            const e = edgeAt(cx, cy, f);
            if (e === "door" || e === "locked") {
              if (doorDepth < 0) doorDepth = step;
              break; // a door closes the view; stop the run here
            }
            if (e !== "open") break;
            cx += DX[f];
            cy += DY[f];
            if (cx < 0 || cy < 0 || cx >= W || cy >= H) break;
            depth++;
            const left = (f + 3) % 4;
            const right = (f + 1) % 4;
            if (sideDepth < 0 && (passable(edgeAt(cx, cy, left)) || passable(edgeAt(cx, cy, right)))) {
              sideDepth = depth;
            }
          }
          // Corridor-ness at the standing cell: both lateral edges solid.
          const lat = [(f + 3) % 4, (f + 1) % 4];
          const enclosed = lat.every((d) => !passable(edgeAt(x, y, d)));
          out.push({ x, y, facing: f, tile, depth, doorDepth, sideDepth, enclosed });
        }
      }
    }
    return { W, H, cells: out };
  });

const poses = {};
const summary = [];

for (const floorId of FLOORS) {
  await jumpTo(page, { floorId, x: 1, y: 1, autosave: false }).catch(() => {});
  // jumpTo to an arbitrary cell can be refused; land on the floor's own start.
  const st = await snap(page);
  if (st.floor?.id !== floorId) {
    console.log(`! could not reach floor ${floorId} (got ${st.floor?.id})`);
    continue;
  }
  await waitForIdle(page, 4000);
  const { W, H, cells } = await classify();

  const pick = (pred, rank) => {
    const c = cells.filter(pred);
    if (!c.length) return null;
    c.sort(rank);
    return c[0];
  };

  const found = {};

  // 1. Straight corridor: deepest enclosed forward run, no lateral opening
  //    for at least the first 2 cells (a real corridor, not a room).
  found.straight = pick(
    (c) => c.enclosed && c.depth >= 3 && (c.sideDepth < 0 || c.sideDepth >= 2) && !c.tile,
    (a, b) => b.depth - a.depth || a.x - b.x || a.y - b.y
  );

  // 2. Open side passage: forward run with a lateral opening 1-2 cells ahead.
  found.sidePassage = pick(
    (c) => c.enclosed && c.depth >= 3 && c.sideDepth >= 1 && c.sideDepth <= 2 && !c.tile,
    (a, b) => a.sideDepth - b.sideDepth || b.depth - a.depth || a.x - b.x
  );

  // 3. Front wall at depth 0: facing a solid wall from an interior cell.
  found.frontWall = pick(
    (c) => c.depth === 0 && c.doorDepth < 0 && !c.tile,
    (a, b) => a.x - b.x || a.y - b.y
  );

  // 4. Door in view (closed or locked), as near as possible.
  found.door = pick(
    (c) => c.doorDepth >= 0,
    (a, b) => a.doorDepth - b.doorDepth || a.x - b.x
  );

  // 5-8. Standing on each special tile, facing the deepest available view so
  //      the floor glyph and the corridor are both in frame.
  for (const t of ["darkness", "water", "treasure", "npc", "stairs_down", "teleporter"]) {
    const hit = pick((c) => c.tile === t, (a, b) => b.depth - a.depth);
    if (hit) found[t] = hit;
  }

  poses[floorId] = found;
  const names = Object.entries(found)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}@(${v.x},${v.y},f${v.facing},d${v.depth})`);
  summary.push(`floor ${floorId} [${W}x${H}]: ${names.join("  ")}`);
  console.log(summary[summary.length - 1]);
}

fs.writeFileSync(OUT, JSON.stringify(poses, null, 2));
console.log(`\nwrote ${OUT}`);
if (errors.length) console.log("browser errors:", errors.slice(0, 10));
await browser.close();
