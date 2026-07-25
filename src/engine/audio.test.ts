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
});
