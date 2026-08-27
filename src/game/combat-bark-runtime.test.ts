import { describe, expect, it, beforeEach } from "vitest";
import { ALL_SPELLS } from "../data/spells";
import { ENEMIES_BY_ID } from "../data/enemies";
import { createCharacterRecord } from "./party";
import {
  beginRound,
  createCombatState,
  resolveCombatRound,
  resolvePlayerTurn,
} from "./combat";
import type { CombatEvent, CombatState, EnemyInstance, Rng } from "./combat-types";
import {
  offerLibraryBark,
  setCombatBarkLibraryRngForTests,
} from "./combat-bark-runtime";
import { eligibleCombatBarks, selectCombatBark } from "./combat-bark-library";
import type { CombatBarkProfile } from "../data/combat-bark-library/types";

const SPELLS = Object.fromEntries(ALL_SPELLS.map((spell) => [spell.id, spell]));

function constantRng(value: number): Rng {
  return () => value;
}

function makeEnemy(id = "skeleton-0", hp = 100): EnemyInstance {
  const def = ENEMIES_BY_ID.skeleton!;
  return {
    ...def,
    instanceId: id,
    currentHp: hp,
    hp,
    row: "front",
    status: [],
  };
}

function makeParty(classes: ("Fighter" | "Mage" | "Priest")[] = ["Fighter"]): ReturnType<typeof createCharacterRecord>[] {
  return classes.map((cls, i) => {
    const c = createCharacterRecord(`pc-${i}`, cls, "Human", "Neutral", cls, i);
    c.stats = { str: 12, vit: 12, agi: 12, int: 14, pie: 14, luk: 12 };
    c.maxHp = 100;
    c.hp = 100;
    c.maxSp = cls === "Mage" || cls === "Priest" ? 100 : 0;
    c.sp = c.maxSp;
    c.knownSpellIds = cls === "Mage" ? ["mage-fire-bolt", "mage-spark"] : cls === "Priest" ? ["priest-heal"] : [];
    return c;
  });
}

function makeState(classes: ("Fighter" | "Mage" | "Priest")[] = ["Fighter"]): CombatState {
  return createCombatState(
    makeParty(classes),
    { front: [makeEnemy()], back: [] },
    false,
    SPELLS
  );
}

describe("governed combat bark runtime", () => {
  beforeEach(() => {
    setCombatBarkLibraryRngForTests(() => 0);
  });

  it("observes the round-based resolver and emits a library bark without changing the attack event", () => {
    const state = makeState();
    const next = resolveCombatRound(
      state,
      [{ kind: "attack", actorId: "pc-0", targetInstanceId: "skeleton-0" }],
      constantRng(0.5)
    );
    const barks = next.events.filter((event) => event?.type === "bark");
    expect(barks.some((event) => event?.source === "library")).toBe(true);
    expect(next.events.some((event) => event?.type === "attack")).toBe(true);
    expect(next.enemies.front[0]?.currentHp).toBeLessThan(100);
  });

  it("observes the per-turn resolver and schedules the same kind of library event", () => {
    const state = makeState();
    const { state: begun, queue } = beginRound(state, constantRng(0.5));
    const actor = queue.find((entry) => entry.kind === "player")!;
    const next = resolvePlayerTurn(
      begun,
      { kind: "attack", actorId: actor.id, targetInstanceId: "skeleton-0" },
      constantRng(0.5)
    );
    expect(next.events.some((event) => event?.type === "bark" && event.source === "library")).toBe(true);
    expect(next.events.some((event) => event?.type === "attack")).toBe(true);
  });

  it("keeps the shipped fire line and layers a library line for a non-fire spell", () => {
    const fire = makeState(["Mage"]);
    const fireResult = resolvePlayerTurn(
      fire,
      { kind: "cast", actorId: "pc-0", spellId: "mage-fire-bolt", targetInstanceId: "skeleton-0" },
      constantRng(0.5)
    );
    expect(fireResult.events).toContainEqual(expect.objectContaining({
      type: "bark",
      source: "legacy",
      text: "Burn, fiend!",
    }));

    const nonFire = makeState(["Mage"]);
    const nonFireResult = resolvePlayerTurn(
      nonFire,
      { kind: "cast", actorId: "pc-0", spellId: "mage-spark", targetInstanceId: "skeleton-0" },
      constantRng(0.5)
    );
    expect(nonFireResult.events.some((event) => event?.type === "bark" && event.source === "library")).toBe(true);
  });

  it("suppresses ordinary opportunities while preserving telemetry about the silence", () => {
    const state = makeState();
    const emitted: CombatEvent[] = [];
    const emit = (_message: string, event: CombatEvent) => emitted.push(event);

    expect(offerLibraryBark(state, {
      actorId: "pc-0",
      speakerId: "Fighter",
      trigger: "basicAttack",
    }, emit)).toBe(true);
    expect(offerLibraryBark(state, {
      actorId: "pc-0",
      speakerId: "Fighter",
      trigger: "basicAttack",
    }, emit)).toBe(false);
    state.round = 2;
    state.barkRuntime!.lastSpeakerRound = {};
    expect(offerLibraryBark(state, {
      actorId: "pc-0",
      speakerId: "Fighter",
      trigger: "basicAttack",
    }, emit)).toBe(true);
    expect(emitted.filter((event) => event?.type === "bark")).toHaveLength(2);
    expect(state.barkRuntime?.telemetry.suppressionReasons["same-round-lower-priority"]).toBe(1);
    expect(state.barkRuntime?.telemetry.uniqueLines.length).toBe(2);
  });

  it("allows a high-priority death opportunity to supersede an ordinary bark in the same round", () => {
    const state = makeState();
    const emitted: CombatEvent[] = [];
    const emit = (_message: string, event: CombatEvent) => emitted.push(event);
    expect(offerLibraryBark(state, {
      actorId: "pc-0",
      speakerId: "Fighter",
      trigger: "basicAttack",
    }, emit)).toBe(true);
    expect(offerLibraryBark(state, {
      actorId: "skeleton-0",
      speakerId: "skeleton",
      trigger: "death",
    }, emit)).toBe(true);
    expect(emitted.at(-1)).toMatchObject({ type: "bark", trigger: "death" });
  });

  it("does not let a critical-hit line bypass the ordinary presentation gap", () => {
    const state = makeState();
    const emitted: CombatEvent[] = [];
    const emit = (_message: string, event: CombatEvent) => emitted.push(event);
    expect(offerLibraryBark(state, {
      actorId: "pc-0",
      speakerId: "Fighter",
      trigger: "basicAttack",
    }, emit)).toBe(true);
    expect(offerLibraryBark(state, {
      actorId: "pc-0",
      speakerId: "Fighter",
      trigger: "criticalHit",
    }, emit)).toBe(false);
    expect(state.barkRuntime?.telemetry.suppressionReasons["global-round-cooldown"]).toBe(1);
  });

  it("keeps the same speaker quiet longer than the global gap", () => {
    const state = makeState();
    const emit = () => {};
    expect(offerLibraryBark(state, {
      actorId: "pc-0",
      speakerId: "Fighter",
      trigger: "basicAttack",
    }, emit)).toBe(true);
    state.round = 2;
    expect(offerLibraryBark(state, {
      actorId: "pc-0",
      speakerId: "Fighter",
      trigger: "criticalHit",
    }, emit)).toBe(false);
    expect(state.barkRuntime?.telemetry.suppressionReasons["speaker-round-cooldown"]).toBe(1);
  });

  it("keeps one trigger from monopolizing a later round across speakers", () => {
    const state = makeState(["Fighter", "Mage"]);
    const emit = () => {};
    expect(offerLibraryBark(state, {
      actorId: "pc-0",
      speakerId: "Fighter",
      trigger: "basicAttack",
    }, emit)).toBe(true);
    state.round = 3;
    state.barkRuntime!.lastSelectedRound = -999;
    state.barkRuntime!.lastSpeakerRound = {};
    state.barkRuntime!.lastTriggerRound.basicAttack = 2;
    expect(offerLibraryBark(state, {
      actorId: "pc-1",
      speakerId: "Mage",
      trigger: "basicAttack",
    }, emit)).toBe(false);
    expect(state.barkRuntime?.telemetry.suppressionReasons["trigger-round-cooldown"]).toBe(1);
  });

  it("recognizes the recruitable companion as a library speaker", () => {
    const state = makeState();
    state.summonedAllies.push({
      id: "fifth-chair",
      name: "Vess",
      hp: 46,
      maxHp: 46,
      attack: 9,
      ac: 12,
      agi: 10,
      row: "front",
    });
    const emitted: CombatEvent[] = [];
    expect(offerLibraryBark(state, {
      actorId: "fifth-chair",
      speakerId: "fifth-chair",
      trigger: "basicAttack",
    }, (_message, event) => emitted.push(event))).toBe(true);
    expect(emitted[0]).toMatchObject({ type: "bark", speaker: "Vess", actorId: "fifth-chair" });
  });

  it("does not consume gameplay RNG when library selection changes", () => {
    const run = (barkRoll: number) => {
      setCombatBarkLibraryRngForTests(() => barkRoll);
      const next = resolveCombatRound(
        makeState(),
        [{ kind: "attack", actorId: "pc-0", targetInstanceId: "skeleton-0" }],
        constantRng(0.5)
      );
      return {
        hp: next.enemies.front[0]?.currentHp ?? next.justDied[0]?.currentHp ?? 0,
        log: next.log.filter((line) => !line.includes(": \"")).join("\n"),
      };
    };
    expect(run(0)).toEqual(run(0.99));
  });

  it("keeps exact-line recent filtering deterministic without consuming RNG", () => {
    const profile: CombatBarkProfile = {
      id: "Test",
      displayName: "Test",
      kind: "class",
      voiceMode: "articulate",
      voiceSummary: "test",
      pools: {
        basicAttack: [{ text: "one" }, { text: "two" }],
      },
    };
    const profiles = new Map([[profile.id, profile]]);
    const first = selectCombatBark({ speakerId: "Test", trigger: "basicAttack", rng: () => 0, recentlyUsed: [] }, profiles);
    const eligible = eligibleCombatBarks({ speakerId: "Test", trigger: "basicAttack", recentlyUsed: ["Test::basicAttack::one"] }, profiles);
    expect(first?.text).toBe("one");
    expect(eligible.map((line) => line.text)).toEqual(["two"]);
  });
});
