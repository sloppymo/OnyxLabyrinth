# Unused Combat VFX (+ Layered SFX) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire every registered-but-unplayed effect strip under `public/assets/effects/` into combat presentation, and add safe multi-cue combat SFX layering on cast/hit/charge/death — without changing combat math.

**Architecture:** Extend `EffectStyle` with optional underlay/layer fields so glow twins and charge telegraphs stack on existing bursts without replacing them. Extend `combat-audio.ts` so one `CombatEvent` can emit 1–3 leaf `playCombatSfx` calls (gain-ducked), never wrapping wrappers (audio-spy double-count rule). Keep `effect-sprite-cache.ts` as the sole strip registry; mapping lives in `combat-scene.ts` + a small melee/death helper.

**Tech Stack:** TypeScript, Vite, Vitest, existing FF6 combat scene (`combat-scene.ts`), `combat-audio.ts`, `audio.ts` leaf emitters, Arena + `?debug=1` audio spy.

## Global Constraints

- **Presentation-only.** No damage, SP, targeting, encounter-rate, or save-format changes (AGENTS.md hard rule). Enemy `special: [{ kind: "undead" }]` may be *read* for death VFX selection — that is display routing, not combat math.
- **No corridor renderer changes.** Combat canvas / windows only.
- **Typos fail silently** to procedural rings — every wiring task must update `effect-sprite-wiring.test.ts` and do an Arena visual check.
- **Leaf-only audio spy.** Patch / call only `audio.playCombatSfx` (and existing procedural leaves). Never also patch `playCombatEventSound` or friendly wrappers.
- **Repo owner commits.** Do **not** `git add` / `git commit` / push unless the user explicitly asks. Task "Commit" steps below are optional checkpoints for the human.
- **Scale math** (from `docs/superpowers/specs/2026-07-12-vfx-integration-plan.md`): projectile ≈ 45px, burst ≈ 130px, field target ÷ `(nativeW * 2)` because field draw doubles scale. Engine does **not** tint strips.
- **Supersedes leftover gaps** from `docs/superpowers/plans/2026-07-14-effect-sprite-utilization-plan.md` (M1–M3 landed; glow twins / mp_*_full / rays / particles / death sibling still open).

---

## Design decisions (brainstorm → locked)

### Approaches considered

| | Approach | Pros | Cons |
|---|----------|------|------|
| A | Remap only — swap primary `burst`/`charge` strings | Tiny diff | Loses currently-good primaries; no true layering; glow twins replace rather than enrich |
| **B (chosen)** | Add `burstUnderlay` / `charge` upgrades + `idsForEvent(): CombatSfxId[]` | Keeps live looks; stacks glow/charge; matches "layer multiple sounds" ask; still YAGNI | Small API surface in two files |
| C | Full VFX timeline composer (tracks, blend modes, cue sheets) | Maximum flexibility | Overbuilt for 22 IDs; high regression risk on choreography |

**Chosen: B.** One underlay slot per stage is enough for glow twins; `mp_*_full` becomes `charge` (their blue lead-in frames exist specifically for that); particles use high `burstCount` / small scale, not a new particle engine.

### Per-ID primary use (every unused ID)

| ID | Decision | Primary use |
|----|----------|-------------|
| `wizard_attack2` | **Wire** | Mage melee **crit** hit burst (normal stays `wizard_attack1`) |
| `staff_attack` | **Wire** | Static underlay behind Mage/Priest melee (fps 0 pose flash, scale ~0.9, short duration) |
| `zombie_death_explosion` | **Wire** | Extra death burst when defeated target is undead (`special` kind undead) — sibling of live `zombie_explosion` |
| `fireball` | **Wire** | Tiny classic projectile for `mage-ember` trail (keep `px_fireball` as primary; add as 2nd projectile via `projectileCount` + style override **or** burn-tick spark at impact — prefer ember secondary projectile) |
| `fire_explosion_glow` | **Wire** | `burstUnderlay` under generic/`fire_explosion` fallbacks and burn ticks |
| `fire_explosion_iso` | **Wire** | Fire **AoE field** alternate (Immolate / Meteor field twin layer) |
| `fire_explosion_iso_glow` | **Wire** | Underlay under `fire_explosion_iso` field |
| `large_fire_glow` | **Wire** | Underlay under ELEMENT fire `field: large_fire` |
| `lightning_blast_glow` | **Wire** | Underlay / charge glow for lightning (ELEMENT charge becomes this; keep `lightning_blast` as projectile) |
| `ice_burst_grey` | **Wire** | Slow-status burst + cold T1 quieter field (`mage-frostbite` field or STATUS slow) |
| `elemental_v1` | **Wire** | Summon flourish particles (small scale, high count) behind portal |
| `elemental_v2` | **Wire** | Alternate summon / BAMORDI vs SOCORDI visual split if two summons exist; else stagger with v1 |
| `extra_elemental` | **Wire** | Multi-hit technique / cleave spark sprinkles at impact |
| `extra_elemental_glow` | **Wire** | Underlay for `extra_elemental` on crit techniques |
| `mp_fire_bomb_full` | **Wire** | Fire mid/high **charge** telegraph (`mage-fireball`, `mage-immolate`) — full strip includes blue charge ring that trimmed `mp_fire_bomb` removed |
| `mp_lightning_full` | **Wire** | Lightning **charge** (`mage-lightning` / chain / ELEMENT lightning) |
| `mp_spark_full` | **Wire** | Arcane/spark **charge** (`mage-spark`) |
| `mp_dark_bolt_full` | **Wire** | Dark **charge** (`mage-disintegrate`, `mage-gate`) |
| `px_black_white_ray` | **Wire** | Projectile for `mage-disintegrate` / silence-adjacent dark ray |
| `px_black_white_sparks` | **Wire** | Burst for Analyze / silence / fizzle sparkle |
| `px_magic_ray` | **Wire** | Projectile for `mage-arcane-ward` poke / arcane bolt ladder |
| `fz_icons` | **Skip** | Static icon atlas (`fps: 0`), not a combat anim. Keep registered for vignette browsing; exclude from combat preload in P5; never use as burst |

### Layered SFX recipes (families)

| Moment | Layer 1 (full gain) | Layer 2 (gainMul ≈ 0.45–0.55) | Layer 3 (optional, ≤0.35) | Cap |
|--------|---------------------|-------------------------------|---------------------------|-----|
| Physical hit | `attackHit` / `criticalHit` | — | — | 1 |
| Mage/Priest melee | `attackHit` | `elementDivine` (priest) or soft `elementPhysical` | — | 2 |
| Crit mage melee | `criticalHit` | `elementPhysical` | — | 2 |
| Element cast | `element*` | — | — | 1 |
| Element cast + charge telegraph (mp_*_full wired) | `element*` | `bossPhase` (charge whoosh — already mapped to telegraph) at low gain **only if** style has `charge` from mp_*_full | — | 2 |
| Ultimate AoE (meteor/immolate/storm) | `element*` | `burnTick` or matching element tick at low gain | — | 2 |
| Undead death | `enemyDefeated` / `bossDefeated` | `statusPoison` soft (miasma) | — | 2 |
| Analyze / silence spark | `analyze` / `silence` | `fizzle` soft | — | 2 |
| Technique | `technique` | `attackHit` on hit events (existing separate events already fire both — **do not** double inside one event) | — | per-event |

**Anti-double-count rules:**

1. `idsForEvent` returns the full list for **one** event. Callers still iterate events once.
2. Never also call the old single-id path.
3. Audio spy records each `playCombatSfx` — that is intended for layers; playtests assert `sounds()` contains both ids, not that count === event count.
4. Do not play element SFX again on every `spellEffect` damage line if `cast` already played it (current code already returns null for plain damage `spellEffect` — keep that).

### Game-logic touch?

| Need | Verdict |
|------|---------|
| Crit → `wizard_attack2` | **No** — `CombatEvent` already has `crit` |
| Undead death VFX | **Read-only** — look up enemy def `special` / id from scene state on `defeated` |
| Charge duration for 15-frame strips | **Presentation** — raise `CAST_MS` / charge duration only if Arena shows truncated charge (prefer style `burstDurationMs` / charge duration field, not combat turn length) |
| New SFX WAV files | **Not required** for v1 — reuse catalog with gain ducking |

---

## File map

| File | Responsibility |
|------|----------------|
| `src/engine/combat-scene.ts` | `EffectStyle` underlay fields; `pushBursts` / field / charge / melee / death wiring; `SPELL_OVERRIDES` / `ELEMENT_STYLES` / status |
| `src/engine/combat-audio.ts` | `idsForEvent` → multi-play; layer recipes |
| `src/engine/audio.ts` | Optional `gainMul` on `playCombatSfx` only |
| `src/engine/effect-sprite-cache.ts` | Optional CORE vs OPTIONAL preload; `fz_icons` → optional |
| `src/engine/effect-sprite-wiring.test.ts` | Guardrails: every live id registered; inventory unused→0 (except allowlisted skip) |
| `src/engine/combat-audio.test.ts` | New: layer lists / caps / no double element on spellEffect |
| `src/debug/audio-spy.ts` | No change expected (already leaf-patches `playCombatSfx`) |

---

## Phasing overview

| Phase | Theme | IDs |
|-------|-------|-----|
| **P0** | Melee alts | `wizard_attack2`, `staff_attack` |
| **P1** | Layered glow twins | `fire_explosion_glow`, `fire_explosion_iso`, `fire_explosion_iso_glow`, `large_fire_glow`, `lightning_blast_glow`, `ice_burst_grey` |
| **P2** | `mp_*_full` charge telegraphs | `mp_fire_bomb_full`, `mp_lightning_full`, `mp_spark_full`, `mp_dark_bolt_full` + layered SFX foundation |
| **P3** | Rays | `px_black_white_ray`, `px_black_white_sparks`, `px_magic_ray` |
| **P4** | Particles / death / tiny fireball | `elemental_v1/v2`, `extra_elemental(_glow)`, `zombie_death_explosion`, `fireball` |
| **P5** | Skip + boot hygiene | `fz_icons` exclude from preload; unused-count regression test |

---

### Task 1 (P0): Melee alts — `wizard_attack2` + `staff_attack`

**Files:**
- Modify: `src/engine/combat-scene.ts` (`meleeEffectForActor`, melee impact path ~1890–1960, `impactSteps` if needed for dual burst)
- Test: `src/engine/combat-scene.test.ts` and/or `src/engine/effect-sprite-wiring.test.ts`

**Interfaces:**
- Consumes: existing `crit` on attack/ambush/techniqueHit events; `meleeEffectForActor(className)`
- Produces: `meleeEffectForActor(className, opts?: { crit?: boolean }): { effect: string; scale: number; underlay?: string; underlayScale?: number }`

- [ ] **Step 1: Write the failing test**

Add to `src/engine/combat-scene.test.ts` (export `meleeEffectForActor` for tests, or test via a thin exported helper `resolveMeleeHitEffect`):

```ts
import { resolveMeleeHitEffect } from "./combat-scene";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/combat-scene.test.ts -t resolveMeleeHitEffect`
Expected: FAIL — `resolveMeleeHitEffect` not exported / wrong mapping.

- [ ] **Step 3: Implement**

```ts
export function resolveMeleeHitEffect(
  className: string | undefined,
  opts: { crit?: boolean } = {}
): { effect: string; scale: number; underlay?: string; underlayScale?: number } {
  if (className === "Mage") {
    return {
      effect: opts.crit ? "wizard_attack2" : "wizard_attack1",
      scale: opts.crit ? 1.25 : 1.1,
      underlay: "staff_attack",
      underlayScale: 0.85,
    };
  }
  if (className === "Priest") {
    return {
      effect: "priest_attack",
      scale: 1.1,
      underlay: "staff_attack",
      underlayScale: 0.85,
    };
  }
  if (className === "Fighter" || className === "Duelist") {
    return { effect: "free_slash", scale: 1.4 };
  }
  return { effect: "slash_attack", scale: 4 };
}
```

In the attack/ambush/techniqueHit branch, replace `meleeEffectForActor(...)` with `resolveMeleeHitEffect(attacker?.class, { crit: evt.crit === true })`. When pushing the hit burst in `impactSteps` (or the call site), also push underlay:

```ts
if (hit.underlay) {
  scene.effects.push({
    type: "burst",
    x: actor.x,
    y: actor.y,
    color,
    effect: hit.underlay,
    scale: hit.underlayScale ?? 1,
    start: now,
    duration: 280,
  });
}
```

Prefer extending `impactSteps` with optional `underlay`/`underlayScale` rather than duplicating push logic. Keep `staff_attack` duration short — it is a single static frame.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/engine/combat-scene.test.ts src/engine/effect-sprite-wiring.test.ts`
Expected: PASS.

- [ ] **Step 5: Arena verify**

Arena → Mage auto-attack several times; force a crit (or debug high-crit). Confirm `wizard_attack2` animates on crit, staff pose flashes under both Mage/Priest hits, no bottom-window clip (burst centered on sprite mid).

- [ ] **Step 6: Optional commit**

```bash
# Only if user asked to commit
git add src/engine/combat-scene.ts src/engine/combat-scene.test.ts
git commit -m "$(cat <<'EOF'
feat(combat): wire mage crit and staff melee underlays

EOF
)"
```

---

### Task 2 (P2 foundation): Layered combat SFX API

Do this before or with P2 charges so charge telegraphs can ride the same path. **Presentation/audio only.**

**Files:**
- Modify: `src/engine/audio.ts` (`playCombatSfx`)
- Modify: `src/engine/combat-audio.ts`
- Create: `src/engine/combat-audio.test.ts`

**Interfaces:**
- Consumes: existing `CombatSfxId`, `CombatEvent`, `CombatState`
- Produces:
  - `playCombatSfx(id: CombatSfxId, opts?: { gainMul?: number }): void`
  - `idsForEvent(event, state): Array<{ id: CombatSfxId; gainMul?: number }>`
  - `playCombatEventSound` plays every entry via the leaf

- [ ] **Step 1: Write the failing tests**

```ts
// src/engine/combat-audio.test.ts
import { describe, expect, it } from "vitest";
import { idsForEvent } from "./combat-audio";
import type { CombatState } from "../game/combat-types";

function bareState(partial: Partial<CombatState> = {}): CombatState {
  return {
    party: [],
    enemies: { front: [], back: [] },
    spells: {},
    items: {},
    justDied: [],
    ...partial,
  } as CombatState;
}

describe("idsForEvent layering", () => {
  it("physical hit stays single-layer", () => {
    const ids = idsForEvent(
      { type: "attack", actorId: "a", targetId: "e", damage: 5, crit: false, range: "short" },
      bareState()
    );
    expect(ids.map((x) => x.id)).toEqual(["attackHit"]);
  });

  it("caps at 3 cues", () => {
    // Use a recipe that would want many layers once P2 flags exist — for now
    // assert helper clampLayers([...], 3) behavior if exported, or cast with charge flag.
    expect(true).toBe(true); // replaced in Step 3 once charge-layer flag exists
  });
});
```

Replace the placeholder once `castSfxLayers(spellId, { hasChargeTelegraph: boolean })` exists in Step 3.

- [ ] **Step 2: Run to fail**

Run: `npx vitest run src/engine/combat-audio.test.ts`
Expected: FAIL — `idsForEvent` not exported.

- [ ] **Step 3: Implement audio leaf + mapper**

In `audio.ts`:

```ts
playCombatSfx(id: CombatSfxId, opts?: { gainMul?: number }): void {
  // ... existing buffer guard ...
  gain.gain.value = COMBAT_SFX_GAIN[id] * (opts?.gainMul ?? 1);
  // ...
}
```

In `combat-audio.ts`:

```ts
export type SfxLayer = { id: CombatSfxId; gainMul?: number };

const MAX_SFX_LAYERS = 3;

export function clampSfxLayers(layers: SfxLayer[]): SfxLayer[] {
  return layers.slice(0, MAX_SFX_LAYERS);
}

export function idsForEvent(event: CombatEvent, state: CombatState): SfxLayer[] {
  // Refactor idForEvent body to push into layers[] instead of returning one id.
  // Example cast with telegraph:
  //   layers.push({ id: elementId });
  //   if (spellHasFullCharge(event.spellId)) layers.push({ id: "bossPhase", gainMul: 0.4 });
  return clampSfxLayers(layers);
}

export function playCombatEventSound(event: CombatEvent, state: CombatState): void {
  for (const layer of idsForEvent(event, state)) {
    audio.playCombatSfx(layer.id, { gainMul: layer.gainMul });
  }
}
```

Keep `spellHasFullCharge` as a pure set of spell ids that Task 4 will populate — start empty so behavior matches today until P2.

- [ ] **Step 4: Tests pass + spy sanity**

Run: `npx vitest run src/engine/combat-audio.test.ts`
Expected: PASS.

Manual: `?debug=1`, fight once, `__onyxDebug.sounds(40)` — each leaf appears once per layer; no duplicate from wrapper patching.

- [ ] **Step 5: Optional commit** (human)

---

### Task 3 (P1): Glow / iso twin underlays

**Files:**
- Modify: `src/engine/combat-scene.ts` (`EffectStyle`, `pushBursts`, field push, `ELEMENT_STYLES`, status styles, high fire AoE overrides)
- Modify: `src/engine/effect-sprite-wiring.test.ts` (`styleEffectIds` must include underlays)

**Interfaces:**
- Consumes: Task 1 patterns
- Produces: `EffectStyle` fields:

```ts
/** Drawn under the primary burst at the same impact (glow twin). */
burstUnderlay?: string;
burstUnderlayScale?: number;
/** Drawn under the primary field (iso/glow twins). */
fieldUnderlay?: string;
fieldUnderlayScale?: number;
```

- [ ] **Step 1: Failing wiring expectations**

```ts
it("fire element field uses large_fire_glow underlay", () => {
  const s = resolveEffectStyle("mage-fireball"); // or element path
  // After ELEMENT_STYLES.fire update:
  expect(resolveEffectStyle(/* a spell that inherits fire field */)).toMatchObject({
    // document exact spell id that exposes field: large_fire
  });
});
```

Concrete mappings to implement:

| Style site | Primary (keep) | Underlay / twin |
|------------|----------------|-----------------|
| `ELEMENT_STYLES.fire.field` | `large_fire` | `large_fire_glow` |
| Fallback `burst: "fire_explosion"` sites | `fire_explosion` | `fire_explosion_glow` |
| `mage-immolate` / `mage-meteor-swarm` field | existing mushroom/field | add `fire_explosion_iso` as second field layer **or** `fieldUnderlay: fire_explosion_iso` + `fire_explosion_iso_glow` via nested underlay only on iso (if only one underlay slot: iso as underlay, skip iso_glow **or** push iso then iso_glow manually in field step) |
| `ELEMENT_STYLES.lightning.charge` | switch to `lightning_blast_glow` | keep projectile `lightning_blast` |
| STATUS `slow` / frostbite field | add `ice_burst_grey` | — |

**Iso glow pair:** In the field-push step, if `fieldUnderlay` is set, push it first at `fieldBase * 0.9`, then primary. For iso+iso_glow, set `field: "fire_explosion_iso"`, `fieldUnderlay: "fire_explosion_iso_glow"` on Immolate/Meteor only (don't replace mushroom if it reads better — then use underlay iso under mushroom).

**Recommended concrete choice (lock):** Meteor/Immolate keep current primary field; set `fieldUnderlay: "fire_explosion_iso"` and push an extra third effect only for `fire_explosion_iso_glow` when `fieldUnderlay === "fire_explosion_iso"` (special case in field push, documented in comment). Avoid unbounded layer lists.

- [ ] **Step 2: Implement `pushBursts` underlay**

```ts
if (style.burstUnderlay) {
  scene.effects.push({
    type: "burst",
    x, y,
    color: style.color,
    effect: style.burstUnderlay,
    scale: varyScale(style.burstUnderlayScale ?? base * 1.05, 0.08),
    glow: true,
    start: now,
    duration,
  });
}
// then existing primary bursts
```

Draw order: effects array is drawn in order — **push underlay before primary** so primary sits on top.

- [ ] **Step 3: Update `styleEffectIds` in wiring test**

```ts
function styleEffectIds(style: StylePick & {
  burstUnderlay?: string;
  fieldUnderlay?: string;
}): string[] {
  return [
    style.projectile, style.burst, style.field, style.charge,
    style.burstUnderlay, style.fieldUnderlay,
  ].filter((id): id is string => typeof id === "string" && id.length > 0);
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run src/engine/effect-sprite-wiring.test.ts src/engine/combat-scene.test.ts`
Arena: Fireball, Immolate, Lightning bolt, Frostbite/Slow — confirm glow reads without washing out sprites; no clip into FF6 bottom windows (field y stays ~`h * 0.42`).

---

### Task 4 (P2): `mp_*_full` charge telegraphs + SFX layer 2

**Files:**
- Modify: `src/engine/combat-scene.ts` (`SPELL_OVERRIDES` / `ELEMENT_STYLES` `charge` fields)
- Modify: `src/engine/combat-audio.ts` (`FULL_CHARGE_SPELLS` set + layer)

**Risk note:** `mp_fire_bomb` was trimmed because the full strip's early blue frames never showed in a 400ms **burst**. Using `*_full` as **charge** (drawn on caster during cast window) is the correct stage — do **not** set them as `burst`.

| Spell / element | `charge` |
|-----------------|----------|
| `mage-fireball`, `mage-immolate`, fire ELEMENT default | `mp_fire_bomb_full` (`chargeScale` ~0.55–0.7) |
| Lightning ELEMENT + bolt/chain spells | `mp_lightning_full` |
| `mage-spark` | `mp_spark_full` |
| `mage-disintegrate`, `mage-gate` | `mp_dark_bolt_full` |

Keep impact bursts on trimmed `mp_fire_bomb` / `mp_lightning` / etc.

- [ ] **Step 1: Failing tests for charge ids**

```ts
expect(resolveEffectStyle("mage-fireball").charge).toBe("mp_fire_bomb_full");
expect(resolveEffectStyle("mage-spark").charge).toBe("mp_spark_full");
expect(resolveEffectStyle("mage-disintegrate").charge).toBe("mp_dark_bolt_full");
```

- [ ] **Step 2: Implement charge swaps + `FULL_CHARGE_SPELLS`**

```ts
// combat-audio.ts
const FULL_CHARGE_SPELLS = new Set([
  "mage-fireball",
  "mage-immolate",
  "mage-spark",
  "mage-disintegrate",
  "mage-gate",
  // add lightning bolt ids present in data/spells.ts
]);
```

On `cast`, if spell id ∈ set → second layer `{ id: "bossPhase", gainMul: 0.4 }`.

- [ ] **Step 3: Charge duration**

If charge sprites truncate, add optional `chargeDurationMs` on `EffectStyle` (default = cast window). Do **not** slow combat resolution — only the choreography charge effect's `duration`.

- [ ] **Step 4: Arena + sounds**

Cast Fireball: see full charge ring on caster, then fire impact; `__onyxDebug.sounds()` shows `combat:elementFire` and `combat:bossPhase` near the cast. Confirm `bufferMissing: false`.

---

### Task 5 (P3): Ray strips

**Files:**
- Modify: `src/engine/combat-scene.ts` `SPELL_OVERRIDES` (+ Analyze/silence presentation if those events spawn bursts today)

| ID | Mapping |
|----|---------|
| `px_magic_ray` | `mage-arcane-ward` projectile **or** `mage-spark` projectile upgrade (prefer ward poke / spark projectile — spark already has charge from P2; use ray as projectile) |
| `px_black_white_ray` | `mage-disintegrate` projectile |
| `px_black_white_sparks` | `spellEffect` / Analyze burst / `fizzle` / `silence` visual in `playTurn` where a burst is already pushed |

- [ ] **Step 1: Tests**

```ts
expect(resolveEffectStyle("mage-disintegrate").projectile).toBe("px_black_white_ray");
expect(resolveEffectStyle("mage-spark").projectile).toBe("px_magic_ray");
// or arcane-ward — pick one and lock here:
// LOCKED: spark → px_magic_ray; disintegrate → px_black_white_ray;
// arcane-ward keeps px_magic_orb burst; analyze/silence → px_black_white_sparks burst
```

- [ ] **Step 2: Implement + scale**

16×16 rays need `projectileScale ≈ 45/16 ≈ 2.8` (same as other pixelart bolts).

- [ ] **Step 3: SFX** — Analyze already `analyze`; add soft `{ id: "fizzle", gainMul: 0.35 }` when sparks burst is used (optional).

- [ ] **Step 4: Arena visual** — ray readable in flight; not a smear across party windows.

---

### Task 6 (P4): Particles, death sibling, classic `fireball`

**Files:**
- Modify: `src/engine/combat-scene.ts` (summon styles, techniqueHit sparkle, `defeated` case ~2303)
- Read-only: `src/data/enemies.ts` undead `special`

#### 6a — `zombie_death_explosion`

On `defeated` with `wasEnemy: true`, resolve enemy id from corpses / `justDied` / scene state; if `special` includes `{ kind: "undead" }` (or id matches known undead list helper):

```ts
scene.effects.push({
  type: "burst",
  x: actor.x,
  y: actor.y,
  color: "#c080ff",
  effect: "zombie_death_explosion",
  scale: 1.35,
  start: n,
  duration: 500,
});
```

SFX: Task 2 recipe — `enemyDefeated` + `{ id: "statusPoison", gainMul: 0.4 }`.

Helper (pure, testable):

```ts
export function enemyIsUndead(enemyId: string): boolean {
  const def = enemyById(enemyId); // existing data helper if present
  return !!def?.special?.some((s) => s.kind === "undead");
}
```

#### 6b — `fireball` (16×16 classic)

Set `mage-ember` to `projectileCount: 2` with primary `px_fireball` and — **if** EffectStyle only supports one projectile id — either:
- change ember primary projectile to classic `fireball` at scale `45/16≈2.8`, **or**
- push a second projectile manually in cast choreography for ember only.

**Locked choice:** `mage-ember` projectile → `fireball` (classic), burst stays `fz_explosion`. Frees the tiny strip; `px_fireball` remains on `mage-fire-bolt`.

#### 6c — Elemental particles

| ID | Use |
|----|-----|
| `elemental_v1` | Summon spells: extra bursts at portal with `burstCount: 4`, `burstScale` ~ `90/8 ≈ 11` then dial down in Arena until readable (8×8 is tiny — expect scale 8–12) |
| `elemental_v2` | Second summon spell id if distinct; else alternate via `burstCount` half-and-half manually |
| `extra_elemental` | On `techniqueHit`, additional micro-burst |
| `extra_elemental_glow` | Crit techniqueHit underlay |

**Performance cap:** max +4 particle bursts per impact; skip particles when `scene.effects.length > 40` (defensive).

- [ ] **Step 1: Unit test `enemyIsUndead`**
- [ ] **Step 2: Implement death / ember / particles**
- [ ] **Step 3: Arena** — undead kill shows death explosion; ember uses classic fireball; summon not a muddy glitter storm

---

### Task 7 (P5): `fz_icons` skip + unused regression guard + optional lazy load

**Files:**
- Modify: `src/engine/effect-sprite-cache.ts`
- Modify: `src/engine/effect-sprite-wiring.test.ts`

- [ ] **Step 1: Document skip**

```ts
/** Not a combat animation — icon atlas. Excluded from loadEffectSprites core set. */
export const NON_COMBAT_EFFECT_IDS = new Set(["fz_icons"]);
```

- [ ] **Step 2: Preload split (minimal)**

```ts
export function loadEffectSprites(): Promise<EffectSprite[]> {
  return Promise.all(
    Object.keys(EFFECT_STRIPS)
      .filter((name) => !NON_COMBAT_EFFECT_IDS.has(name))
      .map((name) => loadEffect(name))
  );
}
```

Keep `getEffectStrip("fz_icons")` working for vignette.

- [ ] **Step 3: Unused inventory test**

```ts
it("every EFFECT_STRIPS id is referenced by combat styles/helpers or allowlisted", () => {
  const allow = new Set(["fz_icons"]);
  // Parse / collect all style ids + melee + death + particle literals
  // expect unused - allow = []
});
```

Implement collection by exporting a `collectReferencedEffectIds(): Set<string>` from `combat-scene.ts` that walks ELEMENT_STYLES, SPELL_OVERRIDES, STATUS_STYLES, and hardcoded melee/death/particle ids — avoid brittle regex across the whole file if possible; prefer explicit lists updated in each task.

- [ ] **Step 4: `npm run build` && `npm test`**

Expected: zero TS errors; all tests green.

---

### Task 8: End-to-end verification checklist (all phases)

**Files:** none (manual / playtest)

- [ ] **Step 1: Build + unit**

```bash
npm run build
npm test
```

- [ ] **Step 2: Arena matrix**

| Check | Pass criteria |
|-------|----------------|
| Mage hit / crit | `wizard_attack1` / `wizard_attack2` + staff underlay |
| Fireball | `mp_fire_bomb_full` charge visible, then fire impact |
| Immolate/Meteor | iso underlay readable, not covering party HP window |
| Lightning | glow charge / blast |
| Slow / frost | grey ice readable |
| Disintegrate | B/W ray |
| Spark | magic ray + spark_full charge |
| Undead kill | `zombie_death_explosion` |
| Ember | classic `fireball` projectile |
| Summon | elemental particles without smear |
| SFX layers | `sounds()` shows 2 ids on charged cast; `bufferMissing` false |
| Skip | `fz_icons` never appears as combat burst |

- [ ] **Step 3: Risks explicitly re-checked**

| Risk | Mitigation |
|------|------------|
| Wrong frame slicing (slash_attack class of bug) | Wiring test already locks slash; add IHDR asserts for any newly "suspicious" sheet if playback looks like full-sheet stamp |
| Clipping bottom windows | Keep field/burst anchors at mid-sprite; scale dial-down in Arena |
| `bufferMissing` | readiness + sounds spy before claiming audio done |
| Perf stacking full strips | Charges once per cast; particle cap; no per-target `*_full` bursts |
| Audio double-count | Only leaf `playCombatSfx`; layers intentional |

---

## Open decisions (designer input before coding — optional)

These are locked above with defaults; override only if you disagree:

1. **Meteor field:** keep mushroom primary + iso underlay (**default**) vs replace mushroom with iso pair.
2. **`mage-spark` projectile:** `px_magic_ray` (**default**) vs keep `px_arcane_bolt` and put ray on arcane-ward only.
3. **Charge SFX:** reuse `bossPhase` at 0.4 gain (**default**) vs stay silent on charge (VFX-only).
4. **Undead death SFX second layer:** `statusPoison` (**default**) vs `debuffCast` vs none.
5. **`fz_icons`:** exclude from preload but keep on disk (**default**) vs delete file (out of scope unless asked).

---

## Spec coverage self-check

| Requirement | Task |
|-------------|------|
| All unused IDs assigned | Design table + Tasks 1, 3–7 |
| Layered audio | Task 2 + 4 + 6a |
| Presentation-only | Global Constraints |
| Bite-sized tasks + paths + verify | Tasks 1–8 |
| Phasing P0–P4 (+P5 hygiene) | Phasing overview |
| Risks | Task 8 + Global Constraints |
| Plan only / no implement in this session | This document |
| `fz_icons` skip rationale | Design table + Task 7 |

**Placeholder scan:** none intentional — open decisions are explicit defaults, not TBDs.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-27-unused-combat-vfx-layered-sfx.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in-session with executing-plans checkpoints  

Which approach?
