# Current Product Contract

**Status: current as of 2026-08-27.** This document is the source of truth when an older dated plan, playtest report, or prompt disagrees with it.

## Campaign entry and protagonists

- A new campaign follows **Title → Prologue → Edgehollow → dungeon**.
- There is no Party Creation screen, party-selection carousel, custom character editor, preset/default roster choice, Reform Party action, or roster reorder flow.
- The campaign protagonists are fixed:
  - **Old Man** — id `old-man`, campaign class `Mage`, formation slot 1.
  - **Rat King** — id `rat-king`, campaign class `Thief`, formation slot 0.
- The campaign still uses the historical `Character[]` / `GameState.party` shape internally because combat, equipment, companions, and save migration share that data model. It is not a player-selectable party. Do not widen or rename that compatibility shape casually; update save migration and every combat consumer if it changes.
- Card Trial is a separate Arena prototype and already uses the same two hero ids. Its future six-school redesign is not a campaign implementation.

## Implementation sources of truth

- `src/game/playable-duo.ts` — fixed duo construction, ids, and legacy-save normalization.
- `src/game/state.ts` — new-state construction.
- `src/main.ts` — New Game and load application paths.
- `src/types/index.ts` — current `GameMode` union and compatibility state shape.
- `src/engine/base-screen-runtime.ts`, `src/engine/controller-route.ts`, `src/engine/shell.ts` — live routes; none contain `party_creation`.
- `src/engine/town-ui.ts`, `src/engine/camp-ui.ts`, `src/engine/game-over-ui.ts` — current duo-facing copy and controls.
- `src/game/save.ts` — normalization of legacy saves into the fixed duo.
- `src/game/test-roster.ts` — test-only four-slot fixture; never import it from production code.
- `createCharacterRecord` in `src/game/party.ts` — low-level record construction used by the fixed-duo factory, save migration, and tests; it is not a player-facing creation flow.

## Legacy names that are intentional

- `LEGACY_PARTY_SIZE` is only the retired four-member save-migration cap.
- `PARTY_SIZE` in combat renderer/layout modules is a sprite draw-size constant, unrelated to roster count.
- The underlying `party` field, party sprite/cache module names, and combat “party” terminology are compatibility/internal names, not evidence of a selectable roster.
- Dated documents and reports that mention Party Creation, default/custom parties, or four/six-member campaign rosters are historical unless they explicitly say they describe the current contract.
- Do not resurrect deleted `src/engine/party-ui.ts` or `src/game/preset-parties.ts`.
