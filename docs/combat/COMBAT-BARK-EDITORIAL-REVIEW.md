# Combat Bark Editorial Review

Date: 2026-08-15  
Review mode: real combat stage, forced editorial mode, governed production mode

## Editorial verdict

**PASS WITH TUNING.**

The library has enough distinct material to make a controlled integration
prototype worthwhile, and the governor prevents the raw opportunity stream
from becoming constant chatter. The system is not ready to be treated as
finished dialogue content for every live encounter yet. The next pass should
be a short normal-speed review of actual Floor 1 compositions after Chemistry
events exist, with special attention to ordinary death/basic-attack exposure.

## What was actually watched

The preview was opened through the production Vite build and watched at normal
speed as well as slow speed. It used the same shared stage used by combat, not
a text-only selector test.

### Playable voices

All seven class profiles were forced and viewed:

- Fighter — direct, practical, and terse; the simple action vocabulary fits.
- Mage — the clearest contrast: irritated by melee, analytical on misses,
  and reluctant rather than generically heroic.
- Priest — dryly overworked; the healing-adjacent attitude comes through.
- Thief — opportunistic and impatient; the ability-specific lines are more
  revealing than the generic attack pool.
- Halberdier — the most mechanically specific voice, with reach and position
  vocabulary that matches its combat identity.
- Duelist — form-conscious and competitive without becoming a speechmaker.
- Crusader — restrained duty/religion language; it avoids sermonizing.

The strongest separation is Mage / Halberdier / Duelist. Fighter, Priest, and
Crusader share a few short neutral words (`Fine`, `There`, `Good`, `Ready`),
which is acceptable at low frequency but is the main side-by-side distinction
risk. The governor helps, but it does not make an interchangeable line
memorable.

### Vess

Vess reads as a guarded survivor rather than a generic eighth class. Lines such
as `I know how this goes.`, `Let's not lose anyone.`, and `Not losing another
chair.` make the relationship to the Party That Returned legible without
turning her into an exposition device. The preview needed an explicit
companion preset because her runtime identity is `fifth-chair`, not a party
class; that mapping is now covered by runtime tests.

### Enemies

The voice modes are doing useful work:

- Slime/ooze and beast profiles remain vocalization-first rather than speaking
  full sentences.
- Skeleton and other fragmentary undead use short, exhausted reactions.
- Caster, choir, and scripted humanoid families have enough language to
  establish role without every enemy becoming a narrator.
- Silent/rarely vocal enemies are allowed to remain quiet. This is a feature,
  not a coverage failure.

The Party That Returned profiles were watched against the PC voice intentions.
They read as exhausted reflections of familiar roles: recognizable enough to
feel wrong, without simply prefixing the class lines with villainy.

### Boss throughline

All three boss identities were forced and viewed. The preserved lines remain
exactly:

- `The ash settles.`
- `The page turns.`
- `The crying stops.`

The progression remains restrained and connected. The first lab pass exposed a
bad repeat of `More.` on the Dead Boy's second phase. That line, and the
corresponding phase lines, are now once-per-combat authored beats. Silence is
better than making the throughline sound like a phrase generator.

## Presentation findings

The bark appears as a short actor-anchored presentation event in the existing
combat surface. In the inspected Canvas and Phaser cases:

- the line tracks the live speaker rather than a home slot;
- attack/cast lines land at anticipation or release;
- reaction lines land with the hit reaction;
- death lines remain available before the corpse fade;
- the damage number remains readable in the inspected contact frame;
- forced and governed modes are visibly distinguishable through preview
  metadata, not through production UI clutter;
- no second speech-balloon layer or combat pause was introduced.

The real production Arena stage was also opened in Phaser. A normal attack
showed the actor movement, contact popup, and a short bark (`Ready.`) without a
new application error. Browser output contained only the expected software
WebGL fallback and GPU `ReadPixels` performance warnings in the headless
environment.

The preview has no duplicate speaker options after the final control fix.

## Repetition and generic-language review

The content audit still reports 852 lines, 63 profiles, zero missing profiles,
zero tone hits, and zero voice-mode violations. It reports 71 suspicious
duplicate patterns; those are useful editorial leads, not automatic rewrite
orders.

Runtime exposure confirms where those duplicates matter:

- basic attacks and deaths dominate selected events;
- Priest and Crusader basic attack pools recur most in the matrix;
- short enemy death noises recur by design and should not be expanded into
  prose;
- rare, ability-specific, and chemistry pools are not currently exposed often
  enough to justify bulk additions.

No broad line rewrite was made in this pass. The only evidence-backed content
behavior change was the once-per-combat boss-phase treatment. Rewriting every
`Fine`/`There`/`Ready` occurrence without seeing real Floor 1 cadence would be
premature. If ordinary fights still feel chatty after Chemistry integration,
the next edit should target the highest-exposure PC basic-attack pools rather
than adding more lines everywhere.

## Where silence is preferable

Silence is the correct result for:

- silent constructs and stationary identities without an authored exception;
- creature attacks that have already communicated through animation and sound;
- a second identical boss phase beat;
- low-priority ordinary opportunities while a death, chemistry, or other
  high-value event is visible;
- chemistry profiles before the chemistry event contract exists.

The governor's suppression telemetry makes those choices inspectable instead
of disguising them as missing content.

## Migration recommendation

Retain both bark systems for this prototype. The shipped MVP has proven timing,
legacy tests, and exact boss continuity; the new library provides the broader
content surface and event landmarks. The current bridge layers library content
without duplicating the legacy boss death lines.

After Formation Chemistry supplies stable event IDs and a renderer-level bark
acknowledgement exists, migrate the legacy entries into a unified selector in a
separate change. Do not delete or silently rewrite the MVP in the chemistry
merge.

## Remaining human questions

Automation cannot settle these completely:

1. whether roughly five to six bark events per short lab fight still feels
   selective when watched over a ten-fight Floor 1 traversal;
2. whether the two recurring PC basic-attack voices become irritating after
   the twentieth ordinary exposure;
3. whether silence during a second boss phase feels more powerful than an
   alternate line once the full boss choreography is present;
4. whether Chemistry telegraphs should displace ordinary flavor in the final
   combined event stream.

Those are deliberate follow-up playtest questions, not reasons to inflate the
library now.
