# Repo Hygiene History Purge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink `.git` from 153MB to ~40-55MB by purging `assets/`, `playtest-screenshots/`, `vfx-audit/`, and historical `docs/assets/` churn from all git history, while keeping every file on disk and the Pages site identical.

**Architecture:** Mirror-backup first, then a single `git filter-repo` pass over all refs, then restore-on-disk + re-add-current-`docs/assets` as normal commits, verification gate, force-push. Spec: `docs/superpowers/specs/2026-07-19-repo-hygiene-history-purge-design.md`.

**Tech Stack:** git, `git-filter-repo` (`~/.local/bin/git-filter-repo`), bash, npm (build/test as the post-rewrite sanity gate).

**Ground rules for the executor:**
- Work from the repo root `/home/sloppymo/OnyxLabyrinth` unless a step says otherwise.
- Do NOT skip the backup verification (Task 1) or the verification gate (Task 7).
- The force-push (Task 8) runs only after the gate passes and only with the user's go-ahead already given for this plan.
- If any step's actual output differs materially from "Expected", STOP and report — do not improvise around a failed check.

---

### Task 1: Mirror backup

**Files:** none (creates `../OnyxLabyrinth-backup-20260719.git` outside the repo)

- [ ] **Step 1: Record the current commit counts**

Run: `git rev-list --all --count && git log --follow --oneline -- src/game/combat.ts | wc -l`
Expected: `--all` count ≈ 271 (remember it as N); combat.ts follow count = 30 (Task 7 compares against this exact number).

- [ ] **Step 2: Create the mirror**

Run: `git clone --mirror . ../OnyxLabyrinth-backup-20260719.git`
Expected: `Cloning into bare repository ... done.` (no errors)

- [ ] **Step 3: Verify the mirror has every ref and commit**

Run: `git -C ../OnyxLabyrinth-backup-20260719.git rev-list --all --count && git -C ../OnyxLabyrinth-backup-20260719.git branch -a`
Expected: count equals N; branches `main`, `cursor/combat-ui-polish-b`, `feat/arena-renderer` all present.

### Task 2: Pre-stash purge dirs to /tmp

**Files:** none (copies; `filter-repo` will delete these from the working tree in Task 3)

- [ ] **Step 1: Copy the four dirs**

Run:
```bash
mkdir -p /tmp/onyx-stash && \
cp -r assets playtest-screenshots vfx-audit /tmp/onyx-stash/ && \
cp -r docs/assets /tmp/onyx-stash/docs-assets
```
Expected: no output, exit 0. (`docs-assets` name is deliberate — two `assets` dirs must not merge.)

- [ ] **Step 2: Verify the stash is complete**

Run: `du -sh /tmp/onyx-stash/* | sort -h`
Expected: four entries — `assets` ≈ 54MB, `playtest-screenshots` ≈ 44MB, `docs-assets` ≈ 13MB, `vfx-audit` ≈ 7.5MB.

### Task 3: Purge history with git filter-repo

**Files:** rewrites all git refs; working tree is reset to the rewritten HEAD

- [ ] **Step 1: Confirm the working tree has no staged/modified tracked files**

Run: `git status --porcelain`
Expected: only untracked lines (`?? .firecrawl/`, `?? .playwright-cli/`); no ` M`/`A ` lines.

- [ ] **Step 2: Run the purge**

Run:
```bash
git filter-repo --path assets/ --path playtest-screenshots/ \
  --path vfx-audit/ --path docs/assets/ --invert-paths --force
```
Expected: ends with something like `Repacking... done` / `New history written`; no `Aborting` line. Note that `origin` is now removed (by design) — Task 8 re-adds it.

- [ ] **Step 3: Confirm the purge dirs vanished from the working tree**

Run: `ls assets playtest-screenshots vfx-audit docs/assets 2>&1`
Expected: `No such file or directory` for all four.

### Task 4: Delete the fully-merged stale branches (local)

**Files:** none

- [ ] **Step 1: Delete both branches**

Run: `git branch -d cursor/combat-ui-polish-b feat/arena-renderer`
Expected: `Deleted branch ...` for both. (They were verified merged into main with zero unmerged commits during planning; if `-d` refuses, STOP and report — do not use `-D`.)

### Task 5: Restore on-disk dirs and rationalize tracking

**Files:**
- Modify: `.gitignore` (append entries below)
- Restored on disk: `assets/`, `playtest-screenshots/`, `vfx-audit/`, `docs/assets/`
- Untracked (stay on disk): the six generated preview HTMLs

- [ ] **Step 1: Restore the four dirs from the stash**

Run:
```bash
cp -r /tmp/onyx-stash/assets /tmp/onyx-stash/playtest-screenshots /tmp/onyx-stash/vfx-audit . && \
cp -r /tmp/onyx-stash/docs-assets docs/assets
```
Expected: no output, exit 0. `ls docs/assets | wc -l` ≈ the pre-purge count (~30-40 entries incl. `sfx/`).

- [ ] **Step 2: Append the new `.gitignore` entries**

Run:
```bash
cat >> .gitignore <<'EOF'

# Repo-hygiene purge (2026-07-19): large local-only dirs — never track
/assets/
/playtest-screenshots/
/vfx-audit/

# Generated preview HTML (outputs of scripts/generate-*.mjs — regenerated on demand)
/jewelflame-preview.html
/jewelflame-preview-index.html
/jewelflame-100x100-preview.html
/jewelflame-creature-extended-preview.html
/sprite-preview.html
/sprite-preview-standalone.html
EOF
```
Expected: no output, exit 0.

- [ ] **Step 3: Untrack the six generated preview HTMLs (keep on disk)**

Run:
```bash
git rm --cached --quiet jewelflame-preview.html jewelflame-preview-index.html \
  jewelflame-100x100-preview.html jewelflame-creature-extended-preview.html \
  sprite-preview.html sprite-preview-standalone.html
```
Expected: `rm '...'` lines (or silent with `--quiet`), exit 0; `ls sprite-preview.html` still exists on disk.

- [ ] **Step 4: Commit the tracking rationalization**

Run:
```bash
git add .gitignore docs/assets && \
git commit -m "chore(repo): untrack asset packs, screenshot archives, generated previews"
```
Expected: commit summary showing `.gitignore` modified, six `delete mode` lines for the preview HTMLs, and the `docs/assets` files re-added.

### Task 6: Update spec cross-references (cosmetic, one commit)

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add the hygiene note to AGENTS.md**

Append to the "Project basics" section of `AGENTS.md` (after the Deployment line):

```markdown
- **Repo hygiene (2026-07-19):** `assets/`, `playtest-screenshots/`, `vfx-audit/` are local-only (gitignored, purged from history — see `docs/superpowers/specs/2026-07-19-repo-hygiene-history-purge-design.md`). Root `*-preview.html` files are generated by `scripts/generate-*.mjs` and gitignored; regenerate on demand.
```

Then:
Run: `git add AGENTS.md && git commit -m "docs(agents): note gitignored local dirs and generated previews"`
Expected: one file changed.

### Task 7: Verification gate — ALL must pass before any push

**Files:** none (read-only checks + build/test)

- [ ] **Step 1: Repo size dropped**

Run: `du -sh .git`
Expected: ≈ 40–55MB (from 153MB). If still >100MB, run `git gc --prune=now` once and re-measure; if still large, STOP and report.

- [ ] **Step 2: Purged paths are gone from all history**

Run: `git rev-list --objects --all | awk '$2 ~ /^(assets\/|playtest-screenshots\/|vfx-audit\/)/' | wc -l`
Expected: `0`

- [ ] **Step 3: docs/assets history is flattened to the re-add commit**

Run: `git log --oneline --all -- docs/assets | wc -l`
Expected: `1`

- [ ] **Step 4: src history survived**

Run: `git log --follow --oneline -- src/game/combat.ts | wc -l`
Expected: `30` — identical to the pre-purge count recorded in Task 1.

- [ ] **Step 5: Repo integrity**

Run: `git fsck`
Expected: no `error`/`fatal` lines (`dangling` notices are fine).

- [ ] **Step 6: Build and tests**

Run: `npm run build && npm test 2>&1 | tail -5`
Expected: build exit 0 with zero TS errors; `Test Files  44 passed`, `Tests  1003 passed`.

- [ ] **Step 7: Working tree state is as expected**

Run: `git status --porcelain`
Expected: empty or only `??` lines for `.firecrawl/` / `.playwright-cli/`.

### Task 8: Force-push and remote cleanup

**Files:** none (remote operations; user go-ahead for this task was given with plan approval)

- [ ] **Step 1: Re-add the remote**

Run: `git remote add origin https://github.com/sloppymo/OnyxLabyrinth.git`
Expected: exit 0, no output.

- [ ] **Step 2: Force-push rewritten main**

Run: `git push --force origin main`
Expected: `+ ... main -> main (forced update)`.

- [ ] **Step 3: Delete the stale remote branches**

Run: `git push origin --delete cursor/combat-ui-polish-b feat/arena-renderer`
Expected: `- [deleted]` for both.

- [ ] **Step 4: Verify the live Pages site**

Wait ~60s, then run: `curl -sL -o /dev/null -w "%{http_code}" https://sloppymo.github.io/OnyxLabyrinth/`
Expected: `200`. (Hashed asset names mean no stale-cache risk.)

- [ ] **Step 5: Report**

Report: final `.git` size, new HEAD hash, backup mirror location
(`../OnyxLabyrinth-backup-20260719.git`), and the reminder that the mirror
and `/tmp/onyx-stash` are deleted only on the user's say-so.

---

## Rollback (any task, any failure)

- Pre-push: `git fetch ../OnyxLabyrinth-backup-20260719.git 'refs/heads/*:refs/heads/*'` restores every ref; then `git reset --hard main`.
- Post-push: push the mirror's refs back with `--force`, then re-attempt from Task 3.
- The mirror and `/tmp/onyx-stash` survive until the user explicitly approves deletion.
