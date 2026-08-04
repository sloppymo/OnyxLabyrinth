# Floor authoring — WYSIWYG editor, JSON format, content packs

OnyxLabyrinth floors use an **edge-based grid** (`Cell.n/e/s/w`: `open | wall | door | locked`) with optional **tile features** and overlay arrays (`treasures`, `lockedDoors`, `npcs`, `events`, `encounterZones`, …). See `src/data/floors.ts` for the canonical `FloorDef` and `docs/floor-map.schema.json` for a JSON Schema of the portable format.

## Quick start

```bash
npm run floor:export-all   # refresh tools/floor-data + public/tools/floor-data
npm run floor:editor       # WYSIWYG editor (vite dev server)
```

A complete example floor ships in `src/content/floors/floor-4-demo.json` ("The Practice Halls") — it exercises every overlay type and is the fastest way to learn the format. Import it into the editor to poke around. Note it is a **format example only** and no longer registered: floor id 4 belongs to the campaign floor "The Null Choir" (`src/content/floors/floor-4.json`), an antimagic chapel beneath the forge. Floor id 5 belongs to the campaign floor "The Weeping Cistern" (`src/content/floors/floor-5.json`), the flooded undercroft below — water/currents (not antimagic) is the floor's mechanical identity. Lore framing: the gods left / century cycle / the kept (see `docs/superpowers/specs/2026-07-25-labyrinth-narrative-design.md`). Do not reintroduce Headmaster/academy copy, and do not use "Echo" or "the First Descent" as player-facing vocabulary — both were retired 2026-07-25. Floor bosses are **The Dead Boy** (F3), **The Lonely Girl** (F4), **The Crying Man** (F5); NPC copy refers to them lowercase and in present tense.

## Campaign floor authoring split

The campaign floors are maintained in two different authoring modes. Do not convert them without an explicit cleanup task:

- **Floors 2 and 3** are authored as imperative TypeScript in `src/data/floors.ts` (`floor2()` and `floor3()`). They predate the JSON pack workflow and still rely on runtime tile/feature mutation.
- **Floors 1, 4, and 5** are authored as JSON packs in `src/content/floors/floor-1.json`, `floor-4.json`, and `floor-5.json` and registered through `src/content/floors/index.ts`.

New floors should be JSON packs. Only edit `src/data/floors.ts` if you are specifically changing Floors 2 or 3.

## Engine constraints you MUST know

These are how the engine actually behaves. The validator flags most of them, but read this once before authoring:

1. **Stairs always use `floorId ± 1`.** `stairs_down` on floor N goes to floor N+1; `stairs_up` goes to N−1 (`handleStairs` in `src/game/features.ts`). There are no explicit stair links. If the implied neighbor doesn't exist, stepping on the stairs shows "there is nothing above/below". For non-contiguous floor ids, use **teleporters** (or chutes for one-way descents).
2. **Stairs land at the target floor's `startX/startY`** — not at the coordinates of any stair tile. If you want "matching stairwells", set the target floor's start under its stairs. Teleporters and chutes land at their explicit `toX/toY`.
3. **`encounterTable` is dead.** The field is deprecated and ignored. Combat encounter tables live in `ENCOUNTER_TABLES` in `src/data/enemies.ts`, keyed by floor id (**1–5** for the campaign). A custom floor id with no table gets **no random encounters** — unless you paint encounter zones with `tableFloorId` pointing at an existing table (this is what the demo floor does). Packs cannot yet define their own tables. **Campaign zones today only set `rateMul`** — none set `tableFloorId`, so safe/hot zones on a floor share that floor's enemy table (frequency differs; pack difficulty does not). Pity still forces a fight by step 28 even when `rateMul` is 0.
4. **Keys are not items.** A `lockedDoors.keyId` must be a freeform id ending in `-key` (e.g. `brass-key`), delivered via a treasure chest's `itemIds`. Chest loot ending in `-key` goes to the party's key ring (`src/game/features.ts`); everything else must be a real item id from `src/data/items.ts`. Every `locked` edge needs a `lockedDoors` entry on one side of the edge or it can never be opened.
5. **NPCs are additive flavor only.** They must never gate keys, stairs, or boss access. `combatEnemyIds` must be real enemy ids (see `src/data/enemies.ts`); enemies with sprite strips in `src/engine/sprite-manifest.ts` look best. Killed NPCs stay dead (persisted by NPC `id` — keep ids unique).
6. **Outside-combat damage floors HP at 1.** Trap/water/event damage can never wipe the party; only combat can.
7. **Vite base is `/OnyxLabyrinth/`.** Theme/sprite art resolves under that base in dev, preview, and GitHub Pages. Use the npm scripts rather than opening HTML files directly.

## Texture themes (your wall/floor/ceiling art)

Drop four PNGs here:

```
public/assets/tilesets/<theme>/
  wall.png
  floorA.png
  floorB.png
  ceiling.png
```

Built-in themes: `f1`, `f2`, `f3`, `f4`, `f5` (campaign). Pick the theme in the editor's Floor panel (or type a custom folder name). The floor's `tilesetTheme` is saved in the JSON; when unset it defaults to `f{id}`. Decor sprite art lives under `public/assets/map-sprites/<id>.png` (manifest: `src/data/map-sprites.ts`).

One floor can paint rectangular regional overrides with `tilesetZones`:

```json
{
  "tilesetTheme": "f1",
  "tilesetZones": [
    { "id": "stacks", "x1": 1, "y1": 2, "x2": 8, "y2": 10, "theme": "f2" },
    { "id": "cistern", "x1": 14, "y1": 8, "x2": 20, "y2": 16, "theme": "f5" }
  ]
}
```

Bounds are inclusive. Cells outside every rectangle use `tilesetTheme`.
Overlaps are allowed but warned by the validator; **the last matching zone
wins**. Floor and ceiling pixels use the sampled map cell's theme. A wall or
door between differently themed cells uses the theme on its near/visible side,
so the same doorway can present the material of whichever room the party is
standing in. The ASCII dump lists zone bounds under `# Overlays`; the editor
preserves imported zones, but regional painting is currently JSON-authored.

## Editor tools

| Tool | Use |
|------|-----|
| **Room** | Drag to carve |
| **Edge** | Paint open / wall / door / locked (symmetric). Painting `locked` auto-adds a `lockedDoors` entry with key `brass-key` — set the real key in the cell inspector. Re-painting a locked edge with anything else removes the lock entry. |
| **Feature** | Stairs, treasure, water, darkness, … |
| **Event** | Place scripted tiles; use templates (lore / dart / heal / loot) |
| **Sprite** | Place static decor (`torch` / `crate` / `bones` / `barrel`) |
| **Zone** | Drag encounter density rectangle (`rateMul` 0 = safe, 2 = hot; optional `tableFloorId`) |
| **Start / Erase** | Party entry / clear a cell's feature + overlays (locked edges on the cell become plain doors and their lock entries are removed) |

**Undo/redo:** Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y).

The cell inspector (Select tool) edits **events** (kind, message, power, item), **treasure** (items + trap), **water** (depth + heal/damage/cure effect), **locks** (every lock on the cell, key id with suggestions), **teleporters**, **chutes**, **NPCs** (quick fields, plus an Advanced JSON editor for topics/trades/gifts — quick-form saves preserve those), and **sprites**. Item/enemy dropdowns come from the data tables.

The validation panel shows every issue (errors block Playtest/shipping; warnings are advisory but read them — they describe real in-game consequences).

## Playtest Floor

1. Author in the editor, then click **Playtest Floor**.
2. The editor writes the map to `localStorage` key `onyx-floor-playtest` and opens `/?playtestFloor=1`.
3. The game boots straight into the dungeon on that floor with the default party (no title screen). Same-origin only: the editor dev server and the game share the origin, so this works out of the box with `npm run floor:editor`.
4. Export JSON + register via `src/content/floors/` when you want it permanent.

`?debug=1` exposes `window.__onyxDebug.registerFloorMap(json)` for live hot-register.

## Ship a custom floor into the game

1. Export JSON from the editor.
2. Copy it to `src/content/floors/<your-floor>.json`.
3. Register it in `src/content/floors/index.ts`:

```ts
import myFloor from "./my-floor.json";
export const EXTRA_FLOOR_MAPS: FloorMapJSON[] = [
  myFloor as unknown as FloorMapJSON,
];
```

4. Every JSON pack is run through `parseFloorMapJSON` at load — malformed files fail fast with a precise error. Stairs / saves / transitions resolve floors through `src/game/floor-registry.ts`, so a pack floor with a campaign id (1–5) **replaces** that campaign floor; new ids extend the list.
5. `npm run floor:check -- --file src/content/floors/<your-floor>.json`
6. `npm test && npm run build`

### Reaching your floor

Campaign floor 3 has a `stairs_down` in the Grand Forge chamber at (5,14) that descends to floor 4, "The Null Choir" (`src/content/floors/floor-4.json`). Floor 4 in turn has a `stairs_down` at (15,15) in its sanctum-unsung climax chamber, descending to floor 5, "The Weeping Cistern" (`src/content/floors/floor-5.json`). A pack with a brand-new id (6+) is unreachable in normal play until you add a connection — e.g. a `stairs_down` on the neighboring floor, or a teleporter. Unconnected packs (like the demo "Practice Halls") are playtest-only.

## CLI

```bash
npm run floor:validate                    # validate all campaign floors
npm run floor:dump -- --floor 1           # ASCII map (add --json for JSON)
npm run floor:export-all                  # write JSON + ASCII for all floors
npm run floor:check -- --file my.json     # parse + validate an export (exit 1 on errors)
npm run check:tools                       # typecheck the editor + CLI
```

`scripts/floor-editor-smoke.mjs` is a Playwright end-to-end check of the editor (carve → lock → NPC → erase → undo → Playtest). Serve the build first: `npm run build && npx vite preview --port 5199 --base /OnyxLabyrinth/`, then `node scripts/floor-editor-smoke.mjs`.

## Encounters

```json
{
  "id": "gallery-hot",
  "x1": 7, "y1": 4, "x2": 10, "y2": 6,
  "rateMul": 2,
  "tableFloorId": 2
}
```

- `rateMul` multiplies the floor's `encounterRate` at those cells (0 = safe zone for the *flat* roll band; pity can still force a fight by step 28 — see `encounterRollChance`).
- `tableFloorId` pulls `ENCOUNTER_TABLES[n]` (from `src/data/enemies.ts`) instead of this floor's table. **This is the only way a custom-id floor gets random encounters** (constraint 3 above). Campaign floors 1–5 currently omit `tableFloorId` on all zones, so safe/hot only change frequency, not pack composition.

## Gating changes

The Pages workflow runs `npm run build` on pushes to `main`, but it does not run the full test suite or floor validator. Before opening a PR that touches floors or the authoring suite, run locally:

```bash
npm run check
```

`npm run check` runs `test:typecheck`, `build`, `test`, and `floor:validate` in one sequence.

## Modules

| File | Role |
|------|------|
| `src/game/floor-map.ts` | Portable JSON format (`formatVersion` 1) ↔ `FloorDef`, strict parsing, tileset theme helpers |
| `src/game/floor-validate.ts` | Linter — geometry, overlays, reachability, item/enemy/key refs, cross-floor links, encounter tables |
| `src/game/floor-ascii.ts` | ASCII dump for LLM workflows |
| `src/game/floor-registry.ts` | Campaign + content packs + hot-register |
| `src/game/encounters.ts` | Zones + pity |
| `src/content/floors/` | Shipped JSON packs (`floor-1.json`, `floor-4.json`, and `floor-5.json` campaign floors; `floor-4-demo.json` format example) |
| `src/data/map-sprites.ts` | Decor sprite manifest |
| `src/engine/map-sprite-cache.ts` | Decor image cache |
| `tools/floor-editor.*` | WYSIWYG UI |
| `scripts/floor-tool.ts` | CLI |
| `docs/floor-map.schema.json` | JSON Schema for `FloorMapJSON` (for LLM/tooling consumers) |
| `public/assets/tilesets/` | Swappable corridor textures |
| `public/assets/map-sprites/` | Static map decor PNGs |
