/**
 * Ten Card Trial encounters. HP totals and intent cycles are locked in the PoC spec.
 * These defs never enter campaign encounter tables.
 */

import type { EnemyState, Intent } from "./types";

export interface EncounterDef {
  id: number;
  name: string;
  enemies: Omit<EnemyState, "hp" | "intentIndex">[];
}

function E(
  partial: Omit<EnemyState, "hp" | "intentIndex">
): Omit<EnemyState, "hp" | "intentIndex"> {
  return partial;
}

const row = (r: "front" | "back", d: number): Intent => ({ kind: "row", row: r, damage: d });
const both = (d: number): Intent => ({ kind: "both-rows", damage: d });
const named = (heroId: "rat-king" | "old-man", r: "front" | "back", d: number): Intent => ({
  kind: "named-hero",
  heroId,
  row: r,
  damage: d,
});

export const ENCOUNTERS: EncounterDef[] = [
  {
    id: 1,
    name: "Two Lights",
    enemies: [
      E({
        id: "ember",
        name: "Ember",
        maxHp: 22,
        visualRow: "front",
        spriteId: "failed-experiment",
        cycle: [row("front", 8), row("back", 7), row("front", 9)],
        slot: "fast",
        order: 0,
      }),
      E({
        id: "wick",
        name: "Wick",
        maxHp: 22,
        visualRow: "back",
        spriteId: "lab-assistant",
        cycle: [row("back", 8), row("front", 7), row("back", 9)],
        slot: "fast",
        order: 1,
      }),
    ],
  },
  {
    id: 2,
    name: "Cleaver and Ash",
    enemies: [
      E({
        id: "cleaver",
        name: "Cleaver",
        maxHp: 40,
        visualRow: "front",
        spriteId: "animated-armor",
        cycle: [row("front", 11), row("back", 9), row("front", 13)],
        slot: "fast",
        order: 0,
      }),
      E({
        id: "ash",
        name: "Ash",
        maxHp: 22,
        visualRow: "back",
        spriteId: "headmasters-echo-remnant",
        cycle: [row("back", 8), row("front", 7), row("back", 10)],
        slot: "fast",
        order: 1,
      }),
    ],
  },
  {
    id: 3,
    name: "Mixed Medium",
    enemies: [
      E({
        id: "pike",
        name: "Pike",
        maxHp: 30,
        visualRow: "front",
        spriteId: "stone-guardian",
        cycle: [row("front", 9), row("back", 8), row("front", 10)],
        slot: "fast",
        order: 0,
      }),
      E({
        id: "bolt",
        name: "Bolt",
        maxHp: 30,
        visualRow: "back",
        spriteId: "lesser-construct",
        cycle: [row("back", 9), row("front", 8), row("back", 10)],
        slot: "slow",
        order: 0,
      }),
    ],
  },
  {
    id: 4,
    name: "Slow Brute",
    enemies: [
      E({
        id: "hook",
        name: "Hook",
        maxHp: 22,
        visualRow: "back",
        spriteId: "acid-puddle",
        cycle: [row("back", 8), row("front", 7), row("back", 9)],
        slot: "fast",
        order: 0,
      }),
      E({
        id: "brute",
        name: "Brute",
        maxHp: 40,
        visualRow: "front",
        spriteId: "big-titty-ogre",
        cycle: [row("front", 12), row("back", 10), row("front", 13)],
        slot: "slow",
        order: 0,
      }),
    ],
  },
  {
    id: 5,
    name: "Busy Three",
    enemies: [
      E({
        id: "cleaver-busy",
        name: "Cleaver",
        maxHp: 40,
        visualRow: "front",
        spriteId: "animated-armor",
        cycle: [row("front", 11), row("back", 9), row("front", 13)],
        slot: "fast",
        order: 0,
      }),
      E({
        id: "scrap-a",
        name: "Scrap",
        maxHp: 16,
        visualRow: "front",
        spriteId: "training-dummy",
        cycle: [row("front", 6), row("back", 5), row("front", 6)],
        slot: "fast",
        order: 1,
      }),
      E({
        id: "scrap-b",
        name: "Splint",
        maxHp: 16,
        visualRow: "back",
        spriteId: "training-dummy",
        cycle: [row("back", 6), row("front", 5), row("back", 6)],
        slot: "fast",
        order: 2,
      }),
    ],
  },
  {
    id: 6,
    name: "Hard Pair",
    enemies: [
      E({
        id: "heavy",
        name: "Heavy",
        maxHp: 46,
        visualRow: "front",
        spriteId: "stone-guardian",
        cycle: [row("front", 12), row("back", 10), row("front", 13)],
        slot: "fast",
        order: 0,
      }),
      E({
        id: "warden",
        name: "Warden",
        maxHp: 24,
        visualRow: "back",
        spriteId: "lab-assistant",
        cycle: [row("back", 9), row("front", 8), row("back", 10)],
        slot: "slow",
        order: 0,
      }),
    ],
  },
  {
    id: 7,
    name: "Many Intents",
    enemies: [
      E({
        id: "mid",
        name: "Mid",
        maxHp: 30,
        visualRow: "front",
        spriteId: "lesser-construct",
        cycle: [row("front", 9), row("back", 8), row("front", 10)],
        slot: "fast",
        order: 0,
      }),
      E({
        id: "pack",
        name: "Pack",
        maxHp: 24,
        visualRow: "front",
        spriteId: "failed-experiment",
        cycle: [row("front", 8), row("back", 7), row("front", 9)],
        slot: "fast",
        order: 1,
      }),
      E({
        id: "splint",
        name: "Splint",
        maxHp: 16,
        visualRow: "back",
        spriteId: "training-dummy",
        cycle: [row("back", 6), row("front", 5), row("back", 7)],
        slot: "slow",
        order: 0,
      }),
    ],
  },
  {
    id: 8,
    name: "Both Rows",
    enemies: [
      E({
        id: "twinblade",
        name: "Twinblade",
        maxHp: 34,
        visualRow: "front",
        spriteId: "animated-armor",
        cycle: [both(6), row("front", 9), both(6)],
        slot: "fast",
        order: 0,
      }),
      E({
        id: "partner",
        name: "Partner",
        maxHp: 28,
        visualRow: "back",
        spriteId: "headmasters-echo-remnant",
        cycle: [row("back", 8), row("front", 8), row("back", 9)],
        slot: "slow",
        order: 0,
      }),
    ],
  },
  {
    id: 9,
    name: "Named Mark",
    enemies: [
      E({
        id: "hunter",
        name: "Hunter",
        maxHp: 36,
        visualRow: "front",
        spriteId: "big-titty-ogre",
        cycle: [named("rat-king", "front", 12), row("back", 8), named("rat-king", "front", 12)],
        slot: "fast",
        order: 0,
      }),
      E({
        id: "spotter",
        name: "Spotter",
        maxHp: 24,
        visualRow: "back",
        spriteId: "lab-assistant",
        cycle: [row("back", 8), row("front", 7), row("back", 9)],
        slot: "slow",
        order: 0,
      }),
    ],
  },
  {
    id: 10,
    name: "The Heap",
    enemies: [
      E({
        id: "the-heap",
        name: "The Heap",
        maxHp: 96,
        visualRow: "front",
        spriteId: "headmasters-echo",
        cycle: [row("front", 12), row("back", 11), both(6), row("front", 14)],
        slot: "slow",
        order: 0,
        isBoss: true,
      }),
    ],
  },
];

export function encounterById(id: number): EncounterDef {
  const found = ENCOUNTERS.find((e) => e.id === id);
  if (!found) throw new Error(`Card Trial encounter ${id} does not exist`);
  return found;
}
