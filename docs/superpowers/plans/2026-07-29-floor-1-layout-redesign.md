# Floor 1 Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace campaign Floor 1 with a JSON-authored map matching the approved reference layout, canon content, two live inter-floor links, and inert cross-floor exits.

**Architecture:** Author geometry in the WYSIWYG floor editor against the reference image, export `FloorMapJSON`, register via `src/content/floors/index.ts` to override id 1. Retire the hand-carved `floor1()` in `floors.ts`. Add minimal new trinket items and NPC definitions inside the JSON overlays.

**Tech Stack:** TypeScript, Vite floor editor (`tools/floor-editor.ts`), `parseFloorMapJSON` / `floor-validate`, Vitest.

## Global Constraints

- Floor id **1**; tileset theme **`f1`**; name **"The Proving Depths"**.
- Only **two live inter-floor links:** `startX/startY` (town entry) and one **`stairs_down`** to Floor 2.
- Cross-floor portals/chutes/pits → **inert events** (message or damage); no invalid `teleporters`/`chuteDrops` targeting missing floors.
- Secret doors → normal **`door`** edges.
- Keys: **`crypt-key`**, **`brass-key`**, **`lexicon-key`** (F2 chain preserved).
- No Wizardry proper nouns in shipped strings.
- NPCs are additive — never gate stairs or boss access.
- Run **`npm run build`** before claiming done; **`npm test`** for floor/save tests.

---

## File map

| File | Responsibility |
|---|---|
| `src/content/floors/floor-1.json` | New floor geometry + all overlays |
| `src/content/floors/index.ts` | Import and register floor-1.json |
| `src/data/floors.ts` | Remove `floor1()` body; keep `FLOORS` export via stub or empty campaign slot |
| `src/data/items.ts` | `warden-sphere`, `gate-token` trinkets |
| `src/data/floors.test.ts` | Assertions for new layout |
| `src/game/floor-registry.ts` | No change — merge already handles id override |

---

### Task 1: Add MacGuffin trinket items

**Files:**
- Modify: `src/data/items.ts`
- Test: `src/data/floors.test.ts` (treasure item id validation runs over all floors — add items before placing in chests)

**Interfaces:**
- Produces: `ITEMS_BY_ID["warden-sphere"]`, `ITEMS_BY_ID["gate-token"]` as `type: "trinket"` entries.

- [ ] **Step 1: Add trinkets to `items.ts`**

```ts
"warden-sphere": {
  id: "warden-sphere",
  name: "Warden Sphere",
  type: "trinket",
  price: 0,
  description:
    "A fist-sized orb of clouded glass. Something in the labyrinth's bones knows this shape.",
},
"gate-token": {
  id: "gate-token",
  name: "Gate Token",
  type: "trinket",
  price: 0,
  description:
    "A corroded coin stamped with a gate arch. Three more like it might have meant something, once.",
},
```

- [ ] **Step 2: Verify build**

Run: `npm run build`  
Expected: zero TypeScript errors.

---

### Task 2: Author geometry in floor editor

**Files:**
- Create: `src/content/floors/floor-1.json`

**Interfaces:**
- Consumes: reference images (layout + legend), design spec §4–§7.

- [ ] **Step 1: Start editor**

Run: `npm run floor:editor`

- [ ] **Step 2: Set floor metadata**

In Floor panel: id **1**, name **The Proving Depths**, theme **f1**, encounter rate **0.08**.

- [ ] **Step 3: Trace main dungeon (~24×28 grid)**

Using Room + Edge tools against the reference:

1. Northwest entry corridor with **start** at bottom-left upstairs tile (`startX/startY`).
2. Northeast maze (secret doors → paint as **`door`**).
3. Central hub rooms (mask/NPC room, voice-echo room).
4. Eastern wing (silver-key chest area #4, pit trap).
5. Southwest horizontal corridor + alcoves (brass-key branch #6).
6. South checkered room (#5 token portal — **`event`** tile later).
7. Large south-center chamber (star portal #3 orb gate — **`event`** later).
8. Primary **`stairs_down`** at top-left yellow-down location (live link to F2).

- [ ] **Step 4: Trace satellite regions on same grid**

1. Bottom-center vertical wing (voice echo #2, chute tile — event only).
2. Bottom-right 5×5 isolated maze (colossus + lowing saint NPCs).

Connect satellites to main map with **`teleporter`** pairs (same floor id, valid in-bounds targets).

- [ ] **Step 5: Place locks**

| Location | Key |
|---|---|
| Door #1 (silver) | `crypt-key` |
| Door #6 (brass) | `brass-key` |

- [ ] **Step 6: Export JSON**

Save/export to `src/content/floors/floor-1.json`.

- [ ] **Step 7: Validate**

Run: `npm run floor:check -- --file src/content/floors/floor-1.json`  
Expected: exit 0, no errors.

Run: `npm run floor:dump -- --floor 1` (after Task 3 registration) and compare ASCII to reference.

---

### Task 3: Register JSON pack

**Files:**
- Modify: `src/content/floors/index.ts`
- Modify: `src/data/floors.ts`

**Interfaces:**
- Produces: `mergeFloorList()` returns id-1 map from JSON, not TS carve.

- [ ] **Step 1: Import floor-1.json in index.ts**

```ts
import floor1 from "./floor-1.json";

export const EXTRA_FLOOR_MAPS: FloorMapJSON[] = [
  floor1 as unknown as FloorMapJSON,
  floor4 as unknown as FloorMapJSON,
  floor5 as unknown as FloorMapJSON,
];
```

- [ ] **Step 2: Retire `floor1()` in floors.ts**

Replace `floor1()` body with a minimal unreachable stub OR remove from `FLOORS` array entirely if merge is the sole source for id 1. Preferred pattern (matches F4/F5):

```ts
// Floor 1 ships as src/content/floors/floor-1.json (merged at runtime).
// floor1() removed — see mergeFloorList in floor-registry.
export const FLOORS: readonly FloorDef[] = [
  // floor1() removed
  floor2(),
  floor3(),
] as const;
```

Verify `getFloors()` / `findFloor(1)` resolve through `mergeFloorList` in `floor-registry.ts`.

- [ ] **Step 3: Confirm registry**

Run: `npx tsx -e "import { getFloors } from './src/game/floor-registry.ts'; console.log(getFloors().find(f=>f.id===1)?.name)"`  
Expected: `The Proving Depths`

---

### Task 4: Overlays — treasures, events, NPCs

**Files:**
- Modify: `src/content/floors/floor-1.json` (editor or direct JSON edit)

**Interfaces:**
- Consumes: `ITEMS_BY_ID`, existing NPC patterns from old `floor1()` Maro block.

- [ ] **Step 1: Treasures**

| Chest | Items | Trap |
|---|---|---|
| Silver-key (#4) | `crypt-key`, `healing-potion` | none |
| Southwest | `brass-key`, `antidote` | optional `poison` |
| Deep branch | `lexicon-key`, `short-sword+1`, `healing-potion` | optional `gas` |
| Optional | `warden-sphere` in orb-adjacent chest | none |

- [ ] **Step 2: Inert cross-floor tiles → events**

```json
{ "kind": "message", "message": "A sealed arch. Nothing on the other side answers." }
{ "kind": "message", "message": "A slot for gate-tokens. Rust has welded it shut." }
{ "kind": "message", "message": "The chute drops into darkness. Not today." }
{ "kind": "damage", "message": "The floor gives way.", "power": 6 }
```

Voice echo (#2): `"The walls repeat your footsteps a half-beat late — as if someone else walked here first."`

Orb gate (#3): `"A circular recess waits for a warden sphere. Yours is empty-handed."`

- [ ] **Step 3: NPCs (minimum viable)**

**Maro** — reposition; keep existing topics + combat id `ironclad-knight`.

**Voss** — greeting + topics (hints toward silver key in east).

**The Cauldron** — non-combat flavor; `combatEnemyIds: []` or omit attack.

**The Shackled Colossus** / **The Lowing Saint** — SE pocket; assign `combatEnemyIds` from floor-1 enemies with sprites (e.g. `acid-puddle`, `skeleton`).

- [ ] **Step 4: Encounter zones**

```json
{ "id": "entry-safe", "x1": ..., "y1": ..., "x2": ..., "y2": ..., "rateMul": 0.5 }
{ "id": "maze-hot", "rateMul": 1.5 }
{ "id": "pocket-hot", "rateMul": 2.0 }
```

- [ ] **Step 5: Re-validate**

Run: `npm run floor:check -- --file src/content/floors/floor-1.json`

---

### Task 5: Update tests

**Files:**
- Modify: `src/data/floors.test.ts`
- Modify: `src/game/floor-validate.test.ts` (if lexicon-key chest coords change)

**Interfaces:**
- Consumes: merged `getFloors()[0]` or `findFloor(1)`.

- [ ] **Step 1: Update stair assertions**

Floor 1 must contain `stairs_down`, must NOT contain `stairs_up`:

```ts
const f1 = findFloor(1)!;
const tiles = featureCells(f1.grid).map((c) => c.tile);
expect(tiles).toContain("stairs_down");
expect(tiles).not.toContain("stairs_up");
```

- [ ] **Step 2: Update reachability test source**

Ensure `getFloors()` or merged floor list includes JSON floor 1:

```ts
import { getFloors } from "../game/floor-registry";
for (const floor of getFloors()) { ... }
```

- [ ] **Step 3: Update lexicon-key / crypt-key coordinate assertions**

Replace hard-coded `(10,9)` / `(3,5)` coords with new chest positions from `floor-1.json`.

- [ ] **Step 4: Run tests**

Run: `npm test`  
Expected: all pass.

---

### Task 6: Refresh exports & manual smoke

**Files:**
- Modify: `tools/floor-data/floor-1.json`, `tools/floor-data/floor-1.txt` (via script)
- Modify: `public/tools/floor-data/floor-1.json`, `public/tools/floor-data/floor-1.txt`

- [ ] **Step 1: Export all floor data**

Run: `npm run floor:export-all`

- [ ] **Step 2: Build**

Run: `npm run build`

- [ ] **Step 3: Manual smoke (browser)**

Run: `npx vite preview --port 5176 --base /OnyxLabyrinth/`

Checklist:

1. New game → town → dungeon → spawn at start (bottom-left).
2. Crypt-key opens door #1.
3. Brass-key opens door #6.
4. `stairs_down` → Floor 2.
5. Inert portal/chute/pit tiles show message or damage only.
6. Teleporter reaches SE pocket.

---

## Plan self-review

| Spec requirement | Task |
|---|---|
| JSON pack delivery | Task 2, 3 |
| Two live inter-floor links | Task 2 (stairs + start) |
| Inert cross-floor exits | Task 4 |
| Secret doors → door | Task 2 |
| Canon names | Task 4 |
| lexicon-key chain | Task 4 |
| warden-sphere / gate-token | Task 1, 4 |
| Tests + validation | Task 5, 6 |

No placeholders remain.
