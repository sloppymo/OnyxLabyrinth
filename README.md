# OnyxLabyrinth

A Wizardry-style dungeon crawler built with TypeScript and Vite. The game uses a hand-coded DOM UI, a 2D canvas corridor renderer, a canvas JRPG combat screen, and procedural Web Audio.

Want to build your own floors (custom geometry, textures, NPCs, events, encounter zones)? See [docs/FLOOR-AUTHORING.md](docs/FLOOR-AUTHORING.md) — `npm run floor:editor` opens the WYSIWYG editor, and `src/content/floors/floor-4-demo.json` is a complete example content pack.

## Development

```bash
npm install
npm run dev          # local dev server
npm run build        # TypeScript + Vite production build
npx vite preview --port 5176 --base /OnyxLabyrinth/  # preview the production build locally
```

## Verifying changes

### Renderer

The corridor renderer is the most fragile part of the project. After any change to `src/engine/renderer.ts`:

1. Run `npm run build` (must pass with zero TypeScript errors).
2. Start the production preview on `http://localhost:5176/OnyxLabyrinth/`.
3. Use the default party (`D` in party creation) and enter the dungeon.
4. Check: straight corridor, open side passages, a front wall at depth 0, and the floor A/B checkerboard are all visible and not black.
5. Trigger a combat, then flee or win, and confirm the dungeon view still renders textures correctly.

### Combat screen (FF6-style)

After any change to `src/engine/combat-scene.ts`, `src/engine/combat-ui.ts`, or `src/engine/combat-select-action-view.ts`:

1. Enter a combat encounter.
2. Confirm enemy sprites (left) and animated party sprites (right) are visible, with the three blue menu windows along the bottom.
3. Confirm an attack plays out: walk forward → attack animation → bouncing damage number over the target.
4. Cast a spell and confirm the top banner shows the spell name.
5. Flee or win (result window → Enter) and confirm the dungeon view returns.

See `AGENTS.md` for the full checklists and common pitfalls.

## Deployment

GitHub Pages serves the `docs/` directory.

```bash
npm run build
# Copy the production build into docs/
cp -r dist/* docs/
# Remove any stale hashed JS/CSS files from docs/assets/ so only the
# current index-*.js and index-*.css remain.
rm -f docs/assets/index-*.js docs/assets/index-*.css
cp dist/assets/* docs/assets/
```

Commit and push the refreshed `docs/` folder.

After pushing, the live game is available at:

- **GitHub Pages:** https://sloppymo.github.io/OnyxLabyrinth/
- **Local preview:** http://localhost:5176/OnyxLabyrinth/

## Project layout

- `src/engine/` — rendering, input, camera, shell, auto-map, audio, and UI controllers.
- `src/game/` — state machine, dungeon grid, party, and combat logic.
- `src/data/` — floors, enemies, items, and spells.
- `src/styles.css` — all UI styling.
- `docs/` — GitHub Pages target (generated from `dist/`).

## Git workflow

- Run `npm run build` before committing.
- Verify renderer/combat/audio changes in a browser before pushing.
- Refresh `docs/` from `dist/` after any build that changes hashed assets.
- Use conventional commits: `feat(scope):`, `fix(scope):`, `perf(scope):`, `chore(scope):`, `docs(scope):`.
- Do not leave `console.log`, `window.__` exposures, or `debugger` statements in commits.

See `AGENTS.md` for additional guidance aimed at LLM/AI assistants.
