# OnyxLabyrinth — Playtest Results (2026-07-14)

**Playtester:** AI agent (Playwright headless Chromium)  
**Date:** 2026-07-14  
**Build:** `main-JMV7o7N3.js` at `http://127.0.0.1:5210/OnyxLabyrinth/?debug=1` (matches live GitHub Pages hash)  
**Duration:** ~45 minutes automated coverage across Arena L1/L3/L9, New Game → Town → Dungeon, forced perk overlay  
**Gamepad:** Not available in this environment (keyboard + injected `handleInput` only)  
**Screenshots:** `playtest-screenshots/2026-07-14/` (40 PNGs) + run logs  
**Scripts:** `scripts/playtest-2026-07-14*.mjs`, `scripts/playtest-perk-fix.mjs`

---

## Executive summary

The post-merge ship is **playable and stable**: Arena auto-starts combat, the horizontal A/B/X/Y palette is live, L9 Magic/Tech lists keep descriptions + counters, FAST/AUTO cues work, dungeon corridor textures look healthy, and the perk overlay’s ←/→-before-Enter guard holds under Enter spam. The biggest player-facing gaps are **keyboard vs controller map conflicts** (LT/RT inspect and LB are effectively gamepad-only during palette) and **Arena level-select granting tier levels with empty `perkIds`**, so L9 Arena never teaches the perk system. Encounter density in a 150-step floor-1 walk produced **3 fights** (~38–52 keypresses apart, including wall bumps) — sparse-but-present, consistent with the pity design once walls are considered. Console: **0 errors**.

**Single most important fix:** Give keyboard distinct inspect / shoulder bindings (or stop stealing `t`/`r`/`q` for Tech/Flee/Auto) so LT/RT/LB from the design doc are reachable without a gamepad.

---

## Coverage checklist

| # | Scenario | Result | Evidence |
|---|----------|--------|----------|
| 1 | Title → Default Party → Town | **Pass** | `01-title.png`, `80-party-choice.png`, `82-town.png`; `[D]` Default → town |
| 2 | Arena L1 (wave 1 immediate) | **Pass** | Instant combat; Slime×2; palette visible (`04-combat-l1.png`) |
| 3 | Arena L9 menus | **Pass** | Lava Slime×2 (floor-3 table); Magic `1/18` + detail panel; Tech + Power Attack detail (`21`/`23`) |
| 4 | Controller-first palette | **Pass** (kb) | Slots A/B/X/Y; Magic disabled for melee; Hide on Thief Y (`60-palette-glyphs.png`) |
| 5 | Targeting / Attack | **Pass** | Attack + skip choreography cleared fights; multi-enemy packs present |
| 6 | Tempo (Shift / Tab / Esc) | **Pass** | FAST badge (`08-tab-fast.png`); Esc skip; playback hint row |
| 7 | Repeat + party Auto | **Pass** | `z` Repeat; `q` toggles AUTO cue (`11-auto.png`) |
| 8 | LT/RT inspect | **Partial** | Works via `handleInput({button:'lt'/'rt'})` (`100-inspect.png`); **keyboard `t`/`r` cannot reach it** on palette |
| 9 | Status tags / DoT | **Pass** | `CodaPSN` visible mid L9 fight (run.log / tech shot) |
| 10 | Perk overlay Enter-spam | **Pass** | Overlay + “Pick a card with ←/→ first…” (`150`/`151`); needs combat.party XP mutate for debug path |
| 11 | Dungeon encounters | **Pass** | 3 fights in ~150 forwards at steps 43 / 81 / 133 (`130-enc-*.png`) |
| 12 | Camp | **Pass** | `140-camp.png` Day 2 rest UI |
| 13 | Town loop | **Pass** | Inn/Temple/Shop/Guild/Dungeon/Save listed (`82-town.png`) |
| 14 | Trap / water / NPC | **Not hit** | Short floor-1 walk did not land on these |
| 15 | Wipe / flee | **Partial** | Debug `exitDebugCombat('fled')` returned to dungeon cleanly; wipe path not exercised |
| 16 | Console + network | **Pass** | 0 pageerrors / console errors in sessions |

---

## Findings

### P0 — Critical

_None observed._ No crashes, softlocks, or blank combat. Perk Enter-spam does **not** burn choices.

### P1 — High

#### 1. Keyboard cannot use LT/RT party inspect during palette

**Observed:** Design maps `t`→LT and `r`→RT in `controller-input.ts`, but `main.ts` palette routing steals `tcmifr` into legacy Tech/Cast/Item/Flee shortcuts **before** normalized input. Pressing `t` opened Technique (`62-keyboard-t.png`). Injected `handleInput({button:'rt'})` correctly shows `Inspect: …` (`100-inspect.png`).

**Expected:** Keyboard fallback reaches inspect without a gamepad.

**Repro:** Arena → palette → press `t` or `r`.

**Suggested fix:** Remap inspect to keys outside the legacy set (e.g. `[` / `]`), or only apply legacy letter shortcuts when modifiers held; keep face buttons for palette.

#### 2. Arena level-select skips perk choices for tier levels

**Observed:** Arena L3 party is all level 3 with `perkIds: []`. L9 same — empty perks. `startArena` loops `levelUpChar` without going through `endCombat`’s perk queue.

**Expected:** Either offer perk picks when synthetic level-ups cross 3/6/9/12, or start Arena parties with a documented “no perks” / auto-pick policy so testers aren’t surprised.

**Why it matters:** Arena is the intended combat/perk lab; L9 currently stress-tests spells with **zero** perk identity.

**Suggested fix:** After synthetic level-ups in `startArena`, queue `PendingPerkChoice` for crossed tiers (or apply a default perk per tier for Arena-only).

#### 3. Keyboard `q` steals LB (target cycle)

**Observed:** `q` always routes to party Auto (`togglePartyAuto`). `KEYBOARD_MAP` assigns `q`→`lb`, so LB shoulder behavior is unreachable on keyboard.

**Expected:** Auto and LB both reachable (design: Start=Auto, LB=cycle).

**Suggested fix:** Keep Auto on `Q` / Start only when not colliding; map LB/RB to `e`/`q` swap documentation or use `,` / `.` / `[` / `]` for shoulders (note `.` is already Repeat).

### P2 — Medium

#### 4. Legacy palette letter conflicts fragment the keyboard model

Same root cause as P1: `f`/`r` flee, `t` tech, `i` items vs Select/`f` map, etc. Playable via Enter/A + `s`/`d` for Magic/Skill, but the **design-doc keyboard glyph story is inconsistent** with what keys actually do.

#### 5. Dungeon encounter sampling still feels sparse on floor 1

**Observed:** 3 encounters / ~150 forward presses (indices 43, 81, 133). Gaps include wall bumps, so successful-step pity (~28) may still be working — but a new player walking hallways will still see long quiet stretches.

**Not a stale “empty dungeon” claim**, but worth a second measure of *successful* steps-only dry spells in a later pass.

#### 6. Persistent dungeon control strip during combat/title overlays

**Observed:** The amber `↑/W forward · … · Esc menu` strip stays visible over combat and perk UI. Not broken, but visually noisy and slightly undermines the FF6 combat frame.

### P3 — Low / notes

- **Vision OCR caveat:** pixel `X` Mag glyph is often misread as `H` in screenshot captions; DOM confirms `X`.
- **`exitDebugCombat` + mutating `state.party.xp` alone fails** — `endCombat` overwrites from `combat.party`. Mutate `state.combat.party` XP for debug perk tests (documented for future agents).
- **Huge debug XP** → level 2501 via cumulative `xp >= level*20` with no XP spend — expected for the formula, not a live-economy bug.
- Trap / NPC / wipe / physical gamepad matrix rows unfinished this session.

---

## Systems spot-checks

| System | Verdict |
|--------|---------|
| Action palette A/B/X/Y | Works; class-disabled Magic; Thief Y=Hide |
| Smart targets / tempo | Attack flow + Tab FAST + Esc skip verified |
| Repeat / Auto | `z` / `q` work; AUTO cue visible |
| Inspect | Logic OK; keyboard blocked on palette |
| Arena floor scaling | L9 opens on **Lava Slime** (floor-3), not floor-1 Skeleton |
| Arena wave 1 | Auto-starts (no extra hub click) |
| L9 Magic/Tech UX | Position counter + description panel present; no Throat… truncation seen |
| Status tags | PSN tag on party row |
| Perk Enter guard | Confirmed warning string + overlay retained |
| Encounter pity modules | Unit tests green (`encounters.test.ts` 10/10) |
| Camp / town / dungeon art | Corridor textures intact post-combat flee |

---

## Stale-doc validation

| Old claim | Re-test |
|-----------|---------|
| Arena L9 = floor-1 trash | **False** — Lava Slime×2 |
| L9 spell menu unusable / no descriptions | **False** — Magic 1/18 + detail |
| Tech names truncate `Throat…` | **Not observed** on Fighter list |
| Perk overlay never in Arena | **False** for real post-combat path; **true gap** for synthetic Arena start levels |
| Footer/`T` unbound | Legacy shortcuts still exist; palette is primary |
| Empty dungeon forever | **False** — 3 fights in sample walk |

---

## Console

0 errors, 0 pageerror events across playtest scripts.

---

## Recommended next work order

1. **Keyboard shoulder/inspect remap** — unblock LT/RT/LB without removing Auto/Repeat/legacy Tech shortcuts (highest UX debt from controller-first).
2. **Arena perk seeding** — queue or auto-assign perks when Arena boots at 3/6/9/12.
3. **Combat footer / HUD cleanup** — hide exploration keystrip while `mode === "combat"` (and during perk overlay).
4. **Manual gamepad smoke** on Deck/Xbox — confirm hold-B flee meter, Start Auto, real LT/RT.
5. **Successful-step encounter telemetry** — log dry-spell length in steps-since-fight only, then decide if floor-1 base 8% needs another nudge.

---

## Artifact index (selected)

| File | What it shows |
|------|----------------|
| `01-title.png` | Title New Game / Arena |
| `04-combat-l1.png` | Palette + Arena corridor backdrop |
| `08-tab-fast.png` | FAST cue during playback |
| `11-auto.png` | AUTO affordance |
| `21-l9-spell-menu.png` | Magic 1/18 + Guiding Bolt detail |
| `23-l9-tech-menu.png` | Technique detail + PSN tag |
| `60-palette-glyphs.png` | A/B/X/Y DOM glyphs |
| `62-keyboard-t.png` | `t` → Technique (conflict) |
| `100-inspect.png` | Inspect highlight + detail line |
| `122-dungeon.png` | Floor-1 corridor after town |
| `130-enc-*.png` | Dungeon fights |
| `140-camp.png` | Camp rest |
| `150-perk-overlay.png` / `151-perk-spam.png` | Perk cards + Enter-spam guard |
