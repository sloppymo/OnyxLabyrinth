# Follow-up — harvest combat-only pass (2026-07-28)

Pass this to an implementer with repo access. Source report:
[`playtests/2026-07-28-combat-only-pass.md`](playtests/2026-07-28-combat-only-pass.md).
Evidence folder (gitignored): `playtest-screenshots/2026-07-28-combat-pass/`.

**Do not** redo dungeon/town/lore. Combat presentation/UX/audio only unless a feel
problem *requires* a tiny rules touch (prefer presentation first). Read `AGENTS.md`
before editing combat scene / audio / select-action UI.

## Already done (skip)

- **Rec #4 — audio readiness on jump/boot:** `ensureAudioResumed(page)` in
  `scripts/playtests/lib.mjs`, wired into `jumpTo` / `boot`, and the combat-pass
  script’s `freshBoot`. Isolated boss repro went 3/3 `bufferMissing` → 0/3.
  Commit `2d749e3`. Do **not** wire visual-pass hand-rolled boots unless they
  start asserting audio.

## Implement next (priority order)

### 1. Differentiate technique / low-tier magic impact VFX
**Problem:** At L6, Ember and techniques both read as “small puff + damage number”;
only the banner says what happened (`wave2-03-spell-vfx-1-f4.png` vs
`wave3-03-technique-vfx-f3.png`).

**Do:** Give techniques and low-tier elemental casts distinct impact (and preferably
travel) language — reuse existing strips from `effect-sprite-cache` /
unused-VFX plan where possible. Do not change damage math.

**Verify:** Arena L6 Magic wave + Technique wave; burst-capture mid-impact; screenshots
side-by-side must be distinguishable without reading the banner.

### 2. Grey out unusable palette slots
**Problem:** “No magic!” / empty Item still require a keypress then flash-reject.

**Do:** In the FF6 action palette, disable/grey Magic when the actor has no castable
spells, Item when inventory is empty (and any parallel “No techniques!” case if the
palette exposes Tech the same way). Keep keyboard shortcuts from hard-locking; reject
can stay as a safety net.

**Verify:** Fighter with no spells — Magic slot looks unavailable before press.
Empty inventory — Item slot greyed. Casters with spells — Magic stays live.

### 3. Fix `ui:confirm` bufferMissing
**Problem:** Across a full warm Arena session, `ui:confirm` still reported
`bufferMissing: true` while combat SFX loaded fine.

**Do:** Trace `UI_SFX_FILES` / load path / id mismatch / silent decode failure.
Either make the cue play or make readiness/`sounds()` report the real failure
honestly (same spirit as the earlier sample-SFX honesty work).

**Verify:** After a normal title→Arena path, `__onyxDebug.sounds()` shows
`ui:confirm` with `bufferMissing: false` (or readiness lists a real failed id).

### 4. Swirl-in identity (first ~500ms)
**Problem:** `01-arena-swirl-in-f2.png` reads as fade-through-black with a faint
ribbon, not a combat “swirl.”

**Do:** Strengthen early frames of `battle-transition` (or equivalent) so the
commitment-to-fight moment is readable without lengthening the whole transition
much. Taste call: more ribbon/contrast/motion, not a longer black hold.

**Verify:** Burst-capture swirl-in; mid frames must show clear swirl structure,
not a near-solid black plate.

## Optional / park

- **Control-spell presentation** — untested in the pass; sample once after Mag/Tech
  VFX work if cheap.
- **Thief `attack_ranged`** — untested because Arena default has no long weapon;
  smoke with a bow if you touch thief anims.
- **`combat:bossPhase` on non-boss waves** — curiosity; confirm intentional elite
  reuse before “fixing.”
- **5+ enemy overlap** — size shrink already shipped (`ENEMY_SIZE` 300 / `BOSS_SIZE`
  400); only revisit if still bad after a visual check on current Pages.
- **Arena L6 soft** — thin sample; don’t retune balance from this pass alone.

## Out of scope

- Unique boss sprites, HDMA EarthBound warps, dungeon teaching, narrative century copy,
  prologue music wiring (separate track).

## Done when

- Recs 1–3 and swirl (#4 in this brief / #5 in the report) verified in a running
  build with screenshots or a short playtest note.
- Report harvest table updated (`Done` / still `Open`).
- Suggested commit message(s) ready; commit only if the user asks.

## Suggested commit shape (when implementing)

```
fix(combat): distinct Mag/Tech VFX, grey unused palette, swirl punch

Address combat-only pass Top 5 leftovers: impact language for Mag/Tech,
disabled palette slots, ui:confirm buffer, and early swirl-in identity.
```

(Split commits if the audio fix wants its own `fix(audio):` hash.)
