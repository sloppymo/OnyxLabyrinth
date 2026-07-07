# Design: DOM-based `selectAction` Combat Phase

## Goal
Replace the current full-canvas `selectAction` combat screen with a DOM-based box layout matching the approved Wizardry/Bard's Tale mockup, while keeping the existing canvas combat renderer intact for all other phases.

## Approved approach
Create a new isolated phase renderer (`src/engine/combat-select-action-view.ts`) that builds DOM elements into `#combat-panel`. The existing `CombatController` calls this renderer only when `phase === "selectAction"`. All other phases continue to use `src/engine/combat-renderer.ts`.

## Layout

```
┌─────────────────────────────────────────────┐ y=0
│ STATUS BAR            h=56                   │  "5 Blackflies"        (5)
├─────────────────────────────────────┬────────┤ y=64
│                                       │        │
│  VIEWPORT (sprite)     w=460          │ MENU   │  h=248
│  (small canvas with procedural sprite)│ w=300  │
│                                       │        │
├───────────────────────────────────────────────┤ y=320
│ PARTY TABLE            h=336                  │
│  header row + up to 6 rows                    │
└─────────────────────────────────────────────┘ y=664 (8px margin to 672)
```

## DOM structure

- `#combat-panel` receives the rendered layout.
- `.combat-status-bar`: flex row, `justify-content: space-between`, border using `--border-default`.
- `.combat-row`: flex row, gap 8px, height 248px.
  - `.combat-viewport`: flex 1.5, bordered, contains a `<canvas>` for the procedural enemy sprite.
  - `.combat-menu`: flex 1, bordered, action list.
- `.combat-party-table`: full-width table with Name / Class / AC / Hits / Status columns.

## Styling

Reuse existing theme tokens from `src/styles.css`:
- `--bg`, `--amber`, `--warm-white`, `--border-default`, `--text-dim`, `--danger-red`.
- Font family `"FF36"` via existing `@font-face`.
- Selection pattern: `.selected` class with `background: #1f1c16` and `border-left: 3px solid var(--amber)`, plus a `▶` marker — identical to town/camp/save menus.

## Sprite

- `EnemyDef` does not currently have a `spriteUrl` field.
- The viewport contains a small `<canvas>` (e.g. 200×200).
- Reuse the existing procedural enemy drawing logic from `src/engine/combat-renderer.ts` (specifically `drawEnemySprite`) by drawing the current representative enemy onto the viewport canvas.
- Fallback to enemy name text if no enemy is present.

## Input

Both keyboard and click/tap share the same state update path:
- `onSelectIndex(index)`: moves the `▶` marker.
- `onConfirm(kind)`: produces the corresponding `PlayerAction` and advances `CombatController` to the next actor or target-selection phase.
- Menu click/tap immediately confirms the action (one-step interaction).

## Integration points

1. `src/engine/combat-ui.ts`
   - During `selectAction`, render the DOM view into `#combat-panel` instead of drawing to `#combat-canvas`.
   - Handlers call the same internal methods used by keyboard input (`handleActionKey` equivalents) so keyboard and mouse stay in sync.
2. `src/engine/shell.ts`
   - Currently `showMode("combat", ...)` hides `#combat-panel` and shows `#combat-canvas`.
   - For the DOM-based `selectAction` phase, `#combat-panel` must be visible.
   - Decision: have `CombatController` toggle panel/canvas visibility directly for this phase, rather than changing the global `showMode` contract. This keeps the change localized.
3. `src/engine/combat-renderer.ts`
   - No changes in this pass; continue using it for non-selectAction phases.

## Phase mapping

| Phase | Renderer |
|-------|----------|
| `selectAction` | New DOM view |
| `selectEnemyTarget` | Existing canvas (this pass) |
| `selectSpell` | Existing canvas (this pass) |
| `selectItem` | Existing canvas (this pass) |
| `ready` | Existing canvas |
| `messageReveal` | Existing canvas |
| `roundResult` | Existing canvas |
| `ended` | Existing canvas |

## Files changed

- **New:** `src/engine/combat-select-action-view.ts`
- **Modified:** `src/engine/combat-ui.ts`
- **Modified:** `src/styles.css` (add combat-specific classes)
- **Modified:** `src/engine/shell.ts` if visibility helpers are needed

## Testing

- Run `npm test` to ensure existing combat and renderer tests still pass.
- Run `npm run build` to ensure zero TypeScript errors.
- Visually verify the selectAction screen against a real encounter.

## Future work (out of scope)

- Convert `selectEnemyTarget`, `selectSpell`, `selectItem`, and `messageReveal` to the same DOM layout.
- Add `spriteUrl` to `EnemyDef` and replace procedural viewport canvas with `<img>` sprites.
- Add dedicated `game_over` mode screen instead of returning to dungeon on wipe.
