# OnyxLabyrinth — PR-1 Implementation Handoff: Snapshot Core

> **Current roster note (2026-08-27):** This handoff is historical. Its
> debug-flow examples mention the retired party-creation/roster-selection
> surface; current browser scripts start with the fixed Old Man + Rat King duo.
> See [`docs/CURRENT-PRODUCT-CONTRACT.md`](../../CURRENT-PRODUCT-CONTRACT.md).

Copy everything below the line into the implementation agent's session (or open this file
directly — it's checked into the repo). You have full repo access. **Implement only what §A
below scopes.** The rest of this doc is context, not a to-do list for this pass.

---

## What this is

OnyxLabyrinth is a Wizardry-style first-person dungeon crawler (TypeScript + Vite, vanilla DOM +
Canvas). It already has a gated debug surface (`?debug=1` → `window.__onyxDebug` in
`src/main.ts`) that LLM-driven Playwright playtest scripts under `scripts/playtests/` use to
script the game. Those scripts currently hand-roll their own state-dumping (`snap()`), which is
duplicated across files and misses information an agent needs (which of four overlays that all
borrow game mode `"title"` is actually open, legal actions, structured combat state).

This is **PR-1 of a five-PR sequence** approved after a two-pass review. The full plan — audit
findings, proposal triage, and designs for PR-2 through PR-5 — lives at
[`docs/superpowers/specs/2026-07-25-llm-playwright-debug-surface-plan.md`](../specs/2026-07-25-llm-playwright-debug-surface-plan.md).
Read §5 of that file for the authoritative design; this handoff is a condensed, actionable
restatement of exactly that section plus the guardrails from §2.8/§8 that apply to it. If
anything here conflicts with §5 of the plan, the plan wins — this doc is a summary, not a
replacement.

**Read `AGENTS.md` before touching `src/`.** It has the file map, hard rules, and pitfalls
(especially "Borrowed `title` mode" and the trap-prompt modality section — both matter here).

## Why this PR, and where it sits in the sequence

1. **PR-1 (this one) — Snapshot core.** One `snapshot()` call replaces every hand-rolled `snap()`.
2. PR-2 — Quiescence (`isIdle()`/`readiness()`). *Not this PR.*
3. PR-3 — `jumpTo`/save injection, replaces the buggy `warp()` helper. *Not this PR.*
4. PR-4 — Event buffer, audio spy, error capture, invariants, failure bundles. *Not this PR.*
5. PR-5 — Seeded gameplay RNG + transcript replay. *Not this PR.*

Do not build isIdle, jumpTo, seeding, the event buffer, or the audio spy in this pass, even if
they look like small additions while you're in the neighborhood. They're scoped to later PRs on
purpose (see the plan's §4 for why the order is what it is) and pulling them forward here makes
the PR harder to review and re-litigates decisions already made.

---

## §A — Scope for this PR (do exactly this)

**Goal:** one call replaces every hand-rolled `snap()`; agents get mode+overlay, position, party,
combat, message, and legal actions as JSON without screenshot guessing.

### New files

- **`src/debug/snapshot.ts`** — pure module, no DOM imports, no engine imports:
  - `buildSnapshot(input): Snapshot`
  - `asciiMap(floor, player, explored, radius?)`
  - `availableActionsFor(route, state, combatView)`
  - Inputs to all of these are plain data (`GameState` + a `route` string + an optional combat
    view + message text) specifically so Vitest can cover them exhaustively without touching the
    DOM or `main.ts`.
- **`scripts/playtests/lib.mjs`** — shared Playwright helper library:
  - `launch()`, `boot(page)`, `snap(page)` (thin wrapper calling the page's `snapshot()`),
    `press(page, key, n)`, `shot(page, name)`, a findings collector, and
    console/pageerror/`requestfailed` capture.
  - Extract this from the existing `scripts/playtests/playtest-floors-1-3.mjs`, which already has
    working (if duplicated) versions of most of these — don't reinvent, extract and generalize.
  - Keep it dependency-free (no new npm packages).

### Modified files

- **`src/engine/combat-ui.ts`** — add a read-only `debugView()` method to `CombatController`:
  ```ts
  { phase, actingCharId, roundEnding, selection: { title, entries, index } | null, playbackDone }
  ```
  No behavior change — this reads existing private fields (`this.phase`, `this.currentActorId` /
  whatever the acting-actor field is actually called, `this.roundEnding`, the selection state,
  and `isPlaybackDone(...)`) and returns copies, not references.
- **`src/main.ts`**:
  - Extract a `currentRouteFlags()` helper that builds the same flags object
    `routeControllerEvent` already assembles at lines ~971–988 (`hasPerkSelect`, `hasCombat`,
    `hasSave`, `hasSpellMenu`, `hasNpc`, `hasActionRing`, `hasTown`, `hasCamp`, `hasGameOver`,
    `hasPartyCreation`, `hasPrologue`, `hasTitle`, `hasPendingTrap`, `hasTrapPrompt`, plus `mode`).
    Both `routeControllerEvent` and the new debug snapshot call `resolveControllerRoute()` with
    this **same** flags object — do not let the two builders drift, or the debug surface will lie
    about which overlay is actually open.
  - Inside the existing `if (new URLSearchParams(...).has("debug"))` block (bottom of the file,
    where `__onyxDebug` is already assigned), add a `snapshot(opts?)` method assembling:
    - `route` (from `resolveControllerRoute(currentRouteFlags())`) — **never** report the bare
      `state.mode` as if it were the active overlay; four overlays (save, grimoire, NPC panel,
      perk-select) plus the action ring and prologue all borrow mode `"title"`. Route is the
      thing that actually tells them apart. See AGENTS.md's "Borrowed `title` mode" pitfall.
    - selected `state` fields: floor id/name/theme, player x/y/facing, tile under the player,
      `inDarkness`/`inAntimagic`/`pendingTrap`, party (id/name/class/level/hp/maxHp/sp/maxSp/
      status/perkIds), `activeCharIds`, gold, keys, inventory, persistent buffs. Convert `Set`
      fields to arrays. **Do not** include the floor grid unless `opts?.map` is set (it's large;
      most callers don't need it — see the ASCII map option below instead).
    - `mapVisible`, `inArena` (the local vars already tracked in `main.ts`)
    - message text/visibility — export a small `getMessageText(): { text, visible }` from
      `src/engine/shell.ts` (reads `messageEl.textContent` + the existing CSS-visibility check
      that `syncMessageBandVisibility` already does) so the debug layer doesn't re-derive
      visibility logic that already exists there.
    - `combatController?.debugView()` when combat is active, else `null`; when present, also
      include the tail of `state.combat.log` / `state.combat.events` (last ~10) and, per enemy,
      **exact HP/maxHp** (not the player-facing descriptor — this is debug-only, decided in the
      plan's §7 item 2).
    - `availableActions` — the list of legal input verbs for the current route (e.g. in dungeon:
      `forward`/`backward`/`turnLeft`/`turnRight`/`camp`/`map`/`grimoire`/`town`/`unlock`/`save`;
      in a trap prompt: `inspect`/`disarm`/`open`/`leave`; in combat during the player's turn: the
      palette verbs; etc.). Derive this from the route + relevant state flags via
      `availableActionsFor` in the new pure module — don't hand-roll it a second time in
      `main.ts`.
    - `opts?.map` → `asciiMap(state.floor, state.player, state.explored, opts.mapRadius)`.
  - Also add, in the same gated block: `(window as any).render_game_to_text = () =>
    JSON.stringify(snapshot());` — an alias for cross-tool interoperability with the industry
    convention some agent harnesses expect.
- **`src/engine/shell.ts`** — export `getMessageText(): { text: string; visible: boolean }` (a
  ~3-line function reading the existing DOM state; no new logic, just exposing what
  `syncMessageBandVisibility` already computes).
- **Migrate `scripts/playtests/playtest-floors-1-3.mjs`** to import from the new
  `scripts/playtests/lib.mjs` and call `snapshot()` instead of its private `snap()`. Delete the
  private `snap()` from that file once migrated. **Leave every other script in
  `scripts/playtests/` untouched** — they keep working against raw `state` for now; migrating
  them is out of scope here (floors-4-5 gets migrated in PR-3, alongside its `warp()` removal,
  not in this PR).

### Snapshot shape (reference — adjust field names to match what you actually build, but keep this shape)

```jsonc
{
  "schema": 1,
  "mode": "dungeon", "route": "dungeon",          // route = resolveControllerRoute() enum value
  "floor": { "id": 1, "name": "The Flooded Crypt", "theme": "f1" },
  "pos": { "x": 5, "y": 9, "facing": 0, "compass": "N" }, "tile": "treasure",
  "flags": { "inDarkness": false, "inAntimagic": false, "mapVisible": false,
             "inArena": false, "pendingTrap": null },
  "party": [{ "id": "c1", "name": "Aria", "class": "Fighter", "level": 3,
              "hp": 24, "maxHp": 30, "sp": 0, "maxSp": 0, "status": [], "perkIds": [] }],
  "activeCharIds": ["c1","c2","c3","c4"],
  "gold": 100, "keys": [], "inventory": [{ "itemId": "healing-potion", "identified": true }],
  "buffs": [], "message": { "text": "...", "visible": true },
  "combat": null,   // or { phase, actingCharId, selection, enemies:[{id,name,hp,maxHp,row,status}], recentEvents, result }
  "availableActions": ["forward","backward","turnLeft","turnRight","camp","map","grimoire","town","unlock","save"],
  "map": null       // opt-in: ASCII lines, only when opts.map is set
}
```

### Tests (required — don't skip)

- **Vitest** — `src/debug/snapshot.test.ts`:
  - Snapshot built from `createGameState(...)` plus a small carved test floor matches the shape
    above and contains no `Set` objects (all converted to arrays).
  - `availableActionsFor` returns the right verb list per route, including the trap-modal route
    and each of the borrowed-`"title"` overlay routes (save/spell/npc/perk/action_ring/prologue).
  - `asciiMap` renders walls/doors/features/player-facing correctly against a known small grid
    (construct one by hand, don't rely on a real floor file).
  - None of the pure functions mutate their input `GameState`.
- **Playwright smoke** — new `scripts/playtests/smoke-debug-surface.mjs`:
  - Boot the game (title → New Game → default party → town → dungeon), taking a snapshot at each
    stop plus one at a trap-prompt tile, one during combat (start combat via the existing
    `__onyxDebug.startCombat`), and one with the save menu open.
  - Assert `route` and `availableActions` are correct at each stop.
  - Run against `vite preview` per AGENTS.md's verification convention (`npx vite preview --port
    5176 --base /OnyxLabyrinth/` or similar — check AGENTS.md for the exact invocation used
    elsewhere in this repo's scripts).
- Confirm the migrated `playtest-floors-1-3.mjs` still reproduces its previous findings (or finds
  more, now that it has real overlay/route data instead of guessing from `body.innerText`).

### Risks / pitfalls (from the plan and from AGENTS.md — don't relearn these the hard way)

- **Borrowed `"title"` mode:** never report bare `mode` as the active overlay — always report
  `route`. The shared `currentRouteFlags()` helper is what prevents `routeControllerEvent` (the
  real input router) and the debug snapshot from disagreeing about what's open.
- **`noUnusedLocals`/`noUnusedParameters` are enforced** (`tsc` via `npm run build`) — wire
  everything you add or the build gate fails. There is no separate lint step; the build **is**
  the gate.
- Snapshot must be **read-only** — don't `structuredClone` the whole `GameState` (the floor grid
  is large); select fields explicitly instead.
- `debugView()` must not leak mutable internal references — return copies of arrays/objects.
- **Do not touch input gates, `justOpened*` flags, or `shell.showMode`.** This PR is purely
  additive observability; it must not change how any real input is handled. If you find yourself
  editing `routeControllerEvent`'s actual routing logic (as opposed to extracting the flags it
  already builds into a shared helper), you've gone out of scope.
- All new debug surface stays inside the existing `?debug=1` gate. Never expose `window.__*` or
  `window.render_game_to_text` outside it.

### Definition of done

- `npm run build` passes with zero TypeScript errors.
- `npm test` passes, including the new `snapshot.test.ts`.
- `scripts/playtests/smoke-debug-surface.mjs` passes against a local `vite preview` build.
- `playtest-floors-1-3.mjs` is migrated onto `scripts/playtests/lib.mjs`; its private `snap()` is
  deleted.
- `AGENTS.md`'s "Debug/testing aids" section is updated to document `snapshot()` /
  `render_game_to_text()` and the new `scripts/playtests/lib.mjs` (this is a **required** part of
  the PR per the plan's decision #6 — the debug surface is only safe from AGENTS.md's "no
  `window.__` in commits" rule if it's documented as sanctioned).

### Explicitly out of scope for this PR

`isIdle()`, `readiness()`, `jumpTo`, save injection (`dumpSave`/`loadSave`), seeded RNG, the event
ring buffer, the audio cue spy, error/asset-failure capture, invariant checking, and any migration
of `playtest-floors-4-5.mjs` or the other dated scripts. All of these are real, planned, and
designed in the full plan doc (§6, PRs 2–5) — just not here. If something in this PR would clearly
benefit from one of them (e.g. "the smoke test would be less flaky with `isIdle()`"), use a fixed
`waitForTimeout` for now, same as the existing scripts do, and leave a one-line comment noting
PR-2 will replace it. Don't build the dependency early.

---

If anything above is ambiguous, re-read §5 of the full plan
(`docs/superpowers/specs/2026-07-25-llm-playwright-debug-surface-plan.md`) before improvising —
it has more surrounding context (§2.1–§2.5 explain *why* each piece is shaped the way it is) than
this condensed handoff does.
