import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

class FakeImage {
  src = "";
  naturalWidth = 256;
  naturalHeight = 256;
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor() {
    // Simulate async image load so the caller-set onload handler fires.
    queueMicrotask(() => this.onload?.(new Event("load")));
  }
}

describe("enemy-sprite-cache", () => {
  let originalImage: typeof Image | undefined;

  beforeEach(() => {
    originalImage = globalThis.Image;
    globalThis.Image = FakeImage as unknown as typeof Image;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalImage) globalThis.Image = originalImage;
  });

  it("returns undefined before loadEnemySprites resolves", async () => {
    const { getEnemySprite } = await import("./enemy-sprite-cache");
    expect(getEnemySprite("big-titty-ogre")).toBeUndefined();
  });

  it("returns an image after loadEnemySprites resolves", async () => {
    const { loadEnemySprites, getEnemySprite } = await import("./enemy-sprite-cache");
    const cache = await loadEnemySprites();
    const sprite = getEnemySprite("big-titty-ogre");
    expect(sprite).toBeInstanceOf(FakeImage);
    expect(cache.get("big-titty-ogre")).toBe(sprite);
  });

  it("returns undefined for unknown enemy ids", async () => {
    const { loadEnemySprites, getEnemySprite } = await import("./enemy-sprite-cache");
    await loadEnemySprites();
    expect(getEnemySprite("unknown-id")).toBeUndefined();
  });

  it("resolves an explicit authored sprite alias", async () => {
    const { enemySpriteId } = await import("./enemy-sprite-cache");
    expect(enemySpriteId({ id: "crypt-ogre", spriteId: "big-titty-ogre" })).toBe(
      "big-titty-ogre"
    );
    expect(enemySpriteId({ id: "slime" })).toBe("slime");
  });
});
