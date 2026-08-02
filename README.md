# OnyxLabyrinth

A Wizardry-style dungeon crawler built with TypeScript and Vite. The game uses a hand-coded DOM UI, a 2D canvas corridor renderer, and an FF6-style combat presentation with Phaser as the default painter and a Canvas 2D rollback backend. Audio combines streamed music and sample-backed SFX with procedural Web Audio cues.

## The game

Man made war on the gods and lost. The gods left, and took Death with them — so nothing on the
plane ends. Before they went they buried a labyrinth, and at the bottom of it a lamp holding the
last wish in existence. The labyrinth is the lock they put on it. Edgehollow is the town at the
mouth of the hole, full of people who have been going down for longer than anyone can count.

Five floors, party-based turn-based combat, permanent-ish consequences that aren't death: a party
wipe advances the world year by 100 and wakes you back in town. Three floor bosses — **The Dead
Boy**, **The Lonely Girl**, and **The Crying Man** — and the game never tells you who they were.

Canon lives in
[docs/superpowers/specs/2026-07-25-labyrinth-narrative-design.md](docs/superpowers/specs/2026-07-25-labyrinth-narrative-design.md).
Defeating the floor-5 boss opens the one-time wish/ending sequence; subsequent wins return to the normal post-combat flow.

Want to build your own floors (custom geometry, textures, NPCs, events, encounter zones)? See [docs/FLOOR-AUTHORING.md](docs/FLOOR-AUTHORING.md) — `npm run floor:editor` opens the WYSIWYG editor, and `src/content/floors/floor-4-demo.json` is a complete example content pack.

## Dungeon controls

- Arrow keys or `WASD`: move and turn.
- `V`: toggle the translucent quick map. It is north-up and nonmodal, so
  exploration continues while it is open.
- `M`: open the existing full automap.
- `Tab`: open the dungeon action ring.
- `G`: open the grimoire; `C`: camp; `U`: unlock; `T`: return to town;
  `Esc`: save/load.

The quick map uses the same saved exploration memory as the full automap, but
its open/closed state is session-only. See [docs/MAP-OVERLAY.md](docs/MAP-OVERLAY.md)
for its rendering and discovery rules.

## Development

```bash
npm install
npm run dev          # local dev server
npm run build        # app/tools TypeScript checks + Vite production build
npm test             # Vitest suite
npm run floor:validate   # validate floor content packs
npm run floor:editor     # WYSIWYG floor editor
npx vite preview --port 5176 --base /OnyxLabyrinth/  # preview the production build locally
```

### Automated playtests

Append `?debug=1` to expose `window.__onyxDebug` (`snapshot`, `isIdle`, `readiness`, `jumpTo`,
`dumpSave`, `loadSave`, `log`, `sounds`). Playwright scripts drive it:

```bash
npx vite preview --port 5176 --base /OnyxLabyrinth/
export ONYX_URL="http://127.0.0.1:5176/OnyxLabyrinth/?debug=1"
node scripts/playtests/smoke-debug-surface.mjs
node scripts/playtests/stress-invariants.mjs
node scripts/playtests/playtest-floors-1-3.mjs
node scripts/playtests/playtest-floors-4-5.mjs
node scripts/playtests/map-overlay-verify.mjs
```

Gameplay RNG is **not** seeded yet, so playtest numbers are directional, not reproducible.

## Verifying changes

### Renderer

The corridor renderer is the most fragile part of the project. After any change to `src/engine/renderer.ts`:

1. Run `npm run build` (must pass with zero TypeScript errors).
2. Start the production preview on `http://localhost:5176/OnyxLabyrinth/`.
3. Use the default party (`D` in party creation) and enter the dungeon.
4. Check: straight corridor, open side passages, a front wall at depth 0, and the floor A/B checkerboard are all visible and not black.
5. Trigger a combat, then flee or win, and confirm the dungeon view still renders textures correctly.

### Combat screen (FF6-style)

After any change to `src/engine/combat-scene.ts`, `src/engine/combat-choreography.ts`, `src/engine/combat-phaser-stage.ts`, `src/engine/combat-ui.ts`, or `src/engine/combat-select-action-view.ts`:

1. Enter a combat encounter.
2. Confirm enemy sprites (left) and animated party sprites (right) are visible, with the three blue menu windows along the bottom.
3. Confirm an attack plays out: walk forward → attack animation → bouncing damage number over the target.
4. Cast a spell and confirm the top banner shows the spell name.
5. Flee or win (result window → Enter) and confirm the dungeon view returns.
6. Verify the default Phaser stage and repeat the critical flow with `?phaser=0` for the Canvas rollback painter.

### Boss fights

After any change to boss data, `sprite-manifest.ts`, or the boss audio path:

1. Reach a floor boss (or `jumpTo` the floor under `?debug=1`).
2. Confirm the intro nameplate shows the boss name and then yields to the normal banner.
3. Confirm the boss sprite is distinct per floor — floors 3/4/5 must not look alike.
4. Confirm the procedural boss bed starts with the fight and **stops on any combat end**,
   including flee and wipe. A following trash fight must be silent of it.

See `AGENTS.md` for the full checklists and common pitfalls.

## Deployment

GitHub Actions builds and deploys `dist/` to Pages on every push to `main` (`.github/workflows/deploy.yml`).

The live game is available at:

- **GitHub Pages:** https://sloppymo.github.io/OnyxLabyrinth/
- **Local preview:** http://localhost:5176/OnyxLabyrinth/

## Project layout

- `src/engine/` — rendering, input, camera, shell, auto-map, audio, and UI controllers.
- `src/game/` — state machine, dungeon grid, party, and combat logic.
- `src/data/` — floors, enemies, items, and spells.
- `src/content/floors/` — floor JSON content packs.
- `src/styles.css` — all UI styling.
- `scripts/playtests/` — Playwright playtest scripts driving the `?debug=1` surface.
- `docs/` — **design docs, specs, and playtest reports (markdown only).** Start at
  [docs/AGENT-READING-LIST.md](docs/AGENT-READING-LIST.md). This directory is *not* a build
  output; Pages deploys `dist/` straight from CI.

## Git workflow

- Run `npm run build` and `npm test` before committing.
- Verify renderer/combat/audio changes in a browser before pushing.
- Use conventional commits: `feat(scope):`, `fix(scope):`, `perf(scope):`, `chore(scope):`, `docs(scope):`.
- Do not leave `console.log`, `window.__` exposures, or `debugger` statements in commits.

See `AGENTS.md` for additional guidance aimed at LLM/AI assistants.
