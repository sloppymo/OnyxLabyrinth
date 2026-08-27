# Prompt — Comprehensive whole-game visual improvement plan

> **Historical planning prompt.** Its older party-creation and roster language
> is not current. Visual work must use the fixed Old Man + Rat King entry flow
> documented in [`CURRENT-PRODUCT-CONTRACT.md`](CURRENT-PRODUCT-CONTRACT.md).

**Paste everything below the line into a fresh session with an advanced multimodal
model (e.g. GPT-5.6 "Sol" or equivalent).** This is an **analysis + planning** session —
ask explicitly for a **plan only, no code**. If your session has live repository/file
access, say so up front and follow the "if you have repo access" branches below; if it
is chat + attached images only, skip those branches and rely on the written context and
the screenshot checklist instead. Either way works — this prompt is written to be
self-contained without repo access, and richer with it.

---

## Role

You are a senior art director and UI/UX lead brought in to review the **entire visual
presentation** of a shipping indie game, across every screen, not just one subsystem.
You have a trained eye for value structure, palette discipline, typographic hierarchy,
and — critically — **cross-screen cohesion**: whether a player moving from the title
screen to the dungeon to combat to town feels like they are in one consistent world, or
a patchwork of separately-designed screens bolted together.

This codebase has already had **separate, deep design passes** on some individual
screens (see "Prior work — do not re-litigate" below). Your job is **not** to redo that
work. Your job is to:

1. Judge whether those individually-good screens actually **cohere** as one game.
2. Find and prioritize whatever visual work has **not** yet had a dedicated pass.
3. Produce a single prioritized, phased plan spanning the whole game, that either
   stands alone or dispatches follow-up work to the narrower prompts that already exist.

Do not propose "modernizing" the look. This is a deliberately retro SNES/early-PC
dungeon-crawler pastiche; the brief is to make it a *better, more coherent version of
itself*, not a different game.

---

## Product context (self-contained — read even if you also have repo access)

**OnyxLabyrinth** is a Wizardry-style first-person dungeon crawler. TypeScript + Vite,
**no UI framework** — every screen is either a hand-built DOM overlay or a canvas
painter. Deployed to GitHub Pages. It has two fundamentally different rendering
technologies on screen at different times, which is itself a source of potential
visual incoherence worth scrutinizing:

| Screen | Tech | Notes |
|---|---|---|
| Dungeon corridor | Custom 2D canvas, pseudo-3D via DDA raycasting | Per-floor pixel-art tilesets, fog, torch flicker, CRT scanlines, amber edge glow, vignette |
| Combat | **Phaser 4.2.1** canvas (default) with a legacy 2D-canvas painter kept as `?phaser=0` rollback | FF6-style: enemies LEFT, party RIGHT, DOM menu windows overlaid on top of the Phaser/canvas stage |
| Title, party creation, town, camp, game over, arena, ending | Hand-built DOM | Recently reskinned toward "FF6 blue combat window" chrome (cobalt gradient panel, light border, gold selected item, white ▶ cursor) |
| HUD / message band (dungeon) | Hand-built DOM, **currently being reworked** | A typewriter-reveal notification window was just added on top of the plain message strip — freshly uncommitted work, expect rough edges here specifically |

Five campaign floors, each a distinct material story: **F1 The Flooded Crypt** (mossy
stone, damp streaks), **F2 The Cursed Library** (wood + books), **F3 The Forge of
Ashes** (charred iron, ember flecks), **F4 The Null Choir** (cold stone, pale
scratches), **F5 The Weeping Cistern** (wet teal, cyan accent — the *only* place a
neon/cyan accent is allowed, and only as an accent).

### Established visual identity (do not contradict this without strong evidence)

One-sentence brand: **chunky 16-bit dungeon textures — dark, desaturated materials
with sparse luminous accents, readable at corridor scale, never photoreal, never busy.**

Style pillars:
- Hard pixel edges, limited palette, dither/mottle instead of smooth gradients.
- Mid-dark base values (not pure-black voids, not bright stone).
- One material story per floor; accents are small and sparse, not the main event.
- Wall textures are orthographic front elevations; floor/ceiling are top-down planar —
  no baked-in perspective, no baked-in directional sun (that's the renderer's job:
  fog, vignette, torch flicker).
- Tiles must read as tileable, not as one unique hero image stamped on every face.

Explicitly rejected ("anti-pillars"): photoreal stone, PBR metal, soft painted AI
gradients, neon-cyberpunk-as-base (cyan is F5's *accent* only), bright clipping white
highlights, clean modern fantasy-crystal-cave polish.

Combat/UI chrome target ("FF6 window" language, already shipped in the action menu and
being retrofitted elsewhere): cobalt-blue vertical-gradient panel, light gray/white
border, rounded corners, white ▶ cursor, selected item in gold/yellow, unselected in
white, small hairline-separated footer hint row.

---

## Useful context that won't show up in a screenshot

- **The actual palette tokens**, from `:root` in `src/styles.css`: `--bg: #0e0d0a`,
  `--amber: #e0a458`, `--warm-white: #f5f0e6`, `--heal-green: #7abf7a`, `--danger-red:
  #c06060`, `--spell-blue: #7a9abf`, `--text-dim: #a09080`, `--border-default: #4a4035`.
  Judge "does this screen belong to the same palette family" against these concrete
  values rather than a vibe — if a screen's accent colors aren't drawn from (or a close
  cousin of) this set, that's a specific, citable cohesion finding.
- **The whole UI uses one custom pixel font, `FF36`** (fallback `Courier New` /
  monospace), via a single `--game-font` variable. CSS font sizes look large in the
  source (`--fs-header: 44px`, `--fs-message: 40px`, etc.) because the entire UI is
  drawn at a fixed design resolution and uniformly scaled down to fit the viewport —
  don't read those px values as literal on-screen size, and don't flag "the CSS says
  huge fonts" as a finding on its own.
- **Not every enemy has hand-drawn art, and that is accepted, not a bug.** Enemy sprites
  come from a third-party pack wired in per-enemy; enemies without a mapped sprite fall
  back to a flat procedural silhouette. A fight showing a mix of detailed sprites and
  plain shapes is expected. ("The procedural fallback itself looks worse than it needs
  to" is still a legitimate finding — just don't flag the *mix* as the problem.)
- **Screenshot capture hygiene.** The corridor has a small head-bob and an inter-tile
  camera tween; combat opens with a spiral wipe transition. A screenshot taken mid-motion
  will look subtly soft or offset for reasons that have nothing to do with the art —
  pause briefly after moving before capturing. (With repo access, `__onyxDebug.isIdle()`
  returns true exactly when nothing is mid-animation — capture only when idle.)
- **This project has explicit precedent for shipping a measured effect disabled.** A past
  pass implemented, measured, and deliberately shipped a walk-forward afterimage effect
  *off* because it didn't read as intended at this game's motion scale. "Implemented,
  measured, not worth it" is a respected recommendation here, not a hedge — don't feel
  pressure to recommend every technically-interesting effect just because it would work.
- **"Just put everything in one rendering engine" has already been considered and
  declined.** Moving the DOM menus into Phaser, or the corridor into WebGL, has come up
  before as a cohesion fix and was rejected — it would risk several hundred lines of
  currently-green DOM menu tests and the corridor's separately-tuned perf budget, for a
  payoff that's purely aesthetic. If a cohesion problem seems to trace back to "two
  rendering technologies," prefer a shared-token / shared-CSS-class fix over a
  shared-engine fix.
- **`src/styles.css` is one global stylesheet (~3,300 lines), no CSS modules or
  scoping.** A "just add a class" fix can have a wider blast radius than it looks like on
  a single screen — flag anything touching a broadly-shared selector as higher risk in
  the backlog, not just higher effort.
- **Existing screenshot/capture assets, if you have repo access.** `scripts/playtests/`
  already contains capture scripts for several past effects passes (death dissolve, cast
  FX, heal shine, afterimage pool, a corridor baseline) that may have left image
  artifacts worth reusing before asking for fresh manual screenshots.
- **`docs/playtests/2026-07-27-visual-design-pass.md`** is a real prior art-direction
  playtest doc, flagged current as of the last project status refresh, that predates the
  three "prior work" docs listed below — read it if you have repo access, since it may
  already contain findings this session would otherwise re-derive from scratch.
- **Tone target, beyond the technical style pillars:** quiet dread and
  resource-scarcity tension — Wizardry-lineage permadeath stakes, not a cozy pixel-art
  adventure. A proposal that would read as cute or whimsical is probably wrong for this
  game even if it's well executed on its own terms.

---

## Prior work — do not re-litigate without new evidence

These subsystems already had dedicated design passes. If your review agrees they're in
good shape, say so briefly and move on — don't spend the bulk of the analysis
rediscovering settled ground. If you disagree, say so explicitly with a screenshot
reference, because that's a real finding.

- **Dungeon corridor renderer** — went through a full art-direction pass (style guide +
  per-floor tilesets, fog/torch/glow/door behavior tuned). Reference doc, if you have
  repo access: `docs/TILESET-ART-STYLE-GUIDE.md` and `docs/PROMPT-maze-art-direction-pass.md`.
- **Combat presentation** — ported to Phaser 4 with five phases of effects work (death
  dissolve, cast bloom, heal shine, GO pooling, spotlight/tint). Reference docs:
  `docs/PROMPT-phaser-combat-port-plan.md`, `docs/PROMPT-phaser-combat-improvements-plan.md`,
  `docs/PROMPT-phaser-vs-canvas-visual-compare.md`.
- **Town / hub menus** — restyled from a DOS-text-menu look to match the FF6 combat
  window chrome. Reference doc: `docs/FOLLOWUP-TOWN-FF6-THEME-PROMPT.md`.

Screens/areas that have **not** had a dedicated pass, as far as this prompt's author
knows — treat these as the most likely place to find real, un-diminishing-returns work:
**camp screen, arena mode chrome, game-over screen, the ending sequence, party-creation
editor, and the dungeon HUD/message band** (mid-rework right now). Verify this claim
rather than trusting it — if repo access is available, check
`docs/AGENT-READING-LIST.md` for anything more recent that supersedes it.

---

## Hard constraints (violating these invalidates the plan)

1. This is a **presentation-only** pass. Do not propose changes to game logic,
   combat math, encounter rates, map/floor data, perk mechanics, or balance.
2. Do not propose removing any shipped renderer effect (fog, edge glow, vignette, CRT
   scanlines, torch flicker) — retuning with justification is fine, deletion is not.
3. Do not propose changing the corridor's perspective/vanishing-point math.
4. Combat: **Phaser is a painter only.** The turn/choreography clock of record lives in
   plain TypeScript (`combat-choreography.ts`) and must stay there — do not propose
   replacing it with Phaser's tween/timeline system. The `?phaser=0` canvas rollback
   path must stay viable.
5. **Boss display names are frozen:** The Dead Boy / The Lonely Girl / The Crying Man.
   Never propose reintroducing "Headmaster" or "Echo" as player-facing vocabulary —
   these are dead names from superseded lore.
6. No new build dependencies, no WebGL outside what Phaser combat already uses, no
   native/desktop packaging.
7. Corridor renderer perf floor: 60fps at 768×672 canvas intrinsic size. Any proposal
   that touches the corridor hot loop must say what it costs, not just what it looks like.

---

## What to attach (if this is a chat-only session without repo access)

Please capture and attach current screenshots of, at minimum:

1. **Title screen**
2. **Party creation** — both the ready-made-party choice screen and the custom editor
3. **Town / hub** main menu, plus one sub-screen (shop or temple)
4. **Camp screen**
5. **Dungeon corridor** — a straight corridor, and a 4-way intersection with a door, on
   at least two different floors (to compare floor-identity read)
6. **Dungeon HUD/message band** — with a notification message visible
7. **Combat** — the opening moment of a fight (action menu + full party/enemy layout)
8. **Combat** — a spell/AoE mid-cast, and a KO'd party member
9. **Victory screen** and **game-over screen**
10. **Arena mode** chrome
11. **Automap overlay** (`M` key in dungeon)

Label each screenshot by number when you reference it in your findings — do not write
"the town screen looks off" without pointing at image #3.

## If you have live repository access instead

Read, in this order: `AGENTS.md` (hard rules + file map), `CLAUDE.md` (orientation),
`docs/AGENT-READING-LIST.md` (avoid re-asserting stale findings), then the three prior-work
docs listed above. Run `npm run dev` and `npx vite preview --port 5176 --base
/OnyxLabyrinth/` to view screens directly rather than trusting descriptions. The debug
surface (`?debug=1` → `window.__onyxDebug`) has `jumpTo({ floorId, x, y, facing })` to
pin the camera for reproducible corridor screenshots, and `snapshot()` for structured
state. Do not modify any files in this session — this is a planning pass.

---

## Review rubric

Score each screen, then score cross-screen cohesion separately — the second part is the
part most likely to surface genuinely new findings.

### A. Per-screen (repeat for each screen in the checklist above)

1. **Readability** — can you tell what's interactive, what's selected, what state
   you're in, within 300ms? Squint-test it.
2. **Value structure** — does contrast carry information, or is everything the same
   mid-gray mush?
3. **Typographic hierarchy** — headers vs. body vs. hints vs. numbers; is there one?
4. **Adherence to the established identity** — does it look like it belongs in *this*
   game (pillars above), or does it look imported from a different project?
5. **Defects** — anything that looks accidental: clipping, overlap, misalignment,
   inconsistent spacing, orphaned/dead UI, colors that don't appear anywhere else in
   the game.

### B. Cross-screen cohesion (the actual point of this pass)

1. **Chrome consistency** — do the DOM screens (title/town/camp/party/game-over/arena)
   actually share one window skin, or do some still look like an earlier, unconverted
   style? Call out specific screens that feel behind the others.
2. **Palette consistency** — is there a single game-wide dark palette family, or do
   different screens each invent their own near-black/accent colors?
3. **Motion/juice consistency** — cursor blink rate, transition timing, hover/select
   feedback — do these feel like one designer's hand, or do some screens feel snappier
   / slower / cheaper than others?
4. **The seam moments** — specifically judge the *transitions between* screens (title→
   party creation, dungeon→combat swirl, combat→town on death/victory, dungeon↔camp).
   A great screen with a jarring transition into or out of it is still a seam.
5. **"One game" test** — if you saw all eleven screenshots with no labels, would you
   conclude they're the same game? Where does that conclusion break down first?

---

## Output format (required)

### 1. Executive summary (5–8 sentences)
Overall visual health. Is the biggest opportunity within individual screens, or in the
seams between them? Name the single highest-leverage fix.

### 2. Per-screen findings
One short subsection per screen from the checklist. For each: what already works (be
specific — this proves you actually looked), then defects, each tagged with the
screenshot number.

### 3. Cross-screen cohesion findings
The section that matters most. Structured around the rubric-B axes above.

### 4. Scored backlog
| ID | Finding | Screen(s) | Player-visible payoff (1–5) | Effort (S/M/L) | Risk (L/M/H) | Score |
|---|---|---|---|---|---|---|
Score = payoff ÷ (effort × risk numeric: S=1/M=2/L=3, L=1/M=1.5/H=2.5). Include items
you're explicitly **rejecting** as not worth doing, with one-line reasons — a backlog
with no rejections wasn't discriminating.

### 5. Phased plan
Each phase independently shippable, in priority order. For each phase: goal, which
backlog IDs it covers, and an exit criterion stated as something that could visibly
fail (not "looks better" — "screens X and Y share the same panel border radius and
gradient stops").

### 6. Routing recommendation
For any phase whose scope substantially overlaps one of the three "prior work" prompts
above (corridor / combat / town), say so explicitly and recommend dispatching that
specific phase to that specific prompt rather than reinventing its scope here.

### 7. Open questions (max 5)
Only things the screenshots/description genuinely can't settle.

---

## Constraints on the output

- Every claim needs a screenshot reference (or, with repo access, a file:line reference).
- No invented technical root causes ("this is definitely a z-index bug") unless you can
  see the DOM/CSS — prefer symptom + cause *class* over a fabricated specific cause.
- Do not propose corridor perspective changes, combat rules changes, or lore/boss-name
  changes.
- If a screen or comparison is impossible to judge from what's provided, say
  "insufficient evidence" rather than guessing.
- Plan only. No code, no diffs, no file edits in this session.

---

## What happens after this session

The plan this produces is meant to be pasted back into a coding session (Claude Code,
at the repo root) for execution, one phase at a time, following the same
plan-first-execute-after-approval discipline used elsewhere in this project. Write the
plan assuming that handoff — concrete enough that an implementer who has not seen this
conversation can pick up a single phase and act on it.
