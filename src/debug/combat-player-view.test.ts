import { describe, expect, it } from "vitest";
import { buildCombatPlayerView } from "./combat-player-view";
import { findProhibitedPlayerFields } from "./player-observation";

describe("buildCombatPlayerView", () => {
  it("prints party HP numerals and rage/SP the roster actually shows", () => {
    const view = buildCombatPlayerView({
      actingName: "Aria",
      party: [
        {
          name: "Aria",
          hp: 34,
          maxHp: 41,
          sp: 0,
          maxSp: 0,
          rage: 8,
          maxRage: 16,
          hasTechniques: true,
          status: [],
          acting: true,
          row: "Front",
        },
        {
          name: "Dell",
          hp: 18,
          maxHp: 22,
          sp: 12,
          maxSp: 12,
          hasTechniques: false,
          status: ["poison", "hidden"],
          acting: false,
          row: "Back",
        },
      ],
      enemyGroups: [],
    });
    expect(view.party[0]).toMatchObject({
      name: "Aria",
      hpText: "34/41",
      rageText: "RG 8/16",
      acting: true,
    });
    expect(view.party[0].spText).toBeUndefined();
    expect(view.party[1].spText).toBe("12/12");
    expect(view.party[1].visibleStatus).toEqual(["poison"]);
  });

  it("omits enemy health until the UI is showing a descriptor, and never emits exact HP", () => {
    const hidden = buildCombatPlayerView({
      actingName: null,
      party: [],
      enemyGroups: [
        { displayName: "Failed Experiment", count: 2, statuses: [], currentHp: 47, maxHp: 60 },
      ],
    });
    expect(hidden.enemies[0].visibleHealth).toBeUndefined();
    expect(JSON.stringify(hidden)).not.toMatch(/"hp"\s*:/);

    const targeting = buildCombatPlayerView({
      actingName: "Aria",
      party: [],
      enemyGroups: [
        {
          displayName: "Failed Experiment",
          count: 1,
          statuses: ["poison"],
          currentHp: 30,
          maxHp: 60,
          showHealthDescriptor: true,
        },
      ],
      menu: {
        title: "Target",
        entries: [{ label: "Failed Experiment", detail: "Wounded" }],
        selectedIndex: 0,
      },
    });
    expect(targeting.enemies[0].visibleHealth).toBe("Wounded");
    expect(findProhibitedPlayerFields(targeting)).toEqual([]);
  });

  it("does not expose hidden status or acting character ids", () => {
    const view = buildCombatPlayerView({
      actingName: "Aria",
      party: [
        {
          name: "Aria",
          hp: 10,
          maxHp: 10,
          sp: 0,
          maxSp: 0,
          hasTechniques: false,
          status: ["hidden", "exposed"],
          acting: true,
        },
      ],
      enemyGroups: [{ displayName: "Orc", count: 1, statuses: ["hidden"] }],
    });
    expect(view.party[0].visibleStatus).toEqual([]);
    expect(view.enemies[0].visibleStatus).toEqual([]);
    expect(JSON.stringify(view)).not.toContain("c1");
    expect(JSON.stringify(view)).not.toContain("actingCharId");
  });
});
