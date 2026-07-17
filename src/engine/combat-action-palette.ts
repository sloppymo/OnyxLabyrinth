import type { Character } from "../game/party";
import { isUtilitySpell, type SpellDef } from "../data/spells";
import type { ItemDef } from "../data/items";

export type PaletteSlot =
  | { kind: "attack" }
  | { kind: "defend" }
  | { kind: "cast"; disabled: boolean }
  | { kind: "skill"; disabled: boolean }
  | { kind: "item"; disabled: boolean }
  | { kind: "flee" };

export interface CombatPalette {
  slots: PaletteSlot[];
  itemButton: "select";
  autoButton: "start";
}

/**
 * Build the controller-style face-button action palette for a character.
 *
 * The palette exposes four face slots: Attack, Defend, Cast, Skill.
 * - Cast is disabled when the character has no usable combat spells, is
 *   silenced, or (when the caller supplies `currentSp`) cannot afford the
 *   cheapest known spell.
 * - Skill is never disabled: every class gets Analyze, with techniques
 *   (melee) or Hide/Ambush (Thief) listed above it.
 * - Items are not a face slot; they are opened with the Select button.
 */
export function buildPalette(
  c: Character,
  spells: SpellDef[],
  items: { item: ItemDef; count: number }[],
  options?: {
    silenced?: boolean;
    currentSp?: number;
    currentRage?: number;
  }
): CombatPalette {
  // Filter to combat-castable spells only (dungeon-only utility spells are
  // hidden, matching the combat spell list in combat-ui.ts).
  const combatSpells = spells.filter((s) => !isUtilitySpell(s));
  const hasSpells = combatSpells.length > 0;

  let castDisabled = !hasSpells || (options?.silenced ?? false);
  if (!castDisabled && options && "currentSp" in options) {
    const cheapest = Math.min(...combatSpells.map((s) => s.spCost));
    castDisabled = (options.currentSp ?? 0) < cheapest;
  }

  // The skill list always contains Analyze (universal intel verb), so the
  // slot is never disabled. Techniques (melee) and Hide/Ambush (Thief) sit
  // above it for the classes that have them.
  const skillDisabled = false;

  // `items` is accepted so future cost/durability checks can live here, but
  // for now the item button is always available and merely opens the item menu.
  // `c` is likewise currently unused — the skill slot no longer checks class.
  void items;
  void c;
  void options?.currentRage;

  const slots: PaletteSlot[] = [
    { kind: "attack" },
    { kind: "defend" },
    { kind: "cast", disabled: castDisabled },
    { kind: "skill", disabled: skillDisabled },
  ];

  return {
    slots,
    itemButton: "select",
    autoButton: "start",
  };
}
