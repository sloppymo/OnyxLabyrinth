# Repository rationalization, documentation consolidation, and hygiene pass

Status: in progress on branch `chore/repository-rationalization`.
Base commit: `ce0ee71ce31d161ab3f71f5a81b3943b60c6768d` (`origin/main`).

## Objective

Make the repository easier, safer, and faster for humans and future coding agents to continue developing by:

1. Consolidating documentation and removing stale source-of-truth conflicts.
2. Adding an explicit architecture and source-of-truth map.
3. Removing or documenting only proven dead code.
4. Clarifying scripts, verification, and generated/local-only artifacts.
5. Preserving behavior unless a defect is proven.

## Constraints

- No gameplay, balance, map, narrative, UI, rendering, or progression changes.
- No merge to `main` and no Git history rewrite.
- No deletion of raw licensed asset packs (`assets/`, `playtest-screenshots/`, `vfx-audit/`) or user-owned scratch files without explicit user confirmation.
- No casual renaming of save-compatible IDs (enemy, item, perk, NPC, floor).
- The approved water tile `public/assets/tilesets/f1/water_floor.png` in the original worktree is intentionally preserved and unmodified; it is unintegrated art awaiting a separate water-rendering pass.

## Baseline verification

Run on the isolated worktree at `ce0ee71` before any edits.

| Command | Result |
|---------|--------|
| `npm ci` | 150 packages installed; 3 pre-existing `npm audit` high-severity vulnerabilities (not introduced by this pass) |
| `npm test` | **1926 passing**, 92 test files, 0 failures |
| `npm run build` | Clean; 0 TypeScript errors; Vite production build completed |
| `git diff --check` | Clean |
| `npm run floor:validate` | Floors 1–5 all OK (no issues) |
| `npm run floor:check` | Requires `--file path/to/map.json`; not a standalone baseline command |

Pre-existing warnings: Vite chunk-size warning for `dist/assets/combat-phaser-stage-*.js`.

## Batches

### Batch A — documentation entrypoints and index

- Create `docs/README.md` as the obvious documentation entrypoint.
- Create `docs/development/REPOSITORY-RATIONALIZATION.md` (this file) as the living audit report.
- Remove the stale fixed test total from `docs/AGENT-READING-LIST.md`.

### Batch B — architecture and source-of-truth map

- Add a concise architecture overview to `AGENTS.md` or `docs/development/ARCHITECTURE.md`.
- Add a "Where do I make this change?" table to `AGENTS.md`.
- Add a "Do not do this" section to `AGENTS.md`.
- Reconcile `README.md`, `AGENTS.md`, and `CLAUDE.md` only after identifying unique content in `CLAUDE.md`.

### Batch C — code, naming, and script hygiene

- Reachability analysis for candidate dead code (optional; delete only with convincing evidence).
- Clean stale comments containing obsolete test totals, floor counts, or "TODO" for already-shipped features.
- Package script audit: add descriptions or remove duplicates if proven unused.

### Batch D — `.gitignore` and artifact triage

- Verify `.gitignore` coverage and document local-only artifacts.
- Leave `public/assets/tilesets/f1/water_floor.png` untouched; record it as user-owned.

### Batch E — final verification

- `npm test` and `npm run build` after every batch.
- `git diff --check` before every commit.
- Push `chore/repository-rationalization` periodically.

### Batch F — final report

- Complete this document.
- Push the branch.
- Do not merge.
