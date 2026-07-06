# OnyxLabyrinth

A Wizardry-style dungeon crawler built with TypeScript and Vite. The game uses a hand-coded DOM UI, a 2D canvas corridor renderer, a canvas JRPG combat screen, and procedural Web Audio.

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

### Combat screen

After any change to `src/engine/combat-renderer.ts` or `src/engine/combat-ui.ts`:

1. Enter a combat encounter.
2. Confirm party sprites (left) and enemy sprites (right) are visible.
3. Advance log messages with Space/Enter and check the message box and selection lists render correctly.
4. Flee or win and confirm the dungeon view returns.

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
