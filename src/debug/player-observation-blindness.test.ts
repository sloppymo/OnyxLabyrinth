import { describe, expect, it } from "vitest";
import {
  buildPlayerObservation,
  findProhibitedPlayerFields,
  type PlayerObservation,
} from "./player-observation";

/**
 * Blindness contract: a serialized PlayerObservation must not contain
 * omniscient debug fields. This is the tripwire against future leaks.
 */
const REPRESENTATIVE: PlayerObservation = buildPlayerObservation({
  screen: "dungeon",
  heading: "F1 · N",
  danger: "◐ Active ▮▮▯",
  message: "The corridor stretches into warm stone.",
  prompt: "U Unlock",
  party: [
    { name: "Aria", hpText: "34/41", row: "Front", visibleStatus: [] },
    { name: "Coda", hpText: "28/28", row: "Front", visibleStatus: ["poison"] },
  ],
  hints: ["Tab:Actions", "Esc:Save"],
  learnedControls: ["Tab:Actions", "Esc:Save", "U Unlock"],
  audioDelta: [{ cue: "footstep", atMs: 40, durationMs: 120, silent: false }],
  timing: { actionToIdleMs: 274 },
  visual: { changed: true, kind: "compact" },
});

const COMBAT_REPRESENTATIVE: PlayerObservation = buildPlayerObservation({
  screen: "combat",
  party: [
    {
      name: "Aria",
      hpText: "34/41",
      rageText: "RG 8/16",
      visibleStatus: [],
      acting: true,
    },
  ],
  enemies: [
    {
      displayName: "Failed Experiment",
      count: 2,
      visibleHealth: "Wounded",
      visibleStatus: [],
    },
  ],
  menu: {
    title: "Target",
    entries: [{ label: "Failed Experiment", detail: "Wounded" }],
    selectedIndex: 0,
  },
  learnedControls: ["Enter confirm", "Escape cancel"],
});

const PROHIBITED_SUBSTRINGS = [
  "floorId",
  "unlockedDoors",
  "availableActions",
  "actingCharId",
  "perkIds",
  "knownSpellIds",
  "itemId",
  "jumpTo",
  "questFlags",
  "deepestFloorReached",
  "stepsSinceEncounter",
  "killedNPCs",
  "npcDisposition",
  "lootTaken",
  "eventsTriggered",
  "explored",
  '"warnings"',
  '"rng"',
  '"tile"',
  '"pos"',
];

describe("PlayerObservation blindness contract", () => {
  it("serializes a dungeon observation without prohibited omniscient fields", () => {
    const json = JSON.stringify(REPRESENTATIVE);
    expect(findProhibitedPlayerFields(REPRESENTATIVE)).toEqual([]);
    for (const token of PROHIBITED_SUBSTRINGS) {
      expect(json).not.toContain(token);
    }
    expect(json).not.toMatch(/"x"\s*:\s*\d+/);
    expect(json).not.toMatch(/"y"\s*:\s*\d+/);
    expect(json).not.toMatch(/"hp"\s*:\s*\d+/);
    expect(json).not.toMatch(/"maxHp"\s*:\s*\d+/);
  });

  it("serializes a combat observation with descriptors instead of exact enemy HP", () => {
    const json = JSON.stringify(COMBAT_REPRESENTATIVE);
    expect(findProhibitedPlayerFields(COMBAT_REPRESENTATIVE)).toEqual([]);
    expect(json).toContain("Wounded");
    expect(json).not.toMatch(/"hp"\s*:\s*\d+/);
    expect(json).not.toContain("actingCharId");
    expect(json).not.toContain("instanceId");
  });

  it("does not leak checkpoint setup coordinates when they are absent from input", () => {
    const obs = buildPlayerObservation({
      screen: "dungeon",
      heading: "F2 · N",
      party: [{ name: "Aria", hpText: "40/41", visibleStatus: [] }],
      learnedControls: [],
    });
    const json = JSON.stringify(obs);
    expect(json).not.toContain("abyss-bridge");
    expect(json).not.toContain("floorId");
    expect(json).not.toMatch(/"x"\s*:/);
    expect(findProhibitedPlayerFields(obs)).toEqual([]);
  });
});
