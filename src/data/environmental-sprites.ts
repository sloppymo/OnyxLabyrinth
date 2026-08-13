/** Registered animation sheets for large fixed world-space set pieces. */

export interface EnvironmentalSpriteAsset {
  id: string;
  file: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
}

export const ENVIRONMENTAL_SPRITES: readonly EnvironmentalSpriteAsset[] = [
  {
    id: "abyss-face",
    file: "abyss-face.png",
    frameWidth: 160,
    frameHeight: 160,
    frameCount: 13,
  },
];

export function environmentalSpriteUrl(asset: EnvironmentalSpriteAsset): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return `${base}assets/environmental-sprites/${asset.file}`;
}

export function getEnvironmentalSpriteAsset(
  id: string
): EnvironmentalSpriteAsset | undefined {
  return ENVIRONMENTAL_SPRITES.find((asset) => asset.id === id);
}
