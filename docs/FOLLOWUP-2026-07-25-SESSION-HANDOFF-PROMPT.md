# Session handoff — OnyxLabyrinth (2026-07-25)

Pass this prompt to another LLM with repo access. Prefer reading the linked docs over
re-deriving from chat history.

---

## Who you are and what this is

You are continuing work on **OnyxLabyrinth**, a Wizardry-style first-person dungeon crawler
(TypeScript + Vite, no UI framework). Canvas corridor view; DOM for menus/combat/town/camp.
Deploy: GitHub Actions on push to `main`. **Read `AGENTS.md` before changing `src/`.** For
playtest / balance / combat-UX / perk priorities, also read [`docs/AGENT-READING-LIST.md`](AGENT-READING-LIST.md).

## What shipped recently (do not redo)

### LLM Playwright debug surface (PR-1 → PR-4 shipped; PR-5 not built)

Plan: [`docs/superpowers/specs/2026-07-25-llm-playwright-debug-surface-plan.md`](superpowers/specs/2026-07-25-llm-playwright-debug-surface-plan.md).

| PR | What | Commit (approx) |
|----|------|-----------------|
| 1 | `snapshot()` / `render_game_to_text()`, `availableActions`, `route` | early in sequence |
| 2 | `isIdle()`, `readiness()` (incl. tri-state audio), `modeTransitionPending` | `ec9c870` |
| 3 | `jumpTo` / `dumpSave` / `loadSave`; migrate floor playtests off `warp` | `7492485` |
| 4 | Event ring buffer, audio spy, invariants/`warnings`, failure bundles, transcripts | `a20ac3c` |
| 5 | Seeded gameplay RNG + transcript replay | **not started** — top tooling gap |

Shared helpers: `scripts/playtests/lib.mjs`. Smoke: `scripts/playtests/smoke-debug-surface.mjs`.
Always prefer `snapshot().route` over bare `mode` (borrowed `"title"` overlays).

Notable fix mid-playtest: `isIdle()` false-idle window during camera tweens (`a2963a1`) —
`isRenderCameraSettledFor` folded into idle for dungeon mode.

### New Game prologue

SNES-style black-field narration (`src/engine/prologue-ui.ts`), FF36, typewriter,
`audio.uiTextTick()`, two-stage confirm, Esc skip, reduced-motion CSS. Specs/plans under
`docs/superpowers/` dated 2026-07-25 (prologue).

### Audio cues (placeholders)

Dungeon WAV placeholders (`chest-open`, `npc-steal`), feature result metadata (`looted`,
`trapType`), camp/NPC/town UI SFX hooks, procedural `levelUp()`. Pack under
`public/assets/sfx/` — licensing notes in dungeon README; combat FF6 samples still treated as
unverified placeholders.

### Century cycle + lore scrub (`a5bdd5e`)

- `GameState.worldYear` (default 3847); save **v12**; v11 migrates to 3847.
- Campaign wipe: `worldYear += 100`, return to **town** (not dungeon entrance).
- Arena wipe: no year advance; game-over copy omits century / wake-in-town (F2 fix).
- Headmaster/academy fiction retired. Internal enemy ids like `headmasters-echo*` kept for
  save/test stability.
- Canon: [`docs/superpowers/specs/2026-07-25-labyrinth-narrative-design.md`](superpowers/specs/2026-07-25-labyrinth-narrative-design.md).

### Boss rename + presentation stack (`7f89fcd`) — newest work

This pass replaced the boss names that `a5bdd5e` had *just* written. Do not restore them.

| Floor | Name (final) | Sprite (remapped, existing art) |
|---|---|---|
| 3 | **The Dead Boy** | `flame-golem`, top-anchored 0.29 |
| 4 | **The Lonely Girl** | `warlock`, top-anchored 0.33 |
| 5 | **The Crying Man** | `summon-holy-guardian` |

- Dead display vocabulary, all of it: *Vanguard's Echo, Choir's Echo, Drowned Echo, The First
  Descent, "the Echo", Headmaster*. `echo-of-silence` now displays as **"Stolen Quiet"**.
- Presentation: `setBossIntroNameplate` (`combat-scene.ts`, called from the `CombatController`
  ctor on `state.isBoss`) + procedural `audio.startBossCombat()` / `stopBossCombat()`
  (`CFG.bossBed`), wired in `main.ts`. Stop is unconditional on `endCombat`.
- **No new art or audio assets.** Sprites are manifest remaps at `BOSS_SIZE`; the boss bed is
  synthesized because no boss BGM exists.
- Gotcha: a lowpass `BiquadFilterNode` has no usable `Q`. `filter.Q.value = …` throws.
- NPC copy now gestures at the bosses obliquely — Vestra (F2) at the dead boy, Vesper (F4) at
  *she took my voice*, Ossian (F5) at *something is still crying*. Plaques: `HE IS STILL WARM.`,
  `SHE IS STILL WRITING.`, `THE CRYING NEVER STOPS.` The game deliberately never explains who
  they were; do not "fix" that with a journal or a reveal.

**Wish/ending scene is still not implemented** — floor-5 boss victory still falls through the
generic victory branch. This is now the single largest narrative gap; copy is drafted and
locked in narrative design §6.

### Playtest findings closed (`e40d52b` + `a5bdd5e`)

From [`docs/playtests/2026-07-25-invariants-pacing-playtest.md`](playtests/2026-07-25-invariants-pacing-playtest.md):

- **F1:** wipe path left stale `state.combat` → debug `jumpTo`/`loadSave` refused. Fixed:
  clear combat before `openGameOver()`.
- **F2:** Arena game-over showed campaign century copy. Fixed: `inArena` branch in
  `GameOverController`.

Re-verified same day: build clean, **1237** tests, smoke + stress-invariants + floors 1–3 +
floors 4–5 all **0 findings**.

### Encounter pacing measurements (directional; unseeded)

Same playtest doc + `scripts/playtests/encounter-pacing.mjs`. Cooldown 8 / pity force 28 held
across 190 gaps. Floor-1 safe/default/hot order correctly but contrast is near noise floor.

### Zone flavor = frequency only (static finding — do not re-experiment)

Campaign zones never set `tableFloorId`. Within a floor, safe/hot share `ENCOUNTER_TABLES[floor.id]`.
Only `rateMul` differs. Full write-up in the pacing report **Addendum**. Product question open:
should hot zones pull a harder table? **Do not** run per-zone TTK to rediscover identity.

Related pre-existing quirk: `rateMul: 0` still hits pity force at step 28 — comment on
`encounterRateAt` claims rolls never fire; code disagrees. Design call, Hard Rule 1.

### Playtest assertion hygiene

`playtest-floors-1-3.mjs` (may be uncommitted): step-on event assertions use recent
`__onyxDebug.log(n, "message")` text, because a random fight on the same step overwrites the
live message band with "You fled from combat." Event still fired first (`onMove` order).

## Project health (as of end of 2026-07-25)

`npm run build` clean. **1240 tests passing, 59 files.** All five campaign floors playable
start to finish. Prologue on New Game, century cycle on wipe, three distinct named bosses with
intro nameplates and music — **and no ending.** That is the shape of the gap: the game has
bookends on one side only.

## What is proposed next (pick with the human)

1. **The wish / ending scene — narrative design §6.** Now the top item. Copy is locked; the
   work is wiring floor-5 boss victory to an `EndingController` after the level-up / perk
   queue, never in Arena. Everything else in the narrative doc is already code.

2. **PR-5 — seeded RNG + transcript replay** — highest-value *tooling* gap for reproducible
   playtests. Spec lives in the debug-surface plan § PR-5. Worth noting every balance number
   in `docs/playtests/` is unseeded and therefore directional.

3. **Design decisions (human, not auto-implement):**
   - Hot zones: keep frequency-only vs set `tableFloorId` to harder tables.
   - Safe zones: suppress pity at `rateMul: 0` vs fix the comment.

4. **Done since this doc was first written:** the per-floor combat difficulty probe
   ([plan](superpowers/plans/2026-07-25-per-floor-combat-difficulty-probe.md),
   [report](playtests/2026-07-25-per-floor-combat-difficulty.md)) and the
   [F3 L6/L8/L9 matrix](playtests/2026-07-25-f3-level-matrix.md). Verdict: **no F3 retune.**
   Difficulty scales cleanly with level; the L8 40%-near-wipe scare did not reproduce.

5. Working tree may still be dirty with the per-floor difficulty script + report and the F3
   matrix doc (untracked). Commit if the human wants them kept.

## Hard rules (from AGENTS.md — non-negotiable)

1. Do not change game logic (movement, collision, combat math, encounter rates, map data)
   unless the user explicitly asks.
2. Do not remove fog / amber glow / vignette / CRT scanlines.
3. Do not change corridor perspective math unless asked.
4. Renderer/combat visual changes need visual verification.
5. Build must pass (`npm run build`); combat/save/party/renderer-math changes need `npm test`.
6. Do not commit unless asked; do not force-push; do not mutate history.

## How to run verification

```bash
npm install
npm run build
npm test
npx vite preview --port 5176 --base /OnyxLabyrinth/
ONYX_URL="http://127.0.0.1:5176/OnyxLabyrinth/?debug=1" node scripts/playtests/smoke-debug-surface.mjs
ONYX_URL="…" node scripts/playtests/stress-invariants.mjs
ONYX_URL="…" node scripts/playtests/playtest-floors-1-3.mjs
ONYX_URL="…" node scripts/playtests/playtest-floors-4-5.mjs
```

Debug entry: `?debug=1` → `window.__onyxDebug` (`snapshot`, `isIdle`, `readiness`, `jumpTo`,
`dumpSave`, `loadSave`, `log`, `sounds`, `exitDebugCombat`, encounter helpers).

## Anti-patterns for this codebase

- Scraping pixels / DOM text when `snapshot()` / `log()` already answer the question.
- Using `warp()` — use `jumpTo` (real `transitionToFloor`).
- Asserting step-on event messages only via the live message band after a combat flee.
- Treating `exitDebugCombat("fled")` as combat-difficulty data.
- Re-opening "events unused", "wipe → dungeon entrance", "Headmaster lore", "Arena has no perk
  overlay", "Temple has no Remove Curse" — all stale; see AGENT-READING-LIST.
- Reintroducing any retired boss name (Vanguard's/Choir's/Drowned Echo, The First Descent) or
  "Echo" as player-facing vocabulary. Internal ids are not lore.
- Explaining who the Dead Boy / Lonely Girl / Crying Man were. The withholding is the design.
- Hunting for boss sprite or boss BGM assets — there are none; both are remaps/synthesis.
- Committing `playtest-screenshots/` megabytes or `/tmp` working notes into `docs/playtests/`.
- Building a per-zone TTK study after the frequency-only addendum.

## Suggested first message to the human

Confirm which track they want: (A) the wish/ending scene (§6 — recommended; the game has no
ending), (B) PR-5 seeding, (C) a design decision on hot-zone tables / pity-vs-safe,
(D) something else. Do not start balance or map edits without an explicit ask.
