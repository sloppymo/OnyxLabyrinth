import { describe, expect, it } from "vitest";
import { CombatAudit } from "./combat-audit";
import { createCharacter } from "../game/party";
import type { CombatState } from "../game/combat-types";

function combat(party: ReturnType<typeof createCharacter>[]): CombatState {
  return {
    party,
    enemies: { front: [], back: [] },
    round: 4,
    isBoss: false,
    log: [],
    ended: true,
    result: "victory",
    goldEarned: 0,
    xpEarned: 0,
    silencedThisRound: [],
    defendBuff: {},
    armorBuffs: {},
    paralysisTimers: {},
    spells: {},
    items: {},
    loadout: {},
    inAntimagic: false,
    inventory: { potion: 1 },
    magicScreen: 0,
    partyFizzleField: 0,
    enemyFizzleFields: { front: 0, back: 0 },
    enemyMagicScreens: { front: 0, back: 0 },
    summonedAllies: [],
    justDied: [],
    justDiedAllies: [],
    deadAllyIds: [],
    events: [
      { type: "attack", actorId: "wolf", targetId: party[0]!.id, damage: 7 },
      { type: "statusTick", targetId: party[0]!.id, damage: 2, status: "poison" },
      { type: "spellEffect", spellId: "priest-heal", targetId: party[0]!.id, heal: 5 },
      { type: "defeated", targetId: party[1]!.id, wasEnemy: false },
    ],
    perkState: {},
    rage: {},
    counterStances: {},
    tauntingIds: [],
    tauntBuffs: {},
    nextAttackBonuses: {},
    damageBuffs: {},
    enemyArmorDebuffs: {},
    enemyAgiDebuffs: {},
    attackDebuffs: {},
    sleepTimers: {},
    blindTimers: {},
    undertowTimers: {},
    giantStrengthTimers: {},
    poisonState: {},
    windUps: {},
    observedAffinity: {},
    analyzedEnemies: {},
    bossPhases: {},
    disableStacks: {},
    enemyDots: {},
    regenBuffs: {},
    summonCounter: 0,
    holyShieldBuffs: {},
    barkSaid: {},
    swindlerGoldBonusActive: false,
  };
}

describe("CombatAudit", () => {
  it("records route distance, incoming damage, KOs, and inventory use", () => {
    const first = createCharacter("a", "A", "Human", "Good", "Fighter", 0);
    const second = createCharacter("b", "B", "Human", "Good", "Priest", 1);
    const audit = new CombatAudit();
    audit.noteStep({
      floorId: 1,
      x: 2,
      y: 3,
      exploredBefore: true,
      exploredTileCountBefore: 18,
      floorExploredFractionBefore: 0.4,
      safeZone: false,
      tile: "floor",
    });
    audit.noteRecovery({ kind: "camp", floorId: 1, x: 1, y: 1 });
    audit.noteStep({
      floorId: 1,
      x: 3,
      y: 3,
      exploredBefore: false,
      exploredTileCountBefore: 19,
      floorExploredFractionBefore: 0.42,
      safeZone: false,
      authoredEventKind: "message",
      tile: "event",
    });
    audit.beginCombat({
      combat: combat([first, second]),
      context: { source: "random", tableId: 1 },
      floorId: 1,
      x: 3,
      y: 3,
      party: [first, second],
      inventory: [
        { itemId: "potion", identified: true },
        { itemId: "potion", identified: true },
      ],
    });
    const result = combat([first, second]);
    result.inventory = { potion: 1 };
    result.party[0]!.hp = 10;
    result.party[1]!.hp = 0;
    audit.endCombat(result);

    const record = audit.snapshot().records[0]!;
    expect(record.stepsSincePreviousCombat).toBe(2);
    expect(record.distanceFromPreviousSafeRest).toBe(1);
    expect(record.exploredBefore).toBe(false);
    expect(record.immediateBeforeAuthoredEvent).toBe(true);
    expect(record.damageReceived).toBe(9);
    expect(record.damageReceivedByCharacter[first.id]).toBe(9);
    expect(record.healingReceived).toBe(5);
    expect(record.healingReceivedByCharacter[first.id]).toBe(5);
    expect(record.charactersKOd).toEqual([second.id]);
    expect(record.consumablesUsed).toEqual({ potion: 1 });
    expect(record.result).toBe("victory");
  });

  it("records deterministic retry distance after a wipe", () => {
    const first = createCharacter("a", "A", "Human", "Good", "Fighter", 0);
    const second = createCharacter("b", "B", "Human", "Good", "Priest", 1);
    const audit = new CombatAudit();
    const start = {
      combat: combat([first, second]),
      context: { source: "random" as const, tableId: 1 },
      floorId: 2,
      x: 4,
      y: 5,
      party: [first, second],
      inventory: [],
    };
    audit.beginCombat(start);
    const wipe = combat([first, second]);
    wipe.result = "wipe";
    audit.endCombat(wipe);
    audit.noteStep({
      floorId: 2,
      x: 4,
      y: 6,
      exploredBefore: true,
      exploredTileCountBefore: 20,
      floorExploredFractionBefore: 0.5,
      safeZone: false,
    });
    audit.noteStep({
      floorId: 2,
      x: 4,
      y: 7,
      exploredBefore: true,
      exploredTileCountBefore: 21,
      floorExploredFractionBefore: 0.52,
      safeZone: false,
    });
    audit.beginCombat(start);
    const retry = combat([first, second]);
    retry.result = "victory";
    audit.endCombat(retry);

    expect(audit.snapshot().records[1]?.stepsSincePreviousWipe).toBe(2);
  });
});
