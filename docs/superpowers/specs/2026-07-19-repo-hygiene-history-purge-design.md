# Repo Hygiene: History Purge + Tracking Rationalization

Date: 2026-07-19
Status: Approved design, pre-implementation
Sub-project: 1 of 3 ("rationalize git structure & software base" initiative;
sub-project 2 = repo layout & deploy pipeline, sub-project 3 = god-file
architecture refactors — both out of scope here)

## Problem

The repository carries ~107MB of historical dead weight that has nothing to do
with the shipped game:

| Path | Historical blob weight | Current-tree size | Why it's in git |
|------|------------------------|-------------------|-----------------|
| `playtest-screenshots/` | 42.4 MB | 44 MB (309 tracked files) | verification artifacts committed by habit |
| `docs/` (built-bundle churn) | ~17 MB of the 29.9 MB total | 13 MB | every past deploy added fresh hashed JS/CSS |
| `assets/` | 27.6 MB | 54 MB (4,370 tracked files) | raw source art packs (jewelflame, Classic Dungeons, Creature Extended), incl. byte-identical duplicate portraits |
| `vfx-audit/` | 7.3 MB | 7.5 MB (68 tracked PNGs) | one-off audit screenshots |

Result: 5,851 tracked files (only 144 in `src/`), a 153MB `.git`, and a root
directory mixing design docs, audit reports, one-off preview HTML, and config.

Reference points established during inventory:

- `assets/` is referenced **only** by `scripts/generate-jewelflame-preview.mjs`,
  `scripts/generate-jewelflame-100x100-preview.mjs`, and
  `scripts/generate-jewelflame-creature-extended-preview.mjs`. Nothing in the
  runtime, build, or tests touches it.
- Must stay tracked: `public/assets/` (12MB shipped art), `src/assets/`
  (460KB bundled tilesets), `docs/assets/` current content (GitHub Pages
  deploy output — Pages serves committed `docs/`).
- Both non-main branches (`cursor/combat-ui-polish-b`, `feat/arena-renderer`)
  are fully merged into `main` (zero unmerged commits) and safe to delete.
- `git-filter-repo` is installed (`~/.local/bin/git-filter-repo`).
- Remote: `https://github.com/sloppymo/OnyxLabyrinth.git`, 268 commits on
  `main` (at design time), solo project — no other known clones.

## Decision (user-approved)

Full history rewrite (**Approach A**): purge `assets/`,
`playtest-screenshots/`, `vfx-audit/`, and `docs/assets/` from **all** commits
and refs, re-add current `docs/assets` in one fresh commit, force-push.
Rejected: forward-only removal (keeps the 153MB forever) and fresh-start
squash (destroys all 268 commits of `src` history — `git blame`/archaeology
is the valuable part).

All four purged paths keep their **on-disk** copies: `assets/`,
`playtest-screenshots/`, `vfx-audit/` become ignored local directories
(generation scripts and screenshot workflows keep working); `docs/assets`
becomes normally tracked again via the re-add commit.

## Success criteria

1. `.git` ≤ ~55MB (from 153MB), measured by `du -sh .git` after rewrite + gc.
2. `git rev-list --objects --all` contains zero entries under the four purged
   paths.
3. `git log --follow` on any long-lived `src/` file shows its full pre-purge
   history (code history survives intact).
4. `npm run build` and `npm test` pass on the rewritten `main`.
5. The GitHub Pages site serves identical content after the force-push —
   the re-added `docs/assets` is byte-identical to what was there before.
6. A verified mirror backup exists before any destructive step and is kept
   until the user explicitly approves deleting it.

## Runbook

### Phase 1 — Backup (non-destructive)

```bash
git clone --mirror . ../OnyxLabyrinth-backup-20260719.git
git -C ../OnyxLabyrinth-backup-20260719.git rev-list --all --count   # >= 269
```

### Phase 2 — Pre-stash + rewrite

`git filter-repo` resets the working tree to the rewritten HEAD; the four
purge dirs would be **deleted from disk** without a pre-copy.

```bash
mkdir -p /tmp/onyx-stash
cp -r assets playtest-screenshots vfx-audit /tmp/onyx-stash/
cp -r docs/assets /tmp/onyx-stash/docs-assets   # distinct name: two "assets" dirs would merge
git filter-repo --path assets/ --path playtest-screenshots/ \
  --path vfx-audit/ --path docs/assets/ --invert-paths --force
```

Notes:

- filter-repo removes the `origin` remote (by design) — re-added in Phase 5.
- filter-repo rewrites all refs; the two merged branches become redundant
  rewritten duplicates — delete them locally:
  `git branch -d cursor/combat-ui-polish-b feat/arena-renderer`
- filter-repo runs its own repack; verify with `du -sh .git` and
  `git gc --prune=now` only if the size hasn't dropped.

### Phase 3 — Restore + hygiene commits

1. Restore on-disk copies:
   `cp -r /tmp/onyx-stash/assets /tmp/onyx-stash/playtest-screenshots /tmp/onyx-stash/vfx-audit .`
   and `cp -r /tmp/onyx-stash/docs-assets docs/assets`.
2. `.gitignore` additions (root-anchored so `src/assets` / `public/assets`
   stay tracked):

   ```
   /assets/
   /playtest-screenshots/
   /vfx-audit/
   ```

3. Commit A: re-add current `docs/assets/` + the `.gitignore` update
   (`chore(repo): untrack asset packs and screenshot archives, purge history`).
4. Commit B (best-effort, defer if tangled): move the five stray root preview
   HTMLs — `jewelflame-preview.html`,
   `jewelflame-creature-extended-preview.html`,
   `jewelflame-100x100-preview.html`, `sprite-preview.html`,
   `sprite-preview-standalone.html` — into `tools/`. First grep
   `vite.config.ts`, `scripts/`, and `tools/` for references and update them.
   If any reference can't be cleanly updated, skip the move entirely and leave
   it for sub-project 2 (layout). Do not half-move.

### Phase 4 — Verification gate (before any push)

- [ ] `du -sh .git` ≈ 40–55MB
- [ ] `git rev-list --objects --all | awk '$2 ~ /^(assets\/|playtest-screenshots\/|vfx-audit\/)/' | wc -l` → 0
- [ ] `git log --oneline --all -- docs/assets | wc -l` → 1 (only the re-add
      commit; all older bundle churn is gone)
- [ ] `git log --follow --oneline -- src/game/combat.ts | wc -l` shows its
      full history
- [ ] `git fsck` clean
- [ ] `npm run build` exit 0, `npm test` all green
- [ ] `git status` clean except the untracked/ignored local dirs
      (`.firecrawl/`, `.playwright-cli/`, and the three newly-ignored dirs)

### Phase 5 — Force-push (separate explicit step, after gate passes)

```bash
git remote add origin https://github.com/sloppymo/OnyxLabyrinth.git
git push --force origin main
git push origin --delete cursor/combat-ui-polish-b feat/arena-renderer
```

- Pages redeploys automatically from `docs/` on the new `main`; verify the
  live site loads after the push.
- Report the final `.git` size and the backup location.

## Rollback

- **Pre-push:** restore any ref from the mirror:
  `git fetch ../OnyxLabyrinth-backup-20260719.git 'refs/heads/*:refs/heads/*'`
  or re-clone from the mirror and start over.
- **Post-push:** force-push the mirror's refs back to origin, then re-attempt.
- The mirror is deleted only on explicit user approval, no sooner than a few
  days after a successful push.

## Risks and accepted costs

- **Working-tree deletion during filter-repo** — mitigated by the `/tmp`
  pre-stash plus the mirror backup.
- **Commit hashes all change** — audit logs/docs that reference old hashes
  (e.g. `logs/.c2f40bef...-audit.json`, any hash mentions in docs) go stale.
  Cosmetic; accepted.
- **Old commits lose built bundles and the four dirs** — historical commits
  are no longer independently deployable/screenshot-complete. Nobody
  redeploys or audits old commits; accepted.
- **Force-push window** — anyone with an old clone must re-clone. Solo
  project; accepted.
- **GitHub-side caches** — Pages may serve cached assets briefly after
  redeploy; hashed filenames make this harmless.

## Explicitly out of scope

- Splitting `docs/` into documentation vs. built site; consolidating
  `scripts/` and `tools/`; broader root reorganization (sub-project 2).
- Refactoring `combat.ts` / `combat-scene.ts` / `town-ui.ts` / `main.ts`
  (sub-project 3).
- Git LFS (shipped art is only 12MB — unnecessary).
- Deleting the `/tmp/onyx-stash` copy or the mirror backup (user's call).
