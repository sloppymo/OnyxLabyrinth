import { describe, it, expect, vi } from "vitest";
import { drawEnemySprite } from "./combat-renderer";
import { getEnemySprite } from "./enemy-sprite-cache";

vi.mock("./enemy-sprite-cache", () => ({
  getEnemySprite: vi.fn(),
}));

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
    vi.mocked(getEnemySprite).mockReturnValue(undefined);
    const ctx = makeContext();
    const enemy = makeEnemy();
    expect(() => drawEnemySprite(ctx, 100, 100, enemy, makeAnim(), 0, false, 0)).not.toThrow();
  });

  it("does not throw when an image sprite is present", () => {
    vi.mocked(getEnemySprite).mockReturnValue({
      naturalWidth: 256,
      naturalHeight: 256,
    } as HTMLImageElement);
    const ctx = makeContext();
    const enemy = makeEnemy();
    expect(() => drawEnemySprite(ctx, 100, 100, enemy, makeAnim(), 0, false, 0)).not.toThrow();
  });

  it("does not throw when the cached image reports zero size", () => {
    vi.mocked(getEnemySprite).mockReturnValue({
      naturalWidth: 0,
      naturalHeight: 0,
    } as HTMLImageElement);
    const ctx = makeContext();
    const enemy = makeEnemy();
    expect(() => drawEnemySprite(ctx, 100, 100, enemy, makeAnim(), 0, false, 0)).not.toThrow();
  });
});
