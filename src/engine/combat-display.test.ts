import { describe, it, expect } from "vitest";
import {
  enemyHealthDescriptor,
  partyStatusText,
  hpBarColorClass,
  hpRatio,
  spellMagicCategory,
  spellElementLabel,
  type SpellMagicCategory,
} from "./combat-display";
import { createCharacterRecord } from "../game/party";
import type { SpellEffect } from "../data/spells";

describe("enemyHealthDescriptor", () => {
  it("describes full health as unwounded", () => {
    expect(enemyHealthDescriptor(100, 100)).toBe("Unwounded");
  });

  it("describes a small scratch as lightly wounded", () => {
    expect(enemyHealthDescriptor(80, 100)).toBe("Lightly wounded");
  });

  it("describes moderate damage as wounded", () => {
    expect(enemyHealthDescriptor(50, 100)).toBe("Wounded");
  });

  it("describes heavy damage as badly wounded", () => {
    expect(enemyHealthDescriptor(20, 100)).toBe("Badly wounded");
  });

  it("describes near-zero health as near death", () => {
    expect(enemyHealthDescriptor(5, 100)).toBe("Near death");
  });

  it("describes zero health as defeated", () => {
    expect(enemyHealthDescriptor(0, 100)).toBe("Defeated");
  });
});

describe("partyStatusText", () => {
  it("returns OK for a healthy character", () => {
    const c = createCharacterRecord("c1", "Aria", "Human", "Good", "Fighter", 0);
    expect(partyStatusText(c)).toBe("OK");
  });

  it("returns the first active status", () => {
    const c = createCharacterRecord("c1", "Aria", "Human", "Good", "Fighter", 0);
    c.status.push("poison");
    expect(partyStatusText(c)).toBe("poison");
  });

  it("returns Fallen for a knocked-out character", () => {
    const c = createCharacterRecord("c1", "Aria", "Human", "Good", "Fighter", 0);
    c.hp = 0;
    c.status.push("knockedOut");
    expect(partyStatusText(c)).toBe("Fallen");
  });
});

describe("hp helpers", () => {
  it("computes HP ratio", () => {
    const c = createCharacterRecord("c1", "Aria", "Human", "Good", "Fighter", 0);
    c.hp = 14;
    c.maxHp = 28;
    expect(hpRatio(c)).toBe(0.5);
  });

  it("picks low HP bar color", () => {
    expect(hpBarColorClass(0.2)).toBe("low");
  });

  it("picks mid HP bar color", () => {
    expect(hpBarColorClass(0.4)).toBe("mid");
  });

  it("leaves high HP bar color as default", () => {
    expect(hpBarColorClass(0.8)).toBe("");
  });
});

describe("spellMagicCategory", () => {
  const cases: [SpellEffect["kind"] | SpellEffect, SpellMagicCategory | null][] = [
    [{ kind: "damage", element: "fire", power: 10 }, "offense"],
    [{ kind: "summon", power: 2 }, "offense"],
    [{ kind: "heal", power: 12 }, "defense"],
    [{ kind: "resurrect" }, "defense"],
    [{ kind: "magicScreen", power: 5 }, "defense"],
    [{ kind: "buff", stat: "armor" }, "buffs"],
    [{ kind: "disable", status: "sleep" }, "status"],
    [{ kind: "cure", status: "poison" }, "status"],
    [{ kind: "fizzleField", power: 5 }, "status"],
    [{ kind: "dispelMagic" }, "status"],
    [{ kind: "combatStatus", status: "shrunk" }, "status"],
    [{ kind: "combatStatus", status: "giantStrength", duration: 3 }, "status"],
    [{ kind: "light", duration: 10 }, null],
    [{ kind: "detect" }, null],
  ];

  it.each(cases)("maps %j → %s", (effect, expected) => {
    expect(spellMagicCategory(effect as SpellEffect)).toBe(expected);
  });

  it("labels damage elements and dashes others", () => {
    expect(spellElementLabel({ kind: "damage", element: "cold", power: 5 })).toBe("Cold");
    expect(spellElementLabel({ kind: "heal", power: 10 })).toBe("—");
  });
});
