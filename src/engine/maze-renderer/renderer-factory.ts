import { CanvasMazeRenderer } from "./canvas/canvas-maze-renderer";
import type {
  MazeRendererBackendId,
  MazeRendererHost,
  MazeRendererSelection,
} from "./types";

export function requestedMazeRendererBackend(
  search: string,
  defaultBackend: MazeRendererBackendId = "canvas"
): MazeRendererBackendId {
  const requested = new URLSearchParams(search).get("mazeRenderer");
  return requested === "canvas" || requested === "webgl" ? requested : defaultBackend;
}

/**
 * Select the maze graphics backend. The WebGL branch is intentionally added
 * in the next stable milestone; until then an explicit request proves the
 * fallback path without changing production rendering.
 */
export async function createMazeRenderer(
  host: MazeRendererHost,
  search = typeof window === "undefined" ? "" : window.location.search
): Promise<MazeRendererSelection> {
  const requested = requestedMazeRendererBackend(search);
  const renderer = new CanvasMazeRenderer(host.context);
  const fallbackReason =
    requested === "webgl" ? "WebGL maze backend is not installed yet" : null;
  if (fallbackReason) console.warn(`[maze-renderer] ${fallbackReason}; using Canvas`);
  await renderer.init();
  renderer.resize({ width: host.canvas.width, height: host.canvas.height });
  return {
    renderer,
    requested,
    active: renderer.backend,
    fallbackReason,
  };
}
