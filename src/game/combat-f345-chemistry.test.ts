/**
 * Phase A relationship propagation — Floors 3/4/5.
 *
 * Covers the three relationships that reuse proven Floor 1/2 primitives with
 * no new engine machinery:
 *
 *   F3  Rune Knight   -> Lesser Construct    (Consume, `overload`)
 *   F4  Choir Warden  -> Discordant Cantor   (Protect, `guardAlly`)
 *   F5  Drowned Sentinel -> Caller / Wraith  (Protect, `guardAlly`)
 *
 * The fourth planned relationship (Demon Mage -> Demon Spawn) is deliberately
 * absent: its activation surface reaches both climax boss tables. See
 * docs/combat-relationship-vocabulary.md § Source verification, Correction 2.
 */
import { describe, expect, it } from "vitest";
import { createCombatState, resolveCombatRound } from "./combat";
import { enemyAbilityById } from "../data/enemy-abilities";
import { ENCOUNTER_TABLES, ENEMIES_BY_ID } from "../data/enemies";
import type { CombatState, EnemyFormation, EnemyInstance } from "./combat-types";
import { createDefaultParty } from "./party";

function makeEnemy(
  id: string,
  instanceId: string,
  hp = 120,
  row: "front" | "back" = "front",
  overrides: Partial<EnemyInstance> = {}
): EnemyInstance {
  return {
    id,
    name: id,
    floors: [3],
    rowPreference: row,
    hp,
    attack: 1,
    ac: 0,
    agi: 1,
    xp: 5,
    gold: 3,
    special: [],
    isBoss: false,
    instanceId,
    currentHp: hp,
    row,
    status: [],
    ...overrides,
  };
}

function defendActions(state: CombatState) {
  return state.party.map((character) => ({
    kind: "defend" as const,
    actorId: character.id,
  }));
}

function formationsContaining(...ids: string[]) {
  const hits: string[] = [];
  for (const [floor, entries] of Object.entries(ENCOUNTER_TABLES)) {
    for (const entry of entries) {
      const spawnIds = entry.spawns.map((s) => s.enemyId);
      if (ids.every((id) => spawnIds.includes(id))) hits.push(`${floor}:${entry.id}`);
    }
  }
  return hits.sort();
}

// ---------------------------------------------------------------------------
// F3 — Rune Knight -> Lesser Construct (Consume / overload)
// ---------------------------------------------------------------------------

describe("f3 Rune Overload (consumeAlly reuse)", () => {
  it("the generic Rune Knight carries the same ability the Floor 1 Knight teaches", () => {
    expect(ENEMIES_BY_ID["rune-knight"]!.abilityIds).toContain("crypt-rune-overload");
    // Enemy literacy: the F1 crypt knight and the F3 knight must share the
    // ability so the learned rule transfers rather than being re-taught.
    expect(ENEMIES_BY_ID["crypt-rune-knight"]!.abilityIds).toContain(
      "crypt-rune-overload"
    );
  });

  it("the Floor 3 Lesser Construct is a valid conductive-construct resource", () => {
    expect(ENEMIES_BY_ID["lesser-construct"]!.chemistryGroups).toContain(
      "conductive-construct"
    );
  });

  it("exactly one formation activates the relationship, and it is the authored one", () => {
    expect(formationsContaining("rune-knight", "lesser-construct")).toEqual([
      "3:f3-guardian-rune-line",
    ]);
  });

  it("the Knight overloads the construct, consuming it for party-wide lightning", () => {
    const construct = makeEnemy("lesser-construct", "construct-0", 60, "front", {
      chemistryGroups: ["conductive-construct"],
      abilityIds: [],
    });
    const knight = makeEnemy("rune-knight", "knight-0", 200, "back", {
      abilityIds: ["crypt-rune-overload"],
      agi: 20,
    });
    const formation: EnemyFormation = { front: [construct], back: [knight] };
    let state = createCombatState(createDefaultParty(), formation, false);
    state.chemistryEnabled = true;
    const partyHpBefore = state.party.reduce((sum, c) => sum + c.hp, 0);

    // Overload has windUp, so it telegraphs on one round and resolves later.
    for (let i = 0; i < 4; i++) state = resolveCombatRound(state, defendActions(state), () => 0.1);

    expect(state.chemistryTelemetry?.resolved["chem-rune-overload"]).toBe(1);
    // The construct is spent (consumed bodies are cleared from the formation,
    // so absence or hp 0 both count as spent), and the party ate the discharge.
    const survivingConstruct = [...state.enemies.front, ...state.enemies.back].find(
      (e) => e.instanceId === "construct-0" && e.currentHp > 0
    );
    expect(survivingConstruct).toBeUndefined();
    expect(state.party.reduce((sum, c) => sum + c.hp, 0)).toBeLessThan(partyHpBefore);
  });

  it("is inert with no construct present — the Knight never wastes the turn", () => {
    const knight = makeEnemy("rune-knight", "knight-0", 200, "back", {
      abilityIds: ["crypt-rune-overload"],
      agi: 20,
    });
    const filler = makeEnemy("animated-armor", "armor-0", 60, "front", { abilityIds: [] });
    let state = createCombatState(createDefaultParty(), { front: [filler], back: [knight] }, false);
    state.chemistryEnabled = true;
    for (let i = 0; i < 4; i++) state = resolveCombatRound(state, defendActions(state), () => 0.1);
    expect(state.chemistryTelemetry?.resolved["chem-rune-overload"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// F4 — Choir Warden -> Cantor (Protect / guardAlly)
// ---------------------------------------------------------------------------

function makeChoirGuardState(): CombatState {
  const warden = makeEnemy("choir-warden", "warden-0", 500, "front", {
    abilityIds: ["choir-guard"],
    agi: 20,
  });
  const cantor = makeEnemy("discordant-cantor", "cantor-0", 100, "back", {
    abilityIds: [],
  });
  const state = createCombatState(
    createDefaultParty(),
    { front: [warden], back: [cantor] },
    false
  );
  state.chemistryEnabled = true;
  return state;
}

describe("f4 Choir Guard (guard pipeline reuse)", () => {
  it("is registered, reuses the guard effect, and covers both Choir casters", () => {
    const ability = enemyAbilityById("choir-guard");
    expect(ability).toBeDefined();
    expect(ability!.effect.kind).toBe("guard");
    expect(ability!.presentation).toBe("guardAlly");
    expect(ability!.guardTargetIds).toEqual(["discordant-cantor", "choir-magus"]);
    expect(ability!.chemistryId).toBe("chem-choir-guard");
  });

  it("is tuned down from ARCHER_GUARD rather than cloned across", () => {
    const choir = enemyAbilityById("choir-guard")!;
    const archer = enemyAbilityById("archer-guard")!;
    // The Warden is hp75/ac20/highDefense vs the Armored Skeleton's hp19/ac5.
    // Equal durability tuning on a far tankier body is tedious, not tactical.
    expect(choir.maxUses!).toBeLessThan(archer.maxUses!);
    expect(choir.cooldown!).toBeGreaterThan(archer.cooldown!);
  });

  it("the Warden guards the Cantor via the round-based AI", () => {
    const state = resolveCombatRound(
      makeChoirGuardState(),
      defendActions(makeChoirGuardState()),
      () => 0.1
    );
    const guard = state.enemyGuards?.["cantor-0"];
    expect(guard?.guarderId).toBe("warden-0");
    expect(state.chemistryTelemetry?.resolved["chem-choir-guard"]).toBe(1);
  });

  it("redirects one direct attack from the Cantor into the Warden", () => {
    let state = resolveCombatRound(
      makeChoirGuardState(),
      defendActions(makeChoirGuardState()),
      () => 0.1
    );
    const cantor = state.enemies.back[0]!;
    const cantorHpBefore = cantor.currentHp;
    const wardenHpBefore = state.enemies.front[0]!.currentHp;
    state = resolveCombatRound(
      state,
      [
        { kind: "attack", actorId: state.party[0]!.id, targetInstanceId: cantor.instanceId },
        ...state.party.slice(1).map((c) => ({ kind: "defend" as const, actorId: c.id })),
      ],
      () => 0.99
    );
    expect(state.enemies.back[0]!.currentHp).toBe(cantorHpBefore);
    expect(state.enemies.front[0]!.currentHp).toBeLessThan(wardenHpBefore);
  });

  it("is inert with no Choir caster present", () => {
    const warden = makeEnemy("choir-warden", "warden-0", 500, "front", {
      abilityIds: ["choir-guard"],
      agi: 20,
    });
    const filler = makeEnemy("animated-armor", "armor-0", 60, "back", { abilityIds: [] });
    let state = createCombatState(
      createDefaultParty(),
      { front: [warden], back: [filler] },
      false
    );
    state.chemistryEnabled = true;
    state = resolveCombatRound(state, defendActions(state), () => 0.1);
    expect(state.enemyGuards?.["armor-0"]).toBeUndefined();
    expect(state.chemistryTelemetry?.resolved["chem-choir-guard"]).toBeUndefined();
  });

  it("activates on the two existing Warden+Cantor formations, and no Magus formation exists", () => {
    expect(formationsContaining("choir-warden", "discordant-cantor")).toEqual([
      "4:f4-choir-armor",
      "4:f4-choir-guardian",
    ]);
    // The Magus guard path is authored but intentionally inert — no formation
    // pairs the two, and none was invented just to exercise it.
    expect(formationsContaining("choir-warden", "choir-magus")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// F5 — Drowned Sentinel -> Caller / Wraith (Protect / guardAlly)
// ---------------------------------------------------------------------------

describe("f5 Sentinel Guard (guard pipeline reuse)", () => {
  it("is registered and covers both fragile Cistern casters", () => {
    const ability = enemyAbilityById("sentinel-guard");
    expect(ability).toBeDefined();
    expect(ability!.effect.kind).toBe("guard");
    expect(ability!.presentation).toBe("guardAlly");
    expect(ability!.guardTargetIds).toEqual(["undertow-caller", "cistern-wraith"]);
    expect(ability!.chemistryId).toBe("chem-sentinel-guard");
  });

  it("is the most conservative guard in the game", () => {
    const sentinel = enemyAbilityById("sentinel-guard")!;
    const archer = enemyAbilityById("archer-guard")!;
    const choir = enemyAbilityById("choir-guard")!;
    // hp120/ac21/30% physical resist: every intercept is near a wasted turn
    // for a physical attacker, so one charge on a long cooldown.
    expect(sentinel.maxUses).toBe(1);
    expect(sentinel.cooldown!).toBeGreaterThanOrEqual(choir.cooldown!);
    expect(sentinel.cooldown!).toBeGreaterThan(archer.cooldown!);
  });

  it("guards a caller and redirects one attack into the Sentinel", () => {
    const sentinel = makeEnemy("drowned-sentinel", "sentinel-0", 500, "front", {
      abilityIds: ["sentinel-guard"],
      agi: 20,
    });
    const caller = makeEnemy("undertow-caller", "caller-0", 100, "back", { abilityIds: [] });
    let state = createCombatState(
      createDefaultParty(),
      { front: [sentinel], back: [caller] },
      false
    );
    state.chemistryEnabled = true;
    state = resolveCombatRound(state, defendActions(state), () => 0.1);
    expect(state.enemyGuards?.["caller-0"]?.guarderId).toBe("sentinel-0");

    const callerHpBefore = state.enemies.back[0]!.currentHp;
    const sentinelHpBefore = state.enemies.front[0]!.currentHp;
    state = resolveCombatRound(
      state,
      [
        { kind: "attack", actorId: state.party[0]!.id, targetInstanceId: "caller-0" },
        ...state.party.slice(1).map((c) => ({ kind: "defend" as const, actorId: c.id })),
      ],
      () => 0.99
    );
    expect(state.enemies.back[0]!.currentHp).toBe(callerHpBefore);
    expect(state.enemies.front[0]!.currentHp).toBeLessThan(sentinelHpBefore);
  });

  it("protects the more wounded caster when both a Caller and a Wraith are present", () => {
    // f5-golem-cistern contains both, so target priority is live content, not
    // a hypothetical. combat-ai.ts sorts guard candidates by currentHp/hp.
    const sentinel = makeEnemy("drowned-sentinel", "sentinel-0", 500, "front", {
      abilityIds: ["sentinel-guard"],
      agi: 20,
    });
    const caller = makeEnemy("undertow-caller", "caller-0", 100, "back", { abilityIds: [] });
    const wraith = makeEnemy("cistern-wraith", "wraith-0", 100, "back", {
      abilityIds: [],
      currentHp: 20,
    });
    let state = createCombatState(
      createDefaultParty(),
      { front: [sentinel], back: [caller, wraith] },
      false
    );
    state.chemistryEnabled = true;
    state = resolveCombatRound(state, defendActions(state), () => 0.1);
    expect(state.enemyGuards?.["wraith-0"]?.guarderId).toBe("sentinel-0");
    expect(state.enemyGuards?.["caller-0"]).toBeUndefined();
  });

  it("activates on exactly the one clean Cistern formation", () => {
    expect(formationsContaining("drowned-sentinel", "undertow-caller")).toEqual([
      "5:f5-golem-cistern",
    ]);
    expect(formationsContaining("drowned-sentinel", "cistern-wraith")).toEqual([
      "5:f5-golem-cistern",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Absence guard for the blocked relationship
// ---------------------------------------------------------------------------

describe("f3 Spawn Bomb is deliberately NOT wired to the generic Demon Mage", () => {
  it("demon-mage does not carry spawn bomb", () => {
    // Blocked: demon-mage escorts f4-lonely-girl (table 8) and f5-crying-man
    // (table 9), both of which run with chemistryEnabled, and its summon-imp
    // manufactures its own volatile-spawn ammunition. Wiring this silently
    // adds an untuned party-wide nuke to both climax fights.
    expect(ENEMIES_BY_ID["demon-mage"]!.abilityIds).not.toContain("crypt-spawn-bomb");
  });

  it("the boss escort surface that blocks it still exists", () => {
    const bossTables = [...ENCOUNTER_TABLES[8]!, ...ENCOUNTER_TABLES[9]!];
    const escortsAMage = bossTables.filter((e) =>
      e.spawns.some((s) => s.enemyId === "demon-mage")
    );
    expect(escortsAMage).toHaveLength(2);
  });
});
