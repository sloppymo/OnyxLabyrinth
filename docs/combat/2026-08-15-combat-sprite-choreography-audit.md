# Combat sprite choreography — baseline audit

Baseline: `origin/main` / `11573958c9a69875317ef952f660ee01dc707420`  
Worktree: `/home/sloppymo/OnyxLabyrinth-combat-choreography`  
Branch: `feat/combat-sprite-choreography`

## Verification before edits

`npm ci` was required because the clean worktree did not contain dependencies. The baseline `npm run check` passed: app and tools TypeScript, Vite build, 120 test files / 2,350 tests, floor validation, and floor export consistency. Existing notices are the unresolved `./assets/final-fantasy-36.ttf` build reference, large Phaser chunk warnings, and the known Namanda floor linter warnings.

## Presentation path

1. `src/game/combat.ts` and the focused combat modules resolve a turn and append structured `CombatEvent` values.
2. `src/engine/combat-ui.ts` hands the events to `CombatStage.playTurn` and waits for `isPlaybackDone` before advancing the per-turn queue.
3. `src/engine/combat-choreography.ts` owns the DOM-free timeline, actor offsets, strip state, popups, effects, hit-stop, and shared impact state.
4. `src/engine/combat-scene.ts` and `src/engine/combat-phaser-stage.ts` paint that same scene state. Canvas sorts by `paintOrderFootY(base + liveOffsetY)`; Phaser sets live `sprite.depth` from the same offset.

This boundary is sound and must remain the only choreography engine. The problem is the vocabulary currently used inside it, not the event ownership.

## Findings

### Current strengths

- Attack, miss, cast, technique, death, status, and spell-effect events already have structured presentation paths.
- The current engine already has a walk/return branch, target recoil, damage popups, hurt/death strips, projectile strips, hit-stop, and bounded screen shake.
- Stable enemy slots prevent deaths from compacting survivors into a new visual position.
- Live Y offsets are included in both backend paint order; the Pack Leap regression is covered by tests.
- Party strips provide idle, walk, attack, hurt, and death for all seven classes. Mage/Priest provide cast strips and Thief provides a ranged strip.
- Forty-seven enemy/summon identities have complete idle/attack/hurt/death directories on disk. The full geometry/frame audit is in [`2026-08-15-combat-sprite-inventory.md`](2026-08-15-combat-sprite-inventory.md) and JSON form beside it.

### Biggest problems

- Basic melee uses the same symbolic `35px × scale` travel for every actor and target. It reads as a short slide, not an attack that crosses the stage.
- The standard close attack is `525ms approach + 840ms attack + 420ms return + 200ms tail`, roughly two seconds before the next action. That is too long for a common button press, especially when the actual travel is only a small fraction of a sprite width.
- `approach()` has no target position or attack-weight input, so a Thief, Fighter, Ogre, Slime, and Golem all commit with the same motion profile.
- The attack state starts only after the approach has finished. The strip's contact frame therefore has no explicit relationship to the target or to the impact event; the timing is inferred from a global `0.55` constant.
- Ranged attacks still run the full `840ms` attack window even though they correctly avoid forward travel.
- `castAnim()` is a single generic stationary cast state. The real spell effects are good, but the body lacks a small prepare/release/settle beat and healing has no distinct recipient reaction.
- Target recoil is a single 80ms/120ms translation with damage-scaled distance. It is functional but does not distinguish light, heavy, critical, or evade reactions.
- Enemy motion style is not represented. Slimes, flyers, ghosts, beasts, constructs, and humanoids all use the same walk-like state when advancing.
- `Math.random()` is used only for screen-shake jitter and effect scale jitter, but that still makes screenshot/frame audits non-reproducible. Choreography should use deterministic phase/seedless math for visual-only variation.
- Party sprites have no separate cast/ranged strips for most classes; the current fallback to attack is safe but should be explicit in the inventory and preview rather than mistaken for coverage.

## Current action-family classification

| Family | Current treatment | Baseline verdict | Needed presentation branch |
|---|---|---|---|
| PC close attack | short uniform approach, attack strip, target recoil, return | FUNCTIONAL / STATIC | target-aware light/normal/heavy melee |
| PC long attack | coil, projectile, full attack window, impact | FUNCTIONAL | shorter ranged release and recovery |
| PC critical | same travel with larger burst/shake | FUNCTIONAL | heavier contact pause/recoil, same fast return |
| PC miss | approach, attack pose, whiff burst, return | FUNCTIONAL | preserve travel, remove hit reaction, add dodge/whiff read |
| Ambush | shared melee path | FUNCTIONAL | inherit melee weight without special mechanics |
| Technique | cast-like charge plus melee path and extra VFX | GOOD / BUSY | reuse weight profile and keep contact beat |
| Multi-hit | event-by-event action scheduling | NEEDS DISTINCT CHOREOGRAPHY | one advance, repeated compact strikes, one return |
| PC offensive magic | cast pose, charge, projectile/field, impact | GOOD VFX / STATIC BODY | prepare → release → settle |
| PC healing | cast pose, projectile/burst, heal popup | FUNCTIONAL | caster release and recipient lift/relief |
| Enemy melee | same shared approach/recoil path | STATIC | explicit enemy motion profiles |
| Enemy ranged | static body plus projectile | FUNCTIONAL | release stance and shorter recovery |
| Pack Leap | bespoke mount/leap/strike/return | GOOD / LONG | preserve; migrate constants only if parity remains |
| Enemy special/AoE | cast pose and field/projectile effects | GOOD VFX / STATIC BODY | small caster prepare/release only |
| Defend | event path with limited body change | STATIC | brief brace if supported by current strips |
| Hit reaction | hurt strip, 80ms recoil, flash | FUNCTIONAL | light/heavy/critical profiles |
| Death | death strip then fade/dissolve | GOOD | preserve impact → death ordering and cleanup |

## Scope decision

The implementation pass will stay inside choreography state, renderer consumption, deterministic presentation helpers, tests, preview tooling, and documentation. No combat resolver, damage formula, AI, target selection, initiative, encounter, class, enemy stat, or Formation Chemistry file will be changed.
