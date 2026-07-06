// Procedural audio engine for OnyxLabyrinth.
//
// All sounds are synthesized via the Web Audio API — no asset files needed,
// keeping the bundle tiny and avoiding load-time delays. The engine is
// lazy-initialized on the first user interaction (browser autoplay policy
// requires a user gesture before AudioContext can start).
//
// Sound design:
//   - Ambient drone: two detuned low oscillators through a lowpass filter,
//     with a slow LFO modulating the gain for a "breathing" effect. Loops
//     continuously while in dungeon mode.
//   - Footstep: short filtered noise burst with quick decay. Triggered at
//     the midpoint of the smooth movement animation. Slightly randomized
//     per step for variety.
//   - Door open: low wooden creak (sawtooth pitch sweep + bandpass).
//   - Door locked: dull thud + metallic rattle (noise burst + low sine).
//
// Usage:
//   audio.startDungeon();    // begin drone
//   audio.stopDungeon();     // stop drone
//   audio.footstep();        // play a footstep
//   audio.doorOpen();        // door unlocked/opened
//   audio.doorLocked();      // door remains locked
//   audio.resume();          // call on first user gesture

type Maybe<T> = T | null;

class AudioEngine {
  private ctx: Maybe<AudioContext> = null;
  private masterGain: Maybe<GainNode> = null;

  // Drone nodes (created once, started/stopped as a group).
  private droneNodes: Maybe<{
    osc1: OscillatorNode;
    osc2: OscillatorNode;
    lfo: OscillatorNode;
    lfoGain: GainNode;
    filter: BiquadFilterNode;
    gain: GainNode;
  }> = null;
  private dronePlaying = false;

  // Noise buffer cache (footsteps reuse it).
  private noiseBuffer: Maybe<AudioBuffer> = null;

  // Config — exposed for tuning. Keep magic numbers here.
  private readonly CFG = {
    drone: {
      freq1: 55,           // A1 — root drone
      freq2: 82.5,         // E2 — perfect fifth above, detuned for richness
      detune: 8,           // cents — subtle detune between the two oscillators
      filterFreq: 220,     // lowpass — keeps only the sub-bass warmth
      lfoFreq: 0.08,       // Hz — ~12s breathing cycle
      lfoDepth: 0.015,     // gain wobble depth (subtle)
      gain: 0.06,          // master drone level (quiet — ambient bed)
    },
    footstep: {
      duration: 0.12,      // seconds — short burst
      filterFreq: 1800,    // lowpass — muffled stone step
      filterQ: 1.2,
      gain: 0.18,          // per-step volume
      pitchJitter: 0.15,   // ±15% filter freq variation
      gainJitter: 0.2,     // ±20% gain variation
    },
    doorOpen: {
      duration: 0.45,
      startFreq: 220,
      endFreq: 80,
      filterFreq: 600,
      filterQ: 4,
      gain: 0.2,
    },
    doorLocked: {
      thudDuration: 0.15,
      thudFreq: 90,
      rattleDuration: 0.25,
      rattleFilterFreq: 3000,
      gain: 0.22,
    },
  } as const;

  /**
   * Initialize the AudioContext. Must be called from a user gesture handler
   * (keydown, click, etc.) to satisfy browser autoplay policies. Safe to
   * call multiple times — only creates the context once.
   */
  resume(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return; // Web Audio not supported — silently no-op
    this.ctx = new Ctor();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8;
    this.masterGain.connect(this.ctx.destination);
    // Pre-render the noise buffer for footsteps.
    this.noiseBuffer = this.createNoiseBuffer(0.5);
  }

  /** Start the ambient dungeon drone. No-op if already playing. */
  startDungeon(): void {
    if (!this.ctx || !this.masterGain || this.dronePlaying) return;
    const ctx = this.ctx;
    const cfg = this.CFG.drone;

    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.value = cfg.freq1;

    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = cfg.freq2;
    osc2.detune.value = cfg.detune;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cfg.filterFreq;

    const gain = ctx.createGain();
    gain.gain.value = cfg.gain;

    // LFO for subtle gain "breathing".
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = cfg.lfoFreq;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = cfg.lfoDepth;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc1.start();
    osc2.start();
    lfo.start();

    this.droneNodes = { osc1, osc2, lfo, lfoGain, filter, gain };
    this.dronePlaying = true;
  }

  /** Stop the ambient drone. No-op if not playing. */
  stopDungeon(): void {
    if (!this.ctx || !this.droneNodes) return;
    const { osc1, osc2, lfo } = this.droneNodes;
    // Quick fade-out to avoid click.
    const t = this.ctx.currentTime;
    this.droneNodes.gain.gain.setValueAtTime(
      this.droneNodes.gain.gain.value,
      t
    );
    this.droneNodes.gain.gain.linearRampToValueAtTime(0, t + 0.15);
    osc1.stop(t + 0.16);
    osc2.stop(t + 0.16);
    lfo.stop(t + 0.16);
    this.droneNodes = null;
    this.dronePlaying = false;
  }

  /**
   * Play a footstep sound. Call at the midpoint of the movement animation
   * for best sync. Each step is slightly randomized for variety.
   */
  footstep(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const cfg = this.CFG.footstep;
    const t = ctx.currentTime;

    // Randomized filter frequency and gain per step.
    const pitchVar = 1 + (Math.random() * 2 - 1) * cfg.pitchJitter;
    const gainVar = 1 + (Math.random() * 2 - 1) * cfg.gainJitter;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = false;
    // Random offset into the noise buffer for variety.
    const offset = Math.random() * (this.noiseBuffer.duration - cfg.duration);
    src.start(t, offset, cfg.duration);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cfg.filterFreq * pitchVar;
    filter.Q.value = cfg.filterQ;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(cfg.gain * gainVar, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, t + cfg.duration);

    src.connect(filter);
    filter.connect(env);
    env.connect(this.masterGain);
  }

  /** Play a door-opening sound (wooden creak). */
  doorOpen(): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const cfg = this.CFG.doorOpen;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(cfg.startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(cfg.endFreq, t + cfg.duration);

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = cfg.filterFreq;
    filter.Q.value = cfg.filterQ;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(cfg.gain, t + 0.03);
    env.gain.exponentialRampToValueAtTime(0.001, t + cfg.duration);

    osc.connect(filter);
    filter.connect(env);
    env.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + cfg.duration + 0.05);
  }

  /** Play a locked-door sound (dull thud + metallic rattle). */
  doorLocked(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const cfg = this.CFG.doorLocked;
    const t = ctx.currentTime;

    // Thud: low sine with quick decay.
    const thud = ctx.createOscillator();
    thud.type = "sine";
    thud.frequency.setValueAtTime(cfg.thudFreq, t);
    thud.frequency.exponentialRampToValueAtTime(
      cfg.thudFreq * 0.5,
      t + cfg.thudDuration
    );
    const thudEnv = ctx.createGain();
    thudEnv.gain.setValueAtTime(cfg.gain, t);
    thudEnv.gain.exponentialRampToValueAtTime(0.001, t + cfg.thudDuration);
    thud.connect(thudEnv);
    thudEnv.connect(this.masterGain);
    thud.start(t);
    thud.stop(t + cfg.thudDuration + 0.05);

    // Rattle: filtered noise, slightly delayed.
    const rattleSrc = ctx.createBufferSource();
    rattleSrc.buffer = this.noiseBuffer;
    rattleSrc.start(t + 0.04, 0, cfg.rattleDuration);
    const rattleFilter = ctx.createBiquadFilter();
    rattleFilter.type = "bandpass";
    rattleFilter.frequency.value = cfg.rattleFilterFreq;
    rattleFilter.Q.value = 8;
    const rattleEnv = ctx.createGain();
    rattleEnv.gain.setValueAtTime(cfg.gain * 0.5, t + 0.04);
    rattleEnv.gain.exponentialRampToValueAtTime(
      0.001,
      t + 0.04 + cfg.rattleDuration
    );
    rattleSrc.connect(rattleFilter);
    rattleFilter.connect(rattleEnv);
    rattleEnv.connect(this.masterGain);
  }

  // --- Internal helpers ---

  /** Create a white noise buffer of the given duration (seconds). */
  private createNoiseBuffer(duration: number): AudioBuffer {
    const ctx = this.ctx!;
    const length = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }
}

/** Singleton audio engine instance. */
export const audio = new AudioEngine();
