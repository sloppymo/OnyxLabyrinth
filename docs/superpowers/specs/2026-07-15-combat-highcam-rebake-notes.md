# Combat high-camera rebake notes (2026-07-15)

**Status:** finishing pass done locally — still hold commit pending eyeball.  
**Shots:** `playtest-screenshots/2026-07-15-highcam-rebake/`  
**Gates:** `scripts/combat-ui-verify.mjs`, `scripts/ground-plane-probe-all.mjs` → `probes.json`

## Findings (spec gates)

### Shared vs forked projection
- **Live combat bake is already forked** from the corridor raycaster.
- Path: `renderBattleArena` → `arena-renderer.ts` + arena section of `render-math.ts`.
- Corridor `renderer.ts` / corridor math **untouched** (only `ARENA_HORIZON_FRAC` constant synced to the new arena horizon).
- Legacy `renderCorridorBackdrop` still crops the corridor renderer (debug only).

### Procedural vs art
- **Procedural parameter rebake** of `renderArenaRoom` (tileset textures unchanged).
- Static `combat-bg.png` / corridor crop **not** regenerated; their `BACKDROP_GEOMETRY` entries were re-capped to the window-safe `floorBottomY` with seam ≈30%.

## New arena defaults
| Param | Old | New |
|-------|-----|-----|
| horizonFrac / `ARENA_HORIZON_FRAC` | 0.30 | **0.24** |
| pitch | 30° | **35°** |
| camHeight | 2.5 | **3.8** |
| wallHeight | 5 | **7** |
| roomDepth | 18 | **20** |
| roomWidth | 10 | **12** |
| obliqueBlend | — | **0.62** (floor X toward ortho) |
| sideWallMinDepth | — | **5.5** |
| ceiling | amber glow void | **dark brick→black** + `extendBackWallIntoVoid` |

## BACKDROP_GEOMETRY (after finishing pass)

| Key | seamY | floorBottomY | scaleFar |
|-----|------:|-------------:|---------:|
| arena / f1,f3–f5 | 215 | **453** | 0.875 |
| theme:f2 | 228 | **453** | 0.875 |
| corridor / combat-bg | 202 | **453** | 0.875 |

`floorBottomY` = `maxAllowedFloorBottomY()` = playfieldH − windowH − margin − **contactShadowBelow** = **672 − 200 − 8 − 11 = 453**. Shadows extend below footY; bare-foot occlusion was a probe hole.

## Formation (finishing pass)

| Row | footYFrac | notes |
|-----|-----------|-------|
| Front | ~0.62 / 0.72 / 0.82 | |
| Back | ~0.22 / 0.30 / 0.38 | x fan 408–532 (~12px more left) |

## Finishing-pass review fixes

### 1. Roster name truncation (`B…` vs `Dell`)
- **Root cause:** empty `.ff6-p-status` nested inside `.ff6-p-name` with `flex: 0 0 2.6em` permanently ate ~47px of name width.
- **Fix:** status is its own grid column; `buildNameCell` returns `{ name, status }`.

### 2. Playback footer mid-token (`Esc:`)
- `playbackHintText` / palette `maxLen=24`; `FOOTER_HINT_PRODUCERS` + `combat-ui-verify.mjs`.

### 3. Occlusion includes contact shadow
- `CONTACT_SHADOW_BELOW_FOOT_PX` (≈11) folded into `maxAllowedFloorBottomY`; shadow ellipse biased slightly up so dark core sits under the foot.

### 4. Squat enemy `artFootFromTop`
- slime / lava-slime / acid-puddle / summon-slime / summon-fire-elemental → **0.50**; hellbat **0.50**; eyeball **0.52**.

### 5. Probes + dungeon transition
- `probes.json`: f1–f5 + corridor + combat-bg, 6 enemies; `04-dungeon-after-combat.png` after flee.

## Action-window regression (earlier pass)
- Menu column ~26% ≈ 170px; default `maxLen=42` left a string CSS clipped.
- Fix: palette/menu `maxLen=24`; menu flex **28%**; enemies **24%**.

## Resolve-math hardening
- `assertFloorBottomClearOfWindows` / `maxAllowedFloorBottomY` (foot plant)
- `assertSlotsInXBounds` (party 300 / enemy 340)
- `groundPlaneProbe()` → `occlusionOk`, `xBoundsOk`, `ok`

## Deviations
1. Static `combat-bg` art still low-camera; geometry only re-capped (full PNG rebake deferred).
2. Unrelated pre-existing `save-ui.test.ts` failures (pad footer copy) — not touched.
