import type { FloorDef } from "../../../data/floors";
import type { GameState } from "../../../types";
import { loadTextures, render } from "../../renderer";
import type { MazeRenderer, MazeRendererSize } from "../types";
import { loadEnvironmentalSprites } from "../../environmental-sprite-cache";
import { loadArchitecturalProps } from "../../architectural-prop-cache";

/** Adapter around the retained CPU raycaster during Renderer 2 migration. */
export class CanvasMazeRenderer implements MazeRenderer {
  readonly backend = "canvas" as const;

  constructor(private readonly context: CanvasRenderingContext2D) {}

  init(): Promise<void> {
    return Promise.all([loadTextures(), loadEnvironmentalSprites()]).then(() => undefined);
  }

  async loadFloor(floor: FloorDef): Promise<void> {
    if (floor.ramps?.length) {
      console.warn(
        "[maze-renderer] Local ramps/stairs require WebGL; Canvas fallback renders legacy flat presentation only"
      );
    }
    await loadArchitecturalProps(floor.architecturalProps ?? []);
  }

  render(state: GameState): void {
    render(this.context, state);
  }

  resize(_size: MazeRendererSize): void {}

  disposeFloor(): void {}

  dispose(): void {}
}
