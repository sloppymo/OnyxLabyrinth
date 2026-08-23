import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ENEMIES_BY_ID } from "../../data/enemies";
import { PARTY_SIZE } from "../party";
import { serialize } from "../save";
import { createGameState } from "../state";
import { findFloor } from "../floor-registry";
import { createFight } from "./engine";
import { ENCOUNTERS } from "./encounters";

describe("Card Trial campaign isolation", () => {
  it("does not change campaign PARTY_SIZE or in-memory party when a fight is created", () => {
    const state = createGameState(findFloor(1)!);
    expect(PARTY_SIZE).toBe(2);
    expect(state.party).toHaveLength(2);
    const ids = state.party.map((c) => c.id);
    createFight(2, { seed: 1 });
    expect(PARTY_SIZE).toBe(2);
    expect(state.party).toHaveLength(2);
    expect(state.party.map((c) => c.id)).toEqual(ids);
  });

  it("does not write Card Trial into the campaign save schema", () => {
    const state = createGameState(findFloor(1)!);
    createFight(1, { seed: 1 });
    const raw = JSON.parse(serialize(state)) as Record<string, unknown>;
    expect(raw.version).toBe(18);
    expect(raw).not.toHaveProperty("cardTrial");
    expect(Array.isArray(raw.party) ? (raw.party as unknown[]).length : 0).toBe(2);
  });

  it("does not register Card Trial enemies on campaign tables", () => {
    for (const id of ["cleaver", "ash", "the-heap", "twinblade", "hunter"]) {
      expect(ENEMIES_BY_ID[id], id).toBeUndefined();
    }
    expect(ENCOUNTERS).toHaveLength(10);
  });
});

describe("Card Trial source isolation", () => {
  it("keeps Classic Arena on startNextArenaFight / startCombat and does not route Card Trial through endCombat", () => {
    const main = readFileSync(resolve("src/main.ts"), "utf8");
    expect(main).toMatch(/function startNextArenaFight\(/);
    expect(main).toMatch(/startCombat\(combat, \{ source: "arena"/);
    expect(main).toMatch(/function startCardTrialFight\(/);
    expect(main).toMatch(/function leaveCardTrial\(/);
    expect(main).not.toMatch(/endCombat\(.*cardTrial/i);
    expect(main).toMatch(/autoSave\(state, inArena \|\| inCardTrial\)/);
    expect(main).not.toMatch(/\bnew ArenaController\b/);
    expect(main).not.toMatch(/\bnew CardTrialLobbyController\b/);
  });
});
