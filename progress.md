Original prompt: Execute the full phased OnyxLabyrinth visual-improvement pass on a dedicated branch: diagnose screens with rendered evidence and read-only subagents, implement serialized visual phases, verify each with build/tests and actual browser renders, commit each phase independently, then stop unpushed with a complete disposition report.

## 2026-07-31

- Created branch `visual/full-pass-2026-07-31` from the existing dirty `main` worktree.
- Pre-existing user changes include `src/styles.css`, `src/engine/renderer.ts`, other source/assets/docs, plus the forbidden untracked `src/data/items.test.ts` and `src/data/items-descriptions.test.ts`. Preserve them and stage pass files explicitly.
- Loaded the `develop-web-game` skill. Required loop: small changes, project Playwright client, state capture, screenshot inspection, console review, reset between scenarios.
- Next: finish required document reads, establish clean build/test/render baselines, then run Phase 0 audits.
- Required reads completed: `AGENTS.md`, `CLAUDE.md`, `docs/AGENT-READING-LIST.md`,
  `docs/TILESET-ART-STYLE-GUIDE.md`, and the prior corridor/combat/town prompts.
  Also read the current 2026-07-27 visual pass and 2026-07-28 combat-only pass.
- Baseline gates on the dirty worktree: `npm run build` clean; `npm test
  -- --reporter=dot` = 1460 passed / exactly 12 known failures (4 reach-perk +
  8 forbidden untracked item tests). This matches the user-provided baseline.
- Phase 0 rendered all requested screen families under `/tmp/onyx-phase0/`.
  High-confidence defects: standalone FF6 menus collapse on 390px-wide screens;
  camp multiline spell labels still ellipsize; the automap header is covered by
  the redundant "Auto-map open" message and persistent HUD; party editor lacks
  the choice screen's FF6 treatment; Phaser missing-strip actors are oversized
  opaque ellipses. The corridor itself passed its pinned view/transition checks,
  so a renderer change is not justified.
- Default Phaser combat and `?phaser=0` both booted. Two audits observed Phaser
  teardown exceptions across debug/Arena fight transitions; the visual phase
  must reproduce and trace this before changing lifecycle code.
- Next: receive the cross-screen cohesion review, freeze the scored backlog and
  phase order, then execute one serialized phase at a time.
- Phase 1 commit `a1db95c`: replaced Phaser's oversized ellipse fallback with
  compact outlined, foot-anchored procedural silhouettes. Explicit six-enemy
  missing-art pack render: route combat, warnings `[]`, console errors `[]`.
  Final build clean; tests stayed at 1460 pass / 12 known failures; final Phaser
  two-fight smoke and `?phaser=0` rollback passed. The teardown exception did
  not reproduce across three current repetitions, so lifecycle code was not
  changed.
- Next: shared 390px standalone-window layout contract.
- Phase 2 commit `65ba1c9`: shared <=640px DOM-menu tokens, compact chrome, and
  themed host scrolling. At 390px Town exposed 8/8 rows, Arena 5/5, and Camp
  rendered complete multiline descriptions in a scroll region. Desktop Camp
  also rendered cleanly. Build clean; tests stayed at the known 12 failures.
- Phase 3 commit `d38a6fb`: removed the redundant map-open message and hides
  the dungeon notification/HUD band while the map is visible. Map header,
  position, and close hint are unobstructed; closing restored the pinned
  textured corridor, with warnings/errors empty. No renderer code changed.
- Next: party-editor hierarchy and sprite presentation.
- Sprite continuation: completed original 6/8/4/4 displacer-beast strips,
  replacement 6/6/4/4 animated-armor strips, and original 6/9/4/6 ice-golem
  strips. All use 100x100 cells, binary alpha, nonempty frames, and <=32 colors.
- Registered `displacer-beast` and `ice-golem`, updated art anchors for the new
  animated armor and its borrowers, and regenerated its holy/celestial guardian
  recolors. The original `summon-celestial` ophanim hashes remained unchanged.
- Sprite validation: `src/engine/sprite-manifest.test.ts` passed 209 tests and
  `npm run build` completed cleanly. Contact sheets were visually inspected.
- Next sprite check: capture one live combat render for each new/replaced set.
- Live Phaser combat renders captured for displacer beast, animated armor, and
  ice golem. All face the party, sit on their shadows, clear the combat windows,
  and reported route `combat`, warnings `[]`, and console errors `[]`.
- Phase 4 commit `8e0a6ba`: reframed party creation as a full FF6 character
  sheet with an enlarged sprite stage and compact mobile layout. Desktop and
  390px browser proofs kept all editable fields visible, used the existing
  outer-panel scroll contract for lower stats/footer, and reported no console
  errors or debug warnings. Build clean; tests stayed at the known 12 failures.
- Phase 5 commit `bb7bbfe`: added a code-native corridor-depth title lockup,
  preserved it across menu rerenders, and gave Camp a scoped low-ember field.
  Desktop/mobile screenshots were unclipped with warnings/errors empty. Build
  clean; tests stayed at the known 12 failures.
- Final stable-build sweep: `npm run build` clean; `npm test` = 1468 passed /
  exactly 12 known failures. Narrow menus, party editor, title/camp, map, and
  six-enemy fallback proofs all passed. The first parallel combat run raced a
  changing Vite chunk hash during the final build and was discarded; its
  sequential rerun passed Phaser fight/flee/second-fight/victory and the
  `?phaser=0` rollback with findings `[]`, errors `[]`. Corridor map and
  combat-return checks passed with browser errors `[]`.
- Final branch: `visual/full-pass-2026-07-31`, five commits, no upstream, not
  pushed, no PR. User-owned dirty/untracked work remains preserved and
  unstaged, including both forbidden item-test scaffolds.
- Added `viper-man`, a white-armored viper-headed Black Knight variant with
  original 6/16/4/4 idle/attack/hurt/death sheets. The 100x100 cells use binary
  alpha, nonempty frames, and no more than 32 colors per frame.
- Registered the Viper Man with measured top/foot anchors. Sprite-manifest
  tests passed 213/213, `npm run build` completed cleanly, and a live Phaser
  combat proof reported route `combat`, warnings `[]`, and console errors `[]`.
- Replaced the 20 live corridor material inputs (`src/assets/f1…f5_{wall,
  ceiling,floor_a,floor_b}_256.png`) with individually generated and locally
  cleaned 256px pixel-art textures. Each final image is opaque RGB, quantized
  to 96 colors, and has exact matching opposing edge pixels; the source
  contact sheet and repeated-surface checks were visually inspected under
  `/tmp/onyx-tileset-audit/`.
- Verification: `npm run build` passed. The full 44-pose production-preview
  corridor capture had no browser errors or failed assets; direct visual
  review covered straight corridor, side passage, front wall, and darkness,
  plus close wall reads for floors 2–5. `npm test` remains at the workspace's
  known 12 unrelated failures (1489 passing).

## 2026-07-31 — Magic sheet controller UX slice

- Current prompt: choose and complete one highest-priority open player-facing
  slice, with Magic sheet/message-band UX first; do not touch tileset art.
- Selected the shipped combat Magic sheet: make its hints input-adaptive and
  its empty-category state explicit. No game math, maps, renderer, or art.
- Renderer tests now cover keyboard hints, gamepad hints, ARIA-disabled spell
  rows, and category-specific empty copy.
- Production-preview smoke uncovered a live integration gap: advertised 1–5
  tab shortcuts were swallowed by `main.ts` before reaching `CombatController`.
  Added direct digit routing only while `phase === "selectSpell"`.
- Baseline build passed; focused tests were 91/91. After the change, renderer
  tests passed; one unrelated combat-auto test flaked once and passed alone on
  immediate rerun.
- Final focused rerun: 66/66 passed; `npm run build` passed. Production preview
  passed with Phaser and `?phaser=0`: live keyboard `3` selected Defense, the
  empty state stayed open with category-specific copy, and mocked-pad LB
  returned to Offense with gamepad-specific hints. Both ended at route combat /
  phase selectSpell with browser errors `[]`. Screenshots and report are under
  `/tmp/onyx-magic-sheet-polish/` and were visually inspected for clipping,
  hierarchy, background/footer coexistence, and input-label correctness.

## 2026-07-31 — Dungeon notification polish slice

- Baseline build passed; message-adjacent focused tests passed 51/51.
- Production baseline confirmed the entry notification duplicated
  `Tab: Actions · Esc: Save` in both the blue message box and persistent HUD
  chrome. It also showed `snapshot().message.text` returning the unrevealed
  full string while the DOM visibly contained only a prefix.
- Selected a bounded shell-only fix: keep floor/facing beside notifications,
  show the persistent control legend only after the message clears, and make
  the snapshot seam report currently rendered glyphs. No renderer, art,
  movement, combat, balance, map data, or audio changes.
- Added `src/engine/shell.test.ts` for empty visibility, two-action
  complete/dismiss, instant trap prompts, long-copy bounds, HUD coexistence,
  and map/mode visibility. Focused tests passed 56/56; build passed.
- Production preview passed the real title→dungeon route, typewriter
  progression, both notification actions, a live poison-chest prompt
  (navigate/inspect/restore/leave), map open/close, save open/close, and a
  long-message HUD preview. Desktop and 390px captures were visually
  inspected; snapshots matched rendered text, warnings/errors were empty,
  readiness was fully settled, and party DOM restored after Save.
- Full suite passed: 75 files / 1,539 tests. Final evidence lives under
  `/tmp/onyx-message-band-polish/`. No assets, renderer, combat, or game logic
  changed; no commit was created.
- Smallest follow-up: audit Arena entry/exit coherence next; the prioritized
  Magic-sheet and dungeon-message slices are now both covered.

## 2026-07-31 — Tier-2 priest heal VFX slice

- Current prompt: complete one presentation-only spell/effect VFX slice using
  existing strips, verify both Phaser and `?phaser=0`, and stop uncommitted.
- Preserved the already-dirty Tier-2 heal remaps in
  `combat-choreography.ts`: Cure Serious, Cure Blindness, and Mass Cure.
- Reverified the live inventory: 111 effect PNGs, 110 registered strips, and
  only `pixelart-magic-ray.png` orphaned. Focused wiring/choreography tests pass
  65/65 and `npm run build` passes.
- Next: capture and inspect each touched cast at mid-impact in real Arena on
  Phaser and the canvas rollback, including snapshot/readiness/error evidence.
- Completed the real-Arena capture on both painters. Serious exposed
  `heal_sparks` → `priest_heal`; Blindness exposed
  `px_black_white_sparks`; Mass Cure exposed `heal_sparks` + `priest_heal`
  together. All six frozen mid-impact frames were visually inspected.
- Both reports ended on route `combat` with warnings, console/network errors,
  debug errors, and failed assets all empty. Evidence is under
  `vfx-audit/2026-07-31-tier2-heals/{phaser,canvas}/`.
- Visual result: focused green cross/orb for Serious, monochrome white cleanse
  for Blindness, and simultaneous party-wide green rings/crosses for Mass Cure.
  Remaining heal gap is the untouched higher-tier fallback cluster (Critical,
  Regenerate, and Heal); that is a separate slice.

## 2026-08-01 — Documentation architecture audit

- Audited the onboarding documentation against the live boot, combat-stage,
  audio, ending, build, deployment, and floor-registry code.
- Updated `README.md`, `CLAUDE.md`, `AGENTS.md`, and
  `docs/FLOOR-AUTHORING.md` to remove stale Canvas-only combat, no-ending,
  procedural-only audio, obsolete test-count, build-command, Pages-output,
  floor-id, and no-CI claims.
- `git diff --check` passed and targeted searches found no remaining copies of
  those claims. Documentation-only change; no runtime behavior or assets
  changed, so gameplay rendering was not rerun.

## 2026-08-01 — Floor 1 showpiece + regional tilesets

- Current prompt: ship a wholly redesigned Floor 1 vertical slice and add
  rectangular per-cell `tilesetZones` across JSON, runtime types, validation,
  schema, renderer, tests, and authoring docs. Preserve the `crypt-key` → F1
  gate → `lexicon-key` campaign chain, use existing f1–f5 art, and verify both
  data gates and production-preview visuals.
- Loaded the `develop-web-game` skill. Its required browser loop and screenshot
  inspection will be used after each meaningful runtime-visible change.
- Shared worktree has unrelated in-flight audio, combat, docs, and asset edits.
  Preserve them and restrict changes/diffs to Floor 1 and regional-theme files.
- Next: read the live authoring/narrative contracts and audit the floor-map and
  renderer theme-selection code before settling the new layout.
- Design package completed at
  `docs/superpowers/specs/2026-08-01-floor-1-showpiece-design.md`: 24×28 Hall
  of Five Wounds, all five built-in themes, dry/wet routes to `crypt-key`,
  gated f4/f3 finale with `lexicon-key`, one stair, four additive NPCs, four
  soft puzzles, and six valid-item chests. Next: implement the regional-theme
  data contract and renderer boundary rule before generating the JSON.
- Regional-theme engine slice implemented: `TilesetZoneDef` round-trips through
  FloorMapJSON/FloorDef, validator covers bounds/ids/built-ins/overlap, overlap
  order is last-wins, ASCII dumps list zones, and renderer floor/ceiling/wall/
  door sampling uses per-cell cached texture lookups with near-visible-side
  wall selection. Focused floor-map/validator tests pass 31/31 and tools
  TypeScript checking passes. Next: generate the authored Floor 1 JSON, then
  exercise the combined runtime change in the required browser loop.
- New `floor-1.json` generated from the 24×28 authored source. `floor:check`
  passes, focused floor/map/registry suites pass 54/54, and `floor:validate`
  reports zero issues on floors 1–5. Content assertions cover the sole gated
  stair, crypt→lexicon order, all five themes, frequency-only campaign zones,
  short event copy, four NPCs, and retired-lore residue. Next: full test/build
  gates and production-preview browser evidence.
- Final gates passed: 79 Vitest files / 1,700 tests, production and tools
  TypeScript checks, Vite build, `git diff --check`, Floor 1 check, and all-floor
  validation. One stochastic combat-auto assertion failed on the first full
  run, passed alone, and the clean full rerun passed all 1,700 tests.
- Production preview verification passed straight corridor, side passage,
  depth-0 front wall, f1/f2/f3/f4/f5 regions, bidirectional boundary doors, an
  open f1→f5 boundary corridor, darkness entered by movement, automap toggle,
  and real combat→dungeon return. No browser errors or failed asset readiness;
  screenshots and the machine-readable report are under
  `/tmp/onyx-floor1-regional-tileset/`.
- The required `develop-web-game` client also ran unchanged against the preview
  after installing its matching Playwright dependency beside the skill; its
  boot/prologue capture is under `/tmp/onyx-floor1-web-client/`. No commit or
  push was created, and unrelated shared-worktree edits remain untouched.

## 2026-08-01 — Battle and randomized dungeon music

- Current prompt: use `~/Downloads/OnyxLabyrinth_Battle_Theme_v3.mp3` as the
  normal battle theme, and use isolated Emberwake MIDI tracks 5 and 6 as the
  two randomized dungeon loops. Keep the existing procedural boss bed for boss
  encounters.
- Loaded the `develop-web-game` skill. Next: inspect source media and live audio
  transitions, render browser-compatible dungeon assets, then add focused audio
  tests plus a production-preview mode-transition smoke.
- Added three browser-ready assets: the supplied Battle Theme v3 unchanged,
  plus 57.1-second stereo MP3 renders of Emberwake track 5 (Strings) and track
  6 (Percussive Organ). The two dungeon renders are loudness-normalized ambient
  beds; source validation reported no lost/cut MIDI notes.
- Audio routing now rolls one Emberwake stem per dungeon visit, re-rolls after
  leaving/re-entering, starts Battle Theme v3 only for non-boss combat, and
  preserves the exclusive procedural boss bed. Focused audio tests pass 11/11
  and app TypeScript plus `git diff --check` pass. Next: production build and
  real-browser media/mode transition verification.

## 2026-08-01 — Nonmodal dungeon map overlay

- Current prompt: implement and production-verify a centered, translucent,
  north-up dungeon map overlay over the live corridor; preserve fog-of-war,
  saves, all authored floors, the existing full automap, and blocking-mode
  input boundaries.
- Loaded the `develop-web-game` skill. Its required iterative browser client,
  screenshot inspection, text-state checks, and console review will follow the
  implementation.
- Audit: `M` opens the existing modal full-canvas automap and `Tab` opens the
  important dungeon action ring (which also exposes that full map). Discovery
  already lives in `GameState.explored` / `exploredByFloor` and save format v14.
  `showMode` owns shell visibility, while several blocking overlays borrow
  mode `title`.
- Design decision: preserve the full automap unchanged; add a separate
  session-only, nonmodal HUD canvas on unused `V` plus an accessible clickable
  hint. It will reuse `state.explored`, remain north-up, cache redraws, and be
  forced closed whenever the shell leaves dungeon exploration.
- Next: implement pure overlay state/model/geometry plus focused tests, then
  wire shell/input/main transitions.
- Final validation passed: `npm run build`, 79 Vitest files / 1,701 tests, and
  the required unchanged web-game client. The dedicated production-preview
  smoke exercised both random Emberwake files, normal combat, flee/return, and
  boss combat; every MP3 reached HTTP 206 and browser readyState 4, with no
  browser errors. Screenshots were visually inspected and the report is under
  `/tmp/onyx-music-routing-final/`.
- `torchlight-beneath-stone.mp3` remains as a documented unused reserve rather
  than being destructively removed. The unrelated user edit to
  `public/assets/enemies/headmasters-echo/idle.png` remains untouched. This
  music slice is local and uncommitted/unpushed pending user direction.
- Follow-up prompt: completely randomize dungeon playback across every dungeon
  theme so all of them are showcased. The pool will be equal-random across
  Torchlight Beneath Stone, Understone, Emberwake Strings, and Emberwake Organ;
  title, town, normal-battle, and boss music remain mode-specific.
- Understone was copied byte-for-byte from Downloads and Torchlight was restored
  to active rotation. Deterministic tests pin the four probability quarters;
  each dungeon entry/return independently selects one theme and loops it until
  the next mode transition.
- Final gates remain green: `npm run build`, 79 Vitest files / 1,701 tests, the
  required unchanged web-game client, and the production-preview routing smoke.
  The browser exercised all four dungeon themes plus normal and boss combat;
  media responses succeeded and browser errors were empty. Evidence is under
  `/tmp/onyx-music-routing-all/`. The music slice remains local/uncommitted and
  the unrelated Headmaster sprite edit remains untouched.

## 2026-08-01 — Nonmodal dungeon map overlay (completion)

- Implemented the `V` quick map as a separate DOM-overlay Canvas 2D renderer;
  the existing `M` full automap and `Tab` action ring remain unchanged. The
  overlay is north-up, nonmodal, discovery-only, player-centred/clamped, and
  session-only; saved exploration continues through the v14 save fields.
- Focused map/input/shell/snapshot/explore/save verification passes 6 files / 81
  tests. The full suite passes 81 files / 1,729 tests, app and tools TypeScript
  checks plus the production build pass, all five floors validate, the Floor 1
  content check passes, and `git diff --check` is clean.
- The production browser driver covers open/close, repeat/editable input,
  pointer access, movement and discovery while open, facing, locked doors,
  regional art, darkness, both camera edges, trapped and ordinary chests, NPC
  dialogue/knowledge, full automap, save/load, combat return, real F1→F2 stairs,
  and a 390×700 viewport. No browser errors or failed assets were reported;
  evidence is under `/tmp/onyx-map-overlay-final.CsVCiX/`.

## 2026-08-01 — Pages release and optional party-strip cleanup

- Promoted the three release commits through `1b4f4e9` to `main`; the Pages
  workflow and live hashed bundle succeeded. The first live corridor smoke
  exposed eleven 404s from preloading optional party animation filenames that
  do not ship, even though their documented `attack` fallback worked.
- Party sprite preload now requests only the optional strips present on disk:
  Mage/Priest `cast` and Thief `attack_ranged`. The existing fallback behavior
  is unchanged and a focused test pins the request manifest.
- Final local gates pass: production build, 81 Vitest files / 1,730 tests, and
  the full Floor 1 renderer checklist with browser errors/readiness failures
  empty. Straight corridor, side passage, depth-0 wall, darkness, map, and
  combat-return screenshots were visually inspected under
  `/tmp/onyx-party-asset-clean-local/`.

## 2026-08-02 — Seeded gameplay RNG continuation

- Audited the interrupted worktree: current branch is `agent/lonesome-forest-title`; perk changes are staged while RNG edits are partly unstaged and the replay test is untracked. `origin/main` points at `99b2342`; no commit/push/switch/reset was performed.
- Replaced the mutable RNG module singleton with explicit seeded streams. Runtime main now owns the session stream, accepts `?seed=<integer>`, resets it for New Game, and injects it into party creation, dungeon feature/loot, encounters, NPC theft, and CombatController.
- Rewrote deterministic replay coverage for stats, encounter sequences, combat state/rewards, loot, cosmetic isolation, and test-order isolation. Remaining: run focused/full tests, audit perk semantics, build, browser smoke, and final diff audit. No commit or push authorized.
