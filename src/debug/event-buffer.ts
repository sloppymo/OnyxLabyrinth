// Debug-only event ring buffer. Pure: no DOM, no engine imports, so it is
// unit-testable without a browser. main.ts constructs one behind the ?debug=1
// gate and feeds it from a handful of chokepoints; nothing here runs in
// normal play.
//
// Why a buffer at all: snapshot() answers "what is true now," but a playtest
// agent diagnosing a failure needs "what happened just before." Combat already
// keeps its own structured events on CombatState.events — this covers the rest
// (mode/route changes, messages, tile features, audio cues, errors, asset
// failures), which previously left no trace anywhere.

export type DebugEventKind =
  | "modeChange"
  | "route"
  | "message"
  | "feature"
  | "audioCue"
  | "error"
  | "assetFailed";

export interface DebugEvent {
  /** Monotonic, never reset — gaps prove events were dropped past capacity. */
  seq: number;
  t: number;
  kind: DebugEventKind;
  data: Record<string, unknown>;
}

export interface DebugEventBufferOptions {
  capacity?: number;
  now?: () => number;
}

const DEFAULT_CAPACITY = 500;

const defaultNow = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

export class DebugEventBuffer {
  private events: DebugEvent[] = [];
  private seq = 0;
  private readonly capacity: number;
  private readonly now: () => number;

  constructor(opts: DebugEventBufferOptions = {}) {
    this.capacity = Math.max(1, opts.capacity ?? DEFAULT_CAPACITY);
    this.now = opts.now ?? defaultNow;
  }

  push(kind: DebugEventKind, data: Record<string, unknown> = {}): DebugEvent {
    const event: DebugEvent = { seq: ++this.seq, t: this.now(), kind, data };
    this.events.push(event);
    if (this.events.length > this.capacity) {
      this.events.splice(0, this.events.length - this.capacity);
    }
    return event;
  }

  /** Most recent `n` events (default all), oldest-first, optionally by kind. */
  log(n?: number, kind?: DebugEventKind): DebugEvent[] {
    const source = kind ? this.events.filter((e) => e.kind === kind) : this.events;
    const slice = n === undefined ? source : source.slice(-Math.max(0, n));
    return slice.map((e) => ({ ...e, data: { ...e.data } }));
  }

  /** Drop recorded events. `seq` keeps counting so ids stay unique per session. */
  clear(): void {
    this.events = [];
  }

  get size(): number {
    return this.events.length;
  }
}
