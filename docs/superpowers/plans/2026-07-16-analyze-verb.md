# Analyze Verb Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A turn-cost Analyze verb that reveals species-level affinity + trait intel, surfaced as enemy-window tags.

**Architecture:** New `PlayerAction "analyze"` + `analyzedEnemies` state in `combat.ts`; Y (skill) palette button becomes a per-class skill list ending in a universal Analyze entry; tags in `combat-select-action-view.ts`; banner in `combat-scene.ts`. Spec: `docs/superpowers/specs/2026-07-16-analyze-verb-design.md`.

**Repo rules:** NO git mutations. Don't touch unrelated WIP (`styles.css`, arena/renderer files). Only the files listed below.

**Anchors (verified):**
- `resolvePlayerAction` switch: `src/game/combat.ts` ~line 1620 (attack/cast/technique/defend/item/flee/hide/ambush cases).
- `CombatState` init: `createCombatState` after `observedAffinity: {},`; second literal `src/vfx-vignette.ts` after `observedAffinity: {},`.
- Y routing: `combat-ui.ts:1196-1206`; `openTechniqueSelect` at 746; `confirmSelection` at 810 (selectTarget branch at 918-1016); PendingAction at 83-88.
- `buildPalette` skill slot: `src/engine/combat-action-palette.ts:53-69`.
- Enemy group loop: `combat-select-action-view.ts:390-410`; `menuEntriesForCharacter` at 195-219; ACTION_SHORTCUTS at ~110.
- Scene event switch: after the `affinityDiscovered` case.
- Keyboard shortcuts map: `combat-ui.ts` ~1312 (`{ t: "technique", ... }`).

---

### Task 1: Engine — analyze action + analyzedEnemies

**Files:**
- Modify: `src/game/combat.ts` (PlayerAction union ~line 300; CombatEvent union; CombatState field + init; `resolvePlayerAction` case; new `resolveAnalyze`)
- Modify: `src/vfx-vignette.ts` (literal)
- Test: `src/game/combat-turns.test.ts`

- [ ] **Step 1: failing tests** (append to `combat-turns.test.ts`):

```ts
// --- Analyze verb (Direction C) ------------------------------------------------

describe("analyze verb", () => {
  it("marks the species analyzed and records its affinities", () => {
    const state = makeState([makeEnemy("rat-0", {
      special: [{ kind: "weakElement", element: "fire" }, { kind: "resistElement", element: "water" }],
    })]);
    const s = resolvePlayerTurn(
      state,
      { kind: "analyze", actorId: "char-0", targetInstanceId: "rat-0" },
      seqRng([0.5])
    );
    expect(s.analyzedEnemies["Test Rat"]).toBe(true);
    expect(s.observedAffinity["Test Rat"]).toEqual({ weak: ["fire"], resist: ["water"] });
    expect(s.events.some((e) => e?.type === "analyze" && e.targetId === "rat-0")).toBe(true);
    expect(s.party.map((c) => c.hp)).toEqual(state.party.map((c) => c.hp)); // no self-harm
  });

  it("is idempotent and harmless to re-analyze", () => {
    const state = makeState([makeEnemy("rat-0", { special: [{ kind: "weakElement", element: "fire" }] })]);
    state.analyzedEnemies["Test Rat"] = true;
    state.observedAffinity["Test Rat"] = { weak: ["fire"], resist: [] };
    const s = resolvePlayerTurn(
      state,
      { kind: "analyze", actorId: "char-0", targetInstanceId: "rat-0" },
      seqRng([0.5])
    );
    expect(s.observedAffinity["Test Rat"].weak).toEqual(["fire"]); // no duplicate
  });

  it("does nothing against a missing target", () => {
    const state = makeState([makeEnemy("rat-0")]);
    const s = resolvePlayerTurn(
      state,
      { kind: "analyze", actorId: "char-0", targetInstanceId: "nope" },
      seqRng([0.5])
    );
    expect(Object.keys(s.analyzedEnemies)).toHaveLength(0);
    expect(s.events.some((e) => e?.type === "analyze")).toBe(false);
  });

  it("works in the round-based resolver too", () => {
    const state = makeState([makeEnemy("rat-0", { special: [{ kind: "evasive" }] })]);
    const s = resolveCombatRound(
      state,
      [
        { kind: "analyze", actorId: "char-0", targetInstanceId: "rat-0" },
        { kind: "defend", actorId: "char-1" },
      ],
      seqRng([0.9])
    );
    expect(s.analyzedEnemies["Test Rat"]).toBe(true);
  });
});
```

- [ ] **Step 2: run red** — `npx vitest run src/game/combat-turns.test.ts` → 4 FAIL.

- [ ] **Step 3: implement**

PlayerAction union (after the ambush variant): `| { kind: "analyze"; actorId: string; targetInstanceId: string }`.

CombatEvent union (after affinityDiscovered): `| { type: "analyze"; actorId: string; targetId: string }`.

CombatState field (after observedAffinity):

```ts
  /** Species the party has Analyzed this combat (enemy name -> true). Gates trait tags. */
  analyzedEnemies: Record<string, true>;
```

Init `analyzedEnemies: {},` in `createCombatState` and the `vfx-vignette.ts` literal.

`resolvePlayerAction` case (after "ambush"):

```ts
    case "analyze":
      resolveAnalyze(s, actor, action.targetInstanceId, log, emit);
      break;
```

New function (near resolveAmbush):

```ts
/** Analyze: reveal a species' affinity + trait intel for the rest of the fight. */
function resolveAnalyze(
  s: CombatState,
  actor: Character,
  targetInstanceId: string,
  log: (m: string) => void,
  emit: (m: string, e: CombatEvent) => void
): void {
  const target = findEnemy(s, targetInstanceId);
  if (!target) {
    log(`${actor.name} analyzes but finds no target.`);
    return;
  }
  s.analyzedEnemies[target.name] = true;
  const entry = s.observedAffinity[target.name] ?? { weak: [], resist: [] };
  for (const sp of target.special) {
    if (sp.kind === "weakElement" && !entry.weak.includes(sp.element)) entry.weak.push(sp.element);
    if (sp.kind === "resistElement" && !entry.resist.includes(sp.element)) entry.resist.push(sp.element);
  }
  s.observedAffinity[target.name] = entry;
  emit(`${actor.name} analyzes ${target.name}!`, {
    type: "analyze", actorId: actor.id, targetId: target.instanceId,
  });
}
```

- [ ] **Step 4: run green** — same command, 4 PASS.

---

### Task 2: Palette skill slot always enabled

**Files:**
- Modify: `src/engine/combat-action-palette.ts:53-69`
- Test: `src/engine/combat-action-palette.test.ts`

- [ ] **Step 1: failing test** — inside `describe("buildPalette")`:

```ts
  it("enables the skill slot for casters (Analyze is universal)", () => {
    const p = buildPalette(makeChar("Mage"), [], items);
    const skill = findSlot(p, "skill");
    expect(skill && "disabled" in skill && skill.disabled).toBe(false);
  });
```

- [ ] **Step 2: run red** — `npx vitest run src/engine/combat-action-palette.test.ts` → FAIL (currently disabled).
- [ ] **Step 3: implement** — remove the `hasSkillActions`/`skillDisabled` computation; the skill slot is `{ kind: "skill", disabled: false }`. Update the doc comment: the skill list always contains Analyze.
- [ ] **Step 4: run green.**

---

### Task 3: combat-ui — Y skill list + analyze targeting

**Files:**
- Modify: `src/engine/combat-ui.ts` (Y routing ~1196; `chooseAction` ~600; new `openSkillSelect`; `confirmSelection` ~862 selectTechnique branch + ~918 selectTarget branch; keyboard map ~1312)
- Test: `src/engine/combat-ui.test.ts`

- [ ] **Step 1: failing tests** (mirror the file's existing palette/technique harness — see "opens technique selection from the action palette" at line 126):

```ts
it("Y opens a skill list ending in Analyze for a Mage", () => {
  // rig a Mage controller in palette phase (same pattern as existing tests)
  // press y
  // expect phase to be the skill selection; entries = ["Analyze"]
});

it("fighter skill list shows techniques then Analyze", () => {
  // expect last selection entry label === "Analyze", first === a technique name
});

it("confirming Analyze opens target selection and fires the analyze action", () => {
  // with one enemy: fires immediately; assert state.analyzedEnemies set
});
```

- [ ] **Step 2: run red.**
- [ ] **Step 3: implement**
  - `chooseAction`: add `case "analyze"` — pending `{ kind: "analyze" }`; single living enemy → fire immediately; else `openTargetSelect("enemy")`.
  - Y routing: replace the thief/technique fork with `this.openSkillSelect(c)`.
  - New `openSkillSelect(c)`: `this.phase = "selectSkill"`; ids = technique ids (technique classes) / `["hide" | "ambush"]` (Thief) / `[]` (casters), then push `"analyze"`; entries mirror labels/details (technique: name + "N RG" + disabled; hide/ambush label; Analyze label "Analyze").
  - `confirmSelection` `selectSkill` branch: `"analyze"` → `chooseAction("analyze")`; `"hide"` → fire hide via resolveAndPlay; `"ambush"` → attack-like target flow; technique id → existing technique confirm logic (same as selectTechnique branch).
  - `selectTarget` confirm: `pending.kind === "analyze"` → fire `{ kind: "analyze", actorId, targetInstanceId: id }` via resolveAndPlay (no `rememberLastCommand` — Repeat must skip Analyze).
  - Keyboard map: add `n: "analyze"` to the letter shortcuts.
- [ ] **Step 4: run green.**

---

### Task 4: View — trait tags + demo-menu entry

**Files:**
- Modify: `src/engine/combat-select-action-view.ts` (enemy group loop; new trait-label helper; `menuEntriesForCharacter`; ACTION_LABELS/SHORTCUTS)
- Test: `src/engine/combat-select-action-view.test.ts`

- [ ] **Step 1: failing tests**

```ts
it("shows trait tags only for analyzed species", () => {
  const state = makeState([makeEnemy("rat-0", { special: [{ kind: "flying" }, { kind: "evasive" }] })]);
  renderCombatWindows(container, baseView(state), noopHandlers());
  expect(container.querySelector(".ff6-enemy-row")?.textContent).not.toContain("FLY");
  state.analyzedEnemies["Test Rat"] = true;
  renderCombatWindows(container, baseView(state), noopHandlers());
  const text = container.querySelector(".ff6-enemy-row")?.textContent;
  expect(text).toContain("FLY");
  expect(text).toContain("EVA");
});

it("menuEntriesForCharacter includes Analyze", () => {
  expect(menuEntriesForCharacter(makeChar()).map((e) => e.kind)).toContain("analyze");
});
```

(Adjust to the file's actual helpers — `makeEnemy` overrides pattern per its fixtures; update hint-text expectations that change.)

- [ ] **Step 2: run red.**
- [ ] **Step 3: implement**
  - Trait labels: `flying→FLY, evasive→EVA, highDefense→DEF, resistPhysical→PHYS{percent}, poisonOnHit→PSN+, undead→UND, demon→DMN, caster→CST, healer→HLH, silenceRandom→SIL`. In the enemy group loop: `if (state.analyzedEnemies[e.name]) for (const label of traitLabelsFor(e)) group.traits.add(label)`.
  - Render after affinity tags, before the ⚡charge tag (same `ff6-status-tag` span pattern).
  - `menuEntriesForCharacter`: insert `"analyze"` before `"flee"`; `ACTION_LABELS["analyze"] = "Analyze"`; shortcut `n`.
  - Update the two exact hint-text assertions (`"Enter · A/T/M/D/I/R · ↑↓"` → includes N) in the view tests.
- [ ] **Step 4: run green.**

---

### Task 5: Scene banner

**Files:**
- Modify: `src/engine/combat-scene.ts` (event switch, after `affinityDiscovered`)
- Test: `src/engine/combat-scene.test.ts`

- [ ] **Step 1: failing test**

```ts
it("analyze event shows the Analyze banner", () => {
  const scene = makeScene();
  playTurn(scene, [{ type: "analyze", actorId: "c0", targetId: "rat-0" }], spellName, 0, W, H);
  updateScene(scene, 10);
  expect(scene.banner).toBe("Analyze");
});
```

- [ ] **Step 2: run red.**
- [ ] **Step 3: implement** — `case "analyze": { showBanner("Analyze", 900); t += 500; break; }`
- [ ] **Step 4: run green.**

---

### Task 6: Docs + full gate

- [ ] **Step 1:** audit — Direction C section: `Analyze verb (**shipped**)`; implementation-status row.
- [ ] **Step 2:** reading list spec-table row for `2026-07-16-analyze-verb-design.md`.
- [ ] **Step 3:** `npm test && npm run build` — all green, build clean. No commits.

## Self-review notes

- **Spec coverage:** §2 engine → T1; §3 input → T2/T3; §4 surfacing → T4/T5; §5 tests → per-task TDD; §7 docs → T6.
- **Type consistency:** `analyzedEnemies: Record<string, true>` identical across engine/view/tests; `analyze` event shape `{ type, actorId, targetId }` identical across combat.ts, scene, tests; PlayerAction variant identical across combat.ts/combat-ui/tests.
- **Risk notes:** T3 is the bulk — the technique confirm logic must not regress for the plain `selectTechnique` phase; keep the existing `openTechniqueSelect` path intact (Y now routes through `openSkillSelect`, which reuses the same entries for technique classes).
