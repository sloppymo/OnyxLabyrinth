/**
 * Utility spells cast outside combat (dungeon G menu / camp "Cast a spell"):
 *
 *   Milwa   (light)      — party-wide buff; darkness zones don't blind the
 *                          party while it lasts (features.ts checks hasBuff).
 *   Litofit (levitation) — party-wide buff; the party floats over chutes
 *                          (and future hazards like pits/water).
 *   Dumapic (detect)     — instant; reveals exact position and facing.
 *
 * Buffs live in GameState.persistentBuffs, tick down one step per dungeon
 * move (tickBuffs is called from main.ts onMove), and are cleared when the
 * party camps (a night's rest dispels standing magic — re-cast after).
 */

import type { GameState, PersistentBuff } from "../types";
import type { SpellDef } from "../data/spells";
import { ALL_SPELLS, isUtilitySpell } from "../data/spells";

const SPELLS_BY_ID: Record<string, SpellDef> = Object.fromEntries(
  ALL_SPELLS.map((s) => [s.id, s])
);

const FACING_NAMES = ["north", "east", "south", "west"] as const;

/** One castable (caster, spell) pair for the cast menus. */
export interface UtilityCastOption {
  casterId: string;
  casterName: string;
  spell: SpellDef;
  /** False when the caster lacks the SP right now. */
  affordable: boolean;
}

/** All utility casts the party could attempt, for menu rendering. */
export function utilityCastOptions(state: GameState): UtilityCastOption[] {
  const options: UtilityCastOption[] = [];
  for (const c of state.party) {
    if (c.hp <= 0 || c.status.includes("knockedOut")) continue;
    for (const id of c.knownSpellIds) {
      const spell = SPELLS_BY_ID[id];
      if (!spell || !isUtilitySpell(spell)) continue;
      options.push({
        casterId: c.id,
        casterName: c.name,
        spell,
        affordable: c.sp >= spell.spCost,
      });
    }
  }
  return options;
}

/** True while a buff of the given kind is active. */
export function hasBuff(state: GameState, kind: PersistentBuff["kind"]): boolean {
  return state.persistentBuffs.some((b) => b.kind === kind && b.remainingSteps > 0);
}

/**
 * Cast a utility spell from the dungeon or camp. Validates caster, spell,
 * and SP; deducts SP and applies the effect. Returns the message to show.
 */
export function castUtilitySpell(
  state: GameState,
  casterId: string,
  spellId: string
): string {
  const caster = state.party.find((c) => c.id === casterId);
  const spell = SPELLS_BY_ID[spellId];
  if (!caster || !spell || !isUtilitySpell(spell)) return "";
  if (caster.hp <= 0 || caster.status.includes("knockedOut")) {
    return `${caster.name} is in no state to cast.`;
  }
  if (!caster.knownSpellIds.includes(spell.id)) {
    return `${caster.name} does not know ${spell.name}.`;
  }
  if (caster.sp < spell.spCost) {
    return `${caster.name} lacks the SP for ${spell.name}.`;
  }
  if (state.inAntimagic) {
    return "The anti-magic field drinks the spell away.";
  }

  caster.sp -= spell.spCost;
  const eff = spell.effect;

  if (eff.kind === "detect") {
    const { x, y, facing } = state.player;
    return `${spell.name}: (${x}, ${y}) on ${state.floor.name}, facing ${FACING_NAMES[facing]}.`;
  }

  if (eff.kind === "light" || eff.kind === "levitation") {
    setBuff(state, eff.kind, eff.duration);
    if (eff.kind === "light") {
      // Light immediately pushes back a darkness zone we're standing in.
      state.inDarkness = false;
      return `${caster.name} casts ${spell.name} — a soft radiance surrounds the party.`;
    }
    return `${caster.name} casts ${spell.name} — the party's feet lift from the stone.`;
  }

  return "";
}

/** Add or refresh a buff (re-casting resets the countdown, no stacking). */
function setBuff(state: GameState, kind: PersistentBuff["kind"], steps: number): void {
  const existing = state.persistentBuffs.find((b) => b.kind === kind);
  if (existing) {
    existing.remainingSteps = steps;
  } else {
    state.persistentBuffs.push({ kind, remainingSteps: steps });
  }
}

/**
 * Tick all buffs down one step (call once per dungeon move, before tile
 * features are processed). Returns expiry messages for the message bar.
 */
export function tickBuffs(state: GameState): string[] {
  const messages: string[] = [];
  for (const b of state.persistentBuffs) {
    b.remainingSteps--;
    if (b.remainingSteps <= 0) {
      messages.push(
        b.kind === "light"
          ? "The magical light gutters out."
          : "The party settles back onto the stone."
      );
    }
  }
  state.persistentBuffs = state.persistentBuffs.filter((b) => b.remainingSteps > 0);
  return messages;
}

/** Camping dispels standing magic (design decision: forces re-casting). */
export function clearBuffs(state: GameState): void {
  state.persistentBuffs = [];
}
