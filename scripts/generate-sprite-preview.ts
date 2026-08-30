#!/usr/bin/env npx tsx
/**
 * Generates a standalone sprite-preview.html covering every sprite/texture
 * asset the game loads: party classes, enemies, spell/status effect strips,
 * campaign tilesets (+ door panels), and static dungeon-decor map sprites.
 *
 * Run with:
 *   npm run sprite-preview:generate
 * Then open sprite-preview.html directly in a browser (file:// works — no
 * server needed) or `npm run sprite-preview:serve`.
 *
 * Enemy/party/effect data is imported straight from the real source modules
 * (ENEMY_SPRITE_DEFS, PARTY_SPRITE_DIRS, EFFECT_STRIPS) via Vite's SSR module
 * loader rather than hand-parsed or directory-guessed, so this can never
 * silently drift from what combat actually renders. Plain `tsx` can't import
 * those modules directly — sprite-manifest.ts, party-sprite-cache.ts,
 * effect-sprite-cache.ts, and map-sprites.ts all read
 * `import.meta.env.BASE_URL` at module scope, which only exists inside a
 * Vite context — so we spin up Vite's own dev server in middleware mode and
 * use its ssrLoadModule instead (confirmed: a bare `import()` of
 * sprite-manifest.ts throws "Cannot read properties of undefined (reading
 * 'BASE_URL')"; ssrLoadModule does not).
 */
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { createServer, type ViteDevServer } from "vite";
import { classifyStripMismatch, severityLevel } from "./sprite-preview/classify";
import type { AlphaMode, Card, CardGroup, PreviewSnapshot, Section, StaticCard, StripCard } from "./sprite-preview/types";
import type { EffectStrip } from "../src/engine/effect-sprite-cache";
import type { PartySpriteState } from "../src/engine/party-sprite-cache";

const root = resolve(import.meta.dirname, "..");
const outFile = join(root, "sprite-preview.html");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface PngInfo {
  exists: boolean;
  width: number;
  height: number;
  fileSize: number;
  alphaMode: AlphaMode;
}

function slug(...parts: string[]): string {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getPngDimensions(buffer: Buffer): { width: number; height: number } {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("not a PNG");
  let offset = 8;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) break;
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (type === "IHDR") {
      return {
        width: buffer.readUInt32BE(offset + 8),
        height: buffer.readUInt32BE(offset + 12),
      };
    }
    offset += 8 + length + 4;
  }
  throw new Error("IHDR not found");
}

/**
 * Reads the PNG colour type without decoding the image. This deliberately
 * reports only channel presence (not whether every edge pixel is binary): the
 * latter still needs native-scale inspection and the art cleanup pipeline.
 */
function getPngAlphaMode(buffer: Buffer): AlphaMode {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return "unknown";
  let offset = 8;
  let hasTransparencyChunk = false;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    // IHDR data begins eight bytes into the chunk: width(4), height(4),
    // bitDepth(1), then colourType(1).
    if (type === "IHDR" && offset + 17 < buffer.length) {
      const colorType = buffer[offset + 17];
      if (colorType === 4 || colorType === 6) return "alpha-channel";
    }
    if (type === "tRNS") hasTransparencyChunk = true;
    if (type === "IEND") break;
    offset += 8 + length + 4;
  }
  return hasTransparencyChunk ? "alpha-channel" : "opaque";
}

/** Reads a PNG's dimensions/size off disk. `absPath` must be a real filesystem path. */
async function pngInfo(absPath: string): Promise<PngInfo> {
  try {
    const buf = await readFile(absPath);
    const { width, height } = getPngDimensions(buf);
    const { size } = await stat(absPath);
    return { exists: true, width, height, fileSize: size, alphaMode: getPngAlphaMode(buf) };
  } catch {
    return { exists: false, width: 0, height: 0, fileSize: 0, alphaMode: "unknown" };
  }
}

/**
 * Converts a manifest-declared asset URL (always `${BASE_URL}assets/...`,
 * with BASE_URL forced to "/" for this script's Vite server) into a path
 * relative to the repo root — e.g. "/assets/enemies/orc/idle.png" ->
 * "public/assets/enemies/orc/idle.png" — so <img src> resolves whether the
 * output HTML is opened via file:// or served from the repo root.
 */
function toRepoRelative(urlPath: string): string {
  const clean = urlPath.replace(/^\/+/, "");
  return `public/${clean}`;
}

function stripCard(opts: {
  domId: string;
  label: string;
  src: string;
  frameWidth: number;
  frameHeight: number;
  declaredFrameCount: number;
  fps: number;
  loop: boolean;
  layout: "single-row" | "grid";
  info: PngInfo;
  note?: string;
  displaySize?: number;
  sourceSheet?: boolean;
}): StripCard {
  const { info } = opts;
  const mismatch = classifyStripMismatch({
    exists: info.exists,
    width: info.width,
    height: info.height,
    frameWidth: opts.frameWidth,
    frameHeight: opts.frameHeight,
    declaredFrameCount: opts.declaredFrameCount,
    layout: opts.layout,
  });
  const rows = opts.layout === "single-row" ? 1 : Math.max(1, Math.floor(info.height / opts.frameHeight));
  const cols = info.exists ? Math.max(1, Math.floor(info.width / opts.frameWidth)) : 1;
  const naturalFrameCount = info.exists ? rows * cols : 0;
  const playbackFrameCount = info.exists
    ? Math.max(1, Math.min(opts.declaredFrameCount, naturalFrameCount) || naturalFrameCount || opts.declaredFrameCount)
    : 0;
  return {
    kind: "strip",
    domId: opts.domId,
    label: opts.label,
    src: opts.src,
    frameWidth: opts.frameWidth,
    frameHeight: opts.frameHeight,
    declaredFrameCount: opts.declaredFrameCount,
    naturalFrameCount,
    playbackFrameCount,
    cols,
    fps: opts.fps,
    loop: opts.loop,
    fileSize: info.fileSize,
    width: info.width,
    height: info.height,
    exists: info.exists,
    mismatch,
    alphaMode: info.alphaMode,
    note: opts.note,
    displaySize: opts.displaySize,
    sourceSheet: opts.sourceSheet,
  };
}

function staticCard(opts: {
  domId: string;
  label: string;
  src: string;
  info: PngInfo;
  note?: string;
  displaySize?: number;
}): StaticCard {
  return {
    kind: "static",
    domId: opts.domId,
    label: opts.label,
    src: opts.src,
    width: opts.info.width,
    height: opts.info.height,
    fileSize: opts.info.fileSize,
    exists: opts.info.exists,
    alphaMode: opts.info.alphaMode,
    note: opts.note,
    displaySize: opts.displaySize,
  };
}

// --- Art workbench candidates --------------------------------------------

interface CandidateDef {
  id: string;
  label?: string;
  file: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  fps?: number;
  loop?: boolean;
  layout?: "single-row" | "grid";
  displaySize?: number;
  sourceSheet?: boolean;
  note?: string;
}

interface CandidateManifest {
  assets: CandidateDef[];
}

/**
 * Candidate art is intentionally kept outside public/assets and outside the
 * runtime registries. The preview can still animate it using the same sheet
 * contract, so a generated source plate can be reviewed before cleanup and
 * promotion to a shipping asset.
 */
async function buildCandidateSection(): Promise<Section | null> {
  const manifestFile = join(root, "docs", "art", "candidates", "manifest.json");
  let manifest: CandidateManifest;
  try {
    manifest = JSON.parse(await readFile(manifestFile, "utf-8")) as CandidateManifest;
  } catch {
    return null;
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) return null;

  const cards: Card[] = [];
  for (const candidate of manifest.assets) {
    if (
      !candidate ||
      typeof candidate.id !== "string" ||
      typeof candidate.file !== "string" ||
      !Number.isFinite(candidate.frameWidth) ||
      !Number.isFinite(candidate.frameHeight) ||
      !Number.isFinite(candidate.frameCount)
    ) {
      throw new Error(`Invalid sprite candidate in ${manifestFile}`);
    }
    const info = await pngInfo(join(root, candidate.file));
    const sourceNote = [
      "SOURCE ONLY — not registered in runtime",
      candidate.note,
    ]
      .filter(Boolean)
      .join(" · ");
    cards.push(
      stripCard({
        domId: slug("candidate", candidate.id),
        label: candidate.label ? `${candidate.label} · candidate` : `${candidate.id} · candidate`,
        src: candidate.file,
        frameWidth: candidate.frameWidth,
        frameHeight: candidate.frameHeight,
        declaredFrameCount: Math.max(1, Math.floor(candidate.frameCount)),
        fps: Math.max(0, candidate.fps ?? 8),
        loop: candidate.loop ?? false,
        layout: candidate.layout ?? "grid",
        info,
        note: sourceNote,
        displaySize: candidate.displaySize ?? 320,
        sourceSheet: candidate.sourceSheet ?? true,
      })
    );
  }
  return {
    id: "candidates",
    title: "Workbench — candidate art (review only)",
    hint: "Raw/generated source plates live here before palette cleanup, framing, anchor checks, and promotion to public/assets. Use the controls on each strip to pause, step, or change playback speed.",
    groups: [{ id: "candidate-art", title: "Unapproved source", cards }],
  };
}

// --- Party -------------------------------------------------------------

const ENEMY_STATE_ORDER = ["idle", "attack", "hurt", "death"] as const;

/**
 * Party state order is taken from the runtime metadata; this only fixes the
 * preview's visual grouping order.
 */
const PARTY_STATE_ORDER: PartySpriteState[] = ["idle", "walk", "attack", "attack_ranged", "cast", "hurt", "death"];

async function buildPartySection(server: ViteDevServer): Promise<Section> {
  const mod = await server.ssrLoadModule("/src/engine/party-sprite-cache.ts");
  const dirs: Record<string, string> = mod.PARTY_SPRITE_DIRS;
  const stateConfig: Record<PartySpriteState, { fps: number; loop: boolean }> = mod.PARTY_SPRITE_STATE_CONFIG;

  const groups: CardGroup[] = [];
  for (const [cls, dir] of Object.entries(dirs)) {
    const cards: Card[] = [];
    for (const state of PARTY_STATE_ORDER) {
      const rel = `assets/party/${dir}/${state}.png`;
      const abs = join(root, "public", rel);
      const info = await pngInfo(abs);
      if (!info.exists && state !== "idle") continue; // optional states (cast/attack_ranged) silently absent
      const cfg = stateConfig[state];
      const declaredFrameCount = info.exists ? Math.max(1, Math.floor(info.width / 100)) : 1;
      cards.push(
        stripCard({
          domId: slug("party", cls, state),
          label: state,
          src: `public/${rel}`,
          frameWidth: 100,
          frameHeight: 100,
          declaredFrameCount,
          fps: cfg.fps,
          loop: cfg.loop,
          layout: "single-row",
          info,
          displaySize: 240,
        })
      );
    }
    groups.push({ id: slug("party", cls), title: cls, cards });
  }
  return {
    id: "party",
    title: "Party — combat classes",
    hint: "Every state a class actually loads (cast/attack_ranged only where the class ships one). Drawn at 240×240; strips face right and are mirrored in combat.",
    groups,
  };
}

// --- Enemies -------------------------------------------------------------

async function buildEnemySection(server: ViteDevServer): Promise<Section> {
  const mod = await server.ssrLoadModule("/src/engine/sprite-manifest.ts");
  const defs: Record<string, Record<string, { url: string; frameWidth: number; frameHeight: number; frameCount: number; fps: number; loop: boolean }>> =
    mod.ENEMY_SPRITE_DEFS;

  const groups: CardGroup[] = [];
  for (const id of Object.keys(defs).sort()) {
    const def = defs[id]!;
    const cards: Card[] = [];
    // Detect art reuse: does this id's own directory exist, or does every
    // state point at a different id's folder (boss/elite variants reusing
    // trash-mob art — see sprite-manifest.ts comments on headmasters-echo*).
    let sharedWith: string | null = null;
    for (const state of ENEMY_STATE_ORDER) {
      const strip = def[state];
      if (!strip) continue;
      const rel = toRepoRelative(strip.url);
      const m = rel.match(/^public\/assets\/enemies\/([^/]+)\//);
      const actualDir = m?.[1];
      if (actualDir && actualDir !== id) sharedWith = actualDir;
      const abs = join(root, rel);
      const info = await pngInfo(abs);
      cards.push(
        stripCard({
          domId: slug("enemy", id, state),
          label: state,
          src: rel,
          frameWidth: strip.frameWidth,
          frameHeight: strip.frameHeight,
          declaredFrameCount: strip.frameCount,
          fps: strip.fps,
          loop: strip.loop,
          layout: "single-row",
          info,
          displaySize: 240,
        })
      );
    }
    groups.push({
      id: slug("enemy", id),
      title: id,
      note: sharedWith ? `shares art with: ${sharedWith}` : undefined,
      cards,
    });
  }
  return {
    id: "enemies",
    title: "Enemies",
    hint: "Every entry in ENEMY_SPRITE_DEFS (sprite-manifest.ts), including bosses/elites that intentionally reuse another id's art directory.",
    groups,
  };
}

// --- Effects -------------------------------------------------------------

async function buildEffectsSection(server: ViteDevServer): Promise<Section> {
  const mod = await server.ssrLoadModule("/src/engine/effect-sprite-cache.ts");
  const strips: Record<string, EffectStrip> = mod.EFFECT_STRIPS;

  const cards: Card[] = [];
  for (const [key, strip] of Object.entries(strips)) {
    const rel = `assets/effects/${strip.url}`;
    const abs = join(root, "public", rel);
    const info = await pngInfo(abs);
    cards.push(
      stripCard({
        domId: slug("effect", key),
        label: key,
        src: `public/${rel}`,
        frameWidth: strip.frameWidth,
        frameHeight: strip.frameHeight,
        declaredFrameCount: strip.frameCount,
        fps: strip.fps,
        loop: strip.loop ?? false,
        layout: "grid",
        info,
        note: strip.name !== key ? strip.name : undefined,
        displaySize: 160,
      })
    );
  }
  return {
    id: "effects",
    title: "Effects — spell/status VFX",
    hint: "Every entry in EFFECT_STRIPS (effect-sprite-cache.ts), whether or not a spell currently references it. Multi-row sheets are sampled in full (not just row 0).",
    groups: [{ id: "effects-all", title: "", cards }],
  };
}

// --- Tilesets (walls/floors/ceiling/door) --------------------------------

const BUNDLED_FLOOR_FILES = ["wall", "floor_a", "floor_b", "ceiling", "door"] as const;

async function buildTilesetSection(): Promise<Section> {
  const groups: CardGroup[] = [];

  for (let floor = 1; floor <= 5; floor++) {
    const cards: Card[] = [];
    for (const kind of BUNDLED_FLOOR_FILES) {
      const rel = `src/assets/f${floor}_${kind}_256.png`;
      const abs = join(root, rel);
      const info = await pngInfo(abs);
      cards.push(staticCard({ domId: slug("tileset", `f${floor}`, kind), label: kind, src: rel, info, displaySize: 160 }));
    }
    groups.push({ id: `tileset-f${floor}`, title: `Floor ${floor} (bundled)`, cards });
  }

  // Shared fallback + genuinely unused bundled textures (not wired into
  // BUNDLED_THEME_URLS in renderer.ts — grep confirms no import site).
  const shared: { file: string; note?: string }[] = [
    { file: "door_placeholder_256.png", note: "fallback door panel for themes with no door of their own" },
    { file: "ceiling_tile_256.png", note: "unused — no import site in src/" },
    { file: "floor_tile_a_256.png", note: "unused — no import site in src/" },
    { file: "floor_tile_b_256.png", note: "unused — no import site in src/" },
  ];
  const sharedCards: Card[] = [];
  for (const { file, note } of shared) {
    const rel = `src/assets/${file}`;
    const info = await pngInfo(join(root, rel));
    sharedCards.push(staticCard({ domId: slug("tileset-shared", file), label: file, src: rel, info, note, displaySize: 160 }));
  }
  groups.push({ id: "tileset-shared", title: "Shared / unused", cards: sharedCards });

  // public/assets/tilesets/<theme>/ mirror — only actually rendered for
  // custom (non-f1..f5) tilesetTheme values; f1-f5 always resolve to the
  // bundled src/assets/ imports above (see BUNDLED_THEME_URLS in renderer.ts).
  const publicTilesetsDir = join(root, "public", "assets", "tilesets");
  let publicThemes: string[] = [];
  try {
    publicThemes = (await readdir(publicTilesetsDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    publicThemes = [];
  }
  for (const theme of publicThemes) {
    const cards: Card[] = [];
    for (const kind of ["wall", "floorA", "floorB", "ceiling", "door"]) {
      const rel = `assets/tilesets/${theme}/${kind}.png`;
      const info = await pngInfo(join(publicTilesetsDir, theme, `${kind}.png`));
      cards.push(staticCard({ domId: slug("tileset-public", theme, kind), label: kind, src: `public/${rel}`, info, displaySize: 160 }));
    }
    groups.push({
      id: `tileset-public-${theme}`,
      title: `public/ mirror: ${theme}`,
      note: /^f[1-5]$/.test(theme)
        ? `NOT what the game renders for floor ${theme.slice(1)} — that always uses the bundled src/assets/ import above. This mirror only backs custom (non-f1..f5) tilesetTheme values.`
        : undefined,
      cards,
    });
  }

  return {
    id: "tilesets",
    title: "Tilesets — walls / floors / ceiling / door",
    hint: "Campaign floors 1-5 render bundled Vite imports from src/assets/ (BUNDLED_THEME_URLS in renderer.ts); public/assets/tilesets/<theme>/ is a hand-kept mirror used only for custom themes.",
    groups,
  };
}

// --- Map sprites (static dungeon decor) ----------------------------------

async function buildMapSpriteSection(server: ViteDevServer): Promise<Section> {
  const mod = await server.ssrLoadModule("/src/data/map-sprites.ts");
  const defs: { id: string; name: string; file: string; baseSize: number }[] = mod.MAP_SPRITES;

  const cards: Card[] = [];
  const knownFiles = new Set(defs.map((d) => d.file));
  for (const def of defs) {
    const rel = `assets/map-sprites/${def.file}`;
    const info = await pngInfo(join(root, "public", rel));
    cards.push(
      staticCard({
        domId: slug("mapsprite", def.id),
        label: `${def.name} (baseSize ${def.baseSize})`,
        src: `public/${rel}`,
        info,
        displaySize: Math.min(240, Math.max(96, def.baseSize * 4)),
      })
    );
  }

  const mapSpritesDir = join(root, "public", "assets", "map-sprites");
  let onDisk: string[] = [];
  try {
    onDisk = (await readdir(mapSpritesDir)).filter((f) => f.endsWith(".png"));
  } catch {
    onDisk = [];
  }
  for (const file of onDisk) {
    if (knownFiles.has(file)) continue;
    const rel = `assets/map-sprites/${file}`;
    const info = await pngInfo(join(mapSpritesDir, file));
    cards.push(
      staticCard({
        domId: slug("mapsprite-orphan", basename(file, ".png")),
        label: file,
        src: `public/${rel}`,
        info,
        note: "on disk but not in MAP_SPRITES — not placeable via the floor editor",
        displaySize: 160,
      })
    );
  }

  return {
    id: "map-sprites",
    title: "Map sprites — static dungeon decor",
    hint: "Every entry in MAP_SPRITES (map-sprites.ts), plus any PNG in public/assets/map-sprites/ that isn't registered there.",
    groups: [{ id: "map-sprites-all", title: "", cards }],
  };
}

// --- Assemble + render -----------------------------------------------------

async function collectSnapshot(server: ViteDevServer): Promise<PreviewSnapshot> {
  const [candidates, party, enemies, effects, tilesets, mapSprites] = await Promise.all([
    buildCandidateSection(),
    buildPartySection(server),
    buildEnemySection(server),
    buildEffectsSection(server),
    buildTilesetSection(),
    buildMapSpriteSection(server),
  ]);
  const sections = [candidates, party, enemies, effects, tilesets, mapSprites].filter(
    (section): section is Section => section !== null
  );
  return {
    generatedAt: new Date().toISOString(),
    sections,
  };
}

function countIssues(snapshot: PreviewSnapshot): { critical: number; warn: number } {
  let critical = 0;
  let warn = 0;
  for (const section of snapshot.sections) {
    for (const group of section.groups) {
      for (const card of group.cards) {
        const level = cardLevel(card);
        if (level === "critical") critical++;
        else if (level === "warn") warn++;
      }
    }
  }
  return { critical, warn };
}

function renderHtml(snapshot: PreviewSnapshot): string {
  const { critical, warn } = countIssues(snapshot);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>OnyxLabyrinth · Sprite &amp; Asset Preview</title>
<style>
body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: #0e0d0a; color: #d0c0a0; margin: 0; padding: 1rem; }
h1 { text-align: center; margin-bottom: 0.25rem; }
.hint { text-align: center; color: #a09070; margin-bottom: 0.5rem; }
.summary { text-align: center; color: #a09070; margin-bottom: 1rem; font-size: 0.9rem; }
.summary .critical { color: #f66; }
.summary .warn { color: #e0a458; }
nav.toc { display: flex; justify-content: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 2px solid #3a3025; }
nav.toc a { color: #f0d080; text-decoration: none; }
nav.toc a:hover { text-decoration: underline; }
.section-actions { display: flex; justify-content: center; gap: 0.6rem; flex-wrap: wrap; margin: 0.75rem 0 1.5rem; }
.section-actions button { border: 1px solid #5b4933; background: #241d16; color: #f0d080; border-radius: 3px; padding: 0.4rem 0.7rem; font: inherit; font-size: 0.75rem; cursor: pointer; }
.section-actions button:hover, .section-actions button:focus-visible { background: #3a2d20; outline: 1px solid #f0d080; }
.asset-section { margin-top: 1.25rem; border-top: 2px solid #3a3025; padding-top: 1rem; }
.asset-section > summary { cursor: pointer; list-style: none; display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; color: #f0d080; }
.asset-section > summary::-webkit-details-marker { display: none; }
.asset-section > summary::before { content: "▸"; color: #a09070; margin-right: 0.45rem; }
.asset-section[open] > summary::before { content: "▾"; }
.section-title { font-size: 1.55rem; font-weight: 700; }
.section-count { color: #8a7a5c; font-size: 0.75rem; white-space: nowrap; }
.section-body { padding-top: 0.75rem; }
.section-hint { text-align: center; color: #a09070; margin-bottom: 1.5rem; font-size: 0.85rem; }
.group { margin-bottom: 2rem; border-bottom: 1px solid #3a3025; padding-bottom: 1.5rem; }
.group h2 { margin: 0 0 0.25rem; color: #f0d080; }
.group .group-note { color: #e0a458; font-size: 0.8rem; margin-bottom: 0.75rem; }
.states { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
.state { background: #1a1612; border: 1px solid #3a3025; border-radius: 4px; padding: 0.75rem; text-align: center; min-width: 0; overflow: hidden; }
.state.warn { border-color: #e0a458; }
.state.critical { border-color: #c44; }
canvas, img.static-img { image-rendering: pixelated; background: #000; border-radius: 2px; display: block; margin: 0 auto; max-width: 100%; height: auto; }
details.source-sheet { margin-top: 0.7rem; text-align: left; }
details.source-sheet summary { color: #c6a86a; cursor: pointer; font-size: 0.75rem; }
details.source-sheet img { image-rendering: pixelated; max-width: 100%; height: auto; margin: 0.5rem auto 0; background: #000; }
.meta { margin-top: 0.5rem; font-size: 0.8rem; color: #b0a080; }
.meta strong { color: #f0d080; }
.sprite-controls { display: flex; justify-content: center; align-items: center; gap: 0.35rem; margin-top: 0.55rem; }
.sprite-controls button { border: 1px solid #5b4933; background: #241d16; color: #f0d080; border-radius: 3px; min-width: 2rem; min-height: 1.65rem; font: inherit; font-size: 0.72rem; cursor: pointer; }
.sprite-controls button:hover, .sprite-controls button:focus-visible { background: #3a2d20; outline: 1px solid #f0d080; }
.sprite-controls .frame-readout { min-width: 4.4rem; color: #b0a080; font-size: 0.72rem; }
.err { color: #f66; }
.warnmsg { color: #e0a458; }
.path { color: #8a7a5c; word-break: break-all; }
.alpha { color: #8eb8c6; }
</style>
</head>
<body>
<h1>OnyxLabyrinth Sprite &amp; Asset Preview</h1>
<div class="hint">Party, enemy, effect, tileset, and map-sprite art the game actually loads — pulled live from the same source modules combat/rendering use. Sections stay collapsed and lazy until you open them.</div>
<div class="summary">Generated ${snapshot.generatedAt} · <span class="critical">${critical} critical</span> · <span class="warn">${warn} warning${warn === 1 ? "" : "s"}</span></div>
<nav class="toc">${snapshot.sections.map((s) => `<a href="#${s.id}" data-section-link="${s.id}">${s.title}</a>`).join("")}</nav>
<div class="section-actions">
<button type="button" data-section-action="collapse">Collapse all sections</button>
<button type="button" data-section-action="open-candidates">Open candidate workbench</button>
</div>
${snapshot.sections.map(renderSection).join("")}
<script type="application/json" id="snapshot">${JSON.stringify(snapshot)}</script>
<script>${CLIENT_SCRIPT}</script>
</body>
</html>`;
}

function renderSection(section: Section): string {
  const cardCount = section.groups.reduce((count, group) => count + group.cards.length, 0);
  const open = section.id === "candidates" ? " open" : "";
  return `
<details class="asset-section" id="${section.id}" data-section-id="${section.id}"${open}>
<summary><span class="section-title">${escapeHtml(section.title)}</span><span class="section-count">${cardCount} card${cardCount === 1 ? "" : "s"} · open to load</span></summary>
<div class="section-body">
${section.hint ? `<div class="section-hint">${escapeHtml(section.hint)}</div>` : ""}
${section.groups.map(renderGroup).join("")}
</div>
</details>`;
}

function renderGroup(group: CardGroup): string {
  return `
<div class="group">
${group.title ? `<h2>${escapeHtml(group.title)}</h2>` : ""}
${group.note ? `<div class="group-note">${escapeHtml(group.note)}</div>` : ""}
<div class="states">
${group.cards.map(renderCard).join("")}
</div>
</div>`;
}

function cardLevel(card: Card): "ok" | "warn" | "critical" {
  if (card.kind === "static") return card.exists ? "ok" : "critical";
  return severityLevel(card.mismatch.severity);
}

function renderCard(card: Card): string {
  const level = cardLevel(card);
  const size = card.displaySize ?? (card.kind === "strip" ? 240 : 160);
  const dims = card.exists ? `${card.width}x${card.height}` : "missing";
  const extra =
    card.kind === "strip"
      ? `${card.playbackFrameCount} frame${card.playbackFrameCount === 1 ? "" : "s"} · ${card.fps}fps${card.loop ? " · loops" : ""}`
      : "";
  const alpha = card.alphaMode
    ? `<span class="alpha">${card.alphaMode === "alpha-channel" ? "alpha channel" : card.alphaMode}</span>`
    : "";
  const controls =
    card.kind === "strip" && card.exists && card.playbackFrameCount > 0
      ? `<div class="sprite-controls" aria-label="Animation controls for ${escapeHtml(card.label)}">
<button type="button" data-control="prev" title="Previous frame">◀</button>
<button type="button" data-control="toggle" title="Pause or play">Pause</button>
<button type="button" data-control="next" title="Next frame">▶</button>
<button type="button" data-control="speed" title="Change playback speed">1×</button>
<span class="frame-readout" data-frame-readout>1 / ${card.playbackFrameCount}</span>
</div>`
      : "";
  const sourceSheet =
    card.kind === "strip" && card.sourceSheet && card.exists
      ? `<details class="source-sheet"><summary>Show full source sheet</summary><img src="${escapeHtml(card.src)}" alt="Full source sheet for ${escapeHtml(card.label)}"></details>`
      : "";
  const msg =
    card.kind === "strip" && card.mismatch.message
      ? `<br><em class="${level === "critical" ? "err" : "warnmsg"}">${escapeHtml(card.mismatch.message)}</em>`
      : !card.exists
        ? `<br><em class="err">file not found at ${escapeHtml(card.src)}</em>`
        : "";
  const note = card.note ? `<br><em class="warnmsg">${escapeHtml(card.note)}</em>` : "";
  return `
<div class="state ${level === "ok" ? "" : level}" data-card="${card.domId}">
<canvas id="cv-${card.domId}" width="${size}" height="${size}"></canvas>
${controls}
${sourceSheet}
<div class="meta">
<strong>${escapeHtml(card.label)}</strong><br>
${dims}${extra ? " · " + extra : ""}${alpha ? " · " + alpha : ""} · ${card.fileSize} bytes<br>
<span class="path">${escapeHtml(card.src)}</span>
${msg}${note}
</div>
</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/**
 * Single generic client-side animator, driven entirely by the embedded JSON
 * snapshot. Replaces the old script's two separate hand-rolled loops
 * (enemy/party vs. effects) since every strip card now carries the same
 * frameWidth/frameHeight/cols/fps/loop shape.
 */
const CLIENT_SCRIPT = `
(function () {
  const snapshot = JSON.parse(document.getElementById('snapshot').textContent);
  const anims = [];
  const initializedSections = new Set();

  function drawContain(ctx, img, cw, ch, sw, sh) {
    const scale = Math.min(cw / sw, ch / sh);
    const dw = sw * scale, dh = sh * scale;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, sw, sh, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  }

  function setPlaybackButton(a) {
    if (a.toggleButton) a.toggleButton.textContent = a.playing ? 'Pause' : 'Play';
  }

  function initializeSection(section) {
    if (initializedSections.has(section.id)) {
      for (const a of anims) {
        if (a.sectionId !== section.id) continue;
        a.playing = true;
        a.last = performance.now();
        setPlaybackButton(a);
      }
      return;
    }
    initializedSections.add(section.id);
    for (const group of section.groups) {
      for (const card of group.cards) {
        const canvas = document.getElementById('cv-' + card.domId);
        if (!canvas) continue;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        if (card.kind === 'static') {
          if (!card.exists) continue;
          const img = new Image();
          img.onload = () => drawContain(ctx, img, canvas.width, canvas.height, img.naturalWidth, img.naturalHeight);
          img.src = card.src;
          continue;
        }
        if (!card.exists || card.playbackFrameCount < 1) continue;
        const img = new Image();
        const a = {
          sectionId: section.id,
          ctx, img, canvas, card, frame: 0, last: 0, playing: true, speed: 1,
          readout: canvas.parentElement && canvas.parentElement.querySelector('[data-frame-readout]'),
          toggleButton: canvas.parentElement && canvas.parentElement.querySelector('[data-control="toggle"]'),
          speedButton: canvas.parentElement && canvas.parentElement.querySelector('[data-control="speed"]')
        };
        img.onload = () => {
          a.last = performance.now();
          drawFrame(a);
        };
        img.src = card.src;
        anims.push(a);
        wireControls(a);
      }
    }
  }

  function pauseSection(sectionId) {
    for (const a of anims) {
      if (a.sectionId !== sectionId) continue;
      a.playing = false;
      setPlaybackButton(a);
    }
  }

  function setReadout(a) {
    if (a.readout) a.readout.textContent = String(a.frame + 1) + ' / ' + a.card.playbackFrameCount;
  }

  function drawFrame(a) {
    if (!a.img.complete || !a.img.naturalWidth) return;
    const col = a.frame % a.card.cols;
    const row = Math.floor(a.frame / a.card.cols);
    const cw = a.canvas.width, ch = a.canvas.height;
    const scale = Math.min(cw / a.card.frameWidth, ch / a.card.frameHeight, 8);
    const dw = a.card.frameWidth * scale, dh = a.card.frameHeight * scale;
    a.ctx.clearRect(0, 0, cw, ch);
    a.ctx.drawImage(
      a.img,
      col * a.card.frameWidth, row * a.card.frameHeight, a.card.frameWidth, a.card.frameHeight,
      (cw - dw) / 2, (ch - dh) / 2, dw, dh
    );
    setReadout(a);
  }

  function wireControls(a) {
    const root = a.canvas.parentElement;
    if (!root) return;
    root.querySelectorAll('[data-control]').forEach(function (button) {
      button.addEventListener('click', function () {
        const action = button.getAttribute('data-control');
        if (action === 'prev' || action === 'next') {
          const direction = action === 'next' ? 1 : -1;
          a.frame = (a.frame + direction + a.card.playbackFrameCount) % a.card.playbackFrameCount;
          a.last = performance.now();
          drawFrame(a);
          return;
        }
        if (action === 'toggle') {
          if (!a.playing && !a.card.loop && a.frame >= a.card.playbackFrameCount - 1) a.frame = 0;
          a.playing = !a.playing;
          a.last = performance.now();
          if (a.toggleButton) a.toggleButton.textContent = a.playing ? 'Pause' : 'Play';
          drawFrame(a);
          return;
        }
        if (action === 'speed') {
          const speeds = [0.5, 1, 2, 4];
          const index = speeds.indexOf(a.speed);
          a.speed = speeds[(index + 1) % speeds.length];
          if (a.speedButton) a.speedButton.textContent = String(a.speed) + '×';
          a.last = performance.now();
        }
      });
    });
  }

  function loop(now) {
    for (const a of anims) {
      if (!a.img.complete || !a.img.naturalWidth) continue;
      const fps = a.card.fps > 0 ? a.card.fps : 0;
      if (a.playing && fps > 0) {
        const interval = 1000 / (fps * a.speed);
        const elapsed = now - a.last;
        if (elapsed >= interval) {
          const advance = Math.max(1, Math.floor(elapsed / interval));
          const nextFrame = a.frame + advance;
          if (a.card.loop) {
            a.frame = nextFrame % a.card.playbackFrameCount;
          } else {
            a.frame = Math.min(nextFrame, a.card.playbackFrameCount - 1);
            if (a.frame >= a.card.playbackFrameCount - 1) {
              a.playing = false;
              if (a.toggleButton) a.toggleButton.textContent = 'Play';
            }
          }
          a.last = now;
        }
      }
      drawFrame(a);
    }
    requestAnimationFrame(loop);
  }

  for (const section of snapshot.sections) {
    const sectionNode = document.getElementById(section.id);
    if (!sectionNode) continue;
    sectionNode.addEventListener('toggle', function () {
      if (sectionNode.open) initializeSection(section);
      else pauseSection(section.id);
    });
    if (sectionNode.open) initializeSection(section);
  }

  document.querySelectorAll('[data-section-link]').forEach(function (link) {
    link.addEventListener('click', function () {
      const sectionNode = document.getElementById(link.getAttribute('data-section-link'));
      if (sectionNode) sectionNode.open = true;
    });
  });

  const collapseButton = document.querySelector('[data-section-action="collapse"]');
  if (collapseButton) {
    collapseButton.addEventListener('click', function () {
      document.querySelectorAll('.asset-section').forEach(function (sectionNode) {
        sectionNode.open = false;
      });
    });
  }

  const candidateButton = document.querySelector('[data-section-action="open-candidates"]');
  if (candidateButton) {
    candidateButton.addEventListener('click', function () {
      const sectionNode = document.getElementById('candidates');
      if (!sectionNode) return;
      sectionNode.open = true;
      sectionNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  requestAnimationFrame(loop);
})();
`;

// --- Entry point -----------------------------------------------------------

async function main() {
  const server = await createServer({
    configFile: false,
    root,
    base: "/",
    server: { middlewareMode: true, watch: null },
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
  });
  try {
    const snapshot = await collectSnapshot(server);
    await writeFile(outFile, renderHtml(snapshot), "utf-8");
    const { critical, warn } = countIssues(snapshot);
    const totalCards = snapshot.sections.reduce(
      (n, s) => n + s.groups.reduce((m, g) => m + g.cards.length, 0),
      0
    );
    console.log(
      `Wrote ${outFile} — ${snapshot.sections.length} sections, ${totalCards} cards (${critical} critical, ${warn} warning${warn === 1 ? "" : "s"}).`
    );
  } finally {
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
