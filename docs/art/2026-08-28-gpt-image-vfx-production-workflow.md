# GPT-5.6 / GPT-Image-2 combat-art production workflow

**Date:** 2026-08-28  
**Status:** current art-production guidance  
**Scope:** generated source material for OnyxLabyrinth combat effects, hero/summon strips, card signatures, and status language

This document turns current first-party model guidance and the repository's sprite constraints
into a repeatable production workflow. It does not change combat rules or renderer behavior.

## The short answer

Use two model roles, not one:

1. **GPT-5.6 Sol (`gpt-5.6` / `gpt-5.6-sol`) is the art director, prompt architect, critic,
   and production coordinator.** Give it the product contract, the existing art, the target
   asset schema, and the acceptance tests. Ask it to produce a brief, a prompt, an edit plan,
   and a critique. Do not ask it to invent a shipping strip without a specification.
2. **GPT-Image-2 is the image renderer/editor.** Use it for concepts, key poses, isolated
   effects, and controlled edits. Use the Responses API when the work needs an image reference
   to survive several edit turns; use a direct image generation/edit call for a single artifact.

This separation matters. GPT-5.6 is a reasoning model with image input and tool use; GPT-Image-2
is the purpose-built image generation/editing model. OpenAI currently recommends GPT-5.6 Sol for
complex professional work and GPT-Image-2 for new production image workflows. See the
[GPT-5.6 model guidance](https://developers.openai.com/api/docs/guides/latest-model) and the
[GPT-Image-2 model page](https://developers.openai.com/api/docs/models/gpt-image-2).

The practical rule for OnyxLabyrinth is:

> **Generate high-resolution, transparent source material; preserve identity through reference-
> based edits; assemble and hand-clean the final pixel animation; validate it in the actual
> Canvas and Phaser scenes.**

The generator supplies raw material. It does not get to decide the game's silhouette language,
frame timing, alpha policy, card semantics, or whether an effect is readable during a fight.

## What the web research changes for this project

### 1. Prompt the task as a production brief

OpenAI's image prompting guidance recommends a consistent order: intended use and scene,
subject, key details, then constraints. It also recommends explicit framing, material, action,
and exclusions; named references; and small single-change edit turns instead of one overloaded
prompt. That maps directly to our needs. A prompt should say *what the asset is for* (a layered
128px combat effect, not a poster), *what must remain invariant* (shell geometry, silhouette,
palette), and *what is allowed to change* (one frame's crack path, one accent color, or one
impact pose). See the [GPT Image prompting guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide).

### 2. Use GPT-Image-2's transparent output deliberately

For isolated effects, request `background: "transparent"`, `output_format: "png"` (or WebP),
and explicitly say: isolated subject, no scenery, no solid backdrop, no checkerboard, no cast
shadow. Repeat “preserve the transparent background” on every edit. Keep the returned alpha
channel intact; converting RGBA to RGB destroys the asset's usefulness. Transparency is currently
documented as a GPT-Image-2 preview feature, so the downstream alpha and edge checks remain
mandatory. The [image-generation guide](https://developers.openai.com/api/docs/guides/image-generation)
and [prompting guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)
specify these settings.

When an external generator cannot produce reliable alpha, a flat chroma source is an acceptable
intermediate, but it must go through the repository's existing key-out and binary-alpha cleanup
process. It is never a shipping format.

### 3. Generate large enough to survive pixel reduction

The final engine contracts are intentionally small (64px, 128px, 192px, or 100px cells), but
GPT-Image-2's documented output constraints require a substantially larger image: both edges
must be multiples of 16, the aspect ratio cannot exceed 3:1, and the image must contain at least
655,360 pixels. The reliable working ceiling is around 2K; larger outputs are documented as more
experimental. Generate a 1024x1024 or 1536x1024 concept/key pose, or a 2048x1152 board when a
large composition is genuinely useful. Then crop, redraw, and reduce with nearest-neighbor to
the shipping cell size. Do not ask the model for a 100x100 final strip and expect high-quality
pixel clusters.

Use `quality: "low"` for silhouettes and high-volume exploration, `medium` for approved concept
edits, and `high` for a final source plate or an identity-sensitive edit. The API documentation
explicitly frames low as a fast draft setting and medium/high as the fidelity choices.

### 4. Use the Responses API as an edit session, not a prompt vending machine

The Responses API supports multi-turn image generation/editing with image inputs and outputs in
context. A good session keeps one approved anchor image and makes one controlled edit at a time:

```text
anchor shell -> cast pose -> hold pose -> impact dent -> crack propagation -> shatter -> residue
```

Each turn repeats the invariant list. Do not regenerate the whole family from scratch; that is
how the same Barrier becomes six unrelated shields. For one-shot concepts, the Image API is
fine. For a family that must preserve geometry, use a continuing edit conversation and retain
the source/reference files. OpenAI's [image-generation guide](https://developers.openai.com/api/docs/guides/image-generation)
documents this split and the multi-turn editing path.

### 5. Use GPT-5.6 to judge, not merely to write prettier prompts

Give GPT-5.6 the 1x sheet, a 4x nearest-neighbor sheet, the target in-game screenshot, and the
asset brief. Ask for a strict PASS / REVISE / REJECT decision against measurable tests:

- silhouette readable at native size;
- contact point obvious with the spell banner hidden;
- state distinction survives desaturation and muted audio;
- no frame crosses its cell boundary;
- alpha is clean and binary after processing;
- actor footprint and anchor stay stable;
- the effect does not hide enemy intent, Front/Back, or status icons;
- the material verb is visible (Barrier folds/braces/dents/shatters; it does not merely glow).

For tiny pixel work, pass the original-resolution sheet when possible. GPT-5.6's current model
guidance documents an `original` image-detail path that preserves input dimensions, which is more
useful for checking a one-pixel contour than a resized preview. Human review at 1x remains the
final authority.

### 6. Keep the animation editable and inspectable

Aseprite's document model gives us exactly the controls this workflow needs: transparent
layers, per-frame durations, tags, linked cels, and onion skinning. Use those rather than
flattening every idea into a single opaque strip at the beginning. The official docs cover
[sprite structure](https://aseprite.com/docs/sprite/),
[onion skinning](https://aseprite.com/docs/onion-skinning/), and
[sprite-sheet export](https://www.aseprite.org/docs/sprite-sheet/).

Recommended layer names for a flagship effect:

```text
actor-anticipation      (usually remains a character strip, not baked into the effect)
shell-or-primary        (the readable material silhouette)
impact-or-state         (dent, fracture, crown, hush seal, omen stamp)
particles-and-residue   (small accents only)
floor-light             (optional; separate when the renderer can supply it)
```

Use tags such as `cast`, `hold`, `absorb`, `shatter`, and `residue`. Link cels when the shell or
sigil genuinely repeats. Use onion skin to keep the contour's mass and anchor stable between
frames. Export the final PNG and, when useful for review, JSON metadata through Aseprite's CLI;
the [CLI documentation](https://www.aseprite.org/docs/cli/) supports sheet export, frame/tag
selection, layer splitting, padding, and `--data` JSON output.

## Canonical pipeline for OnyxLabyrinth

### Phase 0 — lock the asset contract

Before opening an image model, write one small record:

```yaml
asset_id: fx-barrier-absorb
use: layered campaign card-combat effect
family: Barrier
state: impact / absorption
cell: 128x128
frames: 6
background: transparent
engine_path: public/assets/effects/fx-barrier-absorb.png
material_verb: dent -> ripple -> craze
must_read_as: one faceted shell receiving a hit
must_not_read_as: blue bubble, Guard, generic explosion, damage number
layers: [primary shell, impact/state, restrained residue]
```

The record is the source of truth for both the GPT-5.6 brief and the final registry entry. It
prevents the generator from quietly changing a mechanical state into a new visual noun.

### Phase 1 — build a reference packet

Give the models a small, labeled packet rather than an uncurated image dump:

1. one shipping hero or enemy strip for scale and silhouette;
2. one approved effect from the shared material library;
3. one 1x/4x screenshot of the combat stage showing the target area;
4. the color/silhouette bible from the VFX manifest;
5. the asset contract and a short no-go list.

When multiple images are supplied, label them in the prompt (“Image 1: Old Man cast pose;
Image 2: approved Barrier shell; Image 3: target battlefield”). Explicitly say which image
provides identity, which provides style, and which provides composition. This is more reliable
than “make it like these.”

### Phase 2 — generate concepts and choose an anchor

Generate a small set of silhouettes at low or medium quality. The question is not “which is the
prettiest glow?” It is “which shell, crack, crown, or swarm has a contour that still reads at
native scale?” Select one anchor and record why it won.

For Barrier, the anchor is the shell geometry. For Hush, it is the sealed-bell/mute mark. For
Opened, it is the fracture exposing a dark core. For Rats, it is the overlapping body rhythm and
eye glints. Do not vary all of those at once.

### Phase 3 — make a key-pose board, not a final strip

Ask GPT-Image-2 for two to four clearly labeled key poses or a compact storyboard only after the
anchor is selected. Use the same reference in later edits. The key poses should show:

```text
anticipation -> formed silhouette -> peak/contact -> aftermath
```

The model is good at supplying shape and material ideas, but equal frame spacing, pixel-perfect
cell boundaries, and a coherent 6–10 frame loop are production tasks. We solve those in the
editor, where every frame can be checked.

### Phase 4 — edit one variable at a time

Use short edit turns:

1. fix silhouette mass;
2. fix the material verb;
3. fix identity/palette;
4. fix framing and target anchor;
5. fix transparency and remove shadows;
6. only then make a variation for a neighboring state.

Every edit prompt repeats the invariants. “Make it better” is not an edit specification.

### Phase 5 — assemble and hand-clean

In Aseprite, establish the final canvas and tags, crop each source pose, align the actor/effect
anchor, redraw broken contours at native size, and tune frame durations. Keep source, cleaned
intermediate, and final strip separate. The repo's existing
[`SPRITE-ART-GENERATION-GUIDE.md`](../SPRITE-ART-GENERATION-GUIDE.md) remains authoritative for
100x100 actor/summon strips, chroma cleanup, binary alpha, palette limits, framing, and
validation.

For effect strips, use the VFX manifest's contracts:

| Family | Final cell | Typical frames | Generation strategy |
|---|---:|---:|---|
| Small impact/status | 64x64 | 6–8 | one key pose + hand-authored motion arc |
| Medium cast/burst | 128x128 | 6–8 | anchor shell/sigil + separate impact pose |
| Wide projectile/beam | 192x96 | 6–10 | source plate with explicit direction and negative space |
| Persistent field | 128x128 | 4–6 loop | linked shell cels + one moving accent |
| UI/status icon | 32x32 | 4–6 | one silhouette, minimal animation |

Do not bake a large beam, floor light, or screen flash into a character cell. Keep those as
effect layers so Canvas and Phaser can compose them consistently.

### Phase 6 — validate the actual files

Automated checks should cover dimensions, frame divisibility, alpha, and registry paths. Human
checks should cover meaning and timing:

```text
1x native sheet       — does the state read without zoom?
4x nearest-neighbor   — are clusters, edges, and accidental matte visible?
desaturated           — does silhouette/timing still communicate?
banner hidden         — is the card outcome obvious from the stage?
Canvas backend        — does the fallback paint the same event?
Phaser backend        — does the production stage preserve depth and layering?
frozen contact frame  — is the impact location unmistakable?
muted audio           — does the visual arc still tell the story?
```

Reject rather than patch endlessly when the concept fails the silhouette test. A bigger glow,
more particles, or a screen shake cannot make an ambiguous state legible.

### Phase 7 — register and integrate narrowly

Once the strip passes, add the semantic id and presentation metadata, then wire one
`CombatEvent` choreography at a time. Do not change card math while proving presentation. Test
the same event in normal Phaser mode and `?phaser=0`. The art sprint is successful when Barrier,
Hush, Opened, Crowned, Omen, Rats, and one Old Man payoff all read as a shared language—not when
the effects directory merely contains more files.

## The Barrier proof workflow

Barrier is the first flagship because it has four states that must feel like one object:

```text
cast       shell folds from four hard facets and locks
hold       shell breathes subtly; the silhouette remains stable
absorb     the exact impact point dents, ripples, then crazes
shatter    the final hit breaks the shell into large readable shards
residue    a quiet remnant fades while the new HP state remains clear
```

Generate one shell anchor first. Use that anchor to edit the four state families. In Aseprite,
keep the shell geometry on a reusable layer or linked cel where possible; let only the state
accent change. Old Man and Rat King may tint the accent differently, but they must not acquire
two incompatible shield nouns.

Suggested source prompts are below. They are deliberately production briefs, not “make it
awesome” prompts.

### GPT-5.6 art-director prompt

```text
You are the art director for OnyxLabyrinth, a first-person occult labyrinth with FF6-style
staged combat. Design the source-material brief for asset fx-barrier-absorb.

Use case: a 128x128 six-frame transparent effect strip, later hand-cleaned and reduced for a
Canvas/Phaser combat stage. It must remain readable at 1x and at normal arena scale.

References:
- Image 1: shipping Old Man/Rat King combat sprite, for scale and anchor only.
- Image 2: approved Barrier shell concept, for exact shell geometry.
- Image 3: current combat screenshot, for target placement and negative space.

Canonical meaning: an existing Barrier absorbs one enemy hit. The shell is one continuous
faceted material. Material verbs: dent, ripple, craze. It is not Guard, Ward, a blue bubble,
or a generic explosion.

Return:
1. a four-beat visual brief;
2. silhouette and palette invariants;
3. frame-by-frame timing intent;
4. a GPT-Image-2 generation prompt;
5. three single-variable edit prompts;
6. a PASS/REVISE/REJECT checklist for 1x, 4x, muted audio, banner-hidden, and desaturated review.

Do not invent new combat statuses. Do not render the final strip. Keep the answer skimmable and
specific enough that an editor can assemble the PNG without guessing.
```

### GPT-Image-2 anchor/source prompt

```text
Production source artwork for a hand-cleaned 2D combat VFX sprite, not a poster and not a
gameplay screenshot.

Subject: one almost-architectural translucent Barrier shell made from four hard-edged blue-grey
facets, centered, stable footprint, three visible seams, one small amber edge catch.
Action/state: the shell receives one impact at its upper-left facet; show a localized dent,
one ripple traveling across the shell, and a short white-violet craze at the contact point.
Composition: isolated centered subject, enough transparent margin for a 128x128 crop, no camera
perspective, no floor, no character, no text.
Medium: authored pixel-art source material with deliberate clustered shapes, hard pixel edges,
limited desaturated palette, readable silhouette before glow.
Intended use: crop and hand-clean into a six-frame 128x128 combat effect strip.
Background: fully transparent. No scenery, no solid backdrop, no checkerboard, no cast shadow,
no matte, no border, no watermark. Preserve transparency.
```

### Single-variable edit prompt

```text
Change only the impact response: move the dent and white-violet craze to the exact upper-left
facet contact point and make the ripple travel clockwise across the existing shell geometry.

Preserve everything else: same shell silhouette, same four facets, same seams, same palette,
same scale, same framing, same transparent background, no floor, no shadow, no text, no extra
particles. Do not redesign the Barrier.
```

### GPT-5.6 evaluator prompt

```text
Evaluate the attached fx-barrier-absorb review sheet as a strict game-art gate.

Inputs: Image 1 = native 1x sheet; Image 2 = 4x nearest-neighbor sheet; Image 3 = banner-hidden
combat screenshot.

Return exactly:
- decision: PASS, REVISE, or REJECT;
- scores 0/1 for silhouette, state meaning, contact clarity, continuity, anchor stability,
  alpha/edge cleanliness, palette discipline, and obstruction safety;
- at most three revisions, each changing one variable;
- one sentence explaining whether this still reads as the same Barrier object as the cast, hold,
  and shatter references.

Reject any frame that relies on glow to communicate, hides enemy intent, adds a new status noun,
or loses the shell's footprint. Judge the 1x image first; the 4x image is for diagnosing defects.
```

## Prompt rules that should become team habit

### Put invariants in every edit

Always repeat the identity, geometry, palette, framing, transparent-background, and “no extra
elements” constraints. “Same as before” is useful context but not a substitute for critical
invariants.

### Name the physical verb

“Blue magical shield” is a color and a noun. “A faceted shell folds, braces, dents at the exact
impact point, crazes, and sheds shards” is an animation direction. Use the latter style for every
material family in the manifest.

### Separate composition from texture

First solve silhouette, footprint, direction, and contact. Then solve palette, sparks, glow, and
residue. If the first pass contains every possible particle, the model's most important shape
will be impossible to audit.

### Ask for the intended use

Say “source material for a hand-cleaned 128x128 six-frame transparent combat strip” rather than
“cool spell effect.” The intended use tells the image model how much negative space, polish, and
detail are useful.

### Give the model fewer, better references

Use a labeled reference packet. One identity reference, one material reference, and one in-game
composition reference are usually more useful than twenty unrelated images. If two references
conflict, tell the model which one controls identity and which one controls style.

### Treat every output as a hypothesis

Keep rejected outputs. They are useful evidence about prompt failure, but they are not assets.
Record the prompt version, model, quality, size, references, edit turn, decision, and reason for
acceptance/rejection in the local art run folder or manifest. Do not let an attractive but
mechanically ambiguous image sneak into `public/assets/` without a decision record.

## What not to do

- Do not ask GPT-5.6 to “make the final pixel-art strip” with no asset contract.
- Do not ask GPT-Image-2 for 22 unrelated card animations in one generation prompt.
- Do not regenerate every state from a fresh text prompt after approving a shell, crown, or rat
  silhouette.
- Do not use a giant beam, floor flash, or screen shake to compensate for a weak contour.
- Do not accept a checkerboard, matte, cast shadow, text, or frame border as transparency.
- Do not export JPEG for an effect that needs alpha.
- Do not flatten layers before identity, timing, and anchor checks pass.
- Do not make the generator choose mechanical vocabulary. Barrier, Hush, Opened, Crowned, Omen,
  Rats, Front, and Back are already canonical game states.
- Do not ship a generated PNG without checking it in both combat painters.

## Source references

- [OpenAI GPT-5.6 model guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [OpenAI GPT-Image-2 model page](https://developers.openai.com/api/docs/models/gpt-image-2)
- [OpenAI image-generation guide](https://developers.openai.com/api/docs/guides/image-generation)
- [OpenAI GPT Image prompting guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)
- [Aseprite sprite structure](https://aseprite.com/docs/sprite/)
- [Aseprite onion skinning](https://aseprite.com/docs/onion-skinning/)
- [Aseprite sprite-sheet export](https://www.aseprite.org/docs/sprite-sheet/)
- [Aseprite command-line export](https://www.aseprite.org/docs/cli/)

## Canonical takeaway

The “best possible” GPT workflow is not one spectacular prompt. It is a controlled loop:

```text
GPT-5.6 defines the contract
  -> GPT-Image-2 proposes source material
  -> GPT-5.6 critiques against the contract
  -> GPT-Image-2 makes one controlled edit
  -> Aseprite assembles and hand-cleans the animation
  -> scripts validate alpha/dimensions/registry
  -> Canvas + Phaser prove the effect in context
  -> human approves or rejects
```

That loop is what can make the effects extraordinary without turning the asset folder into an
unreadable collection of unrelated AI output.
