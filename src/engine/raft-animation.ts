/**
 * Raft route animation controller.
 *
 * Implements automatic dock-to-dock raft traversal (Zelda-style). When
 * the player steps onto a fromDock tile from the fromApproach direction
 * while possessing the raft key item, the route triggers: input locks,
 * the party animates along the path, and arrives at toDock.
 *
 * Safety properties:
 * - The authoritative player position stays at the origin dock until
 *   the animation completes, then commits to the destination.
 * - On interruption (e.g. tab blur), the player is restored to the
 *   nearest dock, never on a water tile.
 * - Saving is disabled while the animation is active (the caller must
 *   check isRaftAnimating() before allowing saves).
 * - No encounters, events, or pity accumulation during crossing.
 */

import type { GameState } from "../types";
import type { RaftRouteDef } from "../data/floors";

export interface RaftAnimationOptions {
  state: GameState;
  route: RaftRouteDef;
  reverse: boolean;
  /** Called when the animation completes (player at destination). */
  onComplete: () => void;
  /** Called if the animation is interrupted (player restored to dock). */
  onInterrupt?: () => void;
}

/** Step duration in milliseconds for each tile in the path. */
const RAFT_STEP_MS = 200;

export class RaftAnimationController {
  private state: GameState;
  private route: RaftRouteDef;
  private reverse: boolean;
  private onComplete: () => void;
  private onInterrupt?: () => void;

  private active = false;
  private startTime = 0;
  private originX: number;
  private originY: number;
  private destX: number;
  private destY: number;
  private destFacing: number;

  /** The path tiles in traversal order (origin → destination). */
  private path: { x: number; y: number }[];

  constructor(opts: RaftAnimationOptions) {
    this.state = opts.state;
    this.route = opts.route;
    this.reverse = opts.reverse;
    this.onComplete = opts.onComplete;
    this.onInterrupt = opts.onInterrupt;

    // Build the traversal path. Forward: fromDock → toDock.
    // Reverse: toDock → fromDock (reversed path).
    this.path = this.reverse
      ? [...opts.route.path].reverse()
      : [...opts.route.path];

    // Origin and destination from the path.
    this.originX = this.path[0].x;
    this.originY = this.path[0].y;
    const dest = this.path[this.path.length - 1];
    this.destX = dest.x;
    this.destY = dest.y;

    // Facing after arrival: the toApproach direction (forward) or
    // fromApproach direction (reverse).
    const facingName = this.reverse ? opts.route.fromApproach : opts.route.toApproach;
    this.destFacing = ["n", "e", "s", "w"].indexOf(facingName);
  }

  /** Start the raft animation. Locks input by setting mode to "dialog". */
  start(): void {
    this.active = true;
    this.startTime = performance.now();
    this.state.mode = "dialog";
    // Keep the authoritative player position at the origin dock.
    this.state.player.x = this.originX;
    this.state.player.y = this.originY;
  }

  /** True if the raft animation is currently active. */
  isActive(): boolean {
    return this.active;
  }

  /** Current visual position of the raft (for rendering). Returns the
   *  interpolated tile position, or null if not active. */
  getVisualPosition(): { x: number; y: number } | null {
    if (!this.active) return null;
    const elapsed = performance.now() - this.startTime;
    const totalSteps = this.path.length - 1;
    const totalMs = totalSteps * RAFT_STEP_MS;
    const t = Math.min(1, elapsed / totalMs);

    // Interpolate along the path.
    const floatStep = t * totalSteps;
    const stepIdx = Math.floor(floatStep);
    const frac = floatStep - stepIdx;

    if (stepIdx >= totalSteps) {
      const last = this.path[this.path.length - 1];
      return { x: last.x, y: last.y };
    }

    const a = this.path[stepIdx];
    const b = this.path[stepIdx + 1];
    return {
      x: a.x + (b.x - a.x) * frac,
      y: a.y + (b.y - a.y) * frac,
    };
  }

  /** Update the animation. Call this every frame. Returns true if still
   *  active, false if completed or interrupted. */
  update(): boolean {
    if (!this.active) return false;
    const elapsed = performance.now() - this.startTime;
    const totalSteps = this.path.length - 1;
    const totalMs = totalSteps * RAFT_STEP_MS;

    if (elapsed >= totalMs) {
      // Animation complete — commit destination.
      this.state.player.x = this.destX;
      this.state.player.y = this.destY;
      this.state.player.facing = this.destFacing as GameState["player"]["facing"];
      this.state.mode = "dungeon";
      this.active = false;
      this.onComplete();
      return false;
    }

    return true;
  }

  /** Interrupt the animation (e.g. on tab blur). Restores the player
   *  to the nearest dock (origin or destination, whichever is closer
   *  to the current visual position). */
  interrupt(): void {
    if (!this.active) return;
    const vis = this.getVisualPosition();
    if (vis) {
      // Determine which dock is closer.
      const distOrigin = Math.abs(vis.x - this.originX) + Math.abs(vis.y - this.originY);
      const distDest = Math.abs(vis.x - this.destX) + Math.abs(vis.y - this.destY);
      if (distOrigin < distDest) {
        this.state.player.x = this.originX;
        this.state.player.y = this.originY;
      } else {
        this.state.player.x = this.destX;
        this.state.player.y = this.destY;
        this.state.player.facing = this.destFacing as GameState["player"]["facing"];
      }
    } else {
      this.state.player.x = this.originX;
      this.state.player.y = this.originY;
    }
    this.state.mode = "dungeon";
    this.active = false;
    this.onInterrupt?.();
  }

  /** The route being animated. */
  getRoute(): RaftRouteDef {
    return this.route;
  }

  /** Whether this is the reverse traversal. */
  isReverse(): boolean {
    return this.reverse;
  }
}

/** True if a raft animation is currently active in the given controller
 *  (or null if no controller exists). */
export function isRaftAnimating(controller: RaftAnimationController | null): boolean {
  return controller?.isActive() ?? false;
}
