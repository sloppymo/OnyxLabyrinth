import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  FogExp2,
  Group,
  Mesh,
  PerspectiveCamera,
  Scene,
  Uint32BufferAttribute,
  Vector3,
  WebGLRenderer,
} from "three";
import type { FloorDef } from "../../../data/floors";
import type { GameState } from "../../../types";
import { tilesetThemesForFloor } from "../../../game/floor-map";
import {
  ensureThemeLoaded,
  loadCeilingFeatures,
  getRenderCameraForState,
  getRenderCameraMoveBob,
  loadTextures,
} from "../../renderer";
import { loadDoorFeatures } from "../../door-feature-cache";
import { MATH_CONFIG } from "../../render-math";
import { LEGACY_VERTICAL_UNIT, resolveCellVolume } from "../geometry/cell-volume";
import {
  floorSurfaceZAtDisplayPosition,
  resolveFloorSurface,
} from "../geometry/floor-surface";
import { landingAt, resolvePlayerZ } from "../../../game/traversal";
import { mazeRenderProfiler } from "../performance";
import type {
  MazeRenderer,
  MazeRendererSize,
  MazeRendererStatistics,
} from "../types";
import { compileMazeGeometry } from "./maze-geometry-compiler";
import { MazeMaterialLibrary } from "./maze-materials";
import { MazeVisualCollection, preloadMazeVisuals } from "./maze-visuals";

const HORIZONTAL_FOV_DEGREES = 60;
const BACKGROUND_COLOR = 0x0e0d0a;

export function verticalFovForHorizontal(
  horizontalFovDegrees: number,
  aspect: number
): number {
  const horizontal = (horizontalFovDegrees * Math.PI) / 180;
  return (2 * Math.atan(Math.tan(horizontal / 2) / aspect) * 180) / Math.PI;
}

export function webglHeadBobWorld(
  bobPixels: number,
  viewportHeight: number
): number {
  return (
    (bobPixels * LEGACY_VERTICAL_UNIT) /
    (Math.max(1, viewportHeight) * MATH_CONFIG.projectionScale * MATH_CONFIG.heightFlatten)
  );
}

/**
 * Eye Z for the render camera. On an authored landing, the settled Z snaps
 * immediately (landings are discrete platforms, not surfaces to climb across
 * mid-animation). Otherwise sample the physical surface at the smoothly
 * interpolated display position, so ramps/stairs climb continuously as the
 * camera tweens across the cell instead of popping when the step commits.
 */
function resolveRenderEyeZ(
  state: GameState,
  settledZ: number,
  displayX: number,
  displayY: number
): number {
  if (landingAt(state.floor, state.player.x, state.player.y, settledZ)) {
    return settledZ;
  }
  return floorSurfaceZAtDisplayPosition(state.floor, displayX, displayY);
}

/** Authoritative WebGL camera eye height for the current player position. */
export function webglMazeEyeY(
  state: GameState,
  viewportHeight: number,
  bobPixels: number,
  settledZ: number,
  displayX: number,
  displayY: number
): number {
  const eyeZ = resolveRenderEyeZ(state, settledZ, displayX, displayY);
  return (
    eyeZ * LEGACY_VERTICAL_UNIT +
    LEGACY_VERTICAL_UNIT / 2 +
    webglHeadBobWorld(bobPixels, viewportHeight)
  );
}

/** Three.js/WebGL2 graphics backend. GameState remains authoritative. */
export class WebGLMazeRenderer implements MazeRenderer {
  readonly backend = "webgl" as const;

  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(60, 1, 0.025, 64);
  private readonly cameraTarget = new Vector3();
  private readonly floorGroup = new Group();
  private readonly floorGeometries: BufferGeometry[] = [];
  private readonly materials = new MazeMaterialLibrary();
  private readonly visuals = new MazeVisualCollection(this.materials);
  private renderer: WebGLRenderer | null = null;
  private width = 1;
  private height = 1;
  private contextLost = false;
  private initialized = false;
  private floorLoadGeneration = 0;
  private geometryStats = { chunks: 0, batches: 0, vertices: 0, triangles: 0 };
  private debugPosition: MazeRendererStatistics["debugPosition"];

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    console.warn("[maze-renderer] WebGL context lost; rendering is paused");
  };

  private readonly onContextRestored = (): void => {
    this.contextLost = false;
    console.info("[maze-renderer] WebGL context restored");
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.scene.background = new Color(BACKGROUND_COLOR);
    this.scene.fog = new FogExp2(BACKGROUND_COLOR, 0.22);
    this.scene.add(this.floorGroup);
    this.scene.add(this.visuals.wallFeatures);
    this.scene.add(this.visuals.billboards);
  }

  init(): void {
    if (this.initialized) return;
    const context = this.canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: true,
      stencil: false,
      desynchronized: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    if (!context) throw new Error("WebGL2 is unavailable");

    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      context,
      antialias: false,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(BACKGROUND_COLOR, 1);
    this.renderer.sortObjects = true;
    this.canvas.addEventListener("webglcontextlost", this.onContextLost);
    this.canvas.addEventListener("webglcontextrestored", this.onContextRestored);
    this.initialized = true;
    this.resize({ width: this.canvas.width, height: this.canvas.height });
  }

  async loadFloor(floor: FloorDef): Promise<void> {
    const generation = ++this.floorLoadGeneration;
    await Promise.all([
      loadTextures(),
      loadDoorFeatures(),
      loadCeilingFeatures(),
      preloadMazeVisuals(),
    ]);
    await Promise.all(
      tilesetThemesForFloor(floor).map((theme) => ensureThemeLoaded(theme))
    );
    if (generation !== this.floorLoadGeneration) return;

    this.clearFloorGeometry();
    const compiled = compileMazeGeometry(floor);
    this.geometryStats = compiled.stats;
    for (const batch of compiled.batches) {
      if (!batch.indices.length) continue;
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(batch.positions, 3));
      geometry.setAttribute("normal", new Float32BufferAttribute(batch.normals, 3));
      geometry.setAttribute("uv", new Float32BufferAttribute(batch.uvs, 2));
      geometry.setIndex(new Uint32BufferAttribute(batch.indices, 1));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, this.materials.get(batch.materialKey));
      mesh.name = `${batch.chunkX},${batch.chunkY}:${batch.kind}:${batch.materialKey}`;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.floorGeometries.push(geometry);
      this.floorGroup.add(mesh);
    }
    this.visuals.loadFloor(floor);
  }

  render(state: GameState): void {
    if (!this.renderer || this.contextLost) return;
    mazeRenderProfiler.beginFrame("webgl");
    const cameraStartedAt = mazeRenderProfiler.beginSection();
    const display = getRenderCameraForState(state);
    const surfaceZ = resolvePlayerZ(state.player, state.floor);
    const eyeY = webglMazeEyeY(
      state,
      this.height,
      getRenderCameraMoveBob(),
      surfaceZ,
      display.x,
      display.y
    );
    const playerSurface = resolveFloorSurface(
      state.floor,
      state.player.x,
      state.player.y
    );
    this.debugPosition = {
      cellX: state.player.x,
      cellY: state.player.y,
      surface: playerSurface.kind,
      surfaceZ,
      cameraY: eyeY,
      ceilingZ: resolveCellVolume(
        state.floor,
        state.player.x,
        state.player.y
      ).ceilingZ,
      ...(playerSurface.kind === "flat" ? {} : { rampDir: playerSurface.dir }),
    };
    this.camera.position.set(display.x + 0.5, eyeY, display.y + 0.5);
    this.cameraTarget.set(
      display.x + 0.5 + display.dirX,
      eyeY,
      display.y + 0.5 + display.dirY
    );
    this.camera.lookAt(this.cameraTarget);
    this.visuals.update(state.floor, this.camera);
    if (this.scene.fog instanceof FogExp2) {
      this.scene.fog.density = state.inDarkness ? 0.78 : 0.22;
    }
    mazeRenderProfiler.endSection("camera", cameraStartedAt);
    const submissionStartedAt = mazeRenderProfiler.beginSection();
    this.renderer.render(this.scene, this.camera);
    mazeRenderProfiler.endSection("walls", submissionStartedAt);
    mazeRenderProfiler.endFrame();
  }

  resize(size: MazeRendererSize): void {
    this.width = Math.max(1, Math.floor(size.width));
    this.height = Math.max(1, Math.floor(size.height));
    const aspect = this.width / this.height;
    this.camera.aspect = aspect;
    this.camera.fov = verticalFovForHorizontal(HORIZONTAL_FOV_DEGREES, aspect);
    this.camera.updateProjectionMatrix();
    this.renderer?.setSize(this.width, this.height, false);
  }

  getStatistics(): MazeRendererStatistics {
    const info = this.renderer?.info;
    return {
      drawCalls: info?.render.calls ?? 0,
      triangles: info?.render.triangles ?? this.geometryStats.triangles,
      textures: info?.memory.textures ?? 0,
      geometries: info?.memory.geometries ?? this.geometryStats.batches,
      visibleDynamicSprites: this.visuals.visibleBillboardCount(),
      staticChunks: this.geometryStats.chunks,
      staticBatches: this.geometryStats.batches,
      debugPosition: this.debugPosition,
    };
  }

  disposeFloor(): void {
    this.floorLoadGeneration += 1;
    this.clearFloorGeometry();
  }

  private clearFloorGeometry(): void {
    this.visuals.clear();
    this.floorGroup.clear();
    for (const geometry of this.floorGeometries) geometry.dispose();
    this.floorGeometries.length = 0;
    this.geometryStats = { chunks: 0, batches: 0, vertices: 0, triangles: 0 };
  }

  dispose(): void {
    this.disposeFloor();
    this.visuals.dispose();
    this.materials.dispose();
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    this.renderer?.dispose();
    this.renderer = null;
    this.initialized = false;
  }
}
