/**
 * Shared state-hash function for transcript record/replay.
 *
 * Extracts gameplay-relevant fields from a debug snapshot and produces a
 * stable SHA-256 digest. Both record.mjs and replay.mjs import this so they
 * agree on what "same state" means.
 *
 * Excluded fields (volatile / presentation / non-gameplay):
 *   - soundsPlaying        (timing-dependent audio envelope state)
 *   - message.text         (may include transient overlay text)
 *   - idle                 (timing-dependent quiescence flag)
 *   - availableActions     (derived from route, regenerated each frame)
 *   - warnings             (should be empty; not gameplay-affecting)
 *   - map                  (large; not gameplay-affecting)
 *   - tile                 (static grid property; pos already captures it)
 *   - mapVisible / mapOverlayVisible (UI state, not gameplay)
 *
 * Included fields:
 *   mode, route, floor, pos, flags (darkness/antimagic/arena/pendingTrap),
 *   party (HP/SP/level/status/perks), gold, keys, inventory, buffs,
 *   explored (sorted), unlockedDoors (sorted), combat (round/phase/result/
 *   enemies/recentLog).
 */
import crypto from "crypto";

/**
 * Recursively sort object keys so JSON.stringify is deterministic regardless
 * of insertion order.
 */
function canonicalize(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = canonicalize(value[key]);
  }
  return sorted;
}

/**
 * Extract gameplay-relevant fields from a snapshot into a plain object
 * with sorted arrays where ordering is not guaranteed (explored, keys,
 * unlockedDoors, status, perkIds).
 */
export function stateHashFields(s) {
  return {
    mode: s.mode,
    route: s.route,
    floor: s.floor,
    pos: s.pos,
    flags: {
      inDarkness: s.flags.inDarkness,
      inAntimagic: s.flags.inAntimagic,
      inArena: s.flags.inArena,
      pendingTrap: s.flags.pendingTrap,
    },
    party: s.party.map((p) => ({
      id: p.id,
      name: p.name,
      class: p.class,
      level: p.level,
      hp: p.hp,
      maxHp: p.maxHp,
      sp: p.sp,
      maxSp: p.maxSp,
      status: [...p.status].sort(),
      perkIds: [...p.perkIds].sort(),
    })),
    gold: s.gold,
    keys: [...s.keys].sort(),
    inventory: s.inventory.map((i) => ({
      itemId: i.itemId,
      identified: i.identified,
    })),
    buffs: s.buffs.map((b) => ({
      kind: b.kind,
      remainingSteps: b.remainingSteps,
    })),
    explored: [...s.explored].sort(),
    unlockedDoors: [...s.unlockedDoors].sort(),
    combat: s.combat
      ? {
          round: s.combat.round,
          phase: s.combat.phase,
          result: s.combat.result,
          enemies: s.combat.enemies.map((e) => ({
            id: e.id,
            name: e.name,
            hp: e.hp,
            maxHp: e.maxHp,
            row: e.row,
            status: [...e.status].sort(),
          })),
          recentLog: s.combat.recentLog,
        }
      : null,
  };
}

/**
 * Produce a 16-hex-char (64-bit) SHA-256 digest of the gameplay-relevant
 * snapshot state. 16 chars is more than sufficient for collision resistance
 * across the small number of states in a single transcript.
 */
export function stateHash(snapshot) {
  const canonical = canonicalize(stateHashFields(snapshot));
  const json = JSON.stringify(canonical);
  return crypto.createHash("sha256").update(json).digest("hex").slice(0, 16);
}
