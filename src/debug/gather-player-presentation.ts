/**
 * Assemble PlayerPresentationInput from already-visible chrome.
 * Pure of GameState: callers pass presentation snippets, never a Snapshot.
 */

import type { ControllerRouteKind } from "../engine/controller-route";
import type { CombatPlayerView } from "./combat-player-view";
import {
  buildPlayerObservation,
  playerScreenForRoute,
  type PlayerAudioCue,
  type PlayerObservation,
  type PlayerPartyMember,
  type PlayerPresentationInput,
  type PlayerVisual,
} from "./player-observation";
import type { PlayerMenu } from "./player-observation";

export interface HudChrome {
  location: string;
  danger: string;
  controls: string;
  visible: boolean;
}

export interface GatherPresentationInput {
  route: ControllerRouteKind;
  message: { text: string; visible: boolean };
  hud?: HudChrome | null;
  partyStrip?: PlayerPartyMember[];
  prompt?: string | null;
  bark?: { speaker: string; text: string } | null;
  mapOpen?: boolean;
  goldText?: string | null;
  bodyText?: string | null;
  menu?: PlayerMenu | null;
  combat?: CombatPlayerView | null;
  audioDelta?: PlayerAudioCue[];
  timing?: { actionToIdleMs: number };
  visual?: PlayerVisual;
  learnedControls?: string[];
}

export function gatherPlayerPresentation(input: GatherPresentationInput): PlayerObservation {
  const screen = playerScreenForRoute(input.route);
  const presentation: PlayerPresentationInput = {
    screen,
    learnedControls: input.learnedControls ?? [],
  };

  if (input.hud?.visible) {
    if (input.hud.location.trim()) presentation.heading = input.hud.location.trim();
    if (input.hud.danger.trim()) presentation.danger = input.hud.danger.trim();
  }
  if (input.message.visible && input.message.text.trim()) {
    presentation.message = input.message.text.trim();
  }
  if (input.prompt?.trim()) presentation.prompt = input.prompt.trim();
  if (input.bark && (input.bark.speaker || input.bark.text)) presentation.bark = input.bark;
  if (input.mapOpen) presentation.mapOpen = true;
  if (input.goldText?.trim()) presentation.goldText = input.goldText.trim();
  if (input.bodyText?.trim()) presentation.bodyText = input.bodyText.trim();
  if (input.menu) presentation.menu = input.menu;
  if (input.menu?.footer2 && /gold/i.test(input.menu.footer2) && !presentation.goldText) {
    presentation.goldText = input.menu.footer2;
  }
  if (input.audioDelta) presentation.audioDelta = input.audioDelta;
  if (input.timing) presentation.timing = input.timing;
  if (input.visual) presentation.visual = input.visual;

  const hints: string[] = [];
  if (input.hud?.visible && input.hud.controls.trim()) hints.push(input.hud.controls.trim());
  if (input.menu?.footer) hints.push(input.menu.footer);

  if (screen === "combat" && input.combat) {
    presentation.party = input.combat.party;
    presentation.enemies = input.combat.enemies;
    if (input.combat.menu) presentation.menu = input.combat.menu;
    if (input.combat.combatLog) presentation.combatLog = input.combat.combatLog;
    if (input.combat.result) presentation.result = input.combat.result;
    if (input.combat.hints) hints.push(...input.combat.hints);
  } else if (input.partyStrip && input.partyStrip.length > 0) {
    presentation.party = input.partyStrip;
  }

  if (hints.length > 0) presentation.hints = hints;

  return buildPlayerObservation(presentation);
}
