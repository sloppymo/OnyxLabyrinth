/**
 * Aggregates every CombatBarkProfile into one lookup map for the selector
 * (`src/game/combat-bark-library.ts`) and coverage/audit tooling.
 */

import type { CombatBarkProfile, BarkSilentExclusion } from "./types";
import { PLAYER_CLASS_BARKS } from "./player-classes";
import { COMPANION_BARKS } from "./companions";
import { ENEMY_BARKS_FLOOR1 } from "./enemies-floor1";
import { ENEMY_BARKS_FLOOR2 } from "./enemies-floor2";
import { ENEMY_BARKS_FLOOR3 } from "./enemies-floor3";
import { ENEMY_BARKS_FLOOR4 } from "./enemies-floor4";
import { ENEMY_BARKS_FLOOR5 } from "./enemies-floor5";
import { ENEMY_BARKS_BOSSES } from "./enemies-bosses";
import { ENEMY_BARKS_SCRIPTED } from "./enemies-scripted";

export * from "./types";
export { PLAYER_CLASS_BARKS } from "./player-classes";
export { COMPANION_BARKS } from "./companions";
export { ENEMY_BARKS_FLOOR1 } from "./enemies-floor1";
export { ENEMY_BARKS_FLOOR2 } from "./enemies-floor2";
export { ENEMY_BARKS_FLOOR3 } from "./enemies-floor3";
export { ENEMY_BARKS_FLOOR4 } from "./enemies-floor4";
export { ENEMY_BARKS_FLOOR5 } from "./enemies-floor5";
export { ENEMY_BARKS_BOSSES } from "./enemies-bosses";
export { ENEMY_BARKS_SCRIPTED } from "./enemies-scripted";

export const ENEMY_BARKS: readonly CombatBarkProfile[] = [
  ...ENEMY_BARKS_FLOOR1,
  ...ENEMY_BARKS_FLOOR2,
  ...ENEMY_BARKS_FLOOR3,
  ...ENEMY_BARKS_FLOOR4,
  ...ENEMY_BARKS_FLOOR5,
  ...ENEMY_BARKS_BOSSES,
  ...ENEMY_BARKS_SCRIPTED,
];

export const ALL_BARK_PROFILES: readonly CombatBarkProfile[] = [
  ...PLAYER_CLASS_BARKS,
  ...COMPANION_BARKS,
  ...ENEMY_BARKS,
];

export const BARK_PROFILES_BY_ID: ReadonlyMap<string, CombatBarkProfile> = new Map(
  ALL_BARK_PROFILES.map((p) => [p.id, p])
);

/**
 * Production EnemyDef ids with a deliberate, documented, zero-line bark
 * profile — distinct from an id that was simply forgotten. See the
 * Coverage section of docs/COMBAT-BARK-AUDIT.md.
 */
export const BARK_SILENT_EXCLUSIONS: readonly BarkSilentExclusion[] = [
  {
    id: "training-dummy",
    reason:
      "Debug/bestiary-only EnemyDef (floors: [], no abilityIds, not referenced " +
      "by any encounter table or scripted fight outside enemies.ts/sprite-manifest.ts). " +
      "Not a combat identity a player meets in the campaign.",
  },
];
