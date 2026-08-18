import { describe, expect, it } from "vitest";
import { scanPlayerLog } from "./leak-scan";

describe("scanPlayerLog", () => {
  it("accepts a clean emitted dungeon payload", () => {
    const line = JSON.stringify({
      index: 0,
      playerKey: "ArrowUp",
      emitted: {
        screen: "dungeon",
        delta: {
          schema: 1,
          screen: "dungeon",
          changed: { heading: "F1 · N" },
          unchanged: ["party"],
          learnedControls: ["Tab: Actions"],
          audioDelta: [{ cue: "footstep", atMs: 12, durationMs: 120, silent: false }],
        },
        screenshot: "step-1-compact.png",
      },
      observation: {
        schema: 1,
        screen: "dungeon",
        heading: "F1 · N",
        learnedControls: ["Tab: Actions"],
        party: [{ name: "Aria", hpText: "40/40", visibleStatus: [] }],
      },
    });
    const result = scanPlayerLog(`${line}\n`);
    expect(result.actions).toBe(1);
    expect(result.hits).toEqual([]);
    expect(result.screens).toEqual(["dungeon"]);
  });

  it("flags spy ids, coordinates, and absolute paths in serialized output", () => {
    const line = JSON.stringify({
      index: 3,
      playerKey: "Enter",
      emitted: {
        screen: "combat",
        delta: { audioDelta: [{ cue: "proc:footstep", atMs: 0, durationMs: 1, silent: false }] },
        screenshotPath: "/home/sloppymo/OnyxLabyrinth/.tmp-ai-player/run/media/x.png",
      },
      observation: { screen: "combat", pos: { x: 11, y: 39 } },
    });
    const result = scanPlayerLog(line);
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0].tokens).toEqual(
      expect.arrayContaining(["audioSpyId", "filesystemPath", "coordinates"])
    );
  });
});
