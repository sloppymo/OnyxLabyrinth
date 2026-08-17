import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MAIN = readFileSync(resolve("src/main.ts"), "utf8");

describe("production input ownership", () => {
  it("registers exactly one gameplay keydown listener in main.ts", () => {
    const matches = MAIN.match(/addEventListener\(\s*"keydown"/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("does not bind a second dungeon keyboard path alongside the controller stream", () => {
    expect(MAIN).not.toMatch(/\bbindInput\s*\(/);
  });
});
