# Prompt: Combat Flow — Target Defaults, Playback Speed, Sticky Actions

You are a senior game/systems engineer on **OnyxLabyrinth** (`/home/sloppymo/OnyxLabyrinth`).
Work with full autonomy: explore, implement, test, prove in browser, and update the reading-list docs.
Do **not** commit or push unless asked.

## Why this pass (post 2026-07-13 combat-depth)

These are already **shipped** — do not reopen as bugs:
- L9+ Magic/Tech scroll-follow, wrap, dynamic footer via `menuHintText`, `T`/`t` technique shortcut
- Status tags (PSN/PAR/SLP/BLD/BRN/RGN), Smoke Bomb flee, DoT/regen engine, wired perks from combat-depth
- Instant-resolve FF6 turns (no Space-gated log); Tech menu soft-lock is **fixed** (`selectTechnique` wired)

Still open (player *tempo*, not decision depth):
- Six characters × full walk-approach choreography makes trash fights feel long
- Target select always starts at index 0 — no last-hit / lowest-HP preference
- Attack always opens target pick even when one living enemy remains (extra Enter)
- No way to accelerate or skip in-flight turn playback
- No sticky “do what I just did” for back-row hammering the same foe
- Optional clarity: skipped turns (sleep/paralysis) and affordability (SP/Rage) still lean on flash/menus rather than at-a-glance HUD

**Reading-list note:** older `PLAYTEST-REPORT.md` claims that footer still shows stale `A/M/D/I/R` and that `t` is unbound are **stale** — trust `combat-select-action-view.ts` / `combat-ui.ts` `handleMenuKey` and the unit tests. Do not “fix” already-working shortcuts.

**Goal of this pass:** cut wall-clock and keystrokes per trash fight without changing combat math, encounter rates, or perk/spell numbers.

### What “tempo UX” means here

**Tempo UX** = interface and playback pacing that changes how *fast* combat *feels* and how many keystrokes a trash fight costs — **without** changing hit chance, damage, XP, encounter rates, or inventing new combat verbs (One More, All-Out, ATB, etc.).

In scope for this prompt: last-hit / lowest-HP prefocus, single-enemy Attack auto-confirm, Attack as default menu cursor, hold 2× / sticky FAST / hard-skip choreography, sticky Attack Repeat, optional clarity/feel polish.

Out of tempo UX (separate passes): ATB gauges, Persona One More / All-Out Attack, weakness-chain systems, permanent math retunes, encounter-density redesign.

## Research refinements (web pass, 2026-07-13)

Player + industry consensus for turn-based JRPG tempo (r/JRPG, Trails, Fire Emblem, Bravely Default, Persona 5 interviews, Yanfly/Irina battle plugins). Fold these into A–C; do **not** invent Persona “One More / All-Out” mechanics here.

| Pattern | Source signal | How it changes this prompt |
|---------|---------------|----------------------------|
| **Hold *and* toggle** speed/skip | Irina Action Sequence FF/Skip; FE “hold L to see anims”; Trails skip-any | Phase B must ship hold-to-boost **and** a sticky toggle for the rest of the fight (visible `FAST`/`SKIP` cue). Hold alone forces finger fatigue. |
| **Discrete multipliers > binary skip** | Bravely 2×/4×; Disgaea extreme tiers; Yanfly anim-speed options | Prefer **2× hold** (and optional 3×) as the daily driver; hard-skip is secondary for players who already know the hit. Don’t make skip the only path. |
| **Respect player time, keep beauty** | Hashino (Persona): tempo is immersion; players hate *only* FF as a band-aid | Keep default `APPROACH_MS`/`RETURN_MS`; optional later trim of *gaps between* steps if Arena still feels padded. Never require turbo to enjoy first fights. |
| **Single-button Attack** | Hashino: “immediately attack… with a single button press” | Phase A single-enemy auto-confirm is non-negotiable; consider default menu cursor on **Attack** every turn (if not already). |
| **Party Auto = last commands** | Bravely Default Y-toggle: replay last orders; persists across battles; falls back to Attack if MP/item/BP missing; `AUTO` HUD | Phase C thin wedge stays per-char Attack Repeat; document **Auto (party sticky)** as explicit stretch / Phase E — bigger grind win, higher soft-lock risk. |
| **Trash ≠ boss tempo** | Gamedeveloper analysis of P5: weak fights clear fast, bosses stay long | Tempo UX (this prompt) is for trash; encounter-density / ambush / flee levers stay reading-list #4 — do not merge. |
| **Victory phase is sacred** | Irina changelog: hide FF UI on victory; Reddit hate accidental skip of rewards | Already: never burn result Confirm. Also hide/disable turbo affordances on `phase === "result"`. |
| **Fallback when Auto can’t pay** | Bravely: insufficient MP/item → Attack | Any Repeat/Auto path must flash and fall back safely — never soft-lock or silently no-op without feedback. |

**Explicitly rejected for this pass** (identity / math changes): ATB, One More extra turns, All-Out Attack finisher, ambush initiative rewrite, permanent global 4× as the only “normal,” auto-battle AI that invents actions.

## Ranked priorities (do A → B → C; D only if A–C are green)

| Rank | Phase | Player value | Approx risk |
|------|-------|--------------|-------------|
| 1 | **A — Target defaults** | Every Attack/Tech/spell target pick | Low — UI controller only |
| 2 | **B — Playback accel / skip** | Full party turns + enemy turns | Medium — choreography clock |
| 3 | **C — Sticky last action** | Trash grind / Arena | Medium — remember last intent carefully |
| 4 | **D — Optional clarity + feel** | Status skips, SP/Rage peek, hit flinch | Low–Med — polish; do not block A–C |
| — | **E — Stretch (optional write-up only unless A–C trivial)** | Bravely-style party Auto across turns/fights | Higher — only if C is tiny |

## Read first (in order)

1. `docs/AGENT-READING-LIST.md` — current vs stale; update when you finish
2. `AGENTS.md` — combat event system, FF6 verification checklist, no game-logic retunes unless asked
3. `VFX-FEEL-ANALYSIS.md` — only if you reach Phase D feel items (recoil / popup timing)
4. Code focus:
   - `src/engine/combat-ui.ts` — phases, `openTargetSelect`, `handleMenuKey`, `handleSelectionKey`, playback gate
   - `src/engine/combat-select-action-view.ts` — `menuEntriesForCharacter`, `menuHintText`, `ACTION_SHORTCUTS`
   - `src/engine/combat-scene.ts` — `APPROACH_MS` / `RETURN_MS` / `ATTACK_MS`, step clock, `isPlaybackDone`
   - `src/game/combat.ts` — only if sticky-action needs a pure helper; **do not** retune formulas
5. Tests already covering Tech routing: `src/engine/combat-ui.test.ts`, `combat-select-action-view.test.ts`

## Do this in order. Do not skip ahead.

### Phase A — Target defaults (must ship)

Goal: Attack/select-target for common cases is **Enter once**, not arrow tourism. (Persona/Hashino: “attack with a single button press.”)

1. **Prefocus rule** (enemy single-target only — Attack, Ambush, single-target Tech, single-target offensive spells):
   - Prefer **last hit enemy** this combat if still living (`instanceId` remembered on the controller, set when a player attack/technique/spell deals damage or misses a living foe). Use **one party-shared last-hit id** for the fight (not only the acting character’s memory) so back-row finishes match front-row focus.
   - Else prefer **lowest current HP%** among living enemies (tie-break: current list order).
   - Ally-target heals: prefer lowest HP% living ally (not KO); if all full, keep index 0.
   - Row / multi-target / all-enemies: no change (still immediate or row pick as today).
2. **Single-enemy fast path:** if Attack/Ambush (and optionally single-enemy Tech) has exactly **one** living enemy, **auto-confirm** that target after the action is chosen (prefer over a useless select-target detour).
3. **Menu resting cursor:** when the command menu opens, default highlight to **Attack** if present (so Enter = Attack without arrowing). Do not steal focus from a character with only Magic left if Attack is invalid — keep simple.
4. **Dead / invalid rows:** never leave the cursor on a dead enemy; when the prefocus target dies mid-round, fall back to lowest HP% again on next open.
5. Unit tests: pure helper(s) for “preferred enemy index given lastId + HP list”; controller tests for single-enemy auto-confirm and last-hit preference.
6. Do **not** change who can be targeted (reach, rows, hide) — only *which valid candidate is highlighted first*.

### Phase B — Playback acceleration / skip (must ship)

Goal: long party rounds feel snappy **on demand** without deleting Animations. Match industry “hold + toggle” + discrete speed (not skip-only).

1. While `phase === "playback"` (include enemy/ally auto-turns):
   - **Hold Shift** (or Space — document one) → **2×** scene clock for as long as held. Optional: second hold tier / double-tap Shift for **3×** if easy; do not invent a five-speed Disgaea ladder.
   - **Toggle** (`Tab` or `F`) → sticky **Auto-Fast** for the rest of *this combat* (same 2× without holding). Show a compact on-canvas or hint cue (`FAST`). Clears on combat end / result.
   - **Hard skip** (recommend hold Escape *during playback only*, or a dedicated key distinct from menu Esc) → flush remaining steps of the **current** turn choreography to `now`. Damage already applied at resolve — playback is cosmetic.
2. Prefer speeding the existing step clock over dropping events. If no clean API exists, add `skipPlaybackToEnd(scene, now)` that runs remaining step callbacks in order so idle/death/fade state stays consistent.
3. Victory/defeat **result** window: turbo and skip **must not** burn Confirm; hide the playback affordance on `phase === "result"` (Irina/Yanfly pattern).
4. Hints: during playback only — e.g. `Hold Shift: 2× · Tab: FAST · Esc: skip turn`. Menus stay clean.
5. Tests: 2× path doesn’t desync `isPlaybackDone`; skip-to-end → done; sticky FAST survives actor handoff; result Enter still required; Esc during **menu** still backs out (must not clash with skip binding — use hold-Esc-only-in-playback or a different key if Esc is contested).
6. **Do not** permanently change `APPROACH_MS` / `RETURN_MS` for players who never turbo. Optional micro-opt only if you measure dead air *between* steps with no gameplay meaning — document before/after.

### Phase C — Sticky last action / Repeat (must ship the thin wedge)

Goal: “hit the same guy again” is one keystroke for trash, still Wizardry-menu for deliberate play.
Bravely-style full Auto is **aspirational** (Phase E) — do not block A–B on it.

1. After a successful player Attack (and optionally Ambush / single-target Tech that dealt or missed), remember on the **controller** (not `GameState`, not save):
   - `{ kind, actorId, targetId, spellId?/techniqueId? }` — only reuse when the **same character** acts again **and** the remembered target is still a valid candidate.
2. Surface as **`Repeat`** menu entry + shortcut (`.` or `Z`); insert after Attack. Discoverability > hotkey-only.
3. Rules of engagement:
   - Invalid if target dead, actor silenced (for Magic repeat), insufficient Rage/SP, or row/all-target last action.
   - Never repeat Flee / Defend / Hide / Item by default (items burn stock; flee is intentional).
   - Attack-like only for v1 Repeat; Magic/Tech auto-fire only if last action was a **fully resolved** single-target and costs are met — otherwise flash and stay on menu.
   - **Bravely fallback:** if Repeat was Mag/Tech but resources are gone, prefer flash + stay — or optional fall back to Attack on same target (document which; Attack-fallback is better for grind, flash-only is safer).
4. Flash a short reason when Repeat is pressed but illegal (“No target!” / “Not enough rage!”). Never silent no-op.
5. Tests: sticky clears on target death; Repeat on next turn of same actor re-resolves Attack; different actor does not inherit another’s sticky (default: **per-character**).
6. Out of scope for C: party-wide Auto across battles, AI inventing actions, simultaneous input queue.

### Phase E — Stretch only (write up if skipped; implement only if A–C are trivial leftovers)

**Bravely Default Auto pattern:** toggle (e.g. `Y` / `Q`) that replays each character’s **last resolved command** every turn, shows an `AUTO` cue, persists for the combat (optionally across Arena “Next Fight” only — **not** into dungeon saves). Insufficient Rage/SP/items → Attack same target or Defend; never Flee. One tap disables. Higher risk — ship only with hard tests that Auto cannot burn the result window or flee the party.

### Phase D — Optional clarity + feel (only after A–C verified)

Pick **at most two** of these; do not expand into a second epic:

1. **Incapacitated skip readability:** when sleep/paralysis auto-resolves a turn, ensure a visible banner or flash (“Asleep” / “Paralyzed”) already emitted via events — if missing, add a structured event or reuse banner so it isn’t silent. Prefer existing combat event paths.
2. **SP / Rage at decision time:** on the command menu for the acting character, show a compact `SP a/b` and/or `Rage n` line in the menu window or hint row (read-only). Do not redesign the three-window layout.
3. **Hit flinch (feel):** from `VFX-FEEL-ANALYSIS.md` — small target recoil + white flash in `impactSteps` using existing `startMove` / anim offsets. No new art; keep < ~20 lines if possible.
4. **Damage popup delay** (~80–120ms after burst) — only if flinch not chosen and timing still feels off in Arena.
5. **Victory outro compression (very soft):** if the result window already lists gold/XP in one view, do not add Auto-dismiss that steals Enter — at most ensure no leftover turbo UI / empty waits before the result appears.

Skip Phase D entirely if A–C burned the session — ship tempo first.

## Constraints

- **No combat math / XP / encounter-rate changes.** Prefocus and Repeat must not alter hit chance, damage, or flee odds.
- No new npm deps; no WebGL; no corridor renderer / fog / CRT changes.
- Follow AGENTS.md (shell modes, borrowed `"title"`, utility spells stay out of combat lists).
- Sticky / last-hit state is controller-local (like perk queue policy) — **never** persist into saves.
- `npm run build` and `npm test` must pass.
- Every *new* gameplay outcome still needs a `CombatEvent` — pure UI tempo work should not invent fake damage events.

## Verification (required — Arena + `?debug=1`)

1. **Target defaults:** fight with 3+ enemies; kill one; next Attack lands cursor on last hit or lowest HP%; with 1 enemy left, Attack resolves without arrow mashing (screenshot or evaluate evidence).
2. **Playback:** start a full party Attack round; hold Shift → visibly ~2×; toggle FAST → stays on without hold; skip → next actor menu without soft-lock; result window still needs Enter and shows no turbo cue.
3. **Repeat:** Attack enemy A → later same character’s turn → Repeat hits A; kill A → Repeat fails with flash; other character does not steal sticky.
4. **Regression:** Tech menu still opens/backspaces; L9 spell scroll still follows; status tags still render; Smoke Bomb / DoT ticks untouched.
5. **Docs:** update `docs/AGENT-READING-LIST.md` — mark this prompt done/partial; note any leftover (e.g. no auto-battle). Leave encounter-density (#4) as its own later pass.

## How to work (maximize quality)

- Prefer pure helpers (`preferredEnemyIndex`, `canRepeatAction`) unit-tested at the top of `combat-ui` helpers or a tiny `combat-flow.ts` if the controller file is too thick.
- Do not fork the combat resolver for Tempo — resolve once, animate/skippably play.
- Playwright Arena proof: one focused clip/screenshot per phase claim.
- If skip-to-end races with death fade, prefer “complete remaining steps at now” over cancelling mid-callback.
- When unsure whether Repeat should cover Tech: ship Attack-only first, then one Tech if tests stay green.

## Out of scope

- Encounter density / Arena floor scaling / ambush-first-strike redesign (reading-list item 4; Persona-style “trash vs boss” dual pace lives there, not here)
- Town FF6 restyle, mobile map polish
- Full ATB, simultaneous party commands, inventing AI actions, One More / All-Out Attack
- Remaining perk stubs that need resistance/reflect/steal economies
- Changing base `APPROACH_MS` / `RETURN_MS` permanently for everyone (unless measuring dead air between steps — then document)
- Generating new VFX art (reuse only; Phase D flinch needs none)
- Boss-telegraph / CT turn-order strip UI — do not invent a CT gauge
- Persistent Options-menu battle-speed slider across sessions (nice; defer unless trivial localStorage next to FAST toggle)
