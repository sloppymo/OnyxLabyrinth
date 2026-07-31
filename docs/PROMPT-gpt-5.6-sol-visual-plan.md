# Prompt — OnyxLabyrinth visual improvement plan (tuned for GPT-5.6 Sol)

**How to run this:** paste everything below the line into a GPT-5.6 Sol session
(ChatGPT, API, or Codex). Set `reasoning_effort: high` — this is a one-shot,
quality-first planning task, not latency-sensitive, so it's worth the spend; try
`xhigh` if your budget allows. Set `text.verbosity: high` as a starting point; the
Output section below governs actual shape. If your session has live repository/tool
access (Codex, a connector, code execution), use it per the Tools section — the
model's own guidance is to *render visual artifacts before finalizing claims about
them*, not reason from code alone. If it's ChatGPT/API with no repo access, attach
the screenshots listed under Tools instead.

This prompt is deliberately lean — per OpenAI's own GPT-5.6 prompting guidance
(outcome, success criteria, constraints, stop rules; no restated process the model
already handles). If you want the fuller, model-agnostic narrative version of this
brief with more prose context, see the sibling file
`docs/PROMPT-comprehensive-visual-improvement-plan.md` in this repo — same task,
written for a model without documented lean-prompt behavior.

---

## Role

Senior art director + UI/UX lead reviewing the full visual presentation of
**OnyxLabyrinth**, a Wizardry-style first-person dungeon crawler (TypeScript + Vite,
no UI framework, deployed to GitHub Pages). Two rendering technologies coexist: a
custom 2D-canvas raycast corridor, and Phaser 4.2.1 for combat (with a `?phaser=0`
canvas-painter rollback); everything else (title, party creation, town, camp,
game-over, arena, ending, dungeon HUD) is hand-built DOM recently reskinned toward
"FF6 blue combat window" chrome. Five campaign floors, one material story each: F1
Flooded Crypt (mossy stone), F2 Cursed Library (wood+books), F3 Forge of Ashes
(charred iron), F4 Null Choir (cold stone), F5 Weeping Cistern (wet teal/cyan accent).

**Brand:** chunky 16-bit dungeon textures — dark, desaturated, sparse luminous
accents, readable at corridor scale, never photoreal, never busy. Tone: quiet dread,
resource-scarcity tension (Wizardry-lineage permadeath stakes) — not cozy pixel-art
whimsy.

**Ground truth to check claims against**, not vibes: palette tokens in
`src/styles.css` `:root` — `--bg:#0e0d0a` `--amber:#e0a458` `--warm-white:#f5f0e6`
`--heal-green:#7abf7a` `--danger-red:#c06060` `--spell-blue:#7a9abf`
`--text-dim:#a09080` `--border-default:#4a4035`. One custom pixel font (`FF36`,
`--game-font`) across every screen; CSS font-size tokens look large (`--fs-header:
44px`) because the whole UI renders at a fixed design resolution and scales down to
fit the viewport — don't read that as literal on-screen size.

## Personality

Direct and specific. Every visual claim carries a citation — a screenshot number or a
`file:line`. State findings plainly; when evidence is insufficient, say
"insufficient evidence" rather than guess.

## Collaboration

Make reasonable assumptions about ambiguous material and state them rather than
blocking. Do not implement changes in this session — diagnose and plan only. Ask at
most 5 questions, only for things the material genuinely cannot settle, at the end of
your response, not mid-stream.

**Progress reporting** (only relevant if you're running tool calls): one short
preamble before your first tool call, then sparse updates at real phase changes only.
Don't narrate routine reads.

## Goal

Produce one prioritized, phased plan to improve OnyxLabyrinth's visual presentation —
individual screens **and** the cohesion between them — specific enough that a coding
session with no memory of this conversation can pick up a single phase and execute it.

## Success criteria

The plan distinguishes, with evidence for each:
1. What already works and must be preserved (proves you actually looked).
2. Per-screen defects, each tied to a screenshot/file citation.
3. **Cross-screen cohesion** gaps specifically — chrome consistency, palette
   consistency, motion/juice consistency, and the transition moments *between*
   screens. This axis is the actual point of the review; don't let it collapse into
   a list of per-screen nitpicks.
4. A scored, prioritized backlog including items explicitly rejected as not worth it.
5. A phased, independently-shippable plan with a falsifiable exit criterion per
   phase (a specific thing that could visibly fail — not "looks better").

## Constraints

**Invariant — never propose these:**
- Game-logic, combat-math, encounter-rate, map/floor-data, or balance changes.
- Removing a shipped renderer effect (fog, edge glow, vignette, CRT scanlines, torch
  flicker) — retuning with before/after evidence is fine, deletion is not.
- Corridor perspective/vanishing-point changes.
- Replacing Phaser-combat's choreography clock (`combat-choreography.ts`) with
  Phaser tweens/timelines — Phaser is a painter only; `?phaser=0` must stay viable.
- Restoring "Headmaster" or "Echo" as player-facing text — dead lore vocabulary.
  Boss display names are frozen: The Dead Boy / The Lonely Girl / The Crying Man.
- Moving DOM menus into Phaser, or the corridor into WebGL, "for consistency" —
  already considered and declined once (risks ~800 lines of green DOM-menu tests
  and the corridor's tuned 60fps budget for a purely aesthetic payoff). If cohesion
  problems trace to "two rendering technologies," prefer a shared-token/shared-CSS
  fix over a shared-engine fix.
- New build dependencies, WebGL beyond what Phaser combat already uses, native/
  desktop packaging.

**Known, accepted gaps — do not flag these as the finding:**
- Not every enemy has hand-drawn art; unmapped enemies fall back to a flat
  procedural silhouette by design. (A screenshot with a mix of detailed and flat
  enemies in one fight is expected — though "the fallback itself could look better"
  is still a fair finding.)
- A past pass implemented, measured, and deliberately shipped a walk-forward
  afterimage effect **disabled** because it didn't read right at this game's motion
  scale. "Implemented, measured, not worth it" is a respected recommendation here.
- The dungeon HUD/message band has a typewriter-reveal notification window that just
  landed and is expected to still be rough.

**Already had a dedicated pass — cite evidence before re-litigating:** the corridor
renderer/tileset art direction, the Phaser-4 combat port and its effects work, and
the town/hub FF6-chrome reskin. If your review agrees these are in good shape, say so
in one line and move on.

## Tools

**If you have repository/code access (Codex, connector, code execution):**
Read, in order: `AGENTS.md`, `CLAUDE.md`, `docs/AGENT-READING-LIST.md` (stale-finding
list — don't re-derive settled findings), then `docs/TILESET-ART-STYLE-GUIDE.md`,
`docs/PROMPT-maze-art-direction-pass.md`, `docs/PROMPT-phaser-combat-port-plan.md`,
`docs/PROMPT-phaser-combat-improvements-plan.md`, `docs/FOLLOWUP-TOWN-FF6-THEME-PROMPT.md`,
`docs/playtests/2026-07-27-visual-design-pass.md`. Check `scripts/playtests/` for
existing capture scripts/artifacts (`capture-phaser-*.mjs`, `corridor-baseline-capture.mjs`)
before generating new screenshots from scratch. `src/styles.css` is one ~3,300-line
global sheet, no scoping — treat broadly-shared-selector changes as higher-risk, not
just higher-effort, in your backlog scoring.

If you can execute code: run `npm run dev` / `npx vite preview --port 5176 --base
/OnyxLabyrinth/` and **render the actual screens before making a claim about them** —
don't infer visuals from source alone. The debug surface (`?debug=1` →
`window.__onyxDebug`) exposes `jumpTo({floorId,x,y,facing})` to pin the corridor
camera and `isIdle()` to know when nothing is mid-animation — capture only when idle,
since head-bob / camera tween / the combat wipe transition will fake soft or offset
art in a mid-motion capture.

**If this is chat/API with no repository access:** work from attached screenshots
only. Request, if not already provided: title screen; party creation (both the
ready-made choice screen and the custom editor); town main menu + one sub-screen;
camp; dungeon corridor (straight + a 4-way intersection with a door, on two floors);
dungeon HUD with a notification visible; combat open (menu + full layout); combat
mid-AoE/spell with a KO'd member; victory screen; game-over screen; arena; automap
overlay. Label findings by screenshot number.

## Output

1. **Executive summary** (5–8 sentences) — is the bigger opportunity within screens or
   in the seams between them; name the single highest-leverage fix.
2. **Per-screen findings** — one subsection each, works-well then defects, cited.
3. **Cross-screen cohesion findings** — chrome, palette, motion/juice consistency;
   the transition moments (title→party, dungeon→combat swirl, combat→town, dungeon↔camp);
   the "eleven unlabeled screenshots — same game?" test and where it breaks first.
4. **Scored backlog** — table: ID / finding / screen(s) / payoff 1–5 / effort S-M-L /
   risk L-M-H / score (payoff ÷ effort×risk, S/M/L=1/2/3, L/M/H=1/1.5/2.5). Include
   rejected items with one-line reasons.
5. **Phased plan** — each phase: goal, backlog IDs covered, falsifiable exit criterion.
6. **Routing** — flag any phase that substantially overlaps the corridor/combat/town
   prompts already cited, and recommend dispatching it there instead of replanning
   from scratch.
7. **Open questions** (max 5) — only what the material truly can't settle.

Write the plan assuming its next reader is a fresh coding session with no memory of
this conversation, at the repo root, ready to execute one phase at a time after a
human approves it.

## Stop rules

Resolve in the fewest tool loops that still produce cited, checkable evidence — don't
sacrifice citation quality to finish faster, and don't burn extra loops re-reading
material that hasn't changed. Prefer inspecting the actual file/render over guessing
whenever the tooling exists to do so. This session is plan-only: there is nothing to
approve mid-session and nothing destructive to gate — proceed through diagnosis and
planning without pausing for permission, and stop once the Output section's seven
parts are complete.
