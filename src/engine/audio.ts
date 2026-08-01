// Procedural audio engine for OnyxLabyrinth.
//
// Ambient / dungeon sounds are synthesized via the Web Audio API. Menu UI
// SFX are short WAV samples (FF6 system tings, licensed — see
// public/assets/sfx/ui/README.md). Combat SFX are also WAV samples (FF6
// sound-effect rip, unlicensed — see public/assets/sfx/combat/README.md,
// which is explicit about that difference). The "which sound for which
// combat event" mapping lives in combat-audio.ts, not here — this file only
// knows how to load and play named sample ids. The engine is lazy-
// initialized on the first user interaction (browser autoplay policy
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
//   - Menu UI: cursor / confirm / cancel / save / buy-sell / cure samples.
//
// Usage:
//   audio.startDungeon();    // begin maze theme (Torchlight Beneath Stone)
//   audio.stopDungeon();     // stop maze theme
//   audio.startTownMusic();  // loop town BGM (Haven at Dusk)
//   audio.stopTownMusic();   // end town BGM
//   audio.startBossCombat(); // exclusive boss bed (procedural BGM stand-in)
//   audio.stopBossCombat();  // end boss bed
//   audio.startTitleMusic(); // loop title + prologue BGM (HTMLAudio)
//   audio.stopTitleMusic();  // end title/prologue BGM
//   audio.footstep();        // play a footstep
//   audio.doorOpen();        // door unlocked/opened
//   audio.doorLocked();      // door remains locked
//   audio.uiCursor();        // menu highlight move
//   audio.uiConfirm();       // menu confirm
//   audio.uiCancel();        // menu cancel / close
//   audio.resume();          // call on first user gesture

type Maybe<T> = T | null;

export type UiSfxId =
  | "cursor"
  | "confirm"
  | "cancel"
  | "save"
  | "buySell"
  | "cureMenu";

const UI_SFX_FILES: Record<UiSfxId, string> = {
  cursor: "cursor.wav",
  confirm: "confirm.wav",
  cancel: "cancel.wav",
  save: "save.wav",
  buySell: "buy-sell.wav",
  cureMenu: "cure-menu.wav",
};

const UI_SFX_GAIN: Record<UiSfxId, number> = {
  cursor: 0.32,
  confirm: 0.38,
  cancel: 0.34,
  save: 0.4,
  buySell: 0.4,
  cureMenu: 0.36,
};

/** Swappable non-combat world/NPC cues. */
export type DungeonSfxId = "chestOpen" | "npcSteal";

const DUNGEON_SFX_FILES: Record<DungeonSfxId, string> = {
  chestOpen: "chest-open.wav",
  npcSteal: "npc-steal.wav",
};

const DUNGEON_SFX_GAIN: Record<DungeonSfxId, number> = {
  chestOpen: 0.34,
  npcSteal: 0.32,
};

/** Combat SFX ids — see public/assets/sfx/combat/README.md for source notes. */
export type CombatSfxId =
  | "attackHit"
  | "criticalHit"
  | "miss"
  | "defend"
  | "enemyDefeated"
  | "bossDefeated"
  | "partyKnockedOut"
  | "revived"
  | "flee"
  | "fizzle"
  | "poisonTick"
  | "burnTick"
  | "healCast"
  | "buffCast"
  | "summonCast"
  | "debuffCast"
  | "statusSleep"
  | "statusParalysis"
  | "statusBlind"
  | "statusPoison"
  | "elementFire"
  | "elementCold"
  | "elementLightning"
  | "elementWater"
  | "elementEarth"
  | "elementWind"
  | "elementDivine"
  | "elementPhysical"
  | "technique"
  | "bossAppear"
  | "bossPhase"
  | "silence"
  | "analyze"
  | "encounterStart"
  | "itemUse";

const COMBAT_SFX_FILES: Record<CombatSfxId, string> = {
  attackHit: "attack-hit.wav",
  criticalHit: "critical-hit.wav",
  miss: "miss.wav",
  defend: "defend.wav",
  enemyDefeated: "enemy-defeated.wav",
  bossDefeated: "boss-defeated.wav",
  partyKnockedOut: "party-knocked-out.wav",
  revived: "revived.wav",
  flee: "flee.wav",
  fizzle: "fizzle.wav",
  poisonTick: "poison-tick.wav",
  burnTick: "burn-tick.wav",
  healCast: "heal-cast.wav",
  buffCast: "buff-cast.wav",
  summonCast: "summon-cast.wav",
  debuffCast: "debuff-cast.wav",
  statusSleep: "status-sleep.wav",
  statusParalysis: "status-paralysis.wav",
  statusBlind: "status-blind.wav",
  statusPoison: "status-poison.wav",
  elementFire: "element-fire.wav",
  elementCold: "element-cold.wav",
  elementLightning: "element-lightning.wav",
  elementWater: "element-water.wav",
  elementEarth: "element-earth.wav",
  elementWind: "element-wind.wav",
  elementDivine: "element-divine.wav",
  elementPhysical: "element-physical.wav",
  technique: "technique.wav",
  bossAppear: "boss-appear.wav",
  bossPhase: "boss-phase.wav",
  silence: "silence.wav",
  analyze: "analyze.wav",
  encounterStart: "encounter-start.wav",
  itemUse: "item-use.wav",
};

/** Default per-sound gain. Frequent/ticking sounds sit lower to avoid ear fatigue. */
const COMBAT_SFX_GAIN: Record<CombatSfxId, number> = {
  attackHit: 0.4,
  criticalHit: 0.5,
  miss: 0.3,
  defend: 0.35,
  enemyDefeated: 0.42,
  bossDefeated: 0.55,
  partyKnockedOut: 0.45,
  revived: 0.42,
  flee: 0.4,
  fizzle: 0.35,
  poisonTick: 0.22,
  burnTick: 0.22,
  healCast: 0.4,
  buffCast: 0.35,
  summonCast: 0.42,
  debuffCast: 0.35,
  statusSleep: 0.35,
  statusParalysis: 0.35,
  statusBlind: 0.35,
  statusPoison: 0.32,
  elementFire: 0.38,
  elementCold: 0.38,
  elementLightning: 0.38,
  elementWater: 0.38,
  elementEarth: 0.38,
  elementWind: 0.38,
  elementDivine: 0.38,
  elementPhysical: 0.38,
  technique: 0.42,
  bossAppear: 0.5,
  bossPhase: 0.5,
  silence: 0.38,
  analyze: 0.32,
  encounterStart: 0.4,
  itemUse: 0.4,
};

/** Lazy-load status for a sample family — only becomes "loading" once `resume()` fires.
 *  Settles to `"done"` when every sample in the family decoded, or `"failed"` if any
 *  404'd / failed to decode (so readiness never claims success while buffers are empty). */
export type SampleLoadState = "not-started" | "loading" | "done" | "failed";

export interface SampleLoadStatus {
  ui: SampleLoadState;
  combat: SampleLoadState;
  dungeon: SampleLoadState;
  /** e.g. "ui:cursor" — ids that 404'd or failed to decode. */
  failed: string[];
}

/** Build `/<base>/assets/sfx/<folder>/` with a guaranteed trailing slash on base. */
function sfxAssetBase(folder: "ui" | "combat" | "dungeon"): string {
  const root = import.meta.env.BASE_URL || "/";
  const normalized = root.endsWith("/") ? root : `${root}/`;
  return `${normalized}assets/sfx/${folder}/`;
}

/** Title / prologue looping BGM under public/assets/music/. */
const TITLE_MUSIC_FILE = "breath-of-the-undercroft.mp3";
const TITLE_MUSIC_VOLUME = 0.42;

/** Dungeon exploration (maze) looping BGM. */
const DUNGEON_MUSIC_FILE = "torchlight-beneath-stone.mp3";
const DUNGEON_MUSIC_VOLUME = 0.4;

/** Town hub looping BGM. */
const TOWN_MUSIC_FILE = "haven-at-dusk.mp3";
const TOWN_MUSIC_VOLUME = 0.4;

function musicAssetUrl(file: string): string {
  const root = import.meta.env.BASE_URL || "/";
  const normalized = root.endsWith("/") ? root : `${root}/`;
  return `${normalized}assets/music/${file}`;
}

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

  // Boss combat bed — tenser procedural bed while a floor boss is up.
  // There is no shipped BGM asset; this is the exclusive "boss music" stand-in.
  private bossBedNodes: Maybe<{
    osc1: OscillatorNode;
    osc2: OscillatorNode;
    osc3: OscillatorNode;
    lfo: OscillatorNode;
    lfoGain: GainNode;
    filter: BiquadFilterNode;
    gain: GainNode;
  }> = null;
  private bossBedPlaying = false;

  /**
   * Title + New Game prologue BGM. HTMLAudio (not AudioContext) so the MP3
   * streams without competing with the SFX decode queues. `titleMusicWanted`
   * stays true across autoplay blocks — `resume()` / the next gesture retries.
   */
  private titleMusic: HTMLAudioElement | null = null;
  private titleMusicWanted = false;

  /** Maze / dungeon exploration BGM (sample bed; replaces procedural drone). */
  private dungeonMusic: HTMLAudioElement | null = null;
  private dungeonMusicWanted = false;

  /** Town hub BGM. */
  private townMusic: HTMLAudioElement | null = null;
  private townMusicWanted = false;

  // Noise buffer cache (footsteps reuse it).
  private noiseBuffer: Maybe<AudioBuffer> = null;

  /** Decoded FF6 UI SFX buffers (empty until loadUiSounds resolves). */
  private uiBuffers: Partial<Record<UiSfxId, AudioBuffer>> = {};
  private uiLoadPromise: Promise<void> | null = null;
  private uiLoadStatus: SampleLoadState = "not-started";
  /** Throttle rapid cursor moves (gamepad held / key-repeat). */
  private lastCursorAt = 0;
  private lastTextTickAt = 0;

  /** Decoded combat SFX buffers (empty until loadCombatSounds resolves). */
  private combatBuffers: Partial<Record<CombatSfxId, AudioBuffer>> = {};
  private combatLoadPromise: Promise<void> | null = null;
  private combatLoadStatus: SampleLoadState = "not-started";
  /** Decoded world/NPC placeholder buffers. */
  private dungeonBuffers: Partial<Record<DungeonSfxId, AudioBuffer>> = {};
  private dungeonLoadPromise: Promise<void> | null = null;
  private dungeonLoadStatus: SampleLoadState = "not-started";
  /** ids (e.g. "ui:cursor") that 404'd or failed to decode — never thrown. */
  private failedSampleIds: string[] = [];

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
    bossBed: {
      freq1: 46.25,        // F#1 — darker root than the dungeon drone
      freq2: 65.4,         // C2 — tritone-ish tension against F#
      freq3: 92.5,         // F#2 — pulse octave
      detune: 18,
      filterFreq: 340,
      lfoFreq: 0.28,       // faster breathing — unease
      lfoDepth: 0.035,
      gain: 0.085,
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
      this.tryPlayTitleMusic();
      this.tryPlayDungeonMusic();
      this.tryPlayTownMusic();
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
    // Kick off sample decode (non-blocking).
    void this.loadUiSounds();
    void this.loadCombatSounds();
    void this.loadDungeonSounds();
    // Title / dungeon BGM may have been requested before the first gesture.
    this.tryPlayTitleMusic();
    this.tryPlayDungeonMusic();
    this.tryPlayTownMusic();
  }

  /**
   * Fetch + decode menu UI WAVs under public/assets/sfx/ui/. Safe to call
   * repeatedly — shares one in-flight promise. Missing files fail quietly
   * so builds without assets still run (procedural dungeon audio only).
   */
  loadUiSounds(): Promise<void> {
    if (this.uiLoadPromise) return this.uiLoadPromise;
    if (!this.ctx) {
      this.resume();
    }
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve();

    const base = sfxAssetBase("ui");
    this.uiLoadStatus = "loading";
    this.uiLoadPromise = (async () => {
      await Promise.all(
        (Object.keys(UI_SFX_FILES) as UiSfxId[]).map(async (id) => {
          try {
            const res = await fetch(base + UI_SFX_FILES[id]);
            if (!res.ok) {
              this.recordSampleFailure(`ui:${id}`);
              return;
            }
            const raw = await res.arrayBuffer();
            this.uiBuffers[id] = await ctx.decodeAudioData(raw.slice(0));
          } catch {
            // Missing/corrupt asset — leave that slot empty.
            this.recordSampleFailure(`ui:${id}`);
          }
        })
      );
      this.uiLoadStatus = this.familyLoadResult("ui:", Object.keys(UI_SFX_FILES).length);
    })();
    return this.uiLoadPromise;
  }

  /**
   * Fetch + decode combat SFX WAVs under public/assets/sfx/combat/. Same
   * shape as loadUiSounds — shares one in-flight promise, missing files
   * fail quietly.
   */
  loadCombatSounds(): Promise<void> {
    if (this.combatLoadPromise) return this.combatLoadPromise;
    if (!this.ctx) {
      this.resume();
    }
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve();

    const base = sfxAssetBase("combat");
    this.combatLoadStatus = "loading";
    this.combatLoadPromise = (async () => {
      await Promise.all(
        (Object.keys(COMBAT_SFX_FILES) as CombatSfxId[]).map(async (id) => {
          try {
            const res = await fetch(base + COMBAT_SFX_FILES[id]);
            if (!res.ok) {
              this.recordSampleFailure(`combat:${id}`);
              return;
            }
            const raw = await res.arrayBuffer();
            this.combatBuffers[id] = await ctx.decodeAudioData(raw.slice(0));
          } catch {
            // Missing/corrupt asset — leave that slot empty.
            this.recordSampleFailure(`combat:${id}`);
          }
        })
      );
      this.combatLoadStatus = this.familyLoadResult(
        "combat:",
        Object.keys(COMBAT_SFX_FILES).length
      );
    })();
    return this.combatLoadPromise;
  }

  /**
   * Fetch + decode swappable non-combat WAVs under assets/sfx/dungeon/.
   * Missing placeholders fail quietly like the UI/combat buckets.
   */
  loadDungeonSounds(): Promise<void> {
    if (this.dungeonLoadPromise) return this.dungeonLoadPromise;
    if (!this.ctx) this.resume();
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve();

    const base = sfxAssetBase("dungeon");
    this.dungeonLoadStatus = "loading";
    this.dungeonLoadPromise = (async () => {
      await Promise.all(
        (Object.keys(DUNGEON_SFX_FILES) as DungeonSfxId[]).map(async (id) => {
          try {
            const res = await fetch(base + DUNGEON_SFX_FILES[id]);
            if (!res.ok) {
              this.recordSampleFailure(`dungeon:${id}`);
              return;
            }
            const raw = await res.arrayBuffer();
            this.dungeonBuffers[id] = await ctx.decodeAudioData(raw.slice(0));
          } catch {
            // Missing/corrupt asset — leave that slot empty.
            this.recordSampleFailure(`dungeon:${id}`);
          }
        })
      );
      this.dungeonLoadStatus = this.familyLoadResult(
        "dungeon:",
        Object.keys(DUNGEON_SFX_FILES).length
      );
    })();
    return this.dungeonLoadPromise;
  }

  /** Deduped failure list — readiness/assetFailed events key on these ids. */
  private recordSampleFailure(id: string): void {
    if (!this.failedSampleIds.includes(id)) this.failedSampleIds.push(id);
  }

  /** `"failed"` if any sample in the family is missing after settle; else `"done"`. */
  private familyLoadResult(prefix: string, expectedCount: number): SampleLoadState {
    const failed = this.failedSampleIds.filter((id) => id.startsWith(prefix)).length;
    if (failed > 0) return "failed";
    // Defensive: also fail if we somehow lost buffers without recording.
    if (prefix === "ui:" && Object.keys(this.uiBuffers).length < expectedCount) {
      return "failed";
    }
    if (prefix === "combat:" && Object.keys(this.combatBuffers).length < expectedCount) {
      return "failed";
    }
    if (prefix === "dungeon:" && Object.keys(this.dungeonBuffers).length < expectedCount) {
      return "failed";
    }
    return "done";
  }

  /**
   * Read-only status of the three lazily-started sample-load families, for
   * the ?debug=1 readiness probe. Never triggers loading itself — `resume()`
   * does that on the first user keydown — so a script that never presses a
   * key correctly sees "not-started", not a failure.
   */
  getSampleLoadStatus(): SampleLoadStatus {
    return {
      ui: this.uiLoadStatus,
      combat: this.combatLoadStatus,
      dungeon: this.dungeonLoadStatus,
      failed: [...this.failedSampleIds],
    };
  }

  /** Play a swappable non-combat world/NPC cue. */
  playDungeonSfx(id: DungeonSfxId): void {
    if (!this.ctx || !this.masterGain) return;
    const buf = this.dungeonBuffers[id];
    if (!buf) {
      void this.loadDungeonSounds();
      return;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = DUNGEON_SFX_GAIN[id];
    src.connect(gain);
    gain.connect(this.masterGain);
    src.start();
  }

  /**
   * Play a combat SFX sample by id. Silently no-ops if the sample hasn't
   * finished loading yet (kicks a load for next time) or Web Audio isn't
   * available. The event->id mapping lives in combat-audio.ts, not here.
   * Optional `gainMul` ducks layered cues (presentation only; leaf emitter).
   */
  playCombatSfx(id: CombatSfxId, opts?: { gainMul?: number }): void {
    if (!this.ctx || !this.masterGain) return;
    const buf = this.combatBuffers[id];
    if (!buf) {
      void this.loadCombatSounds();
      if (this.combatLoadStatus === "done" || this.combatLoadStatus === "failed") {
        // Audible stand-in so encounter/KO cues aren't total silence when a
        // WAV 404'd — still recorded as bufferMissing by the audio spy.
        this.playProceduralUiClick(id === "partyKnockedOut" ? 110 : 330);
      }
      return;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = COMBAT_SFX_GAIN[id] * (opts?.gainMul ?? 1);
    src.connect(gain);
    gain.connect(this.masterGain);
    src.start();
  }

  /** Menu cursor tick (highlight move). Rate-limited for key-repeat. */
  uiCursor(): void {
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    if (now - this.lastCursorAt < 45) return;
    this.lastCursorAt = now;
    this.playUi("cursor");
  }

  /** Menu confirm / select. */
  uiConfirm(): void {
    this.playUi("confirm");
  }

  /**
   * Soft per-glyph tick for prologue / narration typewriter. Procedural —
   * not the menu cursor sample — so myth text does not sound like browsing
   * the shop. Rate-limited to keep up with ~32 cps without stacking mush.
   */
  uiTextTick(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    if (now - this.lastTextTickAt < 28) return;
    this.lastTextTickAt = now;

    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    // Soft high tick; slight pitch jitter so a long beat does not drone.
    osc.frequency.value = 880 + (Math.random() * 2 - 1) * 40;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.045, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

    osc.connect(env);
    env.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.04);
  }

  /** Menu cancel / close / back. */
  uiCancel(): void {
    this.playUi("cancel");
  }

  /** Save success chime. */
  uiSave(): void {
    this.playUi("save");
  }

  /** Shop buy / sell chime. */
  uiBuySell(): void {
    this.playUi("buySell");
  }

  /** Soft menu heal ting (inn / cure / temple). */
  uiCureMenu(): void {
    this.playUi("cureMenu");
  }

  /** Short synthesized major arpeggio, played once per post-combat level-up batch. */
  levelUp(): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const start = ctx.currentTime;
    const frequencies = [523.25, 659.25, 783.99] as const;
    frequencies.forEach((frequency, index) => {
      const t = start + index * 0.09;
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = frequency;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.001, t);
      env.gain.linearRampToValueAtTime(0.08, t + 0.01);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(env);
      env.connect(this.masterGain!);
      osc.start(t);
      osc.stop(t + 0.21);
    });
  }

  /**
   * Play UI SFX for common menu navigation keys. Letter hotkeys (including
   * W/S when used as shortcuts) are left to callers so they don't steal
   * cursor ticks from branded keys like [S] Save.
   */
  uiForMenuKey(key: string): void {
    const lower = key.toLowerCase();
    if (
      lower === "arrowup" ||
      lower === "arrowdown" ||
      lower === "arrowleft" ||
      lower === "arrowright"
    ) {
      this.uiCursor();
      return;
    }
    if (key === "Enter" || key === " ") {
      this.uiConfirm();
      return;
    }
    if (lower === "escape") {
      this.uiCancel();
    }
  }

  private playUi(id: UiSfxId): void {
    if (!this.ctx || !this.masterGain) return;
    const buf = this.uiBuffers[id];
    if (!buf) {
      // Samples may still be loading — kick a load. If the family already
      // settled without this buffer, fall back so menus aren't silent.
      void this.loadUiSounds();
      if (this.uiLoadStatus === "done" || this.uiLoadStatus === "failed") {
        this.playProceduralUiClick(id === "cancel" ? 220 : 440);
      }
      return;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = UI_SFX_GAIN[id];
    src.connect(gain);
    gain.connect(this.masterGain);
    src.start();
  }

  /** Tiny procedural tick when a UI WAV is missing after load settled. */
  private playProceduralUiClick(freq: number): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  }

  /**
   * Start the dungeon / maze bed. Uses the authored Torchlight theme instead
   * of the old procedural drone so exploration has a real score. Stops any
   * leftover drone nodes. Safe before Web Audio is ready (HTMLAudio).
   */
  startDungeon(): void {
    if (this.dronePlaying) this.stopProceduralDrone();
    this.dungeonMusicWanted = true;
    if (!this.dungeonMusic) {
      const el = new Audio(musicAssetUrl(DUNGEON_MUSIC_FILE));
      el.loop = true;
      el.preload = "auto";
      el.volume = DUNGEON_MUSIC_VOLUME;
      this.dungeonMusic = el;
    }
    this.tryPlayDungeonMusic();
  }

  /** Stop the dungeon / maze BGM (and any leftover procedural drone). */
  stopDungeon(): void {
    this.dungeonMusicWanted = false;
    if (this.dungeonMusic) {
      this.dungeonMusic.pause();
      this.dungeonMusic.currentTime = 0;
    }
    this.stopProceduralDrone();
  }

  private tryPlayDungeonMusic(): void {
    if (!this.dungeonMusicWanted || !this.dungeonMusic) return;
    if (!this.dungeonMusic.paused && !this.dungeonMusic.ended) return;
    void this.dungeonMusic.play().catch(() => {
      // Autoplay policy — retry from resume().
    });
  }

  /**
   * Loop the town hub BGM (Haven at Dusk). Call while `mode === "town"`;
   * stop when leaving for dungeon, camp, title, etc.
   */
  startTownMusic(): void {
    this.townMusicWanted = true;
    if (!this.townMusic) {
      const el = new Audio(musicAssetUrl(TOWN_MUSIC_FILE));
      el.loop = true;
      el.preload = "auto";
      el.volume = TOWN_MUSIC_VOLUME;
      this.townMusic = el;
    }
    this.tryPlayTownMusic();
  }

  /** Stop and rewind the town hub BGM. */
  stopTownMusic(): void {
    this.townMusicWanted = false;
    if (!this.townMusic) return;
    this.townMusic.pause();
    this.townMusic.currentTime = 0;
  }

  private tryPlayTownMusic(): void {
    if (!this.townMusicWanted || !this.townMusic) return;
    if (!this.townMusic.paused && !this.townMusic.ended) return;
    void this.townMusic.play().catch(() => {
      // Autoplay policy — retry from resume().
    });
  }

  /** Stop the legacy procedural drone only (internal). */
  private stopProceduralDrone(): void {
    if (!this.ctx || !this.droneNodes) return;
    const { osc1, osc2, lfo } = this.droneNodes;
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
   * Loop the title / prologue BGM. Safe before the first user gesture —
   * play may be blocked until `resume()`; we keep wanting it until
   * `stopTitleMusic()`. Continues seamlessly from title into the New Game
   * prologue; callers stop it when leaving for party creation / Continue /
   * Arena / dungeon.
   */
  startTitleMusic(): void {
    this.titleMusicWanted = true;
    if (!this.titleMusic) {
      const el = new Audio(musicAssetUrl(TITLE_MUSIC_FILE));
      el.loop = true;
      el.preload = "auto";
      el.volume = TITLE_MUSIC_VOLUME;
      this.titleMusic = el;
    }
    this.tryPlayTitleMusic();
  }

  /** Stop and rewind the title / prologue BGM. */
  stopTitleMusic(): void {
    this.titleMusicWanted = false;
    if (!this.titleMusic) return;
    this.titleMusic.pause();
    this.titleMusic.currentTime = 0;
  }

  private tryPlayTitleMusic(): void {
    if (!this.titleMusicWanted || !this.titleMusic) return;
    if (!this.titleMusic.paused && !this.titleMusic.ended) return;
    void this.titleMusic.play().catch(() => {
      // Autoplay policy — will retry from resume() / next startTitleMusic().
    });
  }

  /**
   * Start the exclusive boss combat bed (procedural stand-in for boss BGM).
   * No-op if already playing. Safe to call when Web Audio isn't ready.
   */
  startBossCombat(): void {
    if (!this.ctx || !this.masterGain || this.bossBedPlaying) return;
    const ctx = this.ctx;
    const cfg = this.CFG.bossBed;

    const osc1 = ctx.createOscillator();
    osc1.type = "sawtooth";
    osc1.frequency.value = cfg.freq1;

    const osc2 = ctx.createOscillator();
    osc2.type = "square";
    osc2.frequency.value = cfg.freq2;
    osc2.detune.value = cfg.detune;

    const osc3 = ctx.createOscillator();
    osc3.type = "triangle";
    osc3.frequency.value = cfg.freq3;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cfg.filterFreq;

    const gain = ctx.createGain();
    gain.gain.value = cfg.gain;

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = cfg.lfoFreq;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = cfg.lfoDepth;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);

    osc1.connect(filter);
    osc2.connect(filter);
    osc3.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc1.start();
    osc2.start();
    osc3.start();
    lfo.start();

    this.bossBedNodes = { osc1, osc2, osc3, lfo, lfoGain, filter, gain };
    this.bossBedPlaying = true;
  }

  /** Stop the boss combat bed. No-op if not playing. */
  stopBossCombat(): void {
    if (!this.ctx || !this.bossBedNodes) return;
    const { osc1, osc2, osc3, lfo } = this.bossBedNodes;
    const t = this.ctx.currentTime;
    this.bossBedNodes.gain.gain.setValueAtTime(
      this.bossBedNodes.gain.gain.value,
      t
    );
    this.bossBedNodes.gain.gain.linearRampToValueAtTime(0, t + 0.2);
    osc1.stop(t + 0.22);
    osc2.stop(t + 0.22);
    osc3.stop(t + 0.22);
    lfo.stop(t + 0.22);
    this.bossBedNodes = null;
    this.bossBedPlaying = false;
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
