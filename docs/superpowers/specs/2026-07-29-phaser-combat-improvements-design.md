# Phaser Combat Improvements — Design (post-port)

**Status:** Approved 2026-07-29 — implementation may proceed (Phases 0–4; Spine/Scope C/O6 icebox per plan §10).  
**Date:** 2026-07-29  
**Companion plan:** [`../plans/2026-07-29-phaser-combat-improvements.md`](../plans/2026-07-29-phaser-combat-improvements.md)  
**Depends on:** [`2026-07-29-phaser-combat-port-design.md`](2026-07-29-phaser-combat-port-design.md) (painter-only invariant)

## Intent

Combat painting already runs on Phaser 4.2.1 by default (`?phaser=0` → canvas rollback). This design is **not** a re-port. It selects presentation upgrades that Phaser uniquely or cheaply enables (Filters, dual tint, lights, stencil, Mesh2D, later Spine), while keeping:

- `combat-choreography.ts` as the clock of record (`playTurn` / `updateScene` / `CombatEvent[]`)
- DOM FF6 menus (`combat-select-action-view.ts`) — Scope C stays deferred
- Zero `src/game/` rules/math/encounter/perk changes unless an unavoidable presentation hook appears (prefer none)

## Product problem

Post-port parity is largely there; player-visible ceiling is not. The 2026-07-28 combat-only pass found Magic/Technique impacts interchangeable at L6, swirl-in reading as fade-to-black, and bosses still on borrowed strips. Phaser 4.2.x gives filters/tint/lights/stencil/Mesh2D without new art for a first vertical slice; Spine is the long-horizon boss/party upgrade and requires art + license.

## Recommended track (summary)

| Phase | Name | Days | Art? |
|-------|------|------|------|
| 0 | Gate: ground-plane commit + NEAREST/banner chrome | 0.5–1 | No |
| 1 | Status dual-tint + acting spotlight Filters | 1–2 | No |
| 2 | Mag/Tech VFX language (EffectStyle + Phaser blend/glow) | 1–2 | Prefer reuse strips |
| 3 | Stencil / stronger battle-transition swirl | 1–2 | No |
| 4 | Mesh2D hit squash on signature impacts | 1–2 | No |
| — | Icebox: Spine Dead Boy pilot, Scope C, named-import bundle | — | Spine: yes |

Rough calendar for Phases 0–4: **~7–10 engineer-days**, with a **player-noticeable slice by day 2** (Phase 0+1).

## Architecture (unchanged seam)

```
CombatController → CombatStage.paint()
                       ├─ createPhaserCombatStage  (default)
                       └─ createCanvasCombatStage  (?phaser=0)
Both share CombatScene + playTurn from combat-choreography.ts
```

New presentation helpers stay under `src/engine/`:

- `combat-phaser-fx.ts` — filter/tint/light helpers driven by `CombatScene` fields already present (`activeActorId`, statuses, `lightGlows`, banner timing)
- Optional later: `combat-phaser-spine.ts` + dynamic import of `spine-phaser-v4` (not a dep today)

Do **not** drive turn timing with Phaser Tweens as clock-of-record. Tweens/filters may decorate frames whose start/end come from choreography `start`/`duration` fields.

## Non-goals

- Corridor / town / camp / title Phaser ports
- Rewriting combat rules, perks, techniques, AI, floors
- Scope C (menus in Phaser) unless ROI revisits ~800 green menu tests
- Restoring “Headmaster” / “Echo” player-facing vocabulary
- Native packaging / true 3D

## Decisions (locked)

See plan §10. Filters-first; canvas-2D swirl only; defer cone lights; Spine icebox; O16 as separate DOM PR.
