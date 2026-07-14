# Prompt: Close Late-Game Combat UX & Perk Delivery

You are a senior game/systems engineer on **OnyxLabyrinth** (`/home/sloppymo/OnyxLabyrinth`).

## Context (from design analysis, 2026-07-13)
- Three-floor Wizardry crawler; FF6 combat is the depth center.
- Content is ahead of **closure**: L9+ spell/tech menus overflow; perk picks may have been missed in playtests; many perk effects are `TODO(v1.1)` stubs (~28 in `data/perks.ts`).
- Goal is **not** new content or engine rewrites. Goal: mid/late combat choices stay as crisp as L1, and advertised class fantasy is delivered **or** honestly stubbed.

## Read first (in this order)
1. [`docs/AGENT-READING-LIST.md`](docs/AGENT-READING-LIST.md) — which docs are current vs stale
2. [`PLAYTEST-DESIGN-REVIEW.md`](PLAYTEST-DESIGN-REVIEW.md) — **Status notes** section first, then P1 findings
3. [`AGENTS.md`](AGENTS.md) — hard rules + borrowed `"title"` mode for perk select
4. [`ARENA-REVIEW.md`](ARENA-REVIEW.md) — only if you touch arena layout (do **not** unify cameras unless asked)
5. Code: `combat-select-action-view.ts`, `combat-ui.ts`, `main.ts` (`endCombat`), `perk-select-ui.ts`, `game/perks.ts`, `data/perks.ts`

## Do this in order

### Phase A — Readable late combat menus (must ship)
1. Spell list at L9+: ~7–8 visible rows, scroll within the window, **description panel always visible**.
2. Technique list: no truncated names like `"Throat…"` — widen, wrap, or show full name in the description panel.
3. Keep footer shortcuts accurate if you touch that area (optional: bind `t` → technique; footer still says `A/M/D/I/R` as of 2026-07-13).
4. Add/adjust unit tests for menu rendering/scroll if coverage exists.

### Phase B — Perk delivery reliability (must prove)
1. Trace `endCombat` → level-up → `PendingPerkChoice` queue → `PerkSelectController` for **dungeon and Arena** (Arena path already exists — prove it in play).
2. Guard against auto-dismiss via leftover key spam / borrowed `"title"` (playtest Method Notes used Enter every 700ms).
3. After a scripted Arena victory that crosses level 3/6/9/12, the overlay **must** appear and require explicit confirmation.

### Phase C — Honesty pass on perk power (bounded)
1. Table: perk id → wired / partial / inert (`TODO(v1.1)` vs `perkModifiers` vs `dispatchHook`).
2. Fix **only** cases where both tier options are inert, **or** mark inert options in UI copy — do not rebalance all 56 %.
3. Do **not** invent new perks.

## Constraints
- No game-logic number nerfs/buffs unless required to wire a broken hook.
- No new npm deps, no WebGL, no corridor perspective math changes.
- Follow AGENTS.md (shell modes, trap modality, inventory shapes, etc.).
- `npm run build` and `npm test` must pass.

## Verification (required)
1. Arena: cross a perk tier → screenshot overlay (no Enter spam).
2. Arena L9 mage: Magic menu → scroll + description panel visible.
3. Arena L9 thief/fighter: Tech → full names readable.
4. Dungeon victory return still shows corridor textures.
5. Summarize files changed, what was broken, remaining `TODO(v1.1)`.

## Out of scope
- Spell T6–T7 content, encounter-rate retunes, flee/poison balance, arena camera unification (W1), engine swaps, `POLISH-ISSUES-PROMPT.md` footer/map (unless you are already in those files).
