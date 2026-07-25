# LLM Playwright Debug Surface — Review & Implementation Plan

**Date:** 2026-07-25 · **Status:** Proposed (awaiting approval of PR-1)
**Scope:** Debug-only observability/setup seams for Playwright-driven LLM playtesting. No gameplay changes.
**Revision note (2026-07-25, post-review):** corrected an audio-loading claim in §2.4/§2.6/triage
#10/#12 (audio is *not* fully procedural — three WAV sample families load via `fetch` and can
silently fail); swapped the PR-4/PR-5 order (evidence before seeding); folded six open-question
answers into the plan as decisions. See §9 for the full changelog.

---

## 1. Executive verdict

The proposal inventory is directionally right and most of it is cheaper than assumed, because the
engine already has half the machinery: `serialize`/`deserialize` exist for save injection,
`isRenderCameraAnimating()` / `CombatController.getPhase()` / `isPlaybackDone()` /
`skipPlaybackToEnd()` exist for quiescence, `resolveControllerRoute()` already computes the exact
"which overlay is live" enum a snapshot needs, and combat already emits structured `CombatEvent`s.
The single biggest defect found is not missing APIs but **duplication and bypass in
`scripts/playtests/`**: every script hand-rolls `snap()`/`warp()`/`press()`, and `warp()` clones
floors by JSON, silently skipping `transitionToFloor`'s bookkeeping (killed NPCs, unlocked doors,
looted chests, explored-by-floor, `deepestFloorReached`) and never resetting the render camera.
Two premises in the brief needed correction. First, the brief assumed audio is fully procedural
with no WAVs to fail — wrong: `audio.ts` fetches three real WAV sample families and a missing
sample fails completely silently today (§2.6), which is exactly the kind of gap this surface
should catch, not skip. Second, the injectable-`rng` coverage is thinner than the brief stated —
the live game passes **no** rng anywhere (combat-ui, features, npc-ui all use defaults),
`rollEncounter` has no rng parameter at all, and even the Default Party's stats are `Math.random`
3d6 rolls. Recommendation: five small PRs — snapshot + shared script lib first, then isIdle, then
jumpTo/save-injection (promoted above seeding because `warp()` is actively producing false
playtest findings), then evidence (event buffer, audio spy, error/asset-failure capture, failure
bundles — useful immediately, independent of seeding), then seeded gameplay RNG at the wiring
layer paired with transcript replay (only meaningful once a run can be pinned to a seed). Skip
Playwright Test, `page.clock`, and any DOM mirror for now.

---

## 2. Audit findings

### 2.1 Current `__onyxDebug` surface (`src/main.ts:1767–1831`)

Gated on `?debug=1`. Exposes: live `state`, `startCombat`, `exitDebugCombat(result)`,
`FLOORS`/`findFloor`/`registerFloorMap`, `createGameState`, `createCombatFromEncounter`,
`resolveEncounter`, `rollEncounter`, `SPELLS_BY_ID`, `ITEMS_BY_ID`, `defaultLoadoutForCharacter`,
`getCombatController()`, `renderBattleArena`, `renderCorridorBackdrop`, `groundPlaneProbe()`.
The `state` const is never reassigned (`Object.assign` on load/continue), so the live reference
stays valid across saves/loads — good for a long-lived debug handle.

### 2.2 How playtest scripts use it

Eight scripts, ~4,000 lines total. `playtest-floors-1-3.mjs` and `playtest-floors-4-5.mjs` each
carry near-identical private copies of `snap()` (hand-built state dump + `#message` visibility +
`body.innerText`), `warp()`, `press()` (fixed 90 ms/keystroke), `wait()` (fixed 150–500 ms
sleeps), `bootToDungeon()`, `withThiefDisabled()`, `grantKey()`, `classifyUnlock()`. They already
capture `pageerror` + console errors and write `report.json` + screenshots — the failure-bundle
concept exists piecemeal.

**Active defect:** `warp()` does `state.floor = JSON.parse(JSON.stringify(findFloor(id)))`. This
bypasses `transitionToFloor` (`src/game/features.ts`), which is where `applyUnlockedDoors`,
`applyLootedTreasures`, `applyTriggeredEvents`, `applyKilledNPCs`, `exploredByFloor` save/restore,
`deepestFloorReached`, and the encounter-cooldown reset happen — and never calls
`resetRenderCamera`, so the camera tweens across the map from the previous position (papered over
with `wait(200)`). Killed NPCs resurrect after a warp; door/loot state desyncs. A real `jumpTo`
removes a whole class of false playtest findings.

### 2.3 Gameplay RNG call sites

| Site | Injectable? | Live caller passes rng? |
|---|---|---|
| `game/combat.ts` per-turn API — `beginRound`/`resolvePlayerTurn`/`resolveEnemyTurn`/`resolveAllyTurn`/`endRound` (lines 202–560) | yes, `rng: Rng = Math.random` | **No** — `combat-ui.ts` passes none anywhere |
| `game/features.ts` — `handleTileFeature`(:51), `disarmChest`(:692), `openChest`(:753) | yes | **No** — `main.ts` calls all three with defaults |
| `game/npc.ts` — `stealFrom`(:153) | yes | **No** — `npc-ui.ts` passes none |
| `main.ts:370` — encounter trigger roll (`Math.random() >= chance`) | **no seam** | — |
| `data/enemies.ts:1547` — `rollEncounter` weighted table | **no rng param at all** | — |
| `game/party.ts:184` — `rollD6` → `roll3d6` → `rollStatsForRace` → `createCharacter` | **no seam** | Default Party (Aria…Fenn) stats are stochastic too |

Cosmetic RNG is correctly separate and must stay untouched: `combat-scene.ts` particles/shake and
**formation jitter** (lines 789/832/934 — this jitter is the real screenshot instability, note for
Tier-D), `audio.ts` pitch/gain jitter, `vfx-vignette.ts` (a standalone demo page, not the game).

Conclusion: "seeded RNG" = a wiring-layer seam (main.ts / combat-ui / npc-ui pass an injected
`rng` that defaults to `Math.random`), plus **additive** optional `rng` params on `rollEncounter`,
the party roll chain, and `createGameState`. Never override global `Math.random`. Even with a
seed, whole-run determinism is limited (every dungeon step consumes an encounter roll, so any
path divergence shifts the stream) — the useful unit of reproduction is **seed + jumpTo + action
transcript**, which after the PR-4/PR-5 reordering (§4, §9) is delivered by **PR-3 (jumpTo) +
PR-5 (seed + replay)**, with PR-4 contributing the transcript-recording half in between.

### 2.4 Quiescence / non-idle sources

- **Render camera tween:** `isRenderCameraAnimating()` exported from `renderer.ts:289`; already
  gates dungeon input. Just needs exposing.
- **Mode fade:** `transitionToMode` (`main.ts:141`) is a 150 ms `setTimeout` + CSS opacity fade,
  **untracked** — the one genuinely new flag `isIdle()` requires. During the window, `state.mode`
  is still the old mode.
- **Combat:** `CombatController.getPhase()` exists (`"playback"` vs. menu phases vs. `"result"`);
  `isPlaybackDone(scene, now)` exists (`combat-scene.ts:2286`). Cosmetic skip already ships:
  Escape during playback → `skipPlaybackToEnd`, hold-Shift / sticky FAST = `clockMul` ×2. No new
  time-scale machinery needed for combat.
- **Prologue:** `PrologueController` has an injectable clock and a `Phase` field; it auto-plays,
  so "prologue present" simply means not idle. Scripts skip it with keys — or avoid it entirely
  via `jumpTo` (prologue is New-Game-path-only).
- **One-event key swallows:** `suppressNextCombatKey`, `justOpenedSaveMenu/SpellMenu/NPCPanel/
  Prologue/Arena`, `justOpenedTrapPrompt`. These are deliberate; scripts must press-then-verify
  rather than assume one press = one action. Document in the lib; don't "fix".
- **Boot readiness:** render loop waits on `document.fonts.load` + `loadTextures()`; sprite
  caches prewarm fire-and-forget with `.catch(() => {})` (`main.ts:1760–1763`). **Audio sample
  loads belong in the same readiness bucket** — see §2.6 correction below; `loadUiSounds()` /
  `loadCombatSounds()` / `loadDungeonSounds()` are the same "fire-and-forget, per-item try/catch"
  shape and are kicked off from `audio.resume()` (`main.ts`'s one-shot `resumeAudioOnce` keydown
  listener), not at boot — so readiness must track them as a *lazily started* promise family, not
  one that's always in flight from page load.
- Minor, non-blocking: `flashEncounter` 900 ms overlay, footstep timer, FF6Window open animation.

### 2.5 Mode/overlay state for snapshots

`GameMode` is 8 values, but four overlays **borrow `"title"`** (save, spell/grimoire, NPC, perk
select) plus the action ring and prologue — distinguishable only by which controller local var in
`main.ts` is non-null. `resolveControllerRoute()` (`engine/controller-route.ts`) already maps
those flags to a route enum (`perk|combat|save|spell|npc|action_ring|town|camp|game_over|
party_creation|prologue|title|arena|trap|dungeon`), and `main.ts:971–988` already assembles the
flags. Snapshot should reuse exactly this (extract the flag-builder so the two consumers can't
drift). Also needed: `mapVisible`, `inArena`, `pendingTrap`, `state.combat` presence.

### 2.6 Silent failure points

- Texture cache: failed image → `null` slot → gradient fallback (AGENTS.md pitfall).
- Sprite caches: `img.onerror → resolve(null)` (`enemy-sprite-cache.ts:29`) → procedural
  fallback. *Expected* for enemies without art; a failure only when a manifest-listed strip 404s.
- Prewarm promises swallowed in `main.ts`.
- **Correction (this is where the first pass of this audit was wrong):** audio is *not* fully
  procedural. `src/engine/audio.ts` loads three WAV sample families —
  `UI_SFX_FILES`/`COMBAT_SFX_FILES`/`DUNGEON_SFX_FILES` (`public/assets/sfx/{ui,combat,dungeon}/
  *.wav`, real files on disk, e.g. `dungeon/chest-open.wav`) — via `fetch` +
  `ctx.decodeAudioData`, one promise per sample, each wrapped in its own try/catch
  (`loadUiSounds`/`loadCombatSounds`/`loadDungeonSounds`, lines ~291–370). A 404 or decode error
  leaves that id's buffer slot `undefined` and is swallowed silently — no console error, no
  thrown rejection. The precise failure mode matters for the evidence PR's error capture (now
  **PR-4** — see the reordering in §4):
  `playDungeonSfx`/`playCombatSfx`/`playUi` (the private UI player) each check `if (!buf)` and,
  on a miss, **kick a reload and return — no sound plays, no procedural fallback fires for that
  cue.** So "audio cue fired" (logically, the game called `audio.playCombatSfx("criticalHit")`)
  and "audio cue produced sound" are two different facts, and only an audio-load-readiness probe
  can tell them apart; the ambient drone/footsteps/door-open/torch-jitter layer described in
  AGENTS.md's file map *is* still procedural and unaffected — this only applies to the
  sample-backed SFX layer added by the "PR-1 dungeon/UI SFX from FF6 gap audit" work.
  Load is lazy, not boot-time: the three `load*Sounds()` calls fire from `resume()`, which only
  runs on the first user keydown (`main.ts`'s one-shot `resumeAudioOnce` listener) — so a script
  that never presses a key before checking readiness will correctly see the sample families as
  "not started," not "failed."
- Playwright already sees network-level failures (`page.on("requestfailed")`, 404 responses) with
  zero game changes — script-side capture belongs in the shared lib, not the engine.

### 2.7 Playwright Test vs. script style

`playwright` (library) is already a devDependency; `@playwright/test` is not. These playtests are
exploratory, agent-driven, one-shot investigations — not a regression suite. A test runner adds
config, retry semantics, and a second way to run browsers for near-zero benefit today. **Verdict:
extend the script style with a shared `scripts/playtests/lib.mjs`; revisit `@playwright/test`
only if/when a stable smoke suite becomes a CI want.** Traces-on-retry (item 20) falls away with
it.

### 2.8 Other constraints noted

- Working tree currently has ~15 modified files in flight (save v12 `worldYear` migration,
  floor-4/5, game-over/town changes). The plan's PRs must rebase on that; save-fixture files are
  brittle across `SAVE_VERSION` bumps — prefer `jumpTo` over fixtures for most setups.
- `tsc` enforces `noUnusedLocals`/`noUnusedParameters` — debug seams must be wired or they fail
  the build.
- AGENTS.md git rule 5 ("no `window.__` exposures in commits") coexists with the sanctioned,
  gated `__onyxDebug` ("strip nothing here"). All new surface stays inside the `?debug=1` gate;
  AGENTS.md gets a short section documenting the expanded surface so future agents don't strip it.

---

## 3. Proposal triage

| # | Proposal | Verdict | Notes |
|---|---|---|---|
| 1 | `snapshot()` / `render_game_to_text()` | **Keep** | Overlay via `resolveControllerRoute` flags; combat detail via a new `CombatController.debugView()`; recent combat events read straight from `state.combat.events` (already structured — no instrumentation needed). Alias is one line, gated. |
| 2 | `isIdle()` + readiness | **Keep, modified** | Only new machinery is a `modeTransitionPending` flag around `transitionToMode`. Everything else composes existing probes. Readiness = fonts/textures/sprite-prewarm booleans + failed-asset names, **plus the three audio sample-load families** (ui/combat/dungeon), tracked as "not started / loading / done" since they only begin on the first keydown (§2.6). |
| 3 | Seeded gameplay RNG | **Keep, modified** | Seam at the wiring layer (main.ts / combat-ui / npc-ui pass injected rng); additive optional `rng` params on `rollEncounter`, party roll chain, `createGameState`. No global `Math.random` override; cosmetics untouched; document stream-divergence limits. |
| 4 | ASCII map | **Keep** | Pure function over edge-grid + player + explored; unit-tested in Vitest; local window by default, full floor opt-in. |
| 5 | `jumpTo` / scenarios | **Keep, promoted to PR-3** | Must route through real `transitionToFloor` + `resetRenderCamera` + `markExplored`. Party leveling mirrors Arena's `startArena` loop (`levelUpChar`, not XP simulation). `?scenario=` query param deferred — method call after boot is enough (title → jumpTo skips prologue/party-creation entirely). |
| 6 | Time scale / skip flags | **Mostly reject** | Combat already has FAST ×2 (`clockMul`) and Escape-skip (`skipPlaybackToEnd`) — document, don't rebuild. `?skipPrologue` redundant once `jumpTo` exists. Global time scale rejected (rAF/AudioContext coupling, low payoff vs. isIdle). |
| 7 | Save injection | **Keep** | `dumpSave()`/`loadSave(json)` are thin wrappers over exported `serialize`/`deserialize` + the Continue-path mode normalization. Fixtures allowed but discouraged (SAVE_VERSION churn — v12 bump in flight right now); regenerate via `dumpSave`. |
| 8 | Direct semantic action API | **Defer (mostly)** | Real keyboard path exercises the input gates and `justOpened*` swallows — that's where player-facing bugs live. Lib gets `press`+`waitForIdle` (`act()`) instead. Revisit semantic verbs only if specific flows stay flaky. |
| 9 | Event ring buffer | **Keep, slimmed** | Combat events already exist on `CombatState.events`. Buffer only needs: mode/route changes, messages, feature results, audio cues, errors. Minimal chokepoints (one shell hook + 2–3 main.ts emit calls + audio patch). |
| 10 | Error capture | **Keep, split** | In-page: `error`/`unhandledrejection` listeners + asset-failure notes into the buffer (debug-gated). Network-level: script-side via Playwright events in the lib (zero engine change). "Missing WAVs" premise **reinstated, corrected**: the three sample-backed SFX families (`ui`/`combat`/`dungeon` WAVs) are real assets that can 404/fail-decode; a failure is invisible today (silent no-op, no console error — see §2.6) and is exactly what a readiness probe + `assetFailed` event exists to catch. |
| 11 | Invariant checker | **Keep, small** | Pure `checkInvariants(state)` → `snapshot().warnings`. HP bounds, `activeCharIds ⊆ party`, inventory shape, `pendingTrap` only in dungeon, cursed-slot rule, mode-vs-DOM visibility probe. |
| 12 | Audio cue spy | **Keep** | Monkey-patch the `audio` singleton's methods **from the debug module** (records name/id/timestamp into the ring buffer). Zero *further* changes to `audio.ts` for the spy itself — PR-2 already added a small, real seam there (`getSampleLoadStatus()` + `*LoadStatus`/`failedSampleIds` fields) for the readiness probe, so "zero changes" describes the spy's own footprint, not the file's total diff across the sequence. Because a missing sample is a silent no-op (§2.6), the spy alone can't distinguish "cue fired and played" from "cue fired and produced no sound" — pair it with the readiness probe's per-family failed-id list (now **PR-4**, after the PR-4/PR-5 swap) rather than trying to infer playback success from the call alone. |
| 13 | `?noflicker` determinism flags | **Defer** | Torch flicker is a pure time function (stable enough); the real screenshot instability is combat **formation jitter** (`combat-scene.ts:789/832/934`). Only worth touching if screenshot-diffing becomes a workflow; then route that jitter through the seeded cosmetic-safe path. |
| 14 | Playwright Clock / frame stepping | **Reject for now** | `page.clock` stalls the rAF loop and desyncs AudioContext time; `isIdle()` covers the actual need. |
| 15 | Coverage report | **Defer** | Derivable offline from ring buffer + transcripts; no engine feature needed. |
| 16 | `data-testid` on DOM menus | **Defer, cheap when wanted** | `FF6Window` already emits stable classes (`.ff6-window`, `mode-*`); one central change in the window library adds testids to title/items if text-snapshot ever proves insufficient. |
| 17 | Transcripts + state hashes | **Keep, lib-side** | Lib records every `press`/`jumpTo` (transcript capture starts in PR-4, alongside failure bundles); the hash-per-checkpoint replay/first-divergence tooling lands with seeding in PR-5, since a diff across runs is only meaningful once the RNG stream is pinned. |
| 18 | Failure artifact bundle | **Keep, lib-side** | Formalizes what scripts already half-do: screenshot + snapshot JSON + `log(n)` + console + seed + transcript + URL/viewport per finding/crash. |
| 19 | Semantic DOM mirror / ARIA | **Reject** | High build+maintenance cost; `snapshot()` + ASCII map serves agents better than bounding boxes over an opaque canvas. |
| 20 | Playwright Test + traces | **Defer** | See §2.7. |

---

## 4. Recommended PR sequence

**Reordered after review** (see §9): evidence now ships before seeding. The brief's own
reproduction unit is "seed + jumpTo + action transcript," and transcript replay only becomes
meaningful once PR-5 exists — so seeding alone was only half-useful sitting at position 4.
Evidence (event buffer, audio spy, error capture, invariants, failure bundles), by contrast,
improves *every* playtest run immediately, seeded or not. Swapping the order front-loads the
generally-useful work and pushes the narrower, harder-to-fully-realize win (seeding) to where its
companion tooling (replay) already exists.

1. **PR-1 — Snapshot core:** `__onyxDebug.snapshot()` + `render_game_to_text()` +
   `availableActions` + `CombatController.debugView()` + shared `scripts/playtests/lib.mjs` +
   migrate `playtest-floors-1-3.mjs`. *(Kills the duplicated `snap()`s; agents read state, not pixels.)*
2. **PR-2 — Quiescence:** `isIdle()` + `readiness()` (now including the audio sample-load
   families, §2.6) + `modeTransitionPending` flag; lib gains `waitForIdle`/`act`; sleeps removed
   from the migrated script. *(Faster + less flaky runs.)*
3. **PR-3 — Setup accelerators:** `jumpTo(...)` via real `transitionToFloor` (with an
   `{ autosave?: boolean }` opt-out — see §6), `dumpSave()`/`loadSave(json)`; lib
   `boot({scenario})`; migrate **both** `playtest-floors-1-3.mjs`'s and
   `playtest-floors-4-5.mjs`'s `warp()` calls onto `jumpTo` in this PR, not later — floors 4-5 are
   where `warp()`'s NPC-resurrection/door-desync bug bites hardest, so that migration is the
   highest-value part of the PR, not an afterthought. *(Kills `warp()` and its false findings;
   rare situations become one call.)*
4. **PR-4 — Evidence:** event ring buffer + audio cue spy + error capture (incl. audio-sample
   load failures) + invariants → `warnings` + lib failure bundles (screenshot + snapshot + log +
   console + seed placeholder + **action transcript, recorded but not yet replayed**). *(One-command
   evidence per finding, available immediately, independent of seeding.)*
5. **PR-5 — Seeded gameplay RNG + transcript replay:** `game/rng.ts` PRNG + `?seed=`/`setSeed(n)`
   threaded through the wiring layer; additive `rng` params where missing; **and** the
   hash-per-checkpoint replay/first-divergence tooling that makes a recorded transcript (PR-4)
   actually reproducible now that runs can be pinned to a seed. Landing these together means
   seeding ships with the one capability that makes it worth having, instead of sitting half-used
   for a PR cycle.

Each PR is independently shippable; 1→2, 2→3, and 3→4 are soft orderings (idle wants snapshot's
plumbing; evidence's failure bundles read better once `jumpTo` exists for repro steps; replay in
PR-5 depends on the transcript recording PR-4 introduces).

---

## 5. Detailed design — PR-1: Snapshot core

**Goal / benefit:** one call replaces every hand-rolled `snap()`; agents get mode+overlay,
position, party, combat, message, and legal actions as JSON without screenshot guessing.

**New files**
- `src/debug/snapshot.ts` — pure (no DOM, no engine imports): `buildSnapshot(input): Snapshot`,
  `asciiMap(floor, player, explored, radius?)`, `availableActionsFor(route, state, combatView)`.
  Inputs are plain data (`GameState` + route + optional combat view + message text) so Vitest can
  cover it exhaustively.
- `scripts/playtests/lib.mjs` — `launch()`, `boot(page)`, `snap(page)` (→ `snapshot()`),
  `press(page, key, n)`, `shot(page, name)`, findings collector, console/pageerror/requestfailed
  capture. Extracted from `playtest-floors-1-3.mjs`, kept dependency-free.

**Modified files**
- `src/engine/combat-ui.ts` — add read-only `debugView()`: `{ phase, actingCharId, roundEnding,
  selection: { title, entries, index } | null, playbackDone }`. No behavior change; uses existing
  privates.
- `src/main.ts` — extract `currentRouteFlags()` (shared by `routeControllerEvent` and the debug
  block so the route can't drift); inside the existing `?debug=1` block add `snapshot(opts?)`
  assembling: route, `state` fields (Sets → arrays; floor grid excluded unless `opts.map`),
  `mapVisible`, `inArena`, message text/visibility, `combatController?.debugView()`, tail of
  `state.combat.log`/`events`, `availableActions`. Add
  `(window as any).render_game_to_text = () => JSON.stringify(snapshot())` (same gate).
- `src/engine/shell.ts` — export `getMessageText(): { text, visible }` (3 lines) so the debug
  layer doesn't re-derive CSS visibility.
- Migrate `scripts/playtests/playtest-floors-1-3.mjs` onto the lib (other scripts untouched —
  they keep working against raw `state`).

**Snapshot shape (sketch)**

```jsonc
{
  "schema": 1,
  "mode": "dungeon", "route": "dungeon",          // route = resolveControllerRoute enum
  "floor": { "id": 1, "name": "The Flooded Crypt", "theme": "f1" },
  "pos": { "x": 5, "y": 9, "facing": 0, "compass": "N" }, "tile": "treasure",
  "flags": { "inDarkness": false, "inAntimagic": false, "mapVisible": false,
             "inArena": false, "pendingTrap": null },
  "party": [{ "id": "c1", "name": "Aria", "class": "Fighter", "level": 3,
              "hp": 24, "maxHp": 30, "sp": 0, "maxSp": 0, "status": [], "perkIds": [] }],
  "activeCharIds": ["c1","c2","c3","c4"],
  "gold": 100, "keys": [], "inventory": [{ "itemId": "healing-potion", "identified": true }],
  "buffs": [], "message": { "text": "...", "visible": true },
  "combat": null,                                   // or { phase, actingCharId, selection, enemies:[{id,name,hp,maxHp,row,status}], recentEvents, result }
  "availableActions": ["forward","backward","turnLeft","turnRight","camp","map","grimoire","town","unlock","save"],
  "map": null                                       // opt-in: ASCII lines
}
```

Exact enemy HP is exposed (players only see descriptors) — debug-only surface, flagged in docs.

**Tests**
- Vitest: `src/debug/snapshot.test.ts` — snapshot from `createGameState` + a carved floor;
  `availableActions` per route incl. trap-modal and borrowed-title overlays; ASCII map renders
  walls/doors/features/facing on a known grid; Sets serialized; no mutation of input state.
- Playwright smoke: `scripts/playtests/smoke-debug-surface.mjs` — boot → snapshot at title /
  town / dungeon / trap-prompt / combat (via `startCombat`) / save-overlay; asserts route and
  `availableActions` at each stop. Runs against `vite preview`.
- Migrated floors-1-3 script reproduces its previous findings (or better).

**Risks / pitfalls**
- Borrowed `"title"` mode: never report bare `mode` as the overlay — always the route. Shared
  flag-builder prevents drift.
- `noUnusedLocals`: wire everything or the build gate fails.
- Snapshot must be read-only (no `structuredClone` of the whole state either — grid is big;
  select fields explicitly).
- `debugView()` must not leak mutable internals (return copies of entries).
- Do not touch input gates, `justOpened*` flags, or `shell.showMode`.

**Definition of done:** `npm run build` zero errors; `npm test` green including new snapshot
tests; smoke script passes against preview; floors-1-3 migrated with its private `snap()` deleted;
AGENTS.md "Debug/testing aids" section updated.

**Non-scope:** isIdle, seeding, jumpTo, event buffer, any engine behavior change.

---

## 6. Later PRs (concrete but shorter)

### PR-2 — `isIdle()` + `readiness()`
- `main.ts`: `modeTransitionPending` set in `transitionToMode`, cleared in its timeout (+1 rAF).
- `isIdle()` = `!modeTransitionPending && !isRenderCameraAnimating() && (no combat || phase !==
  "playback" || playbackDone) && !prologueController` (camp/menus are idle-awaiting-input).
  Exposed on `__onyxDebug` and folded into `snapshot().idle`.
- `readiness()` = `{ fonts, textures, enemySprites, partySprites, effectSprites, mapSprites,
  audioUi, audioCombat, audioDungeon, failed: string[] }`. The fonts/textures/sprite fields are
  outcomes main.ts already owns (`main.ts`'s `.catch` handlers around the boot/prewarm promises
  record instead of swallowing). The three `audio*` fields are different: `resume()`, not
  main.ts, kicks off `loadUiSounds`/`loadCombatSounds`/`loadDungeonSounds`, and only on the first
  user keydown — so this PR adds a small, real seam to `audio.ts` itself: a read-only
  `getSampleLoadStatus()` accessor over three new private `*LoadStatus` fields
  (`"not-started" | "loading" | "done"`) plus a `failedSampleIds: string[]` pushed to inside the
  existing per-sample catch/failure branches. `readiness()` just wraps that accessor — it never
  calls `load*Sounds()` itself (that would call `resume()` on a cold context, both creating an
  `AudioContext` outside a user gesture and racing a second fetch against an in-flight one). A
  script that never presses a key correctly sees `"not-started"`, not a failure.
- Lib: `waitForIdle(page, timeout)` (poll ~30 ms), `act(page, key) = press → waitForIdle`;
  replace sleeps in migrated script; report runtime delta in the PR description.
- Document (not code): combat fast/skip already exist — hold Shift / press Escape in playback.
- Tests: Vitest for any pure predicate; smoke script asserts idle flips around a move, a mode
  fade, and combat playback.
- Risk: don't tighten `isIdle` into a lie (e.g., FF6Window open animation is cosmetic — keys
  work; excluded deliberately).

### PR-3 — `jumpTo` + save injection — **SHIPPED**
- `__onyxDebug.jumpTo({ floorId, x, y, facing?, partyLevel?, gold?, keys?, items?,
  autosave?, stepsSinceEncounter?, clearUnlockedDoors? })`: refuses while combat/overlay
  controllers are live (clear error); otherwise resets/normalizes via existing paths —
  `transitionToFloor` (real bookkeeping incl. `applyKilledNPCs`, `deepestFloorReached`),
  `markExplored`, `resetRenderCamera`, `setMode`/`showMode`. Party leveling copies Arena's
  `startArena` pattern (`levelUpChar` loop via `applyJumpPartyOptions`, never XP banking).
  **`autosave` defaults to `true`** (matches `transitionToFloor`'s existing behavior) with an
  explicit `false` opt-out threaded through `transitionToFloor` itself. `clearUnlockedDoors`
  supports lockpick→key-open playtest sequences that need a fresh session lock set.
- `dumpSave()` → `serialize(state)`; `loadSave(json)` → `deserialize` + `applyLoadedGameState`
  (shared with Continue — `normalizeLoadedMode` in `src/debug/load-normalize.ts`).
- Lib: `boot(page, url, { scenario })` → title → `jumpTo`; `jumpTo(page, opts)` helper.
- Migrated **both** `playtest-floors-1-3.mjs` and `playtest-floors-4-5.mjs` off private `warp()`.
- Tests: Vitest for `normalizeLoadedMode`, `applyJumpPartyOptions`, and `autosave` default/false;
  smoke — jump F4 + deepestFloorReached, killed-NPC persistence, dump→load round-trip,
  `autosave: false` sentinel, title→jumpTo boot scenario.

### PR-4 — Event buffer, audio spy, error capture, invariants, failure bundles
- `src/debug/event-buffer.ts`: capped ring (~500) + `log(n)`; event kinds: `modeChange`, `route`,
  `message`, `feature`, `audioCue`, `error`, `assetFailed`.
- Chokepoints (all no-op unless debug): `shell.ts` gains `setDebugMessageHook(fn)` (single seam);
  `main.ts` emits on `transitionToMode`/`setMode` call sites and in `onMove`'s feature result;
  audio spy = prototype-walk patch of the `audio` singleton **inside the debug module** (records
  every `playUi`/`playCombatSfx`/`playDungeonSfx` call as an `audioCue` event); `error`/
  `unhandledrejection` listeners registered there too. Combat needs nothing — events already live
  on `CombatState.events`.
- **Audio asset-failure capture (the corrected item, §2.6):** since a missing/failed WAV sample
  is a silent no-op today (no exception, no console line — `playDungeonSfx` et al. just `if
  (!buf) return`), this PR is what makes that visible: the `readiness()` per-family `failed: []`
  list from PR-2 feeds `assetFailed` events into the buffer, and the audio spy annotates each
  `audioCue` event with whether a buffer existed at call time — so a bundle can show "cue X fired
  three times, sample never loaded" instead of silence being indistinguishable from "no cue was
  ever triggered."
- `src/debug/invariants.ts`: pure checks → `snapshot().warnings` (HP/maxHp, roster/active-ids,
  `pendingTrap` mode consistency, cursed-slot rule, DOM-visibility vs. route probe in the debug
  layer).
- Lib: `captureFailureBundle(page, name)` → screenshot + snapshot + `log(300)` + console +
  network failures + **action transcript recorded so far** (press/jumpTo calls with timestamps —
  no seed yet, so no replay/diff capability until PR-5) + viewport into the run's out dir;
  findings collector calls it automatically.
- Tests: Vitest for buffer + invariants; smoke asserting cues recorded for footstep/door/combat
  start, an injected error landing in `log()`, and a deliberately-broken sample path (point one
  `*_SFX_FILES` entry at a 404 in a test-only fixture, or stub `fetch`) producing an
  `assetFailed` entry instead of silence.

### PR-5 — Seeded gameplay RNG + transcript replay
- `src/game/rng.ts`: `createSeededRng(seed): () => number` (mulberry32), Vitest-tested.
- Wiring seam (defaults preserved — behavior identical without a seed):
  `main.ts` holds `gameplayRng` (from `?seed=` when `?debug=1`, else `Math.random`;
  `__onyxDebug.setSeed(n)` swaps it) and passes it to: the encounter roll (`main.ts:370`),
  `rollEncounter` (new optional param in `data/enemies.ts`), `handleTileFeature`/`disarmChest`/
  `openChest` calls, `CombatController` (new `rng` option threaded to all `beginRound`/
  `resolve*Turn`/`endRound` call sites), `NPCController` → `stealFrom`, and
  `createGameState`/`createDefaultParty`/`createCharacter`/`rollStatsForRace` (additive optional
  params) so party stats are reproducible.
- Explicitly untouched: `combat-scene.ts` cosmetics, `audio.ts` pitch/gain jitter, `vfx-vignette.ts`.
- Snapshot gains `seed` field; lib records it in every report and in the PR-4 failure bundle
  (which already captures the transcript — this PR is what makes that transcript replayable).
- **Transcript replay:** extend the PR-4 transcript recorder with a per-checkpoint state hash
  (stable stringify of the snapshot minus volatile fields — timestamps, animation phase);
  `scripts/playtests/replay.mjs` takes a saved transcript + seed, re-runs the same
  press/`jumpTo` sequence, and reports the first checkpoint whose hash diverges.
- Tests: Vitest — fixed seed ⇒ identical encounter/party/turn sequences through the pure APIs;
  smoke — two runs, same seed + same transcript from a `jumpTo` ⇒ identical snapshot hashes at
  every checkpoint; replay script correctly flags an injected divergence (e.g. one extra keypress)
  at the right step. And the inverse guard: no seed ⇒ code path identical to today (spot-check by
  diffing default-arg call sites).
- Quarantine note: this changes **no** balance; every change is an optional parameter or a
  wiring-layer pass-through. Document the stream-divergence limitation prominently — a seed pins
  the RNG stream, not the whole run; any action-order difference still diverges results.

---

## 7. Decisions (resolved in review — no longer open)

1. **Query-param policy:** `?seed=` requires `?debug=1`, same as every other debug hook — one
   gate for all test surface, keeps AGENTS.md rule 3 crisp.
2. **Enemy exact HP in snapshots:** exposed, debug-only. Combat assertions are close to useless
   without it; the player-facing HP-descriptor design is a UI concern, not a debug-surface one.
3. **Script migration breadth:** freeze the other dated scripts as historical records; migrate
   `playtest-floors-1-3.mjs` in PR-1/PR-2/PR-3, and migrate `playtest-floors-4-5.mjs`'s `warp()`
   calls onto `jumpTo` in **PR-3** rather than leaving it for later — see §4/§6 PR-3.
4. **`jumpTo` autosave side-effect:** default preserved (`autosave: true`, matching
   `transitionToFloor`'s existing behavior) with an explicit `autosave: false` opt-out on
   `jumpTo`, threaded through `transitionToFloor` itself. Cheap insurance against a
   `loadSave()` → `jumpTo()` → Continue-path test silently losing its loaded save.
5. **PR-4 vs PR-5 order:** **swapped from the original brief.** Evidence (event buffer, audio
   spy, error capture, invariants, failure bundles) now ships as PR-4, before seeding. Seeding's
   full value depends on transcript replay (originally slated for the old PR-5), so shipping it
   alone at position 4 left it half-useful for a cycle; evidence helps every playtest run
   immediately regardless of seeding. Transcript replay is folded into the seeding PR (now PR-5)
   since replay is only meaningful once runs can be pinned to a seed.
6. **AGENTS.md update scope:** one new/expanded "LLM playtest surface" section **per PR**, not a
   single pass at the end — it's the contract other agents read, and a multi-PR window with
   undocumented debug surface risks AGENTS.md's own git rule 5 ("no `window.__` exposures") being
   misapplied to sanctioned, gated additions.

---

## 8. Out of scope

- Any gameplay/balance/logic change (movement, combat math, encounter rates, map data). Seeding
  is a debug seam with preserved defaults; nothing else touches `game/` semantics.
- `@playwright/test` adoption, CI-run browser suites, traces-on-retry.
- `page.clock` frame stepping; global time-scale.
- Visual-regression/screenshot diffing and the `?noflicker` determinism flags (revisit only if
  that workflow materializes; the known blocker is combat formation jitter).
- Semantic DOM mirror / ARIA tree for the canvas.
- Third-party "browser perception" MCP dependencies.
- Coverage dashboards (derive offline from PR-4's evidence artifacts if wanted).
- New art, audio, or renderer changes of any kind — the audio-loading correction in §2.6 is about
  *observing* the existing WAV sample layer, not modifying `audio.ts`'s behavior.

---

## 9. Review changelog (2026-07-25)

A second pass checked this plan against the live tree and found one factual error, which is now
corrected throughout (§2.4, §2.6, triage #10/#12, PR-2, PR-4): audio is **not** fully procedural.
`src/engine/audio.ts` fetches three WAV sample families (`public/assets/sfx/{ui,combat,dungeon}/
*.wav`, real files on disk) with per-sample try/catch; a missing/failed sample is a silent no-op
today (`if (!buf) return` — no sound, no error, no exception), which is precisely the kind of gap
PR-2's readiness probe and PR-4's asset-failure capture should close, not something to skip
because "there's nothing to fail." The original §7 open questions are now resolved as decisions
(§7); the PR-4/PR-5 order swapped (evidence before seeding, with transcript replay folded into
the seeding PR); PR-3 gained an explicit `jumpTo({ autosave: false })` opt-out and an explicit
commitment to migrate `playtest-floors-4-5.mjs` in that same PR rather than leaving it open.
Nothing else in the original audit (RNG call-site inventory, `warp()`/`transitionToFloor`
bypass diagnosis, quiescence sources, route/overlay handling, `@playwright/test` verdict) changed
under review.

**Addendum (PR-2 implementation, 2026-07-25):** PR-2 shipped as designed (`computeIdle()` extracted
to a pure `src/debug/idle.ts` for exhaustive Vitest coverage rather than living inline in
`main.ts`; `idle` made a **required** `SnapshotInput` field, not optional-defaulting-true, so a
caller can't silently ship an unasserted liveness value; `CombatController.isChoreographyDone()`
added as a cheap poll seam distinct from the heavier `debugView()`). Verified against a live
build: three consecutive runs each of `smoke-debug-surface.mjs` and the migrated
`playtest-floors-1-3.mjs` all reach `route === "dungeon"`, and a side-by-side run of the pre-PR-2
script against the same build confirmed the same 4 core findings plus a ~33% wall-clock drop
(93-97s vs. 139s) — proving the fixed-sleep-vs-idle-poll swap is a pure speedup, not a source of
the findings. Two corrections landed on this doc during that pass: the `readiness()` design above
(§6) previously claimed audio's promise outcomes were something "main.ts already owns," true only
for fonts/textures/sprites — audio needed a real (small) accessor added to `audio.ts` itself,
`getSampleLoadStatus()`, since `resume()`, not main.ts, owns the three sample loaders; and triage
#12's "zero changes to `audio.ts`" claim is now scoped to the cue-spy's own footprint, since PR-2
already touched the file for the accessor. The `not-started` state (audio hasn't loaded because
no keydown has fired) and the failure-recording path (`failedSampleIds`) are both now covered —
by a live-browser smoke assertion and by injected-failure Vitest tests in `audio.test.ts`
respectively — rather than shipped with either claim untested.
