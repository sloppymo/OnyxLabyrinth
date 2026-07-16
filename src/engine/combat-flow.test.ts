import { describe, it, expect } from "vitest";
import {
  preferredEnemyIndex,
  preferredAllyIndex,
  canRepeatAttack,
  lastHitEnemyIdFromEvents,
  repeatFailFlash,
  menuResourceLine,
} from "./combat-flow";

describe("preferredEnemyIndex", () => {
  const enemies = [
    { instanceId: "a", currentHp: 10, hp: 10 },
    { instanceId: "b", currentHp: 3, hp: 10 },
    { instanceId: "c", currentHp: 5, hp: 10 },
  ];

  it("prefers last-hit when still living", () => {
    expect(preferredEnemyIndex(enemies, "c")).toBe(2);
  });

  it("falls back to lowest HP% when last-hit missing/dead", () => {
    expect(preferredEnemyIndex(enemies, "dead")).toBe(1);
    expect(preferredEnemyIndex(enemies, null)).toBe(1);
  });

  it("tie-breaks by list order for equal HP%", () => {
    const tied = [
      { instanceId: "x", currentHp: 5, hp: 10 },
      { instanceId: "y", currentHp: 5, hp: 10 },
    ];
    expect(preferredEnemyIndex(tied, null)).toBe(0);
  });
});

describe("preferredAllyIndex", () => {
  it("picks lowest HP% living ally", () => {
    const allies = [
      { id: "a", hp: 20, maxHp: 20 },
      { id: "b", hp: 5, maxHp: 20 },
      { id: "c", hp: 10, maxHp: 20 },
    ];
    expect(preferredAllyIndex(allies)).toBe(1);
  });

  it("returns 0 when all living are full", () => {
    const allies = [
      { id: "a", hp: 20, maxHp: 20 },
      { id: "b", hp: 0, maxHp: 20 },
      { id: "c", hp: 15, maxHp: 15 },
    ];
    expect(preferredAllyIndex(allies)).toBe(0);
  });
});

describe("canRepeatAttack", () => {
  const sticky = { kind: "attack" as const, actorId: "c0", targetId: "rat-1" };

  it("allows same actor + living sticky target", () => {
    expect(canRepeatAttack(sticky, "c0", ["rat-0", "rat-1"])).toEqual({ ok: true });
  });

  it("rejects dead target / wrong actor / missing sticky", () => {
    expect(canRepeatAttack(sticky, "c0", ["rat-0"]).ok).toBe(false);
    expect(canRepeatAttack(sticky, "c1", ["rat-1"]).ok).toBe(false);
    expect(canRepeatAttack(undefined, "c0", ["rat-1"]).ok).toBe(false);
  });

  it("maps fail reasons to short flash copy", () => {
    expect(repeatFailFlash("dead-target")).toBe("No target!");
    expect(repeatFailFlash("no-sticky")).toBe("Nothing to repeat!");
  });
});

describe("menuResourceLine", () => {
  it("shows only the live resource in roster format", () => {
    expect(menuResourceLine(12, 40, null)).toBe("SP 12/40");
    expect(menuResourceLine(0, 0, 3, 12)).toBe("RG 3/12");
    expect(menuResourceLine(12, 40, 3, 12)).toBe("RG 3/12");
    expect(menuResourceLine(0, 0, null)).toBe("");
  });
});

describe("lastHitEnemyIdFromEvents", () => {
  const party = new Set(["c0", "c1"]);

  it("tracks the latest party attack / miss target", () => {
    const id = lastHitEnemyIdFromEvents(
      [
        { type: "attack", actorId: "c0", targetId: "rat-0" },
        { type: "miss", actorId: "c1", targetId: "rat-1" },
      ],
      party
    );
    expect(id).toBe("rat-1");
  });

  it("ignores enemy actors", () => {
    const id = lastHitEnemyIdFromEvents(
      [{ type: "attack", actorId: "rat-0", targetId: "c0" }],
      party
    );
    expect(id).toBeNull();
  });
});
