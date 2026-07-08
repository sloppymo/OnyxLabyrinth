import ogreUrl from "../assets/enemy_big_titty_ogre.png";

const SPRITE_BY_ENEMY_ID: Record<string, { url: string }> = {
  "big-titty-ogre": { url: ogreUrl },
};

let cache: Map<string, HTMLImageElement | null> | null = null;
let loadPromise: Promise<Map<string, HTMLImageElement | null>> | null = null;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // graceful fallback to procedural
    img.src = src;
  });
}

export function loadEnemySprites(): Promise<Map<string, HTMLImageElement | null>> {
  if (cache) return Promise.resolve(cache);
  if (loadPromise) return loadPromise;
  loadPromise = Promise.all(
    Object.entries(SPRITE_BY_ENEMY_ID).map(async ([id, { url }]) => [id, await loadImage(url)] as const)
  ).then((entries) => {
    cache = new Map(entries);
    return cache;
  });
  return loadPromise;
}

export function getEnemySprite(id: string): HTMLImageElement | null | undefined {
  return cache?.get(id);
}
