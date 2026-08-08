# Maze Environment Art — Coverage Audit

**Audited commit:** `c590d09bb4e076c4fb2ebadf3a85ef80e66a500b` (main)
**Scope:** Part 1 of a planned environmental-art pass — inventory what the maze currently shows the player vs. what the existing floor content (events, NPCs, traps, treasures) already implies should be visible, and scope the technical work needed to close the gap. **No art has been generated and no rendering code has changed yet** — this document is the audit deliverable that a generation pass should be scoped from.

Status vs. `docs/AGENT-READING-LIST.md`: this is a new document, not yet added to the reading list. Add it once the plan below is acted on.

---

## 0. Related prior work — read before duplicating

- **`docs/MAZE-EVENT-SPRITE-PROMPT.md`** (current) already proposes a 17-item prop list mapped to the same `TileFeature`/`EventDef` hooks this audit uses, and documents that the props which *have* shipped (`chest-closed/open`, `cistern-basin`, `antimagic-ward`, `darkness-idol`, `teleporter-disc`) were built deterministically — recolored 16×16 cells harvested from the in-repo "Classic Dungeons" PICO-8 pack via `scripts/generate-maze-props.mjs` — not via AI image generation. [[Pixel art: procedural vs harvest]] applies here too: harvest for objects, procedural/recolor for materials.
- **`docs/TILESET-ART-STYLE-GUIDE.md`** (current) is authoritative for palette/material identity per floor and for the wall/floor/ceiling contract; §10 documents the shipped fog/torch/vignette treatment.
- **`docs/PROMPT-maze-art-direction-pass.md`** — a predecessor prompt scoped to the corridor renderer itself (fog, torch, door panels). Already executed (commits `ca927a9`…`0ff6394`). Do not re-litigate; its output is now §10 of the tileset guide.
- **`docs/content-delta-floors-1-5.md`** — a separate, unimplemented proposal to add a *new* recurring "broken mirror shard" motif (5-6 new map sprites + events) across all floors. This is additive new content, not a visualization of existing content, so it doesn't overlap this audit — but if it's ever implemented, its mirror-shard sprites would enter the same generation queue. **Its "current state" baseline is stale for floors 1 and 3**: it claims F1 has 0 map sprites and F3 has 0 events/0 NPCs, but this audit's extraction (§2) found 7 map sprites already on F1 and 7 events + Kazeharu already on F3. Its F4/F5 counts do match. Don't trust its per-floor counts without re-checking.
- **PixelLab tooling**: `scripts/pixellab-generate.mjs` and `scripts/pixellab-animate.mjs` (currently untracked, uncommitted) are plain REST scripts against `api.pixellab.ai/v2/*` using `PIXELLAB_API_KEY` from `.env` — there is **no MCP server configured** in this repo (`.mcp.json` doesn't exist). `pixellab-animate.mjs` is built for the 100×100 combat-strip contract and isn't directly reusable for maze props/wall art as-is; `pixellab-generate.mjs` (single pixflux image, configurable size, optional palette lock) is the closer fit for props. Neither script nor the `.env` convention is documented in `AGENTS.md` yet — worth a short doc addition whenever this pipeline is actually used for maze art, so it isn't reinvented per-session.
- **Untracked stray files** in `public/assets/enemies/` and `public/assets/party/` (`headmasters-echo/idle.png.png`/`.pxo`, `skeleton/idle2.png`, `summon-celestial/untitled.png`/`.pxo`, `halberdier/test`, `mage/test.png`, `mage/idlered.png`) look like in-progress combat-sprite work from a separate task. Not touched by this audit; flagging so a future cleanup pass doesn't mistake them for orphaned output of this one.

---

## 1. How the maze actually renders today (technical baseline)

| System | Current behavior | File:line |
|---|---|---|
| Wall art | Keyed by **(theme, edge-type)** only — every wall face in a themed zone samples the same repeating `wall.png`. No per-edge/per-face override exists. | `renderer.ts:1271-1294`, `floor-map.ts:143-153` |
| Doors / locked doors | Real per-edge-type art (`f{n}_door_256.png`), same theme-keying as walls. | `renderer.ts:1309-1367` |
| Stairs | **No dedicated art.** An `open` edge into a stairs tile is coerced to `door` type and reuses the door panel (`isStairExitFeature`, `render-math.ts:31-49`). Underfoot glyph is explicitly suppressed. | `render-math.ts:31-49`, `renderer.ts:1434` |
| Map sprites (decor) | Static single-PNG billboards placed by `{x, y, spriteId}`, no facing/orientation, no animation frames, no state field (state variants are separate sprite ids, e.g. `chest-open` vs `chest-closed`). Sizing is **uncapped** perspective scale (`decorSpriteSize`, `renderer.ts:799-802`) — floored at 8px, no ceiling — so a statue/altar's on-screen scale is controlled purely by its authored `baseSize`; a deliberately large `baseSize` can loom. | `data/map-sprites.ts:5-31`, `renderer.ts:799-802, 804-838` |
| Feature props (treasure/teleporter/antimagic/darkness/water) | Auto-resolved billboard per `TileFeature`, in preference order, first cached id wins, glyph fallback. No coordinate/facing system — 1:1 with existing grid tiles. Sizing here **is** capped at 55% of corridor wall height at that depth (`PROP_MAX_WALL_FRAC`, `render-math.ts:488-503`) so e.g. a chest can't outscale the room — this cap applies only to these five feature types, not to decor `mapSprites`. | `data/maze-props.ts:20-55`, `renderer.ts:852-927` |
| NPC tiles | **No billboard at all** — only a `"&"` text glyph. `featurePropSpriteIds("npc")` returns `[]`. `NPCController` is a dialogue-menu overlay only, no canvas geometry. | `renderer.ts:983-984`, `maze-props.test.ts:29`, `npc-ui.ts` |
| Event tiles | **Deliberately excluded** from any corridor marker (`isCorridorMarkerFeature`, `render-math.ts:451-457`) — by design, so one-shot narrative/ambush events stay concealed until stepped on. `EventDef` has no visual field at all. | `render-math.ts:451-457`, `floors.ts:124-135` |
| Per-wall-face decoration | **Confirmed: does not exist.** No `wallFeature`/`edgeArt` concept anywhere in `src/` or `docs/`. | — |
| Floor/map editor | Real editor at `tools/floor-editor.ts`. New `mapSprites` entries register automatically (it iterates `MAP_SPRITES`); feature-tile props need zero editor work (implicit from `Cell.tile`). A `wallFeatures` system would need one new editor tool mode, following the existing edge-tool pattern. | `tools/floor-editor.ts:21, 1098-1115` |

**Checked and downgraded:** `LOOTED_TREASURE_SPRITES = ["chest-open", "chest-empty"]` (`maze-props.ts:38`) lists `chest-empty` second, and no such id is registered in `MAP_SPRITES_BY_ID`. This is **not** a live bug — `chest-open.png` *is* registered, `drawFeatureBillboards` draws the first cached id in the list, so every looted chest already resolves to `chest-open` and never reaches the unregistered fallback. Confirmed via `grep -rn "chest-empty" src/` (only the one reference) and a clean `maze-props.test.ts` run (9/9 passing). It's dead/redundant data worth deleting for clarity, not a player-visible defect — removed from Wave 1 below.

**Architecture verdict:** a `wallFeatures` overlay — `{x, y, dir: "n"|"e"|"s"|"w", spriteId}`, mirroring the existing `mapSprites` shape but keyed by edge instead of cell — is additive, not a rewrite. It slots into the existing wall-strip draw loop as a post-composite after the current wall texture, reuses the `themeForWallHit`-style lookup pattern, and reuses the editor's existing overlay-array plumbing. This is the single highest-leverage system extension available: it's the prerequisite for switches, wall plaques, wall-mounted statues/relief, and (with more work) real stairwell architecture. It should be scoped as its own small PR before wall-feature art generation starts, not improvised inline.

A second, smaller, equally high-leverage extension: an **NPC maze-sprite hook** (`NPCDef.mapSpriteId?`, rendered as a billboard the same way decor sprites are, at the NPC's existing tile). Five NPCs across five floors currently show only as `&`; wiring one generic hook pays for all five at once.

---

## 2. Coverage audit by floor

Legend — **Tier**: A = pure art, drop-in via existing `mapSprites`/feature-prop channel · B = needs the wallFeatures system (small extension, §1) · C = needs the NPC-sprite hook or another small generic hook · D = large/deferred (real stair architecture, secret doors). **Priority**: H/M/L, blending content fidelity + visual/navigation impact + integration ease per Part 17 of the source brief.

**Placement mechanism differs by floor** — floors 1, 4, 5 are editor-exported JSON (`src/content/floors/*.json`); the floor editor (`tools/floor-editor.ts`) can place new `mapSprites` entries directly. **Floors 2 and 3 are hand-carved TypeScript** (`floor2()`/`floor3()` in `src/data/floors.ts`) — any Tier A candidate on those two floors means hand-editing the `mapSprites` array in `floors.ts`, not using the editor. This affects roughly half of Wave 1 below (both F2 candidates, both F3 candidates).

### Floor 1 — The Hall of Five Wounds (crypt)

| Coord | Content source | Current visual | Proposed art | Tier | Priority |
|---|---|---|---|---|---|
| (5,6) | Event: "THE THIRD BELL HAS NO TONGUE" | none | Freestanding bell, clapper missing | A | M |
| (11,14) | Event: "lamp-shaped lock" at the crypt-key door | plain door | Lamp-shaped lock decal on the door/wall | B | M |
| (18,6) | Event: "Iron sweats. Something below coughs" | none | Sweating iron grate wall decal | B | L |
| (9,19)/(3,15) | Events: shelves erupting through crypt stone | none | Freestanding broken bookcase prop | A | L |
| (10,20) Oren | NPC, holds a severed bell-rope | `&` glyph | NPC billboard + rope-stub detail | C | H |
| (5,18) Rill-of-Pages | NPC, folds paper doors | `&` glyph | NPC billboard | C | M |
| (20,18) Tallow-in-a-Boat | NPC, sits in a grounded boat | `&` glyph | NPC billboard + boat prop (boat could ship as Tier A prop even before the NPC hook lands) | A/C | H |
| (7,8) Sister Caldris | NPC, kneeling | `&` glyph | NPC billboard | C | M |
| 6 chests | `treasure` tiles | resolves via maze-props already | — (already covered) | — | — |
| (11,12) crypt-key door | de facto floor-1 "boss door" | themed door panel | Candidate for a unique door face if F1 gets a landmark pass | D | L |

### Floor 2 — The Cursed Library

| Coord | Content source | Current visual | Proposed art | Tier | Priority |
|---|---|---|---|---|---|
| (8,2) | Event: falling bookcase, 6 dmg | none | Toppled/toppling bookcase, physically concrete hazard tell | A | H |
| (3,11) | Event: brazier, heal +5, explicit prop | none | Brazier — safe-corner landmark | A | H |
| (11,10) | Event: brass plaque "MIND THE STEP" | none | Wall plaque decal | B | M |
| (7,8) | Event: cracked lens in false-bottom drawer | reward event, no visual | Small drawer/lens prop | A | L |
| (2,9) | Event: wall graffiti "DO NOT FEED THE BOOKS" | none | Wall graffiti decal | B | L |
| (11,4) | Event: librarian's journal | none | Journal/book prop on the floor | A | L |
| (1,1) Vestra | NPC, no physical description in text | `&` glyph | NPC billboard (design a canonical look; text gives no constraints) | C | M |
| 2 chests | `treasure` tiles | resolves via maze-props already | — | — | — |

### Floor 3 — The Forge of Ashes (richest floor for this pass)

| Coord | Content source | Current visual | Proposed art | Tier | Priority |
|---|---|---|---|---|---|
| (6,11) | Event: statue beside Grand Forge door, foreshadows animating guardian | none | **Guardian statue**, boss-door landmark | A/B | H |
| (7,7) | Event: anvil altar, heal +6, explicit prop | none | **Anvil altar**, forge-room focal object | A | H |
| (14,9) | Event: smith fused to wall, hammer raised | none | Fused-corpse wall relief — strong, unique | B | H |
| (8,2) | Event: pressure plate + flame jet, 8 dmg | none | Pressure plate (floor) + flame-jet nozzle (wall) | A/B | H |
| (13,10) | Event: iron grate over magma, 6 dmg | none | Grate over visible magma glow | A/B | M |
| (1,9) | Event: guard's satchel, reward | none | Satchel prop against the wall | A | M |
| (2,6) | Event: bronze plate "HE IS STILL WARM" | none | Wall plaque decal | B | L |
| (3,9) Kazeharu | NPC, no physical description | `&` glyph | NPC billboard (canonical design, text-unconstrained) | C | M |
| (7,11)/(7,12) | Grand Forge boss door | themed door panel | Candidate unique boss-door face (iron-heavy) | D | M |
| 5 chests | `treasure` tiles | resolves via maze-props already | — | — | — |

### Floor 4 — The Null Choir

| Coord | Content source | Current visual | Proposed art | Tier | Priority |
|---|---|---|---|---|---|
| (6,7) | Event: row of stone choristers, one head turned | none | **Stone chorister statues** (2-3 billboard instances), strongest set-piece on this floor | A | H |
| (13,5) | Event: cantor's lectern + silver-wired hymnal, reward | none | Lectern + hymnal focal prop | A | H |
| (10,2) | Event: cracked bells overhead, 10 dmg (once) | none | Cracked bell (wall-mounted or overhead) | A/B | M |
| (2,6) | Event: plaque "SHE IS STILL WRITING" | none | Wall plaque decal | B | L |
| (2,10) Vesper | NPC, explicit: pale woman in choir vestments, holds a slate | `&` glyph | NPC billboard — text gives real constraints to design from | C | H |
| (13,13)/(13,14) | Sanctum boss door | themed door panel | Candidate unique boss-door face (choir/silence motif) | D | M |
| 6 chests | `treasure` tiles | resolves via maze-props already | — | — | — |

### Floor 5 — The Weeping Cistern

| Coord | Content source | Current visual | Proposed art | Tier | Priority |
|---|---|---|---|---|---|
| (2,7) Ossian | NPC, explicit: stooped man in oiled leathers, stands at a valve wheel | `&` glyph | NPC billboard + **valve wheel** set-piece prop | A/C | H |
| (2,6) | Event: rusted valve plate, pairs with Ossian | none | Wall-mounted valve plate decal | B | M |
| (10,2) | Event: sluice gate judders open, 8 dmg (once) | none | Sluice-gate mechanism, wall/floor | A/B | M |
| (9,4) | Event: drain-lip inscription "COUNT THE DRIPS" | none | Drain grate + inscription decal | B | L |
| (3,8) | Event: loose-stone cache, reward | none | Loose/displaced masonry block | B | L |
| (11,14)/(11,15) | Undersong boss door | themed door panel | Candidate unique boss-door face (water/dread motif) | D | M |
| 6 chests | `treasure` tiles | resolves via maze-props already | — | — | — |

---

## 3. Systemic opportunities (cut across all floors)

1. **NPC maze-sprite hook** — **Shipped 2026-08-08** (`NPCDef.mapSpriteId?` + resolution in `drawFeatureBillboards`, see `docs/MAZE-EVENT-SPRITE-PROMPT.md` for the wiring notes and prompt #21). Deliberately proven with one vertical slice (Vesper, F4) rather than all eight at once. Oren, Rill-of-Pages, Tallow-in-a-Boat, Sister Caldris, Vestra, Kazeharu, and Ossian are still bare `&` glyphs — the hook is ready for them, but generating their art is an explicit future pass, not a continuation of the session that built the hook.
2. **`wallFeatures` overlay system** — Tier C/B, the prerequisite for every wall plaque, valve plate, fused-relief, and statue-in-wall candidate above (roughly a dozen M/H candidates depend on it). Scoped in §1.
3. **Stairs as architecture / secret doors** (the Eye-of-the-Beholder-style ambition from the original brief) — real value, but Tier D: touches the raycast wall-hit → door-panel substitution path (`render-math.ts:31-49`) and needs floor-specific stairwell art per theme. Recommend scoping as its own follow-up after `wallFeatures` ships and proves out the wall-overlay compositing path, not as part of Wave 1.
4. **Boss-door unique faces** (5 candidates, one per floor's locked boss/wing door) — good landmark value, but each needs its own asset matched to the floor's material language; treat as Wave 2, after the generic wallFeatures/statue/plaque work establishes the pipeline.

---

## 4. Recommended Wave 1 (pending go-ahead — nothing generated yet)

Ordered by the H-priority rows above, capped at 8 per the source brief's generation-budget discipline:

1. NPC maze-sprite hook (system) → immediately covers Oren, Vesper, Ossian as first NPC billboards (richest text constraints)
2. Guardian statue — F3 (6,11), beside Grand Forge door — hand-edit `floors.ts` (TS floor)
3. Anvil altar — F3 (7,7) — hand-edit `floors.ts`
4. Brazier — F2 (3,11) — hand-edit `floors.ts`
5. Stone chorister statues — F4 (6,7) — editor-placeable (JSON floor)
6. Ossian's valve wheel — F5 (2,7) — editor-placeable
7. Toppled bookcase hazard tell — F2 (8,2) — hand-edit `floors.ts`
8. Tallow-in-a-Boat's boat prop — F1 (20,18) — editor-placeable, ships even before the NPC hook lands

Items 2-8 are all Tier A (existing `mapSprites` channel, zero renderer change, sized via `baseSize` alone — no wall-height cap applies to decor sprites, so the statue and choristers can be authored to loom without needing `wallFeatures` first). `wallFeatures` itself is deliberately **not** in Wave 1 — it's infrastructure, not player-visible art, and should land as its own small reviewed PR before Wave 2 (the plaque/valve-plate/fused-relief candidates) starts.

## 5. Open decisions before generation starts

- Confirm Wave 1 list above (or reorder).
- Confirm whether to build the `wallFeatures` system now (unlocks ~12 Tier B candidates for Wave 2) or defer it.
- Confirm PixelLab generation approach: extend `scripts/pixellab-generate.mjs` for props (nearest fit today), or invest in the MCP-based workflow described in the original brief (no MCP server currently configured).
- Confirm generation-log location (`art/pixellab/maze-environment-generation-log.md` per the original brief) before any API calls are made.
