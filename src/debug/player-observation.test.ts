import { describe, expect, it } from "vitest";
import {
  applyPlayerObservationDelta,
  buildPlayerObservation,
  diffPlayerObservation,
  findProhibitedPlayerFields,
  playerScreenForRoute,
  summarizeAudio,
  type PlayerPresentationInput,
} from "./player-observation";

function dungeonInput(overrides: Partial<PlayerPresentationInput> = {}): PlayerPresentationInput {
  return {
    screen: "dungeon",
    heading: "F1 · N",
    danger: " · ◐ Active ▮▮▯",
    hints: ["Tab:Actions", "Esc:Save", "Y / V · MAP"],
    learnedControls: ["Arrow keys move", "Tab:Actions", "Esc:Save", "Y/V map"],
    party: [
      { name: "Aria", hpText: "34/41", row: "Front", visibleStatus: [] },
      { name: "Coda", hpText: "28/28", row: "Front", visibleStatus: ["poison"] },
      { name: "Dell", hpText: "18/22", row: "Back", visibleStatus: [] },
      { name: "Eve", hpText: "24/24", row: "Back", visibleStatus: [] },
    ],
    ...overrides,
  };
}

describe("playerScreenForRoute", () => {
  it("maps overlay routes to player-visible screen names", () => {
    expect(playerScreenForRoute("spell")).toBe("grimoire");
    expect(playerScreenForRoute("namanda")).toBe("church");
    expect(playerScreenForRoute("dungeon")).toBe("dungeon");
    expect(playerScreenForRoute("combat")).toBe("combat");
    expect(playerScreenForRoute("title")).toBe("title");
    expect(playerScreenForRoute("none")).toBe("dungeon");
  });
});

describe("buildPlayerObservation", () => {
  it("exposes dungeon HUD heading, danger, and party HP numerals without class or SP", () => {
    const obs = buildPlayerObservation(dungeonInput());
    expect(obs.schema).toBe(1);
    expect(obs.screen).toBe("dungeon");
    expect(obs.heading).toBe("F1 · N");
    expect(obs.danger).toBe("◐ Active ▮▮▯");
    expect(obs.party).toHaveLength(4);
    expect(obs.party?.[0]).toEqual({
      name: "Aria",
      hpText: "34/41",
      row: "Front",
      visibleStatus: [],
    });
    expect(obs.party?.[1].visibleStatus).toEqual(["poison"]);
    expect(obs.party?.[0].class).toBeUndefined();
    expect(obs.party?.[0].spText).toBeUndefined();
  });

  it("exposes the visible message overlay and contextual prompt", () => {
    const obs = buildPlayerObservation(
      dungeonInput({ message: "A locked door bars the way.", prompt: "U Unlock" })
    );
    expect(obs.message).toBe("A locked door bars the way.");
    expect(obs.prompt).toBe("U Unlock");
  });

  it("exposes combat menu, party HP/SP, and enemy descriptors — never exact enemy HP", () => {
    const obs = buildPlayerObservation({
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
          visibleStatus: ["poison"],
        },
      ],
      menu: {
        title: "Attack",
        entries: [
          { label: "Failed Experiment", detail: "Wounded" },
          { label: "Failed Experiment", detail: "Unwounded" },
        ],
        selectedIndex: 0,
      },
      combatLog: ["Aria attacks!"],
      learnedControls: ["Enter confirm"],
    });
    expect(obs.enemies?.[0].visibleHealth).toBe("Wounded");
    expect(obs.menu?.selectedIndex).toBe(0);
    expect(obs.party?.[0].acting).toBe(true);
    expect(obs.party?.[0].rageText).toBe("RG 8/16");
    expect(JSON.stringify(obs)).not.toMatch(/"hp"\s*:/);
    expect(JSON.stringify(obs)).not.toMatch(/"maxHp"\s*:/);
  });

  it("exposes town menu selection and gold when those are on screen", () => {
    const obs = buildPlayerObservation({
      screen: "town",
      menu: {
        title: "GILDED REST",
        entries: [
          { label: "Enter Dungeon" },
          { label: "Shop" },
          { label: "Temple" },
          { label: "Inn" },
        ],
        selectedIndex: 2,
        footer: "D-pad navigate · A select",
      },
      goldText: "Gold 100",
      learnedControls: ["Arrow keys", "Enter"],
    });
    expect(obs.menu?.title).toBe("GILDED REST");
    expect(obs.menu?.selectedIndex).toBe(2);
    expect(obs.goldText).toBe("Gold 100");
  });

  it("exposes camp roster class/level/SP because that screen prints them", () => {
    const obs = buildPlayerObservation({
      screen: "camp",
      party: [
        {
          name: "Aria",
          class: "Fighter",
          levelText: "Level 1",
          hpText: "41/41",
          spText: "0/0",
          row: "Front",
          visibleStatus: [],
        },
      ],
      menu: { entries: [{ label: "Rest" }, { label: "Formation" }], selectedIndex: 0 },
      learnedControls: [],
    });
    expect(obs.party?.[0].class).toBe("Fighter");
    expect(obs.party?.[0].levelText).toBe("Level 1");
    expect(obs.party?.[0].spText).toBe("0/0");
  });

  it("exposes title menu labels and the on-screen control footer", () => {
    const obs = buildPlayerObservation({
      screen: "title",
      menu: {
        title: "THE DESCENT",
        entries: [{ label: "New Game" }, { label: "Arena" }],
        selectedIndex: 0,
        footer: "D-pad navigate · A select",
      },
      hints: ["[N] New Game", "[A] Arena"],
      learnedControls: ["N new game", "A arena", "Enter select"],
    });
    expect(obs.menu?.entries.map((e) => e.label)).toEqual(["New Game", "Arena"]);
    expect(obs.hints).toContain("[N] New Game");
  });

  it("exposes party-creation, NPC dialogue, tavern, trap, save, game-over, and ending text", () => {
    const screens: Array<[PlayerPresentationInput, string]> = [
      [
        {
          screen: "party_creation",
          menu: { title: "Choose a party", entries: [{ label: "All Trades" }], selectedIndex: 0 },
          learnedControls: [],
        },
        "All Trades",
      ],
      [
        {
          screen: "npc",
          menu: { title: "Oren", entries: [{ label: "Talk" }, { label: "Leave" }], selectedIndex: 0 },
          message: "The bellkeeper watches the dark.",
          learnedControls: [],
        },
        "Oren",
      ],
      [
        {
          screen: "tavern",
          menu: { title: "HOT BOI'S", entries: [{ label: "Scorchboard" }], selectedIndex: 0 },
          learnedControls: [],
        },
        "HOT BOI'S",
      ],
      [
        {
          screen: "trap",
          menu: {
            title: "Trapped Chest",
            entries: [
              { label: "Inspect" },
              { label: "Disarm" },
              { label: "Open" },
              { label: "Leave" },
            ],
            selectedIndex: 1,
            footer: "I inspect · D disarm · O open · L leave",
          },
          learnedControls: ["I inspect"],
        },
        "Trapped Chest",
      ],
      [
        {
          screen: "save",
          menu: {
            title: "Save",
            entries: [{ label: "Slot 1 — empty" }, { label: "Slot 2 — empty" }],
            selectedIndex: 0,
          },
          learnedControls: [],
        },
        "Save",
      ],
      [
        {
          screen: "game_over",
          menu: { title: "The party has fallen", entries: [{ label: "Continue" }], selectedIndex: 0 },
          learnedControls: [],
        },
        "The party has fallen",
      ],
      [
        {
          screen: "ending",
          message: "You reached the bottom.",
          learnedControls: [],
        },
        "You reached the bottom.",
      ],
    ];

    for (const [input, needle] of screens) {
      const obs = buildPlayerObservation(input);
      const blob = JSON.stringify(obs);
      expect(blob).toContain(needle);
      expect(obs.screen).toBe(input.screen);
    }
  });

  it("omits empty optional fields rather than sending nulls", () => {
    const obs = buildPlayerObservation({ screen: "title", learnedControls: [] });
    expect(obs.message).toBeUndefined();
    expect(obs.party).toBeUndefined();
    expect(obs.menu).toBeUndefined();
    expect(obs.enemies).toBeUndefined();
  });

  it("summarizes audio cues compactly and flags silent samples", () => {
    const obs = buildPlayerObservation(
      dungeonInput({
        audioDelta: [
          { cue: "proc:footstep", atMs: 12, durationMs: 120, silent: false },
          { cue: "dungeon:doorOpen", atMs: 80, durationMs: 420, silent: true },
        ],
      })
    );
    expect(obs.audioSummary).toBe("AUDIO: footstep -> door open (silent)");
    expect(obs.audioDelta).toHaveLength(2);
    expect(obs.audioDelta?.map((c) => c.cue)).toEqual(["footstep", "door open"]);
    expect(JSON.stringify(obs)).not.toContain("proc:");
    expect(JSON.stringify(obs)).not.toContain("dungeon:");
  });
});

describe("diffPlayerObservation", () => {
  it("does not repeat unchanged party after an ordinary dungeon step", () => {
    const first = buildPlayerObservation(dungeonInput());
    const second = buildPlayerObservation(
      dungeonInput({
        heading: "F1 · E",
        audioDelta: [{ cue: "proc:footstep", atMs: 0, durationMs: 120, silent: false }],
        timing: { actionToIdleMs: 280 },
        visual: { changed: true, kind: "compact" },
      })
    );
    const delta = diffPlayerObservation(first, second);
    expect(delta.changed.heading).toBe("F1 · E");
    expect(delta.unchanged).toContain("party");
    expect(delta.changed.party).toBeUndefined();
    expect(delta.timing?.actionToIdleMs).toBe(280);
    expect(delta.audioSummary).toContain("footstep");
  });

  it("can reconstruct a full observation from previous + delta", () => {
    const first = buildPlayerObservation(dungeonInput());
    const second = buildPlayerObservation(
      dungeonInput({ heading: "F1 · E", message: "The door is locked." })
    );
    const delta = diffPlayerObservation(first, second);
    const rebuilt = applyPlayerObservationDelta(first, delta);
    expect(rebuilt.heading).toBe("F1 · E");
    expect(rebuilt.message).toBe("The door is locked.");
    expect(rebuilt.party).toEqual(second.party);
  });
});

describe("findProhibitedPlayerFields", () => {
  it("accepts a representative player observation", () => {
    const obs = buildPlayerObservation(
      dungeonInput({
        message: "A locked door bars the way.",
        prompt: "U Unlock",
        audioDelta: [{ cue: "proc:footstep", atMs: 0, durationMs: 120, silent: false }],
      })
    );
    expect(findProhibitedPlayerFields(obs)).toEqual([]);
  });

  it("flags omniscient coordinates, exact HP, keys, and debug verbs", () => {
    const leak = {
      schema: 1,
      screen: "dungeon",
      pos: { x: 11, y: 39 },
      floorId: 1,
      explored: ["11,39"],
      unlockedDoors: ["1:11:39:n"],
      availableActions: ["forward"],
      warnings: ["hp out of range"],
      enemies: [{ name: "Orc", hp: 47, maxHp: 60 }],
      keys: ["iron-key"],
      itemId: "voidblade+4",
      perkIds: ["fighter-guardian"],
      knownSpellIds: ["mage-fire-bolt"],
      actingCharId: "c1",
    };
    const found = findProhibitedPlayerFields(leak);
    expect(found).toEqual(expect.arrayContaining(["coordinates", "hp", "floorId", "explored"]));
    expect(found).toEqual(expect.arrayContaining(["availableActions", "warnings", "actingCharId"]));
  });

  it("flags unsanitized audio-spy ids", () => {
    expect(findProhibitedPlayerFields({ audioDelta: [{ cue: "proc:footstep" }] })).toContain(
      "audioSpyId"
    );
  });
});

describe("summarizeAudio", () => {
  it("returns undefined for an empty delta", () => {
    expect(summarizeAudio([])).toBeUndefined();
    expect(summarizeAudio(undefined)).toBeUndefined();
  });
});
