import { describe, expect, it } from "vitest";
import {
  clampSfxLayers,
  enemyIsUndead,
  FULL_CHARGE_SPELLS,
  idsForEvent,
} from "./combat-audio";
import type { CombatState } from "../game/combat-types";
import { createCharacterRecord } from "../game/party";

function bareState(partial: Partial<CombatState> = {}): CombatState {
  return {
    party: [],
    enemies: { front: [], back: [] },
    spells: {},
    items: {},
    justDied: [],
    ...partial,
  } as CombatState;
}

describe("idsForEvent layering", () => {
  it("physical hit stays single-layer for non-caster classes", () => {
    const fighter = createCharacterRecord("a", "Bram", "Human", "Neutral", "Fighter", 0);
    const ids = idsForEvent(
      { type: "attack", actorId: "a", targetId: "e", damage: 5, crit: false, range: "short" },
      bareState({ party: [fighter] })
    );
    expect(ids.map((x) => x.id)).toEqual(["attackHit"]);
  });

  it("Mage melee layers attackHit with soft physical; crit uses criticalHit", () => {
    const mage = createCharacterRecord("m", "Aria", "Human", "Neutral", "Mage", 0);
    const normal = idsForEvent(
      { type: "attack", actorId: "m", targetId: "e", damage: 5, crit: false, range: "short" },
      bareState({ party: [mage] })
    );
    expect(normal.map((x) => x.id)).toEqual(["attackHit", "elementPhysical"]);
    const crit = idsForEvent(
      { type: "attack", actorId: "m", targetId: "e", damage: 12, crit: true, range: "short" },
      bareState({ party: [mage] })
    );
    expect(crit.map((x) => x.id)).toEqual(["criticalHit", "elementPhysical"]);
  });

  it("Priest melee layers divine under attackHit", () => {
    const priest = createCharacterRecord("p", "Coda", "Human", "Neutral", "Priest", 0);
    const ids = idsForEvent(
      { type: "attack", actorId: "p", targetId: "e", damage: 4, crit: false, range: "short" },
      bareState({ party: [priest] })
    );
    expect(ids.map((x) => x.id)).toEqual(["attackHit", "elementDivine"]);
  });

  it("charged cast adds ducked bossPhase under the element cue", () => {
    expect(FULL_CHARGE_SPELLS.has("mage-fireball")).toBe(true);
    const ids = idsForEvent(
      { type: "cast", actorId: "m", spellId: "mage-fireball", targetId: "e" },
      bareState()
    );
    expect(ids.map((x) => x.id)).toContain("elementFire");
    expect(ids.map((x) => x.id)).toContain("bossPhase");
    const phase = ids.find((x) => x.id === "bossPhase");
    expect(phase?.gainMul).toBe(0.4);
  });

  it("caps at 3 cues", () => {
    const layers = clampSfxLayers([
      { id: "elementFire" },
      { id: "bossPhase", gainMul: 0.4 },
      { id: "burnTick", gainMul: 0.35 },
      { id: "fizzle", gainMul: 0.2 },
    ]);
    expect(layers).toHaveLength(3);
    expect(layers.map((x) => x.id)).toEqual(["elementFire", "bossPhase", "burnTick"]);
  });

  it("plain damage spellEffect stays silent (cast already played element)", () => {
    const ids = idsForEvent(
      {
        type: "spellEffect",
        spellId: "mage-fireball",
        targetId: "e",
        damage: 14,
      },
      bareState()
    );
    expect(ids).toEqual([]);
  });

  it("routes Card Trial presentation verbs to the existing SFX vocabulary", () => {
    expect(
      idsForEvent(
        { type: "cast", actorId: "rat-king", spellId: "Rat", targetId: null, cardPresentation: "rat" },
        bareState()
      )
    ).toEqual([{ id: "summonCast" }]);
    expect(
      idsForEvent(
        { type: "spellEffect", spellId: "Opened", targetId: "e", cardPresentation: "opened" },
        bareState()
      )
    ).toEqual([{ id: "debuffCast" }]);
    expect(
      idsForEvent(
        { type: "spellEffect", spellId: "Consume Opened", targetId: "e", cardPresentation: "consume-opened" },
        bareState()
      )
    ).toEqual([{ id: "technique" }]);
    expect(
      idsForEvent(
        { type: "spellEffect", spellId: "Hush", targetId: "e", cardPresentation: "hush" },
        bareState()
      )
    ).toEqual([{ id: "silence" }]);
    expect(
      idsForEvent(
        { type: "cast", actorId: "old-man", spellId: "the-staff-speaks", targetId: null, cardPresentation: "card-spell" },
        bareState()
      )
    ).toEqual([{ id: "elementDivine", gainMul: 0.72 }]);
    expect(
      idsForEvent(
        { type: "spellEffect", spellId: "Omen", targetId: "e", cardPresentation: "omen-trigger", damage: 7 },
        bareState()
      ).map((layer) => layer.id)
    ).toEqual(["bossPhase", "debuffCast"]);
  });

  it("analyze / silence add soft fizzle layer", () => {
    expect(
      idsForEvent({ type: "analyze", actorId: "m", targetId: "e" }, bareState()).map(
        (x) => x.id
      )
    ).toEqual(["analyze", "fizzle"]);
    expect(
      idsForEvent({ type: "silence", actorId: "boss", targetId: "m" }, bareState()).map(
        (x) => x.id
      )
    ).toEqual(["silence", "fizzle"]);
  });

  it("maps dedicated chemistry phases without treating them as ordinary casts", () => {
    const base = {
      type: "chemistry" as const,
      chemistryId: "chem-slime-cannon",
      abilityId: "crypt-slime-cannon",
      name: "Slime Cannon",
      actorId: "m",
      presentation: "throwAlly" as const,
    };
    expect(idsForEvent({ ...base, phase: "telegraph" }, bareState()).map((x) => x.id)).toEqual(["bossPhase"]);
    expect(idsForEvent({ ...base, phase: "resolve" }, bareState()).map((x) => x.id)).toEqual(["statusPoison"]);
    expect(idsForEvent({ ...base, phase: "break", reason: "resourceDead" }, bareState()).map((x) => x.id)).toEqual(["fizzle"]);
  });

  it("undead defeat layers soft poison under enemyDefeated", () => {
    const ids = idsForEvent(
      { type: "defeated", targetId: "sk-0", wasEnemy: true },
      bareState({
        justDied: [
          {
            id: "skeleton",
            name: "Skeleton",
            instanceId: "sk-0",
            currentHp: 0,
            row: "front",
            status: [],
            hp: 10,
            attack: 3,
            ac: 0,
            agi: 5,
            xp: 1,
            gold: 1,
            floors: [1],
            rowPreference: "front",
            special: [{ kind: "undead" }],
            isBoss: false,
          },
        ],
      })
    );
    expect(ids.map((x) => x.id)).toEqual(["enemyDefeated", "statusPoison"]);
  });
});

describe("enemyIsUndead", () => {
  it("detects undead special from enemy defs", () => {
    expect(enemyIsUndead("skeleton")).toBe(true);
    expect(enemyIsUndead("slime")).toBe(false);
  });
});
