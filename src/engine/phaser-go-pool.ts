/**
 * Reusable GameObject pool for the Phaser combat stage (harvest H6).
 *
 * Lives outside `combat-phaser-stage.ts` — and is generic over a structural
 * shape rather than `Phaser.GameObjects.GameObject` — so it can be unit-tested
 * under jsdom, where importing Phaser breaks. Same trick as
 * `combat-phaser-fx.ts`: keep the logic testable, let the stage supply the real
 * Phaser types.
 *
 * `syncEffects` / `syncParticles` previously destroyed and re-created every GO
 * on every paint; at 60fps with a burst on screen that is thousands of
 * allocations a second, all of it garbage. This hands the same objects back.
 *
 * Deliberately not a `Phaser.GameObjects.Group`. Group is the idiomatic pool
 * when objects have independent lifetimes and you ask for "the next dead one"
 * (`get()` / `killAndHide()`). Here the visible set is rebuilt wholesale every
 * paint from an authoritative array the choreography owns, so an index cursor is
 * both simpler and exactly ordered — Group's alive/dead bookkeeping would be
 * overhead for a question we never ask. The `setActive(false).setVisible(false)`
 * release below is Group's own idiom, kept so pooled objects are skipped by both
 * the update and render passes.
 *
 * Usage is strictly `begin()` → n × `acquire()` → `end()` per paint. Callers
 * MUST fully reset whatever they set on an acquired object: a pooled GO arrives
 * carrying whatever the last user left on it.
 */

/** Minimal surface the pool needs; `Phaser.GameObjects.Sprite`/`Arc` satisfy it. */
export interface PoolableGameObject {
  setVisible(value: boolean): unknown;
  setActive(value: boolean): unknown;
  destroy(): unknown;
  x: number;
  y: number;
}

/**
 * Default retention cap. A pool never shrinks below the objects it is currently
 * using, but one outsized burst must not strand hundreds of GOs for the rest of
 * the fight.
 */
export const DEFAULT_POOL_MAX = 96;

export class GameObjectPool<T extends PoolableGameObject> {
  private items: T[] = [];
  private cursor = 0;
  /**
   * Monotonic count of objects ever allocated. This — not the pool size — is
   * what proves reuse: a size probe cannot distinguish "reused 12 objects" from
   * "destroyed and re-created 12 objects" every frame; both report 12. Under a
   * working pool this plateaus while the scene's particle list keeps churning.
   */
  created = 0;

  constructor(
    private readonly factory: () => T,
    private readonly maxSize: number = DEFAULT_POOL_MAX
  ) {}

  begin(): void {
    this.cursor = 0;
  }

  acquire(): T {
    let item = this.items[this.cursor];
    if (!item) {
      item = this.factory();
      this.created++;
      this.items.push(item);
    }
    this.cursor++;
    item.setActive(true);
    item.setVisible(true);
    return item;
  }

  /**
   * Release the tail that went unused this frame, and trim past the cap.
   *
   * `keep` is floored at `cursor`, so objects acquired this frame are never
   * destroyed even when more than `maxSize` are live — the cap is a retention
   * limit, not a hard ceiling on what can be drawn.
   */
  end(): void {
    for (let i = this.cursor; i < this.items.length; i++) {
      const item = this.items[i]!;
      item.setActive(false);
      item.setVisible(false);
    }
    if (this.items.length > this.maxSize) {
      const keep = Math.max(this.cursor, this.maxSize);
      for (const extra of this.items.splice(keep)) extra.destroy();
    }
  }

  get size(): number {
    return this.items.length;
  }

  get live(): number {
    return this.cursor;
  }

  /**
   * Widest gap between the objects acquired this frame (debug probe only).
   *
   * O(live²) — intended for the ghost pool's ≤3 entries. Do not call it on the
   * particle pool, where 96 live entries would mean ~4.5k hypot calls per probe.
   */
  spreadPx(): number {
    let max = 0;
    for (let i = 0; i < this.cursor; i++) {
      const a = this.items[i]!;
      for (let j = i + 1; j < this.cursor; j++) {
        const b = this.items[j]!;
        max = Math.max(max, Math.hypot(a.x - b.x, a.y - b.y));
      }
    }
    return max;
  }
}
