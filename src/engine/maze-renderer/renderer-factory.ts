import { CanvasMazeRenderer } from "./canvas/canvas-maze-renderer";
import type {
  MazeRendererBackendId,
  MazeRendererHost,
  MazeRendererSelection,
} from "./types";

export function requestedMazeRendererBackend(
  search: string,
  defaultBackend: MazeRendererBackendId = "webgl"
): MazeRendererBackendId {
  const requested = new URLSearchParams(search).get("mazeRenderer");
  return requested === "canvas" || requested === "webgl" ? requested : defaultBackend;
}

export async function createMazeRenderer(
  host: MazeRendererHost,
  search = typeof window === "undefined" ? "" : window.location.search
): Promise<MazeRendererSelection> {
  const requested = requestedMazeRendererBackend(search);
  let fallbackReason: string | null = null;

  if (requested === "webgl") {
    try {
      // Dynamic import keeps Three.js out of title/town-only startup and out
      // of the Canvas fallback chunk.
      const { WebGLMazeRenderer } = await import("./webgl/webgl-maze-renderer");
      const renderer = new WebGLMazeRenderer(host.webglCanvas);
      await renderer.init();
      renderer.resize({ width: host.webglCanvas.width, height: host.webglCanvas.height });
      return {
        renderer,
        requested,
        active: renderer.backend,
        fallbackReason: null,
      };
    } catch (error) {
      fallbackReason = error instanceof Error ? error.message : String(error);
      console.warn(
        `[maze-renderer] WebGL2 initialization failed (${fallbackReason}); using Canvas`
      );
    }
  }

  const renderer = new CanvasMazeRenderer(host.context);
  await renderer.init();
  renderer.resize({ width: host.canvas.width, height: host.canvas.height });
  return {
    renderer,
    requested,
    active: renderer.backend,
    fallbackReason,
  };
}
