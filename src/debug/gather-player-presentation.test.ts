import { describe, expect, it } from "vitest";
import { gatherPlayerPresentation } from "./gather-player-presentation";
import { findProhibitedPlayerFields } from "./player-observation";

describe("gatherPlayerPresentation", () => {
  it("builds a dungeon observation from HUD chrome without coordinates", () => {
    const obs = gatherPlayerPresentation({
      route: "dungeon",
      message: { text: "The door is locked.", visible: true },
      hud: {
        location: "F1 · N",
        danger: " · ◐ Active ▮▮▯",
        controls: " · Tab:Actions · Esc:Save",
        visible: true,
      },
      partyStrip: [{ name: "Aria", hpText: "34/41", row: "Front", visibleStatus: [] }],
      prompt: "U Unlock",
    });
    expect(obs.screen).toBe("dungeon");
    expect(obs.heading).toBe("F1 · N");
    expect(obs.message).toBe("The door is locked.");
    expect(obs.prompt).toBe("U Unlock");
    expect(findProhibitedPlayerFields(obs)).toEqual([]);
  });

  it("prefers combat presentation over the dungeon party strip", () => {
    const obs = gatherPlayerPresentation({
      route: "combat",
      message: { text: "", visible: false },
      partyStrip: [{ name: "ShouldNotAppear", hpText: "1/1", visibleStatus: [] }],
      combat: {
        party: [{ name: "Aria", hpText: "34/41", visibleStatus: [], acting: true }],
        enemies: [{ displayName: "Orc", count: 1, visibleStatus: [] }],
        menu: {
          title: "Aria",
          entries: [{ label: "A Attack" }, { label: "B Defend" }],
          selectedIndex: 0,
          footer: "I:Item · R:Run",
        },
      },
    });
    expect(obs.screen).toBe("combat");
    expect(obs.party?.[0].name).toBe("Aria");
    expect(obs.enemies?.[0].displayName).toBe("Orc");
    expect(JSON.stringify(obs)).not.toContain("ShouldNotAppear");
  });

  it("maps namanda overlay to the church screen without leaking the internal id", () => {
    const obs = gatherPlayerPresentation({
      route: "namanda",
      message: { text: "", visible: false },
      menu: { title: "Church of Saint Namanda", entries: [{ label: "Pray" }], selectedIndex: 0 },
    });
    expect(obs.screen).toBe("church");
    expect(JSON.stringify(obs)).not.toContain("namanda");
  });
});
