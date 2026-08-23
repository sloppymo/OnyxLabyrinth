import { describe, expect, it } from "vitest";
import { ALL_SPELLS, spellsForClass } from "../data/spells";
import { purchaseSpell } from "./spell-shop";
import { createGameState } from "./state";
import { createLegacyParty } from "./party";
import { loadExtraFloors } from "../content/floors";

function stateWithGold(gold: number) {
  const state = createGameState(loadExtraFloors().find((f) => f.id === 1)!, createLegacyParty());
  state.partyGold = gold;
  return state;
}

const shop = loadExtraFloors().find((f) => f.id === 1)!.npcs!.find((n) => n.id === "isobel")!.shop!;

describe("Isobel's Iso-spell shop", () => {
  it("keeps Iso-spells out of ordinary tier progression", () => {
    expect(spellsForClass("Mage", 7).some((s) => s.id === "mage-isoflare")).toBe(false);
    expect(spellsForClass("Priest", 7).some((s) => s.id === "priest-isorevive")).toBe(false);
    expect(ALL_SPELLS.find((s) => s.id === "mage-isoflare")?.acquisition).toBe("iso-shop");
  });

  it("deducts the exact price once and teaches eligible casters", () => {
    const state = stateWithGold(60000);
    const mage = state.party.find((c) => c.class === "Mage")!;
    const before = state.partyGold;
    const result = purchaseSpell(state, shop, "mage-isoflare");
    expect(result.ok).toBe(true);
    expect(state.partyGold).toBe(before - 3200);
    expect(mage.knownSpellIds).toContain("mage-isoflare");
    expect(purchaseSpell(state, shop, "mage-isoflare").ok).toBe(false);
    expect(state.partyGold).toBe(before - 3200);
  });

  it("does not mutate gold or knowledge when unaffordable", () => {
    const state = stateWithGold(1842);
    const before = state.partyGold;
    const result = purchaseSpell(state, shop, "priest-isorevive");
    expect(result).toEqual({ ok: false, message: "Not enough gold." });
    expect(state.partyGold).toBe(before);
    expect(state.party.some((c) => c.knownSpellIds.includes("priest-isorevive"))).toBe(false);
  });

  it("rejects non-shop or invalid spell ids", () => {
    const state = stateWithGold(999999);
    expect(purchaseSpell(state, shop, "mage-fireball").ok).toBe(false);
    expect(purchaseSpell(state, shop, "does-not-exist").ok).toBe(false);
  });
});
