import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeImage {
  naturalWidth = 0;
  naturalHeight = 0;
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private value = "";

  set src(value: string) {
    this.value = value;
    queueMicrotask(() => {
      this.naturalWidth = value.includes("old-man/idle") ? 100 : 700;
      this.naturalHeight = 100;
      this.onload?.(new Event("load"));
    });
  }

  get src(): string {
    return this.value;
  }
}

describe("Card Trial hero sprite cache", () => {
  let originalImage: typeof Image | undefined;

  beforeEach(() => {
    originalImage = globalThis.Image;
    globalThis.Image = FakeImage as unknown as typeof Image;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalImage) globalThis.Image = originalImage;
  });

  it("is empty before loading and rejects non-Card-Trial actor ids", async () => {
    const { getCardTrialHeroSpriteStrip } = await import("./card-trial-hero-sprite-cache");
    expect(getCardTrialHeroSpriteStrip("rat-king", "idle")).toBeNull();
    expect(getCardTrialHeroSpriteStrip("c1", "idle")).toBeNull();
  });

  it("loads only the two authored heroes with derived frame counts", async () => {
    const {
      getCardTrialHeroSpriteStrip,
      loadCardTrialHeroSprites,
    } = await import("./card-trial-hero-sprite-cache");
    const bundles = await loadCardTrialHeroSprites();
    expect([...bundles.keys()]).toEqual(["rat-king", "old-man"]);
    expect(getCardTrialHeroSpriteStrip("rat-king", "attack")?.strip.frameCount).toBe(7);
    expect(getCardTrialHeroSpriteStrip("old-man", "idle")?.strip.frameCount).toBe(1);
  });

  it("carries authored foot/head geometry into every renderer", async () => {
    const {
      getCardTrialHeroSpriteStrip,
      loadCardTrialHeroSprites,
    } = await import("./card-trial-hero-sprite-cache");
    await loadCardTrialHeroSprites();
    const rat = getCardTrialHeroSpriteStrip("rat-king", "idle")!.strip;
    const oldMan = getCardTrialHeroSpriteStrip("old-man", "idle")!.strip;
    expect(rat.artFootFromTop).toBe(0.65);
    expect(rat.artTopFromTop).toBe(0.34);
    expect(oldMan.artFootFromTop).toBe(0.7);
    expect(oldMan.artTopFromTop).toBe(0.3);
    expect(rat.frameWidth).toBe(100);
    expect(oldMan.frameHeight).toBe(100);
  });
});
