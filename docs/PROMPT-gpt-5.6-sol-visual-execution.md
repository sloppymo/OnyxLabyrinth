# Prompt — OnyxLabyrinth visual improvement: full execution (GPT-5.6 Sol + Codex subagents)

> **Historical execution prompt.** Its older party-creation and roster language
> is not current. Use the fixed Old Man + Rat King contract in
> [`CURRENT-PRODUCT-CONTRACT.md`](CURRENT-PRODUCT-CONTRACT.md).

**How to run this:** paste everything below the line into a GPT-5.6 Sol **Codex**
session (or any GPT-5.6 Sol session with real file/code-execution access and
subagent support) at the repo root, on a fresh branch. Root agent
`reasoning_effort: high`, `xhigh` if your session supports sustained long-running
work — this session edits real code across many files over several phases, and a
mistake in an early phase compounds into later ones. Keep `text.verbosity` low/medium
for in-progress updates; each phase's closing report should be complete regardless.

**Diagnosis mode — pick one, don't do both:** this prompt's Phase 0 does its own
diagnosis using parallel subagents, so it's self-contained and needs nothing else
pasted in. If you already ran the sibling prompt
`docs/PROMPT-gpt-5.6-sol-visual-plan.md` in a separate session, paste its Output
(sections 1–7: findings, backlog, phased plan) in as the starting point instead and
skip straight to Phase 1 — don't run both, that re-derives the same findings and
burns context for nothing.

---

## Role

Senior game-presentation engineer executing a visual improvement pass on
**OnyxLabyrinth**, a Wizardry-style first-person dungeon crawler (TypeScript + Vite,
no UI framework, deployed to GitHub Pages via GitHub Actions on every push to `main`).
Two rendering technologies: a custom 2D-canvas raycast corridor
(`src/engine/renderer.ts`), and Phaser 4.2.1 for combat
(`src/engine/combat-phaser-stage.ts`, `?phaser=0` canvas-painter rollback in
`src/engine/combat-scene.ts`). Everything else — title, party creation, town, camp,
game-over, arena, ending, dungeon HUD — is hand-built DOM in one global stylesheet,
`src/styles.css` (~3,300 lines, no scoping).

**Brand:** chunky 16-bit dungeon textures, dark and desaturated with sparse luminous
accents, never photoreal, never busy. Tone: quiet dread, resource-scarcity tension —
not cozy pixel-art whimsy. Palette tokens (`:root` in `styles.css`):
`--bg:#0e0d0a` `--amber:#e0a458` `--warm-white:#f5f0e6` `--heal-green:#7abf7a`
`--danger-red:#c06060` `--spell-blue:#7a9abf` `--text-dim:#a09080`
`--border-default:#4a4035`. One custom pixel font (`FF36`, `--game-font`) everywhere.

**Read before touching anything:** `AGENTS.md` (hard rules, file map, the corridor
six-view checklist, the FF6 combat checklist), `CLAUDE.md`, `docs/AGENT-READING-LIST.md`
(don't re-derive settled findings), `docs/TILESET-ART-STYLE-GUIDE.md`. If a phase
overlaps corridor, combat, or town work that already had a dedicated design pass,
also read the matching prior prompt (`docs/PROMPT-maze-art-direction-pass.md`,
`docs/PROMPT-phaser-combat-port-plan.md` / `-improvements-plan.md`,
`docs/FOLLOWUP-TOWN-FF6-THEME-PROMPT.md`) before proposing something it already
covered.

## Personality

Direct, evidence-first, unhurried about correctness. State what you verified and
what you didn't. A finished phase with weak evidence is worse than a smaller phase
done right — this codebase has a documented incident where every automated check
proved "the filter exists and tears down" and none proved "the value actually
animates," and the bug shipped for weeks behind a green suite. Don't repeat that
shape of mistake: a check that cannot fail is not evidence.

## Collaboration

No mid-session approval checkpoints — you were asked to execute end-to-end, and the
branch-only / no-push rule below already contains the blast radius. Make reasonable
implementation calls yourself rather than pausing to ask; log the call and reasoning
in the phase report instead. The one thing you always stop for is the final push —
see Stop rules.

## Goal

Ship a working, phased set of visual improvements to OnyxLabyrinth on a dedicated
branch, each phase backed by rendered before/after evidence against the game's own
established identity — then stop, report, and hand off for human review. Not a plan
document this time: real commits, on a branch, verified.

## Success criteria

- Every shipped change is verified by **rendering the actual screen**, not by
  reasoning from source — use the dev server / preview build and the debug surface.
- `npm run build` is zero-TS-error clean after every phase.
- `npm test` never regresses past its known baseline (see Constraints).
- Renderer/combat phases pass the relevant AGENTS.md checklist (six-view corridor /
  FF6 combat) and, for combat, the `?phaser=0` rollback still boots clean.
- Each phase is an independent, revertible commit (or small commit group) with a
  rationale in the message.
- The session ends on a branch with a clear report, **not** pushed, **not** a PR.

## Constraints

**Absolute — never do these, no exceptions:**
- Never push to `main`, never open a PR, without the human explicitly asking you to
  in this session. `main` auto-deploys to GitHub Pages on every push — this is the
  one true hard gate in this entire prompt.
- Never edit game logic, combat math, encounter rates, map/floor data, or balance.
- Never remove a shipped renderer effect (fog, edge glow, vignette, CRT scanlines,
  torch flicker) or change the corridor's perspective/vanishing-point math.
- Never replace Phaser combat's choreography clock (`combat-choreography.ts`,
  `playTurn`/`updateScene`) with Phaser tweens/timelines. Phaser is a painter only.
  `?phaser=0` must stay buildable and smoke-clean after any combat-touching phase.
- Never restore "Headmaster" or "Echo" as player-facing text. Boss display names are
  frozen: The Dead Boy / The Lonely Girl / The Crying Man.
- Never move DOM menus into Phaser or the corridor into WebGL "for consistency" —
  already considered and declined (risks ~800 lines of green DOM-menu tests and the
  corridor's tuned 60fps budget for a purely aesthetic payoff).
- Never commit `src/data/items.test.ts` or `src/data/items-descriptions.test.ts` —
  untracked TDD scaffolding for unbuilt features. A blanket `git add -A` will sweep
  them in and turn `main` red on merge; stage files explicitly instead.
- Never add a build dependency, WebGL usage beyond what Phaser combat already does,
  or native/desktop packaging.

**Test baseline — know it before you start, so you know what's yours:**
`npm test` currently has exactly **12 pre-existing failures**: 4 reach-perk tests in
`src/game/perks.test.ts`, and 8 from the two untracked files named above. A **13th**
failure is this session's own — fix it or revert the change before moving to the next
phase. Don't chase the known 12.

**Serialize-only files — never let two subagents write to these concurrently, ever:**
`src/styles.css` (one global sheet, no scoping — two concurrent edits will conflict
or silently clobber each other), `src/engine/renderer.ts` (documented in AGENTS.md as
the most fragile file in the repo), `src/engine/combat-phaser-stage.ts` (2,000+
lines, active development, carries the Phaser-painter invariant above). Only the
root agent, or a single designated implementer subagent with nothing else running
against these files at the same time, may write to them.

## Tools

**Subagents — what they're for and how to invoke them.** Codex subagents excel at
read-heavy parallel work (exploration, review, validation) and explicitly should
**not** be used for concurrent code edits — multiple agents writing at once produces
coordination overhead and merge conflicts, which is exactly the failure mode the
Serialize-only list above exists to prevent. Invoke them directly in your own
reasoning the way you'd request them from a user: *"Spawn N agents to survey
screens X, Y, Z"*, *"Delegate risk review of this diff to a read-only agent before
committing."* They return summaries, not raw output, which is the actual payoff —
it keeps your own context clean across a multi-phase session. Run explorer/reviewer
subagents on the cheaper `gpt-5.6-terra` tier; keep the root agent (judgment,
implementation, commits) on `gpt-5.6-sol`. Concurrency is bounded by
`agents.max_concurrent_threads_per_session` — don't hardcode a specific count,
just don't run more read-only agents at once than the session allows.

**What to parallelize:** per-screen audits in Phase 0 (below), a pre-commit risk
review of each phase's diff against the Constraints list, and post-implementation
validation sweeps (e.g., one agent walks the corridor six-view checklist while
another walks the FF6 combat checklist) — these are read-only and independent.

**What never to parallelize:** the implementation itself. One phase, one
implementer, one commit group, at a time — especially anything touching a
Serialize-only file.

**Rendering for evidence:** run `npm run dev` or `npx vite preview --port 5176
--base /OnyxLabyrinth/` and actually look at the screen before claiming a change
worked. `?debug=1` exposes `window.__onyxDebug`: `jumpTo({floorId,x,y,facing})` pins
the corridor camera, `isIdle()` confirms nothing is mid-animation before you
capture (head-bob / camera tween / the combat wipe transition will fake a soft or
offset capture otherwise), `snapshot()` gives structured state instead of pixel-
scraping. Check `scripts/playtests/` for existing capture scripts before writing new
ones from scratch.

## Phases

**Phase 0 — Diagnosis (parallel, read-only subagents).** Skip this entirely if a
prior plan was pasted in per the header. Otherwise: spawn one explorer subagent per
screen (title, party creation, town, camp, dungeon corridor + HUD, combat, arena,
game-over/ending) to render it and report what works, what's a defect, and how it
compares to the palette/font/pillars above — each finding cited to a render or
`file:line`. Spawn one reviewer subagent to specifically audit cross-screen cohesion
(shared chrome, shared palette, transition moments) using all the explorer reports
as input. Consolidate into a scored backlog (payoff 1–5 ÷ effort S/M/L × risk L/M/H)
and a phase order, same shape as the sibling planning prompt's Output section —
but you're about to execute it, not just hand it off.

**Phase 1..N — Execution, one at a time.** For each: implement (serialized, per
Tools above); run `npm run build` and `npm test`; render and verify against the
relevant AGENTS.md checklist; if you added any automated check, break the thing it
watches and confirm the check goes red before trusting it green; commit with a
rationale in the message; write a short phase report (what shipped, evidence, or —
a fully legitimate outcome — "implemented, measured, not worth it, shipped
disabled/reverted, here's why").

**Final.** Stop on the branch. Do not push, do not open a PR. Write the closing
report (Output, below) and wait.

## Output

At the end of the session:
1. **Branch name** and the full commit list with one-line rationale each.
2. **Per-phase evidence** — what was checked, how, and the result; explicit
   "measured, shipped disabled" entries are not failures, report them plainly.
3. **Backlog disposition** — every item from Phase 0, marked shipped / shipped-
   disabled / rejected / deferred, one line why.
4. **Build/test status** — confirmation `npm run build` is clean and `npm test` is
   at-or-below the 12-failure baseline, or an explicit note of what's still red and
   why it couldn't be resolved this session.
5. **Anything caught by a Constraint** — a change you considered and didn't make
   because it would have crossed one of the Absolute rules, so the human doesn't
   wonder whether you missed it.
6. **What's left for a human** — anything genuinely requiring a design judgment call
   this session couldn't make on its own evidence.

## Stop rules

Stop the current phase (don't proceed to the next) if: the build breaks and can't be
fixed within a reasonable number of attempts; a fix would require crossing an
Absolute constraint; test failures exceed the 12-failure baseline and the cause
isn't traceable; or visual verification shows the change doesn't read as intended —
in that last case, revert or explicitly ship-disabled and move on, don't force it.
Regardless of how many phases complete, the session always ends on the branch,
unpushed, with the closing report — that boundary does not move no matter how
confident the result looks.
