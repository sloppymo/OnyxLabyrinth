# Agent Notes for OnyxLabyrinth

This file exists to help the next LLM/AI IDE get oriented quickly and avoid the same regressions that have been fixed multiple times.

## Project basics

- **Stack:** TypeScript, Vite, vanilla HTML/CSS/Canvas.
- **No framework.** The UI is hand-drawn DOM + a 2D canvas corridor renderer.
- **Entry:** `src/main.ts` bootstraps the app and mounts it into `#app`.
- **Build:** `npm run build` (runs `tsc && vite build`). The build must pass TypeScript with zero errors.
- **Dev server:** `npm run dev`.
- **Tests:** `npm test` (runs Vitest). Test files use `.test.ts` suffix and are excluded from the build tsconfig.
- **Production preview:** `npx vite preview --port 5176 --base /OnyxLabyrinth/`.
- **Deployment:** GitHub Pages serves the `docs/` folder. After `npm run build`, copy `dist/` into `docs/` and remove stale hashed JS files in `docs/assets/`.

## File map

| File | Responsibility |
|------|----------------|
| `src/engine/renderer.ts` | Corridor 3D view (the most fragile code). |
| `src/engine/render-math.ts` | Pure math functions extracted from renderer (geometry, fog, camera interpolation). Unit-tested via `render-math.test.ts`. |
| `src/engine/audio.ts` | Procedural Web Audio: ambient drone, footsteps, door sounds. |
| `src/engine/combat-scene.ts` | FF6-style canvas combat scene: enemies LEFT / party RIGHT, animated sprite strips, turn choreography engine (walk → attack → hurt + bouncing damage popups), spell-name banner. Consumes structured `CombatEvent`s only — null (log-only) events get no animation. |
| `src/engine/enemy-sprite-cache.ts` | Module-level image cache for enemy sprite strips (enemy art faces RIGHT, drawn unmirrored). Falls back to procedural shapes in `combat-scene.ts`. |
| `src/engine/party-sprite-cache.ts` | Image cache for party member sprite strips (`public/assets/party/<class>/`). Frame counts derived from strip width / 100 at load. Party art faces RIGHT, drawn mirrored (party faces left). |
| `src/engine/combat-ui.ts` | FF6 combat controller: per-actor instant resolve. Walks the `beginRound` initiative queue; player turns open the FF6 menu, enemy/ally turns auto-play. No Space-gated message reveal. |
| `src/engine/combat-select-action-view.ts` | DOM renderer for the FF6 bottom windows (action menu / enemy names / party HP list) overlaid on the combat canvas, plus the victory/defeat result window. |
| `src/engine/shell.ts` | DOM shell: canvas sizing, message overlay, party strip, mode visibility. |
| `src/engine/input.ts` | Dungeon exploration key bindings. |
| `src/engine/camera.ts` | Movement, turning, collision, door unlock. |
| `src/engine/automap.ts` | Auto-map rendering. |
| `src/game/state.ts` | `GameState` factory and mode setter. |
| `src/game/features.ts` | Tile-feature handling (stairs, teleporters, chutes, darkness, antimagic, treasure, water) + trapped-chest interaction (`pendingTrap`, Inspect/Disarm/Open/Leave, trap effects) + swim checks (`swimChance`, learn-by-doing `swimSkill`). |
| `src/game/features.test.ts` | Unit tests for the trap interaction and water/swimming (vitest). |
| `src/game/persistent-spells.ts` | Utility spells cast outside combat (Milwa light / Litofit levitation / Dumapic detect): buff add/tick/clear, cast validation. |
| `src/game/persistent-spells.test.ts` | Unit tests for utility spells and buff/feature interplay (vitest). |
| `src/engine/spell-ui.ts` | Dungeon grimoire menu (G key): lists utility casts, casts via persistent-spells. |
| `src/game/dungeon.ts` | Grid model, edge helpers, carving. |
| `src/game/party.ts` | Character/party creation. |
| `src/game/combat.ts` | Combat state/helpers. Emits structured `CombatEvent`s alongside log messages for the renderer. Two resolution APIs sharing the same internals: round-based `resolveCombatRound` (legacy/tests) and the per-turn API (`beginRound` / `resolvePlayerTurn` / `resolveEnemyTurn` / `resolveAllyTurn` / `endRound`) used by the FF6 combat UI. |
| `src/game/combat.test.ts` | Unit tests for combat resolver (vitest). |
| `src/game/combat-turns.test.ts` | Unit tests for the per-turn combat API (vitest). |
| `src/game/save.test.ts` | Unit tests for save serialization (vitest). |
| `src/game/party.test.ts` | Unit tests for party creation (vitest). |
| `src/engine/combat-scene.test.ts` | Unit tests for the combat choreography engine (vitest). |
| `src/engine/combat-select-action-view.test.ts` | Unit tests for the FF6 windows DOM renderer (vitest). |
| `src/engine/enemy-sprite-cache.test.ts` | Unit tests for enemy sprite image cache (vitest). |
| `src/engine/party-sprite-cache.test.ts` | Unit tests for party sprite cache / frame derivation (vitest). |
| `src/data/enemies.test.ts` | Unit tests for enemy definitions and encounter tables (vitest). |
| `src/engine/render-math.test.ts` | Unit tests for renderer geometry/fog/camera math (vitest, 74+ tests). |
| `src/engine/camp-ui.ts` | Camp screen controller. |
| `src/engine/town-ui.ts` | Town/hub screen controller. |
| `src/engine/save-ui.ts` | Save/load menu controller. |
| `src/engine/party-ui.ts` | Party creation controller. |
| `src/data/floors.ts` | Floor definitions and cloning. |
| `src/data/enemies.ts` | Encounter tables and resolution. |
| `src/data/spells.ts` | Spell definitions. |
| `src/data/items.ts` | Item definitions. |
| `src/styles.css` | All styling. |
| `docs/` | GitHub Pages target; copied from `dist/`. |

## Git workflow

1. **Build before committing.** Always run `npm run build` and confirm zero TypeScript errors before `git commit`. The build is the minimum verification gate.
2. **Verify before pushing.** Do not push claims you haven't checked. For renderer/combat changes, run the game in a browser and inspect the relevant screen.
3. **Refresh `docs/` for GitHub Pages.** After any build that changes hashed assets, copy `dist/` into `docs/` and remove stale `docs/assets/index-*.js` / `docs/assets/index-*.css` files so only the current hashes remain.
4. **Commit message style.** Use conventional commits: `feat(scope):`, `fix(scope):`, `perf(scope):`, `chore(scope):`, `docs(scope):`. Keep the summary under 72 characters.
5. **No debug code in commits.** Remove `console.log`, `window.__` exposures, `debugger`, and temporary timing hooks before committing.
6. **Do not mutate git history unless asked.** No `git rebase`, `git reset --hard`, or force-push without explicit user confirmation.

## Hard rules

1. **Do not change game logic** (movement, collision, combat math, encounter rates, map data) unless the user explicitly asks for it.
2. **Do not remove existing visual effects:** fog falloff, amber glow lines, vignette, CRT scanlines.
3. **Do not change the perspective/vanishing-point math** in the corridor renderer unless asked.
4. **Renderer changes must be verified visually.** After any change to `src/engine/renderer.ts`:
   - Run `npm run build`.
   - Start the production preview.
   - Capture screenshots of at least: straight corridor, open side passage, front wall, darkness zone.
   - Inspect for black walls, missing ceiling, center seams, or texture stretching.

## Common pitfalls

- **`#message` overlay:** The message box is absolutely positioned over the top 35% of the viewport. When empty it must be hidden (`display: none` / `visibility: hidden` / `opacity: 0`) or it covers the ceiling with a black box. `shell.setMessage()` handles this.
- **Texture cache:** `renderer.ts` caches one prepared tileset per floor id in `tilesetCache` (loaded by `loadTextures()`, selected by `state.floor.id` each frame; floors without art fall back to the floor-1 set). If any image fails, the cached set holds `null` for that slot and the renderer silently falls back to gradients/fills. Check the browser console if a texture seems missing. Tileset PNGs are generated by `scripts/generate-floor-tilesets.mjs` (deterministic; re-run it to regenerate `src/assets/f*_*.png`).
- **CanvasPattern lifecycle:** `CanvasPattern` objects are tied to a specific canvas context. When the canvas bitmap is reset (e.g., `canvas.width = ...` in `shell.resizeCorridorCanvas()`), cached patterns become invalid and draw as black/transparent. Do not cache `CanvasPattern` objects across frames; recreate them inside the draw call.
- **Canvas sizing:** The canvas intrinsic size is kept in sync with the CSS container by `shell.resizeCorridorCanvas()`. Do not set `canvas.width`/`height` to fixed values elsewhere.
- **Display state:** `main.ts` previously toggled `viewportWrap`, `canvas`, `map-canvas`, and `combat-panel` visibility in many places. The single source of truth is now `shell.showMode()`.
- **Far-to-near rendering:** The renderer collects per-depth draw commands and executes them far-to-near. Do not insert raw drawing calls inside the forward visibility walk without pushing them into the command list.
- **Front-wall depth 0:** All front-facing wall quads, including the closest one, are textured. Avoid special-casing `depth === 0` to skip the texture fill; that produces a black hole where the wall should be.
- **Trap prompt modality:** while `state.pendingTrap` is set (party standing on a trapped chest), every dungeon input handler in `main.ts` is gated off with `!state.pendingTrap` and a dedicated keydown listener owns I/D/O/L (+Esc = leave). Any NEW dungeon key handler must add the same gate or it will fire mid-prompt.
- **#message length:** the message overlay shows ~2 lines of ~30 characters before clipping (it scrolls, but players won't). Keep interactive prompt strings (key hints) short enough to stay visible.
- **Borrowed "title" mode:** the save menu (Esc) AND the dungeon spell menu (G) both borrow mode "title" to pause dungeon input. Their key listeners guard on their own controller instance being non-null, so they can't fight — but any new overlay borrowing "title" must follow the same pattern (own controller + justOpened flag).
- **Utility spells are dungeon-only:** spells whose effect kind is light/levitation/detect must stay out of combat spell lists (`isUtilitySpell` filter in combat-ui.ts `knownSpells`) — the combat resolver has no case for them and would silently waste the turn and SP.
- **Trinket items** (`type: "trinket"`, e.g. ring-of-water-walking) are carried, never equipped and never shop stock. Auto-equip paths must only handle `weapon`/`armor`; the shop buy list filters trinkets out. Their effects are checked directly by game logic (`inventory.includes(...)`).
- **Outside-combat damage never kills:** trap and water damage floors each character at 1 HP by design — party wipes belong to combat. Keep that invariant for any new dungeon hazard.

## Rendering verification checklist

After any change to `src/engine/renderer.ts`, confirm these in-game views before calling it done:

1. **Straight corridor:** walls, floor, and ceiling all show texture; no black surfaces.
2. **Open side passage:** the lateral void has floor/ceiling/back-wall texture, not a flat black cut-out.
3. **Front wall at depth 0:** walking up to a wall shows a textured surface, not a black rectangle.
4. **Floor checkerboard:** alternating A/B tiles are visible as you move forward.
5. **Combat → dungeon transition:** after fleeing or winning a fight, returning to the dungeon still shows textures (catches pattern-cache invalidation).
6. **Map overlay:** pressing `M` shows the auto-map without corrupting the corridor canvas.

Use Playwright, Puppeteer, or a manual browser at `http://localhost:5176/OnyxLabyrinth/`.

## Combat (FF6) verification checklist

After any change to `src/engine/combat-scene.ts`, `src/engine/combat-ui.ts`, or `src/engine/combat-select-action-view.ts`:

1. **Combat starts:** entering a fight shows the FF6 scene (enemies LEFT, party RIGHT) with the three blue bottom windows (action menu / enemy names / party HP list) overlaid on the canvas.
2. **Party sprites animate:** party members are animated pack sprites (Knight/Wizard/Priest/Archer/Swordsman) facing LEFT, idle-looping; the acting character has a bouncing marker.
3. **Turn playback:** confirming an action plays immediately — attacker walks forward, attack animation, target hurt animation + white bouncing damage number, walk back. No Space-gating during playback.
4. **Damage popups:** white = damage, green = heal, purple = poison tick, "MISS" on evades.
5. **Spell banner:** casting shows the spell name in the top banner window plus a burst effect on targets.
6. **Target cursor:** in target selection, a blinking marker appears over the highlighted candidate on the scene; the menu window lists names with ▶.
7. **Image-strip enemies:** enemies with strips (e.g. `failed-experiment`, `lesser-construct`) render the PNG facing RIGHT (toward the party); unmapped enemies use the procedural fallback.
8. **Defeated fade:** killed enemies play their death strip then fade out; KO'd party members stay in the death pose.
9. **Result window:** victory shows gold/XP in a centered window; Enter exits.
10. **Combat → dungeon transition:** fleeing or winning returns to the dungeon view with corridor textures intact.
11. **Windows never clip sprites:** all six party members and all enemies stay visible above the bottom windows.
12. **Summoned allies in the windows:** living BAMORDI/SOCORDI summons show as cyan rows in the enemy window (name + HP) and as compact cyan rows below the party list; single-target heal spells list them as extra targets (cursor kind "ally" on the scene) and the heal resolves on the summon's HP.

## Conventions

- Prefer `const` and explicit types.
- Keep renderer constants in `RENDER_CONFIG` at the top of `renderer.ts`.
- Keep audio constants in the `AudioEngine` `CFG` object at the top of `audio.ts`.
- Keep combat scene layout constants near the top of `combat-scene.ts`. (The old `combat-renderer.ts` was deleted in the FF6 rewrite — do not restore it from git history; `combat-scene.ts` is its replacement.)
- Renderer math functions (geometry, fog, camera interpolation) live in `render-math.ts` and are unit-tested. When adding new math to the renderer, extract it to `render-math.ts` and add a test.
- Run `npm run build` before claiming any fix is complete.
- Run `npm test` before claiming any combat/save/party/renderer-math change is complete.
- Verify visually for renderer/combat/audio changes; don't rely only on the build passing.
- After rebuilding, refresh `docs/` from `dist/` if the user wants the GitHub Pages build updated.

## Combat event system

`combat.ts` emits structured `CombatEvent` entries alongside each log message (1:1 parallel array `s.events`). The FF6 combat scene (`combat-scene.ts`) builds its turn choreography **exclusively** from these events — there is no regex log parsing anymore, and `null` events (log-only lines) are silently skipped. Consequence: when adding a new combat action or outcome, you MUST `emit()` a structured `CombatEvent` for it or it will not animate and will show no damage popup. The old round-based `resolveCombatRound` still exists (shared internals, used by tests); the combat UI uses the per-turn API.

## Renderer performance / feel notes

- The floor/ceiling `ImageData` buffer is reused across frames (allocated once, resized only when canvas dimensions change). Do not call `ctx.createImageData()` in the hot loop.
- Edge-glow lines are batched into 4 depth-bucketed `Path2D` objects and stroked once per bucket, not per strip. This avoids per-strip `shadowBlur` state changes.
- Scanlines use a cached `CanvasPattern` instead of per-line `fillRect` calls.
- Torch flicker is a subtle warm overlay (~±4% alpha) driven by a sine wave with a secondary frequency for organic irregularity. Suppressed in darkness zones.
- `Math.floor()` in the floor/ceiling hot loop is replaced with `| 0` (bitwise truncation) for performance. This is safe because world coordinates are always non-negative.
- The render camera animator (`RenderCameraAnimator` in `render-math.ts`) is module-level and DOM-free. It exposes `isAnimating()` for input gating and `reset()` for floor transitions.
- Dungeon movement input is gated by `isRenderCameraAnimating()` in `main.ts` so rapid key repeats cannot re-target an in-flight tween.
- Head bob is a screen-space integer-pixel offset applied to the floor/ceiling `putImageData` and the world-space draw pass (walls, edge glow, floor feature). Overlays (vignette, scanlines) are not shifted.
- The corridor/map canvas intrinsic size is capped at 768×672 by `shell.resizeCorridorCanvas()`; CSS scales the canvas to fill the container. This avoids multi-megapixel buffers on large/high-DPI displays.
- Combat encounters trigger a brief `#flash-overlay` animation via `shell.flashEncounter()`.
