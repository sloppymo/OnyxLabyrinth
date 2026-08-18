/**
 * Canonical checkpoint episodes for blind campaign sweeps.
 *
 * `setup` is omniscient and MUST NOT be copied into player observations.
 * `playerMemory` is what a hypothetical player would already know.
 */

export interface CheckpointSetup {
  jumpTo?: {
    floorId: number;
    x: number;
    y: number;
    facing?: 0 | 1 | 2 | 3;
    partyLevel?: number;
    gold?: number;
    items?: { itemId: string; identified: boolean }[];
    autosave?: boolean;
    stepsSinceEncounter?: number;
  };
  forceCombat?: boolean;
  damagePartyRatio?: number;
  seed?: number;
}

export interface PlayerMemoryPacket {
  party: { name: string; class: string }[];
  knownObjective: string;
  knownMechanics: string[];
  namedNpcs: string[];
  discoveries: string[];
}

export interface CheckpointDef {
  id: string;
  /** Developer-only label. Never sent to the blind player. */
  label: string;
  tags: string[];
  recommendedActions: number;
  setup: CheckpointSetup;
  playerMemory: PlayerMemoryPacket;
  playerIntro: string;
}

const STARTER_PARTY: PlayerMemoryPacket["party"] = [
  { name: "Aria", class: "Fighter" },
  { name: "Coda", class: "Thief" },
  { name: "Dell", class: "Mage" },
  { name: "Eve", class: "Priest" },
];

const EARLY_MECHANICS = [
  "The town has an inn, shop, temple, and a way into the dungeon.",
  "The party fights together. Fallen allies can be recovered at the temple.",
  "Dungeons are first-person corridors. A compass letter is shown at the top.",
];

export const CHECKPOINTS: CheckpointDef[] = [
  {
    id: "title",
    label: "Title / opening",
    tags: ["onboarding"],
    recommendedActions: 20,
    setup: {},
    playerMemory: {
      party: [],
      knownObjective: "You have not started a game yet.",
      knownMechanics: [],
      namedNpcs: [],
      discoveries: [],
    },
    playerIntro: "Continue playing naturally.",
  },
  {
    id: "f1-entrance",
    label: "Floor 1 dungeon entrance",
    tags: ["navigation", "onboarding"],
    recommendedActions: 40,
    setup: {
      jumpTo: { floorId: 1, x: 11, y: 39, facing: 0, autosave: false, stepsSinceEncounter: 0 },
    },
    playerMemory: {
      party: STARTER_PARTY,
      knownObjective: "Descend the labyrinth beneath Edgehollow.",
      knownMechanics: EARLY_MECHANICS,
      namedNpcs: [],
      discoveries: ["The town of Edgehollow sits at the mouth of the dungeon."],
    },
    playerIntro: "Continue playing naturally.",
  },
  {
    id: "f1-kept-gate",
    label: "Kept Gate approach",
    tags: ["landmark", "climax"],
    recommendedActions: 30,
    setup: {
      jumpTo: { floorId: 1, x: 17, y: 21, facing: 1, autosave: false, stepsSinceEncounter: 0 },
    },
    playerMemory: {
      party: STARTER_PARTY,
      knownObjective: "Find a way deeper into the labyrinth.",
      knownMechanics: EARLY_MECHANICS,
      namedNpcs: [],
      discoveries: ["You have already walked a long way through Floor 1."],
    },
    playerIntro: "Continue playing naturally.",
  },
  {
    id: "hot-boi-tavern",
    label: "Hot Boi's Tavern",
    tags: ["npc", "hub"],
    recommendedActions: 25,
    setup: {
      jumpTo: { floorId: 1, x: 20, y: 25, facing: 2, autosave: false, stepsSinceEncounter: 0 },
    },
    playerMemory: {
      party: STARTER_PARTY,
      knownObjective: "Explore Floor 1 and find a way down.",
      knownMechanics: EARLY_MECHANICS,
      namedNpcs: [],
      discoveries: ["There are people living in the dungeon, not only monsters."],
    },
    playerIntro: "Continue playing naturally.",
  },
  {
    id: "first-combat",
    label: "Representative early combat",
    tags: ["combat"],
    recommendedActions: 35,
    setup: {
      jumpTo: { floorId: 1, x: 11, y: 39, facing: 0, autosave: false, stepsSinceEncounter: 0 },
      forceCombat: true,
    },
    playerMemory: {
      party: STARTER_PARTY,
      knownObjective: "Survive and keep descending.",
      knownMechanics: [
        ...EARLY_MECHANICS,
        "Combat is turn-based. Each character acts when their turn comes up.",
      ],
      namedNpcs: [],
      discoveries: [],
    },
    playerIntro: "Continue playing naturally.",
  },
  {
    id: "f2-abyss-bridge",
    label: "Floor 2 bridge sequence",
    tags: ["navigation", "visual", "danger"],
    recommendedActions: 35,
    setup: {
      jumpTo: { floorId: 2, x: 2, y: 23, facing: 0, partyLevel: 4, autosave: false, stepsSinceEncounter: 0 },
    },
    playerMemory: {
      party: STARTER_PARTY,
      knownObjective: "Keep descending. Floor 1 is behind you.",
      knownMechanics: EARLY_MECHANICS,
      namedNpcs: [],
      discoveries: ["You reached a second floor of the labyrinth."],
    },
    playerIntro: "Continue playing naturally.",
  },
  {
    id: "f3-forge",
    label: "Floor 3 arrival",
    tags: ["visual", "attrition"],
    recommendedActions: 35,
    setup: {
      jumpTo: { floorId: 3, x: 2, y: 2, facing: 0, partyLevel: 7, autosave: false, stepsSinceEncounter: 0 },
    },
    playerMemory: {
      party: STARTER_PARTY,
      knownObjective: "The lamp at the bottom still has one wish.",
      knownMechanics: EARLY_MECHANICS,
      namedNpcs: [],
      discoveries: ["Each floor feels different from the last."],
    },
    playerIntro: "Continue playing naturally.",
  },
  {
    id: "attrition",
    label: "Damaged party on Floor 1",
    tags: ["attrition", "resources"],
    recommendedActions: 30,
    setup: {
      jumpTo: { floorId: 1, x: 11, y: 39, facing: 0, autosave: false, stepsSinceEncounter: 0 },
      damagePartyRatio: 0.4,
    },
    playerMemory: {
      party: STARTER_PARTY,
      knownObjective: "You are hurt. Town recovery exists if you can get back.",
      knownMechanics: EARLY_MECHANICS,
      namedNpcs: [],
      discoveries: ["Fighting wears the party down."],
    },
    playerIntro: "Continue playing naturally.",
  },
];

export function checkpointById(id: string): CheckpointDef {
  const found = CHECKPOINTS.find((c) => c.id === id);
  if (!found) {
    throw new Error(`Unknown checkpoint: ${id}. Available: ${CHECKPOINTS.map((c) => c.id).join(", ")}`);
  }
  return found;
}

/** Player-facing packet. Strips developer label/tags/setup. */
export function playerFacingCheckpoint(def: CheckpointDef): {
  intro: string;
  memory: PlayerMemoryPacket;
  recommendedActions: number;
} {
  return {
    intro: def.playerIntro,
    memory: def.playerMemory,
    recommendedActions: def.recommendedActions,
  };
}
