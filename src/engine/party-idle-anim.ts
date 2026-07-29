/**
 * Shared idle strip frame-stepper for party sprites (party-select carousel,
 * equip sheet, etc.). Mirror stays on CSS scaleX(-1); this only translates
 * the strip horizontally.
 */

import type { CharacterClass } from "../game/party";
import { getPartySpriteStrip } from "./party-sprite-cache";

const IDLE_FPS = 6;
const SPRITE_FRAME_PX = 100;

export function prefersReducedMotion(): boolean {
  const mm = globalThis.matchMedia;
  if (typeof mm !== "function") return false;
  return mm.call(globalThis, "(prefers-reduced-motion: reduce)").matches;
}

export type PartyIdleAnimHandle = { stop: () => void };

/**
 * Animate all `.party-sprite-tile--anim` under `root`.
 * No-ops (does not register rAF) when `prefers-reduced-motion: reduce`.
 */
export function startPartyIdleAnim(
  root: ParentNode,
  opts?: { isActive?: () => boolean }
): PartyIdleAnimHandle {
  let rafId: number | null = null;
  let stopped = false;

  const stop = (): void => {
    stopped = true;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  if (prefersReducedMotion()) {
    return { stop };
  }

  const startedAt = performance.now();
  const isActive = opts?.isActive ?? (() => true);

  const tick = (now: number): void => {
    rafId = null;
    if (stopped || !isActive()) return;
    const elapsed = (now - startedAt) / 1000;
    const tiles = root.querySelectorAll<HTMLElement>(".party-sprite-tile--anim");
    for (const tile of tiles) {
      const cls = tile.dataset.cls as CharacterClass | undefined;
      if (!cls) continue;
      const loaded = getPartySpriteStrip(cls, "idle");
      const frameCount = loaded?.strip.frameCount ?? 1;
      const fps = loaded?.strip.fps ?? IDLE_FPS;
      const frameIndex = Math.floor(elapsed * fps) % frameCount;
      const img = tile.querySelector("img");
      if (img) {
        const tileW = tile.clientWidth || SPRITE_FRAME_PX;
        img.style.transform = `translateX(${-frameIndex * tileW}px)`;
      }
    }
    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);
  return { stop };
}
