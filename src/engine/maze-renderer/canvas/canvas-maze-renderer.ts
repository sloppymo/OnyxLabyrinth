import type { FloorDef } from "../../../data/floors";
import type { GameState } from "../../../types";
import { loadTextures, render } from "../../renderer";
import type { MazeRenderer, MazeRendererSize } from "../types";

/** Adapter around the retained CPU raycaster during Renderer 2 migration. */
export class CanvasMazeRenderer implements MazeRenderer {
  readonly backend = "canvas" as const;

  constructor(private readonly context: CanvasRenderingContext2D) {}

  init(): Promise<void> {
    return loadTextures();
  }

  loadFloor(_floor: FloorDef): void {}

  render(state: GameState): void {
    render(this.context, state);
  }

  resize(_size: MazeRendererSize): void {}

  disposeFloor(): void {}

  dispose(): void {}
}
