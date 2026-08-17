import { describe, it, expect } from "vitest";
import {
  ALL_ENEMIES,
  BIG_TITTY_OGRE,
  ENCOUNTER_TABLES,
  ENEMIES_BY_ID,
  RED_SKELETON,
  enemiesForFloor,
} from "./enemies";
import { getFloors } from "../game/floor-registry";
import { ALL_ENEMY_ABILITIES, enemyAbilityById } from "./enemy-abilities";

describe("enemy data", () => {
  it("registers big-titty-ogre", () => {
    expect(ENEMIES_BY_ID["big-titty-ogre"]).toBeDefined();
    expect(ENEMIES_BY_ID["big-titty-ogre"].isBoss).toBe(false);
  });

  it("exports the ogre constant with expected stats", () => {
    expect(BIG_TITTY_OGRE).toBeDefined();
    expect(BIG_TITTY_OGRE.id).toBe("big-titty-ogre");
    expect(BIG_TITTY_OGRE.floors).toContain(3);
  });

  it("includes the ogre in floor 3 enemies", () => {
    const ids = enemiesForFloor(3).map((e) => e.id);
    expect(ids).toContain("big-titty-ogre");
  });

  it("includes the ogre in floor 3 encounter tables", () => {
    const refs = ENCOUNTER_TABLES[3].flatMap((entry) =>
      entry.spawns.map((spawn) => spawn.enemyId)
    );
    expect(refs).toContain("big-titty-ogre");
  });

  it("registers the red skeleton as a high-gold early-floor enemy", () => {
    expect(RED_SKELETON.floors).toEqual([1, 2]);
    expect(RED_SKELETON.gold).toBe(200);
    expect(RED_SKELETON.special).toContainEqual({ kind: "undead" });
    expect(RED_SKELETON.gold).toBeGreaterThanOrEqual(
      ENEMIES_BY_ID["skeleton"].gold * 10
    );
  });

  it("keeps chemistry membership narrow and authored", () => {
    expect(ENEMIES_BY_ID["slime"].chemistryGroups).toEqual(["throwable-slime"]);
    expect(ENEMIES_BY_ID["skeleton"].chemistryGroups).toEqual(["harvestable-bone"]);
    expect(ENEMIES_BY_ID["skeleton-archer"].chemistryGroups).toBeUndefined();
    expect(ENEMIES_BY_ID["demon-spawn"].chemistryGroups).toEqual(["volatile-spawn"]);
  });

  it("puts an escalating boss variant on each deep floor's climax table (not the same boss reused)", () => {
    // Each campaign boss lives on its own guaranteed climax table, not the
    // ambient floor table — hallway rolls must not be able to start the ending.
    const expectedBossByTable: Record<number, string> = {
      7: "headmasters-echo",
      8: "headmasters-echo-remnant",
      9: "headmasters-echo-ascendant",
    };
    for (const [tableStr, expectedBoss] of Object.entries(expectedBossByTable)) {
      const table = Number(tableStr);
      const refs = ENCOUNTER_TABLES[table].flatMap((entry) =>
        entry.spawns.map((spawn) => spawn.enemyId)
      );
      expect(refs, `table ${table}`).toContain(expectedBoss);
    }
  });

  it("escalates boss stats floor-to-floor instead of reusing the same boss", () => {
    const echo = ENEMIES_BY_ID["headmasters-echo"];
    const remnant = ENEMIES_BY_ID["headmasters-echo-remnant"];
    const ascendant = ENEMIES_BY_ID["headmasters-echo-ascendant"];
    expect(echo.hp).toBeLessThan(remnant.hp);
    expect(remnant.hp).toBeLessThan(ascendant.hp);
    expect(echo.attack).toBeLessThan(remnant.attack);
    expect(remnant.attack).toBeLessThan(ascendant.attack);
    // Floor 3's Echo is exclusive to floor 3 now — the escalated variants
    // took over floors 4/5 rather than the identical object appearing thrice.
    expect(echo.floors).toEqual([3]);
    expect(remnant.floors).toEqual([4]);
    expect(ascendant.floors).toEqual([5]);
  });

  it("gives floors 4-5 their own exclusive enemy tier, not just denser floor-3 remixes", () => {
    const nonFloor3Exclusive = ALL_ENEMIES.filter(
      (e) => e.floors.length > 0 && !e.floors.includes(3)
    );
    // 10 new elites (5 per floor) + 2 escalated Echo variants.
    expect(nonFloor3Exclusive.length).toBeGreaterThanOrEqual(10);
    const floor4Exclusive = nonFloor3Exclusive.filter((e) => e.floors.includes(4));
    const floor5Exclusive = nonFloor3Exclusive.filter((e) => e.floors.includes(5));
    expect(floor4Exclusive.length).toBeGreaterThanOrEqual(5);
    expect(floor5Exclusive.length).toBeGreaterThanOrEqual(5);
    // The new tier raises the ceiling floor 3 set (Stone Guardian
    // hp72/atk19/ac16) on every axis — casters in the new roster are
    // intentionally squishier than the tanks (mirroring floor 3's own
    // warlock/demon-mage being far weaker than Stone Guardian), so this
    // checks the roster's peak, not every individual member.
    const stoneGuardian = ENEMIES_BY_ID["stone-guardian"];
    const regulars = nonFloor3Exclusive.filter((e) => !e.isBoss);
    expect(Math.max(...regulars.map((e) => e.hp))).toBeGreaterThan(stoneGuardian.hp);
    expect(Math.max(...regulars.map((e) => e.attack))).toBeGreaterThan(stoneGuardian.attack);
    expect(Math.max(...regulars.map((e) => e.ac))).toBeGreaterThan(stoneGuardian.ac);
  });
});

describe("encounter table integrity", () => {
  it("uses the authoritative Floor 1 first-test roster and weights", () => {
    const expectedIds = [
      "f1-acid-burrow",
      "f1-red-bone-bounty",
      "f1-orc-leap",
      "f1-minotaur-slime",
      "f1-ogre-toss",
      "f1-warlock-bone-battery",
      "f1-living-shield",
      "f1-hunting-pack",
      "f1-spawn-bomb",
      "f1-rune-overload",
      "f1-guarded-bomb",
      "f1-wraith-pincer",
      "f1-gaze-slime",
      "f1-flame-forge",
      "f1-solo-guardian",
      "f1-ghostfire-duet",
    ];
    const table = ENCOUNTER_TABLES[1];
    expect(table.map((entry) => entry.id)).toEqual(expectedIds);
    expect(table.reduce((sum, entry) => sum + entry.weight, 0)).toBe(33);
    expect(table.some((entry) => entry.id === "f1-slime-cluster")).toBe(false);
    expect(table.some((entry) => entry.id === "f1-bone-archer-line")).toBe(false);
  });

  it("registers only active Floor 1 Crypt variants with explicit sprite aliases", () => {
    const expectedIds = [
      "crypt-orc",
      "crypt-minotaur",
      "crypt-hill-ogre",
      "crypt-warlock",
      "crypt-animated-armor",
      "crypt-hellhound",
      "crypt-werewolf",
      "crypt-demon-spawn",
      "crypt-demon-mage",
      "crypt-lesser-construct",
      "crypt-rune-knight",
      "crypt-blood-monster",
      "crypt-blood-wraith",
      "crypt-gaze-wraith",
      "crypt-flame-golem",
      "crypt-stone-guardian",
      "crypt-ghostfire",
    ];
    const variants = ALL_ENEMIES.filter((enemy) => enemy.id.startsWith("crypt-"));
    expect(variants.map((enemy) => enemy.id)).toEqual(expectedIds);
    for (const enemy of variants) {
      expect(enemy.floors, enemy.id).toEqual([1]);
      expect(enemy.name, enemy.id).toMatch(/^Crypt /);
      expect(enemy.spriteId, enemy.id).toBeDefined();
      expect(enemy.isBoss, enemy.id).toBe(false);
    }
  });

  it("keeps chemistry membership and exact participant kits narrow", () => {
    expect(ENEMIES_BY_ID["crypt-demon-spawn"].chemistryGroups).toEqual(["volatile-spawn"]);
    expect(ENEMIES_BY_ID["crypt-lesser-construct"].chemistryGroups).toEqual(["conductive-construct"]);
    expect(ENEMIES_BY_ID["crypt-minotaur"].abilityIds).toContain("crypt-slime-cannon");
    expect(ENEMIES_BY_ID["crypt-hill-ogre"].abilityIds).toContain("ogre-toss");
    expect(ENEMIES_BY_ID["crypt-warlock"].abilityIds).toContain("crypt-bone-harvest");
    expect(ENEMIES_BY_ID["crypt-animated-armor"].abilityIds).toContain("crypt-living-shield");
    expect(ENEMIES_BY_ID["crypt-hellhound"].abilityIds).toContain("crypt-pack-hunt");
    expect(ENEMIES_BY_ID["crypt-hellhound"].agi).toBeGreaterThan(ENEMIES_BY_ID["crypt-werewolf"].agi);
    expect(ENEMIES_BY_ID["crypt-rune-knight"].abilityIds).toContain("crypt-rune-overload");
    expect(enemyAbilityById("ogre-toss")?.effect).toEqual({
      kind: "consumeAlly",
      resource: { enemyIds: ["skeleton"] },
      payoff: { kind: "damage", target: "singleParty", power: 10, element: "physical" },
    });
  });

  it("gives every authored table entry a stable id and family", () => {
    for (const [floor, entries] of Object.entries(ENCOUNTER_TABLES)) {
      const ids = entries.map((entry) => entry.id);
      expect(new Set(ids).size, `duplicate ids on table ${floor}`).toBe(ids.length);
      for (const entry of entries) {
        expect(entry.id.length).toBeGreaterThan(0);
        expect(entry.family.length).toBeGreaterThan(0);
      }
    }
  });

  it("every spawn enemyId in every floor's table resolves to a defined enemy", () => {
    for (const [floor, entries] of Object.entries(ENCOUNTER_TABLES)) {
      for (const entry of entries) {
        for (const spawn of entry.spawns) {
          expect(
            ENEMIES_BY_ID[spawn.enemyId],
            `floor ${floor}: unknown enemyId "${spawn.enemyId}"`
          ).toBeDefined();
        }
      }
    }
  });

  it("never places a boss-flagged enemy in the front row", () => {
    // Boss sprites draw at BOSS_SIZE (400px, see combat-scene.ts). The
    // nearest enemy cascade slot is only wide enough for ENEMY_SIZE (300px)
    // — a boss planted there would draw off the left edge. Back-row slots
    // are verified boss-safe in combat-scene-math.test.ts; keep bosses in
    // the back row so they land on those far/mid cascade positions.
    for (const [floor, entries] of Object.entries(ENCOUNTER_TABLES)) {
      for (const entry of entries) {
        for (const spawn of entry.spawns) {
          if (ENEMIES_BY_ID[spawn.enemyId]?.isBoss) {
            expect(
              spawn.row,
              `floor ${floor}: boss "${spawn.enemyId}" must spawn in the back row`
            ).toBe("back");
          }
        }
      }
    }
  });

  it("has a table for every registered floor and no orphan tables", () => {
    // Registry = campaign FLOORS merged with content/floors packs (floor 4).
    // A table key doesn't have to match a floor id one-to-one — a zone can
    // point its tableFloorId at a synthetic key (e.g. floor 2's forbidden-
    // wing climax table) — but every key must be reachable from somewhere:
    // either a floor id directly, or some zone's tableFloorId override.
    const floors = getFloors();
    const floorIds = floors.map((f) => f.id);
    const zoneTableIds = floors.flatMap(
      (f) => f.encounterZones?.map((z) => z.tableFloorId).filter((id): id is number => id !== undefined) ?? []
    );
    const reachableIds = [...new Set([...floorIds, ...zoneTableIds])].sort((a, b) => a - b);
    const tableIds = Object.keys(ENCOUNTER_TABLES).map(Number).sort((a, b) => a - b);
    expect(tableIds).toEqual(reachableIds);
  });

  it("re-themed bestiary ids are registered (slime/skeleton/orc family)", () => {
    for (const id of [
      "slime",
      "skeleton",
      "red-skeleton",
      "armored-skeleton",
      "skeleton-archer",
      "orc",
      "elite-orc",
      "werewolf",
    ]) {
      expect(ENEMIES_BY_ID[id], `missing ${id}`).toBeDefined();
    }
  });

  it("keeps the red skeleton rare on floors 1 and 2 only", () => {
    for (const floor of [1, 2]) {
      const table = ENCOUNTER_TABLES[floor];
      const redEntries = table.filter((entry) =>
        entry.spawns.some((spawn) => spawn.enemyId === "red-skeleton")
      );
      const totalWeight = table.reduce((sum, entry) => sum + entry.weight, 0);
      const redWeight = redEntries.reduce((sum, entry) => sum + entry.weight, 0);

      expect(redEntries).toHaveLength(1);
      expect(redWeight / totalWeight).toBeLessThan(0.1);
    }

    for (const floor of [3, 4, 5]) {
      expect(
        ENCOUNTER_TABLES[floor].some((entry) =>
          entry.spawns.some((spawn) => spawn.enemyId === "red-skeleton")
        )
      ).toBe(false);
    }
  });

  it("skeleton and ghost undead family carry the undead special", () => {
    for (const id of [
      "skeleton",
      "red-skeleton",
      "armored-skeleton",
      "skeleton-archer",
      "ghostfire",
      "blood-wraith",
      "headmasters-echo",
      "eyeball-monster",
    ]) {
      const enemy = ENEMIES_BY_ID[id];
      expect(enemy, `missing ${id}`).toBeDefined();
      expect(
        enemy.special.some((sp) => sp.kind === "undead"),
        `${id} should be tagged undead`
      ).toBe(true);
    }
  });

  it("fixes hell/lab identity tags from the hardness pass", () => {
    const hellhound = ENEMIES_BY_ID["hellhound"];
    const hellbat = ENEMIES_BY_ID["hellbat"];
    const archer = ENEMIES_BY_ID["skeleton-archer"];
    const experiment = ENEMIES_BY_ID["failed-experiment"];

    for (const e of [hellhound, hellbat]) {
      expect(e.special.some((sp) => sp.kind === "demon")).toBe(true);
      expect(
        e.special.some((sp) => sp.kind === "resistElement" && sp.element === "fire")
      ).toBe(true);
      expect(
        e.special.some((sp) => sp.kind === "weakElement" && sp.element === "water")
      ).toBe(true);
    }
    expect(archer.special.some((sp) => sp.kind === "flying")).toBe(false);
    expect(experiment.special.some((sp) => sp.kind === "poisonOnHit")).toBe(true);
  });

  it("applies ~60% combat stat scale (slime / skeleton floor)", () => {
    // Pre-pass: slime HP 8 / skeleton ATK 2. After ×1.6: 13 / 3.
    expect(ENEMIES_BY_ID["slime"].hp).toBeGreaterThanOrEqual(12);
    expect(ENEMIES_BY_ID["skeleton"].attack).toBeGreaterThanOrEqual(3);
    expect(ENEMIES_BY_ID["training-dummy"].hp).toBe(5);
  });

  it("encounter packs are dense enough that enemies can act", () => {
    const minAvg: Record<number, number> = {
      2: 3.5,
      3: 3.5,
      4: 3.5,
      5: 3.5,
    };
    for (const [floorStr, entries] of Object.entries(ENCOUNTER_TABLES)) {
      const floor = Number(floorStr);
      const totalWeight = entries.reduce((s, e) => s + e.weight, 0);
      const weightedSize =
        entries.reduce((s, e) => s + e.weight * e.spawns.length, 0) / totalWeight;
      if (floor === 1) {
        // Phase 8 removed both relief experiments after deterministic traces
        // showed no Split or Archer pressure before the fights ended. Their
        // six weight points were redistributed among surviving simple-band
        // entries: 76 weighted bodies / 33 weight.
        expect(weightedSize).toBeCloseTo(76 / 33, 10);
        continue;
      }
      expect(
        weightedSize,
        `floor ${floor} weighted avg pack size ${weightedSize.toFixed(2)}`
      ).toBeGreaterThanOrEqual(minAvg[floor] ?? 3);
    }
    // Acid puddle is no longer a lone Floor-1 soft solo.
    const soloAcid = ENCOUNTER_TABLES[1].some(
      (e) => e.spawns.length === 1 && e.spawns[0].enemyId === "acid-puddle"
    );
    expect(soloAcid).toBe(false);
  });

  it("every enemy's abilityIds resolve to a defined ability", () => {
    for (const enemy of ALL_ENEMIES) {
      for (const id of enemy.abilityIds ?? []) {
        expect(enemyAbilityById(id), `${enemy.id}: unknown ability "${id}"`).toBeDefined();
      }
    }
  });

  it("gives the new-sprite monsters their own signature kits, not borrowed ones", () => {
    // Shelf Stalker (displacer-beast): blink/vanish, not a copy of Werewolf's howl/pounce.
    expect(ENEMIES_BY_ID["displacer-beast"].abilityIds).toEqual([
      "blink-strike",
      "vanish",
      "rending-claw",
    ]);
    // Ice Golem: cold control/nuke, not Flame Golem's fire kit relabeled.
    expect(ENEMIES_BY_ID["ice-golem"].abilityIds).toEqual([
      "glacial-slam",
      "flash-freeze",
      "repair",
    ]);
    // Viper Man: venom kit + poisonOnHit, distinct from Black Knight's
    // shield-bash/phalanx-guard despite sharing its base stat block.
    expect(ENEMIES_BY_ID["viper-man"].abilityIds).toEqual([
      "venomous-strike",
      "charge",
      "coiled-fury",
    ]);
    expect(ENEMIES_BY_ID["viper-man"].abilityIds).not.toEqual(
      ENEMIES_BY_ID["black-knight"].abilityIds
    );
    expect(
      ENEMIES_BY_ID["viper-man"].special.some((s) => s.kind === "poisonOnHit")
    ).toBe(true);
  });

  it("Orc knows Pack Leap, a coordinated attack gated on a second living orc", () => {
    expect(ENEMIES_BY_ID["orc"].abilityIds).toEqual([
      "war-cry",
      "savage-lunge",
      "pack-leap",
    ]);
    const packLeap = enemyAbilityById("pack-leap");
    expect(packLeap?.condition).toEqual({ kind: "minSameKind", count: 2 });
    expect(packLeap?.presentation).toBe("meleeGangUp");
  });

  it("registers Pack 02 demon / forge enemies", () => {
    for (const id of [
      "eyeball-monster",
      "ghostfire",
      "flame-golem",
      "lava-slime",
      "hellhound",
      "hellbat",
      "black-knight",
      "minotaur",
      "warlock",
      "demon",
      "demoness",
      "ironclad-knight",
      "rune-knight",
      "blood-monster",
      "blood-wraith",
      "demon-brawler",
      "demon-spawn",
      "demon-champion",
      "demon-mage",
      "succubus",
    ]) {
      expect(ENEMIES_BY_ID[id], `missing ${id}`).toBeDefined();
    }
  });

  it("uses only known presentation keys on enemy abilities", () => {
    const known: string[] = [
      "meleeGangUp",
      "throwAlly",
      "consumeAlly",
      "detonateAlly",
      "packStrike",
      "guardAlly",
      "overload",
    ];
    for (const ability of ALL_ENEMY_ABILITIES) {
      if (ability.presentation) {
        expect(known, `unknown presentation: ${ability.presentation}`).toContain(
          ability.presentation,
        );
      }
    }
  });
});

describe("Floor 3 Grand Forge climax table (table 7)", () => {
  it("is only reachable from the grand-forge-guardian zone on floor 3", () => {
    for (const floor of getFloors()) {
      const zones = floor.encounterZones ?? [];
      for (const zone of zones) {
        if (zone.id === "grand-forge-guardian") {
          expect(zone.tableFloorId).toBe(7);
        } else {
          expect(zone.tableFloorId, `${floor.name}/${zone.id}`).not.toBe(7);
        }
      }
    }
  });

  it("is the sole home of The Dead Boy — the ambient floor-3 table no longer rolls it", () => {
    for (const entry of ENCOUNTER_TABLES[3]) {
      expect(entry.spawns.some((s) => s.enemyId === "headmasters-echo")).toBe(false);
    }
    expect(ENCOUNTER_TABLES[7].some((entry) => entry.spawns.some((s) => s.enemyId === "headmasters-echo"))).toBe(true);
  });

  it("is a single fixed formation (no reroll between attempts)", () => {
    expect(ENCOUNTER_TABLES[7].length).toBe(1);
  });

  it("all referenced ids are registered", () => {
    for (const entry of ENCOUNTER_TABLES[7]) {
      for (const spawn of entry.spawns) {
        expect(ENEMIES_BY_ID[spawn.enemyId], `unknown enemyId "${spawn.enemyId}"`).toBeDefined();
      }
    }
  });
});

describe("Floor 2 forbidden-wing climax table (table 6)", () => {
  it("is only reachable from the forbidden-wing-hot zone on floor 2", () => {
    for (const floor of getFloors()) {
      const zones = floor.encounterZones ?? [];
      for (const zone of zones) {
        if (zone.id === "forbidden-wing-hot") {
          expect(zone.tableFloorId).toBe(6);
        } else {
          expect(zone.tableFloorId, `${floor.name}/${zone.id}`).not.toBe(6);
        }
      }
    }
  });

  it("contains no boss enemies and all referenced ids are registered", () => {
    for (const entry of ENCOUNTER_TABLES[6]) {
      for (const spawn of entry.spawns) {
        const enemy = ENEMIES_BY_ID[spawn.enemyId];
        expect(enemy, `unknown enemyId "${spawn.enemyId}"`).toBeDefined();
        expect(enemy!.isBoss, `${spawn.enemyId} is a boss; table 6 must be regulars`).toBe(false);
      }
    }
  });

  it("uses only back-row spawns and respects the Gaze Wraith cap", () => {
    for (const entry of ENCOUNTER_TABLES[6]) {
      expect(entry.spawns.length).toBeLessThanOrEqual(5);
      expect(
        entry.spawns.filter((s) => s.enemyId === "eyeball-monster").length,
        "table 6 has at most 2 Gaze Wraiths per pack"
      ).toBeLessThanOrEqual(2);
      for (const spawn of entry.spawns) {
        expect(spawn.row).toBe("back");
      }
    }
  });
});

describe("Floor 4 sanctum climax table (table 8)", () => {
  it("is only reachable from the sanctum-guardian zone on floor 4", () => {
    for (const floor of getFloors()) {
      const zones = floor.encounterZones ?? [];
      for (const zone of zones) {
        if (zone.id === "sanctum-guardian") {
          expect(zone.tableFloorId).toBe(8);
        } else {
          expect(zone.tableFloorId, `${floor.name}/${zone.id}`).not.toBe(8);
        }
      }
    }
  });

  it("is the sole home of The Lonely Girl — the ambient floor-4 table no longer rolls it", () => {
    for (const entry of ENCOUNTER_TABLES[4]) {
      expect(entry.spawns.some((s) => s.enemyId === "headmasters-echo-remnant")).toBe(false);
    }
    expect(
      ENCOUNTER_TABLES[8].some((entry) =>
        entry.spawns.some((s) => s.enemyId === "headmasters-echo-remnant")
      )
    ).toBe(true);
  });

  it("is a single fixed formation (no reroll between attempts)", () => {
    expect(ENCOUNTER_TABLES[8].length).toBe(1);
  });

  it("all referenced ids are registered", () => {
    for (const entry of ENCOUNTER_TABLES[8]) {
      for (const spawn of entry.spawns) {
        expect(ENEMIES_BY_ID[spawn.enemyId], `unknown enemyId "${spawn.enemyId}"`).toBeDefined();
      }
    }
  });
});

describe("Floor 5 undersong climax table (table 9)", () => {
  it("is only reachable from the undersong-guardian zone on floor 5", () => {
    for (const floor of getFloors()) {
      const zones = floor.encounterZones ?? [];
      for (const zone of zones) {
        if (zone.id === "undersong-guardian") {
          expect(zone.tableFloorId).toBe(9);
        } else {
          expect(zone.tableFloorId, `${floor.name}/${zone.id}`).not.toBe(9);
        }
      }
    }
  });

  it("is the sole home of The Crying Man — the ambient floor-5 table no longer rolls it", () => {
    for (const entry of ENCOUNTER_TABLES[5]) {
      expect(entry.spawns.some((s) => s.enemyId === "headmasters-echo-ascendant")).toBe(false);
    }
    expect(
      ENCOUNTER_TABLES[9].some((entry) =>
        entry.spawns.some((s) => s.enemyId === "headmasters-echo-ascendant")
      )
    ).toBe(true);
  });

  it("is a single fixed formation (no reroll between attempts)", () => {
    expect(ENCOUNTER_TABLES[9].length).toBe(1);
  });

  it("all referenced ids are registered", () => {
    for (const entry of ENCOUNTER_TABLES[9]) {
      for (const spawn of entry.spawns) {
        expect(ENEMIES_BY_ID[spawn.enemyId], `unknown enemyId "${spawn.enemyId}"`).toBeDefined();
      }
    }
  });
});
