# Prompt for another LLM: Playtest OnyxLabyrinth and take notes

## Project context

You are playtesting **OnyxLabyrinth**, a Wizardry-style first-person dungeon crawler. It is a TypeScript + Vite game with hand-built DOM UI and a 2D canvas corridor renderer. The repo is at `/home/sloppymo/OnyxLabyrinth/`.

Your job is to **play the game, explore its systems, and produce structured notes** on bugs, balance, UX friction, visual issues, and anything that feels broken or confusing. You do not need to fix anything — just observe, reproduce, and document.

---

## How to run the game

Choose one of these two methods. The dev server is easier for repeated restarts; the production build is better for verifying the real player experience.

### Method A: Dev server (recommended for quick iteration)

```bash
cd /home/sloppymo/OnyxLabyrinth
npm run dev
```

This starts a local dev server (usually on `http://localhost:5173/`). Open the URL in a browser.

### Method B: Production build (recommended for final verification)

```bash
cd /home/sloppymo/OnyxLabyrinth
npm run build
npx vite preview --port 5176 --base /OnyxLabyrinth/
```

Then open `http://localhost:5176/OnyxLabyrinth/` in a browser.

If the build fails with TypeScript errors, **stop and report that first** — a broken build is itself a blocking bug.

---

## What you should know before playing

Read these files for orientation:

1. `AGENTS.md` — project rules, file map, common pitfalls, and hard constraints.
2. `CLAUDE.md` — commands, architecture overview, and deployment notes.
3. `src/engine/title-ui.ts` — title screen logic.
4. `src/engine/arena-ui.ts` — Arena mode, the repeatable combat test mode.
5. `src/data/spells.ts` and `src/data/techniques.ts` — what spells and melee techniques exist.
6. `src/data/perks.ts` — class perks.
7. `src/data/items.ts` — items, equipment, cursed gear, trinkets.
8. `src/data/enemies.ts` — enemy formations and encounter tables.

You do not need to memorize these, but refer to them when you encounter a system so you know what the intended behavior is.

---

## Core systems to exercise

Try to touch every major system at least once. The game has both dungeon exploration and turn-based combat.

### 1. Title screen and modes

- Launch the game.
- Check that **New Game**, **Continue** (if a save exists), and **Arena** are visible and functional.
- Verify the title music / ambient audio starts (if audio is enabled).

### 2. Party creation

- Start a New Game.
- Try both the **Default Party** option and the **Custom Party** editor.
- In custom mode, create at least one of each class: Fighter, Mage, Priest, Thief, Halberdier, Duelist, Crusader.
- Note any issues with stat allocation, class description clarity, or navigation.

### 3. Town / hub

- Enter town from the title/dungeon flow.
- Visit each tab: **Inn** (rest/heal), **Temple** (remove curse), **Shop** (buy/sell/appraise), **Training Ground** (read-only roster/perk review).
- Try buying, selling, and appraising unidentified items.
- Check that cursed items cannot be removed manually and that the Temple can remove them for 100g.
- Verify trinkets (e.g., Ring of Water Walking) do not appear as shop stock and cannot be equipped in weapon/armor slots.

### 4. Dungeon exploration

- Enter the dungeon.
- Move forward, turn left/right, and open doors.
- Step on stairs, chutes, teleporters, treasure tiles, and water tiles.
- Open a trapped chest and use Inspect/Disarm/Open/Leave.
- Cast utility spells from the dungeon (`G` key menu): Light, Levitate, Wayfinder.
- Encounter an NPC and use Talk/Barter/Give/Steal/Attack/Leave.
- Enter combat from a random encounter or by attacking an NPC.

### 5. Combat

Combat is the heart of the game. Test both the **Arena** mode (fast, repeatable) and the real dungeon combat.

#### Arena mode (fast combat testing)

- From the title screen, choose **Arena**.
- Build a high-level party so all spell tiers and techniques are unlocked.
- Fight several rounds.
- Cast every Mage and Priest spell at least once.
- Use melee techniques (for Fighter, Thief, Halberdier, Duelist, Crusader classes).
- Watch for: VFX alignment, sprite positioning, damage popup timing, turn order clarity, and whether enemies/party members animate correctly.

#### Dungeon combat

- Get into a real fight in the dungeon.
- Test fleeing, winning, losing (game over), and leveling up after combat.
- Verify perk selection appears after combat if a character crossed level 3/6/9/12.

### 6. Spells and VFX

- Cast damage spells of every element: fire, cold, lightning, poison, undead, divine.
- Cast heals, buffs (Shield of Faith, Bless, Arcane Ward, Spell Shield), cures, and resurrects.
- Cast disable spells: Sleep, Hold Person, Web, Power Word: Stun, Silence, Dispel Magic.
- Cast summon spells and verify the summoned ally appears and acts.
- After each spell, note whether the VFX looks correct or is missing/misaligned.

### 7. Melee techniques

- Create or level up a non-caster class (Fighter, Thief, Halberdier, Duelist, Crusader).
- In combat, open the **Technique** menu.
- Use each technique at least once.
- Watch the Rage resource: gain rage from dealing/taking damage, spend it on techniques, check that rage decays between fights.
- Note any technique that feels useless, overpowered, or bugged.

### 8. Perks

- Level up characters to 3, 6, 9, and 12 to trigger perk choices.
- Pick perks from each tier.
- In combat, observe whether the perk effects appear to apply (damage bonuses, crit chance, counters, etc.).
- Report any perk that seems to have no effect.

### 9. Inventory and equipment

- Pick up items from chests.
- Equip and unequip weapons and armor.
- Identify unknown items at the shop.
- Observe cursed gear behavior.
- Check that inventory persists through saves.

### 10. Save / load

- Save the game in the dungeon.
- Reload and verify position, party state, inventory, persistent buffs, and killed NPCs persist.
- Test autosave behavior.

---

## What to look for

For each issue you find, record:

| Field | What to write |
|-------|---------------|
| **System** | Which system: title, party creation, town, dungeon, combat, spells, techniques, perks, inventory, save/load, audio, renderer |
| **Severity** | blocker / major / minor / polish |
| **Repro steps** | Exact steps to make it happen |
| **Expected** | What you thought should happen |
| **Actual** | What actually happened |
| **Evidence** | Screenshot path, console error text, or note if it is visual/audio |
| **Build/test status** | Did `npm run build` pass? Did `npm test` pass? |

### Severity definitions

- **blocker** — crashes, freezes, infinite loops, prevents progression, or makes the game unplayable.
- **major** — significantly wrong behavior, missing core feature, or frequent visual/audio breakage.
- **minor** — small UI glitch, typo, confusing message, or non-critical visual issue.
- **polish** — could be better but does not impede play; feature suggestion or balance tweak.

---

## Specific things to scrutinize

### Visual / rendering

- Corridor view: black walls, missing ceiling/floor, texture stretching, z-fighting, center seams.
- Darkness zones and Light spell interaction.
- Combat scene: enemy/party sprite alignment, mirrored party sprites, effect sprite positioning and scaling.
- Far-to-near rendering order — things that should be behind should not draw on top.
- CRT scanlines, vignette, fog falloff, amber glow lines — these are intentional; do not report them as bugs unless they are broken.

### Audio

- Ambient drone in dungeon.
- Footsteps, door sounds.
- Any missing or jarring audio.

### Combat balance

- Are starting enemies too hard or too easy?
- Do spells feel appropriately powerful for their SP cost?
- Are melee techniques worth using compared to a normal attack?
- Do perk choices feel meaningful?

### UX / clarity

- Are key hints visible and accurate?
- Do menus respond to the expected keys?
- Is the spell/technique/target selection flow clear?
- Are error messages helpful when you cannot cast a spell or use a technique?
- Does the automap help orient you?

### Common pitfalls to verify

The project has known regression areas. Explicitly check these:

1. `#message` overlay: when empty, it must be hidden; otherwise it blocks the corridor view with a black box.
2. Trap prompt modality: while a trapped chest prompt is open, dungeon input should be gated.
3. Borrowed `"title"` mode: save menu, spell menu, NPC panel, and perk selection should not conflict with each other.
4. Canvas sizing: after window resize, the corridor and combat canvas should still render correctly.
5. Utility spells (Light, Levitate, Wayfinder) should not appear in combat spell lists.
6. Camping should clear persistent utility buffs.
7. Outside-combat damage should floor HP at 1, not kill.

---

## Deliverables

Produce a markdown playtest report. Save it to:

```
/home/sloppymo/OnyxLabyrinth/docs/superpowers/playtests/2026-07-12-llm-playtest-notes.md
```

Use this structure:

```markdown
# Playtest Notes — OnyxLabyrinth

**Tester:** LLM
**Date:** 2026-07-12
**Build command used:** npm run dev / npm run build + vite preview
**Build passed:** yes / no
**Tests passed:** yes / no (if run)

## Summary

3-5 sentence overall impression. What felt good, what felt broken, whether the game is playable from start to finish.

## Issues found

### Blockers

| # | System | Repro steps | Expected | Actual | Evidence |
|---|--------|-------------|----------|--------|----------|
| 1 | ... | ... | ... | ... | ... |

### Major

...

### Minor

...

### Polish / suggestions

...

## Systems checklist

- [ ] Title screen
- [ ] Party creation (default + custom, all classes)
- [ ] Town / Inn / Temple / Shop / Training Ground
- [ ] Dungeon movement, doors, stairs, chutes, teleporters
- [ ] Trapped chests
- [ ] Utility spells (Light, Levitate, Wayfinder)
- [ ] NPC interaction
- [ ] Dungeon combat (win, flee, lose, level-up)
- [ ] Arena mode
- [ ] All Mage spells
- [ ] All Priest spells
- [ ] Melee techniques and Rage
- [ ] Perk selection
- [ ] Inventory / equipment / cursed items / trinkets
- [ ] Save / load / autosave
- [ ] Audio
- [ ] Renderer / corridor view

## Notes on balance / feel

Paragraphs or bullets on difficulty, pacing, clarity, fun.

## Screenshot log

List paths of any screenshots taken and what each shows.
```

---

## Screenshot guidance

Use the browser or a tool to capture screenshots whenever you see something worth documenting. Save them to a temporary folder like `/tmp/onyx-playtest-screenshots/` and list them in the report. Useful screenshots include:

- Any visual glitch (misaligned sprite, black wall, missing texture).
- Any error message or console error.
- Confusing UI state.
- Combat before/after a spell or technique.
- Level-up / perk selection screen.
- Inventory / shop state that looks wrong.

---

## Console / debugging

Keep the browser DevTools console open. If you see errors, copy the full text into your report. Common sources of issues:

- 404s on assets (wrong path or missing file).
- TypeError / undefined access.
- Audio context failures.
- Canvas context errors.

---

## Constraints

- Do not modify the repo code unless you are explicitly asked to fix something. This task is observe-and-report only.
- Do not push changes.
- Do not delete saves or game data unless necessary for a fresh test.
- If you hit a blocker that prevents further testing, stop and report it; do not try to hack around it.

---

## Goal of the report

The report should let a developer quickly understand:

1. Whether the current build is stable enough to play.
2. What the most serious problems are and how to reproduce them.
3. Which systems have been exercised and which have not.
4. Balance/feel issues that affect the player experience.

Be honest, specific, and reproducible. Include exact key presses / menu choices / spell names where relevant.
