import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it("starts and stops the procedural boss combat bed", async () => {
    const oscillators: FakeNode[] = [];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const ctx = {
      state: "running",
      currentTime: 2,
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
    audio.startBossCombat();
    // 3 voice oscs + 1 LFO
    expect(oscillators).toHaveLength(4);
    expect(oscillators[0]!.frequency.value).toBe(46.25);
    expect(oscillators[1]!.frequency.value).toBe(65.4);
    expect(oscillators[2]!.frequency.value).toBe(92.5);

    audio.stopBossCombat();
    expect(oscillators.every((osc) => osc.stop.mock.calls.length === 1)).toBe(true);

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

describe("AudioEngine title music", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("loops Breath of the Undercroft and stops cleanly", async () => {
    const play = vi.fn(() => Promise.resolve());
    const pause = vi.fn();
    const instances: Array<{
      loop: boolean;
      volume: number;
      currentTime: number;
      paused: boolean;
      ended: boolean;
      play: typeof play;
      pause: typeof pause;
      preload: string;
    }> = [];

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
    const instances: Array<{
      src: string;
      loop: boolean;
      volume: number;
      currentTime: number;
      paused: boolean;
      ended: boolean;
      play: typeof play;
      pause: typeof pause;
    }> = [];

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
    const instances: Array<{
      src: string;
      loop: boolean;
      currentTime: number;
      paused: boolean;
      ended: boolean;
      play: typeof play;
      pause: typeof pause;
    }> = [];

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
    const instances: Array<{
      src: string;
      loop: boolean;
      volume: number;
      currentTime: number;
      paused: boolean;
      ended: boolean;
      play: typeof play;
      pause: typeof pause;
    }> = [];

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
});
