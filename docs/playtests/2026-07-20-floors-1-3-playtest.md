# Floors 1–3 playtest report

**Date:** 2026-07-20
**Build:** `d60db8c` — "feat(floors): landmark rooms and forced tutorial pacing on floors 1-3" (branch `main`, working tree clean at time of test)
**URL:** http://127.0.0.1:5230/OnyxLabyrinth/?debug=1 (production preview build, `vite preview`)
**Map source:** campaign `src/data/floors.ts` (`floor1`/`floor2`/`floor3`) — the committed redesign, not the floor editor's `playtestFloor` export
**Pre-flight:** build ✅ · test ✅ (1038/1038) · floor:validate ✅ (0 issues, floors 1–5)
**Tooling:** Playwright against the production preview, driven through `window.__onyxDebug` (title→New Game→Default Party→town→dungeon boot, `warp()` for fast repositioning, `walkDirs()` for short natural steps, debug flee on random-encounter interrupts). Script: `scripts/playtests/playtest-floors-1-3.mjs`. Raw run log and `report.json`: `playtest-screenshots/2026-07-20-floors-1-3/`.

## Executive summary

The floors 1–3 redesign is playable end-to-end with **zero real defects found**: the full critical path (F1 start → crypt-key → lexicon-key → F2 → furnace-key → forge-key → F3 → F4 stairs) works, every one of the three locked doors is correctly key-gated, every trap/water/darkness/antimagic/teleporter/event tile fires exactly as authored in `floors.ts`, and there were zero console/page errors across the full run. The automated script itself raised 6 findings on the first pass; all 6 were run down to root cause and confirmed to be **test-script bugs** (wrong approach coordinates, stale debug state, or a wrong assumption about which chests are trapped), not game bugs — see "Findings ruled out during verification" below, since a future agent shouldn't have to re-discover this. Critically, the commit's actual headline claim — **forced tutorial pacing** — was independently verified, not just inferred from feature checks: the old direct-north shot from the crossroads (5,5) is now a hard wall (confirmed by screenshot, no message, position unchanged), and a full step-by-step foot-walk (no warping) from F1's start tile through the crypt row, both mandatory chests, the water crossing, both events, and out to the stairs succeeded and landed exactly on F2's start tile. The new landmark work reads well in practice: Floor 2's shelf-island obstacle fills the screen with bookshelves the instant you're adjacent to it (no automap needed to know you're in a library), Floor 3's anti-magic chamber renders a distinct "Ø" ward glyph on the front wall plus the "You are in an anti-magic zone" banner, and the new `mapSprites` decor (torch, barrel) renders correctly in the corridor view — confirmed by screenshot, not just by reading the renderer code path. All three NPCs' directional hints (Maro's "west of the great corridor," Vestra's "east of the reading hall," Kazeharu's "beyond the locked door south… no spell will answer you there") were cross-checked against the redesigned coordinates and still point to the right places. The AGENTS.md "outside-combat damage never kills" invariant held throughout: the party was driven down to exactly 1 HP on multiple characters by the F1 deep-water tile and F2's bookcase event and never dropped further outside combat. One real design fact worth flagging (not a bug): the default roster's Thief (Coda) can pick every lock in the game with no key at all, as long as she's alive — so none of the three key chains can ever truly soft-lock a party, which is worth knowing when reasoning about "is the key reachable" design questions.

## Critical path trace

### Floor 1 — The Flooded Crypt
- Start (5,9), facing worked correctly, corridor rendered cleanly (no black walls/ceiling).
- Route: entry hall → crossroads corridor (col 5) → west along row 5 → **safe chest (3,5)**: Healing Potion ×2 + `crypt-key` (untrapped, loots immediately) → **trapped chest (2,5)**: poison trap, Inspect→Open flow works, antidote in the loot softens it → **water (2,4)** depth 2, blessed pool, heals the party (+8, matches `waters[]` heal effect) → **damage event (2,3)**: "A flagstone gives way…", 4 dmg to party → **reward event (1,4)**: holy-symbol → **heal event (4,1)**: "You kneel at the defiled altar…", +5 HP → **stairs down (5,1)**.
- NPC Maro (3,6): panel opens correctly on step-on.
- Side content verified: shallow water (7,5) depth 1, darkness (8,5)/(9,5) — `inDarkness` sets correctly, deep water (10,6) depth 4 (52 dmg to a fresh-HP party — this tile hits hard, see Design feedback), locked reliquary (9,7)s → `crypt-key` opens it → trapped vault chest (10,9), gas trap → `lexicon-key`.
- **Stairs to F2: OK** — landed exactly at F2 start (2,11).

### Floor 2 — The Cursed Library
- Arrival (2,11) is the `stairs_up` tile itself (Wizardry-style), confirmed.
- Reading hall's new shelf-island obstacles are traversable and visually obvious (bookshelf fills the screen — see screenshot `21-f2-reading-hall-aisle.png`).
- NPC Vestra (1,1): panel opens correctly.
- North corridor darkness (7,2)/(8,2) confirmed, damage event (8,2) "A bookcase groans and topples…" confirmed, 6 dmg.
- Scriptorium chest (12,3): alarm trap, Inspect→Open flow works (this chest **is** trapped in `floors.ts` — my first script pass wrongly assumed it wasn't; see ruled-out findings).
- Locked forbidden wing (10,7)e → `lexicon-key` opens it. New darkness tile (11,8) sits directly in front of the furnace-key chest as designed. Furnace-key chest (12,8): stunner trap → `furnace-key`.
- New reward event (7,8) → eye-drops, new heal event (3,11) → +5 HP, both confirmed firing with correct messages.
- **Stairs to F3: OK** — landed exactly at F3 start (2,2).

### Floor 3 — The Forge of Ashes
- Arrival (2,2) is the `stairs_up` tile.
- Locked slag vault (11,2)e → `furnace-key` opens it → trapped chest (13,2, gas) + new unguarded bonus chest (14,1, greater-healing-potion, no trap prompt as authored).
- NPC Kazeharu (3,9): panel opens correctly.
- New furnace-stack alcove around the anvil-altar heal event (7,7) confirmed in place; event fires correctly (+6 HP).
- Waygate teleporter (9,6) → lands exactly at declared (2,3) (confirmed via corrected approach coordinate, see below).
- Ashpit chest (2,14): poison trap → `forge-key`.
- Locked Grand Forge (7,11)s → `forge-key` opens it (confirmed via corrected approach coordinate). Anti-magic zone (6–8,13) inside the chamber: `inAntimagic` sets correctly, and casting a utility spell there returns "The anti-magic field drinks the spell away." Trophy chest (9,13): stunner trap, loot confirmed.
- **Stairs to F4: OK** — confirmed descent works, landed at F4 ("The Null Choir") start (2,2). F4 itself was not played.

## Forced-pacing verification (the redesign's actual headline claim)

Everything above was checked feature-by-feature using `warp()` to jump straight onto each tile, which proves each feature fires correctly but — on its own — cannot prove the *routing* claim the commit is actually about ("the direct shot to the sanctum is gone… everyone must jog west through the crypt row"). That was checked separately and directly:

- **Old shortcut is walled:** stood at the crossroads (5,5) facing north (the cell where `carveVertical(grid, 5, 2, 8)` used to continue straight up to the sanctum, before the redesign shortened it to `carveVertical(grid, 5, 5, 8)`) and pressed forward. Position and facing were unchanged after the step, with no movement message — screenshot `54-f1-crossroads-north-after.png` shows a flush dead-end wall directly ahead. The old straight-north shot no longer exists.
- **New route is walkable start-to-finish, on foot, no warping:** a single continuous `walkDirs()` sequence — north up the crossroads, west through both chests (auto-resolving the trap prompt on the poison chest with Inspect→Open exactly as a player would), north through the water tile and both events, then east through the sanctum to the stairs — completed without a single warp call and ended on `"You descend the stairs to The Cursed Library (Floor 2)."`, landing exactly on F2's start tile (2,11). The trap-prompt input gate (AGENTS.md: all other dungeon keys blocked while `pendingTrap` is set) was exercised for real here, not bypassed.

This confirms the redesign's core mechanical claim: the safe-chest → trapped-chest → water tutorial beats are genuinely unavoidable on the only path north, not just individually functional in isolation.

## NPC hint accuracy against the new geography

The redesign moved several rooms and corridors; NPC dialogue that gives directional hints was cross-checked against the current coordinates rather than just confirming the panels open:

- **Maro (F1):** "Look among the sarcophagi, **west** of the great corridor" → crypt-key chest (3,5) sits in the west crypt row (cols 1–3), west of the col-5 crossroads ("the great corridor"). Still accurate. "The shallow ford by the gallery door" → water (7,5) depth 1 sits directly at the gallery door (6,5)/(7,5). Still accurate. "South of the flooded gallery, behind the locked door" (reliquary) → vault (9,8)–(10,9) is south of the gallery (7–10, 4–6) and still locked. Still accurate.
- **Vestra (F2):** "The furnace key sits in the wing they forbade — **east** of the reading hall" → forbidden wing (11–12, 6–9) is east of the reading hall (5–9, 5–9). Still accurate.
- **Kazeharu (F3):** "Beyond the locked door **south**… no spell will answer you there" → Grand Forge lock (7,11)s and the anti-magic zone inside it are indeed south, and "no spell will answer" is now *more* accurate than when this line was written, since the anti-magic chamber is confirmed live.

No stale directional hints found.

## Decor and invariant confirmations

- **`mapSprites` decor renders correctly, confirmed by screenshot** (not just by reading the `renderer.ts:545` code path): F1's torch at (6,9) renders as a lit wall-mounted torch sprite when approached from the start tile (`56-f1-mapsprite-torch.png`); F3's barrel at (12,7) renders clearly against the forge tileset (`57-f3-mapsprite-barrel.png`).
- **"Outside-combat damage never kills" (AGENTS.md hard rule) held throughout this session**, not just in principle: after F1's deep-water tile (52 dmg to the party) and F2's bookcase damage event, four of six characters (Coda, Dell, Eve, Fenn) were sitting at exactly 1 HP simultaneously, and none dropped further or died — the floor held under repeated, stacked non-combat damage in the same session.

## Findings table

No confirmed defects survived verification.

| ID | Sev | Floor | Location (x,y) | System | Title | Repro | Expected | Actual | Screenshot |
|----|-----|-------|----------------|--------|-------|-------|----------|--------|------------|
| — | — | — | — | — | *(none — see below)* | — | — | — | — |

### Findings ruled out during verification

The automation's first pass raised 6 items; all 6 were root-caused against `src/engine/camera.ts` (`tryUnlock`), `src/main.ts` (`onMove`), and `src/data/floors.ts`, then re-tested with corrected scripts. None are game bugs. Recorded here so this isn't re-investigated:

1. **"F1 heal event (4,1) message not observed"** — a random encounter fired on the same step that entered the event tile; the debug-flee message ("You fled from combat.") overwrote the event text in my snapshot. `onMove()` processes the tile feature (and sets the message) *before* rolling the encounter, so the event genuinely fires first — confirmed by re-running the same step with `encounterRate` temporarily zeroed: message came back exactly `"You kneel at the defiled altar. Something hungry listens — but it gives a little back."` Not a bug — an artifact of combining debug-flee with event tiles in the same automated step.
2. **"F1 vault lock (9,7)s did not open with crypt-key — already unlocked"** — my script's `warp()` helper resets the floor grid but not `state.unlockedDoors`, and an earlier sub-test had already lockpicked that same door with the Thief active. The stale unlock record, not the game, produced "already unlocked." Not a bug.
3. **"F2 scriptorium chest (12,3) untrapped but pendingTrap fired"** — my own script's assertion was wrong; `floors.ts` defines this chest with `trap: "alarm"`. The trap prompt firing is correct behavior. Not a bug.
4. **"F3 teleporter (9,6) did not land at (2,3)"** — my script approached from (9,5), a cell outside any carved room on this floor (the foundry's actual north entrance is at column 7, not 9), so the step never moved the player and the teleporter tile was never touched. Re-tested from the correct approach — (9,7) facing north, which *is* inside the carved foundry corridor — and the teleporter landed exactly at the declared (2,3). Not a bug.
5–6. **"F3 Grand Forge lock (7,11)s: 'no locked door here'"** (both no-key and with-key attempts) — same class of error: my script stood at (7,10), one cell short of the actual locked edge at (7,11)/(7,12). Re-tested standing directly on (7,11) facing south: held correctly without the key/Thief, and opened correctly with `forge-key` ("You unlock the door with the forge-key. The door swings open."), then stepped through into the boss chamber (7,12). Not a bug.

## Design feedback (maps)

### Floor 1
- **Interesting:** The rerouted critical path genuinely works as a tutorial funnel now — you cannot reach the sanctum without passing the safe chest, the trapped chest, and the healing-water crossing in that order. That was the stated goal of the redesign and it holds up in play.
- **Flat / confusing:** The deep-water tile (10,6, depth 4) did 52 damage to a full 6-person party in one crossing — that's roughly half of Dell's (18 max HP) or Coda's (24 max HP) total HP in a single step, on an *optional* side-branch reachable before any leveling. It's clearly meant to read as "dangerous, go around," and the `encounterZones` risk multiplier (1.5×) on that same rectangle reinforces the intent — but the tile itself gives no warning before you're already in it (no distinct visual state up to depth 4 vs depth 1/2, and the "flooded gallery" darkness tiles sit right in front of it, so a player crossing to it may not clearly see how deep it is before stepping in). Worth a look at whether depth-4 water should have a stronger pre-entry tell (message on the tile before it, or a visual cue) versus depth 1–2.
- **Suggested changes:** Consider a warning event or NPC line (Maro already hints at "the black pools drown the careless" — that's good) placed so it's read *before* reaching the depth-4 tile rather than only available via NPC dialogue that a player might skip.

### Floor 2
- **Interesting:** The shelf-island obstacles are the standout addition — walking into the reading hall now puts a wall of bookshelf art directly in frame, which does more for "this is a library" readability than any amount of automap legend ever would. The added darkness-over-the-best-loot placement (11,8, guarding the furnace-key chest) is a nice small tension beat.
- **Flat / confusing:** None observed in this pass — the loop shape (atrium → stacks → hall → forbidden wing → SE stairs) reads clearly and every branch has a payoff (scriptorium loot, forbidden-wing key, two new events).
- **Suggested changes:** None from this pass.

### Floor 3
- **Interesting:** The furnace-stack alcove around the anvil-altar heal event turns what used to be an empty box room into a framed set-piece; the anti-magic chamber's "Ø" wall glyph plus the banner text is a strong, unambiguous signal that spells are dead here, which matters a lot before the player commits to that fight later. The unguarded bonus chest rewarding backtracking with the furnace-key is a good small loop-closing beat.
- **Flat / confusing:** None observed.
- **Suggested changes:** None from this pass.

## Console / build errors

Zero console or page errors across the entire run (58 screenshots, ~140s of automated play spanning all three floors plus the F1 encounter-zone pacing sample and the follow-up forced-pacing/decor verification pass).

## Encounter pacing (directional only)

Ran a 24-step alternating walk in F1's `crypt-tutorial-safe` zone (rateMul 0.5) and a separate 24-step walk in `flooded-gallery-risk` (rateMul 1.5): 0/24 encounters in the safe zone vs. 2/24 in the risk zone. Sample size is too small to be statistical, but the direction is correct and the mechanism (`encounterRateAt` in `game/encounters.ts`) is exercised and working — this is consistent with the reading-list note that floors 1–3 already sit at 8%/10%/12% base rates.

## Screenshots index

58 screenshots in `playtest-screenshots/2026-07-20-floors-1-3/`, numbered 00–57 in play order (00–52 the main critical-path/feature pass, 53–57 the follow-up forced-pacing and decor verification). Highlights:
- `00-boot-f1-start.png` — F1 corridor at boot, clean textures
- `02-f1-safe-chest.png`, `03-f1-trapped-chest-prompt.png` — chest tutorial beats
- `06-f1-npc-maro-panel.png`, `22-f2-npc-vestra-panel.png`, `41-f3-npc-kazeharu-panel.png` — all three NPC panels
- `13-f1-gallery-darkness.png`, `23-f2-corridor-darkness.png`, `28-f2-forbidden-wing-darkness.png` — darkness zones
- `21-f2-reading-hall-aisle.png` — new shelf-island obstacle, strong landmark read
- `43-f3-after-teleporter.png` — waygate landing
- `48-f3-antimagic-zone.png`, `49-f3-antimagic-cast-fizzle.png` — anti-magic chamber + spell fizzle
- `11-f1-after-stairs-to-f2.png`, `34-f2-after-stairs-to-f3.png`, `52-f3-after-stairs-to-f4.png` — all three floor transitions
- `19-f1-automap.png` — automap overlay (see caveat below)
- `54-f1-crossroads-north-after.png` — the old direct-north shortcut, now a dead-end wall
- `56-f1-mapsprite-torch.png`, `57-f3-mapsprite-barrel.png` — decor sprite render confirmation
- `report.json` in the same directory — machine-readable dump of findings/timings/pacing from the main automated run

**Automap caveat:** the automap check only shows a 5-tile cross around the player because the test used `warp()` (which resets `state.explored`) immediately before pressing M, rather than a long natural walk. The overlay itself renders correctly for what was explored; this pass doesn't certify automap accuracy over an extended natural walking path.

## Playtime

Automated run: ~140s wall-clock for the full F1→F2→F3→F4-stairs pass plus side content and the pacing sample (not representative of human pacing — most repositioning used `warp()` jumps rather than walking). Estimated human playtime based on map size and content density: F1 ~6–8 min, F2 ~7–9 min, F3 ~9–12 min for a full first-time exploration hitting every chest/event/NPC.
