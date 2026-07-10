# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Read `AGENTS.md` before making any change to `src/`.** It contains a detailed file map, hard rules (things not to change without being asked), verification checklists for the renderer/combat screen, and a list of common pitfalls with their fixes. It is the primary source of truth for engine work; this file covers commands and orientation, not repeated here.

## What this is

OnyxLabyrinth is a Wizardry-style first-person dungeon crawler: TypeScript + Vite, no UI framework. A 2D canvas renders a pseudo-3D corridor view; the rest of the UI (menus, combat, town, camp) is hand-built DOM. Deployed to GitHub Pages from the `docs/` folder.

## Commands

```bash
npm install
npm run dev                 # dev server
npm run build                # tsc && vite build — must pass with zero TS errors before committing
npm test                     # vitest run (all tests, single pass)
npm run test:watch           # vitest watch mode
npx vitest run src/game/combat.test.ts   # run a single test file
npx vite preview --port 5176 --base /OnyxLabyrinth/   # serve the production build for visual verification
```

There is no separate lint script; `tsc` (via `npm run build`) is the type-checking gate — `noUnusedLocals`/`noUnusedParameters`/`noFallthroughCasesInSwitch` are all enforced.

Test files use the `.test.ts` suffix, live next to the code they test, and are excluded from the build (`tsconfig.json` excludes `src/**/*.test.ts`; Vitest's `include` is `src/**/*.test.ts`).

### Deployment (GitHub Pages from `docs/`)

```bash
npm run build
cp -r dist/* docs/
rm -f docs/assets/index-*.js docs/assets/index-*.css   # drop stale hashed bundles first
cp dist/assets/* docs/assets/
```
Commit and push `docs/` for the change to go live at https://sloppymo.github.io/OnyxLabyrinth/.

## Architecture

Three top-level source areas with a one-way dependency shape — `game/` holds no engine/DOM concerns, `engine/` reads and mutates `GameState` but owns all rendering/input/audio, and `data/` is static content both depend on:

- **`src/game/`** — pure state and rules: `state.ts` (the `GameState` factory/mode setter), `dungeon.ts` (edge-based grid model — each `Cell` has N/E/S/W edges that are `open | wall | door | locked`, not a tile enum), `party.ts`, `combat.ts` (combat resolution; emits structured `CombatEvent`s alongside log strings), `save.ts`, `features.ts` (tile-feature handling: stairs, teleporters, chutes, treasure, darkness/antimagic zones).
- **`src/engine/`** — rendering and I/O: `renderer.ts` (the corridor view — the most fragile file in the repo; see AGENTS.md before touching it) plus `render-math.ts` for the extracted, unit-tested pure geometry/fog/camera math; the FF6-style combat screen: `combat-scene.ts` (canvas scene + turn choreography + damage popups), `combat-ui.ts` (per-actor instant-resolve controller), `combat-select-action-view.ts` (DOM menu windows overlaid on the canvas); `shell.ts` as the single source of truth for DOM mode visibility; `camera.ts`, `input.ts`, `automap.ts`, `audio.ts` (procedural Web Audio, no sample files).
- **`src/data/`** — static definitions: `floors.ts`, `enemies.ts` (encounter tables), `spells.ts`, `items.ts`.
- **`src/main.ts`** — wires everything together: owns the single `GameState` instance, the mode-transition logic (`transitionToMode`, fade via `canvas.style.opacity`), per-mode controllers (`CombatController`, `CampController`, `TownController`, `SaveController`, `PartyCreationController`) that are constructed/torn down on mode entry/exit, and the top-level `keydown` listeners that route input to whichever controller is active for the current `state.mode`.

`GameMode` is a strict union (`title | party_creation | town | dungeon | combat | camp | game_over`) and only one mode is live at a time; `shell.showMode()` is the only place DOM visibility per mode should be toggled (see AGENTS.md "Common pitfalls" for the history of bugs from bypassing it).

Combat sprites are hybrid: `sprite-manifest.ts` maps enemy IDs to horizontal PNG frame-strips (100×100 px/frame) under `public/assets/enemies/<id>/<state>.png`, and `party-sprite-cache.ts` maps character classes to strips under `public/assets/party/<class>/<state>.png` (frame counts derived from strip width at load). `combat-scene.ts` draws the image strip when present and falls back to a procedural shape otherwise. Not every enemy has art — that's expected, not a bug. Combat resolution has two APIs in `game/combat.ts` sharing the same internals: round-based `resolveCombatRound` (kept for tests) and the per-turn API (`beginRound`/`resolvePlayerTurn`/…) that drives the FF6 UI.

## Asset pipeline (JewelFlame sprite packs)

`assets/` contains large third-party sprite packs (`Characters(100x100)/`, `Creature Extended- Supporter Pack/`, `animations/`, `Classic Dungeons - Files/`) that are source material, not directly consumed by the game — only assets copied/referenced under the `assets/enemies/<id>/` convention (via `sprite-manifest.ts`) are wired into `combat-scene.ts`.

`scripts/generate-jewelflame-*.mjs` and `scripts/jewelflame-creature-utils.mjs` build static HTML preview pages (`jewelflame-preview.html`, `jewelflame-100x100-preview.html`, `jewelflame-creature-extended-preview.html`) for browsing these packs — they read PNG dimensions directly (via a hand-rolled IHDR parser, no image library needed for sizing) to infer frame counts from strip width, and are dev tooling only, not part of the build. `tools/tile-composer.html` is a standalone drag-and-drop tileset composer, also not part of the build.

`.tmp-*.html`/`.tmp-*.png` files at the repo root are scratch output from manual sprite-preview iteration — safe to ignore/delete, not build artifacts.
