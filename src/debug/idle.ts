// Pure quiescence predicate for the ?debug=1 surface. Kept separate from
// snapshot.ts (which owns state *shape*) so main.ts's isIdle() and Vitest
// exercise the exact same decision logic — no DOM, no engine imports.
//
// "Idle" means: no pending mode-fade, no render-camera tween, no prologue or
// ending auto-play, no combat encounter/leave transition (including Phaser
// stage boot), and no unfinished combat playback choreography. Menus, camp,
// town, and combat's non-playback phases (palette/select*/result) all count
// as idle-awaiting-input on purpose.

export interface IdleCombatInput {
  phase: string;
  /** Whether the current playback choreography (if any) has finished. */
  playbackDone: boolean;
}

export interface IdleInput {
  modeTransitionPending: boolean;
  cameraAnimating: boolean;
  prologueActive: boolean;
  endingActive: boolean;
  /**
   * Encounter swirl / leave dissolve (and Phaser stage boot inside
   * startCombat). While true, mode may already be "combat" but the
   * controller is not live yet — scripts must wait.
   */
  combatTransitionActive?: boolean;
  combat: IdleCombatInput | null;
}

export function computeIdle(input: IdleInput): boolean {
  if (input.modeTransitionPending) return false;
  if (input.cameraAnimating) return false;
  if (input.prologueActive) return false;
  if (input.endingActive) return false;
  if (input.combatTransitionActive) return false;
  if (input.combat && input.combat.phase === "playback" && !input.combat.playbackDone) {
    return false;
  }
  return true;
}
