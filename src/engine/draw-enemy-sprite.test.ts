import { describe, it, expect, vi } from "vitest";
import { drawEnemySprite } from "./combat-renderer";
import { getEnemySpriteStrip } from "./enemy-sprite-cache";

vi.mock("./enemy-sprite-cache", () => ({
  getEnemySpriteStrip: vi.fn(),
}));

function makeStrip(
  frameCount = 6,
  imgW = frameCount * 100,
  imgH = 100
): ReturnType<typeof getEnemySpriteStrip> {
  return {
    strip: {
      url: "",
      frameWidth: 100,
      frameHeight: 100,
      frameCount,
      fps: 6,
      loop: true,
    },
    img: {
      naturalWidth: imgW,
      naturalHeight: imgH,
    } as HTMLImageElement,
  };
}

function makeContext(): CanvasRenderingContext2D {
  const methods = [
    "save",
    "restore",
    "fillRect",
    "strokeRect",
    "clearRect",
    "beginPath",
    "closePath",
    "moveTo",
    "lineTo",
    "quadraticCurveTo",
    "arc",
    "ellipse",
    "fill",
    "stroke",
    "drawImage",
    "translate",
    "rotate",
    "fillText",
    "setTransform",
    "measureText",
  ];
  const ctx = {} as Record<string, ReturnType<typeof vi.fn>>;
  for (const m of methods) ctx[m] = vi.fn();
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "";
  ctx.strokeStyle = "";
  ctx.lineWidth = 1;
  ctx.font = "";
  ctx.textAlign = "center";
  return ctx as unknown as CanvasRenderingContext2D;
}

function makeEnemy() {
  return {
    id: "big-titty-ogre",
    name: "Big Titty Ogre",
    floors: [4],
    rowPreference: "front",
    hp: 40,
    attack: 11,
    ac: 6,
    agi: 2,
    xp: 30,
    gold: 28,
    special: [],
    isBoss: false,
    instanceId: "e1",
    currentHp: 40,
    row: "front",
    status: [],
  };
}

function makeAnim() {
  return {
    state: "idle" as const,
    stateStart: 0,
    progress: 0,
    opacity: 1,
  };
}

describe("drawEnemySprite", () => {
  it("does not throw with an empty cache (procedural fallback)", () => {
    vi.mocked(getEnemySpriteStrip).mockReturnValue(null);
    const ctx = makeContext();
    const enemy = makeEnemy();
    expect(() => drawEnemySprite(ctx, 100, 100, enemy, makeAnim(), 0, false, 0)).not.toThrow();
  });

  it("does not throw when a sprite strip is present", () => {
    vi.mocked(getEnemySpriteStrip).mockReturnValue(makeStrip(6, 600, 100));
    const ctx = makeContext();
    const enemy = makeEnemy();
    expect(() => drawEnemySprite(ctx, 100, 100, enemy, makeAnim(), 0, false, 0)).not.toThrow();
  });

  it("does not throw when the cached image reports zero size", () => {
    vi.mocked(getEnemySpriteStrip).mockReturnValue(makeStrip(6, 0, 0));
    const ctx = makeContext();
    const enemy = makeEnemy();
    expect(() => drawEnemySprite(ctx, 100, 100, enemy, makeAnim(), 0, false, 0)).not.toThrow();
  });
});
