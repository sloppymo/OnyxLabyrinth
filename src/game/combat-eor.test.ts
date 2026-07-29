import { describe, it, expect } from "vitest";
import { deathCheck, promoteEnemyBackRow } from "./combat-eor";
import { createCombatState } from "./combat";
import { createDefaultParty } from "./party";
import { canReach } from "./combat-reach";
import type { CombatEvent, EnemyInstance } from "./combat-types";
import type { EnemyDef } from "../data/enemies";

function makeEnemy(
  id: string,
  hp: number,
  row: "front" | "back",
  opts: Partial<EnemyDef> = {}
): EnemyInstance {
  return {
    id,
    name: id,
    floors: [1],
    rowPreference: row,
    hp,
    attack: 10,
    ac: 2,
    agi: 10,
    xp: 5,
    gold: 3,
    special: [],
    isBoss: false,
    instanceId: id,
    currentHp: hp,
    row,
    status: [],
    ...opts,
  };
}

function makeState(front: EnemyInstance[], back: EnemyInstance[]) {
  return createCombatState(createDefaultParty(), { front, back }, false);
}

describe("promoteEnemyBackRow", () => {
  it("is a no-op while any front-row enemy still lives", () => {
    const s = makeState(
      [makeEnemy("f1", 10, "front")],
      [makeEnemy("b1", 10, "back")]
    );
    const events: CombatEvent[] = [];
    promoteEnemyBackRow(s, (m, e) => {
      s.log.push(m);
      events.push(e);
    });
    expect(s.enemies.front.map((e) => e.instanceId)).toEqual(["f1"]);
    expect(s.enemies.back.map((e) => e.instanceId)).toEqual(["b1"]);
    expect(events).toEqual([]);
  });

  it("moves living back-row enemies into the front when front is empty", () => {
    const s = makeState([], [makeEnemy("b1", 10, "back"), makeEnemy("b2", 10, "back")]);
    const events: CombatEvent[] = [];
    promoteEnemyBackRow(s, (m, e) => {
      s.log.push(m);
      events.push(e);
    });
    expect(s.enemies.front.map((e) => e.instanceId)).toEqual(["b1", "b2"]);
    expect(s.enemies.back).toEqual([]);
    expect(s.enemies.front.every((e) => e.row === "front")).toBe(true);
    expect(events).toEqual([
      { type: "rowAdvance", targetId: "b1" },
      { type: "rowAdvance", targetId: "b2" },
    ]);
  });
});

describe("deathCheck + promoteEnemyBackRow", () => {
  it("advances the back row after the last front enemy dies", () => {
    const front = makeEnemy("f1", 0, "front");
    front.currentHp = 0;
    const back = makeEnemy("b1", 10, "back");
    const s = makeState([front], [back]);
    const events: CombatEvent[] = [];
    deathCheck(s, (m, e) => {
      s.log.push(m);
      events.push(e);
    });
    expect(s.enemies.front.map((e) => e.instanceId)).toEqual(["b1"]);
    expect(s.enemies.back).toEqual([]);
    expect(s.enemies.front[0]!.row).toBe("front");
    expect(events.some((e) => e?.type === "defeated" && e.targetId === "f1")).toBe(true);
    expect(events.some((e) => e?.type === "rowAdvance" && e.targetId === "b1")).toBe(true);
    // Close-range from party front can now reach the promoted enemy.
    expect(canReach(0, "close", "front")).toBe(true);
  });
});
