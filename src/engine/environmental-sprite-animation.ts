export type EnvironmentalGaze = "south" | "center" | "north";

export interface EnvironmentalFrameInput {
  playerY: number;
  spriteCenterY: number;
  nowMs: number;
  speaking: boolean;
}

export function environmentalGaze(input: Pick<EnvironmentalFrameInput, "playerY" | "spriteCenterY">): EnvironmentalGaze {
  if (input.playerY > input.spriteCenterY + 1) return "south";
  if (input.playerY < input.spriteCenterY - 1) return "north";
  return "center";
}

/**
 * Abyss face sheet layout:
 * 0–2 idle gaze S/C/N, 3 blink, 4–6 small mouth, 7–9 open, 10–12 wide.
 */
export function resolveEnvironmentalFrame(input: EnvironmentalFrameInput): number {
  const gaze = environmentalGaze(input);
  const gazeIndex = gaze === "south" ? 0 : gaze === "center" ? 1 : 2;
  if (!input.speaking) {
    const blinkClock = ((input.nowMs % 6700) + 6700) % 6700;
    return blinkClock >= 6480 ? 3 : gazeIndex;
  }
  const mouthPhase = Math.floor(input.nowMs / 135) % 4;
  if (mouthPhase === 0) return gazeIndex;
  if (mouthPhase === 1 || mouthPhase === 3) return 4 + gazeIndex;
  return (Math.floor(input.nowMs / 540) % 2 === 0 ? 7 : 10) + gazeIndex;
}
