# Prompt: Floor 2 ("The Cursed Library") Redesign — Mechanic Arc + Climax

**Progress (2026-08-05/06): Phases A-E are implemented and unit-tested.** A fresh browser playthrough is still required before this pass can be called fully verified —
see each phase's section below for exactly what landed.

You are a senior game/systems engineer on **OnyxLabyrinth** (`/home/sloppymo/OnyxLabyrinth`).
Work with full autonomy: explore, implement, test, prove in browser/playtest, and update the reading-list docs.
Do **not** commit or push unless asked.

## Why this pass (post 2026-08-05 design audit)

A design audit of Floor 2 plus a follow-up correction pass concluded: **keep the map, keep the
art, keep Vestra, keep the topology — the floor is missing a mechanical arc and a climax.**
This doc supersedes the first audit's raw numbers/citations (corrected below) and its
implementation handoff (sharpened below). Read this doc in full before touching code; it already
resolves the disagreements between the audit and its correction pass so you don't have to
re-derive them.

**Do not** treat this as "Floor 2 needs a rewrite." It doesn't. Six things must survive untouched:
1. The bookshelf/checkerboard visual identity and tileset (`tilesetTheme: "f2"`).
2. The shelf-island reading-hall layout (`carveHorizontal`/`carveVertical` calls at
   `src/data/floors.ts:227-236`).
3. Vestra — dialogue, hidden `books` topic, the antidote→robe+2 trade, the Floor-3-boss
   foreshadowing line (`echo` topic). Do not edit `src/data/floors.ts:296-313`.
4. The key chain: lexicon-key (from Floor 1) → forbidden wing → furnace-key (used on Floor 3).
5. The event-writing style: short, evocative, no lore dumps.
6. The loop-with-rewarded-dead-ends topology at this map scale (14×14).

## Facts the first audit got wrong — use these numbers, not the audit's

- **Floor size**: Floor 2 is 14×14 = 196 cells. Floor 1 (`src/content/floors/floor-1.json`) is
  24×28 = 672 cells. Floor 2 is **~29% of Floor 1's area**, not "one-sixth" (~17%). Verified by
  reading both dimension fields directly.
- **Combat escalation is real, just not enough.** Verified directly against
  `docs/playtests/2026-07-25-per-floor-combat-difficulty.md:59-61` (fixed L8, N=15/floor): F1→F2
  mean rounds go 1.07→2.27 (more than double) and mean HP lost go 0.8%→4.8% (6x). That is a real
  step up — just still far short of F2→F3's cliff (4.8%→23.2% HP lost, 0%→40% near-wipe rate).
  Describe Floor 2 as "a real but insufficient intermediate step," not "barely moves."
- **Ring of Water Walking is not a good Floor-1-backport fix.** On `origin/floor1/raft-tavern-redesign`
  (open PR #26, not yet merged), `src/data/floors.ts` documents `raftChannel` tiles explicitly:
  *"Walking and Levitate do NOT bypass raft channels. Only automatic raft [routes]..."* — the ring
  is not called out as an exception, and `handleWater` (the ring's actual bypass path,
  `src/game/features.ts:483-486`) never runs on a `raftChannel` tile, since raft crossings are a
  separate scripted-route system (see `raftRoutes` in that branch's `floors.ts`). **Do not**
  recommend moving/duplicating the ring to Floor 1 as a raft-crossing fix — it wouldn't work if
  PR #26 lands first. Instead: reassess whether the ring has a legitimate payoff on a **later**
  floor's water (Floor 5, "The Weeping Cistern," is the obvious candidate — check
  `src/data/enemies.ts:941-943` context and that floor's def for standing water first), or replace
  it in Floor 2's forbidden-wing chest with something that pays off immediately.
- **The "reused mad-science pack" claim is only half right — get the citation correct.**
  `src/data/enemies.ts:135` has a real, intentional Floor 2 section header: *"Floor 2: The Cursed
  Library — armored dead, orc scavengers, cursed scribes."* Armored Skeleton, Orc, Failed
  Experiment, Lab Assistant, and Displacer Beast (lines 137–256) are **inside that header block**
  — orc is explicitly called out as intentional. The real "Pack 02" reuse is narrower: Gaze Wraith
  (`eyeball-monster`) and Ghostfire sit under the `// Pack 02 demon / forge-themed enemies` comment
  at line 395 (inside the *Floor 3* section of the file, tagged `floors: [2]`), and Blood
  Monster/Blood Wraith sit under `// Pack 02 remaining variants` at line 656. So: don't rename Orc
  (it's intentional theme); the actual naming-fit gap is narrower — Failed Experiment, Lab
  Assistant, and Displacer Beast don't read as "cursed scribes" despite being authored for this
  floor, and Gaze Wraith/Ghostfire/Blood Monster/Blood Wraith are genuinely pack-sourced (though
  their *names* already read fine thematically — undead/haunting words — so they need no fix).
  Net: only Failed Experiment / Lab Assistant / Displacer Beast are worth a naming/flavor-text
  pass; do not touch Orc, and do not treat the whole roster as "reused."
- **`src/data/floors.test.ts` (10.8KB, exists) has no assertion pinned to tile `(8,2)`, `(7,2)`,
  `floor2`, `Cursed Library`, or `darkness`.** Confirmed by grep against the file directly — the
  darkness/event fix below is safe to make without a compensating test update, though you should
  still add a new test (step 7).

## Confirmed mechanism: the darkness/event tile clobber (real bug, small fix)

`src/data/floors.ts` (`floor2()`) calls, in order:
```
setTile(grid, 7, 2, "darkness");
setTile(grid, 8, 2, "darkness");
...
setTile(grid, 8, 2, "event");   // silently overwrites (8,2)'s darkness tile
```
Each cell has one `tile` field (`src/game/dungeon.ts`, `setTile` is a plain overwrite), so `(8,2)`
ends up as an `event` tile, not `darkness`. Confirmed independently via
`npx tsx scripts/floor-tool.ts dump --floor 2` — the ASCII map shows `D` only at `(7,2)` and `!` at
`(8,2)`.

Whether the player still experiences `(8,2)` as dark depends on approach direction. In
`src/game/features.ts:73-108` (`handleTileFeature`), the `event` case never touches
`state.inDarkness`/`state.inAntimagic` — only "no feature" (line 74-76) and the `darkness`/`antimagic`
cases themselves touch those flags. So walking west→east, `(7,2)`'s `inDarkness = true` is still
set when the player steps onto `(8,2)` — the bookcase-collapse event fires "in the dark" **by
inheritance, not by authored intent**. Approached from the east (backtracking from the
scriptorium), `(8,2)` was never preceded by a darkness tile, so the event fires in full visibility.
Confirmed by direct code read, not inference.

The same root cause applies to the forbidden-wing chest: the actual `darkness` tile is `(11,8)`,
adjacent to (not on top of) the treasure at `(12,8)` — same directional dependency.

## Do this in order (A → E). Do not skip ahead.

### Phase A — Fix the darkness/event clobber (small, do first) — DONE 2026-08-05

1. In `floor2()`, leave both `setTile(grid, 7, 2, "darkness")` and `setTile(grid, 8, 2, "darkness")`
   calls in place. Move the `setTile(grid, 8, 2, "event")` call to `(9, 2)` — confirmed free floor
   tile in the current map (part of the north corridor, `carveHorizontal(grid, 4, 12, 2)`). Move
   the matching entry in the `events` array (`{ x: 8, y: 2, kind: "damage", ... }` →
   `{ x: 9, y: 2, ... }`).
2. This gives the player two real dark tiles in a row from either direction, then the bookcase
   collapses just past the dark stretch, on lit ground — matches the intended "whisper → cost"
   pairing regardless of travel direction.
3. Do the same audit for the forbidden-wing pair: confirm `(11,8)` darkness + `(12,8)` treasure
   still reads correctly from both the north approach (through the locked door at `(10,7)/(11,7)`)
   and don't let a future edit collide a feature onto `(11,8)`.
4. Re-run `npx tsx scripts/floor-tool.ts dump --floor 2` after the change; confirm `D` appears at
   both `(7,2)` and `(8,2)`, and `!` has moved to `(9,2)`.

### Phase B — Give Floor 2 its own mechanic arc (not antimagic — that's Floor 3's) — DONE 2026-08-05

Shipped as: one `event` at `(7,6)` (between the shelf islands, a whispering-book beat tying
into the furnace/echo foreshadowing) and one `antimagic` tile at `(11,6)` (just inside the
forbidden wing). Both verified via `floor-tool.ts dump --floor 2`.

Floor 3 owns antimagic as its central mechanic; don't duplicate it as Floor 2's main identity.
Floor 2's thesis should stay specific to the library: **living/whispering books, unreliable
written knowledge, darkness, hostile architecture.** A brief one-tile antimagic *foreshadowing*
beat near the forbidden wing is fine (rehearses Floor 3 without stealing its reveal) — do not build
more than one small pocket.

1. After Phase A, the darkness beat is already a real two-tile demonstration on the safe route.
2. Add one small interactive beat to the **reading hall** (currently zero events — the floor's
   most visually invested room is its emptiest). Use one of the free floor cells inside the
   shelf-island layout (check the dump output for open cells around `(6-8, 6-9)` that aren't wall
   or already an aisle boundary). A short `message` event is enough — e.g. a shelf that repeats
   part of Vestra's `echo` line, or a wrong-answer/right-answer catalogue beat. Keep it one event,
   not a new subsystem.
3. Optional, small: a single `antimagic` tile in the forbidden wing near `(11,8)`/`(12,8)`, paired
   with the existing darkness tile there — "spells fail near the forge below" as a one-line
   foreshadow, using the exact same `setTile(grid, x, y, "antimagic")` pattern already proven on
   Floor 3. Do not add a whole antimagic chamber; that's Floor 3's job.

### Phase C — Real climax on the mandatory chest, not the optional one — DONE 2026-08-05

Shipped exactly as specified in steps 1-3 below: `ENCOUNTER_TABLES[6]` added (three curated
back-row-only formations of Gaze Wraith/Blood Wraith, weighted 3/2/2), `tableFloorId: 6` set on
`forbidden-wing-hot`, furnace-key chest trap flipped to `"alarm"`. Verified by direct script
(`encounterTableFloorId(f2, 12, 8)` → `6`; atrium still → `2`; five rolls all resolved real
Gaze Wraith/Blood Wraith formations) and by two new regression tests in `floors.test.ts` +
`features.test.ts`.

**Two things step 4/5 below didn't anticipate, resolved during implementation:**
- **Step 4 (relocate the paralysis beat) was dropped, not moved.** `"stunner"` is a *chest-trap*
  type (`TrapType`), not a standalone tile/event kind — the engine has no way to fire a
  paralysis beat outside a treasure chest. Adding a second chest to preserve it would be new
  loot/scope creep the "out of scope" section rules out. Verdict: let it go; the alarm chest's
  forced fight is a strictly bigger beat than the paralysis it replaces.
- **A real guardrail test broke and needed updating, not bypassing.**
  `src/data/enemies.test.ts`'s "has a table for every registered floor and no orphan tables"
  test asserted `ENCOUNTER_TABLES` keys match floor ids 1:1 — it didn't know about
  zone-only `tableFloorId` overrides. Rewrote it to accept any table key reachable from either
  a floor id *or* some floor's `encounterZones[].tableFloorId`, so it still catches genuinely
  dead tables while allowing the intended pattern.

Currently the only working forced-encounter mechanism (`trap: "alarm"` → `handleTreasure` sets
`alarm: true`, `src/game/features.ts:859-861` → `main.ts:1160-1161` calls `forceEncounter()`) sits
on the **optional** scriptorium chest (`{ x: 12, y: 3, ... trap: "alarm" }`,
`src/data/floors.ts:294`), while the floor's actual mandatory payoff — the furnace-key chest —
uses `trap: "stunner"` (paralysis, no combat). Fix scope is a data change, but "just flip the trap
type" is not enough to read as a climax — `forceEncounter()` rolls the ordinary
`ENCOUNTER_TABLES[2]` pool (no `tableFloorId` override on either the `forbidden-wing-hot` zone or
`forceEncounter()` itself), so today it would just be a normal hallway fight with a scarier name.

**Confirmed API — no ambiguity, follow this exactly:**
`forceEncounter()` (`src/main.ts:1166-1188`) calls
`encounterTableFloorId(state.floor, state.player.x, state.player.y)`, which
(`src/game/encounters.ts:301-309`) resolves the **zone at the player's current position** and
returns `zone?.tableFloorId ?? floor.id`. The player is standing on `(12,8)` — inside the
`forbidden-wing-hot` zone (`11-12,6-9`) — at the exact moment the chest triggers the alarm, so
setting `tableFloorId` on that zone is sufficient; `forceEncounter()` will pick it up automatically
with no fixed-formation workaround needed. `ENCOUNTER_TABLES` (`src/data/enemies.ts:1177`) is a
plain `Record<number, EncounterEntry[]>` currently keyed `1`–`5` by floor id — `floor-validate.ts`
only checks that `tableFloorId` resolves to *some* key in that record, so a new synthetic key (e.g.
`6`) works fine and is the precedent-following approach (see `encounters.test.ts:155`'s
`tableFloorId: 3` for how zone overrides are already used elsewhere, and
`floor-validate.ts:520-524` for the validation that will catch a typo'd id).

1. Add a new entry to `ENCOUNTER_TABLES` in `src/data/enemies.ts` — e.g. key `6`, "Forbidden Wing —
   the stacks' keepers" — as 1-3 curated formations biased toward Gaze Wraith (`eyeball-monster`)
   and Blood Wraith, the floor's evasive/flying/silence line and the closest existing fit for "the
   stacks' keepers." No new enemy art needed.
2. Set `tableFloorId: 6` on the `forbidden-wing-hot` encounter zone in `floor2()`
   (`src/data/floors.ts`, the `encounterZones` array).
3. Change the furnace-key chest's trap from `"stunner"` to `"alarm"` (`src/data/floors.ts:301`).
4. If you don't want to lose the paralysis beat entirely, add it as a second small feature
   elsewhere in the forbidden wing rather than dropping it — check for a free tile in `(11-12,6-9)`.
5. Softlock check (mostly already handled by existing engine behavior — verify, don't reinvent):
   the inert-treasure guard in `handleTileFeature` (`src/game/features.ts:68-77`,
   `cell?.tile === "treasure" && isTreasureLooted(...)` → returns `null` before reaching
   `handleTreasure`) means a looted chest can never re-set `alarm`, so the forced fight cannot
   re-fire on a return visit or after a reload post-loot. Still confirm empirically: the party can
   flee or lose the forced fight and return later to loot the (now-unlocked, not-yet-opened) chest
   normally, and that a save/reload taken mid-fight resumes correctly rather than re-rolling.

### Phase D — Forbidden wing visual + encounter differentiation — DONE 2026-08-05

`assets/tilesets/f2-redo/` had no unused variant (same 4 slots as shipping f2), so this shipped
as a baked palette recolor rather than new art, following the "small scope, not a new tileset"
guidance literally: `scripts/generate-f2b-tileset.mjs` applies the same HSL hue-rotation technique
already used for enemy-sprite recolors (`scripts/recolor-sprites.mjs`) to the five bundled f2
textures (wall/floorA/floorB/ceiling/door), producing a cold blue-violet variant at
`src/assets/f2b_*_256.png`. Wired in as a first-class bundled theme (`"f2b"` added to
`BUNDLED_THEME_URLS` in `src/engine/renderer.ts` and `BUILT_IN_TILESET_THEMES` in
`src/game/floor-map.ts`) — **not** the `public/assets/tilesets/<theme>/` runtime-fetch fallback
path, because `floor-validate.test.ts`'s "campaign floors validate with zero errors and zero
warnings" guardrail requires every shipped theme to be bundled, not just present on disk.
`tilesetZones: [{ id: "forbidden-wing", x1: 11, y1: 6, x2: 12, y2: 9, theme: "f2b" }]` added to
`floor2()`.

**Verification note for whoever reads this next:** a first-pass screenshot of the forbidden wing
looked deceptively still-brown at a glance — a warm ambient light-beam/vignette effect (present
on every floor, unrelated to tileset theme) dominates the visual center of the frame and fooled a
casual look. Don't trust a single screenshot for this kind of check. What actually confirmed it
worked: (1) a direct `themeAt(f2, x, y)` logic check — returns `"f2b"` inside the zone bounds and
`"f2"` immediately outside them, verified at the exact boundary; (2) network tab confirming all
five `f2b_*` assets loaded (200 OK); (3) pixel-sampling the live corridor canvas outside the
light-beam patch, which showed a real blue-shifted bias vs. an f2-baseline sample at the same
screen coordinates. See the `"the forbidden wing reads as visually distinct via the f2b tileset
zone"` test in `floors.test.ts` for the durable version of check (1).

### Phase E — Enemy naming pass (narrow scope — see correction above) — DONE 2026-08-06

`EnemyDef` has no description/flavor-text field to edit (checked — only `name`), so this
shipped as `name`-only renames; `id`, sprite, stats, and abilities are untouched, so nothing
else in the codebase (sprite manifest, encounter tables, treasure defs, tests) needed to change:

- `failed-experiment` → **Feral Scrivener**. Sprite is a reused Werebear strip (hunched, bestial)
  and kit is aggressive melee (`poisonOnHit`, berserk/savage-lunge) — reads as one of Vestra's
  fellow scribes gone feral, not a lab mishap.
- `lab-assistant` → **Cursed Scribe**. Sprite is a reused Priest strip (robed, hooded) and kit is
  a support healer — this is the actual "cursed scribe" the `enemies.ts:135` section header
  promises; the old lab-coat name never matched what's on screen.
- `displacer-beast` → **Shelf Stalker**. Has bespoke art (a dark tentacled panther, not a reused
  strip) and an evasive blink/vanish kit — the D&D-coded old name never fit the library; the new
  one matches both the kit and the shadow-panther sprite.

Orc and Gaze Wraith/Ghostfire/Blood Monster/Blood Wraith were left untouched, as specified.
Verified: `resolveEncounter()` called live in-browser against all three ids resolves the new
names correctly (same runtime path combat uses); full test suite green (no test was pinned to
the old name strings, only to `id`s); one stale comment in `enemies.test.ts` referencing the old
name updated for clarity. Historical docs (`wizardry_v_clone_design_doc.md`,
`superpowers/specs/2026-07-16-enemy-hardness-design.md`, etc.) still say the old names — left
alone per this repo's existing convention of tracking doc currency via
`AGENT-READING-LIST.md` rather than editing prose history.

## Verification (required before calling this done)

1. `npm run floor:validate` — must stay at 0 issues.
2. Run the floor-registry/floor-validate/floors test suites at minimum
   (`npx vitest run <relevant test files>` — check `package.json` for the exact script name).
   Add a new test for the darkness two-tile behavior (both approach directions) and for the
   forced-encounter-doesn't-re-fire-after-loot case — neither currently exists.
3. A fresh **current-branch** browser/Playwright playthrough of Floor 2 — the original audit relied
   on a 2026-07-20 automated run with a **retired six-character roster** (current `PARTY_SIZE` is
   4: Aria/Coda/Dell/Eve, per `docs/AGENT-READING-LIST.md`). Do not reuse that report's numbers as
   current-roster-accurate; re-walk the floor fresh. Cover: both directions through the repaired
   darkness corridor, the reading-hall event, the forbidden-wing forced encounter (including flee,
   and party-defeat-and-return), save/reload immediately before and after the forced encounter, and
   full traversal to the Floor 3 stairs.
4. Update `docs/AGENT-READING-LIST.md` if this changes what's current vs. stale for Floor 2.

## Explicitly out of scope for this pass

- Do not touch Floor 1's or Floor 3's `floors.ts` logic, the `startX`/`startY` shared-arrival-tile
  convention (`handleStairs` always targets `targetFloor.startX/startY` regardless of travel
  direction — working as designed, not a Floor 2 bug), or Vestra's dialogue.
- Do not make Floor 2's climax a full `isBoss: true` fight unless it falls out naturally from
  Phase C — the requirement is a distinct, authored completion beat (stable ID, fixed/controlled
  formation, unique intro text, fires once, no reload duplication), not a boss flag specifically.
- Do not build a full antimagic chamber on Floor 2 — one small foreshadowing tile at most (Phase B
  step 3), and only if it doesn't compete with Floor 3's reveal.
