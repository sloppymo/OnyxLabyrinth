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
  /** When set with forceCombat, stage this specific formation instead of rolling. */
  forceFormationId?: string;
  /** Pre-wound enemies after forceCombat: map of enemyId → hp percentage (0-100). */
  woundEnemies?: Record<string, number>;
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
  // --- Phase 1b.2 targeted chemistry verification (Floor 2) ---
  {
    id: "f2-armored-archer",
    label: "F2 armored-archer (guard chemistry)",
    tags: ["combat", "chemistry", "f2"],
    recommendedActions: 25,
    setup: {
      jumpTo: { floorId: 2, x: 7, y: 5, facing: 0, partyLevel: 4, autosave: false, stepsSinceEncounter: 0 },
      forceCombat: true,
      forceFormationId: "f2-armored-archer",
    },
    playerMemory: {
      party: STARTER_PARTY,
      knownObjective: "Keep descending.",
      knownMechanics: [
        ...EARLY_MECHANICS,
        "Combat is turn-based. Each character acts when their turn comes up.",
      ],
      namedNpcs: [],
      discoveries: ["You are on Floor 2 — a cursed library."],
    },
    playerIntro: "Continue playing naturally.",
  },
  {
    id: "f2-lab-keepers",
    label: "F2 lab-keepers (preferential heal)",
    tags: ["combat", "chemistry", "f2"],
    recommendedActions: 25,
    setup: {
      jumpTo: { floorId: 2, x: 7, y: 5, facing: 0, partyLevel: 4, autosave: false, stepsSinceEncounter: 0 },
      forceCombat: true,
      forceFormationId: "f2-lab-keepers",
    },
    playerMemory: {
      party: STARTER_PARTY,
      knownObjective: "Keep descending.",
      knownMechanics: [
        ...EARLY_MECHANICS,
        "Combat is turn-based. Each character acts when their turn comes up.",
      ],
      namedNpcs: [],
      discoveries: ["You are on Floor 2 — a cursed library."],
    },
    playerIntro: "Continue playing naturally.",
  },
  {
    id: "f2-displacer-lab",
    label: "F2 displacer-lab (solo identity control)",
    tags: ["combat", "chemistry", "f2"],
    recommendedActions: 25,
    setup: {
      jumpTo: { floorId: 2, x: 7, y: 5, facing: 0, partyLevel: 4, autosave: false, stepsSinceEncounter: 0 },
      forceCombat: true,
      forceFormationId: "f2-displacer-lab",
    },
    playerMemory: {
      party: STARTER_PARTY,
      knownObjective: "Keep descending.",
      knownMechanics: [
        ...EARLY_MECHANICS,
        "Combat is turn-based. Each character acts when their turn comes up.",
      ],
      namedNpcs: [],
      discoveries: ["You are on Floor 2 — a cursed library."],
    },
    playerIntro: "Continue playing naturally.",
  },
  // --- Phase 1b.2 targeted verification: preferential heal (two wounded) ---
  {
    id: "f2-lab-keepers-preferential",
    label: "F2 lab-keepers (preferential heal — two wounded)",
    tags: ["combat", "chemistry", "f2"],
    recommendedActions: 15,
    setup: {
      jumpTo: { floorId: 2, x: 7, y: 5, facing: 0, partyLevel: 4, autosave: false, stepsSinceEncounter: 0 },
      forceCombat: true,
      forceFormationId: "f2-lab-keepers",
      // Feral Scrivener (failed-experiment) at 30% HP — lightly wounded.
      // Armored Skeleton at 15% HP — severely wounded (more urgent by default).
      // If the Cursed Scribe heals the Scrivener instead of the Armor,
      // preferTargetIds is proven: the healer prefers the experiment
      // over a more-wounded non-experiment ally.
      woundEnemies: { "failed-experiment": 30, "armored-skeleton": 15 },
    },
    playerMemory: {
      party: STARTER_PARTY,
      knownObjective: "Keep descending.",
      knownMechanics: [
        ...EARLY_MECHANICS,
        "Combat is turn-based. Each character acts when their turn comes up.",
      ],
      namedNpcs: [],
      discoveries: ["You are on Floor 2 — a cursed library."],
    },
    playerIntro: "Continue playing naturally.",
  },
  // --- Phase A targeted verification: relationship propagation (Floors 3-5) ---
  // Each stages exactly one formation so the relationship is observed rather
  // than waited for. The Floor 1 entry is the control: it is where Spawn Bomb
  // is taught, and it runs first so the later-floor runs can be judged for
  // recognition rather than first contact.
  {
    id: "f1-spawn-bomb",
    label: "F1 spawn-bomb (where the detonate rule is taught)",
    tags: ["combat", "chemistry", "f1", "literacy-control"],
    recommendedActions: 25,
    setup: {
      jumpTo: { floorId: 1, x: 11, y: 39, facing: 0, partyLevel: 3, autosave: false, stepsSinceEncounter: 0 },
      forceCombat: true,
      forceFormationId: "f1-spawn-bomb",
    },
    playerMemory: {
      party: STARTER_PARTY,
      knownObjective: "Keep descending.",
      knownMechanics: [
        ...EARLY_MECHANICS,
        "Combat is turn-based. Each character acts when their turn comes up.",
      ],
      namedNpcs: [],
      discoveries: ["You are on Floor 1 — a flooded crypt."],
    },
    playerIntro: "Continue playing naturally.",
  },
  {
    id: "f3-rune-overload",
    label: "F3 guardian-rune-line (Rune Knight consumes Lesser Construct)",
    tags: ["combat", "chemistry", "f3"],
    recommendedActions: 30,
    setup: {
      jumpTo: { floorId: 3, x: 2, y: 2, facing: 0, partyLevel: 8, autosave: false, stepsSinceEncounter: 0 },
      forceCombat: true,
      forceFormationId: "f3-guardian-rune-line",
    },
    playerMemory: {
      party: STARTER_PARTY,
      knownObjective: "Keep descending.",
      knownMechanics: [
        ...EARLY_MECHANICS,
        "Combat is turn-based. Each character acts when their turn comes up.",
      ],
      namedNpcs: [],
      discoveries: ["You are on Floor 3 — a forge of ashes."],
    },
    playerIntro: "Continue playing naturally.",
  },
  {
    id: "f3-spawn-bomb",
    label: "F3 demon-spawn-mage (detonate, pre-placed ammunition)",
    tags: ["combat", "chemistry", "f3", "literacy-transfer"],
    recommendedActions: 30,
    setup: {
      jumpTo: { floorId: 3, x: 2, y: 2, facing: 0, partyLevel: 8, autosave: false, stepsSinceEncounter: 0 },
      forceCombat: true,
      forceFormationId: "f3-demon-spawn-mage",
    },
    playerMemory: {
      party: STARTER_PARTY,
      knownObjective: "Keep descending.",
      knownMechanics: [
        ...EARLY_MECHANICS,
        "Combat is turn-based. Each character acts when their turn comes up.",
      ],
      namedNpcs: [],
      discoveries: ["You are on Floor 3 — a forge of ashes."],
    },
    playerIntro: "Continue playing naturally.",
  },
  {
    id: "f4-choir-guard",
    label: "F4 choir-armor (Choir Warden intercepts for the Cantor)",
    tags: ["combat", "chemistry", "f4"],
    recommendedActions: 30,
    setup: {
      jumpTo: { floorId: 4, x: 2, y: 2, facing: 0, partyLevel: 11, autosave: false, stepsSinceEncounter: 0 },
      forceCombat: true,
      forceFormationId: "f4-choir-armor",
    },
    playerMemory: {
      party: STARTER_PARTY,
      knownObjective: "Keep descending.",
      knownMechanics: [
        ...EARLY_MECHANICS,
        "Combat is turn-based. Each character acts when their turn comes up.",
      ],
      namedNpcs: [],
      discoveries: ["You are on Floor 4 — the Null Choir."],
    },
    playerIntro: "Continue playing naturally.",
  },
  {
    id: "f4-spawn-loop",
    label: "F4 viper-mage (summon-gated: the Mage builds its own bomb)",
    tags: ["combat", "chemistry", "f4", "literacy-transfer"],
    recommendedActions: 30,
    setup: {
      jumpTo: { floorId: 4, x: 2, y: 2, facing: 0, partyLevel: 11, autosave: false, stepsSinceEncounter: 0 },
      forceCombat: true,
      forceFormationId: "f4-viper-mage",
    },
    playerMemory: {
      party: STARTER_PARTY,
      knownObjective: "Keep descending.",
      knownMechanics: [
        ...EARLY_MECHANICS,
        "Combat is turn-based. Each character acts when their turn comes up.",
      ],
      namedNpcs: [],
      discoveries: ["You are on Floor 4 — the Null Choir."],
    },
    playerIntro: "Continue playing naturally.",
  },
  {
    id: "f4-conduct",
    label: "F4 chorister-demon (Cantor conducts the Iron Choristers)",
    tags: ["combat", "chemistry", "f4", "conduct"],
    recommendedActions: 30,
    setup: {
      jumpTo: { floorId: 4, x: 2, y: 2, facing: 0, partyLevel: 11, autosave: false, stepsSinceEncounter: 0 },
      forceCombat: true,
      forceFormationId: "f4-chorister-demon",
    },
    playerMemory: {
      party: STARTER_PARTY,
      knownObjective: "Keep descending.",
      knownMechanics: [
        ...EARLY_MECHANICS,
        "Combat is turn-based. Each character acts when their turn comes up.",
      ],
      namedNpcs: [],
      discoveries: ["You are on Floor 4 — the Null Choir."],
    },
    playerIntro: "Continue playing naturally.",
  },
  {
    id: "f5-undertow",
    label: "F5 flood-brute (Caller marks, Brute hunts the mark)",
    tags: ["combat", "chemistry", "f5", "undertow"],
    recommendedActions: 30,
    setup: {
      jumpTo: { floorId: 5, x: 2, y: 2, facing: 0, partyLevel: 13, autosave: false, stepsSinceEncounter: 0 },
      forceCombat: true,
      forceFormationId: "f5-flood-brute",
    },
    playerMemory: {
      party: STARTER_PARTY,
      knownObjective: "Keep descending.",
      knownMechanics: [
        ...EARLY_MECHANICS,
        "Combat is turn-based. Each character acts when their turn comes up.",
      ],
      namedNpcs: [],
      discoveries: ["You are on Floor 5 — the weeping cistern."],
    },
    playerIntro: "Continue playing naturally.",
  },
  {
    id: "f5-sentinel-guard",
    label: "F5 golem-cistern (Drowned Sentinel intercepts for the drowners)",
    tags: ["combat", "chemistry", "f5"],
    recommendedActions: 30,
    setup: {
      jumpTo: { floorId: 5, x: 2, y: 2, facing: 0, partyLevel: 13, autosave: false, stepsSinceEncounter: 0 },
      forceCombat: true,
      forceFormationId: "f5-golem-cistern",
    },
    playerMemory: {
      party: STARTER_PARTY,
      knownObjective: "Keep descending.",
      knownMechanics: [
        ...EARLY_MECHANICS,
        "Combat is turn-based. Each character acts when their turn comes up.",
      ],
      namedNpcs: [],
      discoveries: ["You are on Floor 5 — the weeping cistern."],
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
