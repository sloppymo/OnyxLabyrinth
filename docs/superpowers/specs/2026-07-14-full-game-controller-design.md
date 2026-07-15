# Full-Game Controller Support Design

**Date:** 2026-07-14  
**Status:** Approved for planning  
**Related:** `2026-07-14-controller-first-combat-design.md` (done — combat palette + `controller-input`)

## Problem

Combat is already playable on gamepad via `createControllerInput` and `CombatController.handleInput`. That poller is created only for combat and destroyed on exit. Every other mode still consumes raw keyboard `e.key` from `main.ts` keydown listeners (`town-ui`, `save-ui`, title, party creation, camp, arena, game-over, perk select, NPC, spell menu, dungeon bindings in `input.ts`). On a Steam Deck or Xbox pad, town and save/load appear frozen: movement sticks and face buttons do nothing.

## Goal

Make the **entire game** playable with a standard gamepad (Xbox / Steam Deck layout) without requiring a physical keyboard:

- Title, party creation (choice + field cycling), town and all town sub-screens, save/load, camp, arena setup, game-over, perk select, NPC panels (except typed ask), dungeon movement and secondary actions, trap prompts, dungeon grimoire overlay.
- Keep existing keyboard bindings and combat controller-first behavior working unchanged for keyboard users.

## Non-goals

- On-screen keyboard, letter pickers, or controller-driven free typing (NPC “Ask about…” typed keywords; custom party name character entry). Those remain keyboard-only; controller players use Default Party / left-right race-class cycling / visible NPC topics.
- Remappable controls or a settings screen.
- Changing combat math, encounter rates, menu layout aesthetics (beyond hint copy where needed).
- Rewriting every UI to a native `handleInput` API in this pass (see Architecture — hybrid).
- Full glyph art packs; text hints mentioning Start / Select / A / B are enough for v1.

## Decisions (from brainstorming)

| Decision | Choice |
|----------|--------|
| Scope | Full game: all menus + dungeon + combat |
| Secondary dungeon actions | **Start opens an Action ring** (list); Select opens save/system menu |
| Text entry | **Out of scope** for controller |
| Architecture | **Hybrid (C):** global input stream; combat stays native; list menus use a thin adapter into existing `handleKey`; dungeon maps pad → `InputHandlers` + action ring |

## Controller map (Xbox / Deck)

### Always

| Button | Meaning |
|--------|---------|
| D-pad / left stick | Navigate lists or move (context) |
| **A** | Confirm / Select (Enter) |
| **B** | Cancel / Back (Escape) |
| **Start** | **Dungeon only:** open Action ring. In other modes, Start is unused in v1 (lists already use A for confirm) so it cannot steal focus from overlays. |
| **Select** | Open save / system menu wherever Esc does today (dungeon `onSystemMenu`; town main menu). If the active screen already treats Esc as “back,” Select maps to Escape via the menu adapter instead of forcing save. |

### Dungeon exploration

| Button | Action |
|--------|--------|
| Stick / D-pad **↑** | Step forward |
| Stick / D-pad **↓** | Step backward |
| Stick / D-pad **←** / **→** | Turn left / turn right (same mental model as WASD turn) |
| **Start** | Open **Action ring** |
| **Select** | Save / system menu (`onSystemMenu`) |
| **A** / **B** | Only while a modal is open (action ring, trap, overlays) |

**Action ring** entries (cursor + A; B cancels):

1. Camp  
2. Toggle Map  
3. Grimoire  
4. Unlock  
5. Return to Town  
6. Cancel (or dismiss with B)

Choosing an entry invokes the existing `InputHandlers` callback (`onCamp`, `onToggleMap`, `onCastSpell`, `onUnlock`, `onTown`) and closes the ring. Overlay pattern matches save/spell: borrow pause of dungeon input, `justOpened` guard so the Start press that opens the ring does not also select the first row.

### Trap prompt (`pendingTrap`)

Present Inspect / Disarm / Open / Leave as a **four-row list** (↑↓ + A), matching other menus. B = Leave (same as Esc). Outcomes identical to today’s I / D / O / L keys. Keyboard letter shortcuts remain.

### Combat

Unchanged per `2026-07-14-controller-first-combat-design.md`. Global poller feeds `combatController.handleInput` when `state.mode === "combat"`. No second `createControllerInput` instance.

### List menus and overlays

Adapter maps pad → synthetic keys consumed by existing `handleKey`:

| Pad | Synthetic key |
|-----|----------------|
| Up / Down / Left / Right | `ArrowUp` / `ArrowDown` / `ArrowLeft` / `ArrowRight` |
| A | `Enter` |
| B | `Escape` |

Covered surfaces: title, party creation (choice screen + field/slot navigation — **not** name character insert), town main + shop/inn/temple/roster lists, save/load, camp, game-over, arena setup, spell grimoire, perk select, NPC root / talk / barter / give.

**Letter hotkeys** (`[D]` jump, shop B/S/A, temple R, roster S/P, etc.) remain keyboard-only. **Requirement:** every letter-only action must also be reachable by list navigation + A (or a dedicated list row). If any is letter-only today, add a navigable path as part of this work (e.g. temple “Remove Curse” as a selectable row if it is only `R` today).

**NPC ask phase / party name typing:** controller may navigate away or cancel with B; typing does not need to work on pad.

## Architecture

### Global input

- Create **one** `createControllerInput` for the session lifetime (or recreate only on full remount — not per combat).
- `main.ts` owns a single router callback: given `ControllerInputEvent`, pick the active consumer by the same priority as today’s keydown listeners (perk overlay → combat → save/spell/NPC overlays → mode UI → dungeon).
- On `press` only for menu navigation (ignore `hold`/`release` for list menus unless a surface already needs hold — combat alone uses hold for flee).
- Destroy the handle only when tearing down the app (or tests).

### New / touched modules

| Module | Role |
|--------|------|
| `src/engine/controller-input.ts` | Existing; used globally. Optionally export deadzone already present. |
| `src/engine/menu-controller-adapter.ts` (new) | Pure: `controllerEventToMenuKey(event) → string \| null` for Arrow*/Enter/Escape. Unit-tested. |
| `src/engine/dungeon-action-ring-ui.ts` (new) | Small overlay controller: render list, `handleKey` or consume adapter keys, call callbacks. |
| `src/engine/input.ts` | Keep keyboard `KEY_MAP`; pad does **not** go through `bindInput` — dungeon pad path calls the same handler functions main already wires. |
| `src/main.ts` | Wire global poller + router; Start → action ring; Select → save; trap list; feed adapter into each `*Controller.handleKey`. |
| Town / temple / etc. | Only where letter-only dead-ends exist; add selectable actions so pad can reach them. |
| Hint strings | Dungeon / ring / trap / save openers mention Start / Select / A / B where helpful. |

### Data flow

```
Gamepad / Keyboard (combat keyboard path)
        ↓
createControllerInput → ControllerInputEvent
        ↓
main router (mode + overlay guards)
        ├─ combat → CombatController.handleInput
        ├─ list UI → menu adapter → handleKey(synthetic)
        ├─ dungeon + no modal → move / turn / Select→save / Start→ring
        ├─ action ring open → ring UI
        └─ pendingTrap → trap list UI (or dedicated trap handler)
```

Keyboard keydown listeners for non-combat modes stay as today so keyboard users never depend on the adapter. **Rule:** gamepad must not double-dispatch the same logical action; keyboard must not be blocked when a pad is connected.

### Borrowed `"title"` mode

Action ring follows the same pitfall rules as save / spell / NPC / perk: own controller instance, `justOpened*` flag, guard key/listener (and router) on that instance being non-null.

## Error handling / edge cases

- Camera animation / `pendingTrap` / map-visible gates that already block dungeon keys also block pad move/turn and Start ring open (except trap UI when `pendingTrap` is set).
- If Start is pressed while an overlay already owns borrowed title mode, do not open a second ring; route to the active overlay.
- Disconnected gamepad mid-press: existing `controller-input` release behavior; no sticky move.
- Stick + D-pad same direction: existing multi-physical tracking; no double-step (one press event per logical button).

## Testing

**Vitest**

- `menu-controller-adapter`: each direction + A/B → expected keys; non-press kinds ignored; unmapped buttons null.
- Action ring: open → select Camp invokes callback and closes; B cancels without side effect; Start that opens does not auto-confirm (`justOpened`).
- Trap pad mapping: selecting each row yields the same trap action enum/outcome as I/D/O/L.
- Router smoke (light): with fake mode flags, events reach town vs combat vs dungeon without throwing.

**Manual / Playwright (pad via injected `ControllerInputEvent` or debug hook if present)**

- Title → Default Party → town: ↑↓ + A navigate; Select/Esc open save; load/cancel.
- Dungeon: stick move/turn; Start ring → Map / Camp / Grimoire / Town.
- Trap chest: pad Leave without keyboard.
- Combat regression: palette A/B/X/Y still works after global poller move.

## Success criteria

1. A player can finish a loop **title → party → town → dungeon → save → reload → combat → perk (if queued) → town** using only a gamepad (no typed fields).
2. Keyboard behavior unchanged for existing bindings.
3. `npm test` and `npm run build` green; adapter + ring covered by unit tests.

## Out of scope follow-ups (not this plan)

- Controller glyph sprites in help footers.
- Native `handleInput` on every `*-ui.ts` (retire synthetic keys).
- Typed keyword / name entry on pad.
- Keyboard shoulder/inspect remap debt from combat playtest notes (separate issue).
