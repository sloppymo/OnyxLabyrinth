# OnyxLabyrinth — FF6 Combat Revamp Audit Report

**Scope:** `src/game/combat.ts`, `src/engine/combat-ui.ts`, `src/engine/combat-scene.ts`, `src/engine/combat-select-action-view.ts`, `src/engine/audio.ts`, `src/main.ts`, and the surrounding data/presentation layer.

**Audit method:**
- Code walk-through by a focused correctness subagent.
- Game-feel / audio gap analysis by a focused feel subagent.
- Manual Playwright playtest of title → dungeon → combat → victory/escape.
- Targeted state-machine seam tests written and run in `.tmp-audit/`.
- `npm run build` and `npm test` ran as the minimum verification gate.

**Artifacts produced by the audit:**
- `.tmp-audit/code-review.md` — detailed correctness / state-machine audit.
- `.tmp-audit/feel-gaps.md` — detailed game-feel and audio gap analysis.
- `.tmp-audit/playtest.md` — manual Playwright playtest log and screenshots.
- `.tmp-audit/seams-verification.test.ts` — targeted repro tests for the sharpest state-machine seams.

---

## 1. Executive summary

The FF6-style combat revamp is **architecturally sound and type-safe**. The per-actor instant-resolve flow works, the new test suites pass, the build is clean, and the Playwright walk-through can go from title to combat to victory/escape and back to the dungeon. The sprite-pack integration is real: most encountered enemies render from 100×100 animated strips.

That said, the system is currently **functional rather than satisfying**. Several important events are not emitted to the renderer, so the player gets no visual feedback for items, boss silence, fizzle-field/dispel spells, or critical hits. The feel layer (audio, screen flash, hit-stop, victory fanfare, status icons, varied spell effects) is largely missing. The boss is effectively unreachable because of a temporary floor-4 start and a broken silence mechanic.

The path from "working" to "fun" is clear: first fix the missing/broken event emitters, then add audio, then add persistent status/enemy information, then differentiate spell visuals and add juice.

---

## 2. Build and test verification

- `npm run build` — passes with zero TypeScript errors.
- `npm test` — passes, 270 tests across 12 files.
- `npx vitest run --config .tmp-audit/vitest.config.ts` — was used to run the targeted audit tests. Main-suite tests are not affected; the `.tmp-audit` tests live under their own config.

---

## 3. Playtest findings

A Playwright driver (`.tmp-verify-ff6.mjs`) plus an extra pass (`.tmp-audit/extra-playtest.mjs`) drove the full flow:

- Title → default party → town → dungeon → random walk.
- Encountered image-strip enemies: Lesser Construct, Elite Orc, Werewolf, Acid Puddle, Failed Experiment, Lab Assistant, Training Dummy.
- Menus, target selection, spell list, and Run all respond correctly.
- Attack and spell playback show walk → attack anim → hurt anim + bouncing white damage number.
- Spell banner (`Halito`) appears, result window appears, Enter returns to dungeon with corridor view intact.
- One transient `ERR_CONNECTION_REFUSED` burst on the first sprite-prewarm pass was not reproducible; a network probe showed all 95 strips loading.

Screenshots are in `.tmp-ff6-shots/` and `.tmp-audit/extra-shots/`.

**Playtest limitations:** the current `main.ts:101` starts new games on floor 4 (`FLOORS[3]`), so the floor-5 boss was never reached in this pass. The playtest also did not exercise item use, summon death, or `Bacortu` because those paths are not yet surfaced by the basic driver.

---

## 4. Correctness / state-machine findings

The per-turn state machine is mostly sound. The main bugs are all cases where **the resolver mutates state but does not emit the `CombatEvent` the renderer expects**, or where the scene cannot find an actor that has already moved into a corpse list.

### 4.1. Items are silent

`resolveItem` in `src/game/combat.ts` only logs; it is never passed `emit` (`src/game/combat.ts:1061-1062`). Potions, cures, and revives resolve correctly (HP/status/inventory are updated) but produce no animation or popup. The `revived` case in `src/engine/combat-scene.ts` is unreachable from an item.

**Evidence:** `.tmp-audit/item-verification.test.ts` fails — `resolvePlayerTurn` for a healing potion returns `events: [null, null]`.

### 4.2. Boss silence is silent

`headmasters-echo` has a `silenceRandom` special. `decideEnemyAction` returns a `kind: "silence"` action, but `resolveEnemyAction` immediately returns without emitting an event (`src/game/combat.ts:1605-1612`). The `case "silence"` handler in `src/engine/combat-scene.ts:739-745` is dead code. The player only sees a `Silenced!` flash when trying to cast later.

**Evidence:** `.tmp-audit/boss-verification.test.ts` fails — no `type: "silence"` events are produced.

### 4.3. Summoned-ally death is broken

`findActor` in `src/engine/combat-scene.ts` searches `party`, `enemies`, `enemyCorpses`, and `summonedAllies`, but **not** `allyCorpses`. When a summoned ally dies, the `defeated` step cannot find it, defaults to `kind: "party"`, and writes the death/fade animation to the wrong map. The ally corpse still draws from `allyCorpses` with a fresh `ally` animation, and `updateScene` keeps it forever because the opacity never reaches 0.

**Evidence:** `.tmp-audit/seams-verification.test.ts` — `findActor` returns `null` for a dead summon and `allyCorpses` still has length 1 after a full death animation.

### 4.4. `Bacortu` and `dispelMagic` are invisible

`applySpell` for `fizzleField` and `dispelMagic` emits a `spellEffect` with **no `targetId`** (`src/game/combat.ts:1496-1520`). `playTurn` skips `spellEffect` events with no target (`src/engine/combat-scene.ts:633-634`), so no burst or popup appears.

Additionally, `Bacortu` always targets the front row: `combat-ui.ts:448-455` resolves `groupEnemies` spells without setting `action.targetRow`, and `applySpell` defaults to `front` (`src/game/combat.ts:1498-1499`).

**Evidence:** `.tmp-audit/seams-verification.test.ts` — the per-turn API supports `targetRow: "back"`, but the default (no `targetRow`) only raises the front-row field.

### 4.5. Simultaneous wipe is recorded as victory

`checkTermination` in `src/game/combat.ts` checks enemies before party (`src/game/combat.ts:1858-1878`). If the last enemy and the last party member both die on the same end-of-round tick, the result is `victory`.

**Evidence:** `.tmp-audit/seams-verification.test.ts` — `endRound` with a poisoned party and enemy both at 1 HP returns `result: "victory"` instead of `"wipe"`.

### 4.6. Summons cast mid-round do not act in the same round

`beginRound` snapshots the current `summonedAllies` into the queue. `applySpell` for `summon` adds a new ally to `state.summonedAllies`, but `combat-ui.ts` does not rebuild or splice the queue. A freshly summoned ally appears on screen but will not take a turn until the next round.

**Evidence:** `.tmp-audit/seams-verification.test.ts` — a `Bamordi` cast by the first actor adds an ally to the state, but the ally's id is not in the `beginRound` queue.

### 4.7. Other state-machine notes

- **Flee during a round:** `resolvePlayerTurn` for `flee` succeeds once and ends combat; a failed flee converts to `defend`. The per-turn UI allows every player to try `Run`, unlike the round-based resolver where only one flee attempt exists. This is a design inconsistency, not a race.
- **Result window vs playback:** no race. `showResult` is only called after `isPlaybackDone` is true.
- **KO'd actors before their turn:** handled correctly. `beginRound` excludes dead actors and `nextTurn` skips any that died while the queue was being walked.
- **Stale banner:** `resolveAndPlay` does not clear `scene.banner`, so a previous spell name can linger until its `bannerUntil` expires.

---

## 5. Game-feel and audio gaps

The feel layer is the largest gap between the current implementation and a satisfying FF6-style combat system. The detailed analysis is in `.tmp-audit/feel-gaps.md`; the headline issues are below.

### 5.1. Missing or generic feedback

- **No screen shake, hit-stop, or differentiated flash.** `impactSteps` pushes a uniform 200ms white overlay; big hits and crits look the same as normal hits.
- **Critical hits are not communicated.** `resolveAttack` / `resolveAmbush` double damage on a critical but only log. `DamagePopup.big` is declared but never set.
- **All spells use the same blue burst.** `DamageElement` is defined in `src/data/spells.ts` but ignored; `COLORS.spellBurst` is the only color. Fire, ice, sleep, buff, and group spells all look identical.
- **Victory / defeat / escape is a static text box.** No fanfare, no victory pose, no screen flash.

### 5.2. No combat audio

`src/engine/audio.ts` exposes only dungeon drone, footstep, and door sounds. `main.ts` does not call any audio method on combat start/end. There is no battle music, no hit SFX, no spell SFX, no victory fanfare.

### 5.3. No persistent status information

The party and enemy windows show name, HP/SP, and HP bar only. Sleep/poison/silence/defend appear only as transient popups. The player cannot see who is statused while planning the next action. `enemyHealthDescriptor` is also dropped, removing Wizardry-style health information from the enemy list.

### 5.4. Targeting ambiguity

`openTargetSelect` in `combat-ui.ts` builds menu rows from `e.name` only. Two `Slime`s appear as identical labels; the player must rely on the scene cursor. There are no shortcut hints shown in the menu.

### 5.5. Pacing and presentation

- The attack animation is fixed (approach 260ms / attack 560ms / return 260ms) for every weapon.
- There is no round indicator.
- There is one combat background for all floors.
- The canvas layout is hand-tuned for 768×672 and can clip on mobile or with 4+ enemies.

---

## 6. Prioritized roadmap

### 6.1. Quick wins (1–2 days)

| # | Fix | Why it matters |
|---|-----|----------------|
| 1 | Remove `main.ts:101` TEMP floor-4 start (`FLOORS[3]`) | New games currently start on floor 4, making floor 1 and the boss unreachable. |
| 2 | Pass `emit` into `resolveItem` and emit `spellEffect`/`revived` | Item use currently looks like it does nothing. |
| 3 | Emit `silence` `CombatEvent` for `silenceRandom` | The boss's core mechanic is invisible. |
| 4 | Fix `findActor` to search `allyCorpses` and route ally death to `allyAnims` | Dead summon orbs persist on screen. |
| 5 | Add `crit`/`big` flag to `attack`/`ambush` and use `DamagePopup.big` | Crits are indistinguishable from normal hits. |
| 6 | Add a round indicator | Long fights feel endless. |
| 7 | Show keyboard shortcuts in the menu | Shortcuts are undocumented. |
| 8 | Tighten default animation timings slightly | A 3-enemy encounter can drag. |
| 9 | Restore `enemyHealthDescriptor` | Wizardry-style planning information is missing. |

### 6.2. Systems work (1–2 weeks)

| # | Fix | Why it matters |
|---|-----|----------------|
| 1 | Add combat audio — battle/boss music, SFX, victory fanfare | Combat is currently silent; this is the biggest emotional upgrade. |
| 2 | Persistent status icons in party/enemy windows | Players cannot plan around statuses they cannot see. |
| 3 | Spell effect library — per-element colors, sprite names, area/row effects | All spells look like the same blue ring. |
| 4 | Boss fight verification and tuning | Silence is broken and the boss is unreachable. |
| 5 | Fix `fizzleField`/`dispelMagic` visuals and `Bacortu` row targeting | These spells are invisible or always target the wrong row. |
| 6 | Screen shake, hit-stop, and big-hit flash | Adds the missing "weight" to impacts. |
| 7 | Make the combat canvas responsive | Mobile clipping and layout issues. |

### 6.3. Stretch goals (2+ weeks)

| # | Fix | Why it matters |
|---|-----|----------------|
| 1 | Optional true ATB mode | Adds FF6-style tension while keeping the current hybrid. |
| 2 | Unique battle backgrounds per floor | Visual variety across the dungeon. |
| 3 | Full-screen / full-area spell effects for summons and group spells | Makes magic feel dramatic. |
| 4 | Combat regression harness with Playwright screenshot diff | Catch silent events and visual regressions in CI. |

---

## 7. Verification notes

- `npm run build` passed before this report.
- `npm test` passed.
- The targeted `.tmp-audit` tests confirmed 5 separate failing seams: item events, boss silence, ally death fade, simultaneous wipe, and mid-round summon queueing.
- The Playwright driver confirmed the happy path works for attack, spell, Run, victory, and escape.
- No source files were modified during the audit; only temporary `.tmp-audit` files and this report were created.

---

## 8. Bottom line

The combat revamp is a solid foundation, but it is still in a "proof of presentation" state. The resolver is correct enough for the happy path, but several event-emitting seams are broken. The feel layer is minimal. The highest-value next steps are:

1. Fix the broken/missing event emitters (items, silence, crits, ally death).
2. Add combat audio.
3. Add persistent status icons and enemy health descriptors.
4. Differentiate spell visuals and fix `Bacortu` targeting.
5. Remove the floor-4 TEMP start and verify the boss.

After those, the system will be both mechanically sound and emotionally satisfying.
