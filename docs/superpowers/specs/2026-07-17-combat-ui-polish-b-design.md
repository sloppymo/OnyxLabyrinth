# Combat UI polish (pass B) — design

**Date:** 2026-07-17  
**Status:** Implemented  
**Scope:** Items 1, 2, 5, 6, 7 from the FF6 combat-window review. Deferred: #3 (wound state on enemy roster), #4 (Round N badge relocation — Round is still the enemy-list header; it is only hidden while the column is a spell/tech detail card so descriptions fit).

## Goals

- Fix the most obvious polish bug (clipped spell/technique description).
- Remove duplicate SP/RG display in the command popup.
- Make the target cursor readable at Deck scale without changing combat logic.
- Align palette label and footer hint format with existing conventions.

## Non-goals

- Enemy HP / wound indicators on the roster (needs its own design: always vs Analyze-gated, per-enemy vs per-type, tag line vs separate).
- Moving "Round N" out of the enemy-column header.
- Predicted action-cost line under the palette.
- Resizing the fixed FF6 footer band per spell.

## Changes

### 1 — Spell/technique description clipping

- CSS on `.ff6-spell-detail-desc`: 2-line `-webkit-line-clamp` + ellipsis; `max-height: calc(1.3em * 2)`; `flex: 0 0 auto` so the band cannot squeeze mid-glyph.
- In `buildSpellDetailBody` / `buildTechniqueDetailBody`, set the desc node's `title` to the full `description` so hover/focus reveals the rest.
- While the enemy column shows a spell/tech detail card, omit the `Round N` header (still shown on the enemy list). This frees band height so the clamped desc is fully visible — not a Round relocation (#4).
- Do **not** grow the footer band or truncate data strings.

### 2 — Redundant SP/RG under the palette

- Stop appending `ff6-resource-row` under palette and legacy menu modes.
- Keep `menuResourceLine` in the popup header (`▼ Name · SP/RG`).
- Leave `menuResourceLine` on the view model; predicted-cost use is future work.

### 5 — Target cursor visibility

- Contained to `drawMarkers` in `combat-scene.ts`.
- Keep existing bounce; replace hard on/off blink with an opacity pulse (~0.55–1.0) so the marker never fully disappears.
- Brighter fill + soft halo under the triangle; kill-cursor red path unchanged.
- No combat logic, perspective math, or FX removal.

### 6 — Palette "Skl" label

- `PALETTE_LABELS.skill`: `"Skl"` → `"Tech"` (matches `ACTION_LABELS.technique`).

### 7 — Footer hint format

- Selection footer: `joinHintParts(["A:confirm", "B:back", "↑↓"])` — same `Key:verb` tokens as palette/playback.
- Update any unit assertion that expected `"A confirm"`.

## Verification

- `npm run build` (zero TS errors).
- `npm test` (select-action-view / hint tests).
- Browser: target cursor over party and enemy during target select (combat checklist item 6).

## Out of scope (follow-ups)

| Item | Why deferred |
|------|----------------|
| #3 Wound on roster | Design decision, not polish |
| #4 Round N placement | Layout re-squint; batch with #3 |
