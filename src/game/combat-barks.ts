/**
 * Pure bark picker + isolated RNG. Presentation only — never touches combat math RNG.
 * Spec: docs/superpowers/specs/2026-07-26-combat-dialog-barks.md
 */

import {
  BARK_PRIORITY,
  COMBAT_BARKS,
  MAX_BARK_CHARS,
  type BarkLineDef,
  type BarkTrigger,
} from "../data/combat-barks";
import type { CharacterClass } from "./party";
import type { CombatEvent, CombatState, EnemyInstance } from "./combat-types";
import type { SpellDef } from "../data/spells";

export type { BarkTrigger };
export { BARK_PRIORITY, MAX_BARK_CHARS, COMBAT_BARKS };

/** Mulberry32 — tiny deterministic PRNG; module-level, never on CombatState. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

let barkCombatSerial = 0;
let barkRng: () => number = mulberry32(1);

/** Call once at each combat start so line order varies across fights. */
export function resetBarkRngForCombat(seed?: number): void {
  barkCombatSerial += 1;
  const s = seed ?? (Date.now() ^ (barkCombatSerial * 0x9e3779b9));
  barkRng = mulberry32(s >>> 0);
}

/** Test seam — inject a fixed sequence without touching combat RNG. */
export function setBarkRngForTests(rng: () => number): void {
  barkRng = rng;
}

export interface BarkPickContext {
  trigger: BarkTrigger;
  actorId: string;
  /** Required for heavyHit party gate and death/class filters. */
  classId?: CharacterClass;
  /** Enemy def id (not instanceId) when the speaker is an enemy. */
  enemyDefId?: string;
  /** beforeSpell only. */
  spell?: SpellDef;
  /**
   * When true, speaker is a party character. heavyHit only fires for party
   * in v1; death/beforeSpell use class/enemy filters instead.
   */
  isParty: boolean;
  /** Override table for tests. */
  table?: readonly BarkLineDef[];
}

function speakerMatches(def: BarkLineDef, ctx: BarkPickContext): boolean {
  const sp = def.speaker;
  if (!sp) return true;
  if (sp.classIds?.length) {
    if (!ctx.classId || !sp.classIds.includes(ctx.classId)) return false;
  }
  if (sp.enemyIds?.length) {
    if (!ctx.enemyDefId || !sp.enemyIds.includes(ctx.enemyDefId)) return false;
  }
  return true;
}

function spellElement(spell: SpellDef): string | undefined {
  if (spell.effect.kind === "damage") return spell.effect.element;
  return undefined;
}

function spellMatches(def: BarkLineDef, ctx: BarkPickContext): boolean {
  if (ctx.trigger !== "beforeSpell") return true;
  const filter = def.spell;
  if (!filter) return true;
  const spell = ctx.spell;
  if (!spell) return false;
  if (filter.spellIds?.length && !filter.spellIds.includes(spell.id)) return false;
  if (filter.elements?.length) {
    const el = spellElement(spell);
    if (!el || !filter.elements.includes(el)) return false;
  }
  return true;
}

function weightedPick<T extends { weight?: number }>(items: T[], rng: () => number): T | null {
  if (items.length === 0) return null;
  let total = 0;
  for (const it of items) total += it.weight ?? 1;
  let roll = rng() * total;
  for (const it of items) {
    roll -= it.weight ?? 1;
    if (roll <= 0) return it;
  }
  return items[items.length - 1]!;
}

/**
 * Pick a bark line for this trigger/actor. Marks barkSaid on success.
 * Uses module bark RNG only — never the combat rng argument.
 */
export function pickBark(s: CombatState, ctx: BarkPickContext): string | null {
  if (ctx.trigger === "heavyHit" && !ctx.isParty) return null;

  const said = s.barkSaid[ctx.actorId];
  if (said?.[ctx.trigger]) return null;

  const table = ctx.table ?? COMBAT_BARKS;
  const matches = table.filter(
    (d) => d.trigger === ctx.trigger && speakerMatches(d, ctx) && spellMatches(d, ctx)
  );
  const def = weightedPick(matches, barkRng);
  if (!def || def.lines.length === 0) return null;

  const line = def.lines[Math.floor(barkRng() * def.lines.length)]!;
  if (!s.barkSaid[ctx.actorId]) s.barkSaid[ctx.actorId] = {};
  s.barkSaid[ctx.actorId]![ctx.trigger] = true;
  return line;
}

export function speakerDisplayName(s: CombatState, actorId: string): string {
  const c = s.party.find((p) => p.id === actorId);
  if (c) return c.name;
  const e =
    s.enemies.front.find((x) => x.instanceId === actorId) ??
    s.enemies.back.find((x) => x.instanceId === actorId) ??
    s.justDied.find((x) => x.instanceId === actorId);
  if (e) return e.name;
  const a =
    s.summonedAllies.find((x) => x.id === actorId) ??
    s.justDiedAllies.find((x) => x.id === actorId);
  return a?.name ?? actorId;
}

/** Emit a bark event + log line if pickBark succeeds. */
export function maybeEmitBark(
  s: CombatState,
  emit: (m: string, e: CombatEvent) => void,
  ctx: BarkPickContext
): void {
  const text = pickBark(s, ctx);
  if (!text) return;
  const name = speakerDisplayName(s, ctx.actorId);
  emit(`${name}: "${text}"`, {
    type: "bark",
    actorId: ctx.actorId,
    trigger: ctx.trigger,
    text,
  });
}

export function isHeavyHit(damage: number, maxHp: number): boolean {
  if (maxHp <= 0 || damage <= 0) return false;
  return damage >= Math.ceil(maxHp * 0.35);
}

export function enemyDefIdFromInstance(e: EnemyInstance): string {
  // instanceId is `${enemy.id}-${idx}` — strip trailing -N
  const m = e.instanceId.match(/^(.*)-\d+$/);
  return m?.[1] ?? e.id;
}

/** Recent log lines for the FF6 window — skip entries paired with bark events. */
export function visibleCombatLogLines(
  log: readonly string[],
  events: readonly CombatEvent[],
  limit: number
): string[] {
  const out: string[] = [];
  for (let i = log.length - 1; i >= 0 && out.length < limit; i--) {
    const ev = events[i];
    if (ev && ev.type === "bark") continue;
    out.push(log[i]!);
  }
  return out.reverse();
}
