import type { FloorDef } from "../data/floors";

/**
 * Empty looted chests on a freshly cloned floor without deleting their tiles.
 *
 * Live play and floor re-entry leave an emptied `"treasure"` tile in place so
 * a cleared wing still reads as cleared. Deserialize must use this same helper
 * — wiping `cell.tile` here is how Continue used to erase opened chests.
 */
export function applyLootedTreasures(
  floor: FloorDef,
  lootTaken: Record<number, Set<string>>
): void {
  const taken = lootTaken[floor.id];
  if (!taken) return;
  for (const pos of taken) {
    const [xStr, yStr] = pos.split(",");
    const x = parseInt(xStr);
    const y = parseInt(yStr);
    const treasureDef = floor.treasures?.find((t) => t.x === x && t.y === y);
    if (treasureDef) {
      treasureDef.itemIds = [];
    }
    // Tile deliberately left in place — an emptied `treasure` tile renders as
    // an opened chest and is inert (see `handleTileFeature`'s inert guard).
  }
}
