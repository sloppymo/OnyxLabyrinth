import { readFileSync } from "node:fs";
import { PNG } from "pngjs";

export const STATE_ORDER = ["idle", "walk", "attack", "hurt", "default"];

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readUint32BE(buf, offset) {
  return (
    (buf[offset] << 24) |
    (buf[offset + 1] << 16) |
    (buf[offset + 2] << 8) |
    buf[offset + 3]
  ) >>> 0;
}

export function pngSize(file) {
  const buf = new Uint8Array(readFileSync(file));
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== PNG_SIGNATURE[i]) throw new Error(`${file}: not a PNG`);
  }
  let offset = 8;
  while (offset < buf.length) {
    const length = readUint32BE(buf, offset);
    const type = String.fromCharCode(
      buf[offset + 4],
      buf[offset + 5],
      buf[offset + 6],
      buf[offset + 7]
    );
    if (type === "IHDR") {
      return {
        width: readUint32BE(buf, offset + 8),
        height: readUint32BE(buf, offset + 12),
      };
    }
    offset += 12 + length;
  }
  throw new Error(`${file}: IHDR not found`);
}

export function loadPng(file) {
  return PNG.sync.read(readFileSync(file));
}

function rowPixelStats(png, rowY, frameXs) {
  const { width, height, data } = png;
  let weightedX = 0;
  let totalAlpha = 0;
  for (const fx of frameXs) {
    for (let py = 0; py < 16; py++) {
      for (let px = 0; px < 16; px++) {
        const x = fx + px;
        const y = rowY + py;
        if (x >= width || y >= height) continue;
        const idx = (y * width + x) * 4 + 3;
        const a = data[idx];
        if (a === 0) continue;
        weightedX += a * (x + 0.5);
        totalAlpha += a;
      }
    }
  }
  return { weightedX, totalAlpha };
}

export function detectVisualFacing(png, rowY, frameXs) {
  const { weightedX, totalAlpha } = rowPixelStats(png, rowY, frameXs);
  if (totalAlpha === 0) return "unknown";
  const centroid = weightedX / totalAlpha;
  const minX = Math.min(...frameXs);
  const maxX = Math.max(...frameXs);
  const centerX = (minX + maxX + 16) / 2;
  const diff = centroid - centerX;
  if (Math.abs(diff) < 0.5) return "unknown";
  return diff > 0 ? "right" : "left";
}

export function parseCreatureSideStates(tresPath, size, png) {
  const text = readFileSync(tresPath, "utf8");
  const regions = {};

  const reSub =
    /\[sub_resource type="AtlasTexture" id="([^"]+)"\]\s*atlas = ExtResource\("[^"]+"\)\s*region = Rect2\((\d+), (\d+), (\d+), (\d+)\)/g;
  let m;
  while ((m = reSub.exec(text)) !== null) {
    regions[m[1]] = { x: +m[2], y: +m[3], w: +m[4], h: +m[5] };
  }

  const stateDirs = new Map();
  const reAnim =
    /\{\s*"frames": \[([\s\S]*?)\],\s*"loop": \w+,\s*"name": &"([^"]+)",\s*"speed": ([\d.]+)\s*\}/g;
  while ((m = reAnim.exec(text)) !== null) {
    const framesBlock = m[1];
    const name = m[2];
    const speed = +m[3];
    const refs = [
      ...framesBlock.matchAll(/"texture": SubResource\("([^"]+)"\)/g),
    ].map((r) => r[1]);
    const frames = refs
      .map((id) => regions[id])
      .filter(
        (f) => f && f.w === 16 && f.h === 16 && f.y + 16 <= size.height
      );

    if (frames.length === 0) continue;
    const stateMatch = name.match(/^(.+)_(down|up|left|right)$/);
    if (!stateMatch) continue;
    const state = stateMatch[1];
    const dir = stateMatch[2];
    const y = frames[0].y;
    const xs = frames.map((f) => f.x);

    if (!stateDirs.has(state)) stateDirs.set(state, new Map());
    stateDirs.get(state).set(dir, { y, xs, fps: speed });
  }

  const states = [];
  for (const [state, dirMap] of stateDirs) {
    let chosenDir = "right";
    let chosen = dirMap.get("right");
    let flipH = false;

    if (!chosen) {
      chosen = dirMap.get("left");
      chosenDir = "left";
      flipH = true;
    }
    if (!chosen) continue;

    let xs = [...chosen.xs];
    if (png) {
      let rightCount = 0;
      let leftCount = 0;
      const facings = chosen.xs.map((x) => {
        const facing = detectVisualFacing(png, chosen.y, [x]);
        if (facing === "right") rightCount++;
        else if (facing === "left") leftCount++;
        return facing;
      });

      if (rightCount >= leftCount) {
        flipH = false;
        xs = chosen.xs.filter((_, i) => facings[i] === "right");
      } else {
        flipH = true;
        xs = chosen.xs.filter((_, i) => facings[i] === "left");
      }

      if (xs.length === 0) {
        xs = [chosen.xs[0]];
        flipH = false;
      }
    }

    states.push({
      state,
      fps: chosen.fps,
      frameW: 16,
      frameH: 16,
      frameCount: xs.length,
      sxOffset: xs[0],
      syOffset: chosen.y,
      orientation: "h",
      flipH,
    });
  }

  states.sort(
    (a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state)
  );
  return states;
}

export function fpsForState(state) {
  const s = state.toLowerCase();
  if (s === "idle" || s === "walk") return 6;
  if (s.startsWith("attack") || s.includes("explosion") || s === "fireball") return 10;
  return 8;
}

export function safeId(str) {
  return String(str)
    .replace(/\s/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function inferEffectGrid({ width, height }) {
  if (width % 16 === 0 && height % 16 === 0) {
    const cols = width / 16;
    const rows = height / 16;
    const frameCount = cols * rows;
    if (frameCount > 1) {
      return {
        orientation: "g",
        frameW: 16,
        frameH: 16,
        cols,
        rows,
        frameCount,
      };
    }
  }
  return { orientation: "h", frameW: width, frameH: height, frameCount: 1 };
}
