/**
 * Pure content-quality checks over a set of CombatBarkProfiles — shared by
 * `scripts/audit-combat-barks.ts` (human-readable report) and the test
 * suite (machine-enforced invariants), so the two can't drift apart.
 */
import type { CombatBarkLine, CombatBarkProfile, CombatBarkTrigger } from "./types";

export interface FlatLine {
  profileId: string;
  kind: string;
  trigger: CombatBarkTrigger;
  line: CombatBarkLine;
}

export function flattenLines(profiles: readonly CombatBarkProfile[]): FlatLine[] {
  const rows: FlatLine[] = [];
  for (const profile of profiles) {
    for (const [trigger, lines] of Object.entries(profile.pools)) {
      for (const line of lines ?? []) {
        rows.push({ profileId: profile.id, kind: profile.kind, trigger: trigger as CombatBarkTrigger, line });
      }
    }
  }
  return rows;
}

/** Short, universal words expected to recur across many unrelated speakers on purpose. */
export const GENERIC_ALLOW_LIST: ReadonlySet<string> = new Set([
  "fine.", "again.", "no.", "...", "ready.", "done.", "hold.", "noted.",
  "wait.", "not me.", "again?", "hnh.", "finally.", "cold.", "endured.",
]);

export interface DuplicateEntry {
  text: string;
  speakers: readonly string[];
  intentionalGeneric: boolean;
}

/** Lines whose exact text is reused by more than one speaker. */
export function findDuplicateLines(profiles: readonly CombatBarkProfile[]): DuplicateEntry[] {
  const byText = new Map<string, Set<string>>();
  for (const row of flattenLines(profiles)) {
    const set = byText.get(row.line.text) ?? new Set<string>();
    set.add(row.profileId);
    byText.set(row.line.text, set);
  }
  return [...byText.entries()]
    .filter(([, speakers]) => speakers.size > 1)
    .map(([text, speakers]) => ({
      text,
      speakers: [...speakers],
      intentionalGeneric: GENERIC_ALLOW_LIST.has(text.toLowerCase()),
    }))
    .sort((a, b) => b.speakers.length - a.speakers.length);
}

const FORBIDDEN_PHRASES = [
  "skill issue", "based", "cringe", "rizz", "sus", "skibidi", "cooked", "mid",
  "npc", "player", "video game", "press a", "hp", "xp", "level up",
  "random encounter", "quest marker", "well, well, well", "prepare to die",
  "feel my wrath", "you shall perish", "thou shalt", "foul interlopers", "begone, mortals",
];

function toneRegexFor(phrase: string): RegExp {
  const escaped = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i");
}
const TONE_MATCHERS = FORBIDDEN_PHRASES.map((p) => toneRegexFor(p));

/** Word-boundary tone-violation scan — never a raw substring match (avoids
 *  flagging e.g. "Jesus." for containing "sus"). */
export function findToneViolations(profiles: readonly CombatBarkProfile[]): FlatLine[] {
  return flattenLines(profiles).filter((row) => TONE_MATCHERS.some((re) => re.test(row.line.text)));
}

export interface LengthStats {
  mean: number;
  median: number;
  p90: number;
  over28: FlatLine[];
  over45: FlatLine[];
  over80: FlatLine[];
}

export function lengthStats(profiles: readonly CombatBarkProfile[]): LengthStats {
  const rows = flattenLines(profiles);
  const lengths = rows.map((r) => r.line.text.length).sort((a, b) => a - b);
  const pct = (p: number) => lengths[Math.min(lengths.length - 1, Math.floor((p / 100) * lengths.length))] ?? 0;
  const mean = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1);
  return {
    mean,
    median: pct(50),
    p90: pct(90),
    over28: rows.filter((r) => r.line.text.length > 28),
    over45: rows.filter((r) => r.line.text.length > 45),
    over80: rows.filter((r) => r.line.text.length > 80),
  };
}

function wordCount(text: string): number {
  return text.replace(/[^a-zA-Z' -]/g, "").trim().split(/\s+/).filter(Boolean).length;
}

/** vocalization/silent profiles must stick to asterisk-actions or <=2 words —
 *  the one mechanical check for "a Hellhound discussing tactics in English". */
export function findVoiceModeViolations(profiles: readonly CombatBarkProfile[]): FlatLine[] {
  const violations: FlatLine[] = [];
  for (const profile of profiles) {
    if (profile.voiceMode !== "vocalization" && profile.voiceMode !== "silent") continue;
    for (const row of flattenLines([profile])) {
      const isAsterisk = /^\*.*\*$/.test(row.line.text);
      if (isAsterisk) continue;
      if (wordCount(row.line.text) > 2) violations.push(row);
    }
  }
  return violations;
}
