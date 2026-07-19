# Repo Layout & Deploy Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy via GitHub Actions (no more committed build output in `docs/`), cull 14 root process docs down to 5 keepers in `docs/`, and consolidate dated tooling scripts — all verified by a green CI deploy.

**Architecture:** One workflow file + a series of `git mv`/`git rm`/edit commits, local verification gate, then flip Pages source and push. Spec: `docs/superpowers/specs/2026-07-19-repo-layout-deploy-pipeline-design.md`.

**Tech Stack:** git, GitHub Actions (`upload-pages-artifact`/`deploy-pages`), `gh` CLI (authenticated, `repo` + `workflow` scope), npm/node 22.

**Ground rules for the executor:**
- Work from the repo root `/home/sloppymo/OnyxLabyrinth`.
- All commits land locally first; the ONLY push is Task 7, after the local gate passes.
- If a verification step fails, STOP and report — do not improvise.

---

### Task 1: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/deploy.yml` with exactly:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit**

Run: `git add .github/workflows/deploy.yml && git commit -m "ci(deploy): GitHub Actions Pages deploy from dist"`
Expected: one file created.

### Task 2: Root markdown cull

**Files:**
- Move (root → docs/): `ARENA-REVIEW.md`, `PLAYTEST-DESIGN-REVIEW.md`, `PLAYTEST-REPORT.md`, `wizardry_v_clone_design_doc.md`, `wizardry-v-combat-reference.md`
- Delete: `ADVANCED_DEVELOPMENT_PROMPT.md`, `COMBAT-REVIEW-PROMPT.md`, `COMBAT-REVIEW-REPORT.md`, `HANDOFF-PROMPT.md`, `PLAYTEST-RESULTS.md`, `PLAYTEST-RESULTS-2026-07-14.md`, `VFX-AUDIT-REPORT.md`, `VFX-FEEL-ANALYSIS.md`, `POLISH-ISSUES-PROMPT.md`
- Edit: `docs/AGENT-READING-LIST.md`, `PLAYTEST-DESIGN-REVIEW.md` (post-move), `src/engine/arena-camera.ts:11`

- [ ] **Step 1: Move the 5 keepers**

Run: `git mv ARENA-REVIEW.md PLAYTEST-DESIGN-REVIEW.md PLAYTEST-REPORT.md wizardry_v_clone_design_doc.md wizardry-v-combat-reference.md docs/`
Expected: 5 renames staged.

- [ ] **Step 2: Delete the 9 stale files**

Run: `git rm --quiet ADVANCED_DEVELOPMENT_PROMPT.md COMBAT-REVIEW-PROMPT.md COMBAT-REVIEW-REPORT.md HANDOFF-PROMPT.md PLAYTEST-RESULTS.md PLAYTEST-RESULTS-2026-07-14.md VFX-AUDIT-REPORT.md VFX-FEEL-ANALYSIS.md POLISH-ISSUES-PROMPT.md`
Expected: 9 deletions staged.

- [ ] **Step 3: Fix reading-list links and stamp**

In `docs/AGENT-READING-LIST.md`:
- `](../ARENA-REVIEW.md)` → `](ARENA-REVIEW.md)`
- `](../PLAYTEST-DESIGN-REVIEW.md)` → `](PLAYTEST-DESIGN-REVIEW.md)`
- `](../PLAYTEST-REPORT.md)` → `](PLAYTEST-REPORT.md)`
- `](../COMBAT-ENGAGEMENT-AUDIT.md)` → `](COMBAT-ENGAGEMENT-AUDIT.md)` (already-broken link; the file lives in `docs/`)
- Delete the entire `POLISH-ISSUES-PROMPT.md` table row (file is deleted; its one live item — mobile map still lower priority — is already recorded in the PLAYTEST-REPORT row's caveat).
- Bump `**Last refreshed:** 2026-07-16 (...)` to `**Last refreshed:** 2026-07-19 (repo layout rationalization: root process docs culled; kept docs moved into docs/)`.

Verify: `grep -n "\.\./.*-REVIEW\|\.\./POLISH\|\.\./COMBAT-ENGAGEMENT" docs/AGENT-READING-LIST.md` → no output.

- [ ] **Step 4: Fix the two other references**

In `docs/PLAYTEST-DESIGN-REVIEW.md` line 24: change ``see `PLAYTEST-REPORT.md` / `POLISH-ISSUES-PROMPT.md` `` to ``see `PLAYTEST-REPORT.md` (`POLISH-ISSUES-PROMPT.md` removed from tree 2026-07-19) ``.

In `src/engine/arena-camera.ts` line 11: change `pitch 30° vs 28° in ARENA-REVIEW.md` to `pitch 30° vs 28° in docs/ARENA-REVIEW.md`.

- [ ] **Step 5: Commit**

Run: `git add -A && git commit -m "docs(repo): cull 9 stale root process docs, move 5 keepers into docs/"`
Expected: 5 renames, 9 deletions, 3 file edits in one commit.

### Task 3: Tooling consolidation

**Files:**
- Move: 6 playtest scripts → `scripts/playtests/`; 2 Python files → `scripts/`

- [ ] **Step 1: Move the playtest one-offs**

Run: `mkdir -p scripts/playtests && git mv scripts/playtest-2026-07-14.mjs scripts/playtest-2026-07-14-part2.mjs scripts/playtest-2026-07-14-part3.mjs scripts/playtest-controller-full.mjs scripts/playtest-floor-4.mjs scripts/playtest-perk-fix.mjs scripts/playtests/`
Expected: 6 renames staged.

- [ ] **Step 2: Move the Python generators**

Run: `git mv generate_ff6_battle_music.py generate_ff6_battle_music_simple.py scripts/`
Expected: 2 renames staged.

- [ ] **Step 3: Verify no references broke**

Run: `grep -rn "scripts/playtest-\|generate_ff6" package.json vite.config.ts tsconfig*.json scripts/ tools/ 2>/dev/null | grep -v "scripts/playtests/"`
Expected: no output (nothing references the old paths).

- [ ] **Step 4: Commit**

Run: `git add -A && git commit -m "chore(tooling): move dated playtest drivers to scripts/playtests, python generators to scripts/"`
Expected: 8 renames.

### Task 4: Delete committed build output from docs/

**Files:**
- Delete: `docs/assets/`, `docs/tools/`, `docs/index.html`, `docs/dungeon-hud-preview.html`, `docs/vfx-vignette.html`, `docs/favicon.svg`, `docs/icons.svg`, `docs/.nojekyll`

- [ ] **Step 1: Remove the build output from tracking**

Run: `git rm -r --quiet docs/assets docs/tools && git rm --quiet docs/index.html docs/dungeon-hud-preview.html docs/vfx-vignette.html docs/favicon.svg docs/icons.svg docs/.nojekyll`
Expected: ~400 deletions staged.

- [ ] **Step 2: Confirm only documentation remains**

Run: `git ls-files docs | grep -v "\.md$"`
Expected: only `docs/floor-map.schema.json` and `docs/superpowers/playtests/arena-vfx/*.png` lines.

- [ ] **Step 3: Commit**

Run: `git commit -m "chore(docs): remove committed build output; docs/ is documentation-only now"`
Expected: large deletion commit.

### Task 5: Rewrite deployment docs

**Files:**
- Modify: `AGENTS.md` (Deployment bullet + git-workflow item 3 + file map), `CLAUDE.md` (architecture line + Deployment section), `README.md` (deployment instructions)

- [ ] **Step 1: AGENTS.md**

Replace the Deployment bullet with:

```markdown
- **Deployment:** GitHub Actions builds `dist/` and deploys to Pages on every push to `main` (`.github/workflows/deploy.yml`). Deploy = `git push`. `docs/` is documentation-only — never copy `dist/` into it. Local check: `npx vite preview --port 5176 --base /OnyxLabyrinth/`.
```

Replace git-workflow item 3 (`**Refresh docs/ for GitHub Pages.** ...`) with:

```markdown
3. **Deploy by pushing.** Merging/pushing to `main` runs the Actions deploy. Do NOT copy `dist/` into `docs/` — build output is CI-produced since 2026-07-19.
```

In the file map, at the end of the `tools/floor-editor.ts` / `scripts/floor-tool.ts` row (after the text `keys are \`*-key\` chest strings).`), append: ` Dated one-off playtest drivers live in \`scripts/playtests/\`.`

- [ ] **Step 2: CLAUDE.md**

Line 11: change `Deployed to GitHub Pages from the \`docs/\` folder.` to `Deployed to GitHub Pages by GitHub Actions on every push to \`main\` (\`docs/\` is documentation-only).`

Replace the `### Deployment (GitHub Pages from \`docs/\`)` section body (the `cp -r dist/* docs/` commands and "Commit and push `docs/`...") with:

```markdown
### Deployment (GitHub Actions)

Every push to `main` runs `.github/workflows/deploy.yml`: `npm ci` → `npm run build` → deploy `dist/` to Pages. There is no manual copy step; `docs/` holds documentation only. Verify a deploy with `gh run list --workflow=deploy.yml --limit 1`.
```

- [ ] **Step 3: README.md**

Replace the deployment lines (`GitHub Pages serves the \`docs/\` directory.` through the `cp -r dist/* docs/` block) with:

```markdown
GitHub Actions builds and deploys `dist/` to Pages on every push to `main`.
```

- [ ] **Step 4: Commit**

Run: `git add AGENTS.md CLAUDE.md README.md && git commit -m "docs(deploy): deployment is GitHub Actions; docs/ is documentation-only"`
Expected: 3 files changed.

### Task 6: Local verification gate — ALL must pass

- [ ] **Step 1: Build + tests**

Run: `npm run build && npm test 2>&1 | tail -4`
Expected: build exit 0 (the `arena-camera.ts` comment edit is the only `src/` touch); `Tests  1003 passed`.

- [ ] **Step 2: No dangling references to moved files at old paths**

Run: `git grep -n "(\.\./ARENA-REVIEW\|(\.\./PLAYTEST-DESIGN-REVIEW\|(\.\./PLAYTEST-REPORT\|(\.\./wizardry" -- '*.md'`
Expected: no output.

- [ ] **Step 3: docs/ is documentation-only**

Run: `git ls-files docs | grep -vE "\.md$|floor-map\.schema\.json|superpowers/playtests/arena-vfx/"`
Expected: no output.

- [ ] **Step 4: Root is clean**

Run: `git ls-files | grep -v "/"`
Expected: only `AGENTS.md`, `CLAUDE.md`, `README.md`, `.gitignore`, config files (`package.json`, `package-lock.json`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`), and the three root vite-input HTMLs (`index.html`, `vfx-vignette.html`, `dungeon-hud-preview.html`) — nothing else.

- [ ] **Step 5: Working tree clean**

Run: `git status --porcelain`
Expected: only `?? .firecrawl/` and `?? .playwright-cli/`.

### Task 7: Flip Pages source, push, verify live

**Files:** none (remote operations; the user's go-ahead was given with plan approval)

- [ ] **Step 1: Flip Pages to workflow mode (minimizes downtime — do this immediately before pushing)**

Run: `gh api repos/sloppymo/OnyxLabyrinth/pages -X PUT -f build_type=workflow --jq '.build_type'`
Expected: `workflow`. If the API call fails: ask the user to set Settings → Pages → Source = "GitHub Actions", then continue.

- [ ] **Step 2: Push**

Run: `git push origin main`
Expected: normal (non-forced) push of the Task 1-5 commits.

- [ ] **Step 3: Watch the first CI deploy**

Run: `sleep 5 && gh run watch --exit-status $(gh run list --workflow=deploy.yml --limit 1 --json databaseId --jq '.[0].databaseId')`
Expected: exit 0, all steps green. (The `sleep 5` gives GitHub a moment to register the run so the inner `gh run list` doesn't come back empty.)

- [ ] **Step 4: Verify the live site**

Wait ~30s, then run:
```bash
curl -sL -o /dev/null -w "site: %{http_code}\n" https://sloppymo.github.io/OnyxLabyrinth/
curl -sL -o /dev/null -w "wav: %{http_code}\n" https://sloppymo.github.io/OnyxLabyrinth/assets/sfx/combat/attack-hit.wav
curl -sL -o /dev/null -w "floor-editor: %{http_code}\n" https://sloppymo.github.io/OnyxLabyrinth/tools/floor-editor.html
```
Expected: three `200`s.

- [ ] **Step 5: Report**

Report: CI run URL, final root file listing, and confirmation that sub-project 2 is complete (sub-project 3 = god-file refactors remains).

---

## Rollback

- Any task before Task 7: `git reset --hard origin/main` (nothing has left the machine).
- After Task 7: flip Pages back (`gh api repos/sloppymo/OnyxLabyrinth/pages -X PUT -F 'source[branch]=main' -F 'source[path]=/docs' -f build_type=legacy`) and `git revert` + push the layout commits, or restore from the sub-project 1 mirror for anything older.
