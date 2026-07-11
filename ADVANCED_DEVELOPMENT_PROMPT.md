# OnyxLabyrinth — Advanced Development Prompt

## What This Is

You are a senior game developer and systems architect reviewing and improving **OnyxLabyrinth**, a Wizardry-style first-person dungeon crawler built in TypeScript + Vite with a 2D Canvas pseudo-3D corridor renderer and an FF6-style turn-based combat system. The game is deployed to GitHub Pages from the `docs/` folder.

**Repository location:** `/home/sloppymo/OnyxLabyrinth/`

## Tech Stack (verified, not assumed)

- **Language:** TypeScript (strict, `noUnusedLocals`/`noUnusedParameters`/`noFallthroughCasesInSwitch` enforced)
- **Build:** Vite — `npm run build` runs `tsc && vite build`, must pass with zero TS errors
- **Framework:** None. Vanilla DOM + 2D Canvas. Hand-built UI.
- **Tests:** Vitest — `npm test`, test files use `.test.ts` suffix, live next to code
- **Dev server:** `npm run dev`
- **Production preview:** `npx vite preview --port 5176 --base /OnyxLabyrinth/`
- **No lint script** — `tsc` is the type-checking gate

## Current Game Scope (verified by reading the source)

| Dimension | Count / Detail |
|-----------|----------------|
| Floors | 5 (Entry Halls, The Archives, The Laboratories, The Summoning Chambers, The Headmaster's Sanctum) — all 12×12 or 14×14 grids |
| Enemies | 16 unique enemy definitions (training-dummy through headmasters-echo boss) |
| Spells | 22 (12 Mage spells: Halito→Lahalito line + Cortu/Bacortu/Palios/Socordi; 10 Priest spells: Dios→Bamordi line) |
| Items | 7 weapon families × 3 tiers (+0/+1/+2), 6 armor families × 3 tiers, 2 consumables (Healing Potion, Antidote) |
| Classes | 5 (Fighter, Mage, Priest, Thief, Ninja) — Ninja is an advanced class |
| Races | 5 (Human, Elf, Dwarf, Gnome, Hobbit) |
| Alignments | 3 (Good, Neutral, Evil) |
| Status effects | 7 (poison, sleep, paralysis, blind, hidden, knockedOut, exposed) |
| Town services | Inn (free heal), Temple (free heal/cleanse), Shop (buy/sell), Guild (view roster), Training (level up), Reform Party |
| Tile features | stairs_up, stairs_down, treasure, teleporter, chute, darkness, antimagic, locked doors |
| Source lines | ~12,000 (non-test), ~2,600 (tests) |
| Test count | 197+ tests across 12 test files |

## Architecture (one-way dependency shape)

- **`src/game/`** — pure state and rules (no DOM/engine imports): `state.ts`, `dungeon.ts` (edge-based grid model), `party.ts`, `combat.ts` (combat resolution, emits structured `CombatEvent`s), `save.ts`, `features.ts`
- **`src/engine/`** — rendering and I/O: `renderer.ts` (corridor view — **the most fragile file**), `render-math.ts` (extracted unit-tested math), `combat-scene.ts` (canvas combat scene + choreography), `combat-ui.ts` (per-actor turn controller), `combat-select-action-view.ts` (DOM menu windows), `shell.ts` (single source of truth for DOM mode visibility), `camera.ts`, `input.ts`, `automap.ts`, `audio.ts` (procedural Web Audio)
- **`src/data/`** — static definitions: `floors.ts`, `enemies.ts`, `spells.ts`, `items.ts`
- **`src/main.ts`** — wires everything: owns the single `GameState`, mode transitions, per-mode controllers, top-level keydown routing

## Hard Rules (do NOT violate these)

1. **Do not change corridor renderer perspective/vanishing-point math** in `renderer.ts` unless explicitly asked. It is fragile and verified visually.
2. **Do not remove existing visual effects:** fog falloff, amber glow lines, vignette, CRT scanlines, torch flicker.
3. **Do not change game balance** (encounter rates, combat math, XP curves) unless the task explicitly requests it.
4. **Do not change movement/collision/door logic** unless explicitly asked.
5. **`shell.showMode()` is the only place DOM visibility per mode should be toggled.** Bypassing it has caused repeated bugs.
6. **Renderer math goes in `render-math.ts`** with unit tests, not inline in `renderer.ts`.
7. **Combat events:** when adding new combat actions/outcomes, you MUST `emit()` a structured `CombatEvent` in `combat.ts` or it won't animate.
8. **No debug code in commits** — remove `console.log`, `window.__` exposures, `debugger` before committing.
9. **Build before committing:** `npm run build` must pass with zero TS errors.
10. **Run tests before claiming completion** for any combat/save/party/renderer-math change.

## What to Do

Pick **one or two** of the following high-value tracks based on your assessment of what the game needs most. Do not attempt all of them — depth over breadth. For each track you pick, implement the change, verify it builds and passes tests, and report what you did.

### Track A: Content Expansion — Floors 6–10

The game currently has 5 floors. A complete dungeon crawler needs more. Design and implement Floors 6–10 with:
- Thematically distinct names and encounter tables (the existing 5 go: Entry Halls → Archives → Laboratories → Summoning Chambers → Headmaster's Sanctum — continue this arc)
- Progressively harder enemies (you'll need to add new enemy definitions to `enemies.ts` with appropriate stats)
- At least one new tile-feature puzzle per floor (teleporter mazes, chute loops, antimagic gauntlets, locked-door key hunts — study how `floors.ts` and `features.ts` implement these)
- A boss encounter on Floor 10
- Appropriate encounter rates and treasure placement
- Wire up stairs_down from Floor 5 → Floor 6, and stairs_up back

**Files to modify:** `src/data/floors.ts`, `src/data/enemies.ts`, `src/data/items.ts` (if new treasure), `src/game/features.ts` (if new tile types needed)

### Track B: Combat Depth — Status Effects & Tactical Options

The combat system has 7 status effects and 5 action types (attack, cast, defend, item, flee/hide). Expand tactical depth:
- Add 2–3 new status effects (e.g., **haste** — extra turn chance, **regen** — heal per round, **fear** — chance to skip turn, **stone** — petrify, **confuse** — random target). Each needs: application logic in `combat.ts`, a `CombatEvent` for animation, tick logic in `endRound`, cure logic (spells/items), and a damage popup color
- Add spells that inflict/cure these (extend `spells.ts` with new Mage/Priest spell definitions)
- Add items that cure these (extend `items.ts`)
- Ensure the FF6 combat scene animates the new effects (check `combat-scene.ts` for how popups/banners work)
- Add unit tests for the new status effect logic

**Files to modify:** `src/game/party.ts` (StatusEffect union), `src/game/combat.ts`, `src/data/spells.ts`, `src/data/items.ts`, `src/engine/combat-scene.ts`, `src/engine/combat-scene.test.ts`, `src/game/combat.test.ts`

### Track C: Equipment & Economy Overhaul

The current item system is thin: 7 weapon families, 6 armor families, 2 consumables, all with simple +0/+1/+2 tiers. Overhaul it:
- Add weapon special properties (e.g., **silver** weapons bonus vs undead, **magic** weapons that hit incorporeal enemies, **two-handed** penalty, **ranged** weapons hit back row without penalty)
- Add armor special properties (e.g., **fire-resistant**, **magic-resistant**, **weight** that reduces AGI)
- Add 5–8 new consumables (Ether for SP restore, Phoenix Down for revive, Eye Drops for blind, Paralyze Cure, Stone Cure, Fear Cure, Elixir for full restore)
- Add accessory slot (rings/amulets) with passive effects
- Rebalance shop prices and treasure drops to create a meaningful gold economy
- Ensure the town shop UI (`town-ui.ts`) can display and sell the new items
- Add unit tests for new item effects

**Files to modify:** `src/data/items.ts`, `src/game/combat.ts` (equipment effect application), `src/engine/town-ui.ts`, `src/game/party.ts` (if new equip slot)

### Track D: Procedural Dungeon Generation

Currently all 5 floors are hand-designed in `floors.ts`. Add a procedural generation option:
- Implement a dungeon generator that creates a connected grid with rooms, corridors, doors, and feature placement
- Support configurable parameters: grid size, room count, corridor density, feature density, encounter rate
- Ensure the generated dungeon is fully connected (every tile reachable), has exactly one stairs_down (or is a dead-end floor), and places treasure behind locked doors or in dangerous zones
- Add a `?procgen=1` debug flag (like the existing `?debug=1`) that swaps in a procedurally generated floor for testing
- Add unit tests for connectivity guarantees and feature placement rules

**Files to modify:** `src/game/dungeon.ts` (generation logic), `src/data/floors.ts` (optional generator entry point), `src/main.ts` (debug flag), new `src/game/dungeon-gen.ts` + `src/game/dungeon-gen.test.ts`

### Track E: Audio Overhaul

The current audio engine (`audio.ts`) has procedural ambient drone, footsteps, and door sounds. Combat has no audio. Expand it:
- Add combat audio: attack swing, hit impact, spell cast whoosh, spell impact, enemy death, level-up fanfare, victory fanfare, defeat stinger
- All procedural via Web Audio API (no sample files — this is a hard constraint of the project)
- Add a master volume control and mute toggle (keyboard shortcut + UI indicator)
- Add subtle combat music: a low-key procedural loop that intensifies when HP is low or a boss is present
- Ensure audio respects the existing autoplay-policy gesture requirement (resume on first keydown)

**Files to modify:** `src/engine/audio.ts`, `src/engine/combat-scene.ts` (trigger sounds on events), `src/engine/combat-ui.ts` (victory/defeat sounds), `src/main.ts` (volume key binding)

### Track F: Save System Robustness

The save system (`save.ts`) serializes `GameState` to localStorage. Audit and harden it:
- Verify that all `GameState` fields survive a save→load cycle (especially `Set` fields like `explored`, `unlockedDoors`, nested objects like `equipment`, `lastDungeon`)
- Add a save version field and migration logic so old saves don't break on update
- Add multiple save slots (3–5) with a slot selection UI in `save-ui.ts`
- Add save corruption detection (checksum or try/catch with graceful fallback)
- Add unit tests for save→load round-trip of every field type

**Files to modify:** `src/game/save.ts`, `src/engine/save-ui.ts`, `src/game/save.test.ts`

### Track G: Accessibility & UX Polish

- Add keyboard remapping support (let players rebind movement, turn, combat keys)
- Add a high-contrast / colorblind-friendly mode (adjust the amber glow, damage popup colors, status indicators)
- Add text size scaling for the message overlay and combat windows
- Add a "battle speed" setting (slow/normal/fast) that scales animation durations in `combat-scene.ts`
- Add an auto-battle toggle (AI controls party — reuse the enemy AI logic for party members)
- Add tooltips or a help overlay accessible from town

**Files to modify:** `src/engine/input.ts`, `src/engine/shell.ts`, `src/styles.css`, `src/engine/combat-scene.ts`, `src/engine/town-ui.ts`, new settings module

## How to Work

1. **Read `AGENTS.md` and `CLAUDE.md` first.** They contain the file map, hard rules, common pitfalls, and verification checklists. They are the primary source of truth.
2. **Explore before editing.** Read the files relevant to your chosen track. Trace dependencies. Understand the patterns.
3. **Follow existing conventions.** Mimic code style, use existing utilities, keep constants in the established locations (`RENDER_CONFIG`, `CFG`, etc.).
4. **Build frequently.** Run `npm run build` after meaningful changes. Zero TS errors is the minimum gate.
5. **Test your changes.** Run `npm test`. Add new tests for new logic. For combat/renderer/audio changes, also verify visually using `npx vite preview --port 5176 --base /OnyxLabyrinth/` and a browser.
6. **Commit with conventional commits:** `feat(scope):`, `fix(scope):`, `chore(scope):`, `docs(scope):`. Summary under 72 characters.
7. **Do not push unless asked.**
8. **Do not mutate git history** (no rebase, reset --hard, force-push) without explicit confirmation.

## Verification Checklists (from AGENTS.md — follow these)

### Renderer changes
After any change to `renderer.ts`: build, start preview, screenshot straight corridor / open side passage / front wall / darkness zone. Inspect for black walls, missing ceiling, center seams, texture stretching.

### Combat changes
After any change to `combat-scene.ts`, `combat-ui.ts`, or `combat-select-action-view.ts`: verify combat starts, party sprites animate, turn playback works, damage popups render (white=damage, green=heal, purple=poison, MISS on evades), spell banner shows, target cursor works, image-strip enemies face right, defeated enemies fade, result window shows gold/XP, combat→dungeon transition preserves textures.

## Output Format

Produce a report with these sections:

1. **Track(s) chosen** — which track(s) and why (1 paragraph each)
2. **Changes made** — file-by-file summary of what changed and why
3. **New content** — if you added floors/enemies/spells/items, list them with stats
4. **Build status** — `npm run build` output (must be zero errors)
5. **Test status** — `npm test` output (pass/fail counts)
6. **Visual verification** — if applicable, what you checked and screenshots taken
7. **Design rationale** — why you made the balance/content choices you did
8. **Known limitations** — what you didn't finish, edge cases, follow-up work
9. **Commit hash** — the commit(s) you made

## Constraints

- **No new npm dependencies** unless absolutely necessary and published >7 days ago. The project is deliberately dependency-light.
- **No framework.** Do not introduce React, Vue, Svelte, or any UI framework.
- **No image/audio sample files.** All visuals are Canvas-drawn or sprite-strips from `public/assets/`. All audio is procedural Web Audio.
- **Keep the `?debug=1` hook** in `main.ts` — it's used by automated visual verification.
- **TypeScript strict mode** — no `any` without justification, no unused locals/params, no fallthrough cases.
- **Respect the file map** — game logic in `game/`, rendering in `engine/`, static data in `data/`. Don't create circular dependencies.
