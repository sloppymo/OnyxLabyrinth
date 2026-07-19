# Repo Layout & Deploy Pipeline Rationalization

Date: 2026-07-19
Status: Approved design, pre-implementation
Sub-project: 2 of 3 ("rationalize git structure & software base" initiative;
sub-project 1 = repo hygiene purge, **done**; sub-project 3 = god-file
architecture refactors — out of scope here)

## Problem

1. **Deploy is a manual ritual with committed build output.** GitHub Pages
   serves the `docs/` folder; deploying means building locally, copying
   `dist/` into `docs/`, pruning stale hashed bundles by hand, and committing
   the result. This is exactly the bundle churn purged in sub-project 1 —
   left in place it regrows forever. `docs/` is also two things at once: 65+
   hand-written docs and the built site.
2. **Root is a junk drawer of process docs.** 14 tracked markdown files at
   root: founding design docs worth keeping alongside executed prompts,
   superseded playtest reports, and shipped audit reports.
3. **Tooling is scattered.** 6 dated one-off playtest scripts sit next to
   maintained CLIs in `scripts/`; 2 Python music generators sit at repo root.

## Decisions (user-approved)

- **Deploy via GitHub Actions.** CI builds `dist/` on every push to `main`
  and deploys it as a Pages artifact. The committed `docs/` build output is
  deleted from the repo; `docs/` becomes documentation-only. Chosen over an
  `npm run deploy` script (which would keep build output committed and the
  ritual manual). `gh` is authenticated with `repo` + `workflow` scope, so
  the Pages source flip (`build_type=workflow`) is done via API.
- **Root markdown cull with approved list.** 5 keepers move to `docs/` root;
  9 stale files deleted from HEAD (recoverable from git history).
- **Minimal tooling consolidation.** Dated playtest scripts →
  `scripts/playtests/`; Python music generators → `scripts/`. `tools/` stays
  as browser apps + floor data. Vite input HTMLs stay at root.

## Concrete changes

### A. GitHub Actions deploy

- Create `.github/workflows/deploy.yml` (see plan for full YAML): trigger on
  push to `main` + `workflow_dispatch`; `actions/setup-node@v4` with
  **node 22** (local runs v22.23.1) and npm cache; `npm ci`;
  `npm run build` (runs `tsc` + `tsc -p tsconfig.tools.json` + `vite build`,
  so CI also type-checks); `actions/upload-pages-artifact@v3` with
  `path: dist`; `actions/deploy-pages@v4`. Permissions `pages: write` +
  `id-token: write`; concurrency group `pages`.
- Flip Pages source: `gh api repos/sloppymo/OnyxLabyrinth/pages -X PUT -f build_type=workflow`.
  Known cost: the site is down between the flip and the first successful CI
  deploy (~2-3 minutes). One-time; accepted.
- Delete from the repo (now CI-produced):
  `docs/assets/`, `docs/tools/`, `docs/index.html`,
  `docs/dungeon-hud-preview.html`, `docs/vfx-vignette.html`,
  `docs/favicon.svg`, `docs/icons.svg`, `docs/.nojekyll`.
- Keep in `docs/`: all `*.md`, `docs/superpowers/` (including the
  hand-kept `playtests/arena-vfx/*.png` report images),
  `docs/floor-map.schema.json`.

### B. Root markdown cull (list approved by user)

Move to `docs/` root (5): `ARENA-REVIEW.md`, `PLAYTEST-DESIGN-REVIEW.md`,
`PLAYTEST-REPORT.md`, `wizardry_v_clone_design_doc.md`,
`wizardry-v-combat-reference.md`.

Delete from HEAD (9): `ADVANCED_DEVELOPMENT_PROMPT.md`,
`COMBAT-REVIEW-PROMPT.md`, `COMBAT-REVIEW-REPORT.md`, `HANDOFF-PROMPT.md`,
`PLAYTEST-RESULTS.md`, `PLAYTEST-RESULTS-2026-07-14.md`,
`VFX-AUDIT-REPORT.md`, `VFX-FEEL-ANALYSIS.md`, `POLISH-ISSUES-PROMPT.md`.

Link maintenance (reference sweep already done):

- Update links to the 5 **moved** files everywhere they're referenced:
  `docs/AGENT-READING-LIST.md` (rows for ARENA-REVIEW, PLAYTEST-DESIGN-REVIEW,
  PLAYTEST-REPORT — `../X.md` → `X.md`; also fix the already-broken
  `../COMBAT-ENGAGEMENT-AUDIT.md` link → `COMBAT-ENGAGEMENT-AUDIT.md`),
  `docs/FOLLOWUP-COMBAT-UX-PERKS-PROMPT.md`,
  `docs/FOLLOWUP-COMBAT-FLOW-PROMPT.md`,
  `docs/superpowers/specs/2026-07-14-arena-renderer-design.md`,
  `PLAYTEST-DESIGN-REVIEW.md` itself (its `POLISH-ISSUES-PROMPT.md` link →
  note as removed-from-tree; `PLAYTEST-REPORT.md` link → same-dir), and the
  code comment in `src/engine/arena-camera.ts` referencing `ARENA-REVIEW.md`
  (→ `docs/ARENA-REVIEW.md`).
- `AGENT-READING-LIST.md`: drop the POLISH-ISSUES-PROMPT row (file deleted;
  its one live item — mobile map lower priority — is already recorded in the
  same file), bump the "Last refreshed" stamp.
- Links pointing at **deleted** files inside historical prompt docs
  (`HANDOFF-PROMPT.md`, `docs/FOLLOWUP-COMBAT-DEPTH-PROMPT.md`) are left
  as-is — those docs are historical records, and the targets remain in git
  history.

### C. Tooling consolidation

- `git mv` the 6 dated one-off playtest drivers to `scripts/playtests/`:
  `playtest-2026-07-14.mjs`, `playtest-2026-07-14-part2.mjs`,
  `playtest-2026-07-14-part3.mjs`, `playtest-controller-full.mjs`,
  `playtest-floor-4.mjs`, `playtest-perk-fix.mjs` (verified: no
  cross-imports; they're standalone).
- `git mv` the 2 Python music generators to `scripts/`:
  `generate_ff6_battle_music.py`, `generate_ff6_battle_music_simple.py`.
- Convention (added to AGENTS.md file map): `scripts/` = node CLIs +
  generators (`scripts/playtests/` for dated one-off drivers);
  `tools/` = browser apps + `floor-data`.

### D. Docs that describe deployment

- `AGENTS.md`: rewrite the Deployment bullet ("push to `main` deploys via
  GitHub Actions; `docs/` is documentation-only") and git-workflow item 3
  (remove the manual `dist/`→`docs/` refresh); file map gains the
  `scripts/playtests/` note.
- `CLAUDE.md`: update the architecture line and the "Deployment (GitHub
  Pages from `docs/`)" section to the Actions flow.
- `README.md`: replace the "copy dist into docs/" instructions with
  "push to main; Actions deploys".

## Success criteria

1. `git push` to `main` triggers the Actions workflow; it completes green
   and deploys. Site, a combat wav, and `/OnyxLabyrinth/tools/floor-editor.html`
   all return 200 afterwards.
2. `git ls-files docs` contains no built output (no `docs/assets/`,
   `docs/tools/`, no root-level HTML/SVG in `docs/`).
3. Repo root has zero stray process docs — the only root markdown files are
   `AGENTS.md`, `CLAUDE.md`, `README.md`.
4. No tracked file links to a moved file at its old path (verified by grep).
5. `npm run build` + `npm test` green locally before pushing.

## Risks

- **Pages flip window:** site down ~2-3 min between the settings flip and
  first CI deploy. Accepted; do the flip immediately before pushing.
- **`gh api` Pages update rejected:** fallback is the user flipping
  Settings → Pages → Source to "GitHub Actions" manually.
- **First CI run failures** (e.g. npm ci engine mismatch): local node is
  v22.23.1 and CI pins 22, so unlikely; the workflow can be re-run after a
  fix without touching Pages (legacy content keeps serving until the first
  successful artifact deploy... except during the post-flip window —
  another reason to flip last).

## Explicitly out of scope

- `src/` refactors (sub-project 3).
- Deleting the sub-project 1 backup mirror or `/tmp/onyx-stash`.
- Moving vite-input HTMLs (`vfx-vignette.html`, `dungeon-hud-preview.html`)
  — they're wired into `vite.config.ts`; churn for zero gain.
- `mockups/`, `visual-companion-scripts/` — already organized.
