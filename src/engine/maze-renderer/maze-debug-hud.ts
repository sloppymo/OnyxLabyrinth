import { mazeRenderProfiler } from "./performance";
import type { MazeRenderer } from "./types";

function percentile(values: readonly number[], quantile: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))];
}

/** Small opt-in HUD enabled by `?mazePerf=1`; never created in normal play. */
export class MazeRendererDebugHud {
  private readonly element: HTMLPreElement | null;
  private lastUpdate = 0;

  constructor() {
    if (new URLSearchParams(window.location.search).get("mazePerf") !== "1") {
      this.element = null;
      return;
    }
    const element = document.createElement("pre");
    element.id = "maze-renderer-debug-hud";
    Object.assign(element.style, {
      position: "fixed",
      right: "8px",
      top: "8px",
      zIndex: "9999",
      margin: "0",
      padding: "6px 8px",
      color: "#f6d97a",
      background: "rgba(8, 7, 5, 0.84)",
      border: "1px solid #9a7435",
      font: "11px/1.35 monospace",
      pointerEvents: "none",
      whiteSpace: "pre",
    });
    document.body.appendChild(element);
    this.element = element;
  }

  update(renderer: MazeRenderer, now = performance.now()): void {
    if (!this.element || now - this.lastUpdate < 250) return;
    this.lastUpdate = now;
    const samples = mazeRenderProfiler.snapshot().samples.slice(-120);
    const frameMs = samples.map((sample) => sample.totalMs);
    const elapsed = samples.length > 1 ? samples.at(-1)!.at - samples[0].at : 0;
    const fps = elapsed > 0 ? ((samples.length - 1) * 1000) / elapsed : 0;
    const stats = renderer.getStatistics?.();
    this.element.textContent = [
      `Maze ${renderer.backend.toUpperCase()}`,
      `FPS ${fps.toFixed(1)}  CPU ${percentile(frameMs, 0.5).toFixed(2)}ms p95 ${percentile(frameMs, 0.95).toFixed(2)}`,
      `draw ${stats?.drawCalls ?? "—"}  tri ${stats?.triangles ?? "—"}`,
      `tex ${stats?.textures ?? "—"}  geo ${stats?.geometries ?? "—"}`,
      `chunks ${stats?.staticChunks ?? "—"}  batches ${stats?.staticBatches ?? "—"}`,
      `sprites ${stats?.visibleDynamicSprites ?? "—"}`,
    ].join("\n");
  }

  dispose(): void {
    this.element?.remove();
  }
}
