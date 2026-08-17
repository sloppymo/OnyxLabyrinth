import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MAIN = readFileSync(resolve("src/main.ts"), "utf8");

function functionBody(name: string): string {
  const start = MAIN.indexOf(`function ${name}(`);
  expect(start, `missing ${name}`).toBeGreaterThanOrEqual(0);
  const next = MAIN.slice(start + 1).search(/\nfunction /);
  return next === -1 ? MAIN.slice(start) : MAIN.slice(start, start + 1 + next);
}

describe("production input ownership", () => {
  it("registers exactly one gameplay keydown listener in main.ts", () => {
    const matches = MAIN.match(/addEventListener\(\s*"keydown"/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("does not bind a second dungeon keyboard path alongside the controller stream", () => {
    expect(MAIN).not.toMatch(/\bbindInput\s*\(/);
  });

  it("does not redispatch an event to a layer opened during that event", () => {
    expect(MAIN).not.toMatch(/if \(next !== route\)/);
    expect(MAIN).toMatch(/const overlay = uiStack\.top\(\)/);
    expect(MAIN).toMatch(/overlay\.handleInput\(event\)/);
  });

  it("does not borrow title mode to open dungeon overlays", () => {
    for (const name of [
      "openActionRing",
      "openSaveMenu",
      "openSpellMenu",
      "openNPCPanel",
      "openTavernPanel",
      "openNamandaPanel",
      "openPerkSelectOverlay",
      "openDungeonDialog",
    ]) {
      if (!MAIN.includes(`function ${name}(`)) continue;
      expect(functionBody(name), name).not.toMatch(/setMode\(\s*state,\s*"title"\s*\)/);
    }
  });

  it("does not own overlay controller instances", () => {
    expect(MAIN).not.toMatch(/\bnew (SaveController|SpellMenuController|NPCController|TavernController|NamandaController|DungeonActionRingController|PerkSelectController|DungeonDialogController|TrapPromptController)\b/);
    expect(MAIN).not.toMatch(/\b(let|const) (saveController|spellMenuController|npcController|tavernController|namandaController|actionRingController|perkSelectController|dungeonDialog|trapPrompt)\b/);
    expect(MAIN).not.toMatch(/\buiStack\.push\s*\(/);
    expect(MAIN).not.toMatch(/\bpushHandleKeyLayer\b/);
  });

  it("OverlayRuntime closes layers by id rather than blindly popping", () => {
    const runtime = readFileSync(resolve("src/engine/overlay-runtime.ts"), "utf8");
    expect(runtime).toMatch(/this\.deps\.uiStack\.close\(id\)/);
    expect(runtime).not.toMatch(/uiStack\.pop\s*\(/);
  });

  it("has no production justOpened* input guards", () => {
    expect(MAIN).not.toMatch(/\bjustOpened\w*\b/);
  });
});
