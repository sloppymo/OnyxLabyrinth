# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Read `AGENTS.md` before making any change to `src/`.** It contains a detailed file map, hard rules (things not to change without being asked), verification checklists for the renderer/combat screen, and a list of common pitfalls with their fixes. It is the primary source of truth for engine work; this file covers commands and orientation, not repeated here.

**For playtest / balance / combat-UX / perk priorities,** also read [`docs/AGENT-READING-LIST.md`](docs/AGENT-READING-LIST.md) so you do not re-assert stale findings (events, Arena floor scaling, Temple curse UI, perk overlay existence, wipe→dungeon entrance, Headmaster lore, retired boss names / "Echo" vocabulary, "hot zones have harder enemies"). Session handoff for late 2026-07-25 work: [`docs/FOLLOWUP-2026-07-25-SESSION-HANDOFF-PROMPT.md`](docs/FOLLOWUP-2026-07-25-SESSION-HANDOFF-PROMPT.md).

## What this is

OnyxLabyrinth is a Wizardry-style first-person dungeon crawler: TypeScript + Vite, no UI framework. A 2D canvas renders a pseudo-3D corridor view; combat uses a Phaser-default stage with a Canvas rollback painter plus DOM menu windows; the remaining menus are hand-built DOM. Deployed to GitHub Pages by GitHub Actions on every push to `main` (`docs/` is documentation-only).

## Commands

```bash
npm install
npm run dev                 # dev server
npm run build                # app tsc + tools tsc + Vite build — must pass before committing
npm test                     # vitest run (all tests, single pass)
npm run test:watch           # vitest watch mode
npx vitest run src/game/combat.test.ts   # run a single test file
npx vite preview --port 5176 --base /OnyxLabyrinth/   # serve the production build for visual verification
```

There is no separate lint script; `tsc` (via `npm run build`) is the type-checking gate — `noUnusedLocals`/`noUnusedParameters`/`noFallthroughCasesInSwitch` are all enforced.

Test files use the `.test.ts` suffix, live next to the code they test, and are excluded from the build (`tsconfig.json` excludes `src/**/*.test.ts`; Vitest's `include` is `src/**/*.test.ts`).

### Deployment (GitHub Actions)

Every push to `main` runs `.github/workflows/deploy.yml`: `npm ci` → `npm run build` → deploy `dist/` to Pages. There is no manual copy step; `docs/` holds documentation only. Verify a deploy with `gh run list --workflow=deploy.yml --limit 1`.

## Architecture

The practical source boundary is rules/content versus browser presentation; it is not a strict import DAG. `game/` holds no engine/DOM concerns, `engine/` owns rendering/input/audio and consumes the rules, `data/` contains typed definitions, and `content/` contains portable floor packs:

- **`src/game/`** — pure state and rules: `state.ts` (the `GameState` factory/mode setter), `dungeon.ts` (edge-based grid model — each `Cell` has N/E/S/W edges that are `open | wall | door | locked`, not a tile enum), `party.ts`, `combat.ts` (combat resolution; emits structured `CombatEvent`s alongside log strings), `effective-stats.ts` (`effectiveStats()` — the single source of truth for a character's final stats: base + equipment + perks), `perks.ts` (the class-perk engine: `PerkDef`, `perkModifiers()` for numeric passives, `dispatchHook()` for the ~17 stateful reactive perks), `leveling.ts` (`xpForNextLevel`/`levelUpChar`), `save.ts`, `features.ts` (tile-feature handling: stairs, teleporters, chutes, treasure, darkness/antimagic zones, scripted floor events).
- **`src/engine/`** — rendering and I/O: `renderer.ts` (the corridor view — the most fragile file in the repo; see AGENTS.md before touching it) plus `render-math.ts` for extracted, unit-tested geometry/fog/camera math; `combat-choreography.ts` as the shared timed presentation model; `combat-phaser-stage.ts` as the default combat painter; `combat-scene.ts` as the `?phaser=0` Canvas rollback painter; `combat-ui.ts` as the per-actor instant-resolve controller; and `combat-select-action-view.ts` for the overlaid DOM windows. It also contains the screen controllers, `shell.ts` as the source of truth for top-level visibility, `camera.ts`, `input.ts`, `automap.ts`, and `audio.ts` (streamed music, sample-backed SFX, and procedural cues).
- **`src/data/`** — static definitions: `floors.ts`, `enemies.ts` (encounter tables), `spells.ts`, `items.ts`, `perks.ts` (all 56 `PerkDef`s, design doc §7).
- **`src/content/floors/`** — JSON-authored campaign/custom floor packs merged into the runtime floor registry by id.
- **`src/main.ts`** — wires everything together: owns the single `GameState` instance, the mode-transition logic (`transitionToMode`, fade via `canvas.style.opacity`), per-mode controllers (`CombatController`, `CampController`, `TownController`, `SaveController`, `PartyCreationController`, `TitleController`, `ArenaController`, `GameOverController`, `PerkSelectController`) that are constructed/torn down on mode entry/exit, and the top-level `keydown` listeners that route input to whichever controller is active for the current `state.mode`.

`GameMode` is a strict union (`title | party_creation | town | dungeon | combat | camp | game_over | arena`) and only one mode is live at a time; `shell.showMode()` is the only place DOM visibility per mode should be toggled (see AGENTS.md "Common pitfalls" for the history of bugs from bypassing it). Several overlays (save menu, spell menu, NPC panel, perk selection) borrow mode `"title"` to pause dungeon input rather than defining their own mode — see AGENTS.md's "Borrowed title mode" pitfall.

Combat sprites are hybrid: `sprite-manifest.ts` maps enemy IDs to horizontal PNG frame-strips (100×100 px/frame) under `public/assets/enemies/<id>/<state>.png`, and `party-sprite-cache.ts` maps character classes to strips under `public/assets/party/<class>/<state>.png` (frame counts derived from strip width at load). `combat-scene.ts` draws the image strip when present and falls back to a procedural shape otherwise. Not every enemy has art — that's expected, not a bug. Combat resolution has two APIs in `game/combat.ts` sharing the same internals: round-based `resolveCombatRound` (kept for tests) and the per-turn API (`beginRound`/`resolvePlayerTurn`/…) that drives the FF6 UI.

Party creation opens on a choice screen (`party-ui.ts`, `PartyCreationController` phase `"choice"`): pick the ready-made Default Party (Aria/Coda/Dell/Eve) or drop into the custom editor (phase `"edit"`). Esc from the editor's first slot returns to the choice screen rather than cancelling.

**The party is four characters, not six.** `PARTY_SIZE = 4` (`game/party.ts`) is the single source of truth — the editor runs `PARTY_SIZE` slots and formation slots are densely `0..PARTY_SIZE-1`. Save v13→v14 trimmed larger rosters down to four. Earlier revisions of this file and of `AGENTS.md` said six; that was stale, and it has misled agents into sizing designs (and rejecting them) against the wrong party count.

### Dungeon depth systems (built incrementally, see AGENTS.md pitfalls for each)

- **Trapped chests** (`game/features.ts`, `state.pendingTrap`): stepping onto a trapped treasure tile gates ALL dungeon input behind a modal Inspect/Disarm/Open/Leave prompt.
- **Persistent utility spells** (`game/persistent-spells.ts`, `engine/spell-ui.ts`, dungeon `G` key): Light (light), Levitate (levitation), Wayfinder (detect) are dungeon-only buffs with a tick/clear lifecycle (`state.persistentBuffs`), also castable from the camp menu. Camping clears them.
- **Water tiles and swimming** (`game/features.ts` `handleWater`/`swimChance`): learn-by-doing per-character `state.swimSkill`; the Ring of Water Walking (a `"trinket"` item) bypasses swim checks entirely.
- **Item identification and cursed gear** (`data/items.ts`, `engine/town-ui.ts` Appraise tab): inventory is `InventoryEntry[]` (`{ itemId, identified }`), not `string[]`; unidentified chest drops show as "Unknown Weapon/Armor/Trinket" until appraised (50g) or equipped. Cursed items (`ItemDef.cursed`) force-equip on pickup and can't be manually removed — only the Temple's Remove Curse (100g) strips them.
- **Dungeon NPCs** (`game/npc.ts`, `engine/npc-ui.ts`, tile `"npc"`): additive-only hint/barter/flavor characters with a Talk (menu topics + free-typed hidden keywords) / Barter / Give / Steal / Attack / Leave panel. Attacking (or a botched Steal) starts a real fight against the NPC's formation; killing them persists (`state.killedNPCs`) across floor reloads and saves. NPCs never gate campaign progression — see AGENTS.md's "NPCs are additive content only" pitfall before adding a new one.
- **Class perks** (`game/perks.ts`, `data/perks.ts`, `engine/perk-select-ui.ts`, design doc `docs/superpowers/specs/2026-07-11-class-perks-design.md`): each character picks one of two mutually exclusive perks at levels 3/6/9/12. Level-ups now happen immediately after combat (`main.ts` `endCombat`), full-restoring and opening the perk overlay when a tier is crossed — the Training Ground in town is a read-only roster/perk-review screen, not where leveling happens anymore. See AGENTS.md's "Class perks and effective stats" section for the `perkModifiers` vs. `dispatchHook` split.

All outside-combat dungeon damage (traps, water) floors each character at 1 HP — only combat can wipe the party.

## Asset pipeline (JewelFlame sprite packs)

`assets/` contains large third-party sprite packs (`Characters(100x100)/`, `Creature Extended- Supporter Pack/`, `animations/`, `Classic Dungeons - Files/`) that are source material, not directly consumed by the game — only assets copied/referenced under the `assets/enemies/<id>/` convention (via `sprite-manifest.ts`) are wired into `combat-scene.ts`.

`scripts/generate-jewelflame-*.mjs` and `scripts/jewelflame-creature-utils.mjs` build static HTML preview pages (`jewelflame-preview.html`, `jewelflame-100x100-preview.html`, `jewelflame-creature-extended-preview.html`) for browsing these packs — they read PNG dimensions directly (via a hand-rolled IHDR parser, no image library needed for sizing) to infer frame counts from strip width, and are dev tooling only, not part of the build. `tools/tile-composer.html` is a standalone drag-and-drop tileset composer, also not part of the build.

`.tmp-*.html`/`.tmp-*.png` files at the repo root are scratch output from manual sprite-preview iteration — safe to ignore/delete, not build artifacts. `.gitignore` now catches `/.tmp*` and `/.tmp-*/` so they never show up in `git status`.
