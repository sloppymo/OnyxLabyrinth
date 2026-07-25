// Debug-only audio observability. Pure of DOM/Web Audio: the spy patches
// whatever object it is handed, so it unit-tests against a fake engine.
//
// Why this exists: audio is fire-and-forget and, for the three WAV sample
// families, *silently* no-ops when a buffer failed to load (see AGENTS.md).
// A playtest could not previously tell "cue never triggered" from "cue
// triggered but was inaudible." Each record carries the cue id, when it
// fired, how long it lasts, and whether a sample buffer existed at call time.
//
// Caveat worth knowing before asserting on `proc:` cues: the procedural
// emitters rate-limit internally (uiTextTick ~28ms, uiCursor ~45ms) and
// return early when called too fast. The spy records the *invocation*, so a
// suppressed repeat still shows up. Sample cues (`ui:` / `combat:` /
// `dungeon:`) do not have this caveat.

export interface AudioCueRecord {
  /** Namespaced cue id: `ui:cursor`, `combat:attackHit`, `proc:footstep`. */
  id: string;
  firedAt: number;
  /** Null when the duration isn't knowable (sample never loaded). */
  durationMs: number | null;
  endsAt: number | null;
  /** True when a sample-backed cue fired with no decoded buffer — inaudible. */
  bufferMissing: boolean;
}

export interface AudioCueLogOptions {
  now?: () => number;
  capacity?: number;
}

const DEFAULT_CAPACITY = 200;

const defaultNow = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

/**
 * Approximate envelope lengths for the procedural (non-sample) cues, read off
 * the oscillator/noise stop times in engine/audio.ts. Used so a script can
 * reason about "is this still sounding" for cues that have no AudioBuffer.
 */
export const PROCEDURAL_CUE_MS = {
  footstep: 120,
  doorOpen: 420,
  doorLocked: 260,
  levelUp: 900,
  uiTextTick: 40,
} as const;

export class AudioCueLog {
  private records: AudioCueRecord[] = [];
  private readonly now: () => number;
  private readonly capacity: number;

  constructor(opts: AudioCueLogOptions = {}) {
    this.now = opts.now ?? defaultNow;
    this.capacity = Math.max(1, opts.capacity ?? DEFAULT_CAPACITY);
  }

  record(id: string, durationMs: number | null, bufferMissing: boolean): AudioCueRecord {
    const firedAt = this.now();
    const rec: AudioCueRecord = {
      id,
      firedAt,
      durationMs,
      endsAt: durationMs === null ? null : firedAt + durationMs,
      bufferMissing,
    };
    this.records.push(rec);
    if (this.records.length > this.capacity) {
      this.records.splice(0, this.records.length - this.capacity);
    }
    return rec;
  }

  recent(n?: number): AudioCueRecord[] {
    const slice = n === undefined ? this.records : this.records.slice(-Math.max(0, n));
    return slice.map((r) => ({ ...r }));
  }

  /** Cue ids whose envelope has not yet elapsed. Unknown durations excluded. */
  playingNow(): string[] {
    const t = this.now();
    return this.records
      .filter((r) => r.endsAt !== null && t < r.endsAt)
      .map((r) => r.id);
  }

  clear(): void {
    this.records = [];
  }
}

/** Shape the spy needs; the real AudioEngine satisfies it structurally. */
type PatchTarget = Record<string, unknown>;

export interface AudioSpyOptions {
  now?: () => number;
  capacity?: number;
  onCue?: (rec: AudioCueRecord) => void;
}

export interface AudioSpy {
  log: AudioCueLog;
  uninstall(): void;
}

/** Sample-backed emitters: method name -> [cue prefix, private buffer map]. */
const SAMPLE_EMITTERS: Record<string, { prefix: string; bufferField: string }> = {
  playUi: { prefix: "ui", bufferField: "uiBuffers" },
  playCombatSfx: { prefix: "combat", bufferField: "combatBuffers" },
  playDungeonSfx: { prefix: "dungeon", bufferField: "dungeonBuffers" },
};

/**
 * Wrap the audio singleton's emitters so every cue is logged. Only the leaf
 * emitters are patched — the friendly wrappers (uiConfirm, uiCancel, …) all
 * delegate to playUi, so patching both would double-count.
 */
export function installAudioSpy(target: object, opts: AudioSpyOptions = {}): AudioSpy {
  const obj = target as PatchTarget;
  const log = new AudioCueLog({ now: opts.now, capacity: opts.capacity });
  const originals = new Map<string, unknown>();

  const emit = (rec: AudioCueRecord): void => {
    opts.onCue?.(rec);
  };

  for (const [method, { prefix, bufferField }] of Object.entries(SAMPLE_EMITTERS)) {
    const original = obj[method];
    if (typeof original !== "function") continue;
    originals.set(method, original);
    obj[method] = function patched(this: unknown, id: string, ...rest: unknown[]) {
      const buffers = obj[bufferField] as Record<string, { duration?: number }> | undefined;
      const buf = buffers?.[id];
      const durationMs = typeof buf?.duration === "number" ? buf.duration * 1000 : null;
      emit(log.record(`${prefix}:${id}`, durationMs, !buf));
      return (original as (...a: unknown[]) => unknown).call(this, id, ...rest);
    };
  }

  for (const [method, durationMs] of Object.entries(PROCEDURAL_CUE_MS)) {
    const original = obj[method];
    if (typeof original !== "function") continue;
    originals.set(method, original);
    obj[method] = function patched(this: unknown, ...args: unknown[]) {
      emit(log.record(`proc:${method}`, durationMs, false));
      return (original as (...a: unknown[]) => unknown).call(this, ...args);
    };
  }

  return {
    log,
    uninstall() {
      for (const [method, original] of originals) {
        obj[method] = original;
      }
      originals.clear();
    },
  };
}
