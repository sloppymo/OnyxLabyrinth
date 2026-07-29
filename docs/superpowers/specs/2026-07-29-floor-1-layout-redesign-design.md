# Floor 1 Layout Redesign — Design

**Date:** 2026-07-29  
**Status:** Approved  
**Reference:** User-provided Wizardry Proving Grounds–style map + legend (geometry/progression source; no Wizardry proper nouns in shipped content).

## 1. Problem

Campaign Floor 1 ("The Flooded Crypt") is a compact 12×12 tutorial hand-carved in `src/data/floors.ts`. The desired first level is a much larger, multi-zone dungeon matching a classic first-person grid map: dense northeast maze, southwest key branch, central hub, checkered gate room, satellite pockets (bottom-center wing, southeast isolated maze), and a full key/progression loop.

## 2. Goals

1. **Full recreation** of reference geometry and on-floor progression (keys, locks, chests, NPCs, hazards, inscriptions).
2. **OnyxLabyrinth canon** for all names, copy, and items — no Wizardry IP nouns.
3. **Two live inter-floor links only:** town entry/return via `startX/startY`, and one `stairs_down` to Floor 2.
4. **All other cross-floor exits inert** (event messages / damage pits; no teleporter/chute/stair targets to missing floors).
5. **Secret doors → normal `door` edges** until a secret-door feature exists.

## 3. Non-goals

- Secret-door mechanic (looks-like-wall until discovered).
- Live portals to Floor 4, chute to Floor 6, pit-drop to Floor 2, token portal to Floor 2.
- Orb/token inventory gating logic (MacGuffins may exist as items; gates are inscription-only).
- Rebuilding Floors 2–5 to match Wizardry destinations.
- New Floor 6 stub.

## 4. Delivery approach

**JSON pack via floor editor** (same pattern as `floor-4.json` / `floor-5.json`):

1. Trace reference map in WYSIWYG editor (`npm run floor:editor`).
2. Export to `src/content/floors/floor-1.json`.
3. Register in `src/content/floors/index.ts` (replaces campaign id 1).
4. Retire `floor1()` body in `src/data/floors.ts` (keep export surface / `FLOORS` array stable via merge).

Estimated bounding grid: **~24×28** (exact dimensions measured during tracing).

Tileset theme: **`f1`**.

Floor display name: **"The Proving Depths"** (replaces "The Flooded Crypt" on this floor).

## 5. Symbol mapping

| Reference (legend) | Engine implementation |
|---|---|
| Upstairs (yellow ↑, bottom-left) | **`startX` / `startY`** — town entry and resume point. No `stairs_up` tile (Floor 1 has no floor 0). |
| Downstairs (yellow ↓, primary descent) | **`stairs_down`** → Floor 2 (only live descent). |
| Locked door #1 (Silver Key) | `locked` edge + `crypt-key` |
| Silver Key location (#4) | Treasure chest containing `crypt-key` |
| Locked door #6 (Brass Key) | `locked` edge + `brass-key` |
| Brass Key | Treasure chest in southwest wing |
| Secret doors (orange) | Normal **`door`** edges |
| Voice Echo (#2) | **`event`** message tiles (main hub + satellite wing) |
| ORB gate (#3) | **`event`** message — warden sphere would fit; passage blocked narratively |
| Portal to Level 4 (star) | **`event`** message — sealed arch, nothing answers |
| Portal to Level 2 / Token (#5) | **`event`** message — gate-token slot, rusted shut |
| Chute to Level 6 (blue ↓) | **`event`** message at chute tile — drop into darkness, inert |
| Pit to Level 2 (red ↓) | **Damage `event`** (pit hazard), not a floor transition |
| Pit Trap (red X) | **Damage `event`** |
| Inscriptions (brown wall) | **`event`** message tiles |
| Machine | **`event`** message and/or `mapSprite` (`crate` / `barrel`) |
| NPCs / monsters | **`npc`** tiles with canon names; `combatEnemyIds` where attackable |

### Intra-floor access

Satellite areas (bottom-center vertical wing, southeast isolated maze) that are disconnected in the reference are authored on the **same floor grid**. Reach them via **live same-floor `teleporter` pairs** where the original used warp mechanics. Cross-floor teleporter targets remain inert (message at source tile only; do not register invalid `teleporters` entries).

## 6. Content mapping (canon names)

| Reference | OnyxLabyrinth |
|---|---|
| G'bli Gedook | **Maro** (`id: maro`) — existing NPC, repositioned |
| Ironose | **Voss** — flavor NPC ("iron-nosed sentinel") |
| The Laughing Kettle | **The Cauldron** — flavor NPC (talking shrine) |
| Vampire | **The Pale Warden** — flavor NPC |
| Golem | Inscription + `mapSprite`; optional passive NPC |
| Greater Fiend (SE pocket) | **The Shackled Colossus** — attackable NPC |
| LaLa Moo-Moo (SE pocket) | **The Lowing Saint** — absurdist flavor NPC, attackable |
| ORB of LLYLGAMYN | **`warden-sphere`** (new trinket; quest MacGuffin, no gate logic yet) |
| Bag of Tokens | **`gate-token`** (new trinket; referenced by #5 inscription only) |
| Silver Key / Brass Key | **`crypt-key`** / **`brass-key`** (existing key ids) |

### Key chain (campaign integration)

- **`crypt-key`** on Floor 1 unlocks the silver-key door (#1) and any secondary lock using that key.
- **`brass-key`** unlocks door #6 (southwest branch).
- **`lexicon-key`** remains the Floor 1 reward that unlocks Floor 2's forbidden wing — place in a brass-gated or deep branch chest so the F1→F2 progression chain stays intact.

## 7. Encounters & zones

- Base rate: **`encounterRate: 0.08`** (match current F1).
- **Safe zone:** near start / entry corridor (`rateMul: 0.5`).
- **Hot zones:** northeast maze, southeast pocket (`rateMul: 1.5–2.0`).
- Enemies: existing **`ENCOUNTER_TABLES[1]`** (slime, skeleton, skeleton-archer, acid-puddle).

## 8. Live vs inert links summary

| Link | Status |
|---|---|
| Town → Floor 1 (`startX/startY`) | **Live** |
| Floor 1 `stairs_down` → Floor 2 | **Live** |
| Floor 2 `stairs_up` → Floor 1 (lands at `startX/startY`) | **Live** (existing engine behavior) |
| Portal to L4, chute to L6, pit to L2, token portal | **Inert** (events only) |
| Same-floor teleporters (satellite access) | **Live** |

## 9. Files touched

| File | Change |
|---|---|
| `src/content/floors/floor-1.json` | **Create** — full map export |
| `src/content/floors/index.ts` | Register `floor-1.json` |
| `src/data/floors.ts` | Remove/replace `floor1()` implementation; campaign slot filled by JSON merge |
| `src/data/items.ts` | Add `warden-sphere`, `gate-token` trinkets (if placed in chests) |
| `src/data/floors.test.ts` | Update reachability / stair / treasure assertions for new layout |
| `tools/floor-data/floor-1.json` | Refresh via `npm run floor:export-all` |
| `public/tools/floor-data/floor-1.json` | Same |

## 10. Verification

```bash
npm run floor:check -- --file src/content/floors/floor-1.json
npm test
npm run build
```

Manual smoke:

1. New game → town → enter dungeon → spawn at upstairs/start tile.
2. Obtain `crypt-key`, open door #1.
3. Obtain `brass-key`, open door #6.
4. Reach `stairs_down`, descend to Floor 2.
5. Step on inert portal/chute/pit tiles — message or damage only, no floor change.
6. Same-floor teleporter reaches satellite pockets.

## 11. Reference images

Stored in session assets:

- Layout map: `image-3c77c269-cf75-408c-9dd6-423a8aac13e1.png`
- Legend: `image-2a6fa6a9-525f-4251-b195-33534f960b2f.png`
