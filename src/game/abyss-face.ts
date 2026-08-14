import type { GameState, EnvironmentalEncounterProgress } from "../types";

export const ABYSS_FACE_ID = "abyss-face";

export function isOnAbyssBridge(state: Pick<GameState, "mode" | "floor" | "player">): boolean {
  return state.mode === "dungeon" && state.floor.id === 2 && state.player.x === 2 &&
    state.player.y >= 14 && state.player.y <= 20;
}

export interface AmbientBarkCue {
  speakerId: typeof ABYSS_FACE_ID;
  speaker: "THE FACE";
  text: string;
  durationMs?: number;
  sfx?: "abyss-fart";
}

const FIRST_NORTHBOUND: Readonly<Record<number, Omit<AmbientBarkCue, "speakerId" | "speaker"> & { id: string }>> = {
  // The arrival line is emitted by the first direct look after the silent
  // exposure beat. The remaining one-shots stay spatial so the bridge still
  // has its authored rhythm when a player walks straight through.
  17: { id: "hush", text: "Everybody shut up." },
  16: { id: "assholes", text: "HAHAHA. Look at these assholes.", durationMs: 2500 },
  15: {
    id: "tragedy",
    text: "Oh boo hoo! I'm a human! My life is so tragic! Waaaaaaa!",
    durationMs: 3600,
  },
  14: {
    id: "fart",
    text: "[The face makes a long, solemn fart noise.]",
    durationMs: 2600,
    sfx: "abyss-fart",
  },
  13: { id: "abyss-digestion", text: "That came from the abyss. The abyss has digestive problems.", durationMs: 3400 },
};

const REPEAT_LINES = [
  "Jump.",
  "Careful. That's a bottomless pit. I'm kidding. There's a bottom. It's just extremely far away.",
  "You know what's down there? Neither do I. I'm a face.",
  "You brought swords! Oh shit! The Labyrinth is FUCKED now.",
  "Look at the little backpacks.",
  "Have you tried simply not being cursed?",
  "Four more heroes! Surely THESE are the special ones.",
  "Stop. Do not open the red door.",
] as const;

function progressFor(state: GameState): EnvironmentalEncounterProgress {
  const encounters = state.environmentalEncounters ??= {};
  return encounters[ABYSS_FACE_ID] ??= {
    crossings: 0,
    oneShots: [],
    repeatCursor: 0,
    lookCount: 0,
  };
}

function cue(text: string, rest: Partial<AmbientBarkCue> = {}): AmbientBarkCue {
  return { speakerId: ABYSS_FACE_ID, speaker: "THE FACE", text, ...rest };
}

export function selectAbyssFaceContext(state: GameState): string | null {
  if (state.party.some((member) => member.hp <= 0 || member.status.includes("knockedOut"))) {
    return "Oh good. You brought a corpse.";
  }
  const hpRatio = state.party.reduce((sum, member) => sum + Math.max(0, member.hp), 0) /
    Math.max(1, state.party.reduce((sum, member) => sum + member.maxHp, 0));
  if (hpRatio <= 0.25) return "Jesus Christ. Did the STAIRS do that to you?";
  if (state.party.some((member) => member.status.includes("poison"))) {
    return "Somebody looks green. Probably fine.";
  }
  if (!state.party.some((member) => member.class === "Mage")) return "No wizard? Bold. Stupid. But bold.";
  if (state.partyGold >= 1500) return "Holy shit. Look at Moneybags.";
  if (state.partyGold <= 20) return "You people are BROKE.";
  if (state.party.reduce((sum, member) => sum + member.level, 0) / state.party.length >= 7) {
    return "Oh. You're still alive. That's actually kind of annoying.";
  }
  return null;
}

/** Resolve a spatial bark after a successful step. Movement stays nonmodal. */
export function resolveAbyssFaceStep(
  state: GameState,
  from: { x: number; y: number },
  to: { x: number; y: number },
  random = Math.random
): AmbientBarkCue | null {
  if (state.floor.id !== 2 || to.x !== 2 || to.y < 13 || to.y > 21) return null;
  const progress = progressFor(state);
  const northbound = to.y < from.y;

  if (progress.crossings === 0 && northbound) {
    // Do not spend the first bark while the party is still looking down the
    // bridge. Arm it at the threshold; resolveAbyssFaceTurn presents it once
    // the player has had a beat to expose the face itself.
    if (to.y === 18 && !progress.oneShots.includes("arrival-pending")) {
      progress.oneShots.push("arrival-pending");
      return null;
    }
    if (progress.oneShots.includes("arrival-pending") && !progress.oneShots.includes("arrival")) {
      if (to.y === 13) {
        progress.oneShots.push("arrival");
        progress.crossings = 1;
        return cue("Oh! Oh! Here they come.");
      }
      // A straight-through player still gets the line at the end of the
      // crossing; only a player who looks earns it at the reveal beat.
      return null;
    }
    if (to.y === 15 && !progress.oneShots.includes("context")) {
      progress.oneShots.push("context");
      return cue(selectAbyssFaceContext(state) ?? "Four more heroes! Surely THESE are the special ones.");
    }
    const authored = FIRST_NORTHBOUND[to.y];
    if (authored && !progress.oneShots.includes(authored.id)) {
      progress.oneShots.push(authored.id);
      if (to.y === 13) progress.crossings = 1;
      return cue(authored.text, { durationMs: authored.durationMs, sfx: authored.sfx });
    }
  }

  if (progress.crossings === 0 && !northbound && from.y <= 19) {
    if (!progress.oneShots.includes("retreat")) {
      progress.oneShots.push("retreat");
      return cue("THEY'RE BACK! I knew you guys could walk both directions.");
    }
    return null;
  }

  const completedCrossing = northbound ? to.y === 13 : to.y === 21;
  if (completedCrossing) progress.crossings += 1;
  if (to.y !== 17) return null;
  // Silence is deliberate on roughly one third of return crossings.
  if (random() < 0.35) return null;
  const contextual = selectAbyssFaceContext(state);
  if (contextual && random() < 0.55) return cue(contextual);
  const line = REPEAT_LINES[progress.repeatCursor % REPEAT_LINES.length];
  progress.repeatCursor += 1;
  return cue(line, { durationMs: line.length > 70 ? 3800 : undefined });
}

export function resolveAbyssFaceTurn(state: GameState): AmbientBarkCue | null {
  if (state.floor.id !== 2 || state.player.x !== 2 || state.player.y < 14 || state.player.y > 20) return null;
  // Facing east is 1. Only direct, repeated attention earns acknowledgment.
  if (state.player.facing !== 1) return null;
  const progress = progressFor(state);
  if (progress.crossings === 0 &&
      progress.oneShots.includes("arrival-pending") &&
      !progress.oneShots.includes("arrival")) {
    progress.oneShots.push("arrival");
    return cue("Oh! Oh! Here they come.");
  }
  progress.lookCount += 1;
  if (progress.lookCount === 3) return cue("Yes?");
  if (progress.lookCount === 7) return cue("What?");
  if (progress.lookCount === 11) return cue("Take a picture.");
  return null;
}
