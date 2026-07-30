# Phaser combat renderer — design

> **Superseded by** [`2026-07-29-phaser-combat-port-design.md`](./2026-07-29-phaser-combat-port-design.md) — authoritative fuller design (`CombatStage`, Phaser.AUTO / Canvas still present, Phase 0–5, timing hazards). Keep this file for history only.

**Date:** 2026-07-29 · **Status:** superseded · **Type:** presentation-only port  
**Prompt source:** [`docs/PROMPT-phaser-combat-port-plan.md`](../../PROMPT-phaser-combat-port-plan.md)  
**Implementation plan:** [`docs/superpowers/plans/2026-07-29-phaser-combat-renderer.md`](../plans/2026-07-29-phaser-combat-renderer.md)

## Goal

Host combat **drawing** in Phaser 4 (`phaser@4.2.1`) while keeping the existing FF6
turn controller, DOM menus, and — critically — the existing **choreography engine**
that turns `CombatEvent[]` into timed actor motion, popups, barks, and VFX state.

## Critical finding (verified)

`src/engine/combat-scene.ts` (~4173 LOC) is already two modules in one file:

| Region | Lines (approx) | Canvas? | Role |
|--------|----------------|---------|------|
| Choreography + scene state | 1–3115 | **No `ctx` / `CanvasRenderingContext2D`** | `CombatScene`, `createScene`, `playTurn`, `updateScene`, `isPlaybackDone`, `skipPlaybackToEnd`, particles/popups/barks as data |
| Drawing | 3117–end (~1.0k LOC) | **Yes — every `draw*` takes `ctx`** | `renderScene`, strip blit, fallbacks, markers, banner, nameplate |

There is **no** `ctx` token anywhere before the `// --- Drawing ---` banner at line 3117.

**Implication:** Do **not** reimplement `playTurn` as Phaser timelines. Keep the
choreography state machine; replace only the per-frame **view** that reads
`CombatScene` and paints.

```mermaid
flowchart LR
  game["src/game/combat*"] -->|CombatEvent[]| ui["CombatController"]
  ui -->|playTurn / updateScene| choreo["CombatScene choreography"]
  ui -->|DOM| menus["combat-select-action-view"]
  choreo -->|same state each tick| canvas["Canvas renderScene TODAY"]
  choreo -->|same state each tick| phaser["Phaser CombatRenderer NEW"]
```

## Recommended architecture

### Keep (unchanged behavior)

- `src/game/**` combat resolution and `CombatEvent` union
- `combat-ui.ts` turn machine, FAST/skip, `isChoreographyDone` / `debugView`
- `combat-select-action-view.ts` + FF6 DOM windows
- `combat-audio.ts`, `battle-transition.ts` (initially — may snapshot Phaser canvas later)
- Pure layout: `combat-scene-math.ts`
- Choreography API: `createScene`, `playTurn`, `updateScene`, `isPlaybackDone`,
  `skipPlaybackToEnd`, `absorbDeaths`, `setBossIntroNameplate`, `pushBark`, etc.

### Introduce

```ts
/** Presentation backend for one combat. Choreography stays on CombatScene. */
export interface CombatRenderer {
  /** Called each controller tick after updateScene. */
  render(scene: CombatScene, w: number, h: number, now: number): void;
  /** Tear down Phaser game / listeners. Canvas no-op. */
  destroy(): void;
}
```

- `CanvasCombatRenderer` — thin wrap of today’s `renderScene(ctx, …)`
- `PhaserCombatRenderer` — embeds a Phaser.Game in `#combat-wrap` (or replaces
  `#combat-canvas`), syncs GameObjects from `CombatScene` each `render()`

Controller tick stays:

```ts
updateScene(this.scene, now);
// …playback done / windows…
this.renderer.render(this.scene, combatW, combatH, now);
```

### Do not do (anti-goals)

- Rewriting event→timeline logic inside Phaser
- Moving DOM menus into Phaser in MVP (Scope C later)
- Porting corridor / town / camp
- Changing boss internal ids or player-facing boss names
- Editing combat math in `src/game/`

## Scope ladder

| Scope | What | Default |
|-------|------|---------|
| **A** | Phaser draws actors + bg + cursor; DOM menus stay; canvas renderer remains as fallback flag | MVP vertical slice |
| **B** | Popups, barks, banner, nameplate, effects, particles, shake, glows, fallbacks — parity with AGENTS.md combat checklist | Ship target |
| **C** | Menus inside Phaser + scale/touch | Deferred |

## Sprite pipeline

**MVP:** Load existing 100×100 horizontal strips as Phaser spritesheets (frame size
fixed). Drive visible frame from existing `ActorAnim` + strip fps helpers (same
numbers as today), **or** map `ActorAnim.state` → Phaser anim key once strips are
registered. Positions/opacity/offsets still come from `CombatScene` / `animOffset`.

**Later (optional):** Texture atlases / Aseprite JSON — easier imports; choreography
still owns walk/hurt timing.

Missing art: keep procedural fallback (Phaser Graphics or continue canvas fallback
path for unmapped ids).

## Feature flag

`localStorage` or `?combatRenderer=phaser|canvas` (and/or `__onyxDebug.setCombatRenderer`)
so Arena can A/B and we can cut over without a big-bang. Default canvas until Scope B
parity; then default Phaser.

## Risks

| Risk | Mitigation |
|------|------------|
| Dual canvases / resize fighting shell | One host node; Phaser owns combat surface; hide or remove `#combat-canvas` when Phaser active |
| `battle-transition` snapshots corridor/combat | Keep transition; ensure Phaser canvas is snapshottable or fall back to dissolve-only when Phaser |
| Playtest `isIdle` | Still keyed off `isPlaybackDone` / phase — choreography unchanged |
| Bundle size | Dynamic `import('phaser')` only when combat starts (or when flag on) |
| Input focus | Phaser `input: { keyboard: false }` (or equivalent) so DOM menus keep keys |
| Foot-Y draw order | Replicate sort-by-`footY` when depth-sorting Phaser sprites |

## Effort (revised after finding)

With choreography reused: **~5–8 focused days** to Scope B for a high-velocity
agent session, not a full rewrite of `playTurn`. Most of the previous “2 weeks”
estimate assumed reimplementing timelines.

## Open questions (resolved in plan unless overridden)

1. **Default cutover:** canvas until B checklist green, then Phaser default — **yes**.
2. **Split file first:** extract `combat-canvas-draw.ts` before Phaser — **yes**
   (proves boundary; shrinks review diffs).
3. **Phaser version:** pin exact `"phaser": "4.2.1"` (`phaser@4.2.1`). Greenfield
   embed → **Phaser 4**, not 3.90. Phaser 3.90.0 is frozen; do not recommend it
   here. Phaser 4.0 shipped 2026-04-10 (Vite + TS first-class). Notes for the
   embed: Canvas renderer is deprecated in v4 — use the default **WebGL**
   renderer; set `input.keyboard: false` so DOM menus keep keys; prefer dynamic
   `import('phaser')` so title/dungeon do not pay the combat bundle cost.
