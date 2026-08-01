/**
 * Background keying for sprite art that ships without an alpha channel.
 *
 * The original map-decor pack (`public/assets/map-sprites/*.png`) is 8-bit RGB
 * with a flat near-black background baked in. Billboarding those straight
 * through `ctx.drawImage` paints the background too, so a barrel one tile away
 * drew as an opaque black square over the corridor. These helpers turn the
 * baked background back into transparency at load time.
 *
 * The fill starts from the image border and only spreads through pixels that
 * match the sampled background, so an interior pocket of the same colour (a
 * gap between barrel staves, an eye socket) stays opaque. That matters because
 * `docs/MAZE-EVENT-SPRITE-PROMPT.md` asks new props for a near-black 1px
 * outline, which can legitimately equal the background colour.
 *
 * Pure and DOM-free so it can be unit-tested without a canvas.
 */

/** Per-channel distance allowed when matching a pixel to the background. */
export const DEFAULT_KEY_TOLERANCE = 10;

/** Alpha at or above this counts as "opaque" when probing for an alpha channel. */
const OPAQUE_ALPHA = 250;

/**
 * True when the image already carries real transparency, in which case it must
 * be left alone. Art authored with an alpha channel (or an explicit chroma
 * cleanup) is already correct; keying it again could eat legitimate pixels.
 */
export function hasAlphaChannel(data: Uint8ClampedArray | number[]): boolean {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]! < OPAQUE_ALPHA) return true;
  }
  return false;
}

/**
 * The background colour, or `null` when the four corners disagree.
 *
 * Requiring agreement is the guard against keying an image that simply happens
 * to have dark art in one corner: an ambiguous sample means "don't touch it".
 */
export function sampleBackgroundColor(
  data: Uint8ClampedArray | number[],
  width: number,
  height: number,
  tolerance: number = DEFAULT_KEY_TOLERANCE
): [number, number, number] | null {
  if (width <= 0 || height <= 0) return null;
  const at = (x: number, y: number): [number, number, number] => {
    const i = (y * width + x) << 2;
    return [data[i]!, data[i + 1]!, data[i + 2]!];
  };
  const corners: [number, number, number][] = [
    at(0, 0),
    at(width - 1, 0),
    at(0, height - 1),
    at(width - 1, height - 1),
  ];
  const first = corners[0]!;
  for (const c of corners) {
    if (!withinTolerance(c, first, tolerance)) return null;
  }
  return first;
}

function withinTolerance(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  tolerance: number
): boolean {
  return (
    Math.abs(a[0] - b[0]) <= tolerance &&
    Math.abs(a[1] - b[1]) <= tolerance &&
    Math.abs(a[2] - b[2]) <= tolerance
  );
}

/**
 * Flood-fill the background colour to transparent, starting from every border
 * pixel. Mutates `data` in place and returns the number of pixels cleared.
 *
 * Returns 0 (and leaves `data` untouched) when the image already has an alpha
 * channel or when the corners disagree about what the background is.
 */
export function keyOutBackground(
  data: Uint8ClampedArray | number[],
  width: number,
  height: number,
  tolerance: number = DEFAULT_KEY_TOLERANCE
): number {
  if (width <= 0 || height <= 0) return 0;
  if (hasAlphaChannel(data)) return 0;
  const bg = sampleBackgroundColor(data, width, height, tolerance);
  if (!bg) return 0;

  const matches = (idx: number): boolean =>
    Math.abs(data[idx]! - bg[0]) <= tolerance &&
    Math.abs(data[idx + 1]! - bg[1]) <= tolerance &&
    Math.abs(data[idx + 2]! - bg[2]) <= tolerance;

  // Explicit stack rather than recursion: a 128x128 sprite can queue >16k
  // pixels and blowing the call stack at asset-load time would be silent.
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (seen[p]) return;
    seen[p] = 1;
    if (!matches(p << 2)) return;
    stack.push(p);
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  let cleared = 0;
  while (stack.length) {
    const p = stack.pop()!;
    data[(p << 2) + 3] = 0;
    cleared++;
    const x = p % width;
    const y = (p / width) | 0;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }
  return cleared;
}
