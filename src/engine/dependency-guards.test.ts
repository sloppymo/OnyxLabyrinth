import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (full.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function isProductionSource(path: string): boolean {
  return !path.endsWith(".test.ts");
}

function hasMathRandomCallOutsideComments(content: string): boolean {
  let inBlock = false;
  for (const raw of content.split("\n")) {
    let line = raw;

    if (inBlock) {
      const end = line.indexOf("*/");
      if (end !== -1) {
        line = line.slice(end + 2);
        inBlock = false;
      } else {
        continue;
      }
    }

    let start = line.indexOf("/*");
    while (start !== -1) {
      const end = line.indexOf("*/", start + 2);
      if (end !== -1) {
        line = line.slice(0, start) + line.slice(end + 2);
      } else {
        line = line.slice(0, start);
        inBlock = true;
        break;
      }
      start = line.indexOf("/*");
    }

    const comment = line.indexOf("//");
    if (comment !== -1) {
      line = line.slice(0, comment);
    }

    if (/Math\.random\(\)/.test(line)) {
      return true;
    }
  }
  return false;
}

describe("dependency guards", () => {
  it("does not allow production game/ or data/ code to import from engine/", () => {
    const engineImportPattern =
      /(?:from\s+|import\s*\(\s*)["'](?:\.\.\/)*engine\/[^"']*["']/g;

    for (const base of ["game", "data"]) {
      const dir = resolve(ROOT, base);
      for (const file of walk(dir)) {
        if (!isProductionSource(file)) continue;
        const content = readFileSync(file, "utf-8");
        const matches = Array.from(content.matchAll(engineImportPattern));
        expect(matches, `${file}`).toHaveLength(0);
      }
    }
  });

  it("does not allow production game/ or data/ code to call Math.random()", () => {
    const allowed = new Set([resolve(ROOT, "game/rng.ts")]);

    for (const base of ["game", "data"]) {
      const dir = resolve(ROOT, base);
      for (const file of walk(dir)) {
        if (!isProductionSource(file)) continue;
        if (allowed.has(file)) continue;
        const content = readFileSync(file, "utf-8");
        expect(
          hasMathRandomCallOutsideComments(content),
          `${file} must not call Math.random() directly; use the gameplay RNG`,
        ).toBe(false);
      }
    }
  });
});
