/**
 * Combat presentation stage — shared facade over canvas and Phaser painters.
 *
 * Both backends share combat-choreography.ts (playTurn / updateScene).
 * Phaser must be loaded only via dynamic import (see combat-phaser-stage.ts);
 * this module stays jsdom-safe for tests.
 */

import type { CombatEvent, CombatState } from "../game/combat-types";
import {
  createScene,
  setCombatSceneState,
  updateScene,
  playTurn,
  isPlaybackDone,
  absorbDeaths,
  skipPlaybackToEnd,
  setBossIntroNameplate,
  type CombatScene,
  type SceneCursor,
} from "./combat-scene";
import { renderScene } from "./combat-scene";
import { combatCanvas, combatCtx } from "./shell";
import { COMBAT_DESIGN_W, COMBAT_DESIGN_H } from "./combat-scene-math";

export interface CombatStage {
  /** Shared scene model — groundPlaneProbe / debug read this. */
  readonly scene: CombatScene;

  setState(s: CombatState): void;
  absorbDeaths(s: CombatState): void;

  setActiveActor(id: string | null): void;
  setCursor(c: SceneCursor | null): void;
  setPlaybackRate(rate: number): void;
  setCues(o: { fast: boolean; auto: boolean }): void;
  clearBanner(): void;
  setBossIntroNameplate(name: string, durationMs: number, bossId?: string): void;

  playTurn(
    events: CombatEvent[],
    spellNameFor: (id: string) => string,
    techniqueNameFor: (id: string) => string,
    now: number
  ): number;
  isPlaybackDone(now: number): boolean;
  skipPlaybackToEnd(now: number): void;

  /** Update choreography clock only (no paint). */
  update(now: number): void;
  /** Paint current scene. */
  paint(now: number): void;
  /** update + paint. Prefer split update/paint when a done-check sits between. */
  tick(now: number): void;
  snapshotCanvas(): HTMLCanvasElement | null;
  /** Idempotent. */
  destroy(): void;
}

export type CombatStageKind = "canvas" | "phaser";

/**
 * Resolve which stage to use.
 * Until Phase 5 flip: default canvas; `?phaser=1` enables Phaser.
 * After Phase 5: default Phaser; `?phaser=0` rolls back to canvas.
 */
export function resolveCombatStageKind(
  search = typeof location !== "undefined" ? location.search : ""
): CombatStageKind {
  const q = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  // Phase 5: default Phaser; `?phaser=0` rolls back to canvas.
  const PHASER_DEFAULT = true;
  if (q.has("phaser")) {
    const v = q.get("phaser");
    if (v === "0" || v === "false") return "canvas";
    // bare ?phaser=1 or ?phaser → phaser
    return "phaser";
  }
  return PHASER_DEFAULT ? "phaser" : "canvas";
}

export interface CreateCombatStageOpts {
  state: CombatState;
  backdrop?: HTMLCanvasElement | null;
  backdropId?: string | null;
  kind?: CombatStageKind;
}

/** Sync canvas stage — always available (tests + default path). */
export function createCanvasCombatStage(
  opts: CreateCombatStageOpts
): CombatStage {
  const scene = createScene(opts.state);
  scene.backdrop = opts.backdrop ?? null;
  scene.backdropId =
    opts.backdropId ?? (opts.backdrop ? "arena" : "combat-bg");

  let destroyed = false;

  return {
    scene,
    setState(s) {
      setCombatSceneState(scene, s);
    },
    absorbDeaths(s) {
      absorbDeaths(scene, s);
    },
    setActiveActor(id) {
      scene.activeActorId = id;
    },
    setCursor(c) {
      scene.cursor = c;
    },
    setPlaybackRate(rate) {
      scene.playbackRate = rate;
    },
    setCues(o) {
      scene.showFastCue = o.fast;
      scene.showAutoCue = o.auto;
    },
    clearBanner() {
      scene.banner = null;
    },
    setBossIntroNameplate(name, durationMs, bossId) {
      setBossIntroNameplate(scene, name, performance.now(), durationMs, bossId);
    },
    playTurn(events, spellNameFor, techniqueNameFor, now) {
      return playTurn(
        scene,
        events,
        spellNameFor,
        now,
        COMBAT_DESIGN_W,
        COMBAT_DESIGN_H,
        techniqueNameFor
      );
    },
    isPlaybackDone(now) {
      return isPlaybackDone(scene, now);
    },
    skipPlaybackToEnd(now) {
      skipPlaybackToEnd(scene, now);
    },
    tick(now) {
      this.update(now);
      this.paint(now);
    },
    update(now) {
      updateScene(scene, now);
    },
    paint(now) {
      if (destroyed) return;
      // Canvas visibility is CSS-owned; don't fight #combat-wrap.phaser-stage.
      renderScene(
        combatCtx,
        combatCanvas.width || COMBAT_DESIGN_W,
        combatCanvas.height || COMBAT_DESIGN_H,
        scene,
        now
      );
    },
    snapshotCanvas() {
      return combatCanvas;
    },
    destroy() {
      destroyed = true;
    },
  };
}

/**
 * Create the stage for a fight. Phaser path is async (dynamic import).
 * Canvas path resolves immediately.
 */
export async function createCombatStage(
  opts: CreateCombatStageOpts
): Promise<CombatStage> {
  const kind = opts.kind ?? resolveCombatStageKind();
  if (kind === "phaser") {
    try {
      // Flip CSS before the heavy dynamic import so the sticky 2d canvas
      // doesn't flash during Phaser boot.
      const wrap = document.querySelector("#combat-wrap");
      wrap?.classList.add("phaser-stage");
      const mod = await import("./combat-phaser-stage");
      return await mod.createPhaserCombatStage(opts);
    } catch (err) {
      console.warn(
        "[combat] Phaser stage failed; falling back to canvas",
        err
      );
      document.querySelector("#combat-wrap")?.classList.remove("phaser-stage");
      return createCanvasCombatStage(opts);
    }
  }
  return createCanvasCombatStage(opts);
}
