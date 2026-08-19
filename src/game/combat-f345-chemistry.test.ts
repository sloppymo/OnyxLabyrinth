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
import { applyCombatPartyResult, createDefaultParty } from "./party";
import { partyStatusText } from "../engine/combat-display";
import { COMBAT_VISIBLE_STATUSES } from "../debug/combat-player-view";

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

  it("the construct is screened — it must not be the default target", () => {
    // Embodied play: combat-ai reserves the lowest-spawnSerial resource and
    // the combat UI opens its target list on the front-most body. If the
    // consumable resource is listed first, the player's very first keypress
    // destroys the exact construct the Knight reserved, and the relationship
    // fires 0% of the time. Screening it behind a non-consumable body takes
    // that to 86%. Order in `spawns` is load-bearing, not cosmetic.
    const entry = ENCOUNTER_TABLES[3]!.find((e) => e.id === "f3-guardian-rune-line")!;
    const front = entry.spawns.filter((s) => s.row === "front");
    expect(front[0]!.enemyId).not.toBe("lesser-construct");
    expect(front.some((s) => s.enemyId === "lesser-construct")).toBe(true);
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
// Legibility: a relationship the player never lives to see is not a relationship
// ---------------------------------------------------------------------------

/** Small seeded PRNG — a fixed rng makes weighted ability selection degenerate. */
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function appearanceRate(
  chemistryId: string,
  build: () => EnemyFormation,
  rounds = 6,
  trials = 100
): number {
  let fired = 0;
  for (let t = 0; t < trials; t++) {
    const rng = mulberry(t + 1);
    let state = createCombatState(createDefaultParty(), build(), false);
    state.chemistryEnabled = true;
    for (let r = 0; r < rounds; r++) {
      state = resolveCombatRound(state, defendActions(state), rng);
      if ((state.chemistryTelemetry?.resolved?.[chemistryId] ?? 0) > 0) { fired++; break; }
    }
  }
  return fired / trials;
}

function live(id: string, instanceId: string, row: "front" | "back"): EnemyInstance {
  const def = ENEMIES_BY_ID[id]!;
  return {
    ...def,
    special: [...def.special],
    instanceId,
    currentHp: def.hp,
    row,
    status: [],
  } as EnemyInstance;
}

describe("Phase A relationships are reachable inside a normal fight", () => {
  // IMPORTANT CAVEAT (embodied playtest, 2026-08-19): these rates are measured
  // with a DEFENDING party, so nothing ever dies and both ends of every
  // relationship survive. They prove the ability is *reachable* — not that a
  // player will see it. Embodied play found the opposite for two of them:
  // f4-viper-mage measures 88% here and fired 0 of 1 against a party that
  // actually fights, because focus-fire destroys the fragile resource first.
  // Read these as regression guards against an ability being crowded out of
  // the AI's option list, nothing more.
  // See docs/playtests/2026-08-19-f345-embodied-relationship-playtest.md.
  // Measured over seeded trials rather than a fixed rng: with a constant rng
  // the weighted pick always lands on the same branch, which made the Sentinel
  // guard look like it first fired on round 5 when it actually medians on
  // round 2. These bounds guard against a future ability being added to one of
  // these species and crowding the relationship out of the fight.
  it("the Choir Warden guards the Cantor in most fights", () => {
    expect(
      appearanceRate("chem-choir-guard", () => ({
        front: [live("choir-warden", "warden-0", "front"), live("animated-armor", "armor-1", "front")],
        back: [live("discordant-cantor", "cantor-0", "back"), live("demon-mage", "mage-0", "back")],
      }))
    ).toBeGreaterThan(0.8);
  });

  it("the Drowned Sentinel guards a caster in most fights despite being the slowest actor", () => {
    expect(
      appearanceRate("chem-sentinel-guard", () => ({
        front: [live("ice-golem", "golem-0", "front"), live("drowned-sentinel", "sentinel-0", "front")],
        back: [live("cistern-wraith", "wraith-0", "back"), live("undertow-caller", "caller-0", "back")],
      }))
    ).toBeGreaterThan(0.8);
  });

  it("the Rune Knight completes an overload in most fights despite the wind-up", () => {
    expect(
      appearanceRate("chem-rune-overload", () => ({
        front: [live("lesser-construct", "construct-0", "front"), live("animated-armor", "armor-0", "front")],
        back: [live("rune-knight", "knight-0", "back"), live("warlock", "warlock-0", "back")],
      }))
    ).toBeGreaterThan(0.8);
  });
});

// ---------------------------------------------------------------------------
// F3 — Demon Mage -> Demon Spawn (Detonate / detonateAlly)
// ---------------------------------------------------------------------------

describe("f3 Spawn Bomb (detonate reuse)", () => {
  it("the generic Demon Mage carries the same ability the Floor 1 Mage teaches", () => {
    expect(ENEMIES_BY_ID["demon-mage"]!.abilityIds).toContain("crypt-spawn-bomb");
    expect(ENEMIES_BY_ID["crypt-demon-mage"]!.abilityIds).toContain("crypt-spawn-bomb");
  });

  it("keeps summon-imp, so the Mage can manufacture its own ammunition", () => {
    const mage = ENEMIES_BY_ID["demon-mage"]!;
    expect(mage.abilityIds).toContain("summon-imp");
    const summon = enemyAbilityById("summon-imp")!;
    expect(summon.effect).toMatchObject({ kind: "summon", enemyId: "demon-spawn" });
    // The summoned body must actually be valid ammunition, or the loop is
    // fiction: summonEnemyBodies spreads the def, including chemistryGroups.
    expect(ENEMIES_BY_ID["demon-spawn"]!.chemistryGroups).toContain("volatile-spawn");
  });

  it("detonates a pre-placed Spawn for party-wide fire damage", () => {
    const spawn = live("demon-spawn", "spawn-0", "front");
    const mage = makeEnemy("demon-mage", "mage-0", 200, "back", {
      abilityIds: ["crypt-spawn-bomb"],
      agi: 20,
    });
    let state = createCombatState(
      createDefaultParty(),
      { front: [spawn], back: [mage] },
      false
    );
    state.chemistryEnabled = true;
    const before = state.party.reduce((sum, c) => sum + c.hp, 0);
    for (let i = 0; i < 4; i++) state = resolveCombatRound(state, defendActions(state), () => 0.1);

    expect(state.chemistryTelemetry?.resolved["chem-spawn-bomb"]).toBeGreaterThan(0);
    const survivingSpawn = [...state.enemies.front, ...state.enemies.back].find(
      (e) => e.instanceId === "spawn-0" && e.currentHp > 0
    );
    expect(survivingSpawn).toBeUndefined();
    expect(state.party.reduce((sum, c) => sum + c.hp, 0)).toBeLessThan(before);
  });

  it("is gated on the resource, not on the turn number", () => {
    // Was `notFirstTurn`, which combined with anti-magic-field's `firstTurn`
    // (weight 10, windUp) to lock the bomb out until turn 3 — by which point
    // focus-fire had killed the spawn. Embodied play saw 0 detonations across
    // 3 formations and 3 floors. See the 2026-08-19 embodied playtest doc.
    const bomb = enemyAbilityById("crypt-spawn-bomb")!;
    expect(bomb.condition).toEqual({
      kind: "allyPresent",
      resource: { group: "volatile-spawn" },
    });
  });

  it("is inert with no Spawn present — the Mage never wastes the turn", () => {
    const mage = makeEnemy("demon-mage", "mage-0", 200, "back", {
      abilityIds: ["crypt-spawn-bomb"],
      agi: 20,
    });
    const filler = makeEnemy("animated-armor", "armor-0", 60, "front", { abilityIds: [] });
    let state = createCombatState(
      createDefaultParty(),
      { front: [filler], back: [mage] },
      false
    );
    state.chemistryEnabled = true;
    for (let i = 0; i < 4; i++) state = resolveCombatRound(state, defendActions(state), () => 0.1);
    expect(state.chemistryTelemetry?.resolved["chem-spawn-bomb"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// F4 — Discordant Cantor -> Iron Choristers (Conduct / livingAllies scaling)
// ---------------------------------------------------------------------------

function makeConductState(choristers: number): CombatState {
  const cantor = makeEnemy("discordant-cantor", "cantor-0", 300, "back", {
    abilityIds: ["discordant-phrase"],
    agi: 20,
  });
  const front: EnemyInstance[] = [];
  for (let i = 0; i < choristers; i++) {
    front.push(
      makeEnemy("iron-chorister", `chorister-${i}`, 400, "front", {
        abilityIds: [],
        chemistryGroups: ["choir-chorister"],
      })
    );
  }
  // Always keep one non-amplifier body so "no choristers" is still a fight.
  front.push(makeEnemy("animated-armor", "armor-0", 400, "front", { abilityIds: [] }));
  const state = createCombatState(createDefaultParty(), { front, back: [cantor] }, false);
  state.chemistryEnabled = true;
  return state;
}

function runConduct(state: CombatState, rounds = 6): CombatState {
  let s = state;
  for (let i = 0; i < rounds; i++) s = resolveCombatRound(s, defendActions(s), () => 0.1);
  return s;
}

describe("f4 Conduct (generic livingAllies scaling)", () => {
  it("is an ordinary damage ability with generic scaling — not a bespoke effect kind", () => {
    const ability = enemyAbilityById("discordant-phrase")!;
    expect(ability.effect.kind).toBe("damage");
    // The resolver must stay fiction-free; the choir lives in the presentation.
    expect(ability.presentation).toBe("conduct");
    expect(ability.windUp).toBe(true);
    const effect = ability.effect as Extract<typeof ability.effect, { kind: "damage" }>;
    expect(effect.scaling).toEqual({
      kind: "livingAllies",
      group: "choir-chorister",
      perAlly: 5,
      maxAllies: 3,
    });
  });

  it("the Iron Chorister is tagged as an amplifier", () => {
    expect(ENEMIES_BY_ID["iron-chorister"]!.chemistryGroups).toContain("choir-chorister");
    expect(ENEMIES_BY_ID["discordant-cantor"]!.abilityIds).toContain("discordant-phrase");
  });

  it("scales the payoff by the number of living Choristers", () => {
    const withTwo = runConduct(makeConductState(2));
    const withOne = runConduct(makeConductState(1));
    const damage = (s: CombatState) =>
      s.party.reduce((sum, c) => sum + (c.maxHp - c.hp), 0);
    expect(withTwo.chemistryTelemetry?.resolved["chem-conduct"]).toBeGreaterThan(0);
    expect(withOne.chemistryTelemetry?.resolved["chem-conduct"]).toBeGreaterThan(0);
    // More singers, bigger chord. This is the whole relationship.
    expect(damage(withTwo)).toBeGreaterThan(damage(withOne));
  });

  it("counts amplifiers at RESOLVE time, so killing a singer mid-phrase weakens it", () => {
    // The count must not be frozen at telegraph, or "thin the choir" would be
    // a counter the player cannot actually execute once the phrase has begun.
    let s = makeConductState(2);
    s = resolveCombatRound(s, defendActions(s), () => 0.1); // telegraph
    expect(s.log.some((l) => l.includes("begins charging Discordant Phrase"))).toBe(true);
    // Kill one singer during the wind-up.
    const singer = s.enemies.front.find((e) => e.id === "iron-chorister")!;
    singer.currentHp = 0;
    s = runConduct(s, 4);
    const swell = s.log.find((l) => l.includes("swells"));
    expect(swell).toBeDefined();
    expect(swell).toContain("1 voice joins");
  });

  it("announces the amplifier count at telegraph, while the player can still act", () => {
    const s = resolveCombatRound(makeConductState(2), defendActions(makeConductState(2)), () => 0.1);
    const telegraph = s.log.find((l) => l.includes("begins charging Discordant Phrase"));
    expect(telegraph).toBeDefined();
    expect(telegraph).toContain("2 voices answering");
  });

  it("does not count the Cantor itself as one of its own voices", () => {
    const s = runConduct(makeConductState(1));
    const swell = s.log.find((l) => l.includes("swells"));
    expect(swell).toContain("1 voice joins");
  });

  it("is inert with no Chorister present", () => {
    const s = runConduct(makeConductState(0));
    expect(s.chemistryTelemetry?.resolved["chem-conduct"]).toBeUndefined();
    expect(s.log.some((l) => l.includes("Discordant Phrase"))).toBe(false);
  });

  it("activates on exactly the one authored formation", () => {
    expect(formationsContaining("discordant-cantor", "iron-chorister")).toEqual([
      "4:f4-chorister-demon",
    ]);
  });

  it("keeps the amplifiers in the default target slot on purpose", () => {
    // Conduct degrades rather than breaking, so unlike a Consume relationship
    // the consumable-adjacent bodies SHOULD sit where naive play hits them:
    // chipping a Chorister is the intended "thin the choir" counter.
    const entry = ENCOUNTER_TABLES[4]!.find((e) => e.id === "f4-chorister-demon")!;
    expect(entry.spawns.filter((s) => s.row === "front").every((s) => s.enemyId === "iron-chorister")).toBe(true);
    // ...and the conductor is behind them, so naive play cannot cancel by accident.
    expect(entry.spawns.find((s) => s.enemyId === "discordant-cantor")!.row).toBe("back");
  });
});

// ---------------------------------------------------------------------------
// F5 — Undertow Caller -> Flood Brute (Setup -> Payoff, party state)
// ---------------------------------------------------------------------------

describe("f5 Undertow (setup -> payoff on party state)", () => {
  it("the setup marks without damaging — it is not a countdown to death", () => {
    const drag = enemyAbilityById("undertow-drag")!;
    expect(drag.effect).toMatchObject({ kind: "status", status: "undertow" });
    // No damage, no doom timer: all the danger is what the Brute does about it.
    expect(drag.effect.kind).toBe("status");
    expect(ENEMIES_BY_ID["undertow-caller"]!.abilityIds).toContain("undertow-drag");
  });

  it("the Caller will not mark when no Brute is present to act on it", () => {
    // A mark with no predator does nothing at all, so an ungated Caller would
    // spend turns teaching the player the status is harmless.
    const drag = enemyAbilityById("undertow-drag")!;
    expect(drag.condition).toEqual({
      kind: "allyPresent",
      resource: { enemyIds: ["flood-brute"] },
    });
  });

  it("the payoff is a distinct named ability gated on the mark existing", () => {
    const lunge = enemyAbilityById("undertow-lunge")!;
    expect(lunge.condition).toEqual({ kind: "partyHasStatus", status: "undertow" });
    expect(lunge.preferStatus).toBe("undertow");
    expect(ENEMIES_BY_ID["flood-brute"]!.abilityIds).toContain("undertow-lunge");
  });

  it("damage amplification is conservative — the threat is target pressure", () => {
    const lunge = enemyAbilityById("undertow-lunge")!;
    const effect = lunge.effect as Extract<typeof lunge.effect, { kind: "damage" }>;
    // Deliberately in the same band as the Brute's ordinary output rather than
    // a multiplier. Verified in play before any tuning is considered.
    expect(effect.power).toBeLessThanOrEqual(16);
  });

  it("the Brute hunts the marked character over a more wounded unmarked one", () => {
    const brute = makeEnemy("flood-brute", "brute-0", 400, "front", {
      abilityIds: ["undertow-lunge"],
      agi: 20,
    });
    let state = createCombatState(createDefaultParty(), { front: [brute], back: [] }, false);
    state.chemistryEnabled = true;
    // Mark a HEALTHY character; wound a different one badly. Target preference
    // must beat the generic "finish the weakest" instinct.
    const markedChar = state.party[0]!;
    const woundedChar = state.party[1]!;
    markedChar.status.push("undertow");
    state.undertowTimers[markedChar.id] = 3;
    woundedChar.hp = 1;
    const markedBefore = markedChar.hp;
    state = resolveCombatRound(state, defendActions(state), () => 0.1);
    const marked = state.party.find((c) => c.id === markedChar.id)!;
    expect(marked.hp).toBeLessThan(markedBefore);
    expect(state.log.some((l) => l.includes("Drowning Lunge") && l.includes(marked.name))).toBe(true);
  });

  it("the mark expires on its own — enduring it is a real counter", () => {
    const brute = makeEnemy("flood-brute", "brute-0", 400, "front", { abilityIds: [] });
    let state = createCombatState(createDefaultParty(), { front: [brute], back: [] }, false);
    state.chemistryEnabled = true;
    const victim = state.party[0]!;
    victim.status.push("undertow");
    state.undertowTimers[victim.id] = 2;
    for (let i = 0; i < 4; i++) state = resolveCombatRound(state, defendActions(state), () => 0.1);
    expect(state.party[0]!.status).not.toContain("undertow");
    expect(state.log.some((l) => l.includes("free of the undertow"))).toBe(true);
  });

  it("does not follow the party out of combat", () => {
    // Combat-only: an undertow mark must never walk the dungeon into the next
    // fight, or the Brute's preference would fire before its Caller ever acts.
    const party = createDefaultParty();
    party[0]!.status.push("undertow");
    expect(applyCombatPartyResult(party)[0]!.status).not.toContain("undertow");
  });

  it("is visible to the player, not just present in state", () => {
    const marked = { ...createDefaultParty()[0]!, status: ["undertow" as const] };
    expect(partyStatusText(marked)).toBe("Undertow");
    expect((COMBAT_VISIBLE_STATUSES as readonly string[])).toContain("undertow");
  });

  it("activates on exactly the one formation, with the Brute screened", () => {
    expect(formationsContaining("undertow-caller", "flood-brute")).toEqual([
      "5:f5-flood-brute",
    ]);
    // The payoff actor must not be the default target, or naive play deletes
    // it before it can exploit (29% -> 53% exploitation when screened).
    const entry = ENCOUNTER_TABLES[5]!.find((e) => e.id === "f5-flood-brute")!;
    expect(entry.spawns.filter((s) => s.row === "front")[0]!.enemyId).not.toBe("flood-brute");
  });
});

// ---------------------------------------------------------------------------
// The climax fights are self-contained set-pieces — no chemistry may fire
// ---------------------------------------------------------------------------

describe("boss tables are closed to Formation Chemistry", () => {
  const BOSS_TABLES = [8, 9] as const;

  it("no boss escort can detonate: no bomber and no spawn-summoner", () => {
    // Closed by composition, not by a special case in the resolver. Both
    // climax formations escort a Warlock instead of a Demon Mage. If someone
    // re-adds a Demon Mage (or any summon-imp carrier) here, this fails.
    for (const table of BOSS_TABLES) {
      for (const entry of ENCOUNTER_TABLES[table]!) {
        for (const spawn of entry.spawns) {
          const def = ENEMIES_BY_ID[spawn.enemyId]!;
          expect(def.abilityIds ?? []).not.toContain("crypt-spawn-bomb");
          expect(def.abilityIds ?? []).not.toContain("summon-imp");
          expect(def.chemistryGroups ?? []).not.toContain("volatile-spawn");
        }
      }
    }
  });

  it("no boss escort carries any chemistry ability at all", () => {
    for (const table of BOSS_TABLES) {
      for (const entry of ENCOUNTER_TABLES[table]!) {
        for (const spawn of entry.spawns) {
          const def = ENEMIES_BY_ID[spawn.enemyId]!;
          for (const abilityId of def.abilityIds ?? []) {
            expect(enemyAbilityById(abilityId)?.chemistryId).toBeUndefined();
          }
        }
      }
    }
  });

  it("the replacement preserves the escort's role", () => {
    // Warlock is the closest body in the roster to the Demon Mage it replaced:
    // same row, same caster-fire/resistFire/weakWater profile, and it shares
    // hellfire and anti-magic-field. The swap trades summon-imp for chaos-bolt.
    const warlock = ENEMIES_BY_ID["warlock"]!;
    const mage = ENEMIES_BY_ID["demon-mage"]!;
    expect(warlock.rowPreference).toBe(mage.rowPreference);
    expect(warlock.abilityIds).toContain("hellfire");
    expect(warlock.abilityIds).toContain("anti-magic-field");
    expect(warlock.chemistryGroups ?? []).toEqual([]);
    for (const table of BOSS_TABLES) {
      const ids = ENCOUNTER_TABLES[table]!.flatMap((e) => e.spawns.map((s) => s.enemyId));
      expect(ids).toContain("warlock");
      expect(ids).not.toContain("demon-mage");
    }
  });
});
