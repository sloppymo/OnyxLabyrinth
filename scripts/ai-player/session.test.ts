import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("ai-player session hot path", () => {
  it("does not insert arbitrary multi-second sleeps in playtest_key", () => {
    const src = fs.readFileSync(path.resolve("scripts/ai-player/session.ts"), "utf8");
    const start = src.indexOf("async key(");
    const end = src.indexOf("async observe(");
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const keyFn = src.slice(start, end);
    expect(keyFn).toMatch(/waitForIdle|isIdle|waitForHarnessSettle/);
    expect(keyFn).not.toMatch(/wait\(\s*[2-9]\d{3,}\s*\)/);
    expect(keyFn).not.toMatch(/wait\(\s*1\d{3,}\s*\)/);
  });

  it("lets prologue accept keys instead of waiting out the cinematic", () => {
    const src = fs.readFileSync(path.resolve("scripts/ai-player/session.ts"), "utf8");
    expect(src).toMatch(/route === "prologue"/);
    expect(src).toMatch(/waitForHarnessSettle/);
  });

  it("emits relative screenshot names rather than home-directory paths", () => {
    const src = fs.readFileSync(path.resolve("scripts/ai-player/session.ts"), "utf8");
    expect(src).toMatch(/playerFacingPayload/);
    expect(src).toMatch(/path\.basename\(result\.screenshotPath\)/);
  });
});
