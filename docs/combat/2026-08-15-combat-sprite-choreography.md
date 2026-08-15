# Combat sprite choreography overhaul

## Before

The combat event boundary and renderer split were already sound on the clean
baseline. `combat-choreography.ts` owned a shared DOM-free timeline and both
Canvas and Phaser painted that state. The weakness was the motion vocabulary:
ordinary close attacks used the same small symbolic approach for every actor,
then spent roughly two seconds in attack/return timing. The attack effects and
damage were readable, but the bodies often looked like icons beside an effect
rather than actors performing the action. Ranged attacks and spells had useful
effects but little corresponding body preparation or release motion.

The baseline audit is recorded in
[`2026-08-15-combat-sprite-choreography-audit.md`](2026-08-15-combat-sprite-choreography-audit.md).
No combat resolver, damage formula, target rule, initiative rule, AI rule,
encounter, stat, or Formation Chemistry file was changed in this pass.

## Architecture

`src/engine/combat-motion.ts` is a small presentation-only vocabulary. It
contains:

- explicit actor motion styles (`humanoid-light`, `humanoid`,
  `humanoid-heavy`, `beast`, `flying`, `ooze`, `construct`, `caster`,
  `ghost`, and `stationary`);
- light/normal/heavy/ranged motion profiles;
- bounded target-aware approach geometry;
- contact timing and deterministic visual variation/screen shake.

Motion style is selected from explicit party-class and enemy-id presentation
metadata. It is not exposed to combat rules and does not infer compatibility,
damage, taxonomy, or targeting behavior. Unknown future enemies fall back to a
plain humanoid presentation rather than gaining a gameplay meaning.

`combat-choreography.ts` remains the sole timeline builder. A normal physical
turn is composed from reusable steps:

1. anticipation/coil;
2. bounded approach toward the committed visual target;
3. attack pose and contact beat;
4. target reaction, popup, and impact effects;
5. return to the canonical slot;
6. a short settle beat.

Multi-hit sequences approach once, perform compact repeated strikes, and return
once. Misses retain the physical attempt but omit hit reaction and impact. The
existing bespoke Pack Leap choreography remains intact.

The return step snaps all four move fields to zero at its boundary. The
cosmetic playback-skip path also fires that canonical snap, so a battle ending
or renderer transition cannot leave a stale lunge offset behind.

## Timing profiles

These are presentation timings, not combat delays or balance values. The
duration column includes the current 100ms settle tail; the physical phase is
shown separately so the shortness of the actual motion is clear.

| Profile | Anticipation | Approach | Strike | Return | Physical phase | Typical total |
|---|---:|---:|---:|---:|---:|---:|
| light | 55ms | 135ms | 300ms | 135ms | 570ms | 670ms |
| normal | 55ms | 165ms | 350ms | 155ms | 670ms | 770ms |
| heavy | 85ms | 190ms | 400ms | 175ms | 765ms | 865ms |
| ranged | 95ms | — | 300ms | 105ms | 500ms | 600ms |

Criticals add a short approach/strike/return emphasis and a stronger impact
hold/reaction without turning into a multi-second spectacle. Cast durations
remain tied to the existing spell-effect choreography; the caster now braces,
lifts at release, and settles while the established effect plays. This keeps
the pass presentation-only, but means spell timing remains the main follow-up
area for a later animation polish pass.

The target-aware travel is a fraction of the actor-to-target gap and is capped
by actor scale and stage bounds. Heavy bodies travel farther than light bodies,
but no actor is sent all the way through the target. Oozes receive a lift/hop
offset, beasts a lower pounce read, flying/ghost actors a vertical float, and
construct/heavy actors a restrained surge.

## Actor styles

Playable classes use the following presentation profiles:

| Class | Style | Intended read |
|---|---|---|
| Fighter | humanoid | confident ordinary lunge |
| Mage | caster | restrained body movement with a clear spell release |
| Priest | caster | controlled cast/heal preparation |
| Thief | humanoid-light | short, quick strike and recovery |
| Halberdier | humanoid-heavy | longer committed polearm surge |
| Duelist | humanoid | normal physical profile |
| Crusader | humanoid-heavy | deliberate heavy profile |

Enemy presentation overrides cover the active visual families: humanoids,
heavy humanoids, skeletons, beasts/hounds, flying bodies, oozes, constructs,
casters, ghosts/wraiths, and stationary fallbacks. The complete baseline asset
inventory and the generated JSON report list every inspected identity and its
available strips.

## Reactions and synchronization

Impact events are scheduled at the profile contact beat, after the approach and
attack pose have started. Damage popups, target hurt state, impact effects,
critical emphasis, and deterministic screen shake therefore share one visual
moment. Normal, heavy, and critical impacts use progressively stronger target
recoil/hold values. Misses show the attempt and whiff without a hit flash.

Ranged attacks stay in place, use the release beat to launch the projectile,
and recover without melee travel. Generic casting now has a small preparation,
release lift, and settle. Healing keeps the existing recipient effect/popup and
receives the same caster release timing rather than pretending to be a melee
hit.

Death remains impact → hurt/death strip → fade. Existing target removal and
corpse absorption behavior was preserved. The new tests cover target death,
multi-hit scheduling, skip/interruption cleanup, and exact neutral return.

## Paint order and backend parity

Canvas continues to sort actors with `paintOrderFootY` using the live move
offset, not the home slot. Phaser continues to set sprite depth from that same
live offset. This preserves the Pack Leap regression fix and makes a normal
lunge cross rows without a static z-order inversion.

Both backends consume the same `CombatScene`, `ActorAnim`, step timestamps,
frame-rate scales, impact state, popup state, and deterministic shake helper.
Canvas and Phaser differ only in painting and asset plumbing. The preview
sandbox renders the same production stage through either backend; it does not
contain a second fake motion implementation.

## Integration contract

The shared timeline now exposes stable presentation landmarks through existing
choreography steps and event state:

- anticipation/approach start;
- attack or cast release;
- contact/impact;
- reaction;
- return/settle.

Formation Chemistry can later compose partner/resource movement and target
reactions from these primitives without adding renderer-specific mechanics.
SFX and bark systems can attach to those landmarks without depending on sprite
asset names. This branch does not add Chemistry abilities, bark UI, or audio.

## Preview sandbox

The real-stage preview is built as `combat-choreography-preview.html` and is
available from the Vite preview server at:

```text
http://127.0.0.1:5180/OnyxLabyrinth/combat-choreography-preview.html
```

It supports the representative presets, Canvas/Phaser selection, normal/
critical/miss/ranged/cast/heal actions, 0.25×/0.5×/1×/2× speed, timeline seek,
repeat, and optional Canvas motion guides. It loads the real party/enemy
strips and the production choreography engine.

Manually inspected preview cases included Fighter normal/contact, critical,
miss, Thief/light, Skeleton attack, Minotaur/heavy, Slime/ooze, Archer/ranged
release, Mage cast, Priest heal, Hellbat/flying, Golem/construct, and the same
contact sequence in Phaser. Production Arena combat was also viewed in Phaser
and Canvas rollback mode; the browser smoke and freeze checks reported no new
page errors or frozen render loop.

## Asset limitations

The audit found complete required idle/attack/hurt/death strips for all 47
enemy/summon directories and required idle/walk/attack/hurt/death strips for
all seven playable classes. Optional party `cast` strips exist for Mage and
Priest; the optional `attack_ranged` strips are absent for every party class,
and most party classes also lack cast strips. The renderer therefore uses the
documented safe attack/cast fallback rather than claiming missing art exists.

No sprite art was redrawn. Oozes and flying/ghost bodies gain motion offsets,
not a fabricated animation taxonomy. Afterimages remain disabled because the
existing trail read as a double-image artifact at the new short travel
distances. That is a presentation choice, not a mechanics change.

## Verification

Focused motion, scene, impact, and renderer tests pass, including:

- bounded finite target-aware travel;
- contact beat synchronization;
- ranged no-travel behavior;
- critical/miss distinction;
- one approach/return for multi-hit;
- 100 repeated attacks with zero offset drift;
- interrupted playback snap-to-neutral;
- target/death and Pack Leap choreography;
- live paint-order regression coverage;
- Canvas/Phaser shared-state timing.

The final exact-tree commands and their results are recorded in the handoff
report. The only build notices retained from the baseline are the unresolved
font reference and the large Phaser chunk warning; neither introduced a new
runtime error.

## Known limitations and follow-up

- Spell/heal effects still have the existing longer effect timelines. The body
  now performs a prepare/release/settle, but a later pass could audit the full
  magic timing budget separately.
- The sprite strips are compact pixel art, so some “attack frame” differences
  are necessarily supported by timing and movement rather than new art.
- Repeated-exposure fatigue is best judged by a human watching a long ordinary
  combat session. Automated drift, duration, and freeze tests do not replace
  that subjective check.
- The preview is a developer tool and is not exposed in the production combat
  UI.

