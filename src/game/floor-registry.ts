/**
 * Runtime floor list: campaign floors + optional JSON packs from content/floors.
 */

import { FLOORS, type FloorDef } from "../data/floors";
import { loadExtraFloors } from "../content/floors/index";
import { mapToFloorDef, type FloorMapJSON } from "./floor-map";

let floorList: FloorDef[] = merge(FLOORS, loadExtraFloors());

function merge(campaign: readonly FloorDef[], extras: FloorDef[]): FloorDef[] {
  if (extras.length === 0) return [...campaign];
  const byId = new Map<number, FloorDef>();
  for (const f of campaign) byId.set(f.id, f);
  for (const f of extras) byId.set(f.id, f);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

export function getFloors(): readonly FloorDef[] {
  return floorList;
}

export function findFloor(id: number): FloorDef | undefined {
  return floorList.find((f) => f.id === id);
}

/** Hot-register an editor export (playtest / debug). Replaces same id. */
export function registerFloorDef(floor: FloorDef): void {
  floorList = merge(floorList, [floor]);
}

export function registerFloorMap(map: FloorMapJSON): FloorDef {
  const floor = mapToFloorDef(map);
  registerFloorDef(floor);
  return floor;
}
