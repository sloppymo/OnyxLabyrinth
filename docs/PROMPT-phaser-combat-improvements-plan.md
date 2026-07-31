# Prompt — Plan Phaser-powered combat improvements (post-port)

Copy everything below the line into a fresh multimodal LLM session with **repo
access**. Ask for a **plan only** — no implementation until reviewed.

Attach optional screenshots of current Phaser combat if you have them (parity
vs canvas, boss fight, spell VFX). Screenshots are helpful but not required.

---

## Role

You are a senior game presentation / VFX architect who knows Phaser 4 well.
OnyxLabyrinth has **already ported combat painting to Phaser 4.2.1**. Your job
is **not** to re-plan that port. Your job is to:

1. Inspect the live codebase and current combat presentation.
2. Identify **high-leverage improvements that Phaser uniquely (or cheaply)
   enables** vs the old canvas painter — things that were hard or impossible
   before.
3. Produce a **phased implementation plan** (design-ready) for the best
   improvements, ordered by player-visible payoff ÷ engineering risk.

Do **not** write production code in this session. Do **not** change combat math,
encounters, perks, floors, or corridor rendering unless a tiny presentation-only
hook is unavoidable (prefer zero `src/game/` edits).

## Product

OnyxLabyrinth is a Wizardry-style first-person dungeon crawler (TypeScript +
Vite, no UI framework). Corridor = custom canvas. Combat = FF6-style
enemies-LEFT / party-RIGHT. Rules live in pure `src/game/`. Deploy = GitHub
Pages.

**Read before proposing anything:**

- `AGENTS.md` (combat checklist, hard rules, debug surface)
- `CLAUDE.md`
- `docs/AGENT-READING-LIST.md` (avoid stale combat/perk claims)
- **Authoritative port design:**
  `docs/superpowers/specs/2026-07-29-phaser-combat-port-design.md`
- Port plan (may lag):  
  `docs/superpowers/plans/2026-07-29-phaser-combat-renderer.md`

## Current architecture (post-port — verify in repo)

**Invariant (do not break):** Phaser is the **painter only**. Choreography stays
in `combat-choreography.ts` (`playTurn` / `updateScene` / `CombatScene`).
`CombatEvent[]` still drives timing. DOM FF6 menus stay
(`combat-select-action-view.ts`) — Scope C (menus into Phaser) was deferred on
purpose.

| Piece | Path / note |
|-------|-------------|
| Pure choreography | `src/engine/combat-choreography.ts` |
| Canvas painter (rollback) | `src/engine/combat-scene.ts` |
| Stage interface | `src/engine/combat-stage.ts` (`?phaser=0` rollback) |
| Phaser painter | `src/engine/combat-phaser-stage.ts` (dynamic import) |
| Controller | `src/engine/combat-ui.ts` |
| Layout math | `src/engine/combat-scene-math.ts` |
| Strips | `public/assets/{enemies,party,effects}/`, `sprite-manifest.ts` |
| Pin | `"phaser": "4.2.1"` exact; `Phaser.AUTO` intent via WEBGL→CANVAS probe (AUTO + custom canvas throws in 4.x) |
| Sibling canvas | `#combat-phaser-canvas` — never reuse `#combat-canvas` (sticky 2d context) |

**Known recent fixes / residuals (re-verify; do not re-open as mystery):**

- Ground-plane: sprites must sit at `ResolvedSlot.centerY` with origin (0.5,0.5);
  planting at `drawY` floated the formation ~½ sprite-height (fixed on branch;
  may be uncommitted on top of `a3d386e`).
- Teardown: drive `runDestroy()`; `removeCanvas: false`; cache WebGL probe.
- Bundle: ~1.39 MB / ~364 KB gz Phaser chunk behind dynamic import; namespace
  `import * as Phaser` defeats tree-shaking (named imports / custom-build later).
- Banner chrome approximate; injectable RNG for particles not wired; Scope C
  deferred.
- Boss display names: **The Dead Boy / The Lonely Girl / The Crying Man** —
  internal ids `headmasters-echo*` frozen; never restore “Headmaster/Echo”
  player-facing vocabulary.

## What “improved with Phaser” means

Focus on capabilities that were **painful or impossible** in the old immediate-mode
canvas painter, especially Phaser 4.2.x:

1. **Spine skeletal animation** (Mesh2D-batched spine-phaser-v4) — bosses/party
   breathing, cast poses, slot-attached Phaser objects (popups/icons on bones).
2. **Stencil / StencilReference** — persistent masks; richer battle transitions;
   spell “windows”; silhouette reveals.
3. **Mesh2D** — non-rect warps (hit squash, floor buckle, portals).
4. **Dual tint (`setTint2` / `MULTIPLY_TWO`)** — layered burn/poison/phase FX.
5. **Cone lights + Filters** (glow, vignette, bloom-like, pixelate) — acting-character
   spotlight, boss intro, cast bloom, death desaturate.
6. **Anim / atlas pipeline** — Aseprite/TexturePacker/Spine → less
   `sprite-manifest` hand maintenance.
7. **Camera / layer juice** still driven by existing `CombatEvent` timing (do not
   replace `playTurn` with Phaser tweens as the clock of record).

Also consider **engineering improvements** that Phaser enables: named imports /
custom build size, texture NEAREST guarantees, debug layout probes, effect
pooling, etc. — but rank player-facing work above bundle nits unless size is a
ship blocker.

## Explicit non-goals

- Porting corridor / town / camp / title to Phaser
- Rewriting combat rules, perks, techniques, AI, floors
- Moving DOM menus into Phaser **unless** you argue Scope C with a clear ROI
  and a way to keep ~800 lines of green menu tests
- Replacing the choreography engine with Phaser timelines (timing hazards are
  documented in the port design — asymmetric FAST, death-frame formula, step
  push order, etc.)
- Native/desktop packaging, true 3D corridors
- Renaming boss ids or restoring retired lore vocabulary

## Research steps (do these before writing the plan)

1. Skim `combat-phaser-stage.ts` — what is already mirrored (actors, shadows,
   popups, barks, banner, nameplate, effects, particles, glows, shake, cues).
2. Skim `combat-choreography.ts` headers + `playTurn` / VFX style tables — what
   data already exists that Phaser could render richer.
3. Skim effect/party/enemy asset layout and `sprite-manifest.ts`.
4. Skim `battle-transition.ts` — candidate for stencil/filter upgrade.
5. Check `package.json` for Phaser pin and whether Spine is already a dep
   (likely not).
6. Optionally run / read playtests: `scripts/playtests/smoke-phaser-combat.mjs`,
   `combat-only-pass-2026-07-28.mjs`, `ab-phaser-ground-plane.mjs`.
7. For Phaser 4.2 capabilities, prefer primary sources:
   - https://phaser.io/news/2026/07/phaser-4-2-spine-renderer-mesh2d-stencil
   - https://phaser.io/news/2026/06/phaser-v4-2-0-released
   - https://esotericsoftware.com/spine-phaser (Spine + Mesh2D)

Do not invent Phaser APIs. If unsure a feature exists in **4.2.1**, mark it as
needing a package `.d.ts` check.

## Opportunity scoring (required)

Build a short backlog table before the plan:

| ID | Opportunity | Player-visible win | Effort (S/M/L) | Risk | Depends on art? | Phaser feature |
|----|-------------|--------------------|----------------|------|-----------------|----------------|
| … | … | … | … | … | yes/no | Filters / Spine / … |

Score **payoff ÷ (effort × risk)**. Pick a **recommended track** of 3–6 items
for the plan; park the rest as icebox.

Prefer opportunities that:

- Reuse existing `CombatEvent` / `CombatScene` fields (no rules changes)
- Need little or no new art for a first vertical slice
- Improve **readability** (what just happened) as much as spectacle

## Plan deliverable

Write a markdown plan ready to save under
`docs/superpowers/plans/YYYY-MM-DD-phaser-combat-improvements.md`
(and a short design sibling under `docs/superpowers/specs/` if scope is large).

### Required sections

1. **Executive summary** — recommended track, rough calendar (days), why these
   over icebox.
2. **Current-state gaps** — what Phaser combat still lacks vs canvas parity *and*
   vs the new ceiling (be honest; separate parity bugs from net-new FX).
3. **Opportunity backlog** — full scored table.
4. **Architecture constraints** — restate painter-only / DOM menus / event clock;
   any new module boundaries (`combat-phaser-fx.ts`, Spine loader, etc.).
5. **Phased work** — each phase with:
   - Goal + player-visible demo
   - Files to touch
   - Exit criteria (`npm run build`, tests, Arena/`?phaser=0` regression, AGENTS
     combat checklist items)
   - Rollback story
6. **Art / content pipeline** (if Spine or new atlases) — formats, folder
   conventions, what authors must supply.
7. **Risks** — WebGL context leaks, filter cost on 768×672, Spine license/size,
   jsdom (no Phaser in unit tests; dynamic import stays), GitHub Pages base URL.
8. **Test strategy** — what stays unit-tested; what is Playwright/Arena-only;
   same-seed `?phaser=0` vs default captures for visual regressions.
9. **Commit sequence** — conventional commits, small vertical slices.
10. **Open questions** for the human (max 5).

### Suggested phase shape (adapt freely; argue if wrong)

Example order from prior product discussion — **challenge it with evidence**:

1. Parity polish remaining (filters NEAREST, banner chrome, soft sprites if still
   soft after geometry fix)
2. Low-art juice: dual tint, camera/object Filters, acting spotlight / cone light
3. Stencil-enhanced battle transition / spell masks
4. Mesh2D hit/warp FX for a few signature spells
5. Spine pilot on **one** boss (The Dead Boy) before rolling to others
6. Bundle hygiene (named imports / custom build) as a separate chore PR

## Quality bar for *your* plan

A strong plan makes an implementer able to:

- Ship a first vertical slice in ≤2 days that players notice
- Keep `?phaser=0` canvas path green as rollback
- Avoid rewriting `playTurn`
- Know exactly which art is required vs procedural/filter-only

If tradeoffs exist (Spine vs Filters-first; Scope C vs stay DOM), present **2
options with a recommendation**.

## Output constraints

- Concrete file names and APIs; no generic “add more polish.”
- Distinguish **parity debt** vs **net-new Phaser leverage**.
- Do not propose corridor Phaser work.
- Do not propose restoring Headmaster/Echo player-facing names.
- Plan only — no `src/` edits in this session.
