import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

type FakeAudio = {
  src: string;
  loop: boolean;
  volume: number;
  currentTime: number;
  paused: boolean;
  ended: boolean;
  play: Mock<() => Promise<void>>;
  pause: Mock<() => void>;
  preload: string;
};

type FakeNode = {
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  gain: {
    value: number;
    setValueAtTime: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  frequency: {
    value: number;
    setValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  detune: { value: number };
  buffer: unknown;
  type: string;
};

function fakeNode(): FakeNode {
  return {
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    gain: {
      value: 0,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    frequency: {
      value: 0,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    detune: { value: 0 },
    buffer: null,
    type: "",
  };
}

describe("AudioEngine dungeon cues", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("loads the two swappable dungeon placeholder files", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    });
    vi.stubGlobal("fetch", fetchMock);

    const ctx = {
      state: "running",
      currentTime: 0,
      sampleRate: 44100,
      destination: fakeNode(),
      createGain: () => fakeNode(),
      createBufferSource: () => fakeNode(),
      createOscillator: () => fakeNode(),
      createBiquadFilter: () => fakeNode(),
      createBuffer: () => ({ getChannelData: () => new Float32Array(1) }),
      decodeAudioData: async () => ({ decoded: true }),
    };
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: class {
        constructor() {
          return ctx;
        }
      },
    });

    const { audio } = await import("./audio");
    audio.resume();
    await audio.loadDungeonSounds();

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.endsWith("/assets/sfx/dungeon/chest-open.wav"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/assets/sfx/dungeon/npc-steal.wav"))).toBe(true);
  });

  it("plays a three-note procedural level-up arpeggio", async () => {
    const oscillators: FakeNode[] = [];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const ctx = {
      state: "running",
      currentTime: 1,
      sampleRate: 44100,
      destination: fakeNode(),
      createGain: () => fakeNode(),
      createBufferSource: () => fakeNode(),
      createOscillator: () => {
        const node = fakeNode();
        oscillators.push(node);
        return node;
      },
      createBiquadFilter: () => fakeNode(),
      createBuffer: () => ({ getChannelData: () => new Float32Array(1) }),
      decodeAudioData: async () => ({ decoded: true }),
    };
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: class {
        constructor() {
          return ctx;
        }
      },
    });

    const { audio } = await import("./audio");
    audio.resume();
    audio.levelUp();

    expect(oscillators).toHaveLength(3);
    expect(oscillators.map((osc) => osc.frequency.value)).toEqual([523.25, 659.25, 783.99]);
    expect(oscillators.every((osc) => osc.start.mock.calls.length === 1)).toBe(true);
  });

  it("starts and stops the boss combat BGM", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const ctx = {
      state: "running",
      currentTime: 2,
      sampleRate: 44100,
      destination: fakeNode(),
      createGain: () => fakeNode(),
      createBufferSource: () => fakeNode(),
      createOscillator: () => fakeNode(),
      createBiquadFilter: () => fakeNode(),
      createBuffer: () => ({ getChannelData: () => new Float32Array(1) }),
      decodeAudioData: async () => ({ decoded: true }),
    };
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: class {
        constructor() {
          return ctx;
        }
      },
    });

    // Mock HTMLAudioElement
    const mockAudio = {
      loop: false,
      volume: 0,
      paused: true,
      ended: false,
      currentTime: 0,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
    };
    vi.stubGlobal("Audio", class {
      constructor() {
        return mockAudio;
      }
    });

    const { audio } = await import("./audio");
    audio.resume();
    audio.startBossCombat();
    // Boss music uses HTMLAudioElement
    expect(audio["bossMusic"]).not.toBeNull();
    expect(audio["bossMusic"]?.loop).toBe(true);
    expect(audio["bossMusic"]?.volume).toBe(0.5);

    audio.stopBossCombat();
    expect(audio["bossMusic"]?.paused).toBe(true);
    expect(audio["bossMusic"]?.currentTime).toBe(0);

    // Idempotent: second stop is a no-op.
    audio.stopBossCombat();
  });
});

describe("AudioEngine sample load status (?debug=1 readiness probe)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  function stubAudioContext() {
    const ctx = {
      state: "running",
      currentTime: 0,
      sampleRate: 44100,
      destination: fakeNode(),
      createGain: () => fakeNode(),
      createBufferSource: () => fakeNode(),
      createOscillator: () => fakeNode(),
      createBiquadFilter: () => fakeNode(),
      createBuffer: () => ({ getChannelData: () => new Float32Array(1) }),
      decodeAudioData: async () => ({ decoded: true }),
    };
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: class {
        constructor() {
          return ctx;
        }
      },
    });
  }

  it("reports not-started before resume() has ever run (no user gesture yet)", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { audio } = await import("./audio");

    expect(audio.getSampleLoadStatus()).toEqual({
      ui: "not-started",
      combat: "not-started",
      dungeon: "not-started",
      failed: [],
    });
  });

  it("flips to loading synchronously, then done once the fetches settle", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
    );
    stubAudioContext();

    const { audio } = await import("./audio");
    audio.resume();
    expect(audio.getSampleLoadStatus().ui).toBe("loading");

    await audio.loadUiSounds(); // returns the same in-flight promise resume() kicked off
    expect(audio.getSampleLoadStatus().ui).toBe("done");
  });

  it("records a failed id (by family:id) when a sample 404s, without throwing", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).endsWith("chest-open.wav")) return { ok: false };
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    });
    vi.stubGlobal("fetch", fetchMock);
    stubAudioContext();

    const { audio } = await import("./audio");
    audio.resume();
    await audio.loadDungeonSounds();

    const status = audio.getSampleLoadStatus();
    expect(status.dungeon).toBe("failed");
    expect(status.failed).toContain("dungeon:chestOpen");
  });

  it("records a failed id when decodeAudioData rejects (corrupt asset)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
    );
    const ctx = {
      state: "running",
      currentTime: 0,
      sampleRate: 44100,
      destination: fakeNode(),
      createGain: () => fakeNode(),
      createBufferSource: () => fakeNode(),
      createOscillator: () => fakeNode(),
      createBiquadFilter: () => fakeNode(),
      createBuffer: () => ({ getChannelData: () => new Float32Array(1) }),
      decodeAudioData: async () => {
        throw new Error("corrupt");
      },
    };
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: class {
        constructor() {
          return ctx;
        }
      },
    });

    const { audio } = await import("./audio");
    audio.resume();
    await audio.loadCombatSounds();

    // resume() also kicks off the ui/dungeon families in the background with
    // the same always-throwing decodeAudioData, so they fail too — that's
    // consistent, not a leak. The claim under test is just that combat's own
    // failures were recorded.
    const status = audio.getSampleLoadStatus();
    expect(status.combat).toBe("failed");
    expect(status.failed.some((id) => id.startsWith("combat:"))).toBe(true);
  });
});

describe("AudioEngine SFX mix levels", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("lifts title-menu cursor samples above their legacy gain", async () => {
    const gains: FakeNode[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
    );
    const ctx = {
      state: "running",
      currentTime: 0,
      sampleRate: 44100,
      destination: fakeNode(),
      createGain: () => {
        const node = fakeNode();
        gains.push(node);
        return node;
      },
      createBufferSource: () => fakeNode(),
      createOscillator: () => fakeNode(),
      createBiquadFilter: () => fakeNode(),
      createBuffer: () => ({ getChannelData: () => new Float32Array(1) }),
      decodeAudioData: async () => ({ decoded: true }),
    };
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: class {
        constructor() {
          return ctx;
        }
      },
    });
    vi.spyOn(performance, "now").mockReturnValue(100);

    const { audio } = await import("./audio");
    audio.resume();
    await audio.loadUiSounds();
    audio.uiCursor();

    expect(gains[0]!.gain.value).toBe(0.8);
    expect(gains.at(-1)!.gain.value).toBeCloseTo(0.64);
  });

  it("plays the first title-menu cursor after initial sample decoding", async () => {
    const sources: FakeNode[] = [];
    let releaseDecode!: () => void;
    const decodeGate = new Promise<void>((resolve) => {
      releaseDecode = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
    );
    const ctx = {
      state: "running",
      currentTime: 0,
      sampleRate: 44100,
      destination: fakeNode(),
      createGain: () => fakeNode(),
      createBufferSource: () => {
        const node = fakeNode();
        sources.push(node);
        return node;
      },
      createOscillator: () => fakeNode(),
      createBiquadFilter: () => fakeNode(),
      createBuffer: () => ({ getChannelData: () => new Float32Array(1) }),
      decodeAudioData: async () => {
        await decodeGate;
        return { decoded: true };
      },
    };
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: class {
        constructor() {
          return ctx;
        }
      },
    });
    vi.spyOn(performance, "now").mockReturnValue(100);

    const { audio } = await import("./audio");
    audio.resume();
    audio.uiCursor();
    audio.uiCursor();
    expect(sources).toHaveLength(0);

    releaseDecode();
    await audio.loadUiSounds();
    await Promise.resolve();

    expect(sources).toHaveLength(1);
    expect(sources[0]!.start).toHaveBeenCalledTimes(1);
  });

  it("lifts combat samples while retaining per-layer ducking", async () => {
    const gains: FakeNode[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
    );
    const ctx = {
      state: "running",
      currentTime: 0,
      sampleRate: 44100,
      destination: fakeNode(),
      createGain: () => {
        const node = fakeNode();
        gains.push(node);
        return node;
      },
      createBufferSource: () => fakeNode(),
      createOscillator: () => fakeNode(),
      createBiquadFilter: () => fakeNode(),
      createBuffer: () => ({ getChannelData: () => new Float32Array(1) }),
      decodeAudioData: async () => ({ decoded: true }),
    };
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: class {
        constructor() {
          return ctx;
        }
      },
    });

    const { audio } = await import("./audio");
    audio.resume();
    await audio.loadCombatSounds();
    audio.playCombatSfx("attackHit", { gainMul: 0.5 });

    expect(gains[0]!.gain.value).toBe(0.8);
    expect(gains.at(-1)!.gain.value).toBeCloseTo(0.36);
  });
});

describe("AudioEngine title music", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("loops Breath of the Undercroft and stops cleanly", async () => {
    const play = vi.fn(() => Promise.resolve());
    const pause = vi.fn();
    const instances: FakeAudio[] = [];

    vi.stubGlobal(
      "Audio",
      class {
        loop = false;
        volume = 1;
        currentTime = 0;
        paused = true;
        ended = false;
        preload = "";
        play = play;
        pause = pause;
        constructor(public src: string) {
          instances.push(this);
        }
      }
    );

    const { audio } = await import("./audio");
    audio.startTitleMusic();
    expect(instances).toHaveLength(1);
    expect(instances[0]!.src).toContain("breath-of-the-undercroft.mp3");
    expect(instances[0]!.loop).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);

    audio.startTitleMusic();
    expect(instances).toHaveLength(1);

    audio.stopTitleMusic();
    expect(pause).toHaveBeenCalled();
    expect(instances[0]!.currentTime).toBe(0);
  });

  it("gives every dungeon theme an equal quarter of the random pool", async () => {
    const play = vi.fn(() => Promise.resolve());
    const pause = vi.fn();
    const instances: FakeAudio[] = [];

    vi.stubGlobal(
      "Audio",
      class {
        loop = false;
        volume = 1;
        currentTime = 0;
        paused = true;
        ended = false;
        preload = "";
        play = play;
        pause = pause;
        constructor(public src: string) {
          instances.push(this);
        }
      }
    );

    const random = vi.spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.25)
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.999);

    const { audio } = await import("./audio");
    const expected = [
      "torchlight-beneath-stone.mp3",
      "understone-dungeon-loop.mp3",
      "emberwake-strings-loop.mp3",
      "emberwake-organ-loop.mp3",
    ];

    for (let index = 0; index < expected.length; index++) {
      audio.startDungeon();
      expect(instances).toHaveLength(index + 1);
      expect(instances[index]!.src).toContain(expected[index]);
      expect(instances[index]!.loop).toBe(true);
      expect(instances[index]!.volume).toBe(0.4);

      if (index === 0) {
        // Repeated calls in one visit do not restart or reroll the bed.
        audio.startDungeon();
        expect(instances).toHaveLength(1);
      }

      audio.stopDungeon();
      expect(instances[index]!.currentTime).toBe(0);
    }

    expect(random).toHaveBeenCalledTimes(4);
    expect(play).toHaveBeenCalled();
    expect(pause).toHaveBeenCalledTimes(4);
  });

  it("loops Haven at Dusk as the town theme", async () => {
    const play = vi.fn(() => Promise.resolve());
    const pause = vi.fn();
    const instances: FakeAudio[] = [];

    vi.stubGlobal(
      "Audio",
      class {
        loop = false;
        volume = 1;
        currentTime = 0;
        paused = true;
        ended = false;
        preload = "";
        play = play;
        pause = pause;
        constructor(public src: string) {
          instances.push(this);
        }
      }
    );

    const { audio } = await import("./audio");
    audio.startTownMusic();
    expect(instances).toHaveLength(1);
    expect(instances[0]!.src).toContain("haven-at-dusk.mp3");
    expect(instances[0]!.loop).toBe(true);
    expect(play).toHaveBeenCalled();

    audio.stopTownMusic();
    expect(pause).toHaveBeenCalled();
    expect(instances[0]!.currentTime).toBe(0);
  });

  it("loops and rewinds the authored normal battle theme", async () => {
    const play = vi.fn(() => Promise.resolve());
    const pause = vi.fn();
    const instances: FakeAudio[] = [];

    vi.stubGlobal(
      "Audio",
      class {
        loop = false;
        volume = 1;
        currentTime = 0;
        paused = true;
        ended = false;
        preload = "";
        play = play;
        pause = pause;
        constructor(public src: string) {
          instances.push(this);
        }
      }
    );

    const { audio } = await import("./audio");
    audio.startBattleMusic();
    expect(instances).toHaveLength(1);
    expect(instances[0]!.src).toContain("battle-theme-v3.mp3");
    expect(instances[0]!.loop).toBe(true);
    expect(instances[0]!.volume).toBe(0.46);
    expect(play).toHaveBeenCalledTimes(1);

    audio.startBattleMusic();
    expect(instances).toHaveLength(1);

    audio.stopBattleMusic();
    expect(pause).toHaveBeenCalledTimes(1);
    expect(instances[0]!.currentTime).toBe(0);
  });

  it("loops and rewinds the character creation theme", async () => {
    const instances: FakeAudio[] = [];
    let play = vi.fn().mockResolvedValue(undefined);
    let pause = vi.fn();
    vi.stubGlobal(
      "Audio",
      class {
        loop = false;
        volume = 1;
        currentTime = 0;
        paused = true;
        ended = false;
        preload = "";
        play = play;
        pause = pause;
        constructor(public src: string) {
          instances.push(this);
        }
      }
    );

    const { audio } = await import("./audio");
    audio.startPartyCreationMusic();
    expect(instances).toHaveLength(1);
    expect(instances[0]!.src).toContain("torchlight-beneath-stone.mp3");
    expect(instances[0]!.loop).toBe(true);
    expect(instances[0]!.volume).toBe(0.4);
    expect(play).toHaveBeenCalledTimes(1);

    audio.startPartyCreationMusic();
    expect(instances).toHaveLength(1);

    audio.stopPartyCreationMusic();
    expect(pause).toHaveBeenCalledTimes(1);
    expect(instances[0]!.currentTime).toBe(0);
  });

  it("does not play party creation music on resume unless wanted", async () => {
    const instances: FakeAudio[] = [];
    const play = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      "Audio",
      class {
        loop = false;
        volume = 1;
        currentTime = 0;
        paused = true;
        ended = false;
        preload = "";
        play = play;
        pause = vi.fn();
        constructor(public src: string) {
          instances.push(this);
        }
      }
    );

    const { audio } = await import("./audio");
    audio.resume();
    // Party creation music should not start on resume unless partyCreationMusicWanted is true
    expect(instances.length).toBe(0);
  });

  it("handles multiple start/stop cycles without overlapping instances", async () => {
    const instances: FakeAudio[] = [];
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    vi.stubGlobal(
      "Audio",
      class {
        loop = false;
        volume = 1;
        currentTime = 0;
        paused = true;
        ended = false;
        preload = "";
        play = play;
        pause = pause;
        constructor(public src: string) {
          instances.push(this);
        }
      }
    );

    const { audio } = await import("./audio");
    // First cycle
    audio.startPartyCreationMusic();
    expect(instances).toHaveLength(1);
    audio.stopPartyCreationMusic();
    expect(pause).toHaveBeenCalledTimes(1);

    // Second cycle - should reuse the same instance
    audio.startPartyCreationMusic();
    expect(instances).toHaveLength(1);
    audio.stopPartyCreationMusic();
    expect(pause).toHaveBeenCalledTimes(2);
  });
});
