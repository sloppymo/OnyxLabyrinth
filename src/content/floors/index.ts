/**
 * Optional custom floors authored as JSON (editor exports).
 *
 * Drop a FloorMapJSON export into this folder and import it below, then it
 * appears in FLOORS after the campaign maps.
 *
 * Example:
 *   import floor4 from "./floor-4.json";
 *   export const EXTRA_FLOOR_MAPS = [floor4];
 */

import type { FloorMapJSON } from "../../game/floor-map";
import { mapToFloorDef, parseFloorMapJSON } from "../../game/floor-map";
import type { FloorDef } from "../../data/floors";
import floor4Demo from "./floor-4-demo.json";

/**
 * Add editor-exported maps here (imported JSON modules).
 *
 * floor-4-demo.json ("The Practice Halls") is the shipped example pack: it
 * exercises every overlay type (lock+key, trapped chest, water effect, NPC
 * with trades/gifts, events, teleporter, encounter zones, map sprites). It is
 * campaign-inert — floor 3 has no stairs_down, so players can only reach it
 * via its own stairs_up... which means in practice via the editor's Playtest
 * Floor button or `?debug=1` registerFloorMap. Delete the import to drop it.
 */
export const EXTRA_FLOOR_MAPS: FloorMapJSON[] = [
  floor4Demo as unknown as FloorMapJSON,
];

export function loadExtraFloors(): FloorDef[] {
  return EXTRA_FLOOR_MAPS.map((raw) => mapToFloorDef(parseFloorMapJSON(raw)));
}

/** Merge campaign floors with any content/floors packs (by replacing same id). */
export function mergeFloorList(campaign: readonly FloorDef[]): FloorDef[] {
  const extras = loadExtraFloors();
  if (extras.length === 0) return [...campaign];
  const byId = new Map<number, FloorDef>();
  for (const f of campaign) byId.set(f.id, f);
  for (const f of extras) byId.set(f.id, f);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}
