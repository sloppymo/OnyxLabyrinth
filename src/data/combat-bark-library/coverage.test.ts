/**
 * Coverage + referential-integrity tests for the combat bark content
 * library. Coverage is derived from the actual game data (ALL_ENEMIES /
 * CLASSES / COMPANIONS_BY_ID) — never a hand-maintained checklist, so it
 * cannot silently drift as the bestiary/class list changes.
 */
import { describe, expect, it } from "vitest";
import {
  ALL_BARK_PROFILES,
  BARK_PROFILES_BY_ID,
  BARK_SILENT_EXCLUSIONS,
  ENEMY_BARKS,
} from "./index";
import { ALL_CHEMISTRY_IDS } from "./types";
import { ALL_ENEMIES, ENEMIES_BY_ID } from "../enemies";
import { ENEMY_ABILITIES_BY_ID } from "../enemy-abilities";
import { CLASSES } from "../../game/party";
import { COMPANIONS_BY_ID } from "../../game/companion";
import { ALL_TECHNIQUES } from "../techniques";
import { ALL_SPELLS } from "../spells";

const TECHNIQUE_IDS = new Set(ALL_TECHNIQUES.map((t) => t.id));
const SPELL_IDS = new Set(ALL_SPELLS.map((s) => s.id));
const CHEMISTRY_IDS = new Set(ALL_CHEMISTRY_IDS);

describe("entity coverage", () => {
  it("profiles every production EnemyDef or documents it as excluded", () => {
    const profiledEnemyIds = new Set(ENEMY_BARKS.map((p) => p.id));
    const excludedIds = new Set(BARK_SILENT_EXCLUSIONS.map((e) => e.id));
    const missing = ALL_ENEMIES.map((e) => e.id).filter(
      (id) => !profiledEnemyIds.has(id) && !excludedIds.has(id)
    );
    expect(missing, `unprofiled, unexcluded enemies: ${missing.join(", ")}`).toEqual([]);
  });

  it("profiles every playable class", () => {
    const profiledClassIds = new Set(
      ALL_BARK_PROFILES.filter((p) => p.kind === "class").map((p) => p.id)
    );
    const missing = Object.keys(CLASSES).filter((id) => !profiledClassIds.has(id));
    expect(missing).toEqual([]);
  });

  it("profiles every companion", () => {
    const profiledCompanionIds = new Set(
      ALL_BARK_PROFILES.filter((p) => p.kind === "companion").map((p) => p.id)
    );
    const missing = Object.keys(COMPANIONS_BY_ID).filter((id) => !profiledCompanionIds.has(id));
    expect(missing).toEqual([]);
  });

  it("every excluded id is a real, non-profiled EnemyDef", () => {
    const enemyIds = new Set(ALL_ENEMIES.map((e) => e.id));
    const profiledEnemyIds = new Set(ENEMY_BARKS.map((p) => p.id));
    for (const excl of BARK_SILENT_EXCLUSIONS) {
      expect(enemyIds.has(excl.id), `${excl.id} is not a real EnemyDef`).toBe(true);
      expect(profiledEnemyIds.has(excl.id), `${excl.id} is both excluded and profiled`).toBe(false);
      expect(excl.reason.length).toBeGreaterThan(0);
    }
  });

  it("has no orphan enemy profiles referencing a nonexistent EnemyDef", () => {
    const orphans = ENEMY_BARKS.filter((p) => !ENEMIES_BY_ID[p.id]);
    expect(orphans.map((p) => p.id)).toEqual([]);
  });

  it("has no duplicate profile ids within a kind", () => {
    const seen = new Map<string, number>();
    for (const p of ALL_BARK_PROFILES) {
      const key = `${p.kind}:${p.id}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const dupes = [...seen.entries()].filter(([, count]) => count > 1);
    expect(dupes).toEqual([]);
  });

  it("BARK_PROFILES_BY_ID contains every profile exactly once", () => {
    expect(BARK_PROFILES_BY_ID.size).toBe(ALL_BARK_PROFILES.length);
    for (const p of ALL_BARK_PROFILES) {
      expect(BARK_PROFILES_BY_ID.get(p.id)).toBe(p);
    }
  });
});

describe("referential integrity", () => {
  it("every chemistryId used in a line is a declared ChemistryId", () => {
    const bad: string[] = [];
    for (const profile of ALL_BARK_PROFILES) {
      for (const lines of Object.values(profile.pools)) {
        for (const line of lines ?? []) {
          if (line.chemistryId && !CHEMISTRY_IDS.has(line.chemistryId)) {
            bad.push(`${profile.id}: ${line.chemistryId}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("every enemy-profile abilityId exists in ENEMY_ABILITIES_BY_ID", () => {
    const bad: string[] = [];
    for (const profile of ENEMY_BARKS) {
      for (const lines of Object.values(profile.pools)) {
        for (const line of lines ?? []) {
          if (line.abilityId && !ENEMY_ABILITIES_BY_ID[line.abilityId]) {
            bad.push(`${profile.id}: ${line.abilityId}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("every PC-class abilityId exists as a real technique or spell id", () => {
    const bad: string[] = [];
    const classProfiles = ALL_BARK_PROFILES.filter((p) => p.kind === "class");
    for (const profile of classProfiles) {
      for (const lines of Object.values(profile.pools)) {
        for (const line of lines ?? []) {
          if (line.abilityId && !TECHNIQUE_IDS.has(line.abilityId) && !SPELL_IDS.has(line.abilityId)) {
            bad.push(`${profile.id}: ${line.abilityId}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("every sourceEnemyId/targetEnemyId used in a line is a real EnemyDef id", () => {
    const bad: string[] = [];
    for (const profile of ALL_BARK_PROFILES) {
      for (const lines of Object.values(profile.pools)) {
        for (const line of lines ?? []) {
          if (line.sourceEnemyId && !ENEMIES_BY_ID[line.sourceEnemyId]) {
            bad.push(`${profile.id}: sourceEnemyId ${line.sourceEnemyId}`);
          }
          if (line.targetEnemyId && !ENEMIES_BY_ID[line.targetEnemyId]) {
            bad.push(`${profile.id}: targetEnemyId ${line.targetEnemyId}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
