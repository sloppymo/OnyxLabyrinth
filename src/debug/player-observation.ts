// Player-facing observation for embodied AI playtesting.
//
// Epistemic boundary: this module constructs a PlayerObservation POSITIVELY
// from presentation fields. It must never spread an omniscient Snapshot or
// GameState. If a human could not obtain a field by looking at the current
// rendered game, reading its text, listening, or remembering something shown
// earlier in this run, it does not belong here.
//
// Debug/forensic state (coordinates, exact enemy HP, keys, topology, RNG,
// warnings, availableActions, floor ids, item ids, …) lives in snapshot.ts
// and must stay there.

import type { ControllerRouteKind } from "../engine/controller-route";

export const PLAYER_OBSERVATION_SCHEMA = 1 as const;

/** Player-visible screen. Overlay ids are mapped to what the player is looking at. */
export type PlayerScreen =
  | "title"
  | "prologue"
  | "party_creation"
  | "town"
  | "dungeon"
  | "combat"
  | "camp"
  | "game_over"
  | "ending"
  | "arena"
  | "save"
  | "grimoire"
  | "npc"
  | "tavern"
  | "church"
  | "trap"
  | "perk"
  | "dialog"
  | "action_ring";

export interface PlayerPartyMember {
  name: string;
  /** Only when the current screen actually prints the class. */
  class?: string;
  /** Only when the current screen prints a level. */
  levelText?: string;
  /** Exact numerals when the HUD/roster shows them (e.g. "34/41"). */
  hpText?: string;
  spText?: string;
  rageText?: string;
  row?: "Front" | "Back";
  visibleStatus: string[];
  acting?: boolean;
}

export interface PlayerEnemy {
  displayName: string;
  count?: number;
  /** Qualitative descriptor only — never exact HP. Omitted if the UI does not show it. */
  visibleHealth?: string;
  visibleStatus: string[];
  extraTags?: string[];
}

export interface PlayerMenuEntry {
  label: string;
  detail?: string;
  disabled?: boolean;
}

export interface PlayerMenu {
  title?: string;
  entries: PlayerMenuEntry[];
  selectedIndex: number;
  footer?: string;
  /** Second footer line (gold, resources). */
  footer2?: string;
  flash?: string;
}

export interface PlayerAudioCue {
  /** Player-facing cue label (spy namespaces like `proc:` are stripped). */
  cue: string;
  atMs: number;
  durationMs: number | null;
  /** True when a sample-backed cue fired with no buffer — the player heard silence. */
  silent: boolean;
}

export interface PlayerVisual {
  changed: boolean;
  kind: "none" | "still" | "compact" | "full" | "contactSheet";
}

export interface PlayerObservation {
  schema: typeof PLAYER_OBSERVATION_SCHEMA;
  screen: PlayerScreen;
  /** HUD location chrome as rendered, e.g. "F1 · N". */
  heading?: string;
  /** HUD danger chrome as rendered, e.g. "● Hot ▮▮▮". */
  danger?: string;
  message?: string;
  bark?: { speaker: string; text: string };
  /** Contextual interact prompt currently on screen, e.g. "U Unlock". */
  prompt?: string;
  party?: PlayerPartyMember[];
  goldText?: string;
  /** Status/description window body (camp roster, shop compare, prologue). */
  bodyText?: string;
  menu?: PlayerMenu;
  enemies?: PlayerEnemy[];
  combatLog?: string[];
  result?: { title: string; lines: string[] };
  /** Control hints currently printed on this screen. */
  hints?: string[];
  /** Cumulative controls the player has actually been shown this run. */
  learnedControls: string[];
  mapOpen?: boolean;
  audioSummary?: string;
  audioDelta?: PlayerAudioCue[];
  timing?: { actionToIdleMs: number };
  visual?: PlayerVisual;
}

/**
 * Presentation input assembled by the debug-gated gatherer. Every field is
 * something already shown (or just heard) — never a raw GameState slice.
 */
export interface PlayerPresentationInput {
  screen: PlayerScreen;
  heading?: string;
  danger?: string;
  message?: string;
  bark?: { speaker: string; text: string };
  prompt?: string;
  party?: PlayerPartyMember[];
  goldText?: string;
  bodyText?: string;
  menu?: PlayerMenu;
  enemies?: PlayerEnemy[];
  combatLog?: string[];
  result?: { title: string; lines: string[] };
  hints?: string[];
  learnedControls?: string[];
  mapOpen?: boolean;
  audioDelta?: PlayerAudioCue[];
  timing?: { actionToIdleMs: number };
  visual?: PlayerVisual;
}

export interface PlayerObservationDelta {
  schema: typeof PLAYER_OBSERVATION_SCHEMA;
  screen: PlayerScreen;
  changed: Partial<Omit<PlayerObservation, "schema" | "screen" | "learnedControls">>;
  unchanged: string[];
  learnedControls: string[];
  audioDelta?: PlayerAudioCue[];
  audioSummary?: string;
  timing?: { actionToIdleMs: number };
  visual?: PlayerVisual;
}

const STABLE_KEYS = [
  "heading",
  "danger",
  "message",
  "bark",
  "prompt",
  "party",
  "goldText",
  "bodyText",
  "menu",
  "enemies",
  "combatLog",
  "result",
  "hints",
  "mapOpen",
] as const;

/** Map the input-owning route to a player-visible screen name. */
export function playerScreenForRoute(route: ControllerRouteKind): PlayerScreen {
  switch (route) {
    case "spell":
      return "grimoire";
    case "namanda":
      return "church";
    case "none":
      return "dungeon";
    default:
      return route;
  }
}

function omitEmptyString(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function cloneParty(members: PlayerPartyMember[] | undefined): PlayerPartyMember[] | undefined {
  if (!members || members.length === 0) return undefined;
  return members.map((m) => ({
    name: m.name,
    ...(m.class ? { class: m.class } : {}),
    ...(m.levelText ? { levelText: m.levelText } : {}),
    ...(m.hpText ? { hpText: m.hpText } : {}),
    ...(m.spText ? { spText: m.spText } : {}),
    ...(m.rageText ? { rageText: m.rageText } : {}),
    ...(m.row ? { row: m.row } : {}),
    visibleStatus: [...m.visibleStatus],
    ...(m.acting ? { acting: true } : {}),
  }));
}

function cloneEnemies(enemies: PlayerEnemy[] | undefined): PlayerEnemy[] | undefined {
  if (!enemies || enemies.length === 0) return undefined;
  return enemies.map((e) => ({
    displayName: e.displayName,
    ...(e.count !== undefined ? { count: e.count } : {}),
    ...(e.visibleHealth ? { visibleHealth: e.visibleHealth } : {}),
    visibleStatus: [...e.visibleStatus],
    ...(e.extraTags && e.extraTags.length > 0 ? { extraTags: [...e.extraTags] } : {}),
  }));
}

function cloneMenu(menu: PlayerMenu | undefined): PlayerMenu | undefined {
  if (!menu) return undefined;
  return {
    ...(menu.title ? { title: menu.title } : {}),
    entries: menu.entries.map((entry) => ({
      label: entry.label,
      ...(entry.detail ? { detail: entry.detail } : {}),
      ...(entry.disabled ? { disabled: true } : {}),
    })),
    selectedIndex: menu.selectedIndex,
    ...(menu.footer ? { footer: menu.footer } : {}),
    ...(menu.footer2 ? { footer2: menu.footer2 } : {}),
    ...(menu.flash ? { flash: menu.flash } : {}),
  };
}

function cloneAudio(cues: PlayerAudioCue[] | undefined): PlayerAudioCue[] | undefined {
  if (!cues || cues.length === 0) return undefined;
  return cues.map((c) => ({
    cue: publicCueLabel(c.cue),
    atMs: c.atMs,
    durationMs: c.durationMs,
    silent: c.silent,
  }));
}

export function summarizeAudio(cues: PlayerAudioCue[] | undefined): string | undefined {
  if (!cues || cues.length === 0) return undefined;
  const labels = cues.map((c) => {
    const name = publicCueLabel(c.cue);
    return c.silent ? `${name} (silent)` : name;
  });
  return `AUDIO: ${labels.join(" -> ")}`;
}

/** Collapse namespaced spy ids into a short player-facing label. */
export function publicCueLabel(cue: string): string {
  const trimmed = cue.replace(/^(ui|combat|dungeon|proc):/, "");
  return trimmed.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").toLowerCase();
}

/**
 * Construct a player observation from presentation fields only.
 * Never pass a debug Snapshot into this function.
 */
export function buildPlayerObservation(input: PlayerPresentationInput): PlayerObservation {
  const audioDelta = cloneAudio(input.audioDelta);
  const observation: PlayerObservation = {
    schema: PLAYER_OBSERVATION_SCHEMA,
    screen: input.screen,
    learnedControls: [...(input.learnedControls ?? [])],
  };

  const heading = omitEmptyString(input.heading);
  if (heading) observation.heading = heading;
  const danger = omitEmptyString(input.danger);
  if (danger) observation.danger = danger.replace(/^\s*·\s*/, "");
  const message = omitEmptyString(input.message);
  if (message) observation.message = message;
  if (input.bark && (input.bark.speaker || input.bark.text)) {
    observation.bark = { speaker: input.bark.speaker, text: input.bark.text };
  }
  const prompt = omitEmptyString(input.prompt);
  if (prompt) observation.prompt = prompt;
  const party = cloneParty(input.party);
  if (party) observation.party = party;
  const goldText = omitEmptyString(input.goldText);
  if (goldText) observation.goldText = goldText;
  const bodyText = omitEmptyString(input.bodyText);
  if (bodyText) observation.bodyText = bodyText;
  const menu = cloneMenu(input.menu);
  if (menu) observation.menu = menu;
  const enemies = cloneEnemies(input.enemies);
  if (enemies) observation.enemies = enemies;
  if (input.combatLog && input.combatLog.length > 0) {
    observation.combatLog = [...input.combatLog];
  }
  if (input.result) {
    observation.result = { title: input.result.title, lines: [...input.result.lines] };
  }
  if (input.hints && input.hints.length > 0) {
    observation.hints = [...input.hints];
  }
  if (input.mapOpen) observation.mapOpen = true;
  const audioSummary = summarizeAudio(audioDelta);
  if (audioSummary) observation.audioSummary = audioSummary;
  if (audioDelta) observation.audioDelta = audioDelta;
  if (input.timing) observation.timing = { ...input.timing };
  if (input.visual) observation.visual = { ...input.visual };

  return observation;
}

function stableEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Compact delta against the previous observation. Timing, audio, and visual
 * always travel with the action even when the rest of the screen is unchanged.
 */
export function diffPlayerObservation(
  previous: PlayerObservation | null,
  next: PlayerObservation
): PlayerObservationDelta {
  const changed: PlayerObservationDelta["changed"] = {};
  const unchanged: string[] = [];

  if (!previous) {
    for (const key of STABLE_KEYS) {
      if (next[key] !== undefined) changed[key] = next[key] as never;
    }
    return {
      schema: PLAYER_OBSERVATION_SCHEMA,
      screen: next.screen,
      changed,
      unchanged,
      learnedControls: [...next.learnedControls],
      ...(next.audioDelta ? { audioDelta: next.audioDelta } : {}),
      ...(next.audioSummary ? { audioSummary: next.audioSummary } : {}),
      ...(next.timing ? { timing: next.timing } : {}),
      ...(next.visual ? { visual: next.visual } : {}),
    };
  }

  if (previous.screen !== next.screen) {
    // Screen change: treat all present fields as changed so a new context
    // does not have to reconstruct from a stale previous screen.
    for (const key of STABLE_KEYS) {
      if (next[key] !== undefined) changed[key] = next[key] as never;
    }
  } else {
    for (const key of STABLE_KEYS) {
      const prevVal = previous[key];
      const nextVal = next[key];
      if (nextVal === undefined && prevVal === undefined) {
        unchanged.push(key);
        continue;
      }
      if (stableEqual(prevVal, nextVal)) {
        unchanged.push(key);
      } else if (nextVal !== undefined) {
        changed[key] = nextVal as never;
      } else {
        changed[key] = undefined as never;
      }
    }
  }

  return {
    schema: PLAYER_OBSERVATION_SCHEMA,
    screen: next.screen,
    changed,
    unchanged,
    learnedControls: [...next.learnedControls],
    ...(next.audioDelta ? { audioDelta: next.audioDelta } : {}),
    ...(next.audioSummary ? { audioSummary: next.audioSummary } : {}),
    ...(next.timing ? { timing: next.timing } : {}),
    ...(next.visual ? { visual: next.visual } : {}),
  };
}

/** Reconstruct a full observation from a previous full obs + a delta. */
export function applyPlayerObservationDelta(
  previous: PlayerObservation | null,
  delta: PlayerObservationDelta
): PlayerObservation {
  const base: PlayerPresentationInput = previous
    ? {
        screen: delta.screen,
        heading: previous.heading,
        danger: previous.danger,
        message: previous.message,
        bark: previous.bark,
        prompt: previous.prompt,
        party: previous.party,
        goldText: previous.goldText,
        bodyText: previous.bodyText,
        menu: previous.menu,
        enemies: previous.enemies,
        combatLog: previous.combatLog,
        result: previous.result,
        hints: previous.hints,
        mapOpen: previous.mapOpen,
      }
    : { screen: delta.screen };

  base.screen = delta.screen;
  const bag = base as unknown as Record<string, unknown>;
  for (const key of STABLE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(delta.changed, key)) {
      const value = delta.changed[key];
      if (value === undefined) {
        delete bag[key];
      } else {
        bag[key] = value;
      }
    }
  }
  base.learnedControls = delta.learnedControls;
  base.audioDelta = delta.audioDelta;
  base.timing = delta.timing;
  base.visual = delta.visual;
  return buildPlayerObservation(base);
}

const PROHIBITED_KEY_RE =
  /\b(floorId|pos|explored|unlockedDoors|availableActions|warnings|perkIds|knownSpellIds|itemId|rng|jumpTo|tileId|questFlags|deepestFloorReached|stepsSinceEncounter|killedNPCs|npcDisposition|lootTaken|eventsTriggered|actingCharId)\b/;

/**
 * Defensive leak check used by tests and the harness. Returns matching
 * prohibited tokens found in the serialized observation.
 */
export function findProhibitedPlayerFields(observation: unknown): string[] {
  const json = JSON.stringify(observation);
  const found = new Set<string>();
  const keyRe = /"([A-Za-z0-9_]+)"\s*:/g;
  let match: RegExpExecArray | null;
  while ((match = keyRe.exec(json))) {
    const key = match[1];
    if (PROHIBITED_KEY_RE.test(key)) found.add(key);
  }
  // Exact enemy HP as a numeric `hp` field (party uses hpText instead).
  if (/"hp"\s*:\s*\d+/.test(json) || /"maxHp"\s*:\s*\d+/.test(json)) {
    found.add("hp");
  }
  if (/"x"\s*:\s*\d+/.test(json) && /"y"\s*:\s*\d+/.test(json)) {
    found.add("coordinates");
  }
  if (/\b(proc|ui|combat|dungeon):/.test(json)) {
    found.add("audioSpyId");
  }
  return [...found];
}
