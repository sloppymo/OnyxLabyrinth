import { describe, expect, it } from "vitest";
import { GameObjectPool, type PoolableGameObject } from "./phaser-go-pool";

type FakeGO = PoolableGameObject & {
  id: number;
  active: boolean;
  visible: boolean;
  destroyed: boolean;
};

function fakePool(maxSize?: number) {
  const made: FakeGO[] = [];
  let next = 0;
  const pool = new GameObjectPool<FakeGO>(() => {
    const go: FakeGO = {
      id: next++,
      active: false,
      visible: false,
      destroyed: false,
      x: 0,
      y: 0,
      setActive(v: boolean) {
        go.active = v;
        return go;
      },
      setVisible(v: boolean) {
        go.visible = v;
        return go;
      },
      destroy() {
        go.destroyed = true;
        return go;
      },
    };
    made.push(go);
    return go;
  }, maxSize);
  return { pool, made };
}

/** One paint: begin, acquire n, end. */
function paint(pool: GameObjectPool<FakeGO>, n: number): FakeGO[] {
  pool.begin();
  const out: FakeGO[] = [];
  for (let i = 0; i < n; i++) out.push(pool.acquire());
  pool.end();
  return out;
}

describe("GameObjectPool", () => {
  it("allocates on first use and hands the same objects back after", () => {
    const { pool } = fakePool();
    const first = paint(pool, 5);
    expect(pool.created).toBe(5);
    const second = paint(pool, 5);
    expect(pool.created).toBe(5);
    expect(second.map((g) => g.id)).toEqual(first.map((g) => g.id));
  });

  /** The property H6 actually claims: steady-state churn stops allocating. */
  it("stops allocating once the high-water mark is reached", () => {
    const { pool } = fakePool();
    paint(pool, 12);
    const afterWarmup = pool.created;
    for (let frame = 0; frame < 200; frame++) {
      paint(pool, 1 + (frame % 12));
    }
    expect(pool.created).toBe(afterWarmup);
  });

  it("acquired objects come back active and visible", () => {
    const { pool } = fakePool();
    const got = paint(pool, 3);
    for (const g of got) {
      expect(g.active).toBe(true);
      expect(g.visible).toBe(true);
    }
  });

  it("releases the unused tail with Group's active+visible idiom", () => {
    const { pool, made } = fakePool();
    paint(pool, 6);
    paint(pool, 2);
    expect(made.slice(0, 2).every((g) => g.active && g.visible)).toBe(true);
    for (const g of made.slice(2)) {
      expect(g.active).toBe(false);
      expect(g.visible).toBe(false);
      // Released, not destroyed — that is the whole point.
      expect(g.destroyed).toBe(false);
    }
  });

  it("re-uses released objects rather than allocating new ones", () => {
    const { pool } = fakePool();
    paint(pool, 8);
    paint(pool, 1);
    const back = paint(pool, 8);
    expect(pool.created).toBe(8);
    expect(new Set(back.map((g) => g.id)).size).toBe(8);
  });

  describe("trim past the retention cap", () => {
    it("destroys the surplus once a burst subsides", () => {
      const { pool } = fakePool(4);
      paint(pool, 10); // burst
      expect(pool.size).toBe(10);
      paint(pool, 1); // burst over
      expect(pool.size).toBe(4);
      expect(pool.created).toBe(10);
    });

    it("never destroys an object acquired this frame", () => {
      const { pool, made } = fakePool(4);
      pool.begin();
      const live = [];
      for (let i = 0; i < 10; i++) live.push(pool.acquire());
      pool.end();
      // 10 live > cap 4: the cap is a retention limit, not a draw ceiling.
      expect(pool.size).toBe(10);
      expect(live.every((g) => !g.destroyed)).toBe(true);
      expect(made.every((g) => !g.destroyed)).toBe(true);
    });

    it("keeps the pool usable after a trim", () => {
      const { pool } = fakePool(4);
      paint(pool, 10);
      paint(pool, 1);
      const after = paint(pool, 6);
      expect(after).toHaveLength(6);
      expect(after.every((g) => !g.destroyed && g.visible)).toBe(true);
    });

    it("does not trim at exactly the cap", () => {
      const { pool } = fakePool(4);
      paint(pool, 4);
      paint(pool, 0);
      expect(pool.size).toBe(4);
    });
  });

  describe("spreadPx", () => {
    it("is zero for stacked or single objects", () => {
      const { pool } = fakePool();
      expect(pool.spreadPx()).toBe(0);
      paint(pool, 1);
      expect(pool.spreadPx()).toBe(0);
    });

    it("measures the widest gap among live objects only", () => {
      const { pool } = fakePool();
      pool.begin();
      const a = pool.acquire();
      const b = pool.acquire();
      a.x = 0;
      a.y = 0;
      b.x = 3;
      b.y = 4;
      pool.end();
      expect(pool.spreadPx()).toBe(5);

      // A released object must not count toward the spread.
      pool.begin();
      pool.acquire();
      pool.end();
      expect(pool.spreadPx()).toBe(0);
    });
  });
});
