/**
 * Shared contract for authored fixed-camera combat plates.
 *
 * The combat arena is designed at this exact surface size. Keeping the
 * selection rule separate from the renderer makes it possible to regression
 * test the important promise: only a complete, correctly-sized F1 plate may
 * replace the procedural fallback.
 */

export const AUTHORED_ARENA_BACKDROP_THEME = "f1" as const;
export const AUTHORED_ARENA_BACKDROP_SIZE = {
  width: 768,
  height: 672,
} as const;

export interface ArenaBackdropImageLike {
  complete: boolean;
  naturalWidth: number;
  naturalHeight: number;
}
export type ArenaBackdropSource = "authored" | "procedural";

/**
 * True only for the production F1 environment plate. A loaded image with the
 * wrong dimensions is deliberately treated as a fallback rather than silently
 * stretching an accidental replacement into the combat surface.
 */
export function hasValidAuthoredArenaBackdrop(
  theme: string,
  image: ArenaBackdropImageLike | null | undefined
): boolean {
  return (
    theme === AUTHORED_ARENA_BACKDROP_THEME &&
    !!image &&
    image.complete &&
    image.naturalWidth === AUTHORED_ARENA_BACKDROP_SIZE.width &&
    image.naturalHeight === AUTHORED_ARENA_BACKDROP_SIZE.height
  );
}

/** Resolve the one authored path versus the existing procedural fallback. */
export function arenaBackdropSource(
  theme: string,
  image: ArenaBackdropImageLike | null | undefined
): ArenaBackdropSource {
  return hasValidAuthoredArenaBackdrop(theme, image) ? "authored" : "procedural";
}
