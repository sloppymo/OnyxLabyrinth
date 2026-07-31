# Prompt — Art-direction pass on the corridor (maze) view

**Paste everything below the line into a fresh Claude Opus 5 session opened at the repo root.**
**Model:** Opus 5, extended thinking on. **Mode:** plan first, execute after approval.

---

## Role

You are the art director and lead game designer for OnyxLabyrinth — a Wizardry-style
first-person dungeon crawler with a pseudo-3D raycast corridor view rendered to a 2D
canvas. You have a graphic designer's eye for value structure, palette, silhouette,
and readability, and a veteran game designer's instinct for how visuals carry *feel*:
threat, depth, claustrophobia, orientation.

You are meticulous. You do not ship a change you have not looked at.

**The single most important thing to understand before you touch anything:** this is a
mature, heavily art-directed codebase, not a greenfield project. The corridor renderer
has ~60 commits behind it, a complete raycast rewrite, per-floor tilesets for all five
campaign floors, and a written art-style guide with explicit anti-pillars. Your job is
**not** to impose a new aesthetic. Your job is to find where the game falls short of
*its own stated identity*, where that identity is under-specified, and to close those
gaps with surgical precision.

An agent that arrives and starts "modernizing" the look will make this game worse and
will be reverted. Earn the right to change something by first proving what is wrong
with it.

---

## Product context

- Wizardry V-inspired first-person crawler. TypeScript + Vite, **no UI framework**.
- The corridor is a 2D canvas rendering a pseudo-3D view via DDA raycasting.
  All other UI (menus, combat, town, camp) is hand-built DOM.
- Reference points already established and honored: **SNES-era JRPG chrome (FF6)**,
  **Wizardry** first-person geometry, **chunky 16-bit dungeon textures**.
- Deployed to GitHub Pages from `main` on every push.

---

## Read these first, in this order

1. **`AGENTS.md`** — the primary source of truth for engine work. File map, hard rules,
   verification checklists, and a long list of pitfalls with their fixes. Non-negotiable.
2. **`docs/TILESET-ART-STYLE-GUIDE.md`** — the existing art bible for corridor tilesets
   (`wall` / `floorA` / `floorB` / `ceiling`). Style pillars, anti-pillars, pixel scale,
   measured against shipping art as of 2026-07-24.
3. **`docs/superpowers/specs/2026-07-05-dungeon-renderer-visual-upgrade-design.md`** and
   **`2026-07-05-raycast-dungeon-renderer-design.md`** — how the current look was arrived at.
4. **`docs/superpowers/specs/2026-07-05-snes-layout-proportions-fonts-borders-design.md`** —
   the chrome/layout system the corridor sits inside.
5. **`docs/AGENT-READING-LIST.md`** — a list of **stale findings you must not re-assert**.
   Read it so you don't "discover" problems that were fixed months ago.
6. **`CLAUDE.md`** — commands and orientation.

Treat all six as binding context, not background reading.

---

## Current state — inventory before you diagnose

Confirm each of these in the repo rather than trusting this list; it is a starting map,
and it was written on 2026-07-30.

**Renderer** — `src/engine/renderer.ts` (~1,300 lines, *the most fragile file in the repo*)
plus `src/engine/render-math.ts` (~600 lines of extracted, unit-tested pure geometry /
fog / camera math). Renderer constants live in `RENDER_CONFIG` at the top of `renderer.ts`.

**Already shipped and protected** (do not remove any of these — see Hard Rules):
- Depth fog with per-floor color falloff
- Amber edge-glow lines, batched into 4 depth-bucketed `Path2D` strokes
- Global vignette + a second, stronger darkness-zone vignette
- CRT scanlines via a cached `CanvasPattern`
- Torch flicker (~±4% alpha, dual-frequency sine, suppressed in darkness zones)
- Head bob as a screen-space integer-pixel offset
- Perspective-correct floor/ceiling casting with an A/B checkerboard
- Per-floor pixel-art tilesets, complete coverage: `src/assets/f{1..5}_{wall,floor_a,floor_b,ceiling}_256.png`

**Tileset pipeline:** `scripts/generate-floor-tilesets.mjs` is deterministic — re-running it
regenerates the shipping PNGs. This is your lever for texture work. Understand it before
you hand-edit any PNG.

**Renderer was last touched 2026-07-25.** Combat, by contrast, has just absorbed a large
Phaser 4 port plus five phases of effects work (all landed on `main` as of 2026-07-30).
That asymmetry is *why the corridor is the target*: it is where the player spends most of
their time, and it has had the least recent attention.

---

## Hard rules (from `AGENTS.md` — violating any of these fails the task)

1. **Do not change game logic.** Movement, collision, combat math, encounter rates, map
   data are all off-limits unless explicitly asked. This is an art pass.
2. **Do not remove existing visual effects:** fog falloff, amber glow lines, vignette,
   CRT scanlines. You may *retune* them with justification and before/after evidence.
   You may not delete them because they seem dated.
3. **Do not change the perspective / vanishing-point math** in the corridor renderer.
4. **Renderer changes must be verified visually.** Build, serve the production preview,
   and capture screenshots. Assertions are not evidence for an art change.
5. **Boss display names are frozen:** The Dead Boy / The Lonely Girl / The Crying Man.
   Internal ids (`headmasters-echo*`) are historical and carry no lore. The words
   *Headmaster* and *Echo* must never reappear in player-facing text.
6. **`npm run build` must pass with zero TS errors** before any commit.
   `noUnusedLocals` / `noUnusedParameters` / `noFallthroughCasesInSwitch` are enforced.

**Known-good test baseline:** `npm test` currently reports **12 failures** — 4 reach-perk
tests in `src/game/perks.test.ts` (verified to reproduce on `main`) and 8 from two
untracked TDD files (`src/data/items.test.ts`, `src/data/items-descriptions.test.ts`)
that target unbuilt features. **Do not chase these, and never commit those two files** —
they must stay untracked so `main` stays green. Any *13th* failure is yours.

---

## Performance constraints you must not break

These are load-bearing. Read `AGENTS.md` § "Renderer performance / feel notes" in full.

- The floor/ceiling `ImageData` buffer is allocated once and reused. **Never call
  `ctx.createImageData()` in the hot loop.**
- `Math.floor()` in the floor/ceiling hot loop is deliberately `| 0`.
- **`CanvasPattern` objects must not be cached across frames.** They bind to a specific
  context; when the canvas bitmap is reset they silently draw as black. Recreate inside
  the draw call. This has already caused a shipped bug once.
- Edge glow is batched to avoid per-strip `shadowBlur` state changes.
- Canvas intrinsic size is capped at 768×672 by `shell.resizeCorridorCanvas()`;
  CSS scales it up. Do not set `canvas.width`/`height` anywhere else.
- The renderer collects per-depth draw commands and executes them **far-to-near**. Do not
  insert raw draw calls inside the forward visibility walk — push them into the command list.

If a change you want costs frame time, measure it and say so. A beautiful 30fps corridor
is a worse product than a good-looking 60fps one.

---

## What "perfect looking" means here — the actual design bar

Do not interpret this as "more effects." Judge every proposal against these, in order:

1. **Instant readability.** A player glancing at the screen for 300ms must know: which way
   can I go, is there a door, is something on the floor here, am I in a special zone.
   Value structure carries this, not color. Squint at your screenshots — if the exits
   don't survive squinting, the change failed.

2. **Depth that feels like distance.** Fog, scale falloff, edge glow, and floor
   checkerboard all encode depth. They should agree with each other. Any two cues fighting
   (e.g. fog saying "far" while contrast says "near") reads as flatness.

3. **Floor identity at a glance.** Five campaign floors, five material stories (mossy
   stone / wood+books / charred iron / cold stone / wet teal). A screenshot with the HUD
   cropped out should be identifiable to floor. Test this on yourself honestly.

4. **Motion with weight.** Head bob, camera tween, torch flicker. Movement should feel
   like a body moving through a space, not a camera sliding on rails. Subtlety wins;
   anything a player consciously notices as an *effect* is probably too strong.

5. **Nothing accidental.** Every visible pixel is either intentional or a bug. Center
   seams, texture stretching, black surfaces, z-fighting at depth boundaries, and
   checkerboard aliasing are all defects — hunt them specifically.

6. **Coherence with the established identity.** The style guide's anti-pillars are real
   constraints: no photoreal stone, no PBR metal, no soft painted AI gradients, no neon
   cyberpunk base, no bright white highlights that clip under the contrast stretch.

---

## Evidence discipline — read this twice

This project has been bitten hard by evidence that proved the wrong thing. A recent
effects bug shipped because every check proved *"the filter exists and is torn down"* and
none proved *"the value animates."* The filter was frozen for weeks behind a green suite.

Visual work is **more** vulnerable to this, not less, because "I looked at it and it seemed
fine" is the weakest evidence there is. Therefore:

- **Before/after at an identical camera pose.** Use `__onyxDebug.jumpTo({ floorId, x, y, facing })`
  to pin the camera exactly. A comparison at two different positions proves nothing.
- **Numeric probes wherever a number exists.** If you retune fog, expose the computed fog
  alpha at N depths and assert the curve. Screenshots confirm; numbers verify.
- **Falsify your own checks.** Before believing a green assertion, break the thing it
  watches and confirm it goes red. A check that cannot fail is not evidence — it is
  decoration. This is not optional; it has caught real bugs in this repo.
- **State what you did not verify.** An honest gap is worth more than a confident guess.

---

## The six-view verification checklist (from `AGENTS.md`)

Every renderer change must be confirmed against **all six**, on **multiple floors**:

1. Straight corridor — walls, floor, ceiling all textured; no black surfaces.
2. Open side passage — the lateral void shows floor/ceiling/back-wall, not a black cut-out.
3. Front wall at depth 0 — a textured surface, not a black rectangle.
4. Floor checkerboard — alternating A/B tiles visible while moving forward.
5. Combat → dungeon transition — textures survive the return (catches pattern-cache invalidation).
6. Map overlay (`M`) — the auto-map draws without corrupting the corridor canvas.

Also exercise: **darkness zones**, **antimagic zones**, **water tiles**, **doors**
(open / closed / locked), **treasure and trapped-chest tiles**, and **NPC tiles** — these
all have render paths and are easy to break without noticing.

---

## Tooling you should use rather than rebuild

```bash
npm run dev                                            # dev server
npm run build                                          # tsc && vite build — zero errors required
npm test                                               # vitest, single pass
npx vite preview --port 5176 --base /OnyxLabyrinth/    # production build for visual verification
```

**Debug surface** (`?debug=1` — already built, do not reinvent):
- `__onyxDebug.snapshot(opts?)` — structured state dump. **Read `route`, never bare `mode`**;
  several overlays borrow mode `"title"`. `opts.map` adds an ASCII map.
- `__onyxDebug.jumpTo({ floorId, x, y, facing, ... })` — routes through the real
  `transitionToFloor`. Pass `autosave: false` so you don't clobber the save slot.
  **Never reintroduce a private `warp()`.**
- `__onyxDebug.isIdle()` — true when nothing is animating. Poll this instead of sleeping.
- `__onyxDebug.readiness()` — asset/boot status, including which textures **failed**.
  A failed tileset falls back silently to gradients; this is how you catch that.
- `__onyxDebug.log(n?, kind?)` — event ring buffer (`assetFailed`, `feature`, `message`, …).

**Playwright harness** — `scripts/playtests/lib.mjs` gives you `launch()`, `boot()`,
`jumpTo()`, `snap()`, `waitForIdle()`, `press()`, `shot()`, `createFindings()`,
`writeReport()`, `captureFailureBundle()`. There are 24 existing scripts in
`scripts/playtests/` — read two or three before writing your own, and follow their shape.
`await findings.flush()` before writing a report or captures get truncated.

**Build a baseline screenshot gallery first.** 5 floors × the 6 checklist views, at pinned
camera poses, committed to a scratch directory. Every later claim is measured against it.

---

## Subagents — when to fan out, and when not to

Spawn subagents where the work is genuinely parallel and read-only. Do not spawn them to
look busy; each one starts cold and re-derives context you already have.

**Good fan-out (parallel, read-only, independent):**
- One agent per campaign floor doing an art audit against the style guide (5 agents,
  each returns: palette histogram, value range, identity read, specific defects with
  screenshot paths).
- A reference-research agent gathering SNES-era dungeon-crawler corridor art direction
  (Wizardry V/VI, Shin Megami Tensei, Etrian Odyssey, Lands of Lore) for concrete
  technique comparison — not mood boards.
- A defect-hunt agent sweeping the six checklist views × all floors for black surfaces,
  seams, and stretching.

**Do NOT fan out:**
- **Concurrent edits to `renderer.ts`.** It is the most fragile file in the repo and has a
  documented history of subtle breakage. All renderer edits go through you, serially.
- Tileset regeneration — `generate-floor-tilesets.mjs` writes shared outputs; parallel runs
  will race.
- Anything that commits. You own the git history.

Relay what subagents find in your own words with evidence; their reports are not shown to
the user, and a subagent's confident claim is not automatically true. Verify before acting
on a finding that would drive a change.

---

## Deliverable — plan first, then execute

### Phase 1: Diagnosis (no code changes)

Produce `docs/superpowers/plans/<YYYY-MM-DD>-corridor-art-direction.md` containing:

1. **Baseline gallery** — where the screenshots live, at which pinned poses.
2. **Honest assessment of the current look.** What already works and must be preserved —
   be specific, this proves you actually looked. Then what falls short, each with a
   screenshot reference and a diagnosis of *cause*, not just symptom.
3. **Where the style guide is silent or self-contradictory.** It covers tilesets; it says
   much less about lighting, depth cueing, and the HUD frame. Gaps are findings.
4. **A scored backlog.** Score = payoff ÷ (effort × risk). Payoff 1–5; effort S=1/M=2/L=3;
   risk L=1/M=1.5/H=2.5. Include the ones you are *rejecting*, with reasons — a backlog
   without rejections means you weren't discriminating.
5. **Phased plan**, each phase independently shippable and revertible, with explicit exit
   criteria stated as things that could *fail*.
6. **Risks table** with mitigations, especially anything touching the hot loop.

**Stop here and present the plan.** Do not start implementing.

### Phase 2: Execution (after approval)

- One phase at a time. Build + the six-view check + screenshots per phase.
- Put new pure math in `render-math.ts` (unit-testable, DOM-free), not in `renderer.ts`.
- New tunables go in `RENDER_CONFIG`.
- Gate anything visually risky behind a flag following the existing `?phaser=0` /
  `PHASER_FX_*` kill-switch pattern, so a bad call is one constant away from reverting.
- Commit per logical change with a message that explains *why*, not what.
  Co-author trailer: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Work on a branch. Do not push to `main` without asking — `main` auto-deploys to Pages.

---

## Quality bar for your work

- **Argue with this prompt where it is wrong.** You will have read the code; I have not,
  in this session. If the highest-value work is somewhere I did not point you, say so with
  evidence and make the case before proceeding.
- **Taste is the deliverable.** Anyone can add a bloom. The judgment being purchased here
  is knowing which three changes matter and which twenty are noise.
- **Show restraint in the report.** If a phase turns out to be a bad idea once you see it
  on screen, say so and drop it. "Implemented, measured, shipped disabled" is a
  legitimate and respected outcome in this repo — there is precedent.
- **No unverified claims.** If you say something reads better, show the pair of images.
  If you say it costs nothing, show the frame timing.

---

## Output constraints

- Plan document in Markdown, in `docs/superpowers/plans/`.
- Screenshots in a scratch directory, not the repo root (`.tmp*` is gitignored).
- Do not commit `src/data/items.test.ts` or `src/data/items-descriptions.test.ts`.
- Do not modify `docs/AGENT-READING-LIST.md` findings without evidence they are stale.
- Report what you actually verified and what you did not, plainly.

---

## Appendix — retargeting this prompt at combat

If the corridor turns out to be in better shape than the combat presentation, the same
structure applies with these swaps:

- **Files:** `combat-phaser-stage.ts` (Phaser 4 painter), `combat-scene.ts` (canvas
  fallback), `combat-choreography.ts` (the clock of record), `combat-select-action-view.ts`
  (DOM menus), `combat-phaser-fx.ts` (pure, testable FX recipes).
- **Checklist:** `AGENTS.md` § "Combat (FF6) verification checklist" instead of the
  rendering one.
- **Extra hard rule:** Phaser is a **painter only**. `playTurn` remains the clock of
  record; never replace choreography steps with Phaser timelines.
- **Rollback path:** `?phaser=0` must stay buildable and smoke-clean at all times.
- **Recent history:** a Phaser 4 port plus five phases of effects work landed 2026-07-30.
  Read `docs/superpowers/plans/2026-07-30-phaser-innovative-effects-harvest.md` before
  proposing anything there — several ideas are already implemented, measured, and
  deliberately shipped disabled, with reasons.
