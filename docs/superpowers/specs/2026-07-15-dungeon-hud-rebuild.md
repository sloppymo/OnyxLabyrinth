# Dungeon HUD rebuild (tranche B)

**Date:** 2026-07-15  
**Status:** Approved for build  
**Depends on:** [`2026-07-15-combat-roster-tokens.md`](./2026-07-15-combat-roster-tokens.md), [`2026-07-15-letterbox-scale-spike.md`](./2026-07-15-letterbox-scale-spike.md) (Option 1 provisional)

## Goals

Rebuild dungeon chrome around the corridor viewport under Deck letterbox / 1× density:

- Corridor owns the playfield (no sibling legend / 2×3 party band stealing column height).
- Party overlay derives from the **party-resource-row** token (HP bar language from A).
- Permanent WASD legend dies; contextual glyph prompts + Start action ring for discoverability.
- Message strip floats; clear-on-input; never reflows the viewport.

## Layout

`#game-wrap` → `#viewport-wrap` only for dungeon scene chrome (party/hint no longer peers).

Inside `#viewport-wrap` (z ascending):

| Layer | Position | Notes |
|-------|----------|--------|
| Canvas / map / flash | full | Unchanged render math |
| `#message` band | absolute top | Hide when empty; **no layout reflow** |
| Floor·facing chrome | top-right of same band (or alone with small backing when message empty) | `B1 · N` |
| Contextual prompt | above party | State, every frame |
| Party overlay | absolute bottom | Six cells, ~48–52px tall |

**Viewport border:** migrate dungeon frame toward FF6 blue (design-language unify); combat/menus already blue.

## Party cells (finding 1)

Horizontal math at 768 / 6 ≈ 124px/cell forces **two-line cells**, not one line:

```
Aria
████████  30/30
```

- Line 1: name (ellipsis); **no SP/RG** on the strip (v1).
- Line 2: **48px** HP bar (A fill clamp + color stops) + `cur/max` (7ch ceiling).
- Overlay height ≈ **50px** + padding; verify occlusion of depth-0 floor cues (water) in playtest.

**Status (finding 2):** 3–4px color underline / notch on the cell using combat status colors (PSN/PAR/SLP/BLD/wet). Full-HP + paralyzed must not look “safe.”

**SP carve-out:** Grimoire / camp / utility cast menus remain the SP decision surface. Confirm cast menu still shows SP costs. Cell geometry stays two-line capable for a later RES line; no tap/hold expand in v1.

## Message strip (events)

- Absolute over ceiling/fog; ~85% blue window backing; never full-opaque.
- **Clear on next player action** (step, turn, open menu) — **not** a timer.
- ≤2 lines; longer → truncate with `…` (full text via grimoire when wired).
- **Strip = information.** Trap / NPC / choices stay **modal** (`pendingTrap` / panels). Do not put Y/N in the strip.
- While `pendingTrap`, trap copy may occupy `#message`; clear-on-input does **not** dismiss an active trap prompt (input is gated).

## Contextual prompts (state) — finding 3

| | Messages | Prompts |
|--|----------|---------|
| Kind | Events | World state ahead / at feet |
| Lifecycle | Queue/show; clear on player input | Recompute every frame; never clear-on-input |
| Example | “You hear scuttling…” | `A Unlock` while facing locked door |

Arbitration: both can show together (message top, prompt bottom). No priority queue.

Finding 4:

- **One glyph = one meaning** (`▶` = menu selection only — never acting; acting remains combat plate).
- Prompt labels are **input-adaptive** from last-used device (`keyboard` vs `gamepad`): e.g. pad `A Unlock` / keyboard `U Unlock`.
- Prompt shows **at most one contextual verb**. Map / Camp / menus live in the **action ring** (menu of record).

**Keyboard discoverability (verified 2026-07-15):**

| Input | Opens | Lists Camp/Map/Town? |
|-------|-------|----------------------|
| Esc | Save/Load only (`save-ui.ts` / `openSaveMenu`) | **No** |
| G (keyboard) | Grimoire (`spell-ui.ts`) | No |
| Start (pad) | Action ring (`dungeon-action-ring-ui.ts`) | **Yes** |
| Direct C/M/T/U | Still bound in `input.ts` | Hotkeys exist but were undocumentable after legend kill |

**Gap closed:** Tab opens the action ring (keyboard door matching pad Start). First dungeon entry per session appends line 2 to the entry message: `Tab: Actions · Esc: Save` (event strip; not a legend resurrection).

**Grimoire as message transcript:** **UNVERIFIED / not shipped.** Spec claimed truncated strip text routes into the grimoire; `spell-ui.ts` is cast-only — no transcript. Do not cite as done until implemented.

## Corner chrome (finding 5)

Floor id + facing (`F1 · N`) lives **top-right inside the message band** when the strip is visible (message text left, chrome right, same backing). When the strip is empty/hidden, chrome shows alone with a small matching backing — no dodge vs overlays.

## Non-goals

Combat window changes, town/title identity, buffer widen, renderer perspective/fog/glow removal.

## Playtest gate (before “done”)

1. Party overlay occlusion vs depth-0 water/floor cues.  
2. AGENTS renderer checklist: corridor, side passage, front wall depth 0, textures after combat→dungeon.  
3. Trap modal still exclusive; message clear-on-step for info lines.  
4. Prompt adapts when switching keyboard ↔ pad mid-session.

## Implementation hooks

- `shell.ts` — DOM, `setMessage`, `renderPartyStrip`, `showMode`, new prompt/chrome APIs.  
- `controller-input.ts` — expose `lastInputKind`.  
- `main.ts` — clear message on dungeon actions; refresh prompt each frame / on move.  
- `styles.css` — overlay + band; remove `#hint` pills from dungeon.  
- Optional pure helper for prompt resolution (unit-tested).
