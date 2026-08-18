/**
 * Map combat presentation into player-visible fields.
 *
 * Uses the same qualitative health descriptor the combat UI prints. Exact
 * enemy HP, instance ids, and acting character ids stay in debugView().
 */

import { enemyHealthDescriptor } from "../engine/combat-display";
import type { PlayerEnemy, PlayerMenu, PlayerPartyMember } from "./player-observation";

/** Status tags the combat windows actually render (not hidden/internal). */
export const COMBAT_VISIBLE_STATUSES = [
  "poison",
  "paralysis",
  "sleep",
  "blind",
  "shrunk",
  "giantStrength",
  "burn",
  "regen",
] as const;

export interface CombatPlayerPartyRow {
  name: string;
  hp: number;
  maxHp: number;
  sp: number;
  maxSp: number;
  rage?: number;
  maxRage?: number;
  hasTechniques: boolean;
  status: string[];
  acting: boolean;
  row?: "Front" | "Back";
}

export interface CombatPlayerEnemyGroup {
  displayName: string;
  count: number;
  statuses: string[];
  extraTags?: string[];
  /** Exact HP used only to format a descriptor when the UI is showing one. */
  currentHp?: number;
  maxHp?: number;
  showHealthDescriptor?: boolean;
}

export interface CombatPlayerSource {
  actingName: string | null;
  menu?: PlayerMenu;
  party: CombatPlayerPartyRow[];
  enemyGroups: CombatPlayerEnemyGroup[];
  combatLog?: string[];
  result?: { title: string; lines: string[] };
  playbackHint?: string;
  flash?: string;
}

export interface CombatPlayerView {
  party: PlayerPartyMember[];
  enemies: PlayerEnemy[];
  menu?: PlayerMenu;
  combatLog?: string[];
  result?: { title: string; lines: string[] };
  hints?: string[];
}

function visibleStatus(status: readonly string[]): string[] {
  return status.filter((s) =>
    (COMBAT_VISIBLE_STATUSES as readonly string[]).includes(s)
  );
}

function resourceText(row: CombatPlayerPartyRow): Pick<PlayerPartyMember, "spText" | "rageText"> {
  if (row.hasTechniques) {
    const rage = row.rage ?? 0;
    const maxRage = row.maxRage ?? 0;
    return { rageText: `RG ${rage}/${maxRage}` };
  }
  if (row.maxSp > 0) return { spText: `${row.sp}/${row.maxSp}` };
  return {};
}

export function buildCombatPlayerView(source: CombatPlayerSource): CombatPlayerView {
  const party: PlayerPartyMember[] = source.party.map((row) => ({
    name: row.name,
    hpText: `${Math.max(0, row.hp)}/${row.maxHp}`,
    ...resourceText(row),
    ...(row.row ? { row: row.row } : {}),
    visibleStatus: visibleStatus(row.status),
    ...(row.acting ? { acting: true } : {}),
  }));

  const enemies: PlayerEnemy[] = source.enemyGroups.map((group) => {
    const enemy: PlayerEnemy = {
      displayName: group.displayName,
      count: group.count,
      visibleStatus: visibleStatus(group.statuses),
      ...(group.extraTags && group.extraTags.length > 0 ? { extraTags: [...group.extraTags] } : {}),
    };
    if (group.showHealthDescriptor && group.currentHp !== undefined && group.maxHp !== undefined) {
      enemy.visibleHealth = enemyHealthDescriptor(group.currentHp, group.maxHp);
    }
    return enemy;
  });

  const hints: string[] = [];
  if (source.playbackHint) hints.push(source.playbackHint);
  if (source.menu?.footer) hints.push(source.menu.footer);

  const menu = source.menu
    ? {
        ...source.menu,
        ...(source.flash ? { flash: source.flash } : {}),
      }
    : source.flash
      ? { entries: [], selectedIndex: 0, flash: source.flash }
      : undefined;

  return {
    party,
    enemies,
    ...(menu ? { menu } : {}),
    ...(source.combatLog && source.combatLog.length > 0 ? { combatLog: [...source.combatLog] } : {}),
    ...(source.result ? { result: { title: source.result.title, lines: [...source.result.lines] } } : {}),
    ...(hints.length > 0 ? { hints } : {}),
  };
}
