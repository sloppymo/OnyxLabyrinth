/**
 * Corridor renderer for OnyxLabyrinth.
 *
 * This module draws the first-person dungeon view using a 2D canvas raycaster.
 * One ray is cast per screen column to find the nearest wall, and floor/ceiling
 * are filled with perspective-correct casting. Open grid edges are treated as
 * empty space, so side-passage back walls render automatically.
 *
 * Wall strips are sampled from a repeated source canvas and drawn with
 * `drawImage`. Floor and ceiling are assembled row-by-row via `ImageData` and
 * `putImageData`, then walls are rendered on top so they occlude the distant
 * floor/ceiling correctly. A floor has a primary tileset plus optional
 * rectangular regional overrides; all sets are prepared by loadTextures()
 * and cached in `tilesetCache` keyed by theme name. Themes live under
 * `public/assets/tilesets/<theme>/`.
 */

import type { GameState, Grid } from "../types";
import type { EdgeType, TileFeature } from "../types";
import { edgeInDirection } from "../game/dungeon";
import { warnAsset } from "./asset-warn";
import f1WallUrl from "../assets/f1_wall_256.png";
import f1FloorAUrl from "../assets/f1_floor_a_256.png";
import f1FloorBUrl from "../assets/f1_floor_b_256.png";
import f1CeilingUrl from "../assets/f1_ceiling_256.png";
import f2WallUrl from "../assets/f2_wall_256.png";
import f2FloorAUrl from "../assets/f2_floor_a_256.png";
import f2FloorBUrl from "../assets/f2_floor_b_256.png";
import f2CeilingUrl from "../assets/f2_ceiling_256.png";
import f3WallUrl from "../assets/f3_wall_256.png";
import f3FloorAUrl from "../assets/f3_floor_a_256.png";
import f3FloorBUrl from "../assets/f3_floor_b_256.png";
import f3CeilingUrl from "../assets/f3_ceiling_256.png";
import f4WallUrl from "../assets/f4_wall_256.png";
import f4FloorAUrl from "../assets/f4_floor_a_256.png";
import f4FloorBUrl from "../assets/f4_floor_b_256.png";
import f4CeilingUrl from "../assets/f4_ceiling_256.png";
import f5WallUrl from "../assets/f5_wall_256.png";
import f5FloorAUrl from "../assets/f5_floor_a_256.png";
import f5FloorBUrl from "../assets/f5_floor_b_256.png";
import f5CeilingUrl from "../assets/f5_ceiling_256.png";
import f1DoorUrl from "../assets/f1_door_256.png";
import f2DoorUrl from "../assets/f2_door_256.png";
import f3DoorUrl from "../assets/f3_door_256.png";
import f4DoorUrl from "../assets/f4_door_256.png";
import f5DoorUrl from "../assets/f5_door_256.png";
import doorPlaceholderUrl from "../assets/door_placeholder_256.png";
import {
  computeLineHeight,
  opacityForDepth,
  glowBlurForDepth,
  glowBucketForDepth,
  strokeColorForDepth,
  RenderCameraAnimator,
  MATH_CONFIG,
  isStairExitFeature,
  raycastEdgeStop,
  projectBillboard,
  billboardScreenX,
  featureMarkerSize,
  propBillboardSize,
  isCorridorMarkerFeature,
  BILLBOARD_MIN_DEPTH,
  dirFromFacing,
  planeFromDir,
  wallFeatureCellForHit,
  stableWallX,
  wallFeatureLocalU,
  wallFeatureVerticalRect,
  ceilingAnchorY,
  isBillboardOccluded,
} from "./render-math";
import type { RenderCamera } from "./render-math";
import {
  resolveTilesetTheme,
  themeAt,
  themeForWallHit,
  tilesetThemesForFloor,
} from "../game/floor-map";
import {
  getMapSpriteAlphaBounds,
  getMapSpriteDef,
  getMapSpriteImage,
  type MapSpriteImage,
} from "./map-sprite-cache";
import type { MapSpriteDef } from "../data/map-sprites";
import { getWallFeatureDef, getWallFeatureImage } from "./wall-feature-cache";
import {
  getCeilingSpriteDef,
  getCeilingSpriteImage,
} from "./ceiling-sprite-cache";
import { CEILING_FEATURES, ceilingFeatureUrl } from "../data/ceiling-features";
import { getDoorFeatureImage } from "./door-feature-cache";
import { featurePropSpriteIds } from "../data/maze-props";
import { npcAt } from "../game/npc";
import { isTreasureLooted } from "../game/features";
import { renderArenaRoom } from "./arena-renderer";
import { waterGridFromFloor } from "./water-floor";

// --- Palette (Section 12.1 of the design doc: distance-based color shift) ---
export const PALETTE = {
  bg: "#0e0d0a",
  amber: "#e0a458",
  warmWhite: "#f5f0e6",
  wallFill: { r: 61, g: 50, b: 40 },
  floorFill: { r: 42, g: 34, b: 26 },
  ceilingFill: { r: 31, g: 27, b: 22 },
  doorMarker: "#e0a458",
  lockedMarker: "#c44",
  doorFill: { r: 45, g: 35, b: 28 },
  feature: "#e0a458",
  featureDark: "#8a6a38",
};

// Precomputed PALETTE.bg RGB values for fog blending. Distant surfaces fade
// toward this warm dark amber instead of pure black, giving the depth fog an
// atmospheric tint that matches the background.
const BG_R = parseInt(PALETTE.bg.slice(1, 3), 16);
const BG_G = parseInt(PALETTE.bg.slice(3, 5), 16);
const BG_B = parseInt(PALETTE.bg.slice(5, 7), 16);

// Centralized renderer tuning. Keep magic numbers here so art passes and
// debugging don't require hunting through the draw loop.
//
// Pure geometry/fog/camera tunables are spread in from `MATH_CONFIG`
// (render-math.ts) rather than declared here, because that is the copy the
// math functions actually read. `RENDER_CONFIG.fogFalloff` still resolves —
// it just has one definition now. Declaring any MATH_CONFIG key again below
// would shadow it for renderer.ts while leaving the math untouched, which is
// the exact trap this spread removes: edit the value in render-math.ts.
/**
 * Nominal source height for a tile-feature marker, in the same units as
 * `MapSpriteDef.baseSize` (which runs 30-40 for the decor pack). Tuned so a
 * feature two tiles ahead reads at roughly a sixth of the screen; closer than
 * that, `featureMarkerSize` clamps it.
 */
const FEATURE_BILLBOARD_BASE_SIZE = 18;

const RENDER_CONFIG = {
  ...MATH_CONFIG,
  fillOpacityMultiplier: 0.45,
  // The edge-glow pass draws an amber line on every 1px strip. At full
  // strength that repaints flat walls amber and hides the per-floor wall art,
  // so flat-wall strips are scaled down to a warm wash; strips at a depth
  // discontinuity (corners, doorways, passage edges) keep full strength so
  // the signature glow lines still trace the geometry.
  glowWashAlphaScale: 0.02,
  // Minimum perpWallDist jump between adjacent strips that counts as a
  // depth discontinuity for full-strength glow lines.
  glowEdgeDepthDelta: 0.12,
  scanlineOpacity: 0.10,
  scanlineSpacing: 3,
  // The two floor tiles get different brightness levels so the grid-coord
  // checkerboard is readable without distorting hue. The per-floor campaign
  // tilesets are authored at mid luminance (means ~50-90, vs ~9-45 for the
  // legacy tiles), so these factors are close to 1.0 — large factors clip
  // mid-bright art to white before the distance fog pass can pull it back.
  // (The old floor/ceiling "darken multiplier" constants this comment used to
  // name were dead: the darken model was replaced by fogBlend-toward-bg.)
  floorABrightnessFactor: 1.15,
  floorBBrightnessFactor: 0.85,
  ceilingBrightnessFactor: 1.4,
  // Wall texture brightness/contrast. Campaign wall tiles are authored at
  // their target luminance, so no brighten is needed; the contrast stretch
  // below still deepens the mortar/shadow detail.
  wallBrightnessFactor: 1.0,
  // Contrast stretch applied to all textures after brightness adjustment.
  // Values >1 push pixels away from the midpoint (128), expanding dynamic range.
  wallContrastFactor: 1.25,
  floorAContrastFactor: 1.15,
  floorBContrastFactor: 1.15,
  ceilingContrastFactor: 1.15,
  // Raycast renderer tunables.
  raycastFov: Math.PI / 3,          // 60 degrees
  raycastStripWidth: 1,             // one ray per screen column
  wallRepeatsX: 1,                  // horizontal repeats per wall face
  // Walls are one grid cell tall; the per-ray height scaling below already
  // handles perspective (nearer walls draw taller). Baking multiple vertical
  // copies here and stretching that whole strip into one wall's screen
  // height just squashes/stretches the tile count incorrectly with distance.
  // If stacked tiles are wanted on tall walls, sample texY per screen row
  // instead of pre-baking a repeated strip.
  wallRepeatsY: 1,
  // Torch flicker: a subtle warm overlay that oscillates in intensity,
  // giving the corridor a living, firelit feel. The period is ~2s; the
  // amplitude is kept small so it doesn't distract from gameplay.
  //
  // The gradient is weighted toward the frame EDGES, not the centre. In a
  // corridor the screen centre is the *far* end, so a centre-weighted glow
  // put the party's own torchlight at maximum distance and left the walls
  // beside them unlit — measured at 4.2x more flicker in a centre disc than
  // in an equal-vignette annulus, with the near wall surface modulating by
  // 0.09% of its own mean, i.e. not at all.
  torchFlickerPeriod: 2000,       // ms for one full sine cycle
  torchFlickerAmplitude: 0.04,    // ±4% overlay alpha
  torchFlickerBase: 0.02,         // base overlay alpha (always present)
  // An edge-weighted radial gradient covers far more pixels than a
  // centre-weighted one of the same alpha, so the inversion would brighten
  // the whole frame. This rescales it back; tuned against measured mean
  // frame luminance (see the plan's Phase 1 exit criteria), not by eye.
  torchFlickerEdgeScale: 0.65,
  // Gradient stop between centre (transparent) and edge (full): keeps the
  // ramp off the corridor's mid-depth band so it reads as light falling on
  // near surfaces rather than as a vignette.
  torchFlickerMidStop: 0.5,
  torchFlickerMidAlpha: 0.3,
  // Head bob: vertical screen-space offset applied to the corridor view
  // during movement steps. A single sine hump synced to the step animation
  // adds weight to walking without touching perspective math.
  headBobAmplitude: 2.5,          // px — positive = head dips at mid-step
} as const;

// The arena backdrop camera (horizon fraction included) lives in
// arena-camera.ts — renderBattleArena relies on arena-renderer DEFAULTS,
// and the sprite ground-plane contract derives its seam from the same tuple.

/** Raycast hit data for a single ray. */
interface RayHit {
  side: "x" | "y";                  // "x" = x-step (crossed a vertical grid line / E-W-facing wall); "y" = y-step (crossed a horizontal grid line / N-S-facing wall)
  mapX: number;                     // grid cell hit
  mapY: number;
  perpWallDist: number;             // perpendicular distance, no fisheye
  wallX: number;                    // exact hit position along the wall face (0..1); for `y` hits this is fractional world x, for `x` hits fractional world y
  edge: EdgeType;                   // "wall" | "door" | "locked" | "barred" | "open"
}

export interface TextureSet {
  wall: HTMLImageElement | null;
  floorA: HTMLCanvasElement | null;
  floorB: HTMLCanvasElement | null;
  ceiling: HTMLCanvasElement | null;
  floorARepeated: HTMLCanvasElement | null;
  floorBRepeated: HTMLCanvasElement | null;
  ceilingRepeated: HTMLCanvasElement | null;
  floorAData: ImageData | null;
  floorBData: ImageData | null;
  ceilingData: ImageData | null;
}

/** One fully prepared tileset (adjusted textures + pre-repeated wall/door). */
export interface LoadedTileset {
  set: TextureSet;
  repeatedWall: HTMLCanvasElement | null;
  /** Palette-matched door panel for this theme, or null if it failed to load
   *  (renderer falls back to the shared placeholder, then to the procedural
   *  fill — see `doorTextureForTheme`). */
  door: HTMLCanvasElement | null;
  /**
   * Optional architectural panel drawn instead of the plain door texture
   * when the approach face leads into a stairs_up/stairs_down tile (see
   * `stairsTextureForTheme`). Loaded from `assets/tilesets/<theme>/stairs.png`
   * on the public path only (never Vite-bundled) — most themes have none,
   * which is expected and not a load failure, so a missing file is silent
   * (no `warnAsset`) and this stays null, falling back to the normal door
   * panel exactly as before this field existed.
   */
  stairs: HTMLCanvasElement | null;
  /** Optional non-repeating, heading-aware panorama used by outdoor themes. */
  sky: HTMLImageElement | null;
}

/** Bundled Vite-import fallbacks for campaign themes (also mirrored in public/). */
const BUNDLED_THEME_URLS: Record<
  string,
  { wall: string; floorA: string; floorB: string; ceiling: string; door: string }
> = {
  f1: { wall: f1WallUrl, floorA: f1FloorAUrl, floorB: f1FloorBUrl, ceiling: f1CeilingUrl, door: f1DoorUrl },
  f2: { wall: f2WallUrl, floorA: f2FloorAUrl, floorB: f2FloorBUrl, ceiling: f2CeilingUrl, door: f2DoorUrl },
  f3: { wall: f3WallUrl, floorA: f3FloorAUrl, floorB: f3FloorBUrl, ceiling: f3CeilingUrl, door: f3DoorUrl },
  f4: { wall: f4WallUrl, floorA: f4FloorAUrl, floorB: f4FloorBUrl, ceiling: f4CeilingUrl, door: f4DoorUrl },
  f5: { wall: f5WallUrl, floorA: f5FloorAUrl, floorB: f5FloorBUrl, ceiling: f5CeilingUrl, door: f5DoorUrl },
};

const FALLBACK_THEME = "f1";

function publicThemeUrls(theme: string): {
  wall: string;
  floorA: string;
  floorB: string;
  ceiling: string;
  door: string;
} {
  const base = `${import.meta.env.BASE_URL}assets/tilesets/${theme}`;
  return {
    wall: `${base}/wall.png`,
    floorA: `${base}/floorA.png`,
    floorB: `${base}/floorB.png`,
    ceiling: `${base}/ceiling.png`,
    door: `${base}/door.png`,
  };
}

function urlsForTheme(theme: string): {
  wall: string;
  floorA: string;
  floorB: string;
  ceiling: string;
  door: string;
} {
  return BUNDLED_THEME_URLS[theme] ?? publicThemeUrls(theme);
}

/** Public path only — see `LoadedTileset.stairs` doc comment. */
function stairsUrlForTheme(theme: string): string {
  return `${import.meta.env.BASE_URL}assets/tilesets/${theme}/stairs.png`;
}

function skyUrlForTheme(theme: string): string | null {
  return theme === "camp"
    ? `${import.meta.env.BASE_URL}assets/tilesets/camp/sky.png`
    : null;
}

const WATER_FLOOR_A_URL = `${import.meta.env.BASE_URL}assets/tilesets/water/floorA.png`;
const WATER_FLOOR_B_URL = `${import.meta.env.BASE_URL}assets/tilesets/water/floorB.png`;

// Loaded tilesets keyed by theme id. Populated by loadTextures() /
// ensureThemeLoaded(); render() picks the active set from the floor's theme.
// (Cached entries hold images/canvases — never CanvasPattern objects, which die
// when the target canvas is resized.)
const tilesetCache = new Map<string, LoadedTileset>();
const themeLoadPromises = new Map<string, Promise<LoadedTileset>>();
let tilesetGeneration = 0;

type CellTextureGrid = (TextureSet | null)[][];

interface ResolvedFloorTextures {
  generation: number;
  primaryTheme: string;
  primaryTileset: LoadedTileset | null;
  cellTextures: CellTextureGrid;
  waterCells: boolean[][];
  waterFloorAData: ImageData | null;
  waterFloorBData: ImageData | null;
}

/** Per-floor prepared cell lookup; rebuilt only when another theme settles. */
const floorTextureGridCache = new WeakMap<object, ResolvedFloorTextures>();
/** Fallback door panel texture, shared across themes with no door of their
 *  own (custom/public themes without a `door.png`, or load failure). Each
 *  bundled campaign theme carries its own palette-matched door in
 *  `tilesetCache`, preferred via `doorTextureForTheme`. Null until loaded. */
let doorTexture: HTMLCanvasElement | null = null;
let doorLoadPromise: Promise<void> | null = null;
let waterTileset: LoadedTileset | null = null;
let waterLoadPromise: Promise<void> | null = null;
// Ceiling surface features (see data/ceiling-features.ts): each entry fully
// replaces the sampled ceiling texture for one grid cell, so it's prepared
// exactly like a theme's ceiling.png (brightness/contrast match, one repeat,
// flattened to ImageData) and looked up by spriteId rather than by theme.
const ceilingFeatureCache = new Map<string, ImageData | null>();
let ceilingFeaturesLoadPromise: Promise<void> | null = null;
// Reusable per-frame buffers (avoid allocation in the hot render loop).
let hitsBuffer: (RayHit | null)[] = [];
let lastVignetteW = 0;
let lastVignetteH = 0;
let cachedVignetteGradient: CanvasGradient | null = null;
let cachedDarknessVignetteGradient: CanvasGradient | null = null;

// Reusable floor/ceiling ImageData buffer. Allocated once at the first
// render and resized only when the canvas dimensions change. This avoids
// creating ~2MB of pixel data every frame (768×672×4 bytes).
let floorCeilBuf: ImageData | null = null;
let floorCeilBufW = 0;
let floorCeilBufH = 0;

// Screen-space sky backdrop for the Camp's false-outdoor reveal. Generated
// once at the current canvas size and blitted into the upper half of the
// floor/ceiling buffer before the floor casting pass.
let campSkyBuf: ImageData | null = null;
let campSkyBufW = 0;
let campSkyBufH = 0;
let campSkyBufImage: HTMLImageElement | null = null;
let campSkyBufHeading = NaN;

let campSkyScratchCanvas: HTMLCanvasElement | null = null;
let campSkyScratchCtx: CanvasRenderingContext2D | null = null;
let campSkySourceImage: HTMLImageElement | null = null;
let campSkySourceData: ImageData | null = null;

// Floor/ceiling pixel-cast memoization: opacityForDepth is pure distance
// math (no time term) and the render camera holds byte-identical values
// while the player is neither moving nor turning (RenderCameraAnimator
// pins displayX/Y/Facing once its tween finishes), so a standing-still
// player recomputes ~516,000 pixels of identical output every frame with
// nothing to show for it — measured ~30ms/frame of the ~34ms frame budget
// on this loop alone. Cache the inputs that fully determine the buffer's
// contents and skip straight to putImageData when none have changed.
let floorCeilCacheValid = false;
let floorCeilCacheCamX = NaN;
let floorCeilCacheCamY = NaN;
let floorCeilCacheDirX = NaN;
let floorCeilCacheDirY = NaN;
let floorCeilCachePlaneX = NaN;
let floorCeilCachePlaneY = NaN;
let floorCeilCacheBobY = NaN;
let floorCeilCacheDarkness: boolean | null = null;
let floorCeilCacheUseSky: boolean | null = null;
let floorCeilCacheTextureGrid: CellTextureGrid | null = null;
let floorCeilCachePrimaryTextures: TextureSet | null = null;
let floorCeilCacheWaterCells: boolean[][] | null = null;
let floorCeilCacheWaterAData: ImageData | null = null;
let floorCeilCacheWaterBData: ImageData | null = null;
// Pre-computed little-endian RGBA packed value for the bg color, used for
// fast Uint32Array.fill() pre-fill of the buffer.
const BG_RGBA_PACKED =
  (255 << 24) | (BG_B << 16) | (BG_G << 8) | BG_R;

// --- Smooth movement interpolation -----------------------------------------
// The render camera lerps from the previous grid position to the new one
// over a short duration, producing smooth first-person motion instead of
// instant grid snapping. This state is module-level (not in GameState) because
// it is purely a render concern — game logic always sees integer grid coords.
const cameraAnim = new RenderCameraAnimator();

// --- Raft animation visual override ---------------------------------------
// While a raft route animation is active, the authoritative player position
// stays at the origin dock (by design — see raft-animation.ts). The renderer
// must still show the party moving along the path, so the main loop installs
// a transient visual override (interpolated float position + travel facing)
// that bypasses the grid camera animator for the duration of the crossing.
// This is purely a render concern; game logic never sees these floats.
let raftVisualOverride: { x: number; y: number; facing: number } | null = null;

/**
 * Install (or clear) a transient raft-animation visual camera override. The
 * main loop calls this every frame while a `RaftAnimationController` is
 * active, passing the controller's interpolated `getVisualPosition()` and the
 * travel facing. Pass `null` to restore normal grid camera interpolation.
 */
export function setRaftVisualOverride(
  pos: { x: number; y: number; facing: number } | null
): void {
  raftVisualOverride = pos;
}

/** True if a raft visual override is currently installed. Test helper. */
export function hasRaftVisualOverride(): boolean {
  return raftVisualOverride !== null;
}

/**
 * Update the display camera toward the actual player position and return the
 * RenderCamera to use for this frame's rendering. When a raft visual override
 * is installed, the camera is positioned at the override's interpolated float
 * coordinates with the travel facing, bypassing the grid camera animator —
 * the party visually glides along the raft path while the authoritative grid
 * position remains at the origin dock.
 */
function updateRenderCamera(state: GameState): RenderCamera {
  if (raftVisualOverride) {
    const dir = dirFromFacing(raftVisualOverride.facing);
    const plane = planeFromDir(dir.x, dir.y, RENDER_CONFIG.raycastFov);
    return {
      x: raftVisualOverride.x,
      y: raftVisualOverride.y,
      dirX: dir.x,
      dirY: dir.y,
      planeX: plane.planeX,
      planeY: plane.planeY,
    };
  }
  cameraAnim.update(
    state.player.x,
    state.player.y,
    state.player.facing,
    performance.now()
  );
  return cameraAnim.getCamera(RENDER_CONFIG.raycastFov);
}

/** True if the render camera is currently tweening toward a target. */
export function isRenderCameraAnimating(): boolean {
  return cameraAnim.isAnimating();
}

/**
 * True when the render camera has fully settled on the given grid state.
 * Unlike `isRenderCameraAnimating()`, this also covers the pending-tween
 * window between a movement keydown and the next frame's camera update —
 * see RenderCameraAnimator.isSettledAt. Debug quiescence probe only.
 */
export function isRenderCameraSettledFor(
  x: number,
  y: number,
  facing: number
): boolean {
  return cameraAnim.isSettledAt(x, y, facing);
}

/** Reset the render camera instantly to the given grid state. */
export function resetRenderCamera(
  x: number,
  y: number,
  facing: number
): void {
  cameraAnim.reset(x, y, facing);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load texture: ${src}`));
    img.src = src;
  });
}

function adjustTextureImage(
  img: HTMLImageElement,
  brightnessFactor: number,
  contrastFactor: number
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, c.width, c.height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    for (let j = 0; j < 3; j++) {
      let v = Math.min(255, data[i + j] * brightnessFactor);
      v = (v - 128) * contrastFactor + 128;
      data[i + j] = Math.max(0, Math.min(255, v));
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return c;
}

function prepareRepeatedTexture(
  img: HTMLImageElement | HTMLCanvasElement,
  repeatsX: number,
  repeatsY: number
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.width * repeatsX;
  c.height = img.height * repeatsY;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < repeatsY; y++) {
    for (let x = 0; x < repeatsX; x++) {
      ctx.drawImage(img, x * img.width, y * img.height);
    }
  }
  return c;
}

/** Load and prepare campaign themes (f1–f5, each with its own door panel)
 *  plus the generic placeholder used as a fallback for themes with no door
 *  of their own (custom/public themes, or a per-theme door that failed to load). */
export function loadTextures(): Promise<void> {
  return Promise.all([
    ...Object.keys(BUNDLED_THEME_URLS).map((theme) => ensureThemeLoaded(theme)),
    ensureDoorTextureLoaded(),
    ensureWaterTextureLoaded(),
  ]).then(() => {});
}

/** The door texture to draw for a theme: its own palette-matched panel if
 *  loaded, else the shared placeholder, else null (procedural fallback). */
function doorTextureForTheme(
  theme: string,
  primaryTheme: string
): HTMLCanvasElement | null {
  return (
    tilesetCache.get(theme)?.door ??
    tilesetCache.get(primaryTheme)?.door ??
    doorTexture
  );
}

/** The stairs architecture panel for a theme, or null when none is registered
 *  (falls back to the normal door panel — see the `hit.edge === "door"`
 *  branch in `render()`). Unlike `doorTextureForTheme`, there is no shared
 *  placeholder: a theme with no stairs art should render its ordinary door,
 *  not a generic stairs panel that belongs to a different theme. */
function stairsTextureForTheme(
  theme: string,
  primaryTheme: string
): HTMLCanvasElement | null {
  return tilesetCache.get(theme)?.stairs ?? tilesetCache.get(primaryTheme)?.stairs ?? null;
}

function ensureDoorTextureLoaded(): Promise<void> {
  if (doorTexture) return Promise.resolve();
  if (doorLoadPromise) return doorLoadPromise;
  doorLoadPromise = loadImage(doorPlaceholderUrl)
    .then((img) => {
      // Mild darkening so the panel sits in the corridor fog like wall art.
      const adjusted = adjustTextureImage(img, 0.92, 1.05);
      doorTexture = prepareRepeatedTexture(adjusted, 1, 1);
    })
    .catch(() => {
      warnAsset(`failed to load door placeholder texture: ${doorPlaceholderUrl}`);
      doorTexture = null;
    })
    .then(() => {
      doorLoadPromise = null;
    });
  return doorLoadPromise;
}

/** Load the shared authored water floor tileset. It only provides floor
 *  textures; walls/ceilings/doors for water cells continue to use the
 *  surrounding regional theme, so those files are not requested. */
function ensureWaterTextureLoaded(): Promise<void> {
  if (waterTileset) return Promise.resolve();
  if (waterLoadPromise) return waterLoadPromise;
  waterLoadPromise = Promise.all([
    loadImage(WATER_FLOOR_A_URL).catch(() => null),
    loadImage(WATER_FLOOR_B_URL).catch(() => null),
  ])
    .then(([floorAImg, floorBImg]) => {
      const floorA = floorAImg ? adjustTextureImage(floorAImg, 1, 1) : null;
      const floorB = floorBImg ? adjustTextureImage(floorBImg, 1, 1) : null;
      const floorARepeated = floorA ? prepareRepeatedTexture(floorA, 1, 1) : null;
      const floorBRepeated = floorB ? prepareRepeatedTexture(floorB, 1, 1) : null;
      waterTileset = {
        set: {
          wall: null,
          floorA,
          floorB,
          ceiling: null,
          floorARepeated,
          floorBRepeated,
          ceilingRepeated: null,
          floorAData: floorARepeated
            ? floorARepeated.getContext("2d")!.getImageData(0, 0, floorARepeated.width, floorARepeated.height)
            : null,
          floorBData: floorBRepeated
            ? floorBRepeated.getContext("2d")!.getImageData(0, 0, floorBRepeated.width, floorBRepeated.height)
            : null,
          ceilingData: null,
        },
        repeatedWall: null,
        door: null,
        stairs: null,
        sky: null,
      };
      tilesetGeneration++;
    })
    .catch(() => {
      warnAsset("failed to load water tileset textures");
      waterTileset = null;
    })
    .then(() => {
      waterLoadPromise = null;
    });
  return waterLoadPromise;
}

/**
 * Load every registered ceiling feature and prepare it as a drop-in
 * `TextureSet.ceilingData` replacement — same brightness/contrast treatment
 * as an ordinary ceiling.png, so a feature cell doesn't read darker or
 * flatter than its neighbors.
 *
 * `resolveFloorTextures` memoizes its per-floor cell grid on `floor` +
 * `tilesetGeneration`. Feature art can finish loading well after that grid
 * was first built (this call is not awaited before the render loop starts),
 * so this bumps `tilesetGeneration` on settle — the same invalidation lever
 * `ensureWaterTextureLoaded`/`ensureThemeLoaded` use — rather than relying on
 * load-order luck to make the swap visible.
 */
export function loadCeilingFeatures(): Promise<void> {
  if (ceilingFeaturesLoadPromise) return ceilingFeaturesLoadPromise;
  ceilingFeaturesLoadPromise = Promise.all(
    CEILING_FEATURES.map((def) =>
      loadImage(ceilingFeatureUrl(def))
        .then((img) => {
          const adjusted = adjustTextureImage(
            img,
            RENDER_CONFIG.ceilingBrightnessFactor,
            RENDER_CONFIG.ceilingContrastFactor
          );
          const repeated = prepareRepeatedTexture(adjusted, 1, 1);
          const data = repeated
            .getContext("2d")!
            .getImageData(0, 0, repeated.width, repeated.height);
          ceilingFeatureCache.set(def.id, data);
        })
        .catch(() => {
          warnAsset(`failed to load ceiling feature: ${def.id}`);
          ceilingFeatureCache.set(def.id, null);
        })
    )
  ).then(() => {
    tilesetGeneration++;
    ceilingFeaturesLoadPromise = null;
  });
  return ceilingFeaturesLoadPromise;
}

function getCeilingFeatureData(spriteId: string): ImageData | null {
  return ceilingFeatureCache.get(spriteId) ?? null;
}

/** Ensure a tileset theme is in the cache (no-op if already loaded). */
export function ensureThemeLoaded(theme: string): Promise<LoadedTileset> {
  const cached = tilesetCache.get(theme);
  if (cached) return Promise.resolve(cached);
  let pending = themeLoadPromises.get(theme);
  if (!pending) {
    pending = loadTileset(theme, urlsForTheme(theme)).then((tileset) => {
      tilesetCache.set(theme, tileset);
      tilesetGeneration++;
      themeLoadPromises.delete(theme);
      return tileset;
    });
    themeLoadPromises.set(theme, pending);
  }
  return pending;
}

function loadTileset(
  theme: string,
  urls: {
    wall: string;
    floorA: string;
    floorB: string;
    ceiling: string;
    door: string;
  }
): Promise<LoadedTileset> {
  return Promise.all([
    loadImage(urls.wall).catch(() => {
      warnAsset(`failed to load wall texture: ${urls.wall}`);
      return null;
    }),
    loadImage(urls.floorA).catch(() => {
      warnAsset(`failed to load floorA texture: ${urls.floorA}`);
      return null;
    }),
    loadImage(urls.floorB).catch(() => {
      warnAsset(`failed to load floorB texture: ${urls.floorB}`);
      return null;
    }),
    loadImage(urls.ceiling).catch(() => {
      warnAsset(`failed to load ceiling texture: ${urls.ceiling}`);
      return null;
    }),
    loadImage(urls.door).catch(() => {
      warnAsset(`failed to load door texture: ${urls.door}`);
      return null;
    }),
    // Optional and per-theme — most themes have no stairs.png yet. That's not
    // a failure, so no warnAsset: a 404 here just means the plain door panel
    // keeps rendering for this theme's stairs exits, same as before this field
    // existed.
    loadImage(stairsUrlForTheme(theme)).catch(() => null),
    skyUrlForTheme(theme) ? loadImage(skyUrlForTheme(theme)!).catch(() => null) : Promise.resolve(null),
  ]).then(([wall, floorAImg, floorBImg, ceilingImg, doorImg, stairsImg, sky]) => {
    const wallAdjusted = wall
      ? adjustTextureImage(wall, RENDER_CONFIG.wallBrightnessFactor, RENDER_CONFIG.wallContrastFactor)
      : null;
    const floorABright = floorAImg
      ? adjustTextureImage(floorAImg, RENDER_CONFIG.floorABrightnessFactor, RENDER_CONFIG.floorAContrastFactor)
      : null;
    const floorBBright = floorBImg
      ? adjustTextureImage(floorBImg, RENDER_CONFIG.floorBBrightnessFactor, RENDER_CONFIG.floorBContrastFactor)
      : null;
    const ceilingBright = ceilingImg
      ? adjustTextureImage(ceilingImg, RENDER_CONFIG.ceilingBrightnessFactor, RENDER_CONFIG.ceilingContrastFactor)
      : null;

    const floorARepeated = floorABright ? prepareRepeatedTexture(floorABright, 1, 1) : null;
    const floorBRepeated = floorBBright ? prepareRepeatedTexture(floorBBright, 1, 1) : null;
    const ceilingRepeated = ceilingBright ? prepareRepeatedTexture(ceilingBright, 1, 1) : null;

    const set: TextureSet = {
      wall,
      floorA: floorABright,
      floorB: floorBBright,
      ceiling: ceilingBright,
      floorARepeated,
      floorBRepeated,
      ceilingRepeated,
      floorAData: floorARepeated
        ? floorARepeated.getContext("2d")!.getImageData(0, 0, floorARepeated.width, floorARepeated.height)
        : null,
      floorBData: floorBRepeated
        ? floorBRepeated.getContext("2d")!.getImageData(0, 0, floorBRepeated.width, floorBRepeated.height)
        : null,
      ceilingData: ceilingRepeated
        ? ceilingRepeated.getContext("2d")!.getImageData(0, 0, ceilingRepeated.width, ceilingRepeated.height)
        : null,
    };
    const repeatedWall = wallAdjusted
      ? prepareRepeatedTexture(wallAdjusted, RENDER_CONFIG.wallRepeatsX, RENDER_CONFIG.wallRepeatsY)
      : null;
    // Same mild darkening as the old shared placeholder so the panel sits in
    // the corridor fog like the rest of the wall art (see ensureDoorTextureLoaded).
    const doorAdjusted = doorImg ? adjustTextureImage(doorImg, 0.92, 1.05) : null;
    const door = doorAdjusted ? prepareRepeatedTexture(doorAdjusted, 1, 1) : null;
    // Stairs architecture is a full wall/door-face replacement, not a dim
    // panel — keep it at the same tone as the surrounding wall art rather
    // than the door's mild darkening.
    const stairsAdjusted = stairsImg
      ? adjustTextureImage(stairsImg, RENDER_CONFIG.wallBrightnessFactor, RENDER_CONFIG.wallContrastFactor)
      : null;
    const stairs = stairsAdjusted ? prepareRepeatedTexture(stairsAdjusted, 1, 1) : null;
    return { set, repeatedWall, door, stairs, sky };
  });
}

function resolveFloorTextures(floor: GameState["floor"]): ResolvedFloorTextures {
  const cached = floorTextureGridCache.get(floor);
  if (cached?.generation === tilesetGeneration) return cached;

  const primaryTheme = resolveTilesetTheme(floor);
  const primaryTileset =
    tilesetCache.get(primaryTheme) ?? tilesetCache.get(FALLBACK_THEME) ?? null;
  // Ceiling features fully replace the sampled ceiling texture for their one
  // cell (see data/ceiling-features.ts) — build the lookup once per floor
  // rather than scanning the array per cell.
  const ceilingFeatureByCell = new Map<string, string>();
  for (const f of floor.ceilingFeatures ?? []) {
    ceilingFeatureByCell.set(`${f.x},${f.y}`, f.spriteId);
  }
  const cellTextures = floor.grid.map((row, y) =>
    row.map((_, x) => {
      const theme = themeAt(floor, x, y);
      const base = tilesetCache.get(theme)?.set ?? primaryTileset?.set ?? null;
      const featureId = ceilingFeatureByCell.get(`${x},${y}`);
      if (!featureId || !base) return base;
      const featureData = getCeilingFeatureData(featureId);
      return featureData ? { ...base, ceilingData: featureData } : base;
    })
  );
  const waterCells = waterGridFromFloor(floor);
  const waterFloorAData = waterTileset?.set.floorAData ?? null;
  const waterFloorBData = waterTileset?.set.floorBData ?? null;
  const resolved: ResolvedFloorTextures = {
    generation: tilesetGeneration,
    primaryTheme,
    primaryTileset,
    cellTextures,
    waterCells,
    waterFloorAData,
    waterFloorBData,
  };
  floorTextureGridCache.set(floor, resolved);
  return resolved;
}

function rgba(
  color: { r: number; g: number; b: number },
  alpha: number
): string {
  return `rgba(${color.r},${color.g},${color.b},${Math.max(0, alpha)})`;
}

/** Cast a ray through the grid using DDA and return the first non-open wall hit.
 *  Takes float world coordinates so it works with the interpolated render camera. */
function castRay(
  grid: Grid,
  playerWX: number,
  playerWY: number,
  rayDirX: number,
  rayDirY: number,
  maxDist: number
): RayHit | null {
  if (rayDirX === 0 && rayDirY === 0) return null;

  let mapX = Math.floor(playerWX);
  let mapY = Math.floor(playerWY);

  const deltaDistX = Math.abs(1 / rayDirX);
  const deltaDistY = Math.abs(1 / rayDirY);

  let stepX: number, sideDistX: number;
  let stepY: number, sideDistY: number;

  if (rayDirX < 0) {
    stepX = -1;
    sideDistX = (playerWX - mapX) * deltaDistX;
  } else {
    stepX = 1;
    sideDistX = (mapX + 1 - playerWX) * deltaDistX;
  }
  if (rayDirY < 0) {
    stepY = -1;
    sideDistY = (playerWY - mapY) * deltaDistY;
  } else {
    stepY = 1;
    sideDistY = (mapY + 1 - playerWY) * deltaDistY;
  }

  let side: "x" | "y" = "y";

  while (true) {
    if (sideDistX < sideDistY) {
      sideDistX += deltaDistX;
      mapX += stepX;
      side = "x";
    } else {
      sideDistY += deltaDistY;
      mapY += stepY;
      side = "y";
    }

    if (mapY < 0 || mapY >= grid.length || mapX < 0 || mapX >= grid[0].length) {
      return null;
    }

    const cell = grid[mapY][mapX];
    // Determine which edge of this cell the ray crossed.
    const dir = side === "y"
      ? (stepY > 0 ? 0 : 2)   // N or S edge
      : (stepX > 0 ? 3 : 1);  // W or E edge
    const rawEdge = edgeInDirection(cell, dir);
    // Stair tiles stay walkable (open edges) but occlude like doors so the
    // exit face samples the theme door panel instead of a ↑/↓ glyph.
    const edge = raycastEdgeStop(rawEdge, cell.tile);
    if (edge === null) continue;

    const perpWallDist = side === "y"
      ? (mapY - playerWY + (1 - stepY) / 2) / rayDirY
      : (mapX - playerWX + (1 - stepX) / 2) / rayDirX;

    if (perpWallDist > maxDist) return null;

    let wallX: number;
    if (side === "y") {
      wallX = playerWX + perpWallDist * rayDirX;
    } else {
      wallX = playerWY + perpWallDist * rayDirY;
    }
    wallX -= Math.floor(wallX);

    return { side, mapX, mapY, perpWallDist, wallX, edge };
  }
}

/**
 * Screen placement for one billboard standing on the floor of a tile.
 * Returns `null` when the billboard is behind the camera, hidden by a wall, or
 * faded out entirely.
 */
type BillboardPlacement = {
  screenX: number;
  /** Top edge, so the billboard's base rests on the floor at its depth. */
  drawY: number;
  size: number;
  alpha: number;
  depth: number;
};

function placeBillboard(
  ctx: CanvasRenderingContext2D,
  cam: RenderCamera,
  hits: (RayHit | null)[],
  stripWidth: number,
  tileX: number,
  tileY: number,
  sizeFor: (screenH: number, depth: number) => number,
  inDarkness: boolean
): BillboardPlacement | null {
  const proj = projectBillboard(cam, tileX, tileY);
  if (!proj || proj.depth <= BILLBOARD_MIN_DEPTH) return null;

  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const screenX = Math.floor(billboardScreenX(proj, w));
  const size = sizeFor(h, proj.depth);
  const lineHeight = computeLineHeight(h, proj.depth);
  const drawEnd = Math.min(h - 1, Math.floor(lineHeight / 2 + h / 2));

  // Z-test against the wall the ray through this billboard's centre hit.
  const stripIdx = Math.floor(screenX / stripWidth);
  if (stripIdx >= 0 && stripIdx < hits.length) {
    const hit = hits[stripIdx];
    if (hit && isBillboardOccluded(hit.perpWallDist, proj.depth)) return null;
  }

  const alpha = opacityForDepth(proj.depth) * (inDarkness ? 0.5 : 1);
  if (alpha <= 0) return null; // beyond the taper boundary: skip the draw call

  return { screenX, drawY: drawEnd - size, size, alpha, depth: proj.depth };
}

/**
 * Screen placement for one billboard hanging from the CEILING at a tile's
 * depth — the top-anchored mirror of `placeBillboard`.
 *
 * The critical difference is the anchor line itself: `placeBillboard`'s floor
 * line is `Math.min(h - 1, ...)`, clamped so it never runs off the bottom of
 * the screen. The ceiling line here is deliberately UNCLAMPED
 * (`h / 2 - lineHeight / 2`, which goes negative up close). Clamping it would
 * freeze the attachment point at screen-top once the wall band grows past the
 * viewport at close range, so the object would visibly slide down and detach
 * from the ceiling as the party approaches — exactly the "floating icon"
 * failure a suspended object must not have. `ctx.drawImage` clips a negative
 * Y fine; only the alpha/depth rejects below need guarding.
 */
function placeCeilingBillboard(
  ctx: CanvasRenderingContext2D,
  cam: RenderCamera,
  hits: (RayHit | null)[],
  stripWidth: number,
  tileX: number,
  tileY: number,
  sizeFor: (screenH: number, depth: number) => number,
  inDarkness: boolean
): BillboardPlacement | null {
  const proj = projectBillboard(cam, tileX, tileY);
  if (!proj || proj.depth <= BILLBOARD_MIN_DEPTH) return null;

  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const screenX = Math.floor(billboardScreenX(proj, w));
  const size = sizeFor(h, proj.depth);
  const drawY = ceilingAnchorY(h, proj.depth);

  // Same single-strip Z-test as the floor anchor (see placeBillboard).
  const stripIdx = Math.floor(screenX / stripWidth);
  if (stripIdx >= 0 && stripIdx < hits.length) {
    const hit = hits[stripIdx];
    if (hit && isBillboardOccluded(hit.perpWallDist, proj.depth)) return null;
  }

  const alpha = opacityForDepth(proj.depth) * (inDarkness ? 0.5 : 1);
  if (alpha <= 0) return null;

  return { screenX, drawY, size, alpha, depth: proj.depth };
}

/**
 * Decor sprites keep their original unclamped perspective scale — they are
 * physical objects, so filling the view when you stand beside one is correct.
 */
const decorSpriteSize =
  (baseSize: number) =>
  (screenH: number, depth: number): number =>
    Math.max(8, Math.abs(Math.floor((screenH / depth) * (baseSize / 56))));

/**
 * Paint a floor-standing map sprite using its visible source rectangle.
 *
 * `groundY` is the projected floor line for the tile. Cropping is intentional:
 * source canvases often include transparent export padding, and anchoring that
 * padding instead of the lowest opaque pixel makes wheels, boots, and tent
 * hems visibly float above the floor.
 */
function drawGroundedMapSprite(
  ctx: CanvasRenderingContext2D,
  img: MapSpriteImage,
  spriteId: string,
  screenX: number,
  groundY: number,
  drawH: number
): void {
  const bounds = getMapSpriteAlphaBounds(spriteId);
  if (!bounds) return;
  // `drawH` is the projected height of the original source canvas (the
  // pre-grounding billboard contract). Crop transparent padding without
  // changing that world scale: the visible rectangle gets the same pixels
  // per source pixel as the full image did.
  const sourceH = (img as HTMLImageElement).naturalHeight || img.height;
  if (sourceH <= 0 || bounds.height <= 0) return;
  const scale = drawH / sourceH;
  const visibleH = bounds.height * scale;
  const drawW = bounds.width * scale;
  ctx.drawImage(
    img,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    screenX - drawW / 2,
    groundY - visibleH,
    drawW,
    visibleH
  );
}

/** Draw ceiling-hanging decor sprites (chains, cages, censers, roots, ...). */
function drawCeilingSprites(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cam: RenderCamera,
  hits: (RayHit | null)[],
  stripWidth: number,
  maxDist: number,
  inDarkness: boolean
): void {
  const sprites = state.floor.ceilingSprites;
  if (!sprites?.length) return;

  type Placed = { spriteId: string; place: BillboardPlacement };
  const placed: Placed[] = [];
  for (const s of sprites) {
    // Cheap reject before the projection maths — keeps hundreds of
    // placements on a floor practical (see AGENTS.md perf notes).
    if (Math.abs(s.x - cam.x) > maxDist || Math.abs(s.y - cam.y) > maxDist) continue;
    const def = getCeilingSpriteDef(s.spriteId);
    if (!def) continue;
    const scale = s.scale && Number.isFinite(s.scale) && s.scale > 0 ? s.scale : 1;
    const place = placeCeilingBillboard(
      ctx, cam, hits, stripWidth, s.x, s.y, decorSpriteSize(def.baseSize * scale), inDarkness
    );
    if (place) placed.push({ spriteId: s.spriteId, place });
  }
  placed.sort((a, b) => b.place.depth - a.place.depth);

  for (const p of placed) {
    const img = getCeilingSpriteImage(p.spriteId);
    if (!img) continue;
    const { screenX, drawY, size, alpha } = p.place;
    // Unlike mapSprites (uniformly 32x32 square source art), ceiling-sprite
    // art is authored tall-and-narrow on purpose (a chain reads nothing like
    // a cage). Forcing every image into a size x size square would stretch
    // each one by a different, art-dependent amount. `size` is the vertical
    // scale (matches how a hanging object's apparent LENGTH should drive its
    // on-screen size); width is derived from the source image's own aspect
    // ratio so the art's proportions survive at every distance.
    const aspect = img.width / img.height;
    const drawH = size;
    const drawW = size * aspect;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, screenX - drawW / 2, drawY, drawW, drawH);
    ctx.restore();
  }
}

/** Draw static map decor sprites (Wolf3D-style billboards). */
function drawMapSprites(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cam: RenderCamera,
  hits: (RayHit | null)[],
  stripWidth: number,
  inDarkness: boolean
): void {
  const sprites = state.floor.mapSprites;
  if (!sprites?.length) return;

  type Placed = { spriteId: string; def: MapSpriteDef; place: BillboardPlacement };
  const placed: Placed[] = [];
  for (const s of sprites) {
    const def = getMapSpriteDef(s.spriteId);
    if (!def) continue;
    const place = placeBillboard(
      ctx, cam, hits, stripWidth, s.x, s.y, decorSpriteSize(def.baseSize), inDarkness
    );
    if (place) placed.push({ spriteId: s.spriteId, def, place });
  }
  placed.sort((a, b) => b.place.depth - a.place.depth);

  // Warm pools belong behind their props, so the fire and lantern cores stay
  // crisp while their light gently reaches the readable night floor/walls.
  for (const p of placed) {
    if (!p.def.light) continue;
    const { screenX, drawY, size, alpha } = p.place;
    const light = p.def.light;
    const radius = size * light.radiusScale;
    const gradient = ctx.createRadialGradient(screenX, drawY + size, 0, screenX, drawY + size, radius);
    gradient.addColorStop(0, `rgba(${light.color}, ${light.intensity * alpha})`);
    gradient.addColorStop(0.45, `rgba(${light.color}, ${light.intensity * alpha * 0.34})`);
    gradient.addColorStop(1, `rgba(${light.color}, 0)`);
    ctx.save();
    ctx.fillStyle = gradient;
    ctx.fillRect(screenX - radius, drawY + size - radius, radius * 2, radius * 2);
    ctx.restore();
  }

  for (const p of placed) {
    const img = getMapSpriteImage(p.spriteId);
    if (!img) continue;
    const { screenX, drawY, size, alpha } = p.place;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    drawGroundedMapSprite(ctx, img, p.spriteId, screenX, drawY + size, size);
    ctx.restore();
  }
}

/**
 * Draw interactive tile features as floor-standing billboards.
 *
 * Previously each feature was painted at the base of whichever wall strip the
 * raycaster stopped on, keyed off `hit.mapX/mapY`. But `castRay` reports the
 * cell it stepped INTO whose entry edge blocked — the cell on the far side of
 * the wall. So the glyph was drawn for cells the party cannot see and never
 * for a chest sitting on open floor ahead, which made every feature invisible
 * until you stood on it. Projecting the feature's own tile fixes both halves.
 *
 * Stairs are excluded: they already paint as door panels via `raycastEdgeStop`.
 */
function drawFeatureBillboards(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cam: RenderCamera,
  hits: (RayHit | null)[],
  stripWidth: number,
  maxDist: number,
  inDarkness: boolean
): void {
  const grid = state.floor.grid;
  const color = inDarkness ? PALETTE.featureDark : PALETTE.feature;

  type Placed = {
    feature: TileFeature;
    spriteId: string | null;
    img: MapSpriteImage | null;
    place: BillboardPlacement;
  };
  const placed: Placed[] = [];
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x++) {
      const tile = row[x]?.tile;
      if (!isCorridorMarkerFeature(tile)) continue;
      // The party's own tile is drawn as an underfoot indicator instead.
      if (x === state.player.x && y === state.player.y) continue;
      // Cheap reject before the projection maths.
      if (Math.abs(x - cam.x) > maxDist || Math.abs(y - cam.y) > maxDist) continue;

      const looted = tile === "treasure" && isTreasureLooted(state.floor, x, y);
      // First candidate whose art has actually shipped wins.
      let img: MapSpriteImage | null = null;
      let def: MapSpriteDef | undefined;
      let spriteId: string | null = null;
      // NPCs are per-instance, not per-feature-type: each one may carry its
      // own mapSpriteId (same MAP_SPRITES registry/cache as decor sprites),
      // so this resolves the specific NPC at (x,y) instead of the shared
      // featurePropSpriteIds table (which stays [] for "npc" on purpose — see
      // maze-props.test.ts). Absent or unregistered id falls through to the
      // ordinary "&" glyph below, same as any other feature with no art yet.
      const npcSpriteId = tile === "npc" ? npcAt(state, x, y)?.mapSpriteId : undefined;
      if (npcSpriteId) {
        const candidate = getMapSpriteImage(npcSpriteId);
        if (candidate) {
          img = candidate;
          def = getMapSpriteDef(npcSpriteId);
          spriteId = npcSpriteId;
        }
      } else {
        for (const id of featurePropSpriteIds(tile, { looted })) {
          const candidate = getMapSpriteImage(id);
          if (!candidate) continue;
          img = candidate;
          def = getMapSpriteDef(id);
          spriteId = id;
          break;
        }
      }
      const hasProp = !!(img && def);
      // An emptied chest is scenery, not a lead. Without the opened-chest prop
      // there is nothing honest to draw — a "$" would advertise loot that is
      // already gone — so it renders as nothing, exactly as it did before.
      if (looted && !hasProp) continue;

      const place = placeBillboard(
        ctx,
        cam,
        hits,
        stripWidth,
        x,
        y,
        hasProp
          ? (screenH, depth) => propBillboardSize(screenH, depth, def!.baseSize)
          : (screenH, depth) => featureMarkerSize(screenH, depth, FEATURE_BILLBOARD_BASE_SIZE),
        inDarkness
      );
      if (place) placed.push({
        feature: tile,
        spriteId,
        img: hasProp ? img : null,
        place,
      });
    }
  }
  placed.sort((a, b) => b.place.depth - a.place.depth);

  for (const p of placed) {
    const { screenX, drawY, size, alpha } = p.place;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (p.img && p.spriteId) {
      ctx.imageSmoothingEnabled = false;
      drawGroundedMapSprite(ctx, p.img, p.spriteId, screenX, drawY + size, size);
    } else {
      drawFeatureGlyph(ctx, screenX, drawY + size / 2, p.feature, color, size);
    }
    ctx.restore();
  }
}

/** Draw a tile feature icon on the floor at the player's current position. */
function drawFloorFeature(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  feature: TileFeature,
  inDarkness: boolean
): void {
  ctx.save();
  const cx = w / 2;
  const cy = h / 2 + 30; // slightly below center, on the floor
  const color = inDarkness ? PALETTE.featureDark : PALETTE.feature;
  drawFeatureGlyph(ctx, cx, cy, feature, color, 16);
  ctx.restore();
}

/** Draw a feature glyph (text icon) at the given position. */
function drawFeatureGlyph(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  feature: TileFeature,
  color: string,
  size: number
): void {
  ctx.save();
  const glyph = featureGlyph(feature);
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px "FF36", "Courier New", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, cx, cy);
  ctx.restore();
}

/** Map a tile feature to a display glyph. */
function featureGlyph(feature: TileFeature): string {
  switch (feature) {
    case "stairs_up":
      return "↑";
    case "stairs_down":
      return "↓";
    case "teleporter":
      return "✦";
    case "chute":
      return "»";
    case "darkness":
      return "◐";
    case "treasure":
      return "$";
    case "antimagic":
      return "∅";
    case "water":
      return "≈";
    case "npc":
      return "&";
    default:
      return "?";
  }
}

/**
 * Perspective-correct floor + ceiling casting, merged into a single
 * ImageData buffer and uploaded with one putImageData call.
 *
 * Previously this was two separate functions each calling putImageData once
 * per screen row (~650 calls/frame). Building one full-screen buffer and
 * uploading once eliminates the per-row allocation and GPU upload overhead.
 *
 * Floor rows are below the horizon (y > h/2), ceiling rows are above (y < h/2).
 * The horizon row itself is filled with the background color. Rows beyond
 * maxDist are also filled with background, since the raycaster leaves them
 * empty and the walls (drawn after) will occlude most of them anyway.
 */
/** Fill the upper half of an ImageData with the Camp's star-sky ceiling texture
 * drawn as a screen-space sky backdrop. Falls back to a procedural gradient if
 * the ceiling art is not (yet) loaded. */
function fillCampSky(
  buf: ImageData,
  w: number,
  h: number,
  img: HTMLImageElement | null,
  heading: number
): void {
  if (
    img &&
    (img as HTMLImageElement).width > 0 &&
    typeof document !== "undefined"
  ) {
    if (!campSkyScratchCanvas) {
      campSkyScratchCanvas = document.createElement("canvas");
      campSkyScratchCtx = campSkyScratchCanvas.getContext("2d");
    }
    if (campSkyScratchCtx) {
      if (campSkySourceImage !== img || !campSkySourceData) {
        campSkyScratchCanvas!.width = img.width;
        campSkyScratchCanvas!.height = img.height;
        campSkyScratchCtx!.imageSmoothingEnabled = false;
        campSkyScratchCtx!.drawImage(img, 0, 0);
        campSkySourceImage = img;
        campSkySourceData = campSkyScratchCtx!.getImageData(0, 0, img.width, img.height);
      }
      const src = campSkySourceData!;
      const span = Math.min(1, w / h);
      const offset = ((heading / (Math.PI * 2)) % 1 + 1) % 1;
      for (let y = 0; y < h; y++) {
        const sy = Math.min(src.height - 1, Math.floor((y / h) * src.height));
        for (let x = 0; x < w; x++) {
          const sx = Math.floor((((offset + (x / w - 0.5) * span) % 1 + 1) % 1) * src.width);
          const from = (sy * src.width + sx) * 4;
          const to = (y * w + x) * 4;
          buf.data[to] = src.data[from];
          buf.data[to + 1] = src.data[from + 1];
          buf.data[to + 2] = src.data[from + 2];
          buf.data[to + 3] = 255;
        }
      }
      return;
    }
  }

  // Procedural fallback (gradient + sparse stars) while the art loads.
  const u32 = new Uint32Array(buf.data.buffer);
  const topR = 12,
    topG = 14,
    topB = 28;
  const horR = 44,
    horG = 48,
    horB = 62;
  for (let y = 0; y < h; y++) {
    const t = h <= 1 ? 0 : y / (h - 1);
    const r = topR + Math.round((horR - topR) * t);
    const g = topG + Math.round((horG - topG) * t);
    const b = topB + Math.round((horB - topB) * t);
    const packed = (255 << 24) | (b << 16) | (g << 8) | r;
    const rowOff = y * w;
    for (let x = 0; x < w; x++) {
      u32[rowOff + x] = packed;
    }
  }

  // Sparse stars / tiny clusters — deterministic screen-space placement.
  let seed = 0xca7f00d;
  const starCount = 60;
  for (let i = 0; i < starCount; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const x = seed % w;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const y = seed % h;
    const sr = 210,
      sg = 212,
      sb = 216;
    u32[y * w + x] = (255 << 24) | (sb << 16) | (sg << 8) | sr;
    if (i % 7 === 0 && x + 1 < w) {
      u32[y * w + x + 1] = (255 << 24) | (sb << 16) | (sg << 8) | sr;
    }
  }
}

function drawFloorCeilingCast(
  ctx: CanvasRenderingContext2D,
  cam: RenderCamera,
  inDarkness: boolean,
  useSky: boolean,
  sky: HTMLImageElement | null,
  cellTextures: CellTextureGrid,
  primaryTextures: TextureSet,
  waterCells: boolean[][],
  waterFloorAData: ImageData | null,
  waterFloorBData: ImageData | null,
  bobY: number
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const { x: camX, y: camY, dirX, dirY, planeX, planeY } = cam;
  const maxDist = inDarkness
    ? RENDER_CONFIG.darknessMaxDist
    : RENDER_CONFIG.maxDepth * 2;

  // Reuse a single ImageData buffer across frames; only reallocate if the
  // canvas dimensions changed. This avoids ~2MB of per-frame GC pressure.
  if (!floorCeilBuf || floorCeilBufW !== w || floorCeilBufH !== h) {
    floorCeilBuf = ctx.createImageData(w, h);
    floorCeilBufW = w;
    floorCeilBufH = h;
    floorCeilCacheValid = false;
  }
  const buf = floorCeilBuf;

  // Skip the whole per-pixel cast when nothing that feeds it has changed
  // since last frame — the buffer already holds the correct pixels.
  if (
    floorCeilCacheValid &&
    camX === floorCeilCacheCamX &&
    camY === floorCeilCacheCamY &&
    dirX === floorCeilCacheDirX &&
    dirY === floorCeilCacheDirY &&
    planeX === floorCeilCachePlaneX &&
    planeY === floorCeilCachePlaneY &&
    bobY === floorCeilCacheBobY &&
    inDarkness === floorCeilCacheDarkness &&
    useSky === floorCeilCacheUseSky &&
    cellTextures === floorCeilCacheTextureGrid &&
    primaryTextures === floorCeilCachePrimaryTextures &&
    waterCells === floorCeilCacheWaterCells &&
    waterFloorAData === floorCeilCacheWaterAData &&
    waterFloorBData === floorCeilCacheWaterBData
  ) {
    ctx.putImageData(buf, 0, bobY);
    return;
  }

  const data = buf.data;
  const halfH = h / 2;
  const horizonY = Math.floor(halfH);

  // Pre-fill the entire buffer with bg color using a fast Uint32 fill.
  // The packed value is little-endian RGBA; this is correct on all common
  // platforms (x86, ARM). The fallback byte loop is kept for big-endian,
  // though such platforms are virtually nonexistent in browsers.
  const u32 = new Uint32Array(data.buffer);
  u32.fill(BG_RGBA_PACKED);

  // Blit the screen-space Camp sky into the upper half when active.
  if (useSky) {
    const heading = Math.atan2(cam.dirY, cam.dirX);
    if (!campSkyBuf || campSkyBufW !== w || campSkyBufH !== horizonY || campSkyBufImage !== sky || campSkyBufHeading !== heading) {
      campSkyBuf = ctx.createImageData(w, horizonY);
      campSkyBufW = w;
      campSkyBufH = horizonY;
      campSkyBufImage = sky;
      campSkyBufHeading = heading;
      fillCampSky(campSkyBuf, w, horizonY, sky, heading);
    }
    const skyU32 = new Uint32Array(campSkyBuf.data.buffer);
    u32.set(skyU32, 0);
  }

  // --- Ceiling rows (0 .. horizonY - 1) ---
  for (let y = 0; y < horizonY; y++) {
    if (useSky) continue;
    const rowDistance = halfH / (halfH - y);
    if (rowDistance > maxDist) continue;

    const stepX = rowDistance * ((planeX * 2) / w);
    const stepY = rowDistance * ((planeY * 2) / w);
    let worldX = camX + 0.5 + rowDistance * (dirX - planeX);
    let worldY = camY + 0.5 + rowDistance * (dirY - planeY);
    const fog = opacityForDepth(rowDistance);
    const rowOffset = y * w * 4;

    for (let x = 0; x < w; x++) {
      const gx = worldX | 0;
      const gy = worldY | 0;
      const textures = cellTextures[gy]?.[gx] ?? primaryTextures;
      const ceilImg = textures.ceilingData ?? primaryTextures.ceilingData;
      if (ceilImg) {
        const texWidth = ceilImg.width;
        const texHeight = ceilImg.height;
        const texX = ((worldX - gx) * texWidth | 0) % texWidth;
        const texY = ((worldY - gy) * texHeight | 0) % texHeight;
        const srcIdx = (texY * texWidth + texX) * 4;
        const dstIdx = rowOffset + x * 4;
        // Fog: lerp toward bg color instead of fading to black.
        const inv = 1 - fog;
        data[dstIdx] = Math.min(255, ceilImg.data[srcIdx] * fog + BG_R * inv);
        data[dstIdx + 1] = Math.min(255, ceilImg.data[srcIdx + 1] * fog + BG_G * inv);
        data[dstIdx + 2] = Math.min(255, ceilImg.data[srcIdx + 2] * fog + BG_B * inv);
        // alpha already 255 from pre-fill
      }

      worldX += stepX;
      worldY += stepY;
    }
  }

  // --- Floor rows (horizonY + 1 .. h - 1) ---
  for (let y = horizonY + 1; y < h; y++) {
    const rowDistance = halfH / (y - halfH);
    if (rowDistance > maxDist) continue;

    const stepX = rowDistance * ((planeX * 2) / w);
    const stepY = rowDistance * ((planeY * 2) / w);
    let worldX = camX + 0.5 + rowDistance * (dirX - planeX);
    let worldY = camY + 0.5 + rowDistance * (dirY - planeY);
    const fog = opacityForDepth(rowDistance);
    const rowOffset = y * w * 4;

    for (let x = 0; x < w; x++) {
      const gx = worldX | 0;
      const gy = worldY | 0;
      const textures = cellTextures[gy]?.[gx] ?? primaryTextures;
      const isFloorA = (gx + gy) % 2 === 0;
      const isWater = waterCells[gy]?.[gx] ?? false;
      let tex: ImageData | null = null;
      if (isWater) {
        tex = isFloorA ? waterFloorAData : waterFloorBData;
      }
      if (!tex) {
        tex = isFloorA
          ? textures.floorAData ?? primaryTextures.floorAData
          : textures.floorBData ?? primaryTextures.floorBData;
      }
      if (tex) {
        const texWidth = tex.width;
        const texHeight = tex.height;
        const texX = ((worldX - gx) * texWidth | 0) % texWidth;
        const texY = ((worldY - gy) * texHeight | 0) % texHeight;
        const srcIdx = (texY * texWidth + texX) * 4;
        const dstIdx = rowOffset + x * 4;
        // Fog: lerp toward bg color instead of fading to black.
        const inv = 1 - fog;
        data[dstIdx] = Math.min(255, tex.data[srcIdx] * fog + BG_R * inv);
        data[dstIdx + 1] = Math.min(255, tex.data[srcIdx + 1] * fog + BG_G * inv);
        data[dstIdx + 2] = Math.min(255, tex.data[srcIdx + 2] * fog + BG_B * inv);
        // alpha already 255 from pre-fill
      }
      worldX += stepX;
      worldY += stepY;
    }
  }

  floorCeilCacheValid = true;
  floorCeilCacheCamX = camX;
  floorCeilCacheCamY = camY;
  floorCeilCacheDirX = dirX;
  floorCeilCacheDirY = dirY;
  floorCeilCachePlaneX = planeX;
  floorCeilCachePlaneY = planeY;
  floorCeilCacheBobY = bobY;
  floorCeilCacheDarkness = inDarkness;
  floorCeilCacheUseSky = useSky;
  floorCeilCacheTextureGrid = cellTextures;
  floorCeilCachePrimaryTextures = primaryTextures;
  floorCeilCacheWaterCells = waterCells;
  floorCeilCacheWaterAData = waterFloorAData;
  floorCeilCacheWaterBData = waterFloorBData;

  ctx.putImageData(buf, 0, bobY);
}

/** Return the loaded tileset for a theme id, or null if none is cached. */
export function getTilesetForTheme(theme: string): LoadedTileset | null {
  return tilesetCache.get(theme) ?? tilesetCache.get(FALLBACK_THEME) ?? null;
}

/** @deprecated Prefer getTilesetForTheme / floor.tilesetTheme. */
export function getTilesetForFloor(floorId: number): LoadedTileset | null {
  return getTilesetForTheme(resolveTilesetTheme({ id: floorId }));
}

export function render(ctx: CanvasRenderingContext2D, state: GameState): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // Disable bilinear smoothing on the main context so wall strips drawn via
  // drawImage stay crisp pixel-art instead of blurring/softening. Smoothing
  // is a persistent context property, so setting it once here (rather than
  // per drawImage call) is sufficient.
  ctx.imageSmoothingEnabled = false;

  // Compute the interpolated render camera (smooth movement).
  const cam = updateRenderCamera(state);

  // Head bob: a subtle screen-space vertical offset synced to the movement
  // animation. Rounded to integer pixels because putImageData requires integer
  // coordinates, and the world-space draw passes use the same rounded offset
  // so walls/features stay aligned with the floor/ceiling image.
  const bobY = Math.round(
    cameraAnim.getMoveBob(performance.now(), RENDER_CONFIG.headBobAmplitude)
  );

  // Background
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, w, h);

  // Ensure every regional theme is loading once; cache hits make this cheap.
  for (const theme of tilesetThemesForFloor(state.floor)) {
    if (!tilesetCache.has(theme)) void ensureThemeLoaded(theme);
  }
  const resolvedTextures = resolveFloorTextures(state.floor);
  const primaryTheme = resolvedTextures.primaryTheme;
  const primaryTileset = resolvedTextures.primaryTileset;
  const primaryTextures = primaryTileset?.set ?? null;

  // Screen-space sky is used only in the Camp tileset, where the walls
  // themselves become the horizon. Darkness zones intentionally keep the
  // normal fogged ceiling so the sky doesn't read through a dark cave.
  const activeTheme = themeAt(state.floor, state.player.x, state.player.y);
  const useSky = activeTheme === "camp" && !state.inDarkness;
  const campSky = useSky ? tilesetCache.get("camp")?.sky ?? null : null;

  // --- Ceiling and floor casting (single batched upload) ---
  if (primaryTextures) {
    drawFloorCeilingCast(
      ctx,
      cam,
      state.inDarkness,
      useSky,
      campSky,
      resolvedTextures.cellTextures,
      primaryTextures,
      resolvedTextures.waterCells,
      resolvedTextures.waterFloorAData,
      resolvedTextures.waterFloorBData,
      bobY
    );
  }

  // --- World-space drawing pass (walls, edge glow, floor feature) ---
  // All world elements share the same head-bob offset so they remain aligned
  // with the shifted floor/ceiling image. Post-processing overlays (vignette,
  // scanlines) are drawn after the restore and stay fixed to the screen.
  ctx.save();
  ctx.translate(0, bobY);

  // --- Raycast wall strip pass ---
  const { dirX, dirY, planeX, planeY } = cam;
  const maxDist = state.inDarkness
    ? RENDER_CONFIG.darknessMaxDist
    : RENDER_CONFIG.maxDepth * 2;

  const stripWidth = RENDER_CONFIG.raycastStripWidth;
  const hitCount = Math.ceil(w / stripWidth);
  // Reuse the hits buffer across frames; only reallocate if the canvas grew.
  if (hitsBuffer.length < hitCount) {
    hitsBuffer = new Array(hitCount).fill(null);
  } else {
    hitsBuffer.fill(null, 0, hitCount);
  }
  const hits = hitsBuffer;

  ctx.save();
  for (let i = 0; i < hits.length; i++) {
    const x = i * stripWidth;
    const cameraX = (2 * x) / w - 1;
    const rayDirX = dirX + planeX * cameraX;
    const rayDirY = dirY + planeY * cameraX;

    const hit = castRay(state.floor.grid, cam.x + 0.5, cam.y + 0.5, rayDirX, rayDirY, maxDist);
    hits[i] = hit;
    if (!hit) continue;

    const lineHeight = computeLineHeight(h, hit.perpWallDist);
    const drawStart = Math.max(0, Math.floor(-lineHeight / 2 + h / 2));
    const drawEnd = Math.min(h - 1, Math.floor(lineHeight / 2 + h / 2));

    const fog = opacityForDepth(hit.perpWallDist);
    const wallTheme = themeForWallHit(
      state.floor,
      hit.mapX,
      hit.mapY,
      hit.side,
      rayDirX,
      rayDirY
    );
    const wallTileset = tilesetCache.get(wallTheme) ?? primaryTileset;
    const repeatedWall = wallTileset?.repeatedWall ?? null;

    if (repeatedWall) {
      let texX = Math.floor(hit.wallX * repeatedWall.width);
      if (
        (hit.side === "x" && rayDirX > 0) ||
        (hit.side === "y" && rayDirY < 0)
      ) {
        texX = repeatedWall.width - texX - 1;
      }

      ctx.globalAlpha = fog;
      ctx.drawImage(
        repeatedWall,
        texX,
        0,
        1,
        repeatedWall.height,
        x,
        drawStart,
        stripWidth,
        drawEnd - drawStart + 1
      );
      ctx.globalAlpha = 1.0;
    } else {
      ctx.fillStyle = rgba(
        PALETTE.wallFill,
        fog * RENDER_CONFIG.fillOpacityMultiplier
      );
      ctx.fillRect(
        x,
        drawStart,
        stripWidth,
        drawEnd - drawStart + 1
      );
    }

    // Wall-feature decal pass: small switches/plaques/reliefs composited onto
    // one specific wall face (see data/wall-features.ts). Plain "wall" edges
    // only — door/locked edges already carry their own dedicated art below,
    // and this needs the plain wall texture underneath to composite over.
    if (hit.edge === "wall" && state.floor.wallFeatures?.length) {
      const face = wallFeatureCellForHit(hit.mapX, hit.mapY, hit.side, rayDirX, rayDirY);
      const featureDef = state.floor.wallFeatures.find(
        (f) => f.x === face.x && f.y === face.y && f.dir === face.dir
      );
      if (featureDef) {
        const sprite = getWallFeatureDef(featureDef.spriteId);
        const img = getWallFeatureImage(featureDef.spriteId);
        if (sprite && img) {
          const stableX = stableWallX(hit.wallX, hit.side, rayDirX, rayDirY);
          const u = wallFeatureLocalU(stableX, sprite.widthFrac);
          if (u !== null) {
            const [top, bottom] = wallFeatureVerticalRect(
              drawStart,
              drawEnd,
              sprite.heightFrac,
              sprite.anchor
            );
            const texX = Math.min(img.width - 1, Math.floor(u * img.width));
            ctx.globalAlpha = fog;
            ctx.drawImage(
              img,
              texX,
              0,
              1,
              img.height,
              x,
              Math.floor(top),
              stripWidth,
              Math.max(1, Math.ceil(bottom) - Math.floor(top))
            );
            ctx.globalAlpha = 1.0;
          }
        }
      }
    }

    if (hit.edge === "door" || hit.edge === "locked" || hit.edge === "barred") {
      const isLocked = hit.edge === "locked";
      const isBarred = hit.edge === "barred";
      const fogDoor = opacityForDepth(hit.perpWallDist);
      // Stairs exits reach this branch via raycastEdgeStop's open->door
      // coercion (isStairExitFeature). Prefer the theme's architectural
      // stairs panel there; every other door/locked face — and any theme
      // with no stairs.png yet — keeps the ordinary door texture.
      const farTile = state.floor.grid[hit.mapY]?.[hit.mapX]?.tile;
      // Hero-door override: a one-off full-face panel registered by
      // coordinate (see data/door-features.ts). Same face-resolution
      // helper as wallFeatures, since a door/locked/barred hit shares the
      // exact same near-cell geometry as a wall hit.
      const doorFace = wallFeatureCellForHit(hit.mapX, hit.mapY, hit.side, rayDirX, rayDirY);
      const doorFeatureDef = state.floor.doorFeatures?.find(
        (f) => f.x === doorFace.x && f.y === doorFace.y && f.dir === doorFace.dir
      );
      const doorFeatureImg = doorFeatureDef ? getDoorFeatureImage(doorFeatureDef.spriteId) : null;
      const themeDoor =
        doorFeatureImg ??
        (isStairExitFeature(farTile)
          ? stairsTextureForTheme(wallTheme, primaryTheme) ?? doorTextureForTheme(wallTheme, primaryTheme)
          : doorTextureForTheme(wallTheme, primaryTheme));

      if (themeDoor && (doorFeatureImg || !isBarred)) {
        // Sample the door panel the same way as wall strips.
        let texX = Math.floor(hit.wallX * themeDoor.width);
        if (
          (hit.side === "x" && rayDirX > 0) ||
          (hit.side === "y" && rayDirY < 0)
        ) {
          texX = themeDoor.width - texX - 1;
        }
        ctx.globalAlpha = fogDoor;
        ctx.drawImage(
          themeDoor,
          texX,
          0,
          1,
          themeDoor.height,
          x,
          drawStart,
          stripWidth,
          drawEnd - drawStart + 1
        );
        ctx.globalAlpha = 1.0;
      } else {
        // Procedural fallback until the texture loads (or if it failed).
        // Barred gates use a distinct dark fill with vertical bars.
        const markerColor = isLocked
          ? PALETTE.lockedMarker
          : isBarred
            ? "#8a7a6a"
            : PALETTE.doorMarker;
        const fillColor = isBarred ? { r: 58, g: 53, b: 48 } : PALETTE.doorFill;
        ctx.fillStyle = rgba(fillColor, fogDoor * 0.35);
        ctx.fillRect(x, drawStart, stripWidth, drawEnd - drawStart + 1);
        ctx.fillStyle = markerColor;
        ctx.globalAlpha = fogDoor;
        const markerX = Math.floor(x + stripWidth / 2);
        ctx.fillRect(markerX, drawStart, 1, drawEnd - drawStart + 1);
        const panelY1 = Math.floor(drawStart + (drawEnd - drawStart) * 0.33);
        const panelY2 = Math.floor(drawStart + (drawEnd - drawStart) * 0.67);
        ctx.fillRect(x, panelY1, stripWidth, 1);
        ctx.fillRect(x, panelY2, stripWidth, 1);
        ctx.globalAlpha = 1.0;
      }

      if (isLocked) {
        ctx.strokeStyle = PALETTE.lockedMarker;
        ctx.lineWidth = 1;
        const cx = x + stripWidth / 2;
        const cy = (drawStart + drawEnd) / 2;
        const markerSize = Math.max(2, lineHeight / 8);
        ctx.globalAlpha = fogDoor;
        ctx.beginPath();
        ctx.moveTo(cx - markerSize / 2, cy - markerSize / 2);
        ctx.lineTo(cx + markerSize / 2, cy + markerSize / 2);
        ctx.moveTo(cx + markerSize / 2, cy - markerSize / 2);
        ctx.lineTo(cx - markerSize / 2, cy + markerSize / 2);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }

      if (isBarred) {
        // Draw vertical bars across the gate to distinguish it from doors.
        ctx.strokeStyle = "#9a8a7a";
        ctx.lineWidth = Math.max(1, Math.floor(stripWidth / 3));
        ctx.globalAlpha = fogDoor;
        const barCount = 3;
        for (let i = 1; i <= barCount; i++) {
          const bx = x + (stripWidth * i) / (barCount + 1);
          ctx.beginPath();
          ctx.moveTo(bx, drawStart);
          ctx.lineTo(bx, drawEnd);
          ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
      }
    }
  }
  ctx.restore();

  // --- Amber edge-glow pass (batched) ---
  // Group hits by depth bucket so we can batch all lines at the same depth
  // into one Path2D + stroke call, avoiding per-strip shadowBlur state changes.
  // The glow is drawn as a 1px translucent amber line on the edge of each strip
  // that faces the camera. We use 4 depth buckets; within each bucket all lines
  // share the same stroke color and shadowBlur.
  const GLOW_BUCKETS = 4;
  const glowEdgePaths: Path2D[] = [];
  const glowWashPaths: Path2D[] = [];
  for (let b = 0; b < GLOW_BUCKETS; b++) {
    glowEdgePaths.push(new Path2D());
    glowWashPaths.push(new Path2D());
  }
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    if (!hit) continue;

    const x = i * stripWidth;
    const lineHeight = computeLineHeight(h, hit.perpWallDist);
    const drawStart = Math.max(0, Math.floor(-lineHeight / 2 + h / 2));
    const drawEnd = Math.min(h - 1, Math.floor(lineHeight / 2 + h / 2));

    // Draw the glow on the edge of the strip that faces the camera:
    // x-step hits (E/W-facing walls) use the left edge; y-step hits
    // (N/S-facing walls) use the right edge.
    const gx = hit.side === "x" ? x : x + stripWidth;

    // A strip is an "edge" when the wall geometry breaks against a neighbor
    // strip: a depth jump, a face-orientation change, or open sky beside it.
    // Edges keep the full glow line; flat-wall strips get the scaled wash so
    // the wall texture stays readable underneath.
    const prev = i > 0 ? hits[i - 1] : null;
    const next = i < hits.length - 1 ? hits[i + 1] : null;
    const isEdge =
      !prev ||
      !next ||
      prev.side !== hit.side ||
      next.side !== hit.side ||
      Math.abs(prev.perpWallDist - hit.perpWallDist) > RENDER_CONFIG.glowEdgeDepthDelta ||
      Math.abs(next.perpWallDist - hit.perpWallDist) > RENDER_CONFIG.glowEdgeDepthDelta;

    const bucket = glowBucketForDepth(hit.perpWallDist, GLOW_BUCKETS);
    const path = isEdge ? glowEdgePaths[bucket] : glowWashPaths[bucket];
    path.moveTo(gx, drawStart);
    path.lineTo(gx, drawEnd);
  }
  ctx.save();
  ctx.lineWidth = 1;
  ctx.shadowColor = PALETTE.amber;
  for (let b = 0; b < GLOW_BUCKETS; b++) {
    const depth = b + 0.5; // bucket center
    ctx.strokeStyle = strokeColorForDepth(depth);
    ctx.shadowBlur = glowBlurForDepth(depth);
    ctx.stroke(glowEdgePaths[b]);
    ctx.globalAlpha = RENDER_CONFIG.glowWashAlphaScale;
    ctx.stroke(glowWashPaths[b]);
    ctx.globalAlpha = 1.0;
  }
  ctx.restore();

  // Draw tile feature at the player's feet (depth 0). Stairs render as door
  // panels on approach, not as floor glyphs underfoot.
  const currentCell = state.floor.grid[state.player.y]?.[state.player.x];
  if (currentCell?.tile && !isStairExitFeature(currentCell.tile)) {
    drawFloorFeature(ctx, w, h, currentCell.tile, state.inDarkness);
  }

  // Ceiling sprites, decor sprites, and feature billboards (after walls so
  // the Z-test can use the hit buffer). Ceiling sprites draw first — they
  // hang up and out of the way of gameplay-relevant floor content. Features
  // draw last so a chest is never hidden behind a decorative crate sharing
  // its tile.
  drawCeilingSprites(ctx, state, cam, hits, stripWidth, maxDist, state.inDarkness);
  drawMapSprites(ctx, state, cam, hits, stripWidth, state.inDarkness);
  drawFeatureBillboards(ctx, state, cam, hits, stripWidth, maxDist, state.inDarkness);

  // Restore from the head-bob translate before drawing screen-space overlays.
  ctx.restore();

  if (useSky) {
    ctx.save();
    ctx.fillStyle = "rgba(29, 43, 79, 0.10)";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // --- Torch flicker overlay ---
  // A subtle warm overlay that breathes with a slow sine wave, adding life to
  // the corridor. Runs AFTER the world pass so it falls on the walls, sprites
  // and feature glyphs the party is standing next to; drawn before it, near
  // walls occluded the very light they should have caught. Suppressed in
  // darkness zones (where vision is limited by design).
  if (!state.inDarkness) {
    drawTorchFlicker(ctx, w, h);
  }

  // Global vignette: focuses attention on the corridor and softens edges.
  drawVignette(ctx, w, h, 1.0);

  // Subtle CRT scanline texture.
  drawScanlines(ctx, w, h);

  // Extra darkness vignette when in a darkness zone (design doc §6.2).
  if (state.inDarkness) {
    drawVignette(ctx, w, h, 1.35);
  }
}

/** Darken the corners/edges with a radial gradient overlay. */
function drawVignette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  strength: number = 1.0
): void {
  const isNormal = strength === 1.0;
  const isDarkness = strength === 1.35;
  if (w !== lastVignetteW || h !== lastVignetteH) {
    cachedVignetteGradient = null;
    cachedDarknessVignetteGradient = null;
    lastVignetteW = w;
    lastVignetteH = h;
  }
  let grad: CanvasGradient | null = null;
  if (isNormal) grad = cachedVignetteGradient;
  else if (isDarkness) grad = cachedDarknessVignetteGradient;

  if (!grad) {
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.max(w, h) / 2;
    grad = ctx.createRadialGradient(cx, cy, radius * 0.25, cx, cy, radius);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.55, `rgba(0,0,0,${0.28 * strength})`);
    grad.addColorStop(1, `rgba(0,0,0,${0.65 * strength})`);
    if (isNormal) cachedVignetteGradient = grad;
    else if (isDarkness) cachedDarknessVignetteGradient = grad;
  }
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * Subtle torch flicker: a warm amber overlay whose intensity oscillates with
 * a slow sine wave (~2s period). The amplitude is small (±4%) so it adds life
 * without distracting.
 *
 * The overlay is brightest at the frame EDGES and transparent in the centre,
 * which is the opposite of what it looks like it should be until you notice
 * that the centre of a corridor view is its vanishing point. A light the party
 * carries has to fall on the surfaces nearest them — the side walls and the
 * floor at their feet, all of which live at the edges of the frame — and must
 * NOT reach the far end. The previous centre-weighted version did exactly the
 * wrong thing, and because the far end is also the darkest part of the image
 * it was the only place the flicker was visible at all.
 *
 * Drawn after the wall pass for the same reason: underneath it, near walls
 * (nearly opaque) blocked the light they were supposed to receive while
 * distant walls (translucent under fog) let it through.
 */
function drawTorchFlicker(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): void {
  const now = performance.now();
  const phase = (now / RENDER_CONFIG.torchFlickerPeriod) * Math.PI * 2;
  const sine = Math.sin(phase);
  const noise = Math.sin(phase * 2.7) * 0.3;
  const alpha =
    (RENDER_CONFIG.torchFlickerBase +
      RENDER_CONFIG.torchFlickerAmplitude * (sine * 0.7 + noise * 0.3)) *
    RENDER_CONFIG.torchFlickerEdgeScale;
  if (alpha <= 0) return;

  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.max(w, h) / 2;
  const grad = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
  grad.addColorStop(0, "rgba(224,164,88,0)");
  grad.addColorStop(
    RENDER_CONFIG.torchFlickerMidStop,
    `rgba(224,164,88,${alpha * RENDER_CONFIG.torchFlickerMidAlpha})`
  );
  grad.addColorStop(1, `rgba(224,164,88,${alpha})`);
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Cached scanline pattern canvas. Created once and reused via createPattern. */
let scanlinePatternCanvas: HTMLCanvasElement | null = null;
let scanlinePattern: CanvasPattern | null = null;

/** Subtle horizontal scanline texture across the whole viewport.
 *  Uses a cached repeating pattern instead of per-line fillRect calls. */
function drawScanlines(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): void {
  if (!scanlinePatternCanvas) {
    scanlinePatternCanvas = document.createElement("canvas");
    scanlinePatternCanvas.width = 1;
    scanlinePatternCanvas.height = RENDER_CONFIG.scanlineSpacing;
    const sctx = scanlinePatternCanvas.getContext("2d")!;
    sctx.fillStyle = `rgba(0,0,0,${RENDER_CONFIG.scanlineOpacity})`;
    sctx.fillRect(0, 0, 1, 1);
  }
  if (!scanlinePattern) {
    scanlinePattern = ctx.createPattern(scanlinePatternCanvas, "repeat");
  }
  if (scanlinePattern) {
    ctx.save();
    ctx.fillStyle = scanlinePattern;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

/**
 * Bake a static corridor view into an offscreen canvas for use as a combat
 * backdrop. Renders the current floor's tileset from the player's position and
 * facing, producing a perspective dungeon scene that matches the live corridor
 * renderer. The result is a frozen frame (no torch flicker animation, no head
 * bob) suitable as a static combat background.
 *
 * The corridor renderer places the horizon (floor/ceiling boundary) at 50% of
 * the canvas height. Combat sprite positions were tuned for a floor plane at
 * ~21.4% (h*0.214) of the canvas, matching the old static combat-bg.png. To
 * preserve those positions, the backdrop is rendered at 2× height and the top
 * portion is cropped so the horizon lands at the same y-coordinate the sprites
 * expect. This shows more floor and less ceiling — the enclosed-room look from
 * the mockup.
 *
 * After baking, the scanline pattern cache is invalidated so the next live
 * render recreates it on the main context (CanvasPattern objects can be tied
 * to the context that created them).
 */
export function renderCorridorBackdrop(
  state: GameState,
  w: number,
  h: number
): HTMLCanvasElement {
  // Render at 2× height so we can crop the ceiling and shift the horizon up.
  const renderH = h * 2;
  const off = document.createElement("canvas");
  off.width = w;
  off.height = renderH;
  const offCtx = off.getContext("2d")!;

  // Snap the camera to the player's current grid position so the render is
  // static (no interpolation tween, no head bob). The dungeon render loop is
  // not running during combat, so mutating the shared camera anim is safe —
  // it will be re-synced when dungeon mode resumes.
  resetRenderCamera(state.player.x, state.player.y, state.player.facing);

  render(offCtx, state);

  // Invalidate the scanline pattern cache so the next live dungeon render
  // recreates it on the main corridor context rather than reusing one bound
  // to this offscreen context.
  scanlinePattern = null;

  // Crop: the horizon is at renderH/2. We want it at h*0.214 in the output.
  // Crop from y = renderH/2 - h*0.214, taking h pixels.
  const FLOOR_PLANE_FRAC = 0.214;
  const cropStart = Math.floor(renderH / 2 - h * FLOOR_PLANE_FRAC);
  const result = document.createElement("canvas");
  result.width = w;
  result.height = h;
  const resultCtx = result.getContext("2d")!;
  resultCtx.imageSmoothingEnabled = false;
  resultCtx.drawImage(off, 0, cropStart, w, h, 0, 0, w, h);

  return result;
}

/**
 * Bake a 3/4 top-down arena room into an offscreen canvas for use as a combat
 * backdrop. Uses the dedicated arena renderer so the corridor raycaster is not
 * involved and no scanline-pattern invalidation is needed.
 */
export function renderBattleArena(
  state: GameState,
  w: number,
  h: number
): HTMLCanvasElement {
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const ctx = off.getContext("2d")!;

  const theme = resolveTilesetTheme(state.floor);
  const tileset = getTilesetForTheme(theme);
  if (tileset) {
    renderArenaRoom(ctx, w, h, {
      tileset,
      voidColor: PALETTE.bg,
      floorPuddles: theme === "f1",
    });
  } else {
    // Fallback when no tileset is loaded (debug floors).
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, w, h);
  }

  return off;
}
