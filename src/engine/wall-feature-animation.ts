/** Pure timing helper for fixed wall-feature frame sequences. */
export function wallFeatureFrameIndex(
  timeSeconds: number,
  fps: number,
  frameCount: number,
  phase = 0
): number {
  if (!Number.isFinite(timeSeconds) || !Number.isFinite(fps) || fps <= 0 || frameCount <= 0) return 0;
  const tick = Math.floor((timeSeconds + phase) * fps);
  return ((tick % frameCount) + frameCount) % frameCount;
}
