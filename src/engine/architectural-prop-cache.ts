import type { ArchitecturalPropDef } from "../data/floors";

export type ArchitecturalPropImage = HTMLImageElement | HTMLCanvasElement;

const cache = new Map<string, ArchitecturalPropImage | null>();
let loadPromise: Promise<void> = Promise.resolve();

function imageUrl(texture: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return `${base}assets/architectural-props/${texture}`;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

export function loadArchitecturalProps(props: readonly ArchitecturalPropDef[]): Promise<void> {
  const textures = [...new Set(props.map((prop) => prop.texture))]
    .filter((texture) => !cache.has(texture));
  if (!textures.length) return loadPromise;
  loadPromise = loadPromise.then(() => Promise.all(textures.map(async (texture) => {
      cache.set(texture, await loadImage(imageUrl(texture)));
    })).then(() => undefined));
  return loadPromise;
}

export function getArchitecturalPropImage(texture: string): ArchitecturalPropImage | null {
  return cache.get(texture) ?? null;
}

export function clearArchitecturalPropCache(): void {
  cache.clear();
  loadPromise = Promise.resolve();
}
