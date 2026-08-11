import type { FloorDef } from "../../data/floors";
import type { GameState } from "../../types";

export type MazeRendererBackendId = "canvas" | "webgl";

export interface MazeRendererSize {
  width: number;
  height: number;
}

export interface MazeRendererStatistics {
  drawCalls: number;
  triangles: number;
  textures: number;
  geometries: number;
  visibleDynamicSprites: number;
  staticChunks: number;
  staticBatches: number;
  debugPosition?: {
    cellX: number;
    cellY: number;
    surface: "flat" | "ramp" | "stairs";
    surfaceZ: number;
    cameraY: number;
    ceilingZ: number;
    rampDir?: "n" | "e" | "s" | "w";
  };
}

/** Graphics-only boundary. Game state remains the authoritative world. */
export interface MazeRenderer {
  readonly backend: MazeRendererBackendId;
  init(): Promise<void> | void;
  loadFloor(floor: FloorDef): Promise<void> | void;
  render(state: GameState): void;
  resize(size: MazeRendererSize): void;
  disposeFloor(): void;
  dispose(): void;
  getStatistics?(): MazeRendererStatistics;
}

export interface MazeRendererHost {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  webglCanvas: HTMLCanvasElement;
}

export interface MazeRendererSelection {
  renderer: MazeRenderer;
  requested: MazeRendererBackendId;
  active: MazeRendererBackendId;
  fallbackReason: string | null;
}
