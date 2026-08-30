# Shared worktree handoff

OnyxLabyrinth is often developed in several checkouts at once. This page is
operating guidance for agents; it is not a product specification, a branch
selection, or a promise that the working tree is clean. Always inspect the
checkout you were given before editing.

## Before editing

1. Run `pwd`, `git status --short --branch`, and `git worktree list`.
2. Treat every existing modification and untracked file as owned by another
   task until you have verified otherwise. Read its diff before touching it.
3. Work only in the current checkout unless the task explicitly assigns a
   different worktree. Do not switch branches to make a change for someone
   else.
4. Read [`AGENT-READING-LIST.md`](AGENT-READING-LIST.md) and
   [`CURRENT-PRODUCT-CONTRACT.md`](CURRENT-PRODUCT-CONTRACT.md) before product,
   combat, progression, or entry-flow work.

## Safe git operations

- Stage explicit paths belonging to the current task. Never use blanket
  `git add -A` in a shared dirty tree.
- Do not run `git reset --hard`, broad `git restore`, `git clean`, rebases,
  force-pushes, or garbage collection/pruning without explicit owner approval.
- Do not delete branches or worktrees merely because they look old; an active
  checkout or unreachable object may contain another agent's recovery point.
- Do not commit `dist/`, `assets/`, `playtest-screenshots/`, `vfx-audit/`, or
  other ignored/generated output. Existing tracked evidence under `output/`
  should be removed or migrated only in a separately reviewed cleanup.

## Product and code authority

- The fixed Old Man + Rat King campaign and its two hero-owned card pools are
  defined by [`CURRENT-PRODUCT-CONTRACT.md`](CURRENT-PRODUCT-CONTRACT.md).
- `src/game/card-trial/cards.ts` is the current campaign's locked 24-card
  catalogue. `src/game/card-trial/six-school-cards.ts` is deferred experimental
  material and must not drive campaign rewards, legality, or resolver work.
- The product contract describes the target product; legacy Town, XP, perks,
  equipment, gold, classic combat, and related code may still exist as
  migration debt. Do not extend a legacy system without an explicit contract
  change.
- Keep rules in `src/game`, content in `src/data` / `src/content`, and visual
  presentation in `src/engine`. Follow the file map and shared choreography
  rules in [`../AGENTS.md`](../AGENTS.md).

## Before handoff or commit

- Run `npm run check` (or record the exact blocker and the narrower checks that
  did run). Renderer, combat, audio, and visual changes also require the
  browser/evidence checks described in `AGENTS.md`.
- Review `git diff --stat` and `git diff --name-only`; confirm that every
  staged path belongs to this task and that unrelated work remains unstaged.
- Record the branch, commit(s), verification result, intentionally preserved
  dirty paths, and any follow-up in the next handoff message.

