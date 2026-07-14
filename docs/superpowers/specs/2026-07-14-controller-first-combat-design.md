# Controller-First Combat Design

## Problem

The current combat system is functionally complete and visually faithful to FF6, but playing it feels tedious. Navigating a nested keyboard menu for every action in every trash fight creates decision fatigue and slows the pace of dungeon exploration. On a controller — especially a Steam Deck — menu cursor navigation is the wrong interaction model.

## Goal

Make combat fast, intuitive, and engaging on a controller while preserving the FF6 aesthetic: blue menu windows, pixel font, bouncing damage pop-ups, spell banner, and arena perspective. Combat math, stats, status effects, and encounter balance must not change.

## Non-goals

- No real-time action combat. The game stays turn-based.
- No changes to damage formulas, hit/crit/evasion, XP/gold rewards, or encounter rates.
- No save-format changes; any new state lives only in the combat controller.
- No removal of keyboard fallback.

## Core design

Replace the nested vertical action menu with a **four-slot action palette** mapped to controller face buttons. Common actions are one press; spells/techniques/items open short lists navigated with the D-pad.

### Controller mapping (Xbox / Steam Deck glyphs)

| Button | Action |
|--------|--------|
| **A** | Attack with smart default target. |
| **B** | Defend. Long-press (~0.5 s with on-screen hold meter) to flee. |
| **X** | Open Magic list (disabled for classes that cannot cast). |
| **Y** | Open Skill list: Techniques for melee classes, Hide/Ambush for Thief, class-specific actions as needed. |
| **LB / RB** | Cycle target (enemy → ally → summon). |
| **LT** | Inspect previous party member (does not change initiative order). |
| **RT** | Inspect next party member (does not change initiative order). |
| **Start** | Toggle Auto-Repeat for the current combat. |
| **Select / Back** | Open Item list. |
| **D-pad / Left stick** | Navigate lists. |

Keyboard fallback uses `A`/`S`/`D`/`F` for the face-button slots and arrow keys + `Enter`/`Esc` for list navigation.

### Action palette

The bottom-left action menu becomes a horizontal 4-slot palette:

```
┌─────┬─────┬─────┬─────┐
│  A  │  B  │  X  │  Y  │
│Atk  │Def  │Magic│Skill│
└─────┴─────┴─────┴─────┘
```

- Each slot shows the glyph, action name, and cost (SP/Rage) when applicable.
- The palette is class-fixed for now: every character has Attack, Defend, Magic, and Skill slots. Slots that are unavailable to the current class (e.g., Magic for a Fighter) are shown disabled.
- Magic/Skill/Item lists open as the existing blue FF6 windows, navigated with D-pad + A/B.
- Item list is opened with Select and navigated the same way.

### Targeting

- **Smart default:** pressing A picks the preferred target using `preferredEnemyIndex` (last-hit if still living, otherwise lowest HP%, tie-break list order).
- **Single living enemy:** Attack resolves immediately without opening a target list.
- **Manual target:** LB/RB cycles targets and updates the scene cursor; A confirms.
- **Allies:** LB/RB cycles through living party members and summons for heals/buffs.

### Flow

1. A party member's turn starts. The camera subtly highlights them; the palette appears.
2. Player presses a face button.
   - A or B resolves immediately (Attack or Defend).
   - X/Y/Select opens a list.
   - LB/RB changes target before or after picking an action.
3. Enemy and summon turns remain auto-resolved.
4. Result window requires A/Enter to dismiss.

## Architecture

### New modules

- `src/engine/controller-input.ts`
  - Thin Gamepad API wrapper.
  - Emits normalized events (`buttonPressed`, `buttonHeld`, `axisMoved`).
  - Handles dead zones and glyph mapping (Xbox/PlayStation/Steam Deck).
  - Keyboard fallback for development and accessibility.

- `src/engine/combat-action-palette.ts`
  - Builds the four-slot palette for a character.
  - Decides which spells/techniques appear in X/Y lists based on class, level, and current SP/Rage.
  - Pure enough to unit test.

- `src/engine/combat-flow.ts`
  - Pure helpers: `preferredEnemyIndex`, `preferredAllyIndex`, `canRepeatAction`, `buildRepeatAction`.
  - Carried over from the earlier tempo UX plan.

### Modified modules

- `src/engine/combat-ui.ts`
  - `CombatController` consumes normalized controller events instead of raw key strings.
  - Replaces the vertical menu phase with the action-palette phase.
  - Keeps existing phases for target selection, spell/tech/item lists, playback, and result.

- `src/engine/combat-select-action-view.ts`
  - Renders the horizontal palette.
  - Keeps existing spell/tech/item/result windows.

- `src/engine/combat-scene.ts`
  - Adds playback-rate scaling and skip-to-end (from the tempo plan).
  - No structural changes to choreography.

- `src/main.ts`
  - Combat key listener becomes a controller-input listener.
  - Still supports keyboard events as fallback.

## Tempo features inherited from the earlier plan

- **Smart target defaults:** last-hit fallback to lowest HP%.
- **Single-enemy auto-confirm:** one press resolves Attack/Ambush when only one enemy lives.
- **Playback acceleration:** Shift-hold 2×, Tab sticky FAST 2×, stack to 4×.
- **Esc skip:** hard-skip current turn choreography.
- **Per-character Repeat:** `.` repeats the last Attack/Ambush if still valid.
- **Auto-battle:** Start toggles Bravely Auto for the current combat.

## Visual identity preserved

- Blue menu windows and pixel font remain unchanged.
- Damage pop-ups, spell banner, and arena perspective stay the same.
- The palette uses the same window chrome and palette as existing menus.

## Verification

- `npm run build` and `npm test` pass.
- Arena mode proves controller input end-to-end.
- Manual checks:
  - Attack resolves in one press when one enemy lives.
  - LB/RB target cycling updates the scene cursor.
  - Magic list opens with X and resolves with D-pad + A.
  - Auto-Repeat toggles with Start and stops if an action becomes illegal.
  - Keyboard fallback still works.
  - Victory/defeat result window still requires Enter/A.

## Risks

- **Input latency:** Gamepad API polling must happen inside the render loop or a dedicated input loop to feel responsive.
- **Focus conflicts:** Browser focus and Steam overlay can intercept keys. We prevent default on all bound combat keys.
- **Accessibility:** Some players will use keyboard; the fallback must remain complete.
- **Scope creep:** Auto-Repeat and customizable palettes are tempting expansions. Palette customization is explicitly out of scope for this pass.

## Decisions

- One coherent commit covering the controller input, palette, smart defaults, and tempo acceleration.
- Controller is primary input; keyboard is supported fallback.
- Class-fixed palette; no per-character customization yet.
- Initiative order is enforced; LT/RT are manual overrides, not the default flow.
- Auto-Repeat repeats exact last action, not a generic "everyone attacks" fallback.
