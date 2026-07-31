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
