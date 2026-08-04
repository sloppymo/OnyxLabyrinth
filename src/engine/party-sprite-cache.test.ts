import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * FakeImage that reports a configurable strip size per URL so we can test
 * frame-count derivation (width / 100) and the missing-cast fallback.
 */
let sizeForUrl: (url: string) => { w: number; h: number } | null;
let requestedUrls: string[];

class FakeImage {
  naturalWidth = 0;
  naturalHeight = 0;
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private _src = "";

  set src(value: string) {
    this._src = value;
    requestedUrls.push(value);
    queueMicrotask(() => {
      const size = sizeForUrl(value);
      if (!size) {
        this.onerror?.(new Event("error"));
        return;
      }
      this.naturalWidth = size.w;
      this.naturalHeight = size.h;
      this.onload?.(new Event("load"));
    });
  }

  get src(): string {
    return this._src;
  }
}

describe("party-sprite-cache", () => {
  let originalImage: typeof Image | undefined;

  beforeEach(() => {
    originalImage = globalThis.Image;
    globalThis.Image = FakeImage as unknown as typeof Image;
    requestedUrls = [];
    // Default: every requested state exists; attack is 7 frames, others 6.
    sizeForUrl = (url) => {
      if (url.includes("attack")) return { w: 700, h: 100 };
      return { w: 600, h: 100 };
    };
    vi.resetModules();
  });

  afterEach(() => {
    if (originalImage) globalThis.Image = originalImage;
  });

  it("returns null before the bundle loads", async () => {
    const { getPartySpriteStrip } = await import("./party-sprite-cache");
    expect(getPartySpriteStrip("Fighter", "idle")).toBeNull();
  });

  it("derives frame count from strip width after loading", async () => {
    const { loadPartySprites, getPartySpriteStrip } = await import(
      "./party-sprite-cache"
    );
    await loadPartySprites();
    const idle = getPartySpriteStrip("Fighter", "idle");
    expect(idle).not.toBeNull();
    expect(idle!.strip.frameCount).toBe(6);
    expect(idle!.strip.frameWidth).toBe(100);
    const attack = getPartySpriteStrip("Fighter", "attack");
    expect(attack!.strip.frameCount).toBe(7);
    expect(attack!.strip.loop).toBe(false);
    expect(idle!.strip.loop).toBe(true);
  });

  it("falls back from cast to attack when cast is missing", async () => {
    sizeForUrl = (url) => {
      if (url.includes("cast")) return null; // e.g. fighter has no cast strip
      if (url.includes("attack")) return { w: 700, h: 100 };
      return { w: 600, h: 100 };
    };
    const { loadPartySprites, getPartySpriteStrip } = await import(
      "./party-sprite-cache"
    );
    await loadPartySprites();
    const cast = getPartySpriteStrip("Fighter", "cast");
    expect(cast).not.toBeNull();
    expect(cast!.strip.frameCount).toBe(7); // the attack strip
  });

  it("falls back from attack_ranged to attack when ranged strip is missing", async () => {
    sizeForUrl = (url) => {
      if (url.includes("attack_ranged")) return null;
      if (url.includes("attack")) return { w: 700, h: 100 };
      return { w: 600, h: 100 };
    };
    const { loadPartySprites, getPartySpriteStrip } = await import(
      "./party-sprite-cache"
    );
    await loadPartySprites();
    const ranged = getPartySpriteStrip("Fighter", "attack_ranged");
    expect(ranged).not.toBeNull();
    expect(ranged!.strip.frameCount).toBe(7);
  });

  it("loads a distinct attack_ranged strip when present", async () => {
    sizeForUrl = (url) => {
      if (url.includes("attack_ranged")) return { w: 900, h: 100 };
      if (url.includes("attack")) return { w: 1200, h: 100 };
      return { w: 600, h: 100 };
    };
    const { loadPartySprites, getPartySpriteStrip } = await import(
      "./party-sprite-cache"
    );
    await loadPartySprites();
    const melee = getPartySpriteStrip("Thief", "attack");
    const ranged = getPartySpriteStrip("Thief", "attack_ranged");
    expect(melee!.strip.frameCount).toBe(12);
    expect(ranged!.strip.frameCount).toBe(9);
    expect(ranged!.strip.url).toContain("attack_ranged");
  });

  it("requests only optional strips that ship for each class", async () => {
    const { loadPartySprites } = await import("./party-sprite-cache");
    await loadPartySprites();

    const optionalUrls = requestedUrls.filter(
      (url) => url.includes("/cast.png") || url.includes("/attack_ranged.png")
    );
    expect(optionalUrls).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/mage/cast.png"),
        expect.stringContaining("/priest/cast.png"),
        expect.stringContaining("/thief/attack_ranged.png"),
      ])
    );
    expect(optionalUrls).toHaveLength(3);
  });

  it("returns null for a state whose image failed to load", async () => {
    sizeForUrl = (url) => (url.includes("hurt") ? null : { w: 600, h: 100 });
    const { loadPartySprites, getPartySpriteStrip } = await import(
      "./party-sprite-cache"
    );
    await loadPartySprites();
    expect(getPartySpriteStrip("Mage", "hurt")).toBeNull();
    expect(getPartySpriteStrip("Mage", "idle")).not.toBeNull();
  });

  it("rejects strips with a bad height", async () => {
    sizeForUrl = () => ({ w: 600, h: 120 }); // not 100 px tall
    const { loadPartySprites, getPartySpriteStrip } = await import(
      "./party-sprite-cache"
    );
    await loadPartySprites();
    expect(getPartySpriteStrip("Priest", "idle")).toBeNull();
  });

  it("covers every character class", async () => {
    const { loadPartySprites, getPartySpriteStrip, PARTY_SPRITE_DIRS } =
      await import("./party-sprite-cache");
    await loadPartySprites();
    for (const cls of Object.keys(PARTY_SPRITE_DIRS) as Array<
      keyof typeof PARTY_SPRITE_DIRS
    >) {
      expect(getPartySpriteStrip(cls, "idle")).not.toBeNull();
    }
  });
});
