export type MazeRendererBackend = "canvas" | "webgl";

export type MazeRenderSection =
  | "camera"
  | "floorCeilingCpu"
  | "putImageData"
  | "raycast"
  | "walls"
  | "billboards"
  | "postprocess";

export interface MazeRenderFrameSample {
  backend: MazeRendererBackend;
  at: number;
  totalMs: number;
  cameraMs: number;
  floorCeilingCpuMs: number;
  putImageDataMs: number;
  raycastMs: number;
  wallsMs: number;
  billboardsMs: number;
  postprocessMs: number;
}

export interface MazeRenderPerformanceSnapshot {
  enabled: boolean;
  capacity: number;
  droppedSamples: number;
  samples: MazeRenderFrameSample[];
}

const SAMPLE_CAPACITY = 2400;

function queryEnablesProfiling(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("mazePerf") === "1";
}

function blankSample(backend: MazeRendererBackend, at: number): MazeRenderFrameSample {
  return {
    backend,
    at,
    totalMs: 0,
    cameraMs: 0,
    floorCeilingCpuMs: 0,
    putImageDataMs: 0,
    raycastMs: 0,
    wallsMs: 0,
    billboardsMs: 0,
    postprocessMs: 0,
  };
}

/**
 * Opt-in maze-render timing probe.
 *
 * The profiler is deliberately dormant in ordinary play: section timers do
 * not call performance.now(), and no frame samples are allocated, until a QA
 * runner enables it through `?mazePerf=1` or the debug API. The small ring
 * buffer prevents a forgotten profiling tab from growing without bound.
 */
class MazeRenderProfiler {
  private enabled = queryEnablesProfiling();
  private frame: MazeRenderFrameSample | null = null;
  private frameStartedAt = 0;
  private samples: MazeRenderFrameSample[] = [];
  private droppedSamples = 0;

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.frame = null;
  }

  reset(): void {
    this.frame = null;
    this.samples.length = 0;
    this.droppedSamples = 0;
  }

  beginFrame(backend: MazeRendererBackend): void {
    if (!this.enabled) return;
    const at = performance.now();
    this.frameStartedAt = at;
    this.frame = blankSample(backend, at);
  }

  beginSection(): number {
    return this.enabled && this.frame ? performance.now() : 0;
  }

  endSection(section: MazeRenderSection, startedAt: number): void {
    if (!startedAt || !this.frame) return;
    this.frame[`${section}Ms`] += performance.now() - startedAt;
  }

  endFrame(): void {
    if (!this.frame) return;
    this.frame.totalMs = performance.now() - this.frameStartedAt;
    if (this.samples.length === SAMPLE_CAPACITY) {
      this.samples.shift();
      this.droppedSamples += 1;
    }
    this.samples.push(this.frame);
    this.frame = null;
  }

  snapshot(): MazeRenderPerformanceSnapshot {
    return {
      enabled: this.enabled,
      capacity: SAMPLE_CAPACITY,
      droppedSamples: this.droppedSamples,
      samples: this.samples.map((sample) => ({ ...sample })),
    };
  }
}

export const mazeRenderProfiler = new MazeRenderProfiler();
