/**
 * Deterministic wall-family selection.
 *
 * The selector is deliberately independent of traversal order, frame time,
 * and renderer backend. A physical wall edge is normalized before hashing so
 * both cells that border an edge agree on the same tile. The query-string
 * override is QA-only and exists so the art harness can force one named tile
 * through both renderers.
 */

export type WallVariantSuffix = "" | "_b" | "_c" | "_d" | "_e" | "_f" | "_g" | "_h" | "_i" | "_j";
export type WallFaceDirection = "n" | "e" | "s" | "w";

export const WALL_VARIANT_SUFFIXES: readonly WallVariantSuffix[] = [
  "",
  "_b",
  "_c",
  "_d",
  "_e",
  "_f",
  "_g",
  "_h",
  "_i",
  "_j",
];

type FloorWeights = Record<WallVariantSuffix, number>;

const WEIGHTS: Record<number, FloorWeights> = {
  1: { "": 1, _b: 1, _c: 1, _d: 1, _e: 0.95, _f: 0.9, _g: 0.35, _h: 0.3, _i: 0.25, _j: 0.06 },
  2: { "": 0.85, _b: 1, _c: 1, _d: 1, _e: 0.95, _f: 0.9, _g: 0.35, _h: 0.3, _i: 0.25, _j: 0.05 },
  3: { "": 0.85, _b: 1, _c: 1, _d: 1, _e: 0.95, _f: 0.9, _g: 0.35, _h: 0.3, _i: 0.25, _j: 0.05 },
  4: { "": 0.75, _b: 1, _c: 1, _d: 1, _e: 0.95, _f: 0.9, _g: 0.35, _h: 0.25, _i: 0.2, _j: 0.03 },
  5: { "": 0.85, _b: 1, _c: 1, _d: 1, _e: 0.95, _f: 0.9, _g: 0.35, _h: 0.3, _i: 0.25, _j: 0.05 },
};

const HERO_CHANCE: Record<number, number> = {
  1: 0.035,
  2: 0.03,
  3: 0.035,
  4: 0.018,
  5: 0.03,
};

const CHARACTER_CHANCE: Record<number, number> = {
  1: 0.18,
  2: 0.17,
  3: 0.17,
  4: 0.15,
  5: 0.17,
};

const REQUESTED_PREVIEW = (() => {
  if (typeof window === "undefined") return null;
  const requested = new URLSearchParams(window.location.search).get("wallPreview")?.trim();
  if (!requested) return null;
  const filename = requested.endsWith(".png") ? requested : `${requested}.png`;
  return /^(f[1-5])_wall(_[b-j])?_256\.png$/.exec(filename);
})();

function isVariantTheme(theme: string): theme is `f${1 | 2 | 3 | 4 | 5}` {
  return /^f[1-5]$/.test(theme);
}

function floorNumber(theme: string, floorId: number): number {
  if (isVariantTheme(theme)) return Number(theme.slice(1));
  return floorId;
}

/** Return a repeatable [0, 1) value from a small string tuple. */
function hashUnit(...parts: (string | number)[]): number {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    const text = String(part);
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= 0xff;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x100000000;
}

/**
 * Canonical edge key. `n` and the neighboring cell's `s` (and likewise e/w)
 * resolve to the same key, preventing seams or disagreement at shared walls.
 */
export function wallEdgeKey(
  x: number,
  y: number,
  dir: WallFaceDirection
): string {
  if (dir === "n") return `h:${x}:${y}`;
  if (dir === "s") return `h:${x}:${y + 1}`;
  if (dir === "w") return `v:${x}:${y}`;
  return `v:${x + 1}:${y}`;
}

function weightedSuffix(
  floor: number,
  category: "quiet" | "character" | "hero",
  edgeKey: string
): WallVariantSuffix {
  const weights = WEIGHTS[floor] ?? WEIGHTS[1];
  const suffixes = category === "quiet"
    ? WALL_VARIANT_SUFFIXES.slice(0, 6)
    : category === "character"
      ? WALL_VARIANT_SUFFIXES.slice(6, 9)
      : WALL_VARIANT_SUFFIXES.slice(9);
  const total = suffixes.reduce((sum, suffix) => sum + weights[suffix], 0);
  let cursor = hashUnit("variant", floor, edgeKey) * total;
  for (const suffix of suffixes) {
    cursor -= weights[suffix];
    if (cursor < 0) return suffix;
  }
  return suffixes.at(-1) ?? "";
}

function isHeroCandidate(floor: number, theme: string, edgeKey: string): boolean {
  return hashUnit("category", floor, theme, edgeKey) < (HERO_CHANCE[floor] ?? HERO_CHANCE[1]);
}

function adjacentEdgeKeys(
  x: number,
  y: number,
  dir: WallFaceDirection
): string[] {
  if (dir === "n" || dir === "s") {
    return [wallEdgeKey(x - 1, y, dir), wallEdgeKey(x + 1, y, dir)];
  }
  return [wallEdgeKey(x, y - 1, dir), wallEdgeKey(x, y + 1, dir)];
}

/** Return the QA-only forced suffix for a theme, or null during normal play. */
export function wallPreviewVariantForTheme(theme: string): WallVariantSuffix | null {
  if (!REQUESTED_PREVIEW || REQUESTED_PREVIEW[1] !== theme) return null;
  return (REQUESTED_PREVIEW[2] as WallVariantSuffix | undefined) ?? "";
}

/**
 * Select a wall sibling for one physical edge.
 *
 * Non-campaign/regional themes retain their authored canonical wall. Hero
 * candidates are downgraded to character when a same-plane neighboring edge
 * is also a hero candidate, preventing normal corridors from growing a run of
 * story tiles. The result is stable for the lifetime of a save and replay.
 */
export function wallVariantForEdge(
  floorId: number,
  theme: string,
  x: number,
  y: number,
  dir: WallFaceDirection
): WallVariantSuffix {
  const preview = wallPreviewVariantForTheme(theme);
  if (preview) return preview;
  if (!isVariantTheme(theme)) return "";

  const floor = floorNumber(theme, floorId);
  const edgeKey = wallEdgeKey(x, y, dir);
  const heroChance = HERO_CHANCE[floor] ?? HERO_CHANCE[1];
  const characterChance = CHARACTER_CHANCE[floor] ?? CHARACTER_CHANCE[1];
  const categoryRoll = hashUnit("category", floor, theme, edgeKey);

  if (categoryRoll < heroChance && !adjacentEdgeKeys(x, y, dir).some((neighbor) => isHeroCandidate(floor, theme, neighbor))) {
    return weightedSuffix(floor, "hero", edgeKey);
  }
  if (categoryRoll < heroChance + characterChance) {
    return weightedSuffix(floor, "character", edgeKey);
  }
  return weightedSuffix(floor, "quiet", edgeKey);
}

export function wallVariantFilename(
  theme: `f${1 | 2 | 3 | 4 | 5}`,
  suffix: WallVariantSuffix
): string {
  return `${theme}_wall${suffix}_256`;
}
