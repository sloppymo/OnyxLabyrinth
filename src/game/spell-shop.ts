import { spellById } from "../data/spells";
import type { NPCSpellShopDef } from "../data/floors";
import type { GameState } from "../types";

export interface SpellPurchaseResult {
  ok: boolean;
  message: string;
}

export function purchaseSpell(state: GameState, shop: NPCSpellShopDef, spellId: string): SpellPurchaseResult {
  const listing = shop.inventory.find((entry) => entry.spellId === spellId);
  const spell = spellById(spellId);
  if (!listing || !spell || spell.acquisition !== "iso-shop") return { ok: false, message: "That spell is not on offer." };
  const purchased = state.purchasedSpellIds ?? (state.purchasedSpellIds = []);
  if (purchased.includes(spellId)) return { ok: false, message: "You already know that one." };
  if (state.partyGold < listing.price) return { ok: false, message: "Not enough gold." };
  const eligible = state.party.filter((c) =>
    (spell.class === "Mage" && c.class === "Mage") ||
    (spell.class === "Priest" && (c.class === "Priest" || c.class === "Crusader"))
  );
  if (eligible.length === 0) return { ok: false, message: `No ${spell.class} can learn that spell.` };
  state.partyGold -= listing.price;
  state.purchasedSpellIds = [...purchased, spellId];
  for (const c of eligible) {
    if (!c.knownSpellIds.includes(spellId)) c.knownSpellIds = [...c.knownSpellIds, spellId];
  }
  return { ok: true, message: "Good choice." };
}

export function spellShopListing(shop: NPCSpellShopDef) {
  return shop.inventory.map((listing) => ({ listing, spell: spellById(listing.spellId) }));
}
