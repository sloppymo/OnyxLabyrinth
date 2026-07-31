# Prompt — Plan a Phaser combat-presentation port (OnyxLabyrinth)

> **Plan delivered (2026-07-29):** authoritative design
> [`docs/superpowers/specs/2026-07-29-phaser-combat-port-design.md`](superpowers/specs/2026-07-29-phaser-combat-port-design.md)
> · implementation plan (may lag design)
> [`docs/superpowers/plans/2026-07-29-phaser-combat-renderer.md`](superpowers/plans/2026-07-29-phaser-combat-renderer.md)
> · earlier shorter draft (superseded)
> [`docs/superpowers/specs/2026-07-29-phaser-combat-renderer-design.md`](superpowers/specs/2026-07-29-phaser-combat-renderer-design.md).
> Key finding: keep choreography; swap only the draw backend.

Copy everything below the line into a fresh Claude (or similar) session that has
repo access. Ask it for a **plan only** — no implementation until the plan is
reviewed.

---

## Role

You are a senior game-engine / TypeScript architect. Your job is to produce a
**comprehensive, phased implementation plan** for porting **only the combat
presentation layer** of OnyxLabyrinth from the current custom canvas renderer to
**Phaser 4** (pin `"phaser": "4.2.1"`), while leaving dungeon, town, camp, title,
and all game rules unchanged.

Do **not** write production code in this session. Do **not** change game logic
(combat math, encounters, perks, saves). Output a plan document suitable for a
later implementation agent to execute.

## Product context

OnyxLabyrinth is a Wizardry-style first-person dungeon crawler:

- **Stack today:** TypeScript + Vite, no UI framework.
- **Exploration:** custom 2D canvas pseudo-3D corridor (`src/engine/renderer.ts`).
- **Combat:** FF6-style scene — enemies LEFT, party RIGHT — custom canvas
  choreography (`src/engine/combat-scene.ts`) + DOM FF6 menus
  (`src/engine/combat-ui.ts`, `src/engine/combat-select-action-view.ts`).
- **Rules:** pure TypeScript in `src/game/` (no DOM). Combat emits structured
  `CombatEvent`s; the scene animates from those events only (no log regex).
- **Deploy:** GitHub Pages via Actions on `main`. Must keep working as a static
  web build.
- **Authoritative agent notes:** read `AGENTS.md` and `CLAUDE.md` before
  planning anything that touches `src/`. For combat-UX history, skim
  `docs/AGENT-READING-LIST.md` so you do not re-litigate settled product
  decisions.

The whole game was built very quickly with AI assistance; plans should assume
**high implementation velocity** but still insist on parity checklists and
tests. Having a fully working combat system is an advantage: this is a
**rehost of a finished presentation API**, not a greenfield combat design.

## Goal (what “done” means)

Players can enter a normal fight (dungeon or Arena) and experience combat
rendered by **Phaser**, driven by the **existing** per-turn combat API and
`CombatEvent` stream, with:

1. Visual/behavioral parity with current combat (see checklist below), or an
   explicitly listed, intentional deferral for each gap.
2. Easier sprite animation import going forward (Phaser anims / atlases / sheets
   instead of hand-rolled strip cropping as the long-term path).
3. Corridor renderer, town/camp/title DOM, and `src/game/**` left intact.
4. `npm run build` and `npm test` still pass; debug/playtest seams still work.

**Non-goals for this project:**

- Porting the dungeon corridor renderer to Phaser.
- Porting town/camp/party-creation/save UI to Phaser.
- Rewriting combat rules, perks, techniques, or enemy AI.
- Native/desktop packaging (Tauri, etc.).
- True 3D corridors.
- Pixel-perfect recreation of every particle if a simpler Phaser FX reads as
  good or better — but call those out as deliberate substitutions, not silent
  drops.

## Recommended scope ladder (plan for all three; recommend a default)

Prior discussion settled on this ladder. Your plan should phase them and pick a
**default MVP recommendation**.

### Scope A — Phaser stage, DOM menus stay (MVP)

- Phaser hosts enemy/party/ally sprites, walk/attack/hurt/death, damage popups,
  spell banner/VFX hooks, target cursor, boss intro nameplate.
- `CombatController` (`combat-ui.ts`) still owns menus, targeting, turn
  resolution, and calls into a Phaser-backed scene adapter instead of
  `combat-scene.ts`.
- Keep `combat-select-action-view.ts` / FF6 DOM windows overlaid on the combat
  panel.

### Scope B — Full presentation parity

- Scope A plus: dialog barks, particles/glows, melee hit FX, summon ally
  placement, FAST/skip playback, defeated fade, reduced-motion behavior,
  battle enter/leave transition coexistence with `battle-transition.ts` (keep,
  adapt, or replace — decide explicitly).

### Scope C — Optional follow-on (separate phase)

- Move action/enemy/party windows into Phaser UI (or Phaser + thin DOM).
- Scale manager / touch-friendly combat for mobile web.

**Default recommendation to argue for or against:** ship **A → B** in one
effort; defer **C**.

## Architectural invariants (do not violate)

1. **`src/game/` remains the source of truth for combat resolution.** Phaser
   must not compute damage, initiative, or status — only present
   `CombatEvent`s / `CombatState` snapshots.
2. **Structured events only.** Today `playTurn(scene, events, …)` builds
   choreography from `CombatEvent`s; `null` log-only events are skipped. Preserve
   that contract (or a thin adapter that still starts from `CombatEvent[]`).
3. **Two combat APIs share internals:** round-based `resolveCombatRound` (tests)
   and per-turn `beginRound` / `resolvePlayerTurn` / … (UI). Do not break tests
   that use the round API.
4. **Mode shell:** `shell.showMode()` remains the only place that toggles major
   mode DOM visibility. Combat is mode `"combat"`. Do not invent a second
   visibility system.
5. **Debug surface (`?debug=1`):** `CombatController.isChoreographyDone()` and
   `debugView()` feed `__onyxDebug.isIdle()` / `snapshot()`. Any Phaser port
   must keep these semantics (idle while menus await input; busy during
   playback).
6. **Boss audio bed** starts/stops in `main.ts` from `combat.isBoss` /
   `endCombat` — do not regress.
7. **Utility spells stay out of combat** (`isUtilitySpell` filter) — unrelated
   but do not “clean up” combat spell lists while porting.
8. **Hard rule from AGENTS.md:** do not change game logic unless the plan
   explicitly needs a tiny presentation-only hook — prefer zero `src/game/`
   edits.

## Current combat stack (read these before planning)

| Area | Path | Role |
|------|------|------|
| Scene + choreography | `src/engine/combat-scene.ts` (~4.2k LOC) | Canvas draw, tweens, popups, barks, VFX, boss plate, `playTurn` / `renderScene` / `isPlaybackDone` / `skipPlaybackToEnd` |
| Layout math | `src/engine/combat-scene-math.ts` | Positions, scales — prefer reuse or port of pure functions |
| Controller | `src/engine/combat-ui.ts` (~1.8k) | FF6 turn loop, menus → resolve → `playTurn` |
| DOM menus | `src/engine/combat-select-action-view.ts` | Bottom windows |
| Flow helpers | `src/engine/combat-flow.ts`, `combat-action-palette.ts` | Pure-ish UI flow |
| Display | `src/engine/combat-display.ts` | Formatting (keep) |
| Audio cues | `src/engine/combat-audio.ts` | Maps events → SFX |
| Sprites | `sprite-manifest.ts`, `enemy-sprite-cache.ts`, `party-sprite-cache.ts`, `effect-sprite-cache.ts` | 100×100 horizontal strips under `public/assets/...` |
| Transition | `src/engine/battle-transition.ts` | HDMA-style swirl into/out of combat |
| Wiring | `src/main.ts` | `startCombat` / `leaveCombat` / `endCombat`, controller lifecycle |
| Rules | `src/game/combat*.ts`, `combat-types.ts` | `CombatState`, `CombatEvent`, per-turn API |
| Tests | `combat-scene.test.ts`, `combat-ui` / select-action / flow / audio tests, `src/game/combat*.test.ts` | Game tests must stay green; engine scene tests will be rewritten |

**Critical seams to preserve or re-implement behind a stable interface:**

- `createScene(state)` / scene object
- `playTurn(...)` → playback duration / choreography start
- `updateScene` + `renderScene` (or Phaser’s own update; adapter still exposes “done?”)
- `isPlaybackDone` / `skipPlaybackToEnd`
- `setBossIntroNameplate`
- `absorbDeaths`
- Target `SceneCursor`
- `CombatController.isChoreographyDone()` / `debugView()`

Prefer introducing a small **`CombatStage` port interface** (create / playTurn /
isDone / skip / setCursor / destroy) implemented first by the existing canvas
scene and then by Phaser — so `combat-ui.ts` changes once. Call this out in the
plan even if the canvas dual-backend is only transitional.

## Asset / animation reality

- Enemy/party art: horizontal PNG strips, **100×100 px/frame**, states like
  `idle` / `attack` / `hurt` / `death` (party also `walk`, `cast`, ranged
  variants).
- Party frame counts are derived from `width / 100`; enemies often list
  `frameCount` in `sprite-manifest.ts`.
- Missing art → procedural fallback shapes in `combat-scene.ts`. Phaser plan
  must keep a fallback (Phaser shapes or keep procedural draw path).
- Bosses reuse other strips at `BOSS_SIZE`; ids
  `headmasters-echo` / `-remnant` / `-ascendant` are **The Dead Boy / The Lonely
  Girl / The Crying Man** (display names only — do not rename ids).
- Long-term win: Phaser anims/atlases so new animations are easier to import.
  MVP may still load existing strips via Phaser spritesheets.

## Integration constraints

- Embed Phaser inside the existing combat panel / shell without breaking corridor
  canvas sizing (`shell.resizeCorridorCanvas`, pattern-cache pitfalls on the
  dungeon side — don’t regress dungeon when resizing).
- Input: combat key handlers in `main.ts` / controller; Phaser should not steal
  focus in ways that break DOM menu keys unless Scope C moves menus in.
- Coexist with `combatTransitionActive` gating (battle transition promise chain).
- Base URL / GitHub Pages (`import.meta.env.BASE_URL`) for asset paths.
- Bundle size: justify Phaser dependency; note code-splitting so title/dungeon
  don’t pay full combat cost if feasible.

## Parity checklist (plan must map each item to a phase)

Use AGENTS.md “Combat (FF6) verification checklist” as baseline, including:

1. Combat starts — FF6 layout, three bottom windows (if DOM kept).
2. Party sprites animate; acting character marker.
3. Confirm action → immediate playback (walk → attack → hurt + popup → walk back); no Space-gating.
4. Damage popups (white/green/purple/MISS); barks as sibling channel; FAST scales timing; skip clears.
5. Spell banner + target burst VFX.
6. Target cursor on scene + menu list.
7. Image-strip enemies face RIGHT; party mirrored facing LEFT.
8. Death fade / KO pose.
9. Result window; Enter exits.
10. Flee/victory → dungeon textures intact (corridor not broken by Phaser teardown).
11. Windows never clip sprites (layout constants).
12. Summoned allies in windows + heal targets + scene cursor kind `"ally"`.

Also verify: Arena next-fight, boss nameplate + boss bed audio, wipe → game over path, perk overlay after victory XP, `__onyxDebug.exitDebugCombat`, `isIdle` during playback vs menu.

## Engineering expectations for the plan

Your plan document should include:

1. **Executive summary** — recommended scope, rough effort (days), main risks.
2. **Dependency choice** — pin `"phaser": "4.2.1"` (exact; Phaser 4, not frozen
   3.90.0). How to install with Vite, `types`, WebGL default (Canvas deprecated
   in v4), `input.keyboard: false`, dynamic `import('phaser')`; any plugins
   (e.g. nothing heavy unless justified).
3. **Target architecture diagram** (mermaid): `main` → `CombatController` →
   `CombatStage` → Phaser Scene vs current canvas; `game/combat` unchanged.
4. **Phased work breakdown** with ordered tasks, file touch list, and
   **exit criteria per phase** (what demo/test proves the phase done).
5. **Interface design** for `CombatStage` (method list + which
   `CombatController` call sites change).
6. **Sprite pipeline** — how existing strips load in Phaser for MVP; migration
   path to atlases/Aseprite later.
7. **Event → animation mapping** — how `playTurn` logic is ported (reuse
   sequencing ideas from `combat-scene.ts`; do not re-derive from combat logs).
8. **DOM overlay strategy** — z-index, pointer-events, resize, canvas vs Phaser
   game size sync with `DESIGN_W`/`DESIGN_H` style caps (768×672 class limits).
9. **Transition strategy** — keep `battle-transition.ts` snapshotting what?
10. **Test strategy** — which vitest suites stay; what becomes Playwright/Arena
    manual; any pure logic to extract from `combat-scene.ts` before deletion.
11. **Rollback strategy** — feature flag / dual backend / branch.
12. **Risks & mitigations** — input focus, teardown leaks, GitHub Pages base path,
    performance, choreography clock vs Phaser `timeScale`, playtest idle detection.
13. **Out of scope explicit list.**
14. **Suggested commit sequence** (conventional commits, small vertical slices).
15. **Open questions** for the human (max 5), only where the plan truly cannot
    proceed without a choice.

## Constraints on your output

- Write the plan as a markdown doc outline ready to save under
  `docs/superpowers/specs/` (suggest a filename with today’s date and
  `phaser-combat-port`).
- Be concrete (file names, APIs, phase exit criteria). Avoid generic “set up
  Phaser” fluff.
- Prefer **incremental vertical slices** (one enemy idle sprite in Phaser inside
  a real fight) over big-bang rewrite.
- Assume the reader will implement next; they need enough detail to start Scope A
  without re-discovering the codebase.
- Call out anything in `combat-scene.ts` that should be **extracted as pure
  functions first** (hit timing tables, popup spawn rules, bark triggers) so
  Phaser and tests share them.
- Do **not** propose renaming boss internal ids or restoring “Headmaster/Echo”
  player-facing vocabulary.

## First research steps (do these before writing the plan)

1. Read `AGENTS.md` combat + debug sections.
2. Skim `combat-ui.ts` playback path (`playTurn`, phases, `isChoreographyDone`).
3. Skim `playTurn` / `CombatScene` types in `combat-scene.ts`.
4. Skim `CombatEvent` in `src/game/combat-types.ts`.
5. Note how `main.ts` mounts the combat canvas/panel and runs transitions.
6. Check current `package.json` for bundler constraints.

Then produce the plan.

## Success criteria for *your* plan (meta)

A strong plan makes an implementer confident they can:

- Add Phaser and show a real fight with Phaser sprites in ≤ first vertical slice.
- Keep DOM menus working without rewriting `combat-ui` turn logic.
- Delete or quarantine `combat-scene.ts` canvas drawing only after Scope B parity.
- Leave dungeon mode behavior unchanged.

If tradeoffs exist (dual-run flag vs hard cutover; keep battle-transition vs Phaser
cameras), present 2 options with a recommendation and why.
