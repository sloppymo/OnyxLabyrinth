/**
 * Encounter vignette LOGIC — pure selection and resolution for the
 * party-banter popups that precede random encounters. Content lives in
 * `src/data/encounter-vignettes.ts`; the single wiring point is
 * `maybeTriggerEncounter` in `main.ts`.
 *
 * Session-only memory: like `EncounterFamilyMemory` (game/encounters.ts),
 * vignette memory is deliberately NOT part of GameState — first-time/repeat
 * bookkeeping must never leak through saves or into Arena.
 *
 * No DOM, no GameState mutation, no combat math. Rendering a beat resolves
 * the class-keyed speaker against the live party and formats the line; what
 * happens on avoid/fight (gold, encounter clock, startCombat) stays in
 * main.ts.
 */

import {
  DEFAULT_VIGNETTE,
  VIGNETTES_BY_FAMILY,
  VIGNETTES_BY_FORMATION,
  type TimedOut,
  type VignetteBeat,
  type VignetteDef,
} from "../data/encounter-vignettes";
import type { Character } from "./party";

/** Session-only per-formation showing counts. Never put this in GameState. */
export interface VignetteMemory {
  /** Formation id → number of times a vignette was shown for it. */
  counts: Map<string, number>;
}

export function createVignetteMemory(): VignetteMemory {
  return { counts: new Map() };
}

export function resetVignetteMemory(memory: VignetteMemory): void {
  memory.counts.clear();
}

/** A vignette resolved against the party, ready for the dialog controller. */
export interface SelectedVignette {
  /** One entry per dialog page. */
  pages: string[];
  /** Timed choice, when the formation authors one. */
  out?: TimedOut;
  firstTime: boolean;
}

// Show-frequency dials. The vignette layer must feel like occasional weird
// encounters inside the encounter system, not a tollbooth before combat:
// authored first meetings always show (that's the feature), authored repeats
// with a timed out always show (the minigame is the fun part), everything
// else rolls against these and otherwise goes straight to the swirl.
/** Chance an UNAUTHORED formation's first meeting shows a generic intro. */
export const DEFAULT_FIRST_SHOW_CHANCE = 0.4;
/** Chance an unauthored repeat shows a one-liner. */
export const DEFAULT_REPEAT_SHOW_CHANCE = 0.15;
/** Chance an authored repeat WITHOUT a timed out shows its one-liner. */
export const AUTHORED_REPEAT_SHOW_CHANCE = 0.6;

function defFor(
  formationId: string | undefined,
  family: string | undefined
): { def: VignetteDef; authored: boolean } {
  if (formationId && VIGNETTES_BY_FORMATION[formationId]) {
    return { def: VIGNETTES_BY_FORMATION[formationId], authored: true };
  }
  if (family && VIGNETTES_BY_FAMILY[family]) {
    return { def: VIGNETTES_BY_FAMILY[family], authored: true };
  }
  return { def: DEFAULT_VIGNETTE, authored: false };
}

/**
 * Resolve a beat's speaker against the living party and format the line.
 * Preferred classes are best-first; falls back to any living member chosen
 * by `rng`, and to plain narration if nobody is conscious to banter.
 */
export function renderBeat(
  beat: VignetteBeat,
  party: readonly Character[],
  rng: () => number
): string {
  if (!beat.speaker) return beat.text;
  const living = party.filter((c) => c.hp > 0);
  if (living.length === 0) return beat.text;
  for (const cls of beat.speaker) {
    const match = living.find((c) => c.class === cls);
    if (match) return `${match.name}: ${beat.text}`;
  }
  const anyone = living[Math.floor(rng() * living.length) % living.length];
  return `${anyone.name}: ${beat.text}`;
}

/**
 * Pick the vignette for this encounter and render it into dialog pages, or
 * return null when this encounter should go straight to the swirl (see the
 * show-frequency dials above — the popup must stay surprising). First
 * showing of a formation gets a full intro; repeats get a one-liner from the
 * repeat pool. Callers must invoke `markVignetteShown` when the popup
 * actually opens, so a skipped encounter can still get its "first" intro
 * later.
 */
export function selectVignette(
  entry: { id?: string; family?: string },
  party: readonly Character[],
  memory: VignetteMemory,
  rng: () => number
): SelectedVignette | null {
  const { def, authored } = defFor(entry.id, entry.family);
  const key = entry.id ?? entry.family ?? "unknown";
  const count = memory.counts.get(key) ?? 0;
  const firstTime = count === 0;

  const showChance = authored
    ? firstTime || def.out
      ? 1
      : AUTHORED_REPEAT_SHOW_CHANCE
    : firstTime
      ? DEFAULT_FIRST_SHOW_CHANCE
      : DEFAULT_REPEAT_SHOW_CHANCE;
  if (showChance < 1 && rng() >= showChance) return null;

  const pool = firstTime ? def.intros : def.repeats;
  const fallback = firstTime ? def.repeats : def.intros;
  const beats =
    pool.length > 0
      ? pool[count % pool.length]
      : fallback.length > 0
        ? fallback[count % fallback.length]
        : [];

  const pages = beats.map((b) => renderBeat(b, party, rng));
  const out = def.out;
  if (out) pages.push(out.prompt);
  if (pages.length === 0) pages.push("Something stirs in the dark.");

  return { pages, out, firstTime };
}

/** Record that a vignette was shown for this formation. */
export function markVignetteShown(
  memory: VignetteMemory,
  entry: { id?: string; family?: string }
): void {
  const key = entry.id ?? entry.family ?? "unknown";
  memory.counts.set(key, (memory.counts.get(key) ?? 0) + 1);
}

/** Outcome of a timed choice, rendered and ready to apply. */
export interface TimedOutResolution {
  /** True when combat should start after the outcome text. */
  fight: boolean;
  /** Rendered outcome pages (punchline / payoff, perfect payoff appended). */
  pages: string[];
  /** Gold to grant (avoid reward plus any perfect bonus). */
  gold: number;
  perfect: boolean;
}

/**
 * Resolve a timed-choice selection. `value` is the option index as a string
 * (the dialog's choice values), or `"timeout"` when the countdown expired.
 * `elapsedMs` is time spent in the choice phase; a correct avoid inside
 * `out.perfectWindowMs` is a perfect and out-rewards fighting.
 */
export function resolveTimedOut(
  out: TimedOut,
  value: string,
  elapsedMs: number,
  party: readonly Character[],
  rng: () => number
): TimedOutResolution {
  const render = (beats: VignetteBeat[]): string[] =>
    beats.map((b) => renderBeat(b, party, rng));

  const index = Number.parseInt(value, 10);
  const option = Number.isInteger(index) ? out.options[index] : undefined;
  if (value === "timeout" || !option) {
    return { fight: true, pages: render(out.timeoutBeats), gold: 0, perfect: false };
  }

  if (option.result === "fight") {
    return { fight: true, pages: render(option.resultBeats), gold: 0, perfect: false };
  }

  const perfect = !!option.perfect && elapsedMs <= out.perfectWindowMs;
  const pages = render(option.resultBeats);
  let gold = option.goldReward ?? 0;
  if (perfect && option.perfect) {
    pages.push(option.perfect.text);
    gold += option.perfect.gold;
  }
  return { fight: false, pages, gold, perfect };
}
