#!/usr/bin/env node
/**
 * Unified live-renderer visual audit for all five campaign floors.
 *
 * The production bundle is the source of truth. Camera poses are derived from
 * `__onyxDebug.FLOORS` on every run; the dated corridor-poses.json file is not
 * read. Each capture is then checked against the current live floor, camera,
 * tile, tileset zone/theme, route, invariant warnings, asset readiness, canvas
 * dimensions, conservative visibility metrics, and browser/network errors.
 *
 * Run after `npm run build` with a production preview available:
 *   npx vite preview --host 127.0.0.1 --port 5176 --base /OnyxLabyrinth/
 *   npm run visual:floors
 *
 * Environment:
 *   ONYX_URL     production-preview debug URL
 *   ONYX_OUT     output directory (PNG gallery, report.json, index.html)
 *   ONYX_FLOORS  optional comma-separated floor ids, e.g. "1,2"
 *
 * CLI floor filters are also accepted: --floor 2, --floor=2, --floors=1,2.
 */
import fs from "node:fs";
import path from "node:path";
import {
  act,
  ensureAudioResumed,
  ensureOutDir,
  getTranscript,
  jumpTo,
  launch,
  press,
  shot,
  snap,
  wait,
  waitForIdle,
  writeReport,
} from "./lib.mjs";

const CAMPAIGN_FLOORS = [1, 2, 3, 4, 5];
const URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir(
  path.resolve(process.env.ONYX_OUT ?? "playtest-screenshots/floor-visual-audit")
);
const VIEWPORT = { width: 1280, height: 800 };
const THRESHOLDS = {
  minCanvasWidth: 600,
  minCanvasHeight: 500,
  maxCanvasWidth: 768,
  maxCanvasHeight: 672,
  // Intended darkness views on the current campaign reach ~5.9 while still
  // retaining >65% non-background pixels. Four remains comfortably above a
  // black frame; the independent non-background gate catches a flat BG fill.
  minMeanLuma: 4,
  minNonBackgroundFraction: 0.08,
  minTransitionLumaRatio: 0.6,
  minTransitionNonBackgroundRatio: 0.6,
};
const FACING_NAMES = ["N", "E", "S", "W"];
const LANDMARK_PRIORITY = [
  "stairs_down",
  "stairs_up",
  "teleporter",
  "chute",
  "treasure",
  "npc",
  "event",
];

function parseFloorFilter(argv, envValue) {
  const values = [];
  if (envValue) values.push(envValue);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--floor" || arg === "--floors") {
      if (argv[i + 1]) values.push(argv[++i]);
    } else if (arg.startsWith("--floor=")) {
      values.push(arg.slice("--floor=".length));
    } else if (arg.startsWith("--floors=")) {
      values.push(arg.slice("--floors=".length));
    }
  }
  if (!values.length) return [...CAMPAIGN_FLOORS];
  const ids = [
    ...new Set(
      values
        .flatMap((value) => value.split(","))
        .map((value) => Number(value.trim()))
        .filter(Number.isInteger)
    ),
  ].sort((a, b) => a - b);
  const invalid = ids.filter((id) => !CAMPAIGN_FLOORS.includes(id));
  if (!ids.length || invalid.length) {
    throw new Error(
      `Floor filter must contain only campaign ids 1-5 (received ${values.join(", ")})`
    );
  }
  return ids;
}

const SELECTED_FLOORS = parseFloorFilter(process.argv.slice(2), process.env.ONYX_FLOORS);

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function compareStable(a, b) {
  return a.y - b.y || a.x - b.x || a.facing - b.facing;
}

function pick(candidates, predicate, compare) {
  const found = candidates.filter(predicate);
  if (!found.length) return null;
  found.sort((a, b) => compare(a, b) || compareStable(a, b));
  return found[0];
}

function compactPose(pose) {
  if (!pose) return null;
  const result = {
    x: pose.x,
    y: pose.y,
    facing: pose.facing,
    tile: pose.tile,
    activeTheme: pose.activeTheme,
    regionId: pose.regionId,
    depth: pose.depth,
    doorDepth: pose.doorDepth,
    sideDepth: pose.sideDepth,
    lateralOpeningCount: pose.lateralOpeningCount,
    enclosed: pose.enclosed,
    sameThemeDepth: pose.sameThemeDepth,
    forwardThemes: pose.forwardThemes,
  };
  if (pose.setup) result.setup = { ...pose.setup };
  if (pose.targetFeature) result.targetFeature = { ...pose.targetFeature };
  return result;
}

function derivePoses(model) {
  const cells = model.cells;
  const straight = pick(
    cells,
    (c) =>
      c.tile === null &&
      c.enclosed &&
      c.depth >= 3 &&
      (c.sideDepth < 0 || c.sideDepth >= 2),
    (a, b) => b.depth - a.depth || b.lateralOpeningCount - a.lateralOpeningCount
  );
  const sidePassage = pick(
    cells,
    (c) =>
      c.tile === null &&
      c.enclosed &&
      c.depth >= 3 &&
      c.sideDepth >= 1 &&
      c.sideDepth <= 2,
    (a, b) =>
      a.sideDepth - b.sideDepth ||
      b.depth - a.depth ||
      b.lateralOpeningCount - a.lateralOpeningCount
  );
  const frontWall = pick(
    cells,
    (c) => c.tile === null && c.depth === 0 && c.doorDepth < 0,
    (a, b) => Number(b.enclosed) - Number(a.enclosed)
  );
  const door = pick(
    cells,
    (c) => c.tile === null && c.doorDepth >= 0,
    (a, b) => a.doorDepth - b.doorDepth || Number(b.enclosed) - Number(a.enclosed)
  );
  const floorVariation =
    pick(
      cells,
      (c) => c.tile === null && c.enclosed && c.depth >= 3,
      (a, b) =>
        Number(a.visibleFeatures.length > 0) - Number(b.visibleFeatures.length > 0) ||
        b.lateralOpeningCount - a.lateralOpeningCount ||
        b.depth - a.depth
    ) ??
    pick(
      cells,
      (c) => c.tile === null && c.depth >= 3,
      (a, b) =>
        Number(a.visibleFeatures.length > 0) - Number(b.visibleFeatures.length > 0) ||
        b.depth - a.depth ||
        b.lateralOpeningCount - a.lateralOpeningCount
    );

  const landmarkCandidates = [];
  for (const camera of cells) {
    if (camera.tile !== null) continue;
    for (const target of camera.visibleFeatures) {
      const priority = LANDMARK_PRIORITY.indexOf(target.tile);
      if (priority < 0) continue;
      landmarkCandidates.push({ camera, target, priority });
    }
  }
  landmarkCandidates.sort(
    (a, b) =>
      Math.abs(a.target.depth - 2) - Math.abs(b.target.depth - 2) ||
      a.priority - b.priority ||
      b.camera.depth - a.camera.depth ||
      compareStable(a.camera, b.camera)
  );
  const landmark = landmarkCandidates.length
    ? {
        ...landmarkCandidates[0].camera,
        targetFeature: { ...landmarkCandidates[0].target },
      }
    : null;

  const darknessEntries = [];
  for (const camera of cells) {
    if (camera.tile !== null) continue;
    const target = camera.visibleFeatures.find(
      (feature) => feature.tile === "darkness" && feature.depth === 1
    );
    if (!target) continue;
    const finalPose = cells.find(
      (candidate) =>
        candidate.x === target.x &&
        candidate.y === target.y &&
        candidate.facing === camera.facing
    );
    if (!finalPose) continue;
    darknessEntries.push({ camera, target, finalPose });
  }
  darknessEntries.sort(
    (a, b) =>
      b.finalPose.depth - a.finalPose.depth ||
      b.finalPose.lateralOpeningCount - a.finalPose.lateralOpeningCount ||
      compareStable(a.camera, b.camera)
  );
  const darkness = darknessEntries.length
    ? {
        ...darknessEntries[0].finalPose,
        setup: {
          x: darknessEntries[0].camera.x,
          y: darknessEntries[0].camera.y,
          facing: darknessEntries[0].camera.facing,
        },
      }
    : null;

  const themePoses = model.themes.map((theme) => ({
    theme,
    pose:
      pick(
        cells,
        (c) =>
          c.activeTheme === theme &&
          c.tile === null &&
          c.depth >= 2 &&
          c.sameThemeDepth >= 2,
        (a, b) =>
          Number(a.visibleFeatures.length > 0) - Number(b.visibleFeatures.length > 0) ||
          b.sameThemeDepth - a.sameThemeDepth ||
          b.depth - a.depth ||
          b.lateralOpeningCount - a.lateralOpeningCount ||
          Number(b.enclosed) - Number(a.enclosed)
      ) ??
      pick(
        cells,
        (c) =>
          c.activeTheme === theme &&
          c.tile === null &&
          c.depth === 0 &&
          c.doorDepth < 0,
        (a, b) => Number(b.enclosed) - Number(a.enclosed)
      ),
  }));

  return {
    standard: [
      {
        key: "straight",
        label: "Straight corridor",
        pose: straight,
        unavailableReason: "No enclosed forward run of at least three open cells exists.",
      },
      {
        key: "side-passage",
        label: "Open side passage",
        pose: sidePassage,
        unavailableReason: "No enclosed view has a lateral opening one or two cells ahead.",
      },
      {
        key: "front-wall",
        label: "Front wall at depth 0",
        pose: frontWall,
        unavailableReason: "No interior feature-free cell faces an adjacent solid wall.",
      },
      {
        key: "door",
        label: "Door view",
        pose: door,
        unavailableReason: "This floor contains no camera pose facing a door or locked edge.",
      },
      {
        key: "floor-variation",
        label: "Floor A/B variation",
        pose: floorVariation,
        unavailableReason: "No feature-free view has at least three open cells of floor ahead.",
      },
      {
        key: "darkness",
        label: "Darkness",
        pose: darkness,
        applicable: (model.featureCounts.darkness ?? 0) > 0,
        unavailableReason:
          (model.featureCounts.darkness ?? 0) > 0
            ? "Darkness exists, but no adjacent open entry pose was found."
            : "This floor contains no darkness tile.",
      },
      {
        key: "landmark",
        label: landmark?.targetFeature
          ? `Landmark: ${landmark.targetFeature.tile}`
          : "Major landmark",
        pose: landmark,
        unavailableReason: "No stairs or other major feature has an unobstructed corridor view.",
      },
    ],
    themes: themePoses,
  };
}

async function discoverRuntimeFloor(page, floorId) {
  return page.evaluate((id) => {
    const floor = window.__onyxDebug.findFloor(id);
    if (!floor) throw new Error(`Runtime has no campaign floor ${id}`);
    const DX = [0, 1, 0, -1];
    const DY = [-1, 0, 1, 0];
    const edgeAt = (x, y, direction) => {
      const cell = floor.grid[y]?.[x];
      if (!cell) return "wall";
      return [cell.n, cell.e, cell.s, cell.w][direction];
    };
    const passable = (edge) => edge === "open" || edge === "door" || edge === "locked";
    const interior = (x, y) => [0, 1, 2, 3].some((d) => passable(edgeAt(x, y, d)));
    const baseTheme = floor.tilesetTheme?.trim() || `f${floor.id}`;
    const themeRegionAt = (x, y) => {
      const zones = floor.tilesetZones ?? [];
      for (let i = zones.length - 1; i >= 0; i--) {
        const zone = zones[i];
        if (x >= zone.x1 && x <= zone.x2 && y >= zone.y1 && y <= zone.y2) {
          const theme = zone.theme.trim();
          if (theme) return { activeTheme: theme, regionId: zone.id };
        }
      }
      return { activeTheme: baseTheme, regionId: "base" };
    };

    const cells = [];
    const featureCounts = {};
    let interiorCellCount = 0;
    for (let y = 0; y < floor.height; y++) {
      for (let x = 0; x < floor.width; x++) {
        const cell = floor.grid[y]?.[x];
        if (!cell || !interior(x, y)) continue;
        interiorCellCount++;
        const tile = cell.tile ?? null;
        if (tile) featureCounts[tile] = (featureCounts[tile] ?? 0) + 1;
        const here = themeRegionAt(x, y);
        for (let facing = 0; facing < 4; facing++) {
          let depth = 0;
          let doorDepth = -1;
          let sideDepth = -1;
          let lateralOpeningCount = 0;
          let sameThemeDepth = 0;
          let sameThemeRun = true;
          let cx = x;
          let cy = y;
          const visibleFeatures = [];
          const forwardThemes = [];
          for (let step = 0; step < 8; step++) {
            const edge = edgeAt(cx, cy, facing);
            if (edge === "door" || edge === "locked") {
              if (doorDepth < 0) doorDepth = step;
              break;
            }
            if (edge !== "open") break;
            cx += DX[facing];
            cy += DY[facing];
            if (cx < 0 || cy < 0 || cx >= floor.width || cy >= floor.height) break;
            depth++;
            const targetRegion = themeRegionAt(cx, cy);
            forwardThemes.push(targetRegion.activeTheme);
            if (sameThemeRun && targetRegion.activeTheme === here.activeTheme) {
              sameThemeDepth++;
            } else {
              sameThemeRun = false;
            }
            const left = (facing + 3) % 4;
            const right = (facing + 1) % 4;
            const leftOpen = passable(edgeAt(cx, cy, left));
            const rightOpen = passable(edgeAt(cx, cy, right));
            if (sideDepth < 0 && (leftOpen || rightOpen)) sideDepth = depth;
            lateralOpeningCount += Number(leftOpen) + Number(rightOpen);
            const targetTile = floor.grid[cy]?.[cx]?.tile ?? null;
            if (targetTile) {
              visibleFeatures.push({
                x: cx,
                y: cy,
                tile: targetTile,
                depth,
                ...targetRegion,
              });
            }
          }
          const lateral = [(facing + 3) % 4, (facing + 1) % 4];
          const enclosed = lateral.every((d) => !passable(edgeAt(x, y, d)));
          cells.push({
            x,
            y,
            facing,
            tile,
            depth,
            doorDepth,
            sideDepth,
            lateralOpeningCount,
            enclosed,
            sameThemeDepth,
            forwardThemes,
            visibleFeatures,
            ...here,
          });
        }
      }
    }

    const themes = [];
    for (const theme of [baseTheme, ...(floor.tilesetZones ?? []).map((zone) => zone.theme.trim())]) {
      if (theme && !themes.includes(theme)) themes.push(theme);
    }
    const regionCounts = {};
    for (const cell of cells) {
      if (cell.facing !== 0) continue;
      regionCounts[cell.regionId] = (regionCounts[cell.regionId] ?? 0) + 1;
    }
    const regions = [
      {
        id: "base",
        theme: baseTheme,
        bounds: null,
        activeInteriorCells: regionCounts.base ?? 0,
      },
      ...(floor.tilesetZones ?? []).map((zone) => ({
        id: zone.id,
        theme: zone.theme.trim(),
        bounds: { x1: zone.x1, y1: zone.y1, x2: zone.x2, y2: zone.y2 },
        activeInteriorCells: regionCounts[zone.id] ?? 0,
      })),
    ];

    return {
      id: floor.id,
      name: floor.name,
      width: floor.width,
      height: floor.height,
      start: { x: floor.startX, y: floor.startY },
      baseTheme,
      themes,
      regions,
      featureCounts,
      interiorCellCount,
      candidateCount: cells.length,
      cells,
    };
  }, floorId);
}

async function readActualState(page) {
  return page.evaluate(() => {
    const debug = window.__onyxDebug;
    const state = debug.state;
    const floor = state.floor;
    const player = state.player;
    const DX = [0, 1, 0, -1];
    const DY = [-1, 0, 1, 0];
    const edgeAt = (x, y, direction) => {
      const cell = floor.grid[y]?.[x];
      if (!cell) return "wall";
      return [cell.n, cell.e, cell.s, cell.w][direction];
    };
    const passable = (edge) => edge === "open" || edge === "door" || edge === "locked";
    const baseTheme = floor.tilesetTheme?.trim() || `f${floor.id}`;
    const themeRegionAt = (x, y) => {
      const zones = floor.tilesetZones ?? [];
      for (let i = zones.length - 1; i >= 0; i--) {
        const zone = zones[i];
        if (x >= zone.x1 && x <= zone.x2 && y >= zone.y1 && y <= zone.y2) {
          const theme = zone.theme.trim();
          if (theme) return { activeTheme: theme, regionId: zone.id };
        }
      }
      return { activeTheme: baseTheme, regionId: "base" };
    };

    let depth = 0;
    let doorDepth = -1;
    let sideDepth = -1;
    let lateralOpeningCount = 0;
    let sameThemeDepth = 0;
    let sameThemeRun = true;
    let cx = player.x;
    let cy = player.y;
    const visibleFeatures = [];
    const forwardThemes = [];
    const here = themeRegionAt(player.x, player.y);
    for (let step = 0; step < 8; step++) {
      const edge = edgeAt(cx, cy, player.facing);
      if (edge === "door" || edge === "locked") {
        if (doorDepth < 0) doorDepth = step;
        break;
      }
      if (edge !== "open") break;
      cx += DX[player.facing];
      cy += DY[player.facing];
      if (cx < 0 || cy < 0 || cx >= floor.width || cy >= floor.height) break;
      depth++;
      const targetRegion = themeRegionAt(cx, cy);
      forwardThemes.push(targetRegion.activeTheme);
      if (sameThemeRun && targetRegion.activeTheme === here.activeTheme) {
        sameThemeDepth++;
      } else {
        sameThemeRun = false;
      }
      const left = (player.facing + 3) % 4;
      const right = (player.facing + 1) % 4;
      const leftOpen = passable(edgeAt(cx, cy, left));
      const rightOpen = passable(edgeAt(cx, cy, right));
      if (sideDepth < 0 && (leftOpen || rightOpen)) sideDepth = depth;
      lateralOpeningCount += Number(leftOpen) + Number(rightOpen);
      const targetTile = floor.grid[cy]?.[cx]?.tile ?? null;
      if (targetTile) {
        visibleFeatures.push({
          x: cx,
          y: cy,
          tile: targetTile,
          depth,
          ...targetRegion,
        });
      }
    }
    const lateral = [(player.facing + 3) % 4, (player.facing + 1) % 4];
    const enclosed = lateral.every((direction) => !passable(edgeAt(player.x, player.y, direction)));
    const snapshot = debug.snapshot();
    return {
      route: snapshot.route,
      mode: snapshot.mode,
      floor: {
        id: floor.id,
        name: floor.name,
        width: floor.width,
        height: floor.height,
        baseTheme,
      },
      position: {
        x: player.x,
        y: player.y,
        facing: player.facing,
        compass: ["N", "E", "S", "W"][player.facing] ?? "?",
      },
      tile: floor.grid[player.y]?.[player.x]?.tile ?? null,
      ...themeRegionAt(player.x, player.y),
      flags: snapshot.flags,
      warnings: snapshot.warnings,
      message: snapshot.message,
      geometry: {
        depth,
        doorDepth,
        sideDepth,
        lateralOpeningCount,
        enclosed,
        sameThemeDepth,
        forwardThemes,
        visibleFeatures,
      },
      readiness: debug.readiness(),
    };
  });
}

async function probeCanvas(page, selector = "#view", includeRows = true) {
  return page.evaluate(
    ({ targetSelector, withRows }) => {
      const canvas = document.querySelector(targetSelector);
      if (!(canvas instanceof HTMLCanvasElement)) {
        return { exists: false, selector: targetSelector };
      }
      const style = getComputedStyle(canvas);
      const rect = canvas.getBoundingClientRect();
      const visible =
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || "1") > 0 &&
        rect.width > 0 &&
        rect.height > 0;
      let ctx = null;
      try {
        ctx = canvas.getContext("2d");
      } catch {
        // A WebGL canvas cannot be rebound to 2D. Dimension/visibility data is
        // still useful for the lifecycle report.
      }
      if (!ctx) {
        return {
          exists: true,
          selector: targetSelector,
          visible,
          width: canvas.width,
          height: canvas.height,
          cssWidth: +rect.width.toFixed(2),
          cssHeight: +rect.height.toFixed(2),
          pixelReadable: false,
        };
      }

      const { width, height } = canvas;
      const pixels = ctx.getImageData(0, 0, width, height).data;
      const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const BG = { r: 14, g: 13, b: 10 };
      const histogram = new Float64Array(256);
      const colours = new Set();
      let sumLuma = 0;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumChroma = 0;
      let nearBackground = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const value = luma(r, g, b);
        sumLuma += value;
        sumR += r;
        sumG += g;
        sumB += b;
        sumChroma += Math.max(r, g, b) - Math.min(r, g, b);
        histogram[Math.min(255, value | 0)]++;
        colours.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
        if (
          Math.abs(r - BG.r) <= 6 &&
          Math.abs(g - BG.g) <= 6 &&
          Math.abs(b - BG.b) <= 6
        ) {
          nearBackground++;
        }
      }
      const count = pixels.length / 4;
      const percentile = (fraction) => {
        let accumulated = 0;
        const wanted = count * fraction;
        for (let value = 0; value < histogram.length; value++) {
          accumulated += histogram[value];
          if (accumulated >= wanted) return value;
        }
        return 255;
      };

      const blockSize = 16;
      const squintWidth = Math.floor(width / blockSize);
      const squintHeight = Math.floor(height / blockSize);
      let squintMin = 255;
      let squintMax = 0;
      for (let by = 0; by < squintHeight; by++) {
        for (let bx = 0; bx < squintWidth; bx++) {
          let blockLuma = 0;
          for (let y = 0; y < blockSize; y++) {
            for (let x = 0; x < blockSize; x++) {
              const index = ((by * blockSize + y) * width + (bx * blockSize + x)) * 4;
              blockLuma += luma(pixels[index], pixels[index + 1], pixels[index + 2]);
            }
          }
          const value = blockLuma / (blockSize * blockSize);
          squintMin = Math.min(squintMin, value);
          squintMax = Math.max(squintMax, value);
        }
      }

      const meanR = sumR / count;
      const meanG = sumG / count;
      const meanB = sumB / count;
      const max = Math.max(meanR, meanG, meanB);
      const min = Math.min(meanR, meanG, meanB);
      let hue = 0;
      if (max - min > 0.5) {
        if (max === meanR) hue = 60 * (((meanG - meanB) / (max - min)) % 6);
        else if (max === meanG) hue = 60 * ((meanB - meanR) / (max - min) + 2);
        else hue = 60 * ((meanR - meanG) / (max - min) + 4);
        if (hue < 0) hue += 360;
      }

      const rowLuma = [];
      if (withRows) {
        const x0 = Math.floor(width * 0.3);
        const x1 = Math.floor(width * 0.7);
        for (let y = 0; y < height; y++) {
          let rowTotal = 0;
          for (let x = x0; x < x1; x++) {
            const index = (y * width + x) * 4;
            rowTotal += luma(pixels[index], pixels[index + 1], pixels[index + 2]);
          }
          rowLuma.push(+(rowTotal / (x1 - x0)).toFixed(2));
        }
      }

      return {
        exists: true,
        selector: targetSelector,
        visible,
        width,
        height,
        cssWidth: +rect.width.toFixed(2),
        cssHeight: +rect.height.toFixed(2),
        pixelReadable: true,
        meanLuma: +(sumLuma / count).toFixed(2),
        p05: percentile(0.05),
        p50: percentile(0.5),
        p95: percentile(0.95),
        meanRGB: [+meanR.toFixed(1), +meanG.toFixed(1), +meanB.toFixed(1)],
        meanChroma: +(sumChroma / count).toFixed(2),
        hueDeg: +hue.toFixed(1),
        nearBackgroundFraction: +(nearBackground / count).toFixed(4),
        nonBackgroundFraction: +(1 - nearBackground / count).toFixed(4),
        quantizedColorCount: colours.size,
        squintMin: +squintMin.toFixed(2),
        squintMax: +squintMax.toFixed(2),
        squintContrast: +(squintMax - squintMin).toFixed(2),
        rowLuma,
      };
    },
    { targetSelector: selector, withRows: includeRows }
  );
}

async function waitForReadiness(page, timeout = 8000) {
  const deadline = Date.now() + timeout;
  let readiness = null;
  do {
    readiness = await page.evaluate(() => window.__onyxDebug.readiness());
    const visualSettled =
      readiness.fonts &&
      readiness.textures &&
      readiness.enemySprites &&
      readiness.partySprites &&
      readiness.effectSprites &&
      readiness.mapSprites;
    const audioSettled = [readiness.audioUi, readiness.audioCombat, readiness.audioDungeon].every(
      (status) => status !== "loading"
    );
    if (visualSettled && audioSettled) return readiness;
    await wait(50);
  } while (Date.now() < deadline);
  return readiness;
}

function makeObjectiveChecks({
  model,
  poseKey,
  pose,
  actual,
  metrics,
  expectedCanvas,
  browserErrors,
}) {
  const checks = [];
  const add = (id, ok, expected, observed) => {
    checks.push({ id, ok: Boolean(ok), expected, observed });
  };
  add("floor-id", actual.floor.id === model.id, model.id, actual.floor.id);
  add("floor-name", actual.floor.name === model.name, model.name, actual.floor.name);
  add(
    "floor-dimensions",
    actual.floor.width === model.width && actual.floor.height === model.height,
    { width: model.width, height: model.height },
    { width: actual.floor.width, height: actual.floor.height }
  );
  add(
    "position",
    actual.position.x === pose.x && actual.position.y === pose.y,
    { x: pose.x, y: pose.y },
    { x: actual.position.x, y: actual.position.y }
  );
  add("facing", actual.position.facing === pose.facing, pose.facing, actual.position.facing);
  add("tile", actual.tile === pose.tile, pose.tile, actual.tile);
  add("active-theme", actual.activeTheme === pose.activeTheme, pose.activeTheme, actual.activeTheme);
  add("active-region", actual.regionId === pose.regionId, pose.regionId, actual.regionId);
  add("route", actual.route === "dungeon", "dungeon", actual.route);
  add("debug-warnings", actual.warnings.length === 0, [], actual.warnings);
  add("canvas-exists", metrics.exists === true, true, metrics.exists);
  add("canvas-visible", metrics.visible === true, true, metrics.visible);
  add(
    "canvas-bounds",
    metrics.exists &&
      metrics.width >= THRESHOLDS.minCanvasWidth &&
      metrics.height >= THRESHOLDS.minCanvasHeight &&
      metrics.width <= THRESHOLDS.maxCanvasWidth &&
      metrics.height <= THRESHOLDS.maxCanvasHeight,
    {
      minWidth: THRESHOLDS.minCanvasWidth,
      minHeight: THRESHOLDS.minCanvasHeight,
      maxWidth: THRESHOLDS.maxCanvasWidth,
      maxHeight: THRESHOLDS.maxCanvasHeight,
    },
    { width: metrics.width, height: metrics.height }
  );
  add(
    "canvas-expected-dimensions",
    !!expectedCanvas &&
      metrics.width === expectedCanvas.width &&
      metrics.height === expectedCanvas.height,
    expectedCanvas,
    { width: metrics.width, height: metrics.height }
  );
  add(
    "canvas-mean-luminance",
    metrics.pixelReadable && metrics.meanLuma >= THRESHOLDS.minMeanLuma,
    `>= ${THRESHOLDS.minMeanLuma}`,
    metrics.meanLuma
  );
  add(
    "canvas-non-background",
    metrics.pixelReadable &&
      metrics.nonBackgroundFraction >= THRESHOLDS.minNonBackgroundFraction,
    `>= ${THRESHOLDS.minNonBackgroundFraction}`,
    metrics.nonBackgroundFraction
  );
  add("textures-settled", actual.readiness.textures === true, true, actual.readiness.textures);
  add("asset-readiness", actual.readiness.failed.length === 0, [], actual.readiness.failed);
  add("browser-errors", browserErrors.length === 0, [], browserErrors);

  let geometryOk = true;
  let geometryExpected = poseKey;
  if (poseKey === "straight") {
    geometryOk =
      actual.geometry.enclosed &&
      actual.geometry.depth >= 3 &&
      (actual.geometry.sideDepth < 0 || actual.geometry.sideDepth >= 2);
    geometryExpected = "enclosed; depth >= 3; no side opening before depth 2";
  } else if (poseKey === "side-passage") {
    geometryOk =
      actual.geometry.enclosed &&
      actual.geometry.depth >= 3 &&
      actual.geometry.sideDepth >= 1 &&
      actual.geometry.sideDepth <= 2;
    geometryExpected = "enclosed; depth >= 3; side opening at depth 1-2";
  } else if (poseKey === "front-wall") {
    geometryOk = actual.geometry.depth === 0 && actual.geometry.doorDepth < 0;
    geometryExpected = "solid non-door edge at depth 0";
  } else if (poseKey === "door") {
    geometryOk = actual.geometry.doorDepth >= 0;
    geometryExpected = "door or locked edge in forward view";
  } else if (poseKey === "floor-variation") {
    geometryOk = actual.geometry.depth >= 3;
    geometryExpected = "at least three open floor cells ahead";
  } else if (poseKey === "darkness") {
    geometryOk = actual.tile === "darkness" && actual.flags.inDarkness === true;
    geometryExpected = "standing on darkness tile after normal movement; inDarkness=true";
  } else if (poseKey === "landmark") {
    const target = pose.targetFeature;
    geometryOk =
      !!target &&
      actual.geometry.visibleFeatures.some(
        (feature) =>
          feature.x === target.x &&
          feature.y === target.y &&
          feature.tile === target.tile
      );
    geometryExpected = target ?? "visible major feature";
  } else if (poseKey.startsWith("theme-")) {
    geometryOk =
      actual.activeTheme === pose.activeTheme &&
      (actual.geometry.sameThemeDepth >= 2 ||
        (actual.geometry.depth === 0 && actual.geometry.doorDepth < 0));
    geometryExpected = `runtime theme ${pose.activeTheme} sustained for >=2 cells, or a same-theme depth-0 wall`;
  }
  add("pose-classification", geometryOk, geometryExpected, actual.geometry);
  return checks;
}

function relativeOutputPath(absolutePath) {
  return path.relative(OUT, absolutePath).split(path.sep).join("/");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMetricLine(capture) {
  const metrics = capture.metrics;
  if (!metrics?.pixelReadable) return "Canvas pixels unavailable";
  return [
    `L ${metrics.meanLuma}`,
    `p05/50/95 ${metrics.p05}/${metrics.p50}/${metrics.p95}`,
    `non-bg ${(metrics.nonBackgroundFraction * 100).toFixed(1)}%`,
    `chroma ${metrics.meanChroma}`,
    `hue ${metrics.hueDeg}°`,
    `colors ${metrics.quantizedColorCount}`,
    `squint ${metrics.squintContrast}`,
  ].join(" · ");
}

function captureCard(capture) {
  const actual = capture.actual;
  const failures = (capture.objectiveChecks ?? []).filter((entry) => !entry.ok);
  return `<article class="card ${capture.ok ? "pass" : "fail"}">
  <a href="${escapeHtml(capture.screenshot)}"><img src="${escapeHtml(capture.screenshot)}" alt="${escapeHtml(capture.label)}" loading="lazy" /></a>
  <div class="body">
    <div class="status">${capture.ok ? "PASS" : "FAIL"}</div>
    <h3>${escapeHtml(capture.label)}</h3>
    <p>(${actual.position.x}, ${actual.position.y}) facing ${escapeHtml(actual.position.compass)} · tile ${escapeHtml(actual.tile ?? "none")}</p>
    <p>theme <strong>${escapeHtml(actual.activeTheme)}</strong> · region <strong>${escapeHtml(actual.regionId)}</strong></p>
    <p class="metrics">${escapeHtml(renderMetricLine(capture))}</p>
    ${
      failures.length
        ? `<ul class="failures">${failures
            .map((entry) => `<li>${escapeHtml(entry.id)}: ${escapeHtml(JSON.stringify(entry.observed))}</li>`)
            .join("")}</ul>`
        : ""
    }
  </div>
</article>`;
}

function unavailableCard(entry) {
  return `<article class="card unavailable"><div class="body">
  <div class="status">UNAVAILABLE</div>
  <h3>${escapeHtml(entry.label)}</h3>
  <p>${escapeHtml(entry.reason)}</p>
</div></article>`;
}

function lifecycleCard(capture) {
  const details = capture.actual
    ? `${capture.actual.floor.name} · (${capture.actual.position.x}, ${capture.actual.position.y}) ${capture.actual.position.compass}`
    : capture.detail ?? "";
  return `<article class="card ${capture.ok ? "pass" : "fail"}">
  <a href="${escapeHtml(capture.screenshot)}"><img src="${escapeHtml(capture.screenshot)}" alt="${escapeHtml(capture.label)}" loading="lazy" /></a>
  <div class="body">
    <div class="status">${capture.ok ? "PASS" : "FAIL"}</div>
    <h3>${escapeHtml(capture.label)}</h3>
    <p>${escapeHtml(details)}</p>
    ${capture.metrics?.pixelReadable ? `<p class="metrics">${escapeHtml(renderMetricLine(capture))}</p>` : ""}
  </div>
</article>`;
}

function buildGallery(report) {
  const floorSections = report.floors
    .map((floor) => {
      const cards = floor.coverage
        .map((entry) =>
          entry.status === "captured"
            ? captureCard(floor.captures.find((capture) => capture.id === entry.captureId))
            : unavailableCard(entry)
        )
        .join("\n");
      return `<section id="floor-${floor.id}">
  <h2>Floor ${floor.id} — ${escapeHtml(floor.name)}</h2>
  <p class="floor-meta">${floor.width}×${floor.height} · base ${escapeHtml(floor.baseTheme)} · runtime themes ${floor.themes.map(escapeHtml).join(", ")}</p>
  <div class="grid">${cards}</div>
</section>`;
    })
    .join("\n");
  const lifecycle = report.lifecycle?.captures?.map(lifecycleCard).join("\n") ?? "";
  const failedChecks = report.checks.filter((entry) => !entry.ok);
  const nav = report.floors
    .map((floor) => `<a href="#floor-${floor.id}">F${floor.id}</a>`)
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>OnyxLabyrinth — Campaign floor visual audit</title>
<style>
  :root { color-scheme: dark; --bg:#0e0d0a; --panel:#181611; --line:#3c3427; --ink:#eee4d0; --muted:#a99c86; --amber:#e0a458; --ok:#83b77a; --bad:#d66b61; }
  * { box-sizing:border-box; }
  body { margin:0; padding:24px clamp(16px,3vw,44px) 64px; background:radial-gradient(circle at top,#211b13,var(--bg) 48rem); color:var(--ink); font:14px/1.45 system-ui,sans-serif; }
  header { max-width:90rem; margin:auto; }
  h1 { margin:0 0 8px; font:700 clamp(25px,4vw,38px)/1.1 Georgia,serif; color:var(--amber); }
  h2 { margin:44px 0 8px; padding-bottom:8px; border-bottom:1px solid var(--line); color:var(--amber); font:700 24px/1.2 Georgia,serif; }
  h3 { margin:4px 0 8px; font-size:17px; }
  p { margin:5px 0; }
  .lede,.floor-meta,.metrics { color:var(--muted); }
  nav { display:flex; flex-wrap:wrap; gap:8px; margin:18px 0; }
  nav a,.report-link { color:var(--ink); border:1px solid var(--line); background:var(--panel); padding:6px 11px; text-decoration:none; }
  main { max-width:90rem; margin:auto; }
  .summary { display:flex; flex-wrap:wrap; gap:10px 22px; padding:14px; border:1px solid var(--line); background:var(--panel); }
  .summary strong { color:var(--amber); }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,560px),1fr)); gap:18px; align-items:start; }
  .card { overflow:hidden; border:1px solid var(--line); background:var(--panel); }
  .card.pass { border-color:color-mix(in srgb,var(--ok) 55%,var(--line)); }
  .card.fail { border-color:var(--bad); }
  .card.unavailable { border-style:dashed; min-height:150px; }
  .card img { display:block; width:100%; height:auto; background:#050504; image-rendering:auto; }
  .body { padding:13px 15px 16px; }
  .status { float:right; margin-left:10px; color:var(--ok); font-weight:800; letter-spacing:.08em; }
  .fail .status,.unavailable .status { color:var(--bad); }
  .failures { color:#f2a59c; margin:10px 0 0; padding-left:20px; }
  code { color:var(--amber); }
</style>
</head>
<body>
<header>
  <h1>Campaign floor visual audit</h1>
  <p class="lede">Live corridor projection, fog, lighting, vignette, scanlines, regional themes, and lifecycle transitions. This is separate from the static source-texture gallery.</p>
  <div class="summary">
    <span>Result <strong>${report.ok ? "PASS" : "FAIL"}</strong></span>
    <span>Floors <strong>${report.summary.capturedFloorIds.join(", ")}</strong></span>
    <span>Corridor captures <strong>${report.summary.captureCount}</strong></span>
    <span>Unavailable poses <strong>${report.summary.unavailableCount}</strong></span>
    <span>Failed checks <strong>${failedChecks.length}</strong></span>
    <span>Generated <strong>${escapeHtml(report.completedAt ?? report.startedAt)}</strong></span>
  </div>
  <nav><a href="#lifecycle">Lifecycle</a>${nav}<a class="report-link" href="report.json">report.json</a></nav>
</header>
<main>
<section id="lifecycle">
  <h2>Lifecycle — map and combat return</h2>
  <div class="grid">${lifecycle}</div>
</section>
${floorSections}
</main>
</body>
</html>`;
}

const report = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  url: URL,
  outputDirectory: OUT,
  viewport: VIEWPORT,
  thresholds: THRESHOLDS,
  selectedFloorIds: SELECTED_FLOORS,
  poseSource: {
    kind: "runtime-derived",
    surface: "window.__onyxDebug.FLOORS / findFloor",
    savedPoseFileUsed: false,
    note: "scripts/playtests/corridor-poses.json is deliberately not read.",
  },
  floors: [],
  lifecycle: { floorId: null, captures: [], checks: [] },
  checks: [],
  browserErrors: [],
  httpErrors: [],
};

function addReportCheck(name, ok, detail = null) {
  const entry = { name, ok: Boolean(ok), detail };
  report.checks.push(entry);
  console.log(`${entry.ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  return entry.ok;
}

let browser = null;
let page = null;
let launchErrors = [];
const httpErrors = [];
let expectedCanvas = null;

try {
  const launched = await launch({ viewport: VIEWPORT });
  browser = launched.browser;
  page = launched.page;
  launchErrors = launched.errors;
  page.on("response", (response) => {
    if (response.status() >= 400) {
      httpErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto(URL, { waitUntil: "networkidle" });
  await wait(400);
  await ensureAudioResumed(page, 8000);
  const bootReadiness = await waitForReadiness(page);
  report.bootReadiness = bootReadiness;
  addReportCheck("debug surface available", await page.evaluate(() => !!window.__onyxDebug));
  addReportCheck(
    "visual assets settled at boot",
    !!bootReadiness &&
      bootReadiness.fonts &&
      bootReadiness.textures &&
      bootReadiness.enemySprites &&
      bootReadiness.partySprites &&
      bootReadiness.effectSprites &&
      bootReadiness.mapSprites,
    bootReadiness
  );
  addReportCheck("asset readiness has no failures at boot", bootReadiness.failed.length === 0, bootReadiness.failed);

  for (const floorId of SELECTED_FLOORS) {
    const model = await discoverRuntimeFloor(page, floorId);
    const derived = derivePoses(model);
    const floorDir = ensureOutDir(path.join(OUT, `floor-${String(floorId).padStart(2, "0")}-${slug(model.name)}`));
    const floorReport = {
      id: model.id,
      name: model.name,
      width: model.width,
      height: model.height,
      start: model.start,
      baseTheme: model.baseTheme,
      themes: model.themes,
      regions: model.regions,
      featureCounts: model.featureCounts,
      discovery: {
        source: "live production runtime",
        interiorCellCount: model.interiorCellCount,
        classifiedPoseCount: model.candidateCount,
      },
      poses: {
        standard: Object.fromEntries(
          derived.standard.map((entry) => [entry.key, compactPose(entry.pose)])
        ),
        themes: Object.fromEntries(
          derived.themes.map((entry) => [entry.theme, compactPose(entry.pose)])
        ),
      },
      captures: [],
      coverage: [],
    };
    report.floors.push(floorReport);

    let captureNumber = 0;
    const capturePose = async ({ key, label, pose }) => {
      captureNumber++;
      if (pose.setup) {
        await jumpTo(page, {
          floorId,
          x: pose.setup.x,
          y: pose.setup.y,
          facing: pose.setup.facing,
          autosave: false,
          stepsSinceEncounter: 0,
          clearUnlockedDoors: true,
        });
        await act(page, "ArrowUp", 4000);
        // Preserve the darkness state while using two turns to finish/dismiss
        // the notification and restore the requested facing.
        await act(page, "ArrowLeft", 4000);
        await act(page, "ArrowRight", 4000);
      } else {
        await jumpTo(page, {
          floorId,
          x: pose.x,
          y: pose.y,
          facing: pose.facing,
          autosave: false,
          stepsSinceEncounter: 0,
          clearUnlockedDoors: true,
        });
      }
      await waitForIdle(page, 5000);
      await wait(180);
      const actual = await readActualState(page);
      const metrics = await probeCanvas(page);
      if (!expectedCanvas && metrics.exists) {
        expectedCanvas = { width: metrics.width, height: metrics.height };
        report.expectedCanvas = expectedCanvas;
      }
      const errorsAtCapture = [...launchErrors, ...httpErrors];
      const filename = `${String(captureNumber).padStart(2, "0")}-${slug(key)}.png`;
      const screenshot = relativeOutputPath(await shot(page, floorDir, filename));
      const objectiveChecks = makeObjectiveChecks({
        model,
        poseKey: key,
        pose,
        actual,
        metrics,
        expectedCanvas,
        browserErrors: errorsAtCapture,
      });
      const capture = {
        id: `f${floorId}-${key}`,
        kind: key.startsWith("theme-") ? "regional-theme" : "corridor-pose",
        label,
        requested: {
          floor: { id: model.id, name: model.name, width: model.width, height: model.height },
          position: { x: pose.x, y: pose.y, facing: pose.facing },
          tile: pose.tile,
          activeTheme: pose.activeTheme,
          regionId: pose.regionId,
          targetFeature: pose.targetFeature ?? null,
          setup: pose.setup ?? null,
        },
        actual,
        metrics,
        objectiveChecks,
        browserErrors: errorsAtCapture,
        screenshot,
        ok: objectiveChecks.every((entry) => entry.ok),
      };
      floorReport.captures.push(capture);
      console.log(
        `${capture.ok ? "PASS" : "FAIL"} f${floorId} ${label} @ ${pose.x},${pose.y},${FACING_NAMES[pose.facing]} theme=${actual.activeTheme}/${actual.regionId} L=${metrics.meanLuma} non-bg=${(metrics.nonBackgroundFraction * 100).toFixed(1)}%`
      );
      if (!capture.ok) {
        for (const failed of objectiveChecks.filter((entry) => !entry.ok)) {
          console.log(`  - ${failed.id}: expected ${JSON.stringify(failed.expected)}, got ${JSON.stringify(failed.observed)}`);
        }
      }
      return capture;
    };

    for (const entry of derived.standard) {
      if (!entry.pose) {
        const applicable = entry.applicable !== false;
        floorReport.coverage.push({
          key: entry.key,
          label: entry.label,
          status: "unavailable",
          applicable,
          reason: entry.unavailableReason,
        });
        console.log(`UNAVAILABLE f${floorId} ${entry.label} — ${entry.unavailableReason}`);
        if (entry.key === "darkness" && applicable) {
          addReportCheck(`floor ${floorId} darkness entry pose exists`, false, entry.unavailableReason);
        }
        continue;
      }
      const capture = await capturePose(entry);
      floorReport.coverage.push({
        key: entry.key,
        label: entry.label,
        status: "captured",
        captureId: capture.id,
      });
    }

    for (const themeEntry of derived.themes) {
      const key = `theme-${slug(themeEntry.theme)}`;
      const label = `Regional theme: ${themeEntry.theme}`;
      if (!themeEntry.pose) {
        floorReport.coverage.push({
          key,
          label,
          status: "unavailable",
          applicable: true,
          reason: `Runtime declares theme ${themeEntry.theme}, but no valid interior camera cell resolves to it.`,
        });
        addReportCheck(
          `floor ${floorId} theme ${themeEntry.theme} has a valid capture pose`,
          false,
          "declared theme has no active interior cell"
        );
        continue;
      }
      const capture = await capturePose({ key, label, pose: themeEntry.pose });
      floorReport.coverage.push({ key, label, status: "captured", captureId: capture.id });
    }

    const themeCaptures = new Set(
      floorReport.captures
        .filter((capture) => capture.kind === "regional-theme" && capture.ok)
        .map((capture) => capture.actual.activeTheme)
    );
    addReportCheck(
      `floor ${floorId} runtime theme coverage`,
      model.themes.every((theme) => themeCaptures.has(theme)),
      { expected: model.themes, captured: [...themeCaptures] }
    );
  }

  // Lifecycle pass: Floor 2 for the full campaign run because its tileset is
  // the newest. A filtered run uses Floor 2 when selected, otherwise its first
  // selected floor so the filter remains honest.
  const lifecycleFloorId = SELECTED_FLOORS.includes(2) ? 2 : SELECTED_FLOORS[0];
  report.lifecycle.floorId = lifecycleFloorId;
  const lifecycleFloor = report.floors.find((floor) => floor.id === lifecycleFloorId);
  const lifecyclePose =
    lifecycleFloor.poses.standard.straight ??
    lifecycleFloor.poses.standard["floor-variation"] ??
    lifecycleFloor.captures[0]?.requested?.position;
  if (!lifecyclePose) throw new Error(`No lifecycle camera pose available on floor ${lifecycleFloorId}`);
  const lifecycleDir = ensureOutDir(path.join(OUT, "lifecycle"));
  const addLifecycleCheck = (name, ok, detail = null) => {
    const entry = { name, ok: Boolean(ok), detail };
    report.lifecycle.checks.push(entry);
    console.log(`${entry.ok ? "PASS" : "FAIL"} lifecycle ${name}${detail ? ` — ${JSON.stringify(detail)}` : ""}`);
    return entry.ok;
  };
  const lifecycleShot = async (filename, label, actual, metrics, ok, detail = null) => {
    const screenshot = relativeOutputPath(await shot(page, lifecycleDir, filename));
    const entry = { filename, label, screenshot, actual, metrics, ok: Boolean(ok), detail };
    report.lifecycle.captures.push(entry);
    return entry;
  };

  await jumpTo(page, {
    floorId: lifecycleFloorId,
    x: lifecyclePose.x,
    y: lifecyclePose.y,
    facing: lifecyclePose.facing,
    autosave: false,
    stepsSinceEncounter: 0,
    clearUnlockedDoors: true,
  });
  await waitForIdle(page, 5000);
  await wait(180);
  const beforeActual = await readActualState(page);
  const beforeMetrics = await probeCanvas(page);
  const beforeOk =
    beforeActual.route === "dungeon" &&
    beforeActual.floor.id === lifecycleFloorId &&
    beforeActual.warnings.length === 0 &&
    beforeMetrics.visible &&
    beforeMetrics.meanLuma >= THRESHOLDS.minMeanLuma &&
    beforeMetrics.nonBackgroundFraction >= THRESHOLDS.minNonBackgroundFraction;
  await lifecycleShot(
    "01-corridor-before.png",
    "Corridor before transitions",
    beforeActual,
    beforeMetrics,
    beforeOk
  );
  addLifecycleCheck("baseline corridor is intact", beforeOk, {
    width: beforeMetrics.width,
    height: beforeMetrics.height,
    meanLuma: beforeMetrics.meanLuma,
    nonBackgroundFraction: beforeMetrics.nonBackgroundFraction,
  });

  await press(page, "m");
  await wait(350);
  const mapActual = await readActualState(page);
  const mapMetrics = await probeCanvas(page, "#map-canvas", false);
  const mapOk =
    mapActual.route === "dungeon" &&
    mapActual.floor.id === lifecycleFloorId &&
    mapActual.flags.mapVisible === true &&
    mapActual.warnings.length === 0 &&
    mapMetrics.exists &&
    mapMetrics.visible &&
    mapMetrics.width === expectedCanvas.width &&
    mapMetrics.height === expectedCanvas.height;
  await lifecycleShot("02-map-open.png", "Full automap open", mapActual, mapMetrics, mapOk);
  addLifecycleCheck("full automap opens", mapOk, {
    route: mapActual.route,
    mapVisible: mapActual.flags.mapVisible,
    canvas: { width: mapMetrics.width, height: mapMetrics.height, visible: mapMetrics.visible },
  });

  await press(page, "m");
  await waitForIdle(page, 4000);
  await wait(180);
  const afterMapActual = await readActualState(page);
  const afterMapMetrics = await probeCanvas(page);
  const mapLumaRatio = afterMapMetrics.meanLuma / Math.max(beforeMetrics.meanLuma, 0.01);
  const mapNonBackgroundRatio =
    afterMapMetrics.nonBackgroundFraction /
    Math.max(beforeMetrics.nonBackgroundFraction, 0.0001);
  const afterMapOk =
    afterMapActual.route === "dungeon" &&
    afterMapActual.floor.id === lifecycleFloorId &&
    afterMapActual.position.x === beforeActual.position.x &&
    afterMapActual.position.y === beforeActual.position.y &&
    afterMapActual.position.facing === beforeActual.position.facing &&
    afterMapActual.flags.mapVisible === false &&
    afterMapActual.warnings.length === 0 &&
    afterMapMetrics.visible &&
    afterMapMetrics.meanLuma >= THRESHOLDS.minMeanLuma &&
    afterMapMetrics.nonBackgroundFraction >= THRESHOLDS.minNonBackgroundFraction &&
    mapLumaRatio >= THRESHOLDS.minTransitionLumaRatio &&
    mapNonBackgroundRatio >= THRESHOLDS.minTransitionNonBackgroundRatio;
  await lifecycleShot(
    "03-corridor-after-map.png",
    "Corridor after map close",
    afterMapActual,
    afterMapMetrics,
    afterMapOk,
    { lumaRatio: +mapLumaRatio.toFixed(3), nonBackgroundRatio: +mapNonBackgroundRatio.toFixed(3) }
  );
  addLifecycleCheck("corridor survives full-map close", afterMapOk, {
    lumaRatio: +mapLumaRatio.toFixed(3),
    nonBackgroundRatio: +mapNonBackgroundRatio.toFixed(3),
  });

  const combatStart = await page.evaluate(async () => {
    const debug = window.__onyxDebug;
    const state = debug.state;
    let resolved = null;
    for (let attempt = 0; attempt < 300; attempt++) {
      const entry = debug.rollEncounter(state.floor.id);
      if (!entry) continue;
      const enemies = debug.resolveEncounter(entry);
      if (!enemies.length || enemies.some((enemy) => enemy.enemy.isBoss)) continue;
      resolved = enemies;
      break;
    }
    if (!resolved) return { ok: false, reason: "no non-boss encounter resolved" };
    const combat = debug.createCombatFromEncounter(
      state.party,
      resolved,
      debug.SPELLS_BY_ID,
      debug.ITEMS_BY_ID,
      state.equipment,
      state.inventory,
      state.inAntimagic,
      state.activeCharIds
    );
    await debug.startCombat(combat);
    return {
      ok: true,
      enemyCount: resolved.length,
      enemies: resolved.map((entry) => entry.enemy.name),
      bossCount: resolved.filter((entry) => entry.enemy.isBoss).length,
    };
  });
  await waitForIdle(page, 8000);
  await wait(500);
  const combatSnapshot = await snap(page);
  const combatCanvas = await page.evaluate(() => {
    const candidates = ["#combat-phaser-canvas", "#combat-canvas"];
    for (const selector of candidates) {
      const canvas = document.querySelector(selector);
      if (!(canvas instanceof HTMLCanvasElement)) continue;
      const style = getComputedStyle(canvas);
      const rect = canvas.getBoundingClientRect();
      if (style.display === "none" || rect.width <= 0 || rect.height <= 0) continue;
      return {
        selector,
        width: canvas.width,
        height: canvas.height,
        cssWidth: +rect.width.toFixed(2),
        cssHeight: +rect.height.toFixed(2),
        visible: style.visibility !== "hidden" && Number(style.opacity || "1") > 0,
      };
    }
    return null;
  });
  const combatOk =
    combatStart.ok &&
    combatStart.bossCount === 0 &&
    combatSnapshot.route === "combat" &&
    combatSnapshot.warnings.length === 0 &&
    combatCanvas?.visible === true;
  const combatScreenshot = relativeOutputPath(
    await shot(page, lifecycleDir, "04-real-non-boss-combat.png")
  );
  report.lifecycle.captures.push({
    filename: "04-real-non-boss-combat.png",
    label: "Real non-boss combat",
    screenshot: combatScreenshot,
    actual: null,
    metrics: null,
    ok: combatOk,
    detail: { combatStart, route: combatSnapshot.route, warnings: combatSnapshot.warnings, combatCanvas },
  });
  addLifecycleCheck("real non-boss combat starts", combatOk, {
    combatStart,
    route: combatSnapshot.route,
    warnings: combatSnapshot.warnings,
    combatCanvas,
  });

  if (combatSnapshot.route === "combat") {
    await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
  }
  const returnDeadline = Date.now() + 10000;
  let returned = await snap(page);
  while (returned.route === "combat" && Date.now() < returnDeadline) {
    await wait(120);
    returned = await snap(page);
  }
  await waitForIdle(page, 5000);
  await wait(250);
  const afterCombatActual = await readActualState(page);
  const afterCombatMetrics = await probeCanvas(page);
  const combatLumaRatio = afterCombatMetrics.meanLuma / Math.max(beforeMetrics.meanLuma, 0.01);
  const combatNonBackgroundRatio =
    afterCombatMetrics.nonBackgroundFraction /
    Math.max(beforeMetrics.nonBackgroundFraction, 0.0001);
  const afterCombatOk =
    afterCombatActual.route === "dungeon" &&
    afterCombatActual.floor.id === lifecycleFloorId &&
    afterCombatActual.position.x === beforeActual.position.x &&
    afterCombatActual.position.y === beforeActual.position.y &&
    afterCombatActual.position.facing === beforeActual.position.facing &&
    afterCombatActual.warnings.length === 0 &&
    afterCombatActual.readiness.failed.length === 0 &&
    afterCombatMetrics.visible &&
    afterCombatMetrics.meanLuma >= THRESHOLDS.minMeanLuma &&
    afterCombatMetrics.nonBackgroundFraction >= THRESHOLDS.minNonBackgroundFraction &&
    combatLumaRatio >= THRESHOLDS.minTransitionLumaRatio &&
    combatNonBackgroundRatio >= THRESHOLDS.minTransitionNonBackgroundRatio;
  await lifecycleShot(
    "05-corridor-after-combat.png",
    "Corridor after flee/return",
    afterCombatActual,
    afterCombatMetrics,
    afterCombatOk,
    {
      lumaRatio: +combatLumaRatio.toFixed(3),
      nonBackgroundRatio: +combatNonBackgroundRatio.toFixed(3),
    }
  );
  addLifecycleCheck("same floor textures survive combat return", afterCombatOk, {
    floor: afterCombatActual.floor.id,
    position: afterCombatActual.position,
    activeTheme: afterCombatActual.activeTheme,
    lumaRatio: +combatLumaRatio.toFixed(3),
    nonBackgroundRatio: +combatNonBackgroundRatio.toFixed(3),
  });

  report.finalReadiness = await page.evaluate(() => window.__onyxDebug.readiness());
  report.finalSnapshot = await snap(page);
  report.debugErrors = await page.evaluate(() => window.__onyxDebug.log(300, "error"));
  report.transcript = getTranscript(page);
  report.browserErrors = [...launchErrors];
  report.httpErrors = [...httpErrors];

  const allCaptures = report.floors.flatMap((floor) => floor.captures);
  const capturedFloorIds = report.floors
    .filter((floor) => floor.captures.length > 0)
    .map((floor) => floor.id);
  addReportCheck(
    "all selected floors captured",
    SELECTED_FLOORS.every((id) => capturedFloorIds.includes(id)),
    { selected: SELECTED_FLOORS, captured: capturedFloorIds }
  );
  if (SELECTED_FLOORS.length === CAMPAIGN_FLOORS.length) {
    addReportCheck(
      "all five campaign floors captured",
      CAMPAIGN_FLOORS.every((id) => capturedFloorIds.includes(id)),
      capturedFloorIds
    );
  }
  addReportCheck(
    "all corridor capture objective checks pass",
    allCaptures.every((capture) => capture.ok),
    allCaptures.filter((capture) => !capture.ok).map((capture) => capture.id)
  );
  addReportCheck(
    "lifecycle checks pass",
    report.lifecycle.checks.every((entry) => entry.ok),
    report.lifecycle.checks.filter((entry) => !entry.ok)
  );
  addReportCheck(
    "final asset readiness has no failures",
    report.finalReadiness.failed.length === 0,
    report.finalReadiness.failed
  );
  addReportCheck("browser console/page/request failure list is empty", launchErrors.length === 0, launchErrors);
  addReportCheck("HTTP error response list is empty", httpErrors.length === 0, httpErrors);
  addReportCheck("debug error event list is empty", report.debugErrors.length === 0, report.debugErrors);

  report.completedAt = new Date().toISOString();
  report.summary = {
    selectedFloorIds: SELECTED_FLOORS,
    capturedFloorIds,
    fullCampaign: SELECTED_FLOORS.length === CAMPAIGN_FLOORS.length,
    captureCount: allCaptures.length,
    unavailableCount: report.floors.reduce(
      (sum, floor) => sum + floor.coverage.filter((entry) => entry.status === "unavailable").length,
      0
    ),
    failedCaptureCount: allCaptures.filter((capture) => !capture.ok).length,
    failedCheckCount: report.checks.filter((entry) => !entry.ok).length,
  };
  report.ok =
    report.checks.every((entry) => entry.ok) &&
    report.lifecycle.checks.every((entry) => entry.ok) &&
    allCaptures.every((capture) => capture.ok);
} catch (error) {
  report.exception = String(error?.stack ?? error);
  report.completedAt = new Date().toISOString();
  report.browserErrors = [...launchErrors];
  report.httpErrors = [...httpErrors];
  report.summary = {
    selectedFloorIds: SELECTED_FLOORS,
    capturedFloorIds: report.floors.filter((floor) => floor.captures.length).map((floor) => floor.id),
    fullCampaign: SELECTED_FLOORS.length === CAMPAIGN_FLOORS.length,
    captureCount: report.floors.reduce((sum, floor) => sum + floor.captures.length, 0),
    unavailableCount: report.floors.reduce(
      (sum, floor) => sum + floor.coverage.filter((entry) => entry.status === "unavailable").length,
      0
    ),
    failedCaptureCount: report.floors.reduce(
      (sum, floor) => sum + floor.captures.filter((capture) => !capture.ok).length,
      0
    ),
    failedCheckCount: report.checks.filter((entry) => !entry.ok).length + 1,
  };
  report.checks.push({ name: "audit completed without exception", ok: false, detail: report.exception });
  report.ok = false;
  console.error(report.exception);
} finally {
  if (browser) await browser.close();
}

const reportPath = writeReport(OUT, report);
const galleryPath = path.join(OUT, "index.html");
fs.writeFileSync(galleryPath, buildGallery(report), "utf8");
console.log(`report:  ${reportPath}`);
console.log(`gallery: ${galleryPath}`);
console.log(`result:  ${report.ok ? "PASS" : "FAIL"}`);
process.exit(report.ok ? 0 : 1);
