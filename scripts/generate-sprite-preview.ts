#!/usr/bin/env npx tsx
/**
 * Generates a standalone sprite-preview.html covering the game's visual asset
 * families: runtime sprite manifests, complete on-disk enemy/effect folders,
 * campaign tilesets, wall/ceiling/door features, architectural props,
 * environmental set pieces, portraits, symbols, map sprites, and source PNGs.
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
import type { Card, CardGroup, PreviewSnapshot, Section, StaticCard, StripCard } from "./sprite-preview/types";
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

/** Reads a PNG's dimensions/size off disk. `absPath` must be a real filesystem path. */
async function pngInfo(absPath: string): Promise<PngInfo> {
  try {
    const buf = await readFile(absPath);
    const { width, height } = getPngDimensions(buf);
    const { size } = await stat(absPath);
    return { exists: true, width, height, fileSize: size };
  } catch {
    return { exists: false, width: 0, height: 0, fileSize: 0 };
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
    note: opts.note,
    displaySize: opts.displaySize,
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
    note: opts.note,
    displaySize: opts.displaySize,
  };
}

async function pngFilesUnder(absDir: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) await visit(abs);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) files.push(abs);
    }
  }
  await visit(absDir);
  return files.sort();
}

/** Build a visual contact sheet for a public asset directory that is not a
 * frame-strip manifest (wall decals, ceilings, portraits, etc.). Grouping by
 * subdirectory keeps large families browsable without hand-maintained lists. */
async function buildDirectorySection(opts: {
  id: string;
  title: string;
  directory: string;
  hint: string;
  note?: string;
  displaySize?: number;
}): Promise<Section> {
  const absDir = join(root, opts.directory);
  const files = await pngFilesUnder(absDir);
  const groups = new Map<string, Card[]>();
  for (const abs of files) {
    const relative = abs.slice(absDir.length + 1).replaceAll("\\", "/");
    const groupName = relative.includes("/") ? relative.slice(0, relative.lastIndexOf("/")) : "";
    const file = basename(relative);
    const rel = `${opts.directory}/${relative}`;
    const info = await pngInfo(abs);
    const cards = groups.get(groupName) ?? [];
    cards.push(
      staticCard({
        domId: slug(opts.id, relative),
        label: file,
        src: rel,
        info,
        note: opts.note,
        displaySize: opts.displaySize ?? 160,
      })
    );
    groups.set(groupName, cards);
  }
  const cardGroups: CardGroup[] = [...groups.entries()].map(([name, cards]) => ({
    id: slug(opts.id, name || "all"),
    title: name || "",
    cards,
  }));
  if (!cardGroups.length) {
    cardGroups.push({ id: slug(opts.id, "empty"), title: "", cards: [] });
  }
  return { id: opts.id, title: opts.title, hint: opts.hint, groups: cardGroups };
}

async function buildSourcePngSection(): Promise<Section> {
  return buildDirectorySection({
    id: "source-pngs",
    title: "Source PNGs — bundled and fallback art",
    directory: "src/assets",
    hint: "Every PNG under src/assets, including title/combat art and the bundled tiles already shown above. This section is intentionally source-oriented so no visual file is hidden from the audit.",
    note: "source PNG — compare against the runtime-facing section when applicable",
    displaySize: 180,
  });
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
    { file: "wall_tile_amber_256.png", note: "unused — no import site in src/" },
    { file: "wall_tile_vine_256.png", note: "unused — no import site in src/" },
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
  const [
    party,
    enemies,
    effects,
    tilesets,
    mapSprites,
    sourcePngs,
    wallFeatures,
    ceilingFeatures,
    ceilingSprites,
    doorFeatures,
    architecture,
    environmental,
    portraits,
    symbols,
    enemyFiles,
    effectFiles,
  ] = await Promise.all([
    buildPartySection(server),
    buildEnemySection(server),
    buildEffectsSection(server),
    buildTilesetSection(),
    buildMapSpriteSection(server),
    buildSourcePngSection(),
    buildDirectorySection({
      id: "wall-features",
      title: "Wall features — embedded decals",
      directory: "public/assets/wall-features",
      hint: "All PNGs under public/assets/wall-features, including animated sconce frame folders. These are painted onto wall faces rather than used as base wall tiles.",
      displaySize: 180,
    }),
    buildDirectorySection({
      id: "ceiling-features",
      title: "Ceiling features — plane replacements",
      directory: "public/assets/ceiling-features",
      hint: "All ceiling-plane feature PNGs. Each replaces one cell's sampled ceiling texture.",
      displaySize: 180,
    }),
    buildDirectorySection({
      id: "ceiling-sprites",
      title: "Ceiling sprites — hanging set pieces",
      directory: "public/assets/ceiling-sprites",
      hint: "All hanging ceiling billboard PNGs, including assets registered for reserved or special-room content.",
      displaySize: 180,
    }),
    buildDirectorySection({
      id: "door-features",
      title: "Door features — hero thresholds",
      directory: "public/assets/door-features",
      hint: "Full-face landmark door panels and gates.",
      displaySize: 220,
    }),
    buildDirectorySection({
      id: "architecture",
      title: "Architectural props",
      directory: "public/assets/architectural-props",
      hint: "Large structural corridor props such as the Kept Gate and basalt supports.",
      displaySize: 220,
    }),
    buildDirectorySection({
      id: "environmental",
      title: "Environmental set pieces",
      directory: "public/assets/environmental-sprites",
      hint: "Large animated world-space set pieces such as the Floor 2 abyss face.",
      displaySize: 240,
    }),
    buildDirectorySection({
      id: "portraits",
      title: "NPC portraits",
      directory: "public/assets/portraits",
      hint: "Portrait files used by cinematic NPC dialogue. Missing portrait IDs use the documented silhouette fallback and therefore appear in the runtime audit, not here.",
      displaySize: 220,
    }),
    buildDirectorySection({
      id: "symbols",
      title: "Symbols and marks",
      directory: "public/assets/symbols",
      hint: "Reusable authored marks and relief symbols.",
      displaySize: 180,
    }),
    buildDirectorySection({
      id: "enemy-files",
      title: "Enemy files — complete on-disk audit",
      directory: "public/assets/enemies",
      hint: "Every PNG under public/assets/enemies, including strips not currently referenced by ENEMY_SPRITE_DEFS. Use this section to spot unused, duplicate, or inconsistent pack art.",
      note: "raw on-disk file; runtime mapping is shown in the Enemies section",
      displaySize: 180,
    }),
    buildDirectorySection({
      id: "effect-files",
      title: "Effect files — complete on-disk audit",
      directory: "public/assets/effects",
      hint: "Every PNG under public/assets/effects, including files not currently referenced by EFFECT_STRIPS.",
      note: "raw on-disk file; runtime mapping is shown in the Effects section",
      displaySize: 160,
    }),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    sections: [
      party,
      enemies,
      effects,
      tilesets,
      mapSprites,
      wallFeatures,
      ceilingFeatures,
      ceilingSprites,
      doorFeatures,
      architecture,
      environmental,
      portraits,
      symbols,
      sourcePngs,
      enemyFiles,
      effectFiles,
    ],
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
.controls { position: sticky; top: 0; z-index: 5; display: flex; justify-content: center; gap: 0.75rem; flex-wrap: wrap; padding: 0.75rem; margin: 0 -1rem 1rem; background: rgba(14,13,10,0.96); border-bottom: 1px solid #3a3025; }
.controls input[type="search"] { width: min(34rem, 90vw); padding: 0.55rem 0.7rem; color: #f0e0c0; background: #1a1612; border: 1px solid #5a4630; border-radius: 3px; font: inherit; }
.controls label { color: #d0c0a0; padding: 0.5rem 0; }
.state.hidden, .group.hidden, h1.section.hidden, .section-hint.hidden { display: none; }
h1.section { margin-top: 2.5rem; color: #f0d080; border-top: 2px solid #3a3025; padding-top: 1.5rem; }
.section-hint { text-align: center; color: #a09070; margin-bottom: 1.5rem; font-size: 0.85rem; }
.group { margin-bottom: 2rem; border-bottom: 1px solid #3a3025; padding-bottom: 1.5rem; }
.group h2 { margin: 0 0 0.25rem; color: #f0d080; }
.group .group-note { color: #e0a458; font-size: 0.8rem; margin-bottom: 0.75rem; }
.states { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
.state { background: #1a1612; border: 1px solid #3a3025; border-radius: 4px; padding: 0.75rem; text-align: center; }
.state.warn { border-color: #e0a458; }
.state.critical { border-color: #c44; }
canvas, img.static-img { image-rendering: pixelated; background: #000; border-radius: 2px; display: block; margin: 0 auto; }
.meta { margin-top: 0.5rem; font-size: 0.8rem; color: #b0a080; }
.meta strong { color: #f0d080; }
.err { color: #f66; }
.warnmsg { color: #e0a458; }
.path { color: #8a7a5c; word-break: break-all; }
</style>
</head>
<body>
<h1>OnyxLabyrinth Sprite &amp; Asset Preview</h1>
<div class="hint">Shipping and runtime-facing visual assets, pulled from the same source modules and asset directories the game uses. Candidate/rejected art outside public/assets is intentionally excluded.</div>
<div class="summary">Generated ${snapshot.generatedAt} · <span class="critical">${critical} critical</span> · <span class="warn">${warn} warning${warn === 1 ? "" : "s"}</span></div>
<div class="controls"><input id="asset-search" type="search" placeholder="Filter by name, path, or note…" autocomplete="off"><label><input id="issues-only" type="checkbox"> issues only</label></div>
<nav class="toc">${snapshot.sections.map((s) => `<a href="#${s.id}">${s.title}</a>`).join("")}</nav>
${snapshot.sections.map(renderSection).join("")}
<script type="application/json" id="snapshot">${JSON.stringify(snapshot)}</script>
<script>${CLIENT_SCRIPT}</script>
</body>
</html>`;
}

function renderSection(section: Section): string {
  return `
<h1 class="section" id="${section.id}">${section.title}</h1>
${section.hint ? `<div class="section-hint">${escapeHtml(section.hint)}</div>` : ""}
${section.groups.map(renderGroup).join("")}`;
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
  const msg =
    card.kind === "strip" && card.mismatch.message
      ? `<br><em class="${level === "critical" ? "err" : "warnmsg"}">${escapeHtml(card.mismatch.message)}</em>`
      : !card.exists
        ? `<br><em class="err">file not found at ${escapeHtml(card.src)}</em>`
        : "";
  const note = card.note ? `<br><em class="warnmsg">${escapeHtml(card.note)}</em>` : "";
  return `
<div class="state ${level === "ok" ? "" : level}" data-card="${card.domId}" data-level="${level}" data-search="${escapeHtml(`${card.label} ${card.src} ${card.note ?? ""}`.toLowerCase())}">
<canvas id="cv-${card.domId}" width="${size}" height="${size}"></canvas>
<div class="meta">
<strong>${escapeHtml(card.label)}</strong><br>
${dims}${extra ? " · " + extra : ""} · ${card.fileSize} bytes<br>
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
  for (const section of snapshot.sections) {
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
        img.src = card.src;
        anims.push({ ctx, img, canvas, card, frame: 0, last: 0 });
      }
    }
  }

  function drawContain(ctx, img, cw, ch, sw, sh) {
    const scale = Math.min(cw / sw, ch / sh);
    const dw = sw * scale, dh = sh * scale;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, sw, sh, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  }

  function loop(now) {
    for (const a of anims) {
      if (!a.img.complete || !a.img.naturalWidth) continue;
      const fps = a.card.fps > 0 ? a.card.fps : 0;
      if (fps > 0) {
        const interval = 1000 / fps;
        const elapsed = now - a.last;
        if (elapsed >= interval) {
          const advance = Math.max(1, Math.floor(elapsed / interval));
          a.frame = (a.frame + advance) % a.card.playbackFrameCount;
          a.last = now;
        }
      }
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
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  const search = document.getElementById('asset-search');
  const issuesOnly = document.getElementById('issues-only');
  function applyFilter() {
    const query = (search?.value ?? '').toLowerCase().trim();
    const issues = !!issuesOnly?.checked;
    document.querySelectorAll('.state[data-card]').forEach((node) => {
      const card = node;
      const matchesText = !query || (card.dataset.search || '').includes(query);
      const matchesIssue = !issues || card.dataset.level === 'warn' || card.dataset.level === 'critical';
      card.classList.toggle('hidden', !matchesText || !matchesIssue);
    });
  }
  search?.addEventListener('input', applyFilter);
  issuesOnly?.addEventListener('change', applyFilter);
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
