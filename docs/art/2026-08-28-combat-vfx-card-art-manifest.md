# OnyxLabyrinth Combat Art and VFX Manifest

**Date:** 2026-08-28
**Status:** production planning manifest; no runtime behavior is changed by this document
**Scope:** first campaign card-combat slice, Old Man + Rat King, Canvas and Phaser painters

## The visual target

OnyxLabyrinth should read as a hand-animated occult stage, not a stack of generic spell
sprites. The player should be able to glance at the battlefield and understand three things:

1. what the enemy intends to do;
2. which shared conditions are active;
3. why the last card mattered.

The art budget therefore goes first to **reusable state language**, then to **layered card
signatures**, then to optional spectacle. A card signature is normally an actor pose + one
projectile or burst + one state accent. It is not automatically a bespoke animation sheet.
This keeps the 24 current cards visually distinct without creating 24 unrelated effect systems.

## The apex quality bar

“Most impressive” does not mean the largest sprites, the most particles, or the brightest
screen. It means every frame has authored intent and every layer tells the same story. A
finished flagship effect must pass all of these tests:

### Nine-beat spell grammar

Every major spell owns a readable temporal arc:

```text
1. tell       — the caster commits and the player knows something is coming
2. gather     — energy collects in a specific shape or material
3. form       — the spell's silhouette becomes unmistakable
4. release    — the caster and effect break the held pose
5. travel     — the projectile has weight, path, and directional intent
6. contact    — the target receives a distinct material impact
7. reaction   — the target, status, intent, and floor respond together
8. settle     — the effect resolves into the new battlefield state
9. residue    — a tiny afterimage, ember, crack, or silence proves it happened
```

Small cards may compress this to three beats, but flagship effects must not skip the tell,
contact, or settle. The player should feel the difference between a spell forming, moving,
striking, and changing the rules of the fight.

### Layered, not noisy

Use a maximum of four authored visual layers per moment:

- actor pose or cast silhouette;
- one primary effect strip;
- one state/impact strip;
- one restrained floor light or particle accent.

Each layer must have a job. If removing a layer changes neither the meaning nor the timing,
it does not belong. Glow is an accent around a silhouette, never a replacement for one.

### Native-scale recognition

A flagship effect must pass the following blind tests:

- at native source scale, its silhouette is recognizable;
- at normal arena scale, the impact point is unambiguous;
- with the spell banner hidden, its family is still identifiable;
- with audio muted, the timing still reads;
- with the frame frozen at contact, the shape still tells the story;
- with colors desaturated, the motion and silhouette still work.

If an effect only looks impressive as a blurred full-screen glow, it has failed.

### Material-specific motion

Effects need a physical verb, not just a palette:

| Material | Motion verbs |
|---|---|
| Barrier | fold, brace, dent, craze, shed |
| Ash/silence | smother, swallow, mute, drift, collapse |
| Occult geometry | inscribe, align, bisect, invert, erase |
| Vermin | spill, swarm, dart, pile, scatter |
| Royal authority | point, bind, redirect, kneel, transfer |
| Fire | coil, flare, lick, burst, gutter |
| Ice | grow, lock, splinter, refract, melt |
| Lightning | seek, fork, snap, overload, ground |
| Water/wind | curl, pull, shear, spiral, dissipate |

The same material should move consistently across cards, enemies, and future bosses. A new
strip is not approved merely because it has a different color.

### Flagship effects versus utility effects

Not every card deserves a unique cinematic. The catalog has two deliberate tiers:

- **Flagship:** Barrier, Opened payoff, Crowned command, Omen trigger, Rat swarm, Old Man
  catastrophe, and boss signatures. These receive bespoke key poses, impact behavior, and
  aftermath.
- **Utility:** baseline attacks, small Barrier grants, ordinary misses, and repeated
  projectiles. These reuse the approved material library but still inherit its timing and
  palette rules.

The flagship tier is where we spend the extraordinary craft time. Utility effects should look
like they belong to the same game, not like they are competing for attention.

### Barrier is the first proof

The first approved masterpiece should be Barrier because it is both a recurring rule and a
visual promise. The proof sequence is:

```text
Old Man or Rat King commits
  -> shell folds from four hard-edged facets
  -> shell locks with a visible seam
  -> enemy intent strikes and dents the exact impact point
  -> crack propagates only when absorption is consumed
  -> final hit shatters the shell into large readable shards
  -> a quiet remnant fades while the new HP state remains clear
```

Barrier must feel like one object changing state, not four unrelated blue animations. The
same shell can be palette-accented for each hero, but its geometry and vocabulary remain
shared.

### Production discipline

The standard is “hand-authored result,” even when a generator supplies source material:

1. define the silhouette and animation verbs before generation;
2. generate or draw key poses, not a vague effect cloud;
3. clean chroma, alpha, palette, and page geometry;
4. redraw weak frames at native scale;
5. create a 1x/4x review sheet plus a timing strip;
6. test in Phaser and Canvas with the banner hidden;
7. reject effects that obscure intents, statuses, or card outcome;
8. keep the source, cleaned intermediate, final strip, and registry id traceable.

The renderer can add hit-stop, floor light, particles, and shake, but it cannot rescue a
weak silhouette. The art has to be excellent before the presentation stack amplifies it.

## What already exists

- All 24 current campaign card definitions have static 128x96 illustrations. The two
  bounded draft sources (`fight-dirty`, `improvised-theorem`) currently use generated
  pilot art that has been cropped and point-sampled to the same native aperture.
- Old Man and Rat King already have idle, walk, attack, ranged attack, cast, hurt, and death
  strips under `public/assets/card-trial/heroes/`.
- `public/assets/effects/` has a large generic elemental library and a working strip cache.
  `EFFECT_STRIPS` currently registers 110 effect ids: 109 combat strips plus the UI-only
  `fz_icons` atlas. These are existing presentation assets, not new P0 generation work.
- `combat-choreography.ts` already supports charge, projectile, burst, field, particles,
  screen shake, and both Canvas and Phaser painters.
- The Rat enemy currently has only an idle strip; a complete summon bundle is still a gap.
- Current Card Trial presentation still uses the legacy `Guard` name and `px_shield`; Barrier
  is the target replacement, not an already-wired runtime asset.

Do not spend the first art sprint redrawing every existing fire, ice, or lightning strip.
The high-value gap is the card-combat vocabulary below.

## Current runtime animation inventory — do not generate

This section records what the game can emit today. It is an inventory and migration aid, not
an expansion of the P0 art queue. `CURRENT / REUSE` means the existing asset or procedural
presentation should be used in the first slice. `TARGET REPLACEMENT` means the new semantic
asset in this manifest will eventually take over. `LEGACY / RETIRE` means it remains available
until classic combat is removed, but should not drive new card-combat art decisions.

### Card Trial and shared combat path

| Current presentation | Current implementation | Status | Target/migration note |
|---|---|---|---|
| Old Man/Rat King actor states | 14 strips under `public/assets/card-trial/heroes/`: idle, walk, attack, attack_ranged, cast, hurt, death | `CURRENT / REUSE` | Keep as the two protagonist actor foundation; do not redraw for the first VFX pass. |
| Basic Rat King card hit | Thief-class melee choreography: Rat King actor `attack` plus `slash_attack` impact | `CURRENT / REUSE` | Reuse for `nip`, then add `fx-rat-bite` only when the Rat actor/command sequence is ready. |
| Basic Old Man card hit | Old Man actor `cast` plus card-specific projectile/burst styles (`px_arcane_bolt`, `retro2_arcane_sigil`, etc.) | `CURRENT / REUSE` | Campaign card damage is now presented as magic, not a weapon swing. Replace the approved fallback strips with `fx-ash-bolt` only after that signature is authored. |
| Current defense | `defend` event, `px_shield` burst, `GUARD` popup | `TARGET REPLACEMENT` | Migrate to `fx-barrier-cast/hold/absorb/shatter` once the rules name is Barrier. Do not treat `px_shield` as new Barrier art. |
| Opened creation | `retro2_crescent_slash` burst and `OPENED` popup | `TARGET REPLACEMENT` | Replace the generic slash with `fx-opened-apply`; retain the current strip as a fallback during migration. |
| Opened consumption | `retro2_crescent_slash` underlay plus `retro_starburst` burst and `EXPLOIT` popup | `TARGET REPLACEMENT` | Replace with `fx-opened-consume`; preserve the existing two-stage timing until the new strip is proven. |
| Rat spawn / Rat move | A `cast` presentation with a vermin portal for Brood and a tangle/ring command accent for Send the Rat | `CURRENT / REUSE` | The current first-slice presentation now distinguishes summoning from command. A visible Rat actor and bespoke `fx-rat-*` strips remain a later replacement. |
| Rat bite event | Converted to an attack attributed to Rat King; no separate Rat actor impact today | `TARGET REPLACEMENT` | Use `fx-rat-bite` only after the bite has a visible Rat source and destination. |
| Miss / evade | `dispel_sparks` burst plus `MISS` popup | `CURRENT / REUSE` | `fx-miss` may replace it later; the current whiff is sufficient for the first slice. |
| Enemy/hero defeat | Actor `death` strips; undead enemies additionally use `zombie_death_explosion` | `CURRENT / REUSE` | Keep generic death presentation. Boss-specific defeat variants remain P1/P2. |

The current Card Trial event adapter is the source of truth for these mappings: Rat-bites
become shared attack events, Old Man card damage becomes a `spellEffect` with the
`card-spell` presentation verb, defense becomes `defend`, Rat spawn/move becomes a Rat
presentation cast, and Opened/Hush/Omen actions become semantic `spellEffect` events. See
`src/engine/card-trial-presentation.ts` before introducing a new asset id.

### Current semantic card VFX contract

The first executable Old Man spell states are intentionally composed from the existing
library while bespoke sheets are pending:

| Semantic event | Runtime presentation | Meaning |
|---|---|---|
| `card-spell` | card-specific cast/projectile/burst style | Old Man's direct card damage is magical; it must not fall through to melee choreography. |
| `hush` / `hush-trigger` | violet sparks + ward ring / muted ring | Apply Hush, then show the one-shot reduction when the next intent resolves. |
| `omen` | gold sigil charge + persistent glow | Face-up Omen is armed on one enemy and occupies the single delayed slot. |
| `omen-trigger` | arcane bloom + sigil + impact | Omen strikes before the marked enemy's next intent. |
| `omen-fizzle` | fading dispel sparks | The marked enemy died before its next intent, so the Omen had no target. |
| `crowned` / `crown-cleared` | gold solar ring + sigil / fading sparks | Rat King's singleton subject is publicly applied, replaced, or lost on defeat. |
| `crown-tribute` | ward ring + royal gold accent | A non-redirectable Crowned intent grants Rat King 2 Barrier before its authored action. |

These are semantic IDs, not a request to generate five unrelated generic bursts. Future art
should preserve the timing and material language while replacing the fallback strips.

### Existing effect-strip library

The runtime registry contains the current reusable effect families below. The individual ids
are already wired through `ELEMENT_STYLES`, `SPELL_OVERRIDES`, `STATUS_STYLES`, chemistry
presentations, and melee/projectile helpers in `combat-choreography.ts`.

| Existing family | Representative ids | Status | Rule |
|---|---|---|---|
| Elemental projectile/burst/field/charge | `fz_fireball`, `mp_fire_bomb`, `ice_burst_glow`, `lightning_blast`, `fz_water_geyser`, `fz_tornado`, `retro2_earth_swirl` | `CURRENT / REUSE` | Reuse for legacy spells and fallback presentation; do not redraw in P0. |
| Melee and staff impacts | `slash_attack`, `free_slash`, `free_stunburst`, `wizard_attack1`, `wizard_attack2`, `priest_attack`, `staff_attack` | `CURRENT / REUSE` | These are existing impact layers, not card-specific new art. |
| Healing and resurrection | `priest_heal`, `heal_sparks`, `retro_dot_flower`, `retro3_arcane_bloom` | `CURRENT / REUSE` | Keep until the campaign healing rules are finalized; `fx-heal-*` is future semantic art. |
| Status/control | `free_moon`, `free_wardring`, `free_tangle`, `px_black_white_sparks`, `dispel_sparks`, `ice_burst_grey` | `CURRENT / REUSE` | Existing status language may serve as a temporary fallback, but must not be mistaken for Hush/Omen/Crowned art. |
| Summon and chemistry | `fz_portal`, `fz_portal_gold`, `fz_portal_orange`, `elemental_v1`, `elemental_v2`, `red_energy`, `zombie_explosion` | `CURRENT / REUSE` | Keep for legacy summons/chemistry; Rat-specific presentation gets its own target vocabulary. |
| Enemy-specific projectiles | `arrow`, `arrow_archer`, `arrow_skeleton`, `cannonball`, `rune-beam`, `demon-arrow`, `eye-beam`, `ghostfire-beam`, `lava-spike`, `warlock-magic` | `CURRENT / REUSE` | These are current enemy/legacy combat effects, not card-signature replacements. |
| Undead and impact variants | `zombie_death_explosion`, `zombie_explosion`, `retro_starburst`, `retro_shockwave`, `retro_crescent_arc` | `CURRENT / REUSE` | Retain for existing encounters until authored boss/region variants justify replacement. |

The complete id-level wiring remains in the source registry and its validation test; this
manifest intentionally does not turn all 109 combat ids into an art-generation checklist.
`collectReferencedEffectIds()` is the audit hook for keeping the registry and choreography
in agreement.

### Non-sprite animation already supplied by the renderers

These are current presentations but do not require PNG strips:

- actor approach, coil, lunge, return, recoil, row movement, hurt flash, and death fade;
- damage/heal/status popups, spell/skill banners, cursors, and Card Trial row markers;
- impact particles, floor light glows, screen shake, hit-stop, camera zoom, and environment
  light impulses;
- Phaser-only polish currently enabled: cast bloom, spotlight, hit squash, death dissolve /
  palette crumble, and heal shine. Afterimage is intentionally disabled.
- Card Trial hand spring/enter/discard motion and FF6 window slide transitions.

These should be reviewed as choreography and renderer behavior, not placed in the new effect
strip queue. Canvas and Phaser must continue to consume the same choreography state.

### Legacy actor and summon bundles

Classic combat also has party-class strips under `public/assets/party/` and many enemy bundles
under `public/assets/enemies/`, each generally providing idle/attack/hurt/death with a few
optional cast or ranged variants. Summoned allies reuse those enemy strips. They are valid
current assets on the legacy path, but the new fixed-duo campaign should not acquire new
class-specific art dependencies. Mark them `LEGACY / RETIRE` when classic combat is removed;
repurpose useful silhouettes for named enemies or keep them for the Arena only.

## Current-to-target migration map

| Current id or presentation | Target id/family | Migration rule |
|---|---|---|
| `px_shield` + `GUARD` | `fx-barrier-cast`, `fx-barrier-hold`, `fx-barrier-absorb`, `fx-barrier-shatter` | Change the rule/popup and visual language together; never ship a half-Barrier/half-Guard vocabulary. |
| `retro2_crescent_slash` for Opened | `fx-opened-apply` | Keep the old strip as a temporary fallback only. |
| `retro_starburst` / slash pair for consume | `fx-opened-consume` | Preserve the visible fracture-to-payoff beat. |
| Rat cast + `RAT` popup | `fx-rat-spawn` + Rat actor idle/attack/hurt/death | Do not claim Rat is visually complete while it remains a UI-only event. |
| `slash_attack`, `wizard_attack1`, `staff_attack` | Existing reuse, then optional card-specific actor poses | The first slice may reuse these; new card art must earn its own silhouette. |
| Existing elemental/status/summon ids | Same ids or later semantic replacements | No P0 redraw; replace only when a mechanic is canonical and the current effect teaches the wrong rule. |
| Classic party/enemy bundles | Fixed-duo/card-combat actor set | Retire from campaign dependencies after the classic combat cut; preserve for Arena/repurposing where useful. |

### Scope rule

The P0 art queue consists only of the new semantic ids in the P0 tables plus the complete Rat
actor bundle. Everything in this inventory is either `CURRENT / REUSE`, a temporary fallback,
or a legacy asset awaiting retirement. This is how the manifest can be complete about the
current game without ballooning the first art sprint into a redraw of the entire combat
library.

## Priority legend

- **P0 — first vertical slice:** required for the new combat to feel authored.
- **P1 — first campaign polish pass:** strongly recommended after the slice proves itself.
- **P2 — later spectacle:** valuable, but not allowed to delay the playable loop.

## Production rules

### Effect strips

New combat effects live in `public/assets/effects/` and are registered in
`src/engine/effect-sprite-cache.ts`. Keep the existing flat folder and use stable semantic
ids. The cache already supports arbitrary frame dimensions, but new work should use a small
number of repeatable contracts:

| Family | Cell | Frames | Use |
|---|---:|---:|---|
| Small impact / status | 64x64 | 6–8 | bite, hush mark, opened crack, miss |
| Medium cast / burst | 128x128 | 6–8 | Barrier, Crown, Omen, card signatures |
| Wide projectile / beam | 192x96 | 6–10 | staff arcs, sever lines, astral bolts |
| Persistent field | 128x128 | 4–6 loop | Barrier hold, Omen slot, Crown aura |
| UI/status icon | 32x32 | 4–6 | hand, battlefield, intent/status readout |

These are authoring targets, not a request to force an existing strip into a new size. Every
strip must have hard pixel edges, binary alpha, no matte, no text, no frame borders, no
cross-cell bleed, and a transparent background. Aim for 8–32 opaque colors per frame and
inspect at native size and at 4x nearest-neighbor.

### Character strips

When a new actor animation is needed, follow `docs/SPRITE-ART-GENERATION-GUIDE.md`: 100x100
cells, stable footprint, right-facing source art, deliberate pixel clusters, and idle-first
identity approval. Do not bake a giant beam into a character cell; the beam belongs in the
effect layer.

### Layering rule

The preferred presentation stack is:

```text
actor anticipation
  -> cast/command charge
  -> projectile or movement
  -> state application mark
  -> impact burst + floor light + particles
  -> popup/banner
```

The state mark must remain visible long enough to teach the rule. The impact may be large;
the status should be quieter and persistent. Phaser and `?phaser=0` must consume the same
choreography state.

## P0 — shared combat language

These are the first assets to generate. They are used by multiple cards, enemies, and future
spells, so each one should have a strong silhouette and a restrained palette.

| Id | Asset | Frames | Visual brief | Used by |
|---|---|---:|---|---|
| `fx-barrier-cast` | Barrier creation | 8 | A pale blue-grey shield plane folds around the target; one amber edge catches light. Old Man adds violet sparks; Rat King adds tarnished gold sparks via tint/particles. | `brace`, `pale-ward`, `king-of-the-heap`, `last-bastion`, future buffs |
| `fx-barrier-hold` | Barrier persistent field | 4 loop | Thin segmented shell, not a glowing bubble; slow breathing edge and three visible facets. | Any active Barrier |
| `fx-barrier-absorb` | Barrier hit ripple | 6 | Incoming impact dents the shell, ripples across it, then leaves a bright crack. | Enemy intents and any damage absorbed |
| `fx-barrier-shatter` | Barrier depletion | 8 | Shell fractures into large readable shards that fall inward, not smoke. | When Barrier reaches zero |
| `fx-hush-apply` | Hush application | 8 | A black ash seal clamps over the enemy's mouth/intent glyph; two extinguished bell motes. | Old Man control cards |
| `fx-hush-pulse` | Hush active | 4 loop | Small mute sigil beside the intent, with one dim pulse per enemy turn. | Hushed enemy |
| `fx-hush-break` | Hush consumed/removed | 6 | Seal snaps, sound-ring collapses into ash. | Hush-consuming cards, if retained |
| `fx-opened-apply` | Opened creation | 8 | A thin white-violet fracture traces the target silhouette and exposes a dark core. | `open-the-rank`, `from-the-dark`, `faultline`, `marrow-divide` |
| `fx-opened-pulse` | Opened active | 4 loop | One slow internal glow through the crack; never a permanent damage aura. | Opened enemy |
| `fx-opened-consume` | Opened payoff | 8 | Fracture tears open, emits a short beam, then reseals or collapses. | `swarm-the-wound`, `burst-the-nest`, `full-stop`, `sever-the-thread` |
| `fx-crown-apply` | Crowned designation | 8 | Rat King's crooked crown snaps above the chosen enemy; a thin royal thread points back to the King. | Crown card / future Dominion cards |
| `fx-crown-pulse` | Crowned active | 4 loop | Crown jewel blinks when the enemy intent changes; no damage-number implication. | Crowned enemy |
| `fx-crown-transfer` | Crown transfer | 6 | Crown lifts from a defeated target and lands on the next subject. | Crown reassignment |
| `fx-omen-foretell` | Omen placed | 8 | A black card-shaped rune folds out of Old Man's hand and pins a thread to the enemy. | `three-knocks`, `death-arrives-late`, `a-death-foreseen` |
| `fx-omen-hold` | Omen visible slot/field | 4 loop | Suspended parchment/obsidian tile with one moving clock hand; readable at a glance. | Any active Omen |
| `fx-omen-trigger` | Omen resolves | 10 | Clock hand reaches the mark, the rune stamps the target, then the promised effect fires. | Delayed card effects |
| `fx-rat-spawn` | Rat enters play | 8 | A floor crack opens; a rat silhouette climbs out with two eye glints. | `litter`, summon fallback |
| `fx-rat-bite` | Rat attack | 6 | Low, fast, tooth-bright lunge with a small red impact star. | `nip`, `send-the-rat`, `swarm-the-wound` |
| `fx-rat-swarm` | Multi-rat pressure | 8 | A readable wave of overlapping backs/tails, not a particle cloud. | `burst-the-nest`, swarm payoffs |
| `fx-rat-command` | Command signal | 6 | Rat King's pointing line hits each ready subject in sequence. | `send-the-rat`, command cards |
| `fx-card-seal` | Card play punctuation | 6 | The played card's small sigil stamps the battlefield before the real effect. | All cards, lightly reused |
| `fx-miss` | Miss/evade | 6 | A thin displaced afterimage and a puff of dust; explicitly not a damage explosion. | Any miss event |
| `fx-heal-small` | Single-target recovery | 8 | Three upward green-white motes spiral into the recipient, with a clean closing chime shape. | Future healing / refuge combat |
| `fx-heal-party` | Party recovery | 8 | One floor sigil expands beneath both heroes and sends two separate streams upward. | Any duo heal |
| `fx-summon-portal` | Summon arrival portal | 8 | Dark oval portal with one identity-colored rim; portal opens before the summon sprite appears. | Rat, future summons |
| `fx-summon-arrive` | Summon arrival | 6 | Feet/hooves/hands cross the threshold with a brief floor shock. | Summoned ally entry |

### Barrier visual contract

Barrier is the only mitigation noun in the first slice. These assets must not introduce a
second shield language. The cast, hold, absorb, and shatter strips are four moments of one
material: a translucent, cracked, almost-architectural shell. `Pale Ward`, `Brace`, or a future
card name may be flavorful names, but their presentation resolves to Barrier.

## P0 — hero-specific card signatures

The current 24 cards already have good static illustrations. The following table describes
the minimum animation language needed to make each play feel authored. “Reuse” means use a
P0 shared strip with a different actor pose, tint, timing, or target pattern; “new” means a
new strip is justified.

### Rat King cards

| Card | Signature composition | Art ask | Priority |
|---|---|---|---|
| `nip` | Rat King claw twitch -> `fx-rat-bite` on target -> tiny hit popup | Reuse rat bite | P0 |
| `brace` | Rat King hunches and shields himself -> `fx-barrier-cast` in tarnished gold | Reuse Barrier | P0 |
| `open-the-rank` | Royal hand gesture -> `fx-opened-apply` tears one enemy | Reuse Opened | P0 |
| `from-the-dark` | Rat King dims -> shadow trail crosses from Back -> rat bite from below | New `fx-shadow-pounce` plus rat bite | P1 |
| `swarm-the-wound` | `fx-rat-swarm` enters the existing fracture -> `fx-opened-consume` | Reuse shared pair | P0 |
| `burst-the-nest` | Nest sigil under target -> several rat silhouettes burst toward other enemies | New `fx-nest-collapse` (wide burst) | P0 |
| `litter` | Floor scratch and `fx-rat-spawn`; new Rat actor appears on the row | Reuse portal/spawn; complete Rat actor bundle | P0 |
| `send-the-rat` | `fx-rat-command` line -> Rat actor dash -> `fx-rat-bite` | Reuse command/bite; Rat dash actor animation | P0 |
| `tide` | Rat King sweeps his cloak; a black vermin wave rolls across the target row | New `fx-vermin-tide` | P1 |
| `lunge` | Rat King Front commitment -> claw arc -> short floor skid | New `fx-claw-swipe` or adapt approved slash | P0 |
| `king-of-the-heap` | Heavy crown pulse -> body slam -> `fx-barrier-cast` and impact ring | New `fx-royal-slam`; reuse Crown/Barrier | P0 |

### Old Man cards

| Card | Signature composition | Art ask | Priority |
|---|---|---|---|
| `the-staff-speaks` | Staff raises -> compact violet bolt -> occult impact | New `fx-ash-bolt` | P0 |
| `pale-ward` | Staff plants -> `fx-barrier-cast` with violet/ivory accent | Reuse Barrier | P0 |
| `faultline` | Finger traces a line -> `fx-opened-apply` fractures the target | Reuse Opened | P0 |
| `marrow-divide` | A bone-white internal seam flashes, then becomes Opened | New `fx-bone-fracture` (can be an Opened variant) | P1 |
| `full-stop` | Old Man writes a square stop-mark -> `fx-opened-consume` collapses inward | New `fx-full-stop-seal` | P0 |
| `sever-the-thread` | A horizontal occult thread crosses the enemy line and severs to a second target | New `fx-sever-line` (wide projectile) | P0 |
| `the-threshold` | Old Man steps into Front -> floor threshold opens under the target -> bolt | New `fx-threshold-rune`; reuse ash bolt | P1 |
| `distant-hand` | Back-row cast -> long, quiet ash projectile with no explosion bloat | Reuse `fx-ash-bolt` with wide path | P0 |
| `parting-word` | Staff strike and immediate Back retreat leave a fading afterimage | Reuse staff/ash bolt; optional `fx-step-afterimage` | P1 |
| `unlight` | All light drains from enemy silhouettes; one black sun pops and vanishes | New `fx-ashen-blackout` (wide field) | P0 |
| `last-bastion` | Old Man locks Front, Barrier shell appears, then a catastrophic vertical rune strike | New `fx-last-stand-rune`; reuse Barrier | P0 |

The two cards named `the-staff-speaks` and `nip` are intentionally simple. Their job is to make the
baseline turns readable, not to compete with signature cards.

## P0 — Rat actor bundle

The Rat is a combatant, not a UI token. Generate a complete bundle at
`public/assets/enemies/rat/`:

| State | Frames | Direction | Verb |
|---|---:|---|---|
| `idle` | 6 | right | sniff, tail flick, eye glint |
| `attack` | 6 | right | crouch, spring, bite, recoil |
| `hurt` | 4 | right | impact, whisker shock, recover |
| `death` | 4 | right | stumble, collapse, small held remnant |

Use a compact silhouette that remains readable next to the 100x100 hero strips. It should
not look cute or oversized. The `fx-rat-bite` strip supplies the impact; the actor strip
supplies the subject and motion.

## P1 — combat-wide polish

These assets should follow the P0 language and are worth doing after the first playable
slice has evidence.

| Asset family | Contents | Purpose |
|---|---|---|
| Enemy intent | `fx-intent-warn`, `fx-intent-cancel`, `fx-intent-change` | Make intent changes feel like events without hiding the forecast UI. |
| Front/Back movement | `fx-front-step`, `fx-back-step` | A short floor streak and row marker; never a teleport flash. |
| Damage response | `fx-impact-light`, `fx-heavy-impact`, `fx-critical-ring` | Separate ordinary, opened, and catastrophic hits without adding statuses. |
| Downed hero | `fx-downed-collapse`, `fx-revive-return` | Needed if campaign combat includes recovery cards later; not a first-slice rule change. |
| Card hand feedback | `fx-card-hover`, `fx-card-arm`, `fx-card-discard` | Small UI strips/particles to connect a card leaving the hand to the battlefield. |
| Status icon atlas | Barrier, Hush, Opened, Crowned, Rat, Omen, Front, Back | 32x32 UI-ready icons sharing the battlefield silhouettes. |
| Enemy defeat variants | Ash collapse, royal submission, fracture collapse | Replace generic death only for authored minibosses/bosses. |

## P2 — authored spectacle

Do not make these dependencies of the combat resolver.

- unique boss phase strips for The Dead Boy, The Lonely Girl, and The Crying Man;
- a full-screen bridge/abyss spell for a late-game set piece;
- astral geometry and constellation collapse if Resonance returns;
- Blood Price debt visuals if that mechanic returns;
- school-specific elemental kits if the six-school model is reintroduced;
- environmental combat backdrops for named regions;
- animated NPC/refuge portrait reactions;
- card-upgrade transformation animations.

## Card illustration and UI asks

The 24 static card illustrations are already wired and should remain the foundation. New
card art is lower priority than making the play leave the card and visibly change the stage.

Create the following UI assets only when the hand presentation is stable:

| Id | Size | Brief |
|---|---:|---|
| `ui-card-owner-old-man` | 16x16 | Violet/ivory occult mark |
| `ui-card-owner-rat-king` | 16x16 | Tarnished gold/red crown mark |
| `ui-status-barrier` | 32x32 | Faceted shell, no shield-with-cross cliché |
| `ui-status-hush` | 32x32 | Broken bell / sealed mouth |
| `ui-status-opened` | 32x32 | Fracture with exposed core |
| `ui-status-crowned` | 32x32 | Crooked crown over a target glyph |
| `ui-status-rats` | 32x32 | Three overlapping rat eyes/tails |
| `ui-status-omen` | 32x32 | Suspended black card and clock hand |
| `ui-card-play-stamp` | 64x64 | Tiny stamp used at the moment a card leaves the hand |

Do not add separate icons for Guard, Ward, or Block. They are retired mechanical states;
Barrier owns that visual slot.

## Color and silhouette bible

| Layer | Old Man | Rat King | Shared battlefield |
|---|---|---|---|
| Outline | near-black plum | near-black brown | near-black |
| Primary | ash violet / dead ivory | rust red / tarnished gold | desaturated blue-grey |
| Emissive | cold magenta or star-white | amber eye-gold | pale cyan/white |
| Failure/impact | magenta-white fracture | red-orange tooth spark | coral-white impact |
| Persistent state | thin geometry | visible subjects and royal line | low-alpha, never opaque |

Old Man effects should feel like geometry, silence, handwriting, and inevitability. Rat King
effects should feel like bodies, orders, teeth, and crowd motion. Shared states need one
material grammar so the player learns them once.

## Generation batches

Generate in these batches, with a review sheet after each batch:

### Batch A — Barrier proof

`fx-barrier-cast`, `fx-barrier-hold`, `fx-barrier-absorb`, `fx-barrier-shatter`, and the
`ui-status-barrier` icon. Test the four moments on both heroes before producing other
statuses. This is the highest-return visual slice.

### Batch B — State language

Hush, Opened, Crowned, and Omen, each with apply + persistent + payoff where applicable.
Review all four together so they do not collapse into the same purple ring.

### Batch C — Rat identity

Complete Rat actor bundle, `fx-rat-spawn`, `fx-rat-bite`, `fx-rat-swarm`, and
`fx-rat-command`. Test a Rat King turn that summons, commands, and consumes a Rat.

### Batch D — Old Man identity

`fx-ash-bolt`, `fx-full-stop-seal`, `fx-sever-line`, `fx-ashen-blackout`, and
`fx-last-stand-rune`. Test Back cast, Front commitment, Opened payoff, and an area effect.

### Batch E — card signatures

Only after A–D are accepted: `fx-nest-collapse`, `fx-royal-slam`, `fx-vermin-tide`,
`fx-claw-swipe`, `fx-bone-fracture`, `fx-threshold-rune`, and optional shadow/afterimage
variants.

## Acceptance checklist

### Visual

- [ ] Barrier is unmistakable and consistent across cast, hold, absorb, and shatter.
- [ ] Barrier is not visually called Guard, Ward, or a generic blue bubble.
- [ ] Hush, Opened, Crowned, and Omen remain distinguishable in one glance.
- [ ] Rat King effects show subjects and command; Old Man effects show geometry and timing.
- [ ] Every signature card has a readable anticipation, peak, and recovery.
- [ ] No effect is a full-screen glow that hides enemy intent or card outcome.
- [ ] New strips read at native size and at normal arena scale.

### Technical

- [ ] Every strip has a stable semantic id and an `EFFECT_STRIPS` entry.
- [ ] Every registered URL exists under `public/assets/effects/`.
- [ ] Alpha is binary and no frame crosses its cell boundary.
- [ ] Canvas and Phaser display the same choreography at the same moment.
- [ ] `?phaser=0` remains a valid visual fallback.
- [ ] Effect caps remain safe; no card can spawn unbounded strips or particles.
- [ ] Art generation follows the sprite guide and keeps source material separate from final strips.

### Product

- [ ] A new player can identify Barrier, Opened, Crowned, Hush, Rats, and Omen without
  reading the log.
- [ ] A card reward is memorable because the card later produces a recognizable stage event.
- [ ] At least one Rat King setup -> Old Man payoff and one Old Man setup -> Rat King payoff
  are visually obvious.
- [ ] No new art requires six-school selection, Resonance, SPENT, Blood Price debt, or
  another deferred mechanic.

## Implementation order after art approval

1. Add the final strips and registry entries; keep all ids semantic.
2. Add presentation metadata/style mappings only; do not change card math.
3. Wire one state at a time through existing `CombatEvent` choreography.
4. Prove Barrier end-to-end in a real campaign encounter.
5. Prove Hush/Open/Crown/Omen state persistence and cleanup.
6. Wire Rat actor presentation and command sequencing.
7. Wire the Old Man signature cards.
8. Add the remaining card signatures by composition and reuse.
9. Capture the same moments in Phaser and Canvas, then run build/tests.

The success criterion is not the number of PNGs. It is that the battlefield becomes a legible
occult machine: Barrier absorbs, Rat King establishes, Old Man predicts or breaks, and the
player can see the consequence of each card.
