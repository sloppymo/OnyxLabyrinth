# Combat Dialog Barks — Design Spec v1.1 (approved)

**Date:** 2026-07-26  
**Status:** **Approved to implement** (post-review amendments below; no v1.2
round unless starter lines must shrink)  
**File:** `docs/superpowers/specs/2026-07-26-combat-dialog-barks.md`  
**Context:** Presentation polish for FF6 combat. Builds on existing damage-popup
bounce in `combat-scene.ts` (`popupOffsetY` / `pushPopup` / `drawPopups`).  
**Related:** `docs/COMBAT-ENGAGEMENT-AUDIT.md` (presentation, not engagement);
prologue/ending black-field narration is a separate system — barks are
in-combat, above-sprite, short.

**Hard constraint:** barks are presentation only. They must not alter combat
math, initiative, damage, AI, or any seeded combat RNG stream
(`AGENTS.md` hard rule #1).

---

## 1. Problem

Combat already communicates outcomes with numbers (`7`, `MISS`, `WEAK!`) and
animations, but actors never *speak*. Flavor and character land only in
dungeon NPCs and the prologue/ending. A light bark layer — short lines that
pop above a sprite on real combat events — would make casts, big hits, and
deaths feel authored without adding menus, banners, or log scraping.

Damage popups already do the motion we want (rise → overshoot → settle →
fade). They are the wrong *channel*: mixing “Burn, fiend!” with `42` fights
for the same pixels and muddies the damage-readability contract.

## 2. Goal

Small **dialog barks**: short strings that appear above an actor’s sprite,
pop up, fall back, bounce once, then fade — Unreal/Source-style floating
dialog energy, FF6 presentation.

**Tone / shipping examples:**

| Moment | Line |
|--------|------|
| Before a fire spell | “Burn, fiend!” |
| Taking a very hard hit | “Gyaaah!” / “Nnngh!” |
| On death / KO | “Let this be the last time.” (26 chars) |

Same spare voice as the myth text; shorter; combat-diegetic.

## 3. Approach: sibling bark channel (not damage popups)

**Do not** overload `DamagePopup`. Add a parallel list on `CombatScene`:

```ts
interface CombatBark {
  text: string;
  /** Actor this bark follows — position resolved each frame (§3.1). */
  actorId: string;
  start: number;
  color: string;
  priority: number;
}
```

- **Motion:** reuse `popupOffsetY` shape (or shared helper). Base duration
  **~1800–2000 ms** at `playbackRate === 1` (see §6.2).
- **Anchor:** actor **head / top** via `artTopFromTop` / top-marker locus —
  above the sprite and above damage numbers.
- **Draw:** FF36 ~18–20 px, dark outline, cream/amber fill. No bubble chrome.
- **Z-order (locked):** draw **barks last** (after actors, effects, damage
  popups).

### 3.1 Live position (locked)

Damage popups may keep a frozen `(x, y)` from the impact instant. Barks
**must not**. A `beforeSpell` bark fires while the caster walks forward in
FF6 choreography — a frozen point leaves the text behind the speaker.

**Store `actorId` only; resolve screen position every frame** in `drawBarks`
via the same `findActor` / head anchor used for markers. If the actor is
gone (corpse fade finished), expire the bark immediately.

### 3.2 Width policy (locked — resolves clamp vs char-cap contradiction)

Estimated FF36 widths at ~19px (proportional ~0.6em; confirm in Arena with
the real face during implement):

| Line | Chars | ~width |
|------|------:|-------:|
| Burn, fiend! | 12 | ~137 px |
| Gyaaah! | 7 | ~80 px |
| Nnngh! | 6 | ~68 px |
| Let this be the last time. | 26 | ~296 px |

A **~160 px** clamp would ellipsize the shipping death line and most near-cap
content. That is wrong.

**Policy:**

1. **Char cap ≤28** stays as the data-authoring guard (unit-tested).
2. **Accept that a bark may span wider than one enemy slot.** Head-anchored
   overlap with neighbors is mostly harmless.
3. **Scene safety clamp only for pathological strings** — hard max **~340 px**
   (death line + margin). Above that: do not push / drop the bark (no
   ellipsis of authored content). Re-measure the four starter lines with
   real `ctx.measureText("…", FF36)` in a one-off or scene test and adjust
   the constant if the estimate is off by >10%; **do not** silently
   truncate §8 lines.

If measurement ever forces the death line under a tighter visual budget,
rewrite §8 lines and re-approve that copy only — not the whole system.

## 4. Triggers (v1)

Event-fired only. No idle / menu chatter.

| Id | When | Who speaks | Example |
|----|------|------------|---------|
| `beforeSpell` | With / just before spell banner | **Caster** | “Burn, fiend!” |
| `heavyHit` | Single hit ≥35% target `maxHp` (not DoT) | **Party target only** | “Gyaaah!” |
| `death` | HP → 0 from resolve | **Dying actor** | “Let this be the last time.” |

Enemies are **not mute**: they get **`death`** lines. Deferred: enemy
**ability-specific** shouts; enemy **`heavyHit`** grunts (trash chorus).

### 4.1 `beforeSpell`

- Schedule with the spell banner path.
- Filters: `spellId` / `element` / caster `classIds` / `enemyIds`.
- Utility spells + Analyze: silent unless authored later.
- v1 authored casts are party-side.

### 4.2 `heavyHit`

- `damage >= ceil(maxHp * 0.35)`; misses/heals/status/DoT: no.
- **Party characters only** in v1.
- Lethal heavy hit → emit **`death` only** (§6.1).

### 4.3 `death`

- Party KO and enemy death both eligible.
- Summons: **no dedicated speaker filter in v1** (see §5 — `summonIds`
  dropped). Summon death is silent unless a future filter maps to a real
  stable id (`spriteId` is optional and sparse today).
- Boss: ship ≥1 Crying Man death line in the starter pack.

## 5. Data model

`src/data/combat-barks.ts` + pure `pickBark` helper (same module or
`src/game/combat-barks.ts` — keep DOM out of `game/`).

```ts
export type BarkTrigger = "beforeSpell" | "heavyHit" | "death";

export const BARK_PRIORITY: Record<BarkTrigger, number> = {
  death: 3,
  heavyHit: 2,
  beforeSpell: 1,
};

export interface BarkLineDef {
  trigger: BarkTrigger;
  speaker?: {
    classIds?: string[];   // CharacterClass
    enemyIds?: string[];   // EnemyDef.id
    // No summonIds in v1 — SummonedAlly.id is instance-only (summon-N);
    // spriteId is optional and not a reliable species key.
  };
  spell?: { spellIds?: string[]; elements?: string[] };
  lines: string[];
  weight?: number;
}
```

### 5.1 Once-per-(actor, trigger) ledger

On **transient** `CombatState` only (never `GameState`, never `save.ts`):

```ts
barkSaid: Record<string, Partial<Record<BarkTrigger, true>>>;
```

Initialized in `createCombatState`; dies with the combat session.

**Ledger vs scene drop (locked — accept the loss):**

`barkSaid` is marked in `game/` when `pickBark` succeeds and the event is
emitted. The 2-per-window cap and replace/drop run later in the **engine**
`pushBark`. The engine must **not** write back into combat state to un-burn
a dropped line (preserves `game/` → no engine dependency).

Therefore: **a dropped / replaced-away bark still consumes the ledger
entry.** Documented and tested: “my death bark never showed” is an expected
failure mode only when the global window already held two higher-or-equal
priority barks *and* death were somehow not exempt — mitigated by §6.3
making **death exempt from the global cap**. For non-death: accept and
test that a `heavyHit` emitted then dropped by the window still leaves
`barkSaid[id].heavyHit === true` (no second chance that fight).

### 5.2 Line rules

- ≤ **28 characters** (data unit test).
- Shipping death line: **“Let this be the last time.”**
- No newlines; no `{name}` tokens.

## 6. Caps, priority, playback, mute

| Rule | Value |
|------|--------|
| Max one live bark per actor | Yes (§6.1) |
| Global window (~100 ms) | Keep up to **2 highest-priority** requests; **`death` exempt** (§6.3) |
| `(actorId, trigger)` once per combat | Yes — ledger §5.1 |
| Damage + bark same frame | Both; delay bark **+180 ms** after impact |
| Party Auto / Repeat / Arena | Barks fire |

### 6.1 Replace vs drop (locked)

Priority: **`death` (3) > `heavyHit` (2) > `beforeSpell` (1)**.

Per actor, if a live bark exists:

- Higher priority → **replace** (reset `start`, new text).
- Equal or lower → **drop** the new request.

Same-resolve lethal hit: emit `death` only.

### 6.2 Playback speed and skip (locked)

- Duration scales with `playbackRate` (same clock family as choreography —
  no third clock).
- **Skip clears `scene.barks` immediately** (stale-bark fix).
- Window cap handles skip *bursts*; clear handles *leftovers*.

### 6.3 Global window — priority-aware + death exempt (locked)

On a burst of bark events in ~100 ms:

1. **`death` barks always push** (exempt from the “max 2” limit). Still
   one-per-actor via §6.1.
2. Non-death requests in the window: keep the **two highest priority**;
   drop the rest (not FIFO). Ties: keep earliest emit order among equals.

A six-death wipe can show multiple death lines (one per actor); that is
intentional payoff.

### 6.4 Mute (honest v1 — no settings bag)

There is **no** player settings system in the repo today. Do **not** invent
persist settings for this feature.

v1 mute:

- Module constant `BARKS_ENABLED = true` in the bark/scene module.
- `?debug=1` exposes `__onyxDebug.setBarksEnabled(boolean)` (or a field on
  the debug object) to toggle for playtests — no-op draw/push when false.

A real settings checkbox is a later product pass.

## 7. Combat events, RNG, log

```ts
| { type: "bark"; actorId: string; trigger: BarkTrigger; text: string }
```

### 7.1 RNG isolation (blocking)

- **`pickBark` must not touch combat RNG** (hit/crit/damage/encounter).
- **Do not** store a generator on `CombatState` (JSON / `structuredClone` /
  debug snapshot hazard).
- Use a **module-level** bark RNG in the bark module, **or** store only a
  numeric `barkSeed` on `CombatState` and keep the PRNG pure/stateless per
  call. Prefer module-level + re-seed at combat start.
- **Seed:** not a constant (that freezes line order every fight). Seed from
  a monotonic **combat counter** (e.g. increment a module `barkCombatSerial`
  each `createCombatState`) or `Date.now()` at combat start — still fully
  isolated from combat math.
- **Required test:** deterministic combat (stubbed combat RNG / fixed
  actions) with bark table empty vs populated → **identical** HP/SP/status/
  damage events / non-bark outcomes. `bark` events may differ.

### 7.2 Log vs display (locked)

Emit a log string for 1:1 debug history **and** the `bark` event.

The persistent combat message window uses `recentLog: log.slice(-10)`
(`combat-ui.ts`). Untagged bark lines would **evict** damage/status lines
players use to reconstruct a turn.

**Lock:** tag bark log entries so the **display filters them out** while
the full `log` / `events` history keeps them for `__onyxDebug`.

Practical shape (pick one in implement; prefer the event-parallel filter):

- When building `recentLog` for the FF6 window, **skip indices whose
  parallel `events[i]?.type === "bark"`** (events are already 1:1 with log
  today), **or**
- Introduce a small log-entry kind if the parallel array is ever broken.

Do **not** show `Aria: "Burn, fiend!"` in the on-screen combat log strip.
Do keep it in `state.log` / event dump for debug.

**Test migration:** update any `combat.test.ts` asserts on log length /
fixed indices in the same PR.

### 7.3 Scene summary

- `pushBark` respects §6; mute §6.4.
- Per-frame actorId anchor §3.1.
- Pathological width guard §3.2 (~340 px).
- Draw last; skip clears; playback scales.

## 8. Starter pack (v1)

| Speaker | Trigger | Lines |
|---------|---------|-------|
| Mage | `beforeSpell` + fire | “Burn, fiend!” |
| Party | `heavyHit` | “Gyaaah!” / “Nnngh!” |
| Party | `death` | “Let this be the last time.” |
| The Crying Man | `death` | ≤28 myth-toned line (author at implement) |

## 9. Non-goals

- Idle chatter; bubbles; localization; name tokens.
- Bark-driven gameplay.
- Spell-banner text merge; DOM overlays; save persistence.
- Enemy heavyHit chorus; enemy ability-specific shouts; `combatStart`.
- Full settings UI; summon species filter (until a stable id exists).

## 10. Testing (TDD)

**Land with `pickBark` (same commit as the helper — step 1 is not
independently green on isolation alone):**

- Line length ≤28 over shipping table.
- RNG isolation empty vs populated (§7.1).
- `pickBark` filters, weights, ledger burn.
- Ledger burn even when a later scene drop would have applied (unit-level:
  mark said on emit; separate scene test that window drop does not clear
  `barkSaid`).
- `death` exempt from global cap; non-death window keeps top-2 by priority.
- Replace/drop per §6.1.
- Heavy-hit party-only; DoT silent; utility silent.
- Scene: live actorId follow during walk; skip clears; playbackRate;
  debug mute; width guard with oversized stub.
- Display: bark events excluded from `recentLog` window helper.
- Eyeball: rightmost party bark vs blue windows; **killing-blow death bark
  vs victory/mode fade** in Arena (if the line is invisible, add a short
  hold before transition — only if confirmed necessary).

## 11. Doc updates (implementation delivery)

- `docs/AGENT-READING-LIST.md` — this spec.
- `AGENTS.md` combat checklist one-liner.

## 12. Closed decisions

| # | Decision |
|---|----------|
| 1 | Defer `combatStart`. |
| 2 | No crit-only gating for heavyHit. |
| 3 | Enemy **ability-specific** barks deferred; enemies still speak on **death**. |

---

## Implementation order (revised)

1. Data table + `pickBark` + module bark RNG + `barkSaid` on `CombatState` +
   line-length test + **RNG isolation test** (needs `pickBark` — same step).
2. Emit `bark` events + tagged log; update brittle log asserts; display
   filter for recentLog.
3. Scene channel: live anchor, push/replace/drop, priority window + death
   exempt, playback/skip, mute, z-order, width guard.
4. Choreography hooks (`beforeSpell` / heavy / death) + starter lines.
5. Arena eyeballs: party-vs-window; death-bark-vs-victory fade.
