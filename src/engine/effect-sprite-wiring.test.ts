import { describe, expect, it } from "vitest";
import { readdirSync } from "fs";
import { join } from "path";
import { ALL_SPELLS } from "../data/spells";
import { resolveEffectStyle } from "./combat-scene";
import { getEffectStrip } from "./effect-sprite-cache";

type StylePick = {
  projectile?: string;
  burst?: string;
  field?: string;
  charge?: string;
};

function styleEffectIds(style: StylePick): string[] {
  return [style.projectile, style.burst, style.field, style.charge].filter(
    (id): id is string => typeof id === "string" && id.length > 0
  );
}

describe("effect sprite wiring", () => {
  it("every combat spell style points at a registered EFFECT_STRIPS id", () => {
    const missing: string[] = [];
    for (const spell of ALL_SPELLS) {
      if (
        spell.effect.kind === "light" ||
        spell.effect.kind === "levitation" ||
        spell.effect.kind === "detect"
      ) {
        continue;
      }
      const style = resolveEffectStyle(spell.id);
      for (const id of styleEffectIds(style)) {
        if (!getEffectStrip(id)) missing.push(`${spell.id} → ${id}`);
      }
    }
    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("weapon / projectile strips used by melee helpers are registered", () => {
    for (const id of [
      "wizard_attack1",
      "wizard_attack2",
      "priest_attack",
      "staff_attack",
      "slash_attack",
      "free_slash",
      "arrow",
      "arrow_archer",
      "arrow_skeleton",
    ]) {
      expect(getEffectStrip(id), id).toBeDefined();
    }
  });

  it("every url referenced by resolveEffectStyle exists on disk", () => {
    const dir = join(process.cwd(), "public/assets/effects");
    const onDisk = new Set(readdirSync(dir).filter((f) => f.endsWith(".png")));
    const urlsNeeded = new Set<string>();
    for (const spell of ALL_SPELLS) {
      if (
        spell.effect.kind === "light" ||
        spell.effect.kind === "levitation" ||
        spell.effect.kind === "detect"
      ) {
        continue;
      }
      for (const id of styleEffectIds(resolveEffectStyle(spell.id))) {
        const strip = getEffectStrip(id);
        if (strip) urlsNeeded.add(strip.url);
      }
    }
    for (const id of ["wizard_attack1", "priest_attack", "free_slash", "slash_attack"]) {
      const strip = getEffectStrip(id);
      if (strip) urlsNeeded.add(strip.url);
    }
    const missing = [...urlsNeeded].filter((u) => !onDisk.has(u));
    expect(missing).toEqual([]);
  });
});
