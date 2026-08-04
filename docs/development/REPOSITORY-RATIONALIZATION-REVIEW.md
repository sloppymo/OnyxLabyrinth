# Repository rationalization — adversarial review and hardening report

## Verdict

`READY AFTER MINOR CORRECTIONS`

## Review Target

- **Repository:** `sloppymo/OnyxLabyrinth`
- **Rationalization branch reviewed:** `chore/repository-rationalization`
- **Base SHA (origin/main):** `ce0ee71ce31d161ab3f71f5a81b3943b60c6768d`
- **Reviewed SHA (chore/repository-rationalization head):** `1a4e08cb9f22c7be83a7a0c0f85ad4b1c0df7de`
- **Review branch:** `review/repository-rationalization-hardening`
- **Final review head after corrections:** (to be committed)

## Executive Summary

The first agent's rationalization pass is a documentation-only, low-risk set of changes. It consolidates entrypoints, updates the agent guide with an architecture overview and change-location table, corrects a stale boss-audio narrative to match the authored `higher-difficulty-battle.mp3` implementation, and reduces `CLAUDE.md` to a pointer after preserving its unique deploy-check command.

The review found **no runtime behavior changes** and **no deleted/moved runtime files**. Only one source file, `src/engine/audio.ts`, was touched, and the diff is a single top-of-file comment change. All tests, build, and floor validation pass.

Three documentation defects were found and corrected:

1. `AGENTS.md` still claimed the boss BGM was "synthesized, not authored" and warned against a lowpass `Q` on the now-removed procedural boss bed — both stale.
2. `CLAUDE.md` used `../` in relative links from the repo root, producing broken links.
3. `docs/AGENT-READING-LIST.md` still described `CLAUDE.md` as containing commands and architecture orientation after it was reduced to a pointer.

After these corrections the branch is accurate, internally consistent, and safe to merge.

## Findings

### Blocker

None.

### High

None remaining after correction. The original `AGENTS.md` boss-BGM pitfall was materially inaccurate and would have misled a future agent into re-adding procedural audio or assuming no boss music asset exists.

### Medium

- `CLAUDE.md` broken relative links after the reduction. Fixed by this review.
- `docs/AGENT-READING-LIST.md` stale `CLAUDE.md` description. Fixed by this review.

### Low

- `docs/development/REPOSITORY-RATIONALIZATION.md` records a fixed test count (`1926/1926`) as a snapshot. This is acceptable for an audit report because it is explicitly dated to the pass, but future readers must be careful not to treat it as a command to keep static.
- `README.md` added `gh run list` for deploy verification; this is a real `gh` CLI command and the workflow exists, but it was not actually executed against the remote because it requires authentication. It is correctly documented as the canonical command.

## Corrections Made

### 1. `AGENTS.md` boss-BGM pitfall

- **Problem:** The common-pitfalls bullet said "Boss presentation is synthesized, not authored" and "there is no boss BGM asset," which directly contradicted the authored `public/assets/music/higher-difficulty-battle.mp3` file used by `audio.startBossCombat()`. It also warned about a lowpass `BiquadFilterNode.Q` on the now-removed procedural boss bed.
- **Evidence:** `src/engine/audio.ts:262` defines `const BOSS_MUSIC_FILE = "higher-difficulty-battle.mp3"` and `startBossCombat()` creates an `HTMLAudioElement`. The asset exists on disk.
- **Files changed:** `AGENTS.md`
- **Verification:** `npm test`, `npm run build`, `npm run floor:validate`, `git diff --check` clean.

### 2. `CLAUDE.md` relative markdown links

- **Problem:** `CLAUDE.md` used `../AGENTS.md`, `../README.md`, and `../docs/AGENT-READING-LIST.md` from the repository root, which resolve outside the repo or to wrong paths.
- **Evidence:** `CLAUDE.md` is at the repository root; sibling files use `AGENTS.md` and `README.md`, while `docs/AGENT-READING-LIST.md` needs `docs/AGENT-READING-LIST.md`.
- **Files changed:** `CLAUDE.md`
- **Verification:** `git diff --check` clean.

### 3. `docs/AGENT-READING-LIST.md` stale `CLAUDE.md` role

- **Problem:** The table still described `CLAUDE.md` as "Commands, architecture orientation" after `CLAUDE.md` was reduced to a pointer.
- **Evidence:** New `CLAUDE.md` content defers commands to `README.md` and `src/` rules to `AGENTS.md`.
- **Files changed:** `docs/AGENT-READING-LIST.md`
- **Verification:** `git diff --check` clean.

## Documentation Truth Audit

| Claim | Evidence | Status |
|---|---|---|
| `PARTY_SIZE = 4` | `src/game/party.ts` | Correct |
| Boss music is `higher-difficulty-battle.mp3` | `src/engine/audio.ts:262`, file exists in `public/assets/music/` | Correct after fix |
| Audio is hybrid (streamed + samples + procedural) | `src/engine/audio.ts` imports `Audio`, fetches WAVs, and uses oscillators | Correct after `Hybrid` comment |
| `GameMode` is a strict union; overlays borrow `"title"` | `src/game/state.ts`, `src/main.ts` | Correct |
| `src/engine/renderer.ts` is the corridor renderer | File map and implementation | Correct |
| Phaser is the default combat painter; Canvas is `?phaser=0` fallback | `src/engine/combat-phaser-stage.ts`, `src/engine/combat-scene.ts`, tests | Correct |
| Save version is 14 | `src/game/save.ts` | Correct |
| Five campaign floors, all validate | `src/data/floors.ts`, `npm run floor:validate` | Correct |
| `docs/` is documentation-only, `dist/` is CI-built | `.github/workflows/deploy.yml`, `.gitignore` | Correct |
| `gh run list --workflow=deploy.yml --limit 1` is the correct deploy-check command | `.github/workflows/deploy.yml` exists; `gh` CLI installed (v2.45.0) | Correct |

## Validation

All commands run in the review worktree `/home/sloppymo/OnyxLabyrinth-review`:

| Command | Result | Notes |
|---|---|---|
| `npm ci` | 150 packages, 3 pre-existing `npm audit` high-severity vulnerabilities | Same as base; not introduced by branch |
| `npm test` | 1926/1926 passing, 92 test files, 0 failures | Full suite |
| `npm run build` | Clean; 0 TypeScript errors; Vite build completed | Both app and tools `tsc` passed |
| `npm run floor:validate` | Floors 1–5 all OK | No geometry/encounter/link issues |
| `git diff --check origin/main...HEAD` | Clean | No whitespace or conflict markers |
| `git status --short` | Clean (before final report commit) | No accidental output |

### Asset integrity spot-check

- `public/assets/music/higher-difficulty-battle.mp3` exists.
- `src/engine/audio.ts` references `BOSS_MUSIC_FILE = "higher-difficulty-battle.mp3"`.
- Tileset PNGs, enemy sprite strips, and title art are present; no hygiene edits deleted runtime assets.

### Replays

- Deterministic replay unit tests (`src/game/deterministic-replay.test.ts`) passed.
- Full end-to-end playthrough replay is explicitly documented as not yet implemented, so it was not executed.

### Browser smoke / visual review

Not performed. The branch changed no runtime code, styles, or assets other than one source comment and markdown. Browser smoke would be identical to the base.

## Runtime Behavior Assessment

No runtime behavior changed. The only source diff is:

```diff
-// Procedural audio engine for OnyxLabyrinth.
+// Hybrid audio engine for OnyxLabyrinth.
```

All `audio.ts` code, constants, and call sites remain identical. Tests and floor validation pass identically.

## Deleted and Moved Material Review

- **No runtime files, scripts, assets, exports, or compatibility paths were deleted.**
- `CLAUDE.md` was truncated from a longer orientation doc to a pointer. Its unique `gh run list` deploy-check command was preserved in `README.md`; the remaining content was already duplicated in `AGENTS.md` or `README.md`.
- `docs/README.md` and `docs/development/REPOSITORY-RATIONALIZATION.md` were added; the latter is an audit report, not a source-of-truth code guide.
- All other diffs are in-place edits.

## Repository Hygiene Assessment

- `.gitignore` unchanged; still correctly excludes `dist/`, `node_modules/`, `assets/`, `playtest-screenshots/`, `vfx-audit/`, `.tmp*`, logs, etc.
- No generated output, screenshots, archives, or local reports were committed.
- No raw licensed packs were added, moved, or deleted.
- No secrets or credential files introduced.
- The untracked `public/assets/tilesets/f1/water_floor.png` in the original worktree remains untouched.

## Remaining Placeholder Art

`public/assets/tilesets/f1/water_floor.png` — untracked, unintegrated water floor tile awaiting a separate rendering pass. Not a merge blocker; explicitly called out in the rationalization report.

## Remaining Risks

None identified. The branch is a pure documentation-hygiene pass with three corrected stale claims. No gameplay, balance, map, narrative, UI, rendering, or progression changes were made.

## Merge Instructions

Merge the review branch `review/repository-rationalization-hardening` (which contains the first agent's 5 rationalization commits plus this review's 3 correction commits) to `main`, or fast-forward `chore/repository-rationalization` to include the review fixes and then merge that.

Do not merge automatically; a maintainer should review this report first.

## Confidence and Limitations

- **Statically inspected:** Yes — every changed file, the full diff vs `origin/main`, and key authoritative docs were read.
- **Unit-tested:** Yes — full `npm test` suite (1926/1926).
- **Built:** Yes — `npm run build` (app + tools `tsc` + Vite) passes.
- **Floor-validated:** Yes — all 5 floors pass `npm run floor:validate`.
- **Replay-tested:** Unit-replay tests passed; full end-to-end replay not performed.
- **Browser-tested:** Not performed; branch has no runtime or asset changes that would affect browser behavior.
- **Visually reviewed:** Not performed.
