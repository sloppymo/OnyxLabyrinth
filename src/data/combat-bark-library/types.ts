/**
 * Typed content model for the (unwired, standalone) combat bark CONTENT
 * LIBRARY — see `src/game/combat-bark-library.ts` for the pure selector.
 *
 * NOTE: the repo already ships a small, separate, integrated bark MVP at
 * `src/data/combat-barks.ts` / `src/game/combat-barks.ts` (3 triggers, 10
 * lines, wired into combat-actions.ts/combat-enemy.ts/combat-eor.ts/
 * combat.ts). This library is deliberately named and pathed to never
 * collide with it. It is NOT wired into combat resolution, combat UI, or
 * timing — see `docs/COMBAT-BARK-INTEGRATION-CONTRACT.md` for how the two
 * relate and what a later integration pass should do.
 *
 * Deliberately not built: a conversation graph, a dialogue VM, nested
 * predicates, or a branching story system. A bark is one short line keyed
 * off one trigger; that's the whole model.
 */

/**
 * How much language an entity is capable of producing.
 *  - articulate: normal spoken language (PC classes, intelligent humanoids).
 *  - fragmentary: understands enough for sparse words/phrases, not conversation
 *    (skeletons, undead, ghosts).
 *  - vocalization: creature noises and very primitive expressive noises, with
 *    rare single-word exceptions where a profile explicitly allows them
 *    (slimes). Never full sentences.
 *  - silent: mostly no bark. Rare asterisk sound-beats ("*metal groan*") only.
 */
export type BarkVoiceMode =
  | "articulate"
  | "fragmentary"
  | "vocalization"
  | "silent";

/**
 * Combat moments a bark can be keyed to. Kept close to what the engine
 * actually distinguishes today (see `CombatEvent` in `game/combat-types.ts`
 * and `EnemyAction` in the same file) plus the chemistry/formation vocabulary
 * from `docs/superpowers/specs/2026-08-14-formation-chemistry-combat-design.md`.
 * Not every trigger is used by every entity — coverage is intentionally
 * uneven (see the voice bible in `docs/COMBAT-BARK-AUDIT.md`).
 */
export type CombatBarkTrigger =
  | "combatStart"
  | "firstAction"
  | "basicAttack"
  | "attackMiss"
  | "criticalHit"
  | "takeHit"
  | "takeHeavyHit"
  | "lowHp"
  | "healed"
  | "buffed"
  | "debuffed"
  | "statusApplied"
  | "allyLowHp"
  | "allyDefeated"
  | "enemyDefeated"
  | "kill"
  | "ko"
  | "death"
  | "revived"
  | "flee"
  | "victory"
  | "abilityUse"
  | "spellCast"
  | "healCast"
  | "summoned"
  | "summonCreated"
  | "chemistrySelected"
  | "chemistryTelegraph"
  | "chemistryResolve"
  | "chemistryVictim"
  | "chemistryBreak"
  | "chemistryWitness"
  | "guardActivated"
  | "guardIntercept"
  | "bossPhase"
  | "returningEncounter"
  | "rare";

/**
 * Formation-chemistry ids, kebab-cased from the bold display names in
 * `docs/superpowers/specs/2026-08-14-formation-chemistry-combat-design.md`
 * §3 (enemy relationship matrix). That doc is the authoritative source for
 * the pairing and the display name; this file only derives a stable slug —
 * it does not redefine or reinterpret the chemistry itself, and the chemistry
 * *implementation* lives entirely on a different, untouched branch.
 *
 * The doc's enemy names ("Ogre", "Crypt Minotaur", "Construct") are display
 * names, not `EnemyDef.id`s, and some (the `Crypt *` floor-1 reskins) do not
 * exist in this branch's baseline (`origin/main`). Bark content below keyed
 * to a chemistry id therefore targets the base species EnemyDef that exists
 * today (e.g. `minotaur`, `big-titty-ogre`, `warlock`) — see
 * `docs/COMBAT-BARK-INTEGRATION-CONTRACT.md` for how a later pass should
 * remap this if the chemistry branch ships distinct variant ids.
 */
export type ChemistryId =
  | "slime-cannon"
  | "ogre-toss"
  | "bone-harvest"
  | "hunting-pack"
  | "rune-overload"
  | "spawn-bomb"
  | "living-shield"
  | "corrosive-cover"
  | "pack-leap"
  | "harvest-loop"
  | "combo-break";

export const ALL_CHEMISTRY_IDS: readonly ChemistryId[] = [
  "slime-cannon",
  "ogre-toss",
  "bone-harvest",
  "hunting-pack",
  "rune-overload",
  "spawn-bomb",
  "living-shield",
  "corrosive-cover",
  "pack-leap",
  "harvest-loop",
  "combo-break",
];

/** One bark line and the (optional) narrow conditions it requires. */
export interface CombatBarkLine {
  /**
   * The line itself. Working cap: <=28 chars (matches the real pixel-width
   * budget already tested for the shipped scene-bark surface, see
   * MAX_BARK_CHARS in src/data/combat-barks.ts) — the large majority of the
   * library hits this. Up to <=45 chars is an accepted exception for a
   * genuinely excellent rare/boss line destined for a wider display surface
   * (log flavor, banner). >80 chars is a hard-fail (audit script).
   */
  text: string;
  /** Relative weight in weighted selection. Default 1. */
  weight?: number;
  /** If true, this line may be spoken at most once per combat instance. */
  oncePerCombat?: boolean;
  /** Restricts this line to a specific ability (enemy ability id or PC technique/spell id). */
  abilityId?: string;
  /** Restricts this line to a specific formation-chemistry moment. */
  chemistryId?: ChemistryId;
  /** Restricts this line to a specific status effect (e.g. "poison", "paralysis"). */
  status?: string;
  /** Restricts this line to when the speaker itself is the enemy named here (rare — for
   *  witness/reaction lines keyed to a specific other identity, e.g. a Slime commenting
   *  only when a Minotaur is the one doing the throwing). */
  sourceEnemyId?: string;
  /** Restricts this line to when the event's other party is the enemy named here. */
  targetEnemyId?: string;
  /** Free-form classification tags for the preview/audit tooling (not read by the selector). */
  tags?: readonly string[];
}

export type BarkProfileKind = "enemy" | "class" | "companion";

/** A complete bark voice for one entity (enemy, PC class, or companion). */
export interface CombatBarkProfile {
  /** Stable id: EnemyDef.id, CharacterClass, or CompanionDef.id. */
  id: string;
  /** Display name, purely for the preview/audit tooling. */
  displayName: string;
  kind: BarkProfileKind;
  voiceMode: BarkVoiceMode;
  /** One-line voice description, mirrors the voice bible in the audit doc. */
  voiceSummary: string;
  /** Per-trigger pools. Absent trigger = no bark for that moment (selector returns null). */
  pools: Partial<Record<CombatBarkTrigger, readonly CombatBarkLine[]>>;
}

/**
 * Marks a production EnemyDef id as deliberately having no bark profile,
 * with a reason — so coverage tooling can distinguish "forgotten" from
 * "considered and excluded" (see docs/COMBAT-BARK-AUDIT.md Coverage section).
 */
export interface BarkSilentExclusion {
  id: string;
  reason: string;
}
