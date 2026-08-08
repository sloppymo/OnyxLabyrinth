/**
 * Pure game-logic layer for the Church of Saint Namanda: heal, bless,
 * uncurse, identify. No DOM — consumed by `engine/namanda-ui.ts`.
 *
 * Deliberately independent of `engine/town-ui.ts`'s Temple/Shop logic
 * (same pattern as `game/tavern.ts`'s `restParty` vs. the Inn) rather than
 * refactored to share it — the transactions are small and per-hub, and the
 * two hubs must stay free to diverge (see the differentiator notes below)
 * without one edit silently changing the other's behavior.
 */
import type { GameState } from "../types";
import type { CombatState } from "./combat-types";
import { ITEMS_BY_ID } from "../data/items";
import {
  REMOVE_CURSE_COST,
  APPRAISE_COST,
  NAMANDA_BLESSING_COST,
  NAMANDA_BLESSING_ARMOR_BONUS,
  NAMANDA_BLESSING_DURATION_STEPS,
} from "../data/service-prices";
import { blessParty, hasBuff } from "./persistent-spells";

export interface ServiceResult {
  ok: boolean;
  message: string;
}

// --- Heal ------------------------------------------------------------------

/**
 * Free, like Town's Temple — Camp already gives a free full restore
 * anywhere in the dungeon (`engine/camp-ui.ts`), so a paid Church heal
 * offering the same HP/SP/status restoration would just be strictly worse
 * than walking to Camp for nothing, not a real gold sink. Namanda's actual
 * differentiator is that unlike Camp (which dispels standing magic —
 * `persistent-spells.ts`'s `clearBuffs`), this does NOT touch
 * `state.persistentBuffs`: a party that just paid for a Blessing (or cast
 * Light/Levitate) keeps it after being healed here, which camping would
 * wipe out.
 */
export function healAtChurch(state: GameState): ServiceResult {
  for (const c of state.party) {
    c.hp = c.maxHp;
    c.sp = c.maxSp;
    c.status = [];
  }
  return { ok: true, message: "Wounds close. The party is whole again." };
}

// --- Identify ----------------------------------------------------------

/** Inventory indices of unidentified items, for the UI list. */
export function eligibleIdentifyTargets(state: GameState): number[] {
  return state.inventory
    .map((e, i) => (e.identified ? -1 : i))
    .filter((i) => i >= 0);
}

export function identifyAtChurch(state: GameState, invIndex: number): ServiceResult {
  const entry = state.inventory[invIndex];
  if (!entry || entry.identified) {
    return { ok: false, message: "Nothing here needs identifying." };
  }
  const item = ITEMS_BY_ID[entry.itemId];
  if (!item) return { ok: false, message: "" };
  if (state.partyGold < APPRAISE_COST) {
    return { ok: false, message: `Identifying costs ${APPRAISE_COST}g — you can't afford it.` };
  }
  state.partyGold -= APPRAISE_COST;
  entry.identified = true;
  const message = item.cursed
    ? `Namanda's attendant recoils — it's a ${item.name}, and it is CURSED!`
    : `Identified: ${item.name}.`;
  return { ok: true, message };
}

// --- Uncurse -------------------------------------------------------------

/** Equipped cursed items across the party, for the UI list. */
export function equippedCursedItems(
  state: GameState
): { charName: string; itemName: string }[] {
  const out: { charName: string; itemName: string }[] = [];
  for (const c of state.party) {
    const loadout = state.equipment[c.id];
    if (!loadout) continue;
    if (loadout.weapon?.cursed) out.push({ charName: c.name, itemName: loadout.weapon.name });
    for (const a of loadout.armor) {
      if (a.cursed) out.push({ charName: c.name, itemName: a.name });
    }
  }
  return out;
}

export function uncurseAtChurch(state: GameState): ServiceResult {
  const cursed = equippedCursedItems(state);
  if (cursed.length === 0) {
    return { ok: false, message: "No curses afflict the party." };
  }
  if (state.partyGold < REMOVE_CURSE_COST) {
    return { ok: false, message: `Uncursing costs ${REMOVE_CURSE_COST}g — you can't afford it.` };
  }
  state.partyGold -= REMOVE_CURSE_COST;
  for (const c of state.party) {
    const loadout = state.equipment[c.id];
    if (!loadout) continue;
    state.equipment[c.id] = {
      ...loadout,
      weapon: loadout.weapon?.cursed ? undefined : loadout.weapon,
      armor: loadout.armor.filter((a) => !a.cursed),
    };
  }
  state.inventory = state.inventory.filter((e) => !ITEMS_BY_ID[e.itemId]?.cursed);
  const names = cursed.map((c) => `${c.itemName} (${c.charName})`).join(", ");
  return { ok: true, message: `The curse breaks: ${names}.` };
}

// --- Blessing --------------------------------------------------------------

export function blessAtChurch(state: GameState): ServiceResult {
  if (state.partyGold < NAMANDA_BLESSING_COST) {
    return { ok: false, message: `A blessing costs ${NAMANDA_BLESSING_COST}g — you can't afford it.` };
  }
  const alreadyBlessed = hasBuff(state, "blessing");
  state.partyGold -= NAMANDA_BLESSING_COST;
  blessParty(state, NAMANDA_BLESSING_DURATION_STEPS);
  return {
    ok: true,
    message: alreadyBlessed
      ? "Namanda's blessing is renewed."
      : "Namanda's blessing settles over the party.",
  };
}

/**
 * Applies the active blessing's combat effect. Called once per combat, at
 * the top of `main.ts`'s `startCombat`, so every real fight (dungeon
 * encounters, NPC fights, the stairs guardian, Arena) picks it up uniformly
 * without threading a flag through each of their call sites. Reuses
 * `CombatState.armorBuffs` — the same field `priest-holy-aura` and other
 * "buff" spells write to (`combat-spells.ts`) — rather than adding a new
 * combat-state field or touching any formula site directly.
 */
export function applyNamandaBlessing(state: GameState, combat: CombatState): void {
  if (!hasBuff(state, "blessing")) return;
  for (const c of combat.party) {
    combat.armorBuffs[c.id] = (combat.armorBuffs[c.id] ?? 0) + NAMANDA_BLESSING_ARMOR_BONUS;
  }
}
