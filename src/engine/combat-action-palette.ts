import type { Character } from "../game/party";
import { isUtilitySpell, type SpellDef } from "../data/spells";
import { classHasTechniques, techniquesForClass } from "../data/techniques";
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
 * - Skill is disabled when the class has no skill actions. Thieves always
 *   have Hide/Ambush; melee classes with rage techniques have Skill if any
 *   technique is available at their level.
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

  const hasSkillActions =
    c.class === "Thief" ||
    (classHasTechniques(c.class) &&
      techniquesForClass(c.class, c.level).length > 0);
  const skillDisabled = !hasSkillActions;

  // `items` is accepted so future cost/durability checks can live here, but
  // for now the item button is always available and merely opens the item menu.
  void items;
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
