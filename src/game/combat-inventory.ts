/**
 * Inventory count helpers for combat. Pure functions over plain data — no
 * CombatState knowledge. Combat snapshots the inventory as id->count at
 * start; these convert between the two shapes and reconcile consumption
 * afterward without losing per-instance item state.
 */

/** Convert an inventory (id strings or entries) into stack counts. */
export function inventoryToCounts(
  inventory: readonly (string | { itemId: string })[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of inventory) {
    const id = typeof entry === "string" ? entry : entry.itemId;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/** Convert stack counts back into a flat item-id inventory. */
export function inventoryFromCounts(counts: Record<string, number>): string[] {
  const inventory: string[] = [];
  for (const [id, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i++) {
      inventory.push(id);
    }
  }
  return inventory;
}

/**
 * Apply post-combat consumption to the real inventory: keep each entry only
 * while the combat's count snapshot still has stock for its item id. This
 * preserves per-instance state (the `identified` flag) that a plain
 * counts→list rebuild would destroy.
 */
export function reconcileInventoryAfterCombat<E extends { itemId: string }>(
  entries: readonly E[],
  counts: Record<string, number>
): E[] {
  const remaining = { ...counts };
  const out: E[] = [];
  for (const e of entries) {
    const left = remaining[e.itemId] ?? 0;
    if (left > 0) {
      out.push(e);
      remaining[e.itemId] = left - 1;
    }
  }
  return out;
}
