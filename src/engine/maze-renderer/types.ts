import type { FloorDef } from "../../data/floors";
import type { GameState } from "../../types";

export type MazeRendererBackendId = "canvas" | "webgl";

export interface MazeRendererSize {
  width: number;
  height: number;
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
