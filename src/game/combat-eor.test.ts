import { describe, it, expect } from "vitest";
import { deathCheck } from "./combat-eor";
import { createCombatState } from "./combat";
import { createDefaultParty } from "./party";
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

describe("deathCheck (row promotion removed)", () => {
  it("does not promote back-row enemies when front row dies", () => {
    // Row-based targeting restrictions have been removed, so back-row
    // enemies no longer need to be mechanically promoted to the front
    // row to become reachable. They stay in their original row for
    // sprite positioning purposes only.
    const front = makeEnemy("f1", 0, "front");
    front.currentHp = 0;
    const back = makeEnemy("b1", 10, "back");
    const s = makeState([front], [back]);
    const events: CombatEvent[] = [];
    deathCheck(s, (m, e) => {
      s.log.push(m);
      events.push(e);
    });
    // Front row is cleared (dead enemy removed).
    expect(s.enemies.front).toEqual([]);
    // Back-row enemy stays in the back row (no promotion).
    expect(s.enemies.back.map((e) => e.instanceId)).toEqual(["b1"]);
    expect(s.enemies.back[0]!.row).toBe("back");
    // No rowAdvance event is emitted.
    expect(events.some((e) => e?.type === "rowAdvance")).toBe(false);
    // Defeated event still fires for the dead front enemy.
    expect(events.some((e) => e?.type === "defeated" && e.targetId === "f1")).toBe(true);
  });

  it("leaves back-row enemies in the back row when front is already empty", () => {
    const back = makeEnemy("b1", 10, "back");
    const s = makeState([], [back]);
    const events: CombatEvent[] = [];
    deathCheck(s, (m, e) => {
      s.log.push(m);
      events.push(e);
    });
    expect(s.enemies.back.map((e) => e.instanceId)).toEqual(["b1"]);
    expect(s.enemies.back[0]!.row).toBe("back");
    expect(events).toEqual([]);
  });
});
