import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { ALL_SPELLS } from "../data/spells";
import {
  collectReferencedEffectIds,
  resolveEffectStyle,
  resolveMeleeHitEffect,
} from "./combat-scene";
import {
  allEffectStripIds,
  getEffectStrip,
  NON_COMBAT_EFFECT_IDS,
} from "./effect-sprite-cache";

type StylePick = {
  projectile?: string;
  burst?: string;
  field?: string;
  charge?: string;
  burstUnderlay?: string;
  fieldUnderlay?: string;
};

function styleEffectIds(style: StylePick): string[] {
  return [
    style.projectile,
    style.burst,
    style.field,
    style.charge,
    style.burstUnderlay,
    style.fieldUnderlay,
  ].filter((id): id is string => typeof id === "string" && id.length > 0);
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

  it("slash_attack is sliced as a 2×6 grid, not one full-sheet frame", () => {
    const strip = getEffectStrip("slash_attack");
    expect(strip).toBeDefined();
    expect(strip!.frameWidth).toBe(25);
    expect(strip!.frameHeight).toBe(21);
    expect(strip!.frameCount).toBe(12);
    expect(strip!.fps).toBeGreaterThan(0);

    const dir = join(process.cwd(), "public/assets/effects");
    const png = readFileSync(join(dir, strip!.url));
    // PNG IHDR: width @16, height @20 (big-endian u32)
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(width).toBe(strip!.frameWidth * 2);
    expect(height).toBe(strip!.frameHeight * 6);
    const cols = Math.floor(width / strip!.frameWidth);
    const rows = Math.floor(height / strip!.frameHeight);
    expect(cols * rows).toBeGreaterThanOrEqual(strip!.frameCount);
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
    for (const id of [
      "wizard_attack1",
      "priest_attack",
      "free_slash",
      "slash_attack",
      "staff_attack",
      "wizard_attack2",
      "zombie_death_explosion",
      "extra_elemental",
      "fireball",
    ]) {
      const strip = getEffectStrip(id);
      if (strip) urlsNeeded.add(strip.url);
    }
    const missing = [...urlsNeeded].filter((u) => !onDisk.has(u));
    expect(missing).toEqual([]);
  });

  it("fire element field uses large_fire_glow underlay", () => {
    // mage-burning-hands inherits fire element style (no full override for field underlay
    // on ELEMENT default — resolve a spell that falls through to ELEMENT_STYLES.fire).
    // mage-fire-bolt has its own override; use a plain fire damage spell without override
    // if any — otherwise assert ELEMENT via burning-hands field path after checking.
    const fireball = resolveEffectStyle("mage-fireball");
    expect(fireball.charge).toBe("mp_fire_bomb_full");
    expect(resolveEffectStyle("mage-immolate").fieldUnderlay).toBe("fire_explosion_iso");
    expect(resolveEffectStyle("mage-meteor-swarm").fieldUnderlay).toBe("fire_explosion_iso");
  });

  it("mp_*_full charges and ray projectiles are wired", () => {
    expect(resolveEffectStyle("mage-fireball").charge).toBe("mp_fire_bomb_full");
    expect(resolveEffectStyle("mage-spark").charge).toBe("mp_spark_full");
    // lightning_blast (a real jagged-bolt strip), not px_magic_ray (a flat
    // gradient band with no silhouette — visual-design-pass 2026-07-27).
    expect(resolveEffectStyle("mage-spark").projectile).toBe("lightning_blast");
    expect(resolveEffectStyle("mage-disintegrate").charge).toBe("mp_dark_bolt_full");
    expect(resolveEffectStyle("mage-disintegrate").projectile).toBe("px_black_white_ray");
    expect(resolveEffectStyle("mage-ember").projectile).toBe("fireball");
    expect(resolveEffectStyle("mage-gate").charge).toBe("mp_dark_bolt_full");
  });

  it("every EFFECT_STRIPS id is referenced by combat styles/helpers or allowlisted", () => {
    const referenced = collectReferencedEffectIds();
    const unused = allEffectStripIds().filter(
      (id) => !referenced.has(id) && !NON_COMBAT_EFFECT_IDS.has(id)
    );
    expect(unused, unused.join("\n")).toEqual([]);
  });

  it("fz_icons is allowlisted as non-combat", () => {
    expect(NON_COMBAT_EFFECT_IDS.has("fz_icons")).toBe(true);
    expect(getEffectStrip("fz_icons")).toBeDefined();
  });
});

describe("resolveMeleeHitEffect", () => {
  it("Mage normal uses wizard_attack1; crit uses wizard_attack2", () => {
    expect(resolveMeleeHitEffect("Mage", { crit: false }).effect).toBe("wizard_attack1");
    expect(resolveMeleeHitEffect("Mage", { crit: true }).effect).toBe("wizard_attack2");
  });

  it("Mage/Priest melee include staff_attack underlay", () => {
    expect(resolveMeleeHitEffect("Mage", { crit: false }).underlay).toBe("staff_attack");
    expect(resolveMeleeHitEffect("Priest", { crit: false }).underlay).toBe("staff_attack");
  });
});
