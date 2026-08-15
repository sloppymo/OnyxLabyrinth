/** Bark content — Floor 3 (The Forge of Ashes). */

import type { CombatBarkProfile } from "./types";

export const ELITE_ORC_BARKS: CombatBarkProfile = {
  id: "elite-orc",
  displayName: "Elite Orc",
  kind: "enemy",
  voiceMode: "fragmentary",
  voiceSummary: "veteran orc, terser than the rank and file, professional about the kill",
  pools: {
    combatStart: [
      { text: "Move." },
    ],
    abilityUse: [
      { text: "Burn.", abilityId: "fire-breath" },
    ],
    takeHit: [
      { text: "Nothing." },
    ],
    death: [
      { text: "Counted." },
    ],
  },
};

export const LESSER_CONSTRUCT_BARKS: CombatBarkProfile = {
  id: "lesser-construct",
  displayName: "Lesser Construct",
  kind: "enemy",
  voiceMode: "silent",
  voiceSummary: "inert, mechanical — grinding sound only",
  pools: {
    combatStart: [{ text: "*grinding gears*" }],
    abilityUse: [{ text: "*hydraulic hiss*", abilityId: "repair" }],
    death: [{ text: "*powers down*" }],
  },
};

export const WEREWOLF_BARKS: CombatBarkProfile = {
  id: "werewolf",
  displayName: "Werewolf",
  kind: "enemy",
  voiceMode: "vocalization",
  voiceSummary: "predatory, focused on the mark — growl, never a threat in words",
  pools: {
    combatStart: [{ text: "*low growl*" }],
    abilityUse: [
      { text: "*answering growl*", chemistryId: "hunting-pack" },
      { text: "*pounces*", abilityId: "hunting-pounce" },
    ],
    takeHit: [{ text: "*snarl*" }],
    death: [{ text: "*whimper*" }],
  },
};

export const HILL_OGRE_BARKS: CombatBarkProfile = {
  id: "big-titty-ogre",
  displayName: "Hill Ogre",
  kind: "enemy",
  voiceMode: "fragmentary",
  voiceSummary: "simple, strong, easily delighted by something heavy to throw",
  pools: {
    combatStart: [
      { text: "Hit." },
      { text: "*grunt*" },
    ],
    abilityUse: [
      { text: "Mad now.", abilityId: "berserk" },
    ],
    takeHit: [
      { text: "Hnh." },
    ],
    death: [
      { text: "...oh." },
    ],
    chemistrySelected: [
      { text: "That one.", chemistryId: "ogre-toss" },
    ],
    chemistryTelegraph: [
      { text: "Up.", chemistryId: "ogre-toss" },
    ],
    chemistryResolve: [
      { text: "Go!", chemistryId: "ogre-toss", oncePerCombat: true },
    ],
  },
};

export const STONE_GUARDIAN_BARKS: CombatBarkProfile = {
  id: "stone-guardian",
  displayName: "Stone Guardian",
  kind: "enemy",
  voiceMode: "silent",
  voiceSummary: "disciplined, immovable — rare single word only when the line truly holds",
  pools: {
    combatStart: [{ text: "*stone grinds*" }],
    abilityUse: [{ text: "Hold.", abilityId: "phalanx-guard" }],
    death: [{ text: "*crumbles*" }],
  },
};

export const ANIMATED_ARMOR_BARKS: CombatBarkProfile = {
  id: "animated-armor",
  displayName: "Animated Armor",
  kind: "enemy",
  voiceMode: "silent",
  voiceSummary: "dutiful, empty — nobody's home, but the Living Shield moment earns one word",
  pools: {
    combatStart: [{ text: "*clank*" }],
    guardActivated: [
      { text: "*steps forward*", chemistryId: "living-shield" },
      { text: "Fine.", chemistryId: "living-shield" },
    ],
    guardIntercept: [{ text: "*clang*", chemistryId: "living-shield" }],
    takeHit: [{ text: "*dent*" }],
    death: [{ text: "*collapses, empty*" }],
  },
};

export const FLAME_GOLEM_BARKS: CombatBarkProfile = {
  id: "flame-golem",
  displayName: "Flame Golem",
  kind: "enemy",
  voiceMode: "silent",
  voiceSummary: "stoked, patient — forge sounds only",
  pools: {
    combatStart: [{ text: "*ember hiss*" }],
    abilityUse: [{ text: "*bellows roar*", abilityId: "forge-bellows" }],
    death: [{ text: "*fire dies*" }],
  },
};

export const LAVA_SLIME_BARKS: CombatBarkProfile = {
  id: "lava-slime",
  displayName: "Lava Slime",
  kind: "enemy",
  voiceMode: "vocalization",
  voiceSummary: "slime's baseline gone short-tempered from the heat",
  pools: {
    combatStart: [{ text: "*sizzle*" }],
    takeHit: [{ text: "Hot." }],
    death: [{ text: "*hardens*" }],
  },
};

export const HELLHOUND_BARKS: CombatBarkProfile = {
  id: "hellhound",
  displayName: "Hellhound",
  kind: "enemy",
  voiceMode: "vocalization",
  voiceSummary: "demonic hound, eager for the hunt — growl and howl, never words",
  pools: {
    combatStart: [{ text: "*low growl*" }],
    abilityUse: [{ text: "*howl*", abilityId: "howl", chemistryId: "hunting-pack" }],
    takeHit: [{ text: "*snarl*" }],
    death: [{ text: "*fading growl*" }],
  },
};

export const HELLBAT_BARKS: CombatBarkProfile = {
  id: "hellbat",
  displayName: "Hellbat",
  kind: "enemy",
  voiceMode: "vocalization",
  voiceSummary: "skittish flier, sparsest of the flock — one hit and gone",
  pools: {
    combatStart: [{ text: "*screech*" }],
    takeHit: [{ text: "*shriek*" }],
    death: [{ text: "*silence*" }],
  },
};

export const BLACK_KNIGHT_BARKS: CombatBarkProfile = {
  id: "black-knight",
  displayName: "Black Knight",
  kind: "enemy",
  voiceMode: "articulate",
  voiceSummary: "grim, disciplined soldier — someone home inside the armor, never boasts",
  pools: {
    combatStart: [
      { text: "Ready." },
      { text: "Begin." },
    ],
    abilityUse: [
      { text: "Hold.", abilityId: "phalanx-guard" },
      { text: "Forward.", abilityId: "charge" },
    ],
    takeHit: [
      { text: "Noted." },
    ],
    takeHeavyHit: [
      { text: "Hard-fought." },
    ],
    death: [
      { text: "Well fought." },
    ],
    rare: [
      { text: "You've earned this." },
    ],
  },
};

export const VIPER_MAN_BARKS: CombatBarkProfile = {
  id: "viper-man",
  displayName: "Viper Man",
  kind: "enemy",
  voiceMode: "articulate",
  voiceSummary: "black-knight's discipline, mildly aware it's worth more gold than it should be",
  pools: {
    combatStart: [
      { text: "Ready." },
    ],
    abilityUse: [
      { text: "Venom.", abilityId: "venomous-strike" },
    ],
    takeHit: [
      { text: "Noted." },
    ],
    death: [
      { text: "Worth it, then." },
    ],
  },
};

export const MINOTAUR_BARKS: CombatBarkProfile = {
  id: "minotaur",
  displayName: "Minotaur",
  kind: "enemy",
  voiceMode: "fragmentary",
  voiceSummary: "big, simple, direct — wants something to grab and throw",
  pools: {
    combatStart: [
      { text: "Come here." },
    ],
    abilityUse: [
      { text: "Hold still.", abilityId: "berserk" },
    ],
    takeHit: [
      { text: "Hnh." },
    ],
    death: [
      { text: "...oh." },
    ],
    chemistrySelected: [
      { text: "Come here.", chemistryId: "slime-cannon" },
    ],
    chemistryTelegraph: [
      { text: "Wait.", chemistryId: "slime-cannon" },
    ],
    chemistryResolve: [
      { text: "Hah!", chemistryId: "slime-cannon", oncePerCombat: true },
    ],
    chemistryBreak: [
      { text: "...gone?", chemistryId: "slime-cannon" },
    ],
  },
};

export const WARLOCK_BARKS: CombatBarkProfile = {
  id: "warlock",
  displayName: "Warlock",
  kind: "enemy",
  voiceMode: "articulate",
  voiceSummary: "tired professional occultist; treats corpses and minions as resources",
  pools: {
    combatStart: [
      { text: "Let's begin." },
      { text: "Fine." },
    ],
    abilityUse: [
      { text: "Burn.", abilityId: "hellfire" },
      { text: "Screen up.", abilityId: "anti-magic-field" },
    ],
    takeHit: [
      { text: "Irritating." },
    ],
    lowHp: [
      { text: "Not ideal." },
    ],
    death: [
      { text: "Unfinished business." },
    ],
    chemistrySelected: [
      { text: "Come here.", chemistryId: "bone-harvest" },
    ],
    chemistryTelegraph: [
      { text: "Need this.", chemistryId: "bone-harvest" },
    ],
    chemistryResolve: [
      { text: "Thank you.", chemistryId: "bone-harvest", oncePerCombat: true },
    ],
    chemistryBreak: [
      { text: "Wasted.", chemistryId: "bone-harvest" },
    ],
    rare: [
      { text: "I've buried better." },
    ],
  },
};

export const DEMON_BARKS: CombatBarkProfile = {
  id: "demon",
  displayName: "Demon",
  kind: "enemy",
  voiceMode: "fragmentary",
  voiceSummary: "blunt lower demon, wants the kill, never philosophizes",
  pools: {
    combatStart: [{ text: "Kill." }],
    abilityUse: [{ text: "Burn.", abilityId: "hellfire" }],
    takeHit: [{ text: "Hnh." }],
    death: [{ text: "Not... over." }],
  },
};

export const DEMONESS_BARKS: CombatBarkProfile = {
  id: "demoness",
  displayName: "Demoness",
  kind: "enemy",
  voiceMode: "articulate",
  voiceSummary: "clinical, efficient, faintly seductive without trying hard about it",
  pools: {
    combatStart: [
      { text: "Let's be quick." },
    ],
    healCast: [
      { text: "Cleaning up.", abilityId: "mass-heal-ability" },
    ],
    abilityUse: [
      { text: "Sit down.", abilityId: "seduction" },
    ],
    takeHit: [
      { text: "Rude." },
    ],
    death: [
      { text: "How tedious." },
    ],
  },
};

export const IRONCLAD_KNIGHT_BARKS: CombatBarkProfile = {
  id: "ironclad-knight",
  displayName: "Ironclad Knight",
  kind: "enemy",
  voiceMode: "articulate",
  voiceSummary: "black-knight family, colder — grim professional, no banter",
  pools: {
    combatStart: [{ text: "Ready." }],
    abilityUse: [{ text: "Forward.", abilityId: "charge" }],
    takeHit: [{ text: "Noted." }],
    death: [{ text: "As expected." }],
  },
};

export const RUNE_KNIGHT_BARKS: CombatBarkProfile = {
  id: "rune-knight",
  displayName: "Rune Knight",
  kind: "enemy",
  voiceMode: "articulate",
  voiceSummary: "controlled, deliberate — never rushes the charge",
  pools: {
    combatStart: [
      { text: "Ready." },
    ],
    abilityUse: [
      { text: "Hold.", abilityId: "lightning-strike" },
    ],
    takeHit: [
      { text: "Noted." },
    ],
    death: [
      { text: "Discharged." },
    ],
    chemistrySelected: [
      { text: "Charge.", chemistryId: "rune-overload" },
    ],
    chemistryTelegraph: [
      { text: "Hold." , chemistryId: "rune-overload" },
    ],
    chemistryResolve: [
      { text: "Now.", chemistryId: "rune-overload", oncePerCombat: true },
    ],
    chemistryBreak: [
      { text: "...", chemistryId: "rune-overload" },
    ],
  },
};

export const DEMON_BRAWLER_BARKS: CombatBarkProfile = {
  id: "demon-brawler",
  displayName: "Demon Brawler",
  kind: "enemy",
  voiceMode: "fragmentary",
  voiceSummary: "brutish, short-fused, wants the next hit in",
  pools: {
    combatStart: [{ text: "Now." }],
    takeHit: [{ text: "Hnh." }],
    death: [{ text: "...no." }],
  },
};

export const DEMON_SPAWN_BARKS: CombatBarkProfile = {
  id: "demon-spawn",
  displayName: "Demon Spawn",
  kind: "enemy",
  voiceMode: "fragmentary",
  voiceSummary: "small, scared, disposable, and knows it — sparsest single words only",
  pools: {
    combatStart: [
      { text: "Uh oh." },
    ],
    takeHit: [
      { text: "Ow!" },
    ],
    death: [
      { text: "Called it." },
    ],
    chemistrySelected: [
      { text: "Not me.", chemistryId: "spawn-bomb" },
      { text: "No.", chemistryId: "spawn-bomb" },
    ],
    chemistryTelegraph: [
      { text: "Wait.", chemistryId: "spawn-bomb" },
    ],
    chemistryResolve: [
      { text: "Oh.", chemistryId: "spawn-bomb", oncePerCombat: true },
    ],
  },
};

export const DEMON_CHAMPION_BARKS: CombatBarkProfile = {
  id: "demon-champion",
  displayName: "Demon Champion",
  kind: "enemy",
  voiceMode: "articulate",
  voiceSummary: "proud elite commander, wants respect or a kill, never grovels",
  pools: {
    combatStart: [
      { text: "At last." },
    ],
    abilityUse: [
      { text: "Enough waiting.", abilityId: "berserk" },
    ],
    takeHit: [
      { text: "Is that all." },
    ],
    death: [
      { text: "Impressive." },
    ],
  },
};

export const DEMON_MAGE_BARKS: CombatBarkProfile = {
  id: "demon-mage",
  displayName: "Demon Mage",
  kind: "enemy",
  voiceMode: "articulate",
  voiceSummary: "clinical demon caster; minions are inventory, not allies",
  pools: {
    combatStart: [
      { text: "Begin." },
    ],
    abilityUse: [
      { text: "Burn.", abilityId: "hellfire" },
      { text: "Rise.", abilityId: "summon-imp" },
    ],
    takeHit: [
      { text: "Irritating." },
    ],
    death: [
      { text: "Poorly spent." },
    ],
    chemistrySelected: [
      { text: "You.", chemistryId: "spawn-bomb" },
    ],
    chemistryTelegraph: [
      { text: "Hold.", chemistryId: "spawn-bomb" },
    ],
    chemistryResolve: [
      { text: "Go.", chemistryId: "spawn-bomb", oncePerCombat: true },
    ],
    chemistryBreak: [
      { text: "Wasteful.", chemistryId: "spawn-bomb" },
      { text: "Wasteful.", chemistryId: "combo-break" },
    ],
  },
};

export const SUCCUBUS_BARKS: CombatBarkProfile = {
  id: "succubus",
  displayName: "Succubus",
  kind: "enemy",
  voiceMode: "articulate",
  voiceSummary: "bored, seductive, unimpressed — doesn't try hard at the seduction bit",
  pools: {
    combatStart: [
      { text: "Let's make this easy." },
    ],
    abilityUse: [
      { text: "Relax.", abilityId: "seduction" },
      { text: "Give it here.", abilityId: "soul-drain" },
    ],
    takeHit: [
      { text: "Unnecessary." },
    ],
    death: [
      { text: "Pity." },
    ],
  },
};

export const ENEMY_BARKS_FLOOR3: readonly CombatBarkProfile[] = [
  ELITE_ORC_BARKS,
  LESSER_CONSTRUCT_BARKS,
  WEREWOLF_BARKS,
  HILL_OGRE_BARKS,
  STONE_GUARDIAN_BARKS,
  ANIMATED_ARMOR_BARKS,
  FLAME_GOLEM_BARKS,
  LAVA_SLIME_BARKS,
  HELLHOUND_BARKS,
  HELLBAT_BARKS,
  BLACK_KNIGHT_BARKS,
  VIPER_MAN_BARKS,
  MINOTAUR_BARKS,
  WARLOCK_BARKS,
  DEMON_BARKS,
  DEMONESS_BARKS,
  IRONCLAD_KNIGHT_BARKS,
  RUNE_KNIGHT_BARKS,
  DEMON_BRAWLER_BARKS,
  DEMON_SPAWN_BARKS,
  DEMON_CHAMPION_BARKS,
  DEMON_MAGE_BARKS,
  SUCCUBUS_BARKS,
];
