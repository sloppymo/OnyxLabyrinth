/**
 * Encounter vignette CONTENT — the party-banter popups that precede random
 * dungeon encounters (see `src/game/encounter-vignettes.ts` for the pure
 * selection/resolution logic and `main.ts`'s `maybeTriggerEncounter` for the
 * single wiring point).
 *
 * Voice: party banter. A beat with `speaker` preferences is delivered by the
 * first living party member matching one of those classes (best-first),
 * falling back to any living member — the same class-keyed philosophy as the
 * combat bark library (`src/data/combat-bark-library/`), so authored lines
 * work for any created party. A beat without `speaker` is plain narration.
 *
 * Keyed by formation id from `ENCOUNTER_TABLES` (`src/data/enemies.ts`),
 * with a per-family fallback map and a generic default pool. Popups are NOT
 * a tollbooth: authored first meetings (and authored timed outs) always
 * show, but repeats and generic-pool encounters roll against show-frequency
 * dials in `game/encounter-vignettes.ts` and usually go straight to the
 * swirl. First showing of a formation is a full intro; repeats draw from a
 * one-liner pool (self-aware repeat text is deliberate — the grind
 * acknowledging itself is part of the joke).
 *
 * Timed outs ("Mario Party rule"): some vignettes offer a short countdown
 * choice. A correct pick avoids the fight; a correct pick inside the perfect
 * window out-rewards fighting (design decision: excellence should beat XP).
 * A wrong pick or a timeout starts the fight with a punchline — failure is
 * funny, never a wasted popup.
 *
 * Deliberately not built: a conversation graph, skill checks, or per-enemy
 * dialogue. A vignette is a handful of beats and at most one timed choice.
 */

import type { CharacterClass } from "../game/party";

/** One page of a vignette: narration, or a class-keyed party line. */
export interface VignetteBeat {
  /** Preferred speaker classes, best-first. Omit for narration. */
  speaker?: CharacterClass[];
  text: string;
}

/** One option in a timed choice. */
export interface TimedOutOption {
  label: string;
  /** "avoid" skips the fight; "fight" starts it (with the punchline). */
  result: "avoid" | "fight";
  resultBeats: VignetteBeat[];
  /** Gold granted on a successful avoid. */
  goldReward?: number;
  /** Extra payoff if the avoid option is picked inside the perfect window. */
  perfect?: { text: string; gold: number };
}

/** A countdown choice appended to a vignette. */
export interface TimedOut {
  /** Text shown on the choice page, above the options. */
  prompt: string;
  /** Total time to choose, in ms. */
  timerMs: number;
  /** Picking a correct option this early counts as perfect. */
  perfectWindowMs: number;
  options: TimedOutOption[];
  /** Shown when the timer runs out. Always a fight. */
  timeoutBeats: VignetteBeat[];
}

export interface VignetteDef {
  /** Full first-meeting intros. Variants rotate on later full showings. */
  intros: VignetteBeat[][];
  /** Short repeat beats (each entry is the whole popup). */
  repeats: VignetteBeat[][];
  /** Optional timed choice, offered every time this formation appears. */
  out?: TimedOut;
}

// ---------------------------------------------------------------------------
// Authored Floor 1 formations (Phase A slice)
// ---------------------------------------------------------------------------

const F1_ORC_LEAP: VignetteDef = {
  intros: [
    [
      {
        text: "Two crypt orcs stand nose to nose in the corridor, mid-argument. The smaller one insists, loudly and with dates, that it is HIS turn to do the ambushing.",
      },
      {
        speaker: ["Thief", "Duelist"],
        text: '"He\'s right, you know. I can see the roster from here. Tuesdays are his."',
      },
      {
        speaker: ["Fighter", "Crusader", "Halberdier"],
        text: '"They haven\'t noticed us. We could settle this for them."',
      },
    ],
    [
      {
        text: "Around the corner, two crypt orcs rehearse an ambush on an imaginary party. The smaller one keeps missing his cue, and the big one has started counting to three very slowly.",
      },
      {
        speaker: ["Mage", "Priest"],
        text: '"I\'ve seen worse choreography. Not much worse."',
      },
    ],
  ],
  repeats: [
    [{ text: "The orcs again. The ambush roster dispute remains unresolved." }],
    [
      {
        speaker: ["Thief", "Duelist", "Fighter"],
        text: '"Same two orcs. I\'m starting to think nobody else applied for this corridor."',
      },
    ],
  ],
  out: {
    prompt: "They spot you — and both turn to you at once. \"YOU. Whose turn is it?\"",
    timerMs: 5000,
    perfectWindowMs: 2000,
    options: [
      {
        label: "\"The small one's. Obviously.\"",
        result: "avoid",
        goldReward: 12,
        resultBeats: [
          {
            text: "The small orc whoops. The big orc grumbles, digs out the ambush ledger, and initials it. They wave you through — ambushing someone who helped with the paperwork would be unprofessional.",
          },
        ],
        perfect: {
          text: "You answered so fast the big orc assumes you've seen the roster. He pays the standing consultancy fee without being asked.",
          gold: 30,
        },
      },
      {
        label: "\"The big one's, surely.\"",
        result: "fight",
        resultBeats: [
          {
            text: "The small orc's lip trembles. Then he screams a scream that has been building for several Tuesdays, and both of them decide the ambush is happening NOW, together, on you.",
          },
        ],
      },
      {
        label: "Draw steel",
        result: "fight",
        resultBeats: [
          {
            text: "Fair enough. At least the roster dispute is finally moot.",
          },
        ],
      },
    ],
    timeoutBeats: [
      {
        text: "You hesitate too long. Nothing unites two arguing orcs like an audience that won't pick a side.",
      },
    ],
  },
};

const F1_RED_BONE_BOUNTY: VignetteDef = {
  intros: [
    [
      {
        text: "Three skeletons stand at rigid attention in the corridor — one bleached, one rust-red, one clutching a bow like a parade rifle. Someone, a very long time ago, told them there would be an inspection.",
      },
      {
        speaker: ["Priest", "Crusader"],
        text: '"They\'ve been waiting for orders for a century. That\'s not undeath, that\'s middle management."',
      },
      {
        text: "The red one creaks its skull toward you. All three snap a salute.",
      },
    ],
  ],
  repeats: [
    [{ text: "The honor guard again. Still at attention. Still no inspector." }],
    [
      {
        speaker: ["Thief", "Mage"],
        text: '"These three again. I swear the red one remembers us."',
      },
    ],
  ],
  out: {
    prompt: "They are saluting you. They think you are the Inspector.",
    timerMs: 4000,
    perfectWindowMs: 1500,
    options: [
      {
        label: "Return the salute",
        result: "avoid",
        goldReward: 10,
        resultBeats: [
          {
            text: "You salute. Bones clatter with relief. The red skeleton stamps something into the dust with its heel — inspection PASSED — and the three of them march off to stand somewhere else for another century.",
          },
        ],
        perfect: {
          text: "Your salute is so crisp the archer weeps rust. They present you with the ceremonial honorarium, kept safe against this exact day.",
          gold: 25,
        },
      },
      {
        label: "Ask who they're saluting",
        result: "fight",
        resultBeats: [
          {
            text: "A terrible pause. If you have to ask, you are not the Inspector. And there are standing orders about impostors.",
          },
        ],
      },
    ],
    timeoutBeats: [
      {
        text: "The salute wilts, joint by joint. Protocol is clear about civilians who fail to reciprocate.",
      },
    ],
  },
};

const F1_WARLOCK_BONE_BATTERY: VignetteDef = {
  intros: [
    [
      {
        text: "A crypt warlock shuffles down the corridor flanked by two skeletons. He keeps glancing at them sideways — the way a hungry man glances at a pantry.",
      },
      {
        speaker: ["Mage"],
        text: '"He\'s not guarding those skeletons. He\'s... rationing them. Watch the closest one if he starts chanting."',
      },
      {
        speaker: ["Priest", "Crusader"],
        text: '"He\'s going to eat one. The skeleton. He is going to eat the skeleton. I am not letting that happen twice."',
      },
    ],
    [
      {
        text: "The warlock ahead has drawn small chalk marks on each of his skeletons. One says FIRST. The skeletons do not appear to have been consulted.",
      },
      {
        speaker: ["Thief", "Duelist"],
        text: '"Whatever \'first\' means, let\'s make sure it doesn\'t."',
      },
    ],
  ],
  repeats: [
    [
      {
        text: "Another warlock with a packed lunch of skeletons. You know how this goes now.",
      },
    ],
    [
      {
        speaker: ["Mage", "Priest"],
        text: '"Bone-eater. Drop him before he snacks."',
      },
    ],
  ],
};

const F1_MINOTAUR_SLIME: VignetteDef = {
  intros: [
    [
      {
        text: "A crypt minotaur is doing shoulder stretches in the middle of the corridor. Beside it, a slime performs what can only be described as breathing exercises.",
      },
      {
        speaker: ["Thief", "Duelist", "Halberdier"],
        text: '"Why is the slime doing breathing exercises? Slimes don\'t breathe. What is it preparing for?"',
      },
      {
        speaker: ["Fighter", "Crusader"],
        text: '"It\'s preparing to be thrown. Don\'t stand where the slime is looking."',
      },
    ],
  ],
  repeats: [
    [
      {
        text: "A minotaur limbering up, a slime bracing itself. The classic double act.",
      },
    ],
    [
      {
        speaker: ["Fighter", "Halberdier"],
        text: '"Incoming slime. Not \'approaching\' — incoming. Spread out."',
      },
    ],
  ],
};

const F1_ACID_BURROW: VignetteDef = {
  intros: [
    [
      {
        text: "The flagstones ahead glisten. Two slimes loiter around a wide, patient puddle that is very slightly eating the floor.",
      },
      {
        speaker: ["Mage", "Priest"],
        text: '"That puddle has ambitions. Puddles should not have ambitions."',
      },
      {
        speaker: ["Thief"],
        text: '"New boots. I want it noted, before whatever happens next, that these were new boots."',
      },
    ],
  ],
  repeats: [
    [{ text: "More slimes, another ambitious puddle. The floor never learns." }],
    [
      {
        speaker: ["Thief", "Duelist"],
        text: '"Puddle. Slimes. Boots. Here we go again."',
      },
    ],
  ],
};

const F1_SOLO_GUARDIAN: VignetteDef = {
  intros: [
    [
      {
        text: "A stone guardian rounds the corner on its patrol route, footsteps landing in grooves its own feet have worn into the floor over a hundred years of the same eleven-step circuit.",
      },
      {
        speaker: ["Priest", "Mage"],
        text: '"A century of walking the same eleven steps. I\'d fight strangers too."',
      },
      {
        text: "It sees you. Somewhere in the grinding of its shoulders there is something almost like gratitude.",
      },
    ],
  ],
  repeats: [
    [
      {
        text: "Another guardian on another worn-down circuit, delighted in its stony way to see you.",
      },
    ],
  ],
};

// ---------------------------------------------------------------------------
// Phase 1b.1 — silent [chem] Floor 1 formations (name the existing mechanic)
// ---------------------------------------------------------------------------

const F1_OGRE_TOSS: VignetteDef = {
  intros: [
    [
      {
        text: "A hill ogre holds a skeleton by the ribcage, arm cocked back like a javelin thrower. The skeleton does not appear to have been consulted. It is waving.",
      },
      {
        speaker: ["Fighter", "Halberdier", "Crusader"],
        text: '"He\'s going to throw the skeleton at us. Move before he finds his range."',
      },
      {
        speaker: ["Thief", "Duelist"],
        text: '"Kill the ogre and the skeleton\'s just a skeleton. Kill the skeleton and we\'ve got an ogre with an empty hand and a grudge. So... ogre first."',
      },
    ],
  ],
  repeats: [
    [{ text: "Another ogre weighing skeletons by the ribcage. He has his range this time." }],
    [
      {
        speaker: ["Fighter", "Halberdier"],
        text: '"Skeleton-thrower. Same play — close the distance before he lets go."',
      },
    ],
  ],
};

const F1_LIVING_SHIELD: VignetteDef = {
  intros: [
    [
      {
        text: "A crypt warlock stands in the corridor with an animated armor planted directly in front of him — not beside, not behind, *in front*, like a door with opinions about who walks through it.",
      },
      {
        speaker: ["Mage", "Priest"],
        text: '"The armor isn\'t here to fight us. It\'s here to keep us away from the warlock while he works. We need to get past it, or through it, before the chanting finishes."',
      },
      {
        speaker: ["Fighter", "Crusader", "Halberdier"],
        text: '"One way or another, that armor comes off its hinges."',
      },
    ],
  ],
  repeats: [
    [{ text: "Warlock behind his armor door again. Same problem: reach the caster, ignore or break the shield." }],
    [
      {
        speaker: ["Thief", "Duelist"],
        text: '"Bodyguard and the body. We know the drill."',
      },
    ],
  ],
};

const F1_HUNTING_PACK: VignetteDef = {
  intros: [
    [
      {
        text: "A hellhound and a werewolf move down the corridor in a staggered formation — the hound forward, the werewolf half a step behind and to the flank. They are not competing. They are coordinating.",
      },
      {
        speaker: ["Fighter", "Halberdier"],
        text: '"The hound flushes, the wolf flanks. They\'ve done this before. Don\'t let them split us."',
      },
      {
        speaker: ["Thief", "Duelist"],
        text: '"Two of them, one pattern. Kill the hound and the wolf loses its herder. Kill the wolf and the hound loses its teeth. Pick one and commit."',
      },
    ],
  ],
  repeats: [
    [{ text: "The hunting pair again — hound forward, wolf flanking. Same coordinated stalk." }],
    [
      {
        speaker: ["Mage", "Priest"],
        text: '"Flush-and-flank. Break the pair before they settle into it."',
      },
    ],
  ],
};

const F1_SPAWN_BOMB: VignetteDef = {
  intros: [
    [
      {
        text: "Two demon spawn waddle ahead of a crypt demon mage like piglets following their mother. The mage is not mothering them. The mage is fattening them. You can see the fire building behind her eyes, and behind theirs.",
      },
      {
        speaker: ["Mage"],
        text: '"She\'s going to detonate them. Those spawn are walking bombs, and she\'s the fuse. Kill the mage before she lights them, or kill the spawn before they pop — we don\'t have time for both."',
      },
      {
        speaker: ["Priest", "Crusader"],
        text: '"The spawn don\'t know what they are yet. That\'s the worst part."',
      },
    ],
  ],
  repeats: [
    [{ text: "Another mage walking her spawn bombs down the corridor. The fire is already building." }],
    [
      {
        speaker: ["Fighter", "Halberdier"],
        text: '"Spawn-bomb. Mage or spawn — pick a fuse."',
      },
    ],
  ],
};

const F1_RUNE_OVERLOAD: VignetteDef = {
  intros: [
    [
      {
        text: "A rune knight has one hand on a lesser construct and the other tracing sigils into the air. The construct is humming. The sigils are getting brighter. The corridor lights up in lines of crackling blue.",
      },
      {
        speaker: ["Mage"],
        text: '"She\'s overloading it. The construct becomes a lightning reservoir — one touch and it discharges through us. Kill the knight and the charge dies with her. Kill the construct and she just charges the next one."',
      },
      {
        speaker: ["Thief", "Duelist"],
        text: '"So the knight first. Unless you fancy being the ground."',
      },
    ],
  ],
  repeats: [
    [{ text: "Rune knight charging a construct again. The hum is already starting." }],
    [
      {
        speaker: ["Fighter", "Crusader"],
        text: '"Overload combo. Knight first, every time."',
      },
    ],
  ],
};

const F1_GUARDED_BOMB: VignetteDef = {
  intros: [
    [
      {
        text: "The corridor is crowded. An animated armor stands sentinel in front. Behind it, a demon mage tends to a demon spawn the way a cook tends a pot. The spawn is swelling. The armor is not letting anyone through to stop it.",
      },
      {
        speaker: ["Mage"],
        text: '"That\'s the spawn-bomb setup with a bodyguard. The armor keeps us off the mage, the mage detonates the spawn, the spawn takes the room. Three problems, one order: break the armor, reach the mage, kill the spawn. We won\'t get all three."',
      },
      {
        speaker: ["Fighter", "Halberdier", "Crusader"],
        text: '"Then we pick the one that matters most. The mage is the engine. The armor is the wall. The spawn is the payload. What do we stop first?"',
      },
      {
        speaker: ["Thief", "Duelist"],
        text: '"I can get past the armor. Keep it busy. Someone else deals with the cook."',
      },
    ],
  ],
  repeats: [
    [{ text: "The full set again — bodyguard, bomber, bomb. Same three-way problem." }],
    [
      {
        speaker: ["Priest", "Mage"],
        text: '"Guarded bomb. Armor, mage, spawn — in that order, if we can."',
      },
    ],
  ],
};

// ---------------------------------------------------------------------------
// Phase 1b.1 — Floor 1 T0 formations (name the soft hook, lift to T1)
// ---------------------------------------------------------------------------

const F1_WRAITH_PINCER: VignetteDef = {
  intros: [
    [
      {
        text: "A blood monster lumbers forward to fill the corridor while a blood wraith drifts behind it, already translucent, already reaching. The monster is the door. The wraith is what comes through the door after it opens.",
      },
      {
        speaker: ["Mage", "Priest"],
        text: '"The wraith is the real threat — it\'s draining from behind the monster. The monster is just there to keep us pinned in range."',
      },
      {
        speaker: ["Fighter", "Halberdier"],
        text: '"So we go through the monster to reach the wraith, or we burn the wraith through the monster. Either way, the front is not the point."',
      },
    ],
  ],
  repeats: [
    [{ text: "The pincer again — blood monster holding, blood wraith draining. Front is the door, back is the threat." }],
    [
      {
        speaker: ["Thief", "Duelist"],
        text: '"Pincer. Don\'t stare at the wall — kill what\'s behind it."',
      },
    ],
  ],
};

const F1_GAZE_SLIME: VignetteDef = {
  intros: [
    [
      {
        text: "Two slimes shamble ahead of a gaze wraith, and they are not wandering — they\'re positioned. The wraith\'s eye peers between them, blinking, patient. The slimes are not the threat. The slimes are the screen.",
      },
      {
        speaker: ["Priest", "Mage"],
        text: '"The wraith is using the slimes as cover. Its gaze will blind us if we let it line up a shot. Kill the slimes to open the line, or eat the gaze behind a wall of pudding."',
      },
      {
        speaker: ["Thief", "Duelist"],
        text: '"I\'d rather be blinded by something I chose to look at. Clear the slimes."',
      },
    ],
  ],
  repeats: [
    [{ text: "Slimes screening a gaze wraith again. Same arrangement — pudding wall, eye behind it." }],
    [
      {
        speaker: ["Fighter", "Crusader"],
        text: '"Gaze-slime. Pop the screen, then the eye."',
      },
    ],
  ],
};

const F1_FLAME_FORGE: VignetteDef = {
  intros: [
    [
      {
        text: "Two lesser constructs stand in the corridor, still and cold. Behind them, a flame golem opens its chest like a bellows and exhales a wash of heat over both of them. The constructs begin to glow. Their joints move faster.",
      },
      {
        speaker: ["Mage"],
        text: '"The golem is stoking them — that\'s a forge bellows. The constructs are faster and harder while it\'s feeding them heat. Kill the golem and they cool down. Kill the constructs and the golem is just a slow furnace."',
      },
      {
        speaker: ["Fighter", "Halberdier"],
        text: '"The golem is the engine. But the constructs are the ones hitting us right now."',
      },
    ],
  ],
  repeats: [
    [{ text: "Forge line again — goom stoking constructs. The bellows is the engine; the constructs are the fists." }],
    [
      {
        speaker: ["Priest", "Crusader"],
        text: '"Forge combo. Golem or constructs — what do we stop?"',
      },
    ],
  ],
};

const F1_GHOSTFIRE_DUET: VignetteDef = {
  intros: [
    [
      {
        text: "Two ghostfires hang in the corridor like lanterns, flickering in and out of phase. Neither is attacking yet. Both are draining — you can feel the pull already, a slow tide going out from your chest.",
      },
      {
        speaker: ["Mage", "Priest"],
        text: '"Two drainers. They\'ll both sip at us every turn. Kill one fast and we halve the bleed. Split damage and we just feed them longer."',
      },
      {
        speaker: ["Fighter", "Halberdier"],
        text: '"Pick one. Drop it. Then the other. Simple."',
      },
      {
        speaker: ["Thief", "Duelist"],
        text: '"Simple if you don\'t mind the one you didn\'t pick drinking you dry while you work. But yes — one at a time."',
      },
    ],
  ],
  repeats: [
    [{ text: "The ghostfire duet again. Two lanterns, two drainers, same slow pull." }],
    [
      {
        speaker: ["Fighter", "Crusader"],
        text: '"Two drainers. One at a time — don\'t split."',
      },
    ],
  ],
};

// ---------------------------------------------------------------------------
// Phase 1b.1 — Floor 2 identity test formations
// ---------------------------------------------------------------------------

const F2_LAB_KEEPERS: VignetteDef = {
  intros: [
    [
      {
        text: "A lab assistant bends over a failed experiment strapped to a slab, syringe in hand. The thing on the slab is pulling against its restraints. An armored skeleton stands at the door like a bouncer. An eyeball monster watches from the back of the room, unblinking, taking notes nobody will read.",
      },
      {
        speaker: ["Mage"],
        text: '"The assistant is the problem. It\'s healing the experiment — and if that syringe is what I think it is, it\'s doing more than healing. Kill the assistant before it finishes, or kill the experiment before it gets up."',
      },
      {
        speaker: ["Priest", "Crusader"],
        text: '"The thing on the slab doesn\'t deserve what\'s in that needle. But if it breaks free, it won\'t be grateful."',
      },
      {
        speaker: ["Thief", "Duelist"],
        text: '"The eyeball is watching. I don\'t like being watched. But the assistant is the one with the syringe."',
      },
    ],
  ],
  repeats: [
    [{ text: "The lab crew again — assistant fussing over the experiment, armor on the door, eyeball taking notes. Same arrangement." }],
    [
      {
        speaker: ["Fighter", "Halberdier"],
        text: '"Lab-keepers. The assistant is the engine — drop it first."',
      },
    ],
  ],
};

const F2_DISPLACER_LAB: VignetteDef = {
  intros: [
    [
      {
        text: "Something is blinking in and out of existence at the far end of the corridor — there, gone, there again, each time two steps closer. A failed experiment drags itself along the wall behind it. An eyeball monster floats above both, watching you watch the blinker.",
      },
      {
        speaker: ["Thief", "Duelist"],
        text: '"That\'s a displacer beast. It\'s going to be on top of us before we can draw a bead. Don\'t track the blur — track where it\'s going, not where it is."',
      },
      {
        speaker: ["Mage", "Priest"],
        text: '"The eyeball is the real danger if we let it line up a gaze. But the blinker will be in our throats first."',
      },
    ],
  ],
  repeats: [
    [{ text: "The blinker and the gaze again — displacer beast closing, eyeball watching. Same pattern." }],
    [
      {
        speaker: ["Fighter", "Crusader"],
        text: '"Displacer lab. Kill the blinker before it closes, then the eye."',
      },
    ],
  ],
};

// ---------------------------------------------------------------------------
// Phase 1b.1 — Floor 2 family vignette (armored-line: frontline + ranged)
// ---------------------------------------------------------------------------

const F2_ARMORED_LINE: VignetteDef = {
  intros: [
    [
      {
        text: "The corridor ahead is walled: a front line of bodies with shields lowered, and behind them, archers nocking and sighting. The front line isn't here to kill you. It's here to hold still while the archers do the killing.",
      },
      {
        speaker: ["Fighter", "Halberdier", "Crusader"],
        text: '"Shield wall and archers. Rush the bows or eat arrows trying. The front line is just a delay — break through or go around."',
      },
      {
        speaker: ["Thief", "Duelist"],
        text: '"They expect us to trade blows with the wall. Don\'t. The wall is patient. The archers aren\'t. Close the distance."',
      },
    ],
  ],
  repeats: [
    [{ text: "Shield wall and archers again. Same arrangement — front holds, back shoots." }],
    [
      {
        speaker: ["Mage", "Priest"],
        text: '"Wall-and-bows. Rush the archers — the front is just a speed bump."',
      },
    ],
  ],
};

// ---------------------------------------------------------------------------
// Generic pools — every random encounter gets at least this.
// ---------------------------------------------------------------------------

/** Default intros for formations without an authored vignette yet. */
export const DEFAULT_VIGNETTE: VignetteDef = {
  intros: [
    [
      {
        text: "Shapes ahead stop what they were doing — which, this deep in the labyrinth, was probably waiting for you.",
      },
      {
        speaker: ["Fighter", "Crusader", "Halberdier"],
        text: '"Company. Weapons out."',
      },
    ],
    [
      {
        text: "You hear them before you see them: an argument about territory, dinner, or both, cut short by the sound of your boots.",
      },
      {
        speaker: ["Thief", "Duelist"],
        text: '"We could tiptoe. Ah — no, they\'ve seen us. Plan B."',
      },
    ],
    [
      {
        text: "Something in the dark decides, after a moment of deliberation, that your party looks like less work than finding other food.",
      },
      {
        speaker: ["Mage", "Priest"],
        text: '"It has miscalculated."',
      },
    ],
  ],
  repeats: [
    [{ text: "They do not have a clever reason this time. Some fights are just fights." }],
    [{ text: "The labyrinth, low on ideas, sends more of the usual." }],
    [
      {
        speaker: ["Fighter", "Halberdier", "Crusader"],
        text: '"Again? Fine. Again."',
      },
    ],
    [
      {
        speaker: ["Thief", "Mage"],
        text: '"You\'d think word would get around about us by now."',
      },
    ],
  ],
};

/** Vignettes keyed by formation id (`EncounterEntry.id`). */
export const VIGNETTES_BY_FORMATION: Record<string, VignetteDef> = {
  "f1-orc-leap": F1_ORC_LEAP,
  "f1-red-bone-bounty": F1_RED_BONE_BOUNTY,
  "f1-warlock-bone-battery": F1_WARLOCK_BONE_BATTERY,
  "f1-minotaur-slime": F1_MINOTAUR_SLIME,
  "f1-acid-burrow": F1_ACID_BURROW,
  "f1-solo-guardian": F1_SOLO_GUARDIAN,
  // Phase 1b.1 — silent [chem] (name the existing mechanic)
  "f1-ogre-toss": F1_OGRE_TOSS,
  "f1-living-shield": F1_LIVING_SHIELD,
  "f1-hunting-pack": F1_HUNTING_PACK,
  "f1-spawn-bomb": F1_SPAWN_BOMB,
  "f1-rune-overload": F1_RUNE_OVERLOAD,
  "f1-guarded-bomb": F1_GUARDED_BOMB,
  // Phase 1b.1 — T0 (name the soft hook, lift to T1)
  "f1-wraith-pincer": F1_WRAITH_PINCER,
  "f1-gaze-slime": F1_GAZE_SLIME,
  "f1-flame-forge": F1_FLAME_FORGE,
  "f1-ghostfire-duet": F1_GHOSTFIRE_DUET,
  // Phase 1b.1 — Floor 2 identity test
  "f2-lab-keepers": F2_LAB_KEEPERS,
  "f2-displacer-lab": F2_DISPLACER_LAB,
};

/** Family-level fallbacks (checked after formation id, before the default). */
export const VIGNETTES_BY_FAMILY: Record<string, VignetteDef> = {
  // Phase 1b.1 — frontline screen + ranged threat (covers f2-armored-archer,
  // f2-armored-orc-archer, and f2-orc-squad, which now shares this family)
  "armored-line": F2_ARMORED_LINE,
};
