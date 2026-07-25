import { describe, it, expect, vi } from "vitest";
import { AudioCueLog, installAudioSpy, PROCEDURAL_CUE_MS } from "./audio-spy";

function fixedClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

/** Minimal stand-in for the AudioEngine surface the spy patches. */
function fakeAudio() {
  return {
    playUi: vi.fn(),
    playCombatSfx: vi.fn(),
    playDungeonSfx: vi.fn(),
    footstep: vi.fn(),
    doorOpen: vi.fn(),
    doorLocked: vi.fn(),
    levelUp: vi.fn(),
    uiTextTick: vi.fn(),
    // Sample buffers the engine keeps privately; the spy reads them to tell
    // "cue fired and was audible" from "cue fired but the WAV never loaded."
    combatBuffers: { attackHit: { duration: 0.25 } },
    dungeonBuffers: {},
    uiBuffers: { cursor: { duration: 0.1 } },
  };
}

describe("AudioCueLog", () => {
  it("records cues with firedAt and computed endsAt", () => {
    const clock = fixedClock(1000);
    const log = new AudioCueLog({ now: clock.now });
    log.record("ui:cursor", 100, false);
    const [rec] = log.recent();
    expect(rec).toMatchObject({
      id: "ui:cursor",
      firedAt: 1000,
      durationMs: 100,
      endsAt: 1100,
      bufferMissing: false,
    });
  });

  it("reports only still-sounding cues from playingNow", () => {
    const clock = fixedClock(0);
    const log = new AudioCueLog({ now: clock.now });
    log.record("combat:attackHit", 250, false);
    clock.advance(100);
    log.record("ui:cursor", 100, false);

    clock.advance(50); // t=150: attackHit ends at 250, cursor ended at 200
    expect(log.playingNow().sort()).toEqual(["combat:attackHit", "ui:cursor"]);

    clock.advance(60); // t=210: cursor finished
    expect(log.playingNow()).toEqual(["combat:attackHit"]);

    clock.advance(100); // t=310: both finished
    expect(log.playingNow()).toEqual([]);
  });

  it("treats an unknown duration as not currently playing", () => {
    const log = new AudioCueLog({ now: () => 0 });
    log.record("proc:footstep", null, false);
    expect(log.recent()[0]!.endsAt).toBeNull();
    expect(log.playingNow()).toEqual([]);
  });

  it("marks cues whose sample never loaded", () => {
    const log = new AudioCueLog({ now: () => 0 });
    log.record("dungeon:chestOpen", null, true);
    expect(log.recent()[0]!.bufferMissing).toBe(true);
  });

  it("caps retained records and returns the most recent n", () => {
    const log = new AudioCueLog({ now: () => 0, capacity: 3 });
    for (let i = 0; i < 5; i++) log.record(`ui:c${i}`, 10, false);
    expect(log.recent().map((r) => r.id)).toEqual(["ui:c2", "ui:c3", "ui:c4"]);
    expect(log.recent(1).map((r) => r.id)).toEqual(["ui:c4"]);
  });
});

describe("installAudioSpy", () => {
  it("records sample cues with the duration from the loaded buffer", () => {
    const audio = fakeAudio();
    const clock = fixedClock(500);
    const spy = installAudioSpy(audio, { now: clock.now });

    audio.playCombatSfx("attackHit");

    const [rec] = spy.log.recent();
    expect(rec).toMatchObject({
      id: "combat:attackHit",
      firedAt: 500,
      durationMs: 250,
      bufferMissing: false,
    });
    spy.uninstall();
  });

  it("flags a cue whose sample buffer is absent", () => {
    const audio = fakeAudio();
    const spy = installAudioSpy(audio, { now: () => 0 });

    audio.playDungeonSfx("chestOpen");

    expect(spy.log.recent()[0]).toMatchObject({
      id: "dungeon:chestOpen",
      bufferMissing: true,
      durationMs: null,
    });
    spy.uninstall();
  });

  it("records procedural cues with their catalog duration", () => {
    const audio = fakeAudio();
    const spy = installAudioSpy(audio, { now: () => 0 });

    audio.doorOpen();

    expect(spy.log.recent()[0]).toMatchObject({
      id: "proc:doorOpen",
      durationMs: PROCEDURAL_CUE_MS.doorOpen,
      bufferMissing: false,
    });
    spy.uninstall();
  });

  it("still calls through to the real method", () => {
    const audio = fakeAudio();
    const underlying = audio.playCombatSfx;
    const spy = installAudioSpy(audio, { now: () => 0 });
    audio.playCombatSfx("attackHit");
    expect(underlying).toHaveBeenCalledWith("attackHit");
    spy.uninstall();
  });

  it("forwards each cue to onCue for the event buffer", () => {
    const audio = fakeAudio();
    const onCue = vi.fn();
    const spy = installAudioSpy(audio, { now: () => 0, onCue });
    audio.footstep();
    expect(onCue).toHaveBeenCalledTimes(1);
    expect(onCue.mock.calls[0]![0]).toMatchObject({ id: "proc:footstep" });
    spy.uninstall();
  });

  it("uninstall restores the original methods", () => {
    const audio = fakeAudio();
    const original = audio.playCombatSfx;
    const spy = installAudioSpy(audio, { now: () => 0 });
    expect(audio.playCombatSfx).not.toBe(original);
    spy.uninstall();
    expect(audio.playCombatSfx).toBe(original);
  });
});
