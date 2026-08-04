# Repository rationalization, documentation consolidation, and hygiene pass

Status: **completed** on branch `chore/repository-rationalization`.
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

**Result:** `docs/README.md` and `docs/development/REPOSITORY-RATIONALIZATION.md` created; `docs/AGENT-READING-LIST.md` updated. Verification: `npm test` 1926/1926 passing, `npm run build` clean, `git diff --check` clean.

### Batch B — architecture and source-of-truth map

- Add a concise architecture overview to `AGENTS.md` or `docs/development/ARCHITECTURE.md`.
- Add a "Where do I make this change?" table to `AGENTS.md`.
- Add a "Do not do this" section to `AGENTS.md`.
- Reconcile `README.md`, `AGENTS.md`, and `CLAUDE.md` only after identifying unique content in `CLAUDE.md`.

**Result:** Added `Architecture overview`, `Where do I make this change?`, and `Do not do this` sections to `AGENTS.md`; updated `README.md` to point to `docs/README.md`; updated the stale boss-audio claim in `AGENTS.md` to match the authored music file. Verification: `npm test` 1926/1926 passing, `npm run build` clean, `git diff --check` clean. `CLAUDE.md` left intact for a later unique-content pass.

### Batch C — code, naming, and script hygiene

- Reachability analysis for candidate dead code (optional; delete only with convincing evidence).
- Clean stale comments containing obsolete test totals, floor counts, or "TODO" for already-shipped features.
- Package script audit: add descriptions or remove duplicates if proven unused.

**Result:** No deletions performed (insufficient evidence for dead code). Removed stale "procedural boss bed" / `CFG.bossBed` references from `AGENTS.md`, `README.md`, `docs/AGENT-READING-LIST.md`, `public/assets/music/README.md`, and the top comment of `src/engine/audio.ts` to match the authored `higher-difficulty-battle.mp3` implementation. Verification: `npm test` 1926/1926 passing, `npm run build` clean, `git diff --check` clean. `public/assets/tilesets/f1/water_floor.png` in the original worktree remains untouched.

### Batch D — `.gitignore` and artifact triage

- Verify `.gitignore` coverage and document local-only artifacts.
- Leave `public/assets/tilesets/f1/water_floor.png` untouched; record it as user-owned.

**Result:** Verified `.gitignore` correctly excludes `dist/`, `node_modules/`, `assets/`, `playtest-screenshots/`, `vfx-audit/`, `.tmp*`, `.worktrees/`, `.superpowers/`, and `logs/`. The original worktree continues to show the approved `public/assets/tilesets/f1/water_floor.png` as untracked and unmodified. `1015` files are tracked in the repository. No `.gitignore` changes were needed.

### Batch E — final verification

- `npm test` and `npm run build` after every batch.
- `git diff --check` before every commit.
- Push `chore/repository-rationalization` periodically.

**Result:** All required verification passed on every batch. The final verification before the last commit is documented below.

### Batch F — final report

- Complete this document.
- Push the branch.
- Do not merge.

**Result:** This document is the final report. Branch `chore/repository-rationalization` is pushed and has not been merged.

## Final verification

Run at the final head on `chore/repository-rationalization`:

| Command | Result |
|---------|--------|
| `npm test` | **1926/1926 passing**, 92 test files, 0 failures |
| `npm run build` | Clean; 0 TypeScript errors |
| `git diff --check` | Clean |
| `npm run floor:validate` | Floors 1–5 all OK |

## Files changed

- `docs/README.md` (new)
- `docs/development/REPOSITORY-RATIONALIZATION.md` (new)
- `docs/AGENT-READING-LIST.md` (updated)
- `AGENTS.md` (updated)
- `README.md` (updated)
- `public/assets/music/README.md` (updated)
- `src/engine/audio.ts` (comment only)

## Behavior and source-code impact

- **No runtime behavior changed.**
- `src/engine/audio.ts` has one comment change only (`Procedural` → `Hybrid`); all audio code remains unchanged.
- No gameplay, balance, map, narrative, UI, rendering, or progression changes.

## Remaining placeholders and deferred work

- `CLAUDE.md` still overlaps `AGENTS.md`. The overlap was noted; `CLAUDE.md` was intentionally not truncated because a unique-content diff was not completed in this pass. Defer to a future focused agent-specific doc pass.
- Dead-code deletion was treated as optional and was not attempted; no proven-dead files were identified or removed.
- The approved water tile `public/assets/tilesets/f1/water_floor.png` remains unintegrated, awaiting a separate water-rendering implementation pass.

## Conclusion

The repository now has a single documentation entrypoint (`docs/README.md`), a living rationalization report, an updated authoritative agent guide (`AGENTS.md` with architecture and change tables), and corrected stale references to the now-authored boss music. Build, tests, and floor validation remain clean, and the branch is ready for review.
