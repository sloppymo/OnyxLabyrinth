/**
 * Gold costs for paid services that exist in more than one place — the Town
 * Temple/Shop and the Church of Saint Namanda both perform the same
 * underlying transactions (shatter cursed gear, appraise an item), so they
 * share one price instead of drifting independently. Namanda's own
 * blessing service has no Town equivalent and is priced here too, for the
 * same "no magic numbers in UI code" reason.
 */

/** Shatters all equipped cursed gear (and cursed inventory). */
export const REMOVE_CURSE_COST = 100;

/** Identifies one unidentified inventory item. */
export const APPRAISE_COST = 50;

/**
 * Casts Namanda's Blessing (see `game/persistent-spells.ts`): +2 armor to
 * the whole party for `NAMANDA_BLESSING_DURATION_STEPS` dungeon steps.
 * Priced between Appraise (single-item, 50g) and Remove Curse (destroys an
 * item, 100g) — a party-wide but modest and temporary combat edge.
 */
export const NAMANDA_BLESSING_COST = 40;

/** +armor granted by Namanda's Blessing — well below priest-holy-aura's +5
 *  (a level-7 spell); this is a Floor-1 shop service, not a spell tier. */
export const NAMANDA_BLESSING_ARMOR_BONUS = 2;

/** Dungeon steps Namanda's Blessing lasts, matching the Light spell's own
 *  duration order of magnitude (see `data/spells.ts`). */
export const NAMANDA_BLESSING_DURATION_STEPS = 40;
