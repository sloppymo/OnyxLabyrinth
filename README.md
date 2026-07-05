# OnyxLabyrinth

A Wizardry-style dungeon crawler built with TypeScript and Vite. The game uses a hand-coded DOM UI and a 2D canvas corridor renderer.

## Development

```bash
npm install
npm run dev          # local dev server
npm run build        # TypeScript + Vite production build
npx vite preview --port 5176 --base /OnyxLabyrinth/  # preview the production build locally
```

## Verifying renderer changes

The corridor renderer is the most fragile part of the project. After any change to `src/engine/renderer.ts`:

1. Run `npm run build` (must pass with zero TypeScript errors).
2. Start the production preview on `http://localhost:5176/OnyxLabyrinth/`.
3. Use the default party (`D` in party creation) and enter the dungeon.
4. Check: straight corridor, open side passages, a front wall at depth 0, and the floor A/B checkerboard are all visible and not black.
5. Trigger a combat, then flee or win, and confirm the dungeon view still renders textures correctly.

See `AGENTS.md` for the full checklist and common pitfalls.

## Deployment

GitHub Pages serves the `docs/` directory.

```bash
npm run build
# Copy the production build into docs/
cp -r dist/* docs/
# Remove any stale hashed JS files from docs/assets/ so only the current
# index-*.js remains.
```

After pushing, the live game is available at:

- **GitHub Pages:** https://sloppymo.github.io/OnyxLabyrinth/
- **Local preview:** http://localhost:5176/OnyxLabyrinth/

## Project layout

- `src/engine/` — rendering, input, camera, shell, auto-map, and UI controllers.
- `src/game/` — state machine, dungeon grid, party, and combat logic.
- `src/data/` — floors, enemies, items, and spells.
- `src/styles.css` — all UI styling.
- `docs/` — GitHub Pages target (generated from `dist/`).

See `AGENTS.md` for additional guidance aimed at LLM/AI assistants.
