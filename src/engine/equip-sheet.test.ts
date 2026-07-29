import { describe, it, expect } from "vitest";
import {
  resolveEquipPreview,
  equipItemNameHtml,
  summarizeLoadout,
  gearModsForLoadout,
  equipSheetHtml,
  equipSlotRowsHtml,
  STAT_ORDER,
  STAT_PAIRS,
} from "./equip-sheet";
import { createCharacter } from "../game/party";
import { CURSED_BLADE, ITEMS_BY_ID } from "../data/items";

describe("resolveEquipPreview", () => {
  const c = createCharacter("c1", "Aria", "Human", "Good", "Fighter", 0);
  const shortSword = ITEMS_BY_ID["short-sword"]!;
  const longSword = ITEMS_BY_ID["long-sword"]!;

  it("returns blocked with no next for unappraised candidate", () => {
    const r = resolveEquipPreview({
      character: c,
      current: { armor: [] },
      slot: "hand",
      row: { kind: "candidate", item: shortSword, identified: false },
    });
    expect(r.mode).toBe("blocked");
    expect(r.next).toBeNull();
  });

  it("returns blocked when current weapon is cursed", () => {
    const r = resolveEquipPreview({
      character: c,
      current: { weapon: CURSED_BLADE, armor: [] },
      slot: "hand",
      row: { kind: "candidate", item: longSword, identified: true },
    });
    expect(r.mode).toBe("blocked");
    expect(r.next).toBeNull();
    expect(r.warning).toMatch(/CURSED/i);
  });

  it("returns compare with next loadout for a legal identified swap", () => {
    const r = resolveEquipPreview({
      character: c,
      current: { weapon: shortSword, armor: [] },
      slot: "hand",
      row: { kind: "candidate", item: longSword, identified: true },
    });
    expect(r.mode).toBe("compare");
    expect(r.next?.weapon?.id).toBe("long-sword");
  });
});

describe("equipItemNameHtml", () => {
  it("keeps cursed badge outside the ellipsis name span", () => {
    const html = equipItemNameHtml(CURSED_BLADE);
    expect(html).toMatch(/equip-item-name/);
    expect(html).toMatch(/equip-cursed-badge/);
    expect(html).not.toMatch(/\(CURSED\)/);
    const nameClose = html.indexOf("</span>");
    expect(html.indexOf("equip-cursed-badge")).toBeGreaterThan(nameClose);
  });

  it("renders blank cell for empty (no em dash)", () => {
    const html = equipItemNameHtml(undefined);
    expect(html).toMatch(/equip-item-cell--empty/);
    expect(html).not.toContain("—");
  });
});

describe("summarizeLoadout / STAT_ORDER", () => {
  it("orders stats as 2×4 pairs STR|INT … ATK|DEF", () => {
    expect(STAT_PAIRS).toEqual([
      ["str", "int"],
      ["pie", "vit"],
      ["agi", "luk"],
      ["atk", "def"],
    ]);
    expect(STAT_ORDER.map((s) => s.key)).toEqual([
      "str",
      "int",
      "pie",
      "vit",
      "agi",
      "luk",
      "atk",
      "def",
    ]);
  });

  it("includes weapon attack in ATK", () => {
    const c = createCharacter("c1", "Aria", "Human", "Good", "Fighter", 0);
    c.level = 1;
    const sword = ITEMS_BY_ID["short-sword"]!;
    const s = summarizeLoadout(c, { weapon: sword, armor: [] });
    expect(s.atk).toBe(s.str + c.level + (sword.attackBonus ?? 0));
  });
});

describe("gearModsForLoadout", () => {
  it("marks ATK + when a weapon is equipped vs bare", () => {
    const c = createCharacter("c1", "Aria", "Human", "Good", "Fighter", 0);
    c.level = 1;
    const sword = ITEMS_BY_ID["short-sword"]!;
    const mods = gearModsForLoadout(c, { weapon: sword, armor: [] });
    expect(mods.atk).toBe("+");
  });

  it("marks ATK - for cursed blade vs bare", () => {
    const c = createCharacter("c1", "Aria", "Human", "Good", "Fighter", 0);
    c.level = 1;
    const mods = gearModsForLoadout(c, { weapon: CURSED_BLADE, armor: [] });
    expect(mods.atk).toBe("-");
  });

  it("leaves mods empty when bare", () => {
    const c = createCharacter("c1", "Aria", "Human", "Good", "Fighter", 0);
    const mods = gearModsForLoadout(c, { armor: [] });
    expect(mods.atk).toBe("");
    expect(mods.def).toBe("");
  });
});

describe("equipSheetHtml v4", () => {
  it("renders decorative Equip/Optimum/Empty tabs and upper band", () => {
    const c = createCharacter("c1", "Aria", "Human", "Good", "Fighter", 0);
    c.level = 1;
    const sword = ITEMS_BY_ID["short-sword"]!;
    const html = equipSheetHtml({
      character: c,
      loadout: { weapon: sword, armor: [] },
      preview: null,
      previewMode: "none",
      bottomHtml: "",
      animateSprite: false,
    });
    expect(html).toMatch(/equip-sheet-tabs/);
    expect(html).toMatch(/equip-sheet-tab--active/);
    expect(html).toMatch(/equip-sheet-tab--dim/);
    expect(html).toMatch(/>Equip</);
    expect(html).toMatch(/>Optimum</);
    expect(html).toMatch(/>Empty</);
    expect(html).toMatch(/equip-sheet-band/);
    expect(html).toMatch(/equip-sheet-identity/);
    expect(html).toMatch(/equip-sheet-name/);
    expect(html).toMatch(/equip-stat-cell/);
    expect(html).toMatch(/equip-stat-mod--up/);
    expect(html).not.toMatch(/equip-sheet-portrait/);
    expect(html).not.toMatch(/equip-sheet-compare-hint/);
    expect(html).not.toMatch(/equip-sheet-title/);
  });

  it("hides SP when maxSp is 0", () => {
    const c = createCharacter("c1", "Aria", "Human", "Good", "Fighter", 0);
    c.maxSp = 0;
    c.sp = 0;
    const html = equipSheetHtml({
      character: c,
      loadout: { armor: [] },
      preview: null,
      previewMode: "none",
      bottomHtml: "",
      animateSprite: false,
    });
    expect(html).toMatch(/equip-id-label">HP</);
    expect(html).not.toMatch(/equip-id-label">SP</);
  });

  it("slot rows label Auto; empty slots have no em dash", () => {
    const html = equipSlotRowsHtml(
      [
        { slot: "hand", label: "Weapon" },
        { slot: "body", label: "Body" },
        { slot: "shield", label: "Shield" },
        { slot: "head", label: "Head" },
      ],
      { armor: [] },
      4,
      () => undefined
    );
    expect(html).toMatch(/data-kind="auto-equip"/);
    expect(html).toMatch(/equip-row-label">Auto</);
    expect(html).toMatch(/equip-item-cell--empty/);
    expect(html).not.toContain("—");
    expect(html).not.toMatch(/Auto-Equip/);
  });
});
