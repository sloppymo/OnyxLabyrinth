Original prompt: Execute the full phased OnyxLabyrinth visual-improvement pass on a dedicated branch: diagnose screens with rendered evidence and read-only subagents, implement serialized visual phases, verify each with build/tests and actual browser renders, commit each phase independently, then stop unpushed with a complete disposition report.

Current product contract (2026-08-27): the campaign opens Title → Prologue →
Edgehollow with the fixed Old Man + Rat King duo. Character creation, roster
selection, default/custom roster choices, Reform Party, and roster reorder are
retired. Older entries below are historical session notes; see
`docs/CURRENT-PRODUCT-CONTRACT.md` before using them as instructions.

## 2026-08-25 — Card Trial combat UI redesign

- Current task: implement the approved Card Trial-only combat UI mockup with a shared 768×672 semantic/layout recipe, clear gold current-actor and card states, red target states, anchored actor plates, readable hand/action rails, Canvas/Phaser parity, and no campaign or lighting regressions.
- Safety baseline: branch `feat/f1-battlefield-wow-pass` is three commits ahead of upstream and already dirty. Pre-existing edits include `combat-phaser-stage.ts`, `combat-scene.ts`, `renderer.ts`, `main.ts`, room/floor-light work, docs, generated output, and new sprite assets. Preserve all of them; do not reset, clean, or blanket-stage.
- Baseline `npm run check` passed before implementation: app/test/tools TypeScript, Vite production build, 151 Vitest files / 2,661 tests, floor validation with only the established Floor 1 warnings, and floor-export consistency.
- Implemented the first shared recipe pass: `card-trial-ui-model.ts` owns initiative/current actor/focus-versus-armed/legal target/details/unavailable/outcome text; `card-trial-layout.ts` owns live choreography anchors, footY/draw-size indicators, and deterministic plate offsets. The shared DOM stage consumes it over both Canvas and Phaser; Card Trial alone suppresses the two legacy yellow triangles.
- Generated and selected one supporting pixel-art set after inspecting two candidates: Rat King and Old Man portrait tiles, gold ring, red reticle/arrow/legal marker, ivory focus brackets, bronze separator, and small resource/action/row icons under `public/assets/card-trial/ui/`. Enemy initiative tiles deliberately use their existing live strips; no lab-assistant or other bespoke portrait was added.
- First production-stage browser capture found Card Trial was still rendering generic Thief/Priest bodies. Added a Card-Trial-only sprite cache and wired the existing authored Rat King and broad-hatted blue Old Man strips into both painters without changing campaign class sprites. The standard develop-web-game client then confirmed both real protagonists in the live fight.
- Focus now stays geometrically still and is identified only by the static ivory bracket. The committed targeting card alone gets the 32px rise, straight pose, 1.08× scale, and gold edge. Five-card spacing increased so every neighboring title remains legible.
- Final verification: the focused UI/model/layout/hero-cache suites pass (54
  tests), and `npm run check` passes with 153 files / 2,677 tests plus app,
  tools, and test TypeScript, production build, floor validation, and export
  consistency. The new Canvas/Phaser state matrix passes idle, armed card,
  legal/selected target, Details, unavailable card, paid row move, enemy
  handoff, Old Man turn, `?roomLight=0`, and campaign baseline captures with
  no page errors. Existing sparse, smoke, card-art, target-cycle, Front/Back,
  exit-lifecycle, and 10-fight frozen-oracle fixtures also pass; the independent
  28-pose Canvas/WebGL lighting suite remains green. Final reviewed evidence is
  under `output/card-trial-ui-redesign/evidence/`.

## 2026-08-22 — Card Trial five-card art validation batch

- Phase 1 is frozen at commit `28e16c0` (`feat: present Card Trial front/back spatially`). The exact staged build passed `npm run check` (141 files / 2,579 tests), the frozen ten-fight gameplay/DOM oracle, and Canvas/Phaser visual fixtures. The shared dirty worktree also passed at 143 files / 2,608 tests; its additional Gate A files remain unrelated and untouched.
- Phase 2 is isolated in `/home/sloppymo/OnyxLabyrinth-card-art` on `feat/card-trial-card-art-batch`, based on `28e16c0`. Do not modify the checkpointed battlefield implementation or the separate hand-physics work.
- Live card mechanics were verified in `src/game/card-trial/cards.ts`. The batch is illustration-only at a native 128×96 px: King of the Heap, Nip, then (only if those cohere) Tide, Swarm the Wound, and Staff.
- Canonical identity references are the local Rat King animation (`assets/protagonists/rat-king/sequences/07-idle.png`) and the runtime Priest/Old Man strip (`public/assets/party/priest/idle.png`). The prior large King of the Heap mockup is composition reference only; its rendering is too dense for the binding chunky-pixel target.
- PixelLab Pro job `6a94efc3-8248-4792-bafa-f7933dcab858` produced four 128×96 King of the Heap candidates; controlled edit `2d842e5e-6039-4b2b-a499-65f9037b9344` restored the short scepter and clearer heap cues without adding density. Aseprite MCP added a `Pixel cleanup` layer, reinforced the staff cluster, normalized generated near-black variants, and exported the final 44-color asset to `public/assets/card-trial/cards/king-of-the-heap.png`; the editable source is `art/card-trial/cards/king-of-the-heap.aseprite`.
- Nip Pro job `8b089fb7-2087-4054-aaeb-8e51ecffc931` produced four composition-preserving lunge candidates; edit `ed8684cd-795a-45a0-8d58-47600889cfe7` clarified the cropped hooded foe and flattened the torso to plain cloth. Aseprite MCP removed a noisy one-pixel hood highlight, normalized near-black variants, and exported the 37-color final to `public/assets/card-trial/cards/nip.png`; its editable source is `art/card-trial/cards/nip.aseprite`.
- Native-scale side-by-side inspection passed the two-card gate: King of the Heap and Nip share crown/fur/cloak language, cluster density, shadows, and palette restraint while retaining distinct iconic/action compositions. Tide Pro job `9180461b-41d1-4dd3-9247-370dbd5a56c4` is now generating with the final King of the Heap asset as outline/detail/shading reference.
- Tide selected candidate 3 directly from job `9180461b-41d1-4dd3-9247-370dbd5a56c4`. Aseprite MCP removed two isolated anti-alias pixels and unified near-black edge variants, yielding one dominant 12-color wave at `public/assets/card-trial/cards/tide.png` plus `art/card-trial/cards/tide.aseprite`.
- Swarm the Wound Pro job `57d8e437-8c28-4509-8399-5ec415f23685` is generating from the exact source mechanic (Deal 5; Consume Opened on the same target for +4) and final King of the Heap style. The brief limits explicit rats to three or four leading forms and collapses the rest into one dark mass with a single muted wound accent.
- Swarm the Wound selected candidate 2 from job `57d8e437-8c28-4509-8399-5ec415f23685`. Aseprite MCP hardened three anti-aliased swarm-edge pixels and unified near-black variants; the 20-color final is `public/assets/card-trial/cards/swarm-the-wound.png` with source `art/card-trial/cards/swarm-the-wound.aseprite`.
- Staff Pro job `563bd1d7-074d-48d8-9f75-594d79d4a276` is generating from the runtime Priest/Old Man identity and final King of the Heap density. The prompt binds the simple Deal 6 mechanic, wrapped/turban-like head, beard, blue robe, one wooden staff diagonal, and one compact purple impact while explicitly rejecting generic pointed-hat wizard design.
- Staff selected candidate 0 from job `563bd1d7-074d-48d8-9f75-594d79d4a276`. Aseprite MCP restored the canonical muted-gold wrap patch and normalized near-black variants; the 41-color final is `public/assets/card-trial/cards/staff.png` with source `art/card-trial/cards/staff.aseprite`.
- Five-card native-scale review passed. `scripts/playtests/card-trial-card-art-verify.mjs` validated all five 128×96 sources at 1×, full 132×184 cards, and a 768×672 five-card fan using the closest-current Gate A geometry. Evidence is under `playtest-screenshots/card-trial-card-art/`; `page errors []`. One durable review sheet and the full ledger live in `docs/card-trial-art-review/`.
- The art branch `npm run check` passes after reusing the identical-lockfile dependency tree: app/test/tools TypeScript, Vite production build, 141 test files / 2,579 tests, floor validation with only the pre-existing Floor 1 warnings, and floor export consistency. The standard develop-web-game browser client also rendered the production title screen cleanly.
- Remaining handoff: inspect/stage only art-pass files, create a separate unpushed art checkpoint if clean, then stop for owner review. Recommendation is GO for a later remainder-of-deck pass; this task deliberately stops after five.

## Attrition/recovery balance pass — 2026-08-13

The active task is a focused Floors 1–3 attrition and recovery validation pass.
The first implementation step is debug-only, non-persistent combat audit data:
seeded natural campaigns will record encounters, party condition, route distance,
damage, KOs, consumables, exploration state, and proximity to authored events.
Do not broaden this into new content or a general UX audit. Preserve the original
visual-pass notes below; this section tracks the current task only.

- Complete: debug-only `CombatAudit` plus the natural seeded campaign driver in
  `scripts/playtests/attrition-recovery-audit.mjs`; baseline coverage used
  All Trades, Shield Wall, and All Steel across seeds 101 and 202.
- Finding: ordinary encounter gaps are not the primary global issue; Floor 3
  damage/duration and capstones are the major pressure points, while the fixed
  attack-only Auto policy leaves healing/resource use unmeasured.
- Implemented: campaign wipes preserve the failed combat location in
  `state.lastDungeon`, still routing through game-over and town/Inn recovery.
  This reduced observed retry traversal to 1–51 steps and let two after-fix
  runs reach the Floor 3 guardian within the test budget.
- Verification: `npm run check`, Floor 2 Library, Floor 3 Duelist's Vigil, and
  the WebGL/Canvas abyss-bridge browser checks pass. Full results are in
  `docs/playtests/2026-08-13-attrition-recovery.md`.

### Post-attrition validation and player-experience polish

- Complete: wipe re-entry now validates the saved floor/cell after runtime
  doors and loot are applied, rejects void/features/events/stairs/invalid
  elevation, and searches a radius-4 local landing before falling back to the
  canonical start. The audit records the failed position, actual landing,
  legality, immediate-event risk, and BFS retry path.
- Measurement: the attack-first baseline remains the comparison set. A
  tactical policy was also run through seed 101 for All Trades, Shield Wall,
  and All Steel, plus Shield Wall seed 202. Shield Wall reached and defeated
  Grand Forge on seed 101 after two failed attempts; the other failures were
  at the authored Grand Forge formation after arriving with substantial HP,
  not ordinary-route wipes. No enemy stats or encounter rates were changed.
- Complete: Floor 2 now carries one restrained green-masonry threshold cell
  into the first library mouth. The face's first bark is armed at the bridge
  threshold and appears on the first direct look, giving the reveal a silent
  visual beat while preserving repeat-crossing silence and combat-free entry.
- Complete: lexicon-key and forge-key reward approaches now have authored wall
  framing, completed trap/reward text is painted instantly, and Isobel's
  approved shop sprite is used as a contained cinematic portrait. Incidental
  NPCs retain the compact silhouette/card fallback.
- Complete: the retired Proving Depths smoke check is replaced by
  `scripts/playtests/floor1-guardian-current.mjs`, which targets the live
  28×41 Hall of Five Wounds and verifies the guardian barrier after fleeing.
- Verification: `npm run check` passes (122 files / 2,357 tests); Floor 1
  guardian, Floor 2 Library, Floor 3 Duelist's Vigil, reward framing, and
  WebGL/Canvas bridge runs pass with no browser errors. Detailed metrics and
  screenshot paths are in `docs/playtests/2026-08-13-post-attrition-polish.md`.

## 2026-08-15 — Combat sprite choreography branch

- The choreography pass is isolated in `/home/sloppymo/OnyxLabyrinth-combat-choreography` on `feat/combat-sprite-choreography`, from clean `origin/main` `11573958c9a69875317ef952f660ee01dc707420`.
- The shared checkout and Formation Chemistry worktree were not modified.
- Baseline `npm run check` passed after `npm ci` installed from `package-lock.json` (120 files / 2,350 tests).
- Baseline audit found that the shared choreography boundary is healthy, but common melee still uses a uniform 35px approach and approximately two seconds of presentation time. It needs target-aware motion profiles, deterministic timing, and faster recovery.
- Added `scripts/audit-combat-sprites.mjs` plus the generated inventory under `docs/combat/2026-08-15-combat-sprite-inventory.{md,json}` and the baseline audit at `docs/combat/2026-08-15-combat-sprite-choreography-audit.md`.
- Implemented explicit presentation-only motion profiles, target-aware bounded lunges, contact-synchronized impact/recoil, ranged release timing, caster lift/release, deterministic visual variation, exact return cleanup, and shared Canvas/Phaser frame timing. Added the real-stage `combat-choreography-preview.html` sandbox with speed control, timeline seek, repeat, motion guides, and both backends.
- Final browser evidence was visually inspected from `/tmp/onyx-choreo-browser-evidence/`: Canvas and Phaser preview contact frames, ranged release, cast, heal, miss, critical, Slime, Minotaur, and production Phaser Arena combat. Production smoke passed with zero page errors; Canvas rollback passed; the 40-turn freeze audit found no frozen render loop (all sampled turns had 9–10 distinct frames).
- Final `npm run check` passed: 121 test files / 2,362 tests, app and tools TypeScript, Vite build, floor validation, and floor export consistency. Build retained only the baseline font-resolution and large-Phaser-chunk notices. No Formation Chemistry, bark, audio, or combat-mechanics branch was modified; nothing was pushed or merged.

## 2026-08-13 — Floor 2 abyss bridge entrance

- Current prompt: design, implement, art-finish, test, and production-browser
  playtest Floor 2's south entrance as a one-tile bridge over real void beside
  an enormous animated heckling face.
- Dedicated branch `feat/floor2-abyss-bridge-face` from the required vertical
  QA tip `2089c00`; `2089c00` is not yet on local `main`.
- Unrelated untracked Camp people candidates in the shared worktree remain
  untouched and must never be staged.
- Audit note and exact proposed coordinates are recorded in
  `docs/superpowers/specs/2026-08-13-floor2-abyss-bridge-face-implementation.md`.
- Complete: real `void` / `noCeiling` semantics, 14×26 Floor 2 extension,
  fixed world-space animated face in WebGL + Canvas, 13-frame production art,
  persisted nonmodal heckling encounter, contextual taunts, abyss audio, and
  procedural fart cue.
- Final browser evidence: nine entrance captures per backend in
  `output/playwright/floor2-abyss-bridge/`; Canvas renderer regression gallery
  in `output/playwright/floor2-renderer-regression-canvas/`. Both bridge runs
  blocked void traversal and reported zero browser errors; `npm run check`
  passed.
- Integration follow-up: preserved original feature commit `4f2c0ea` on local
  `feat/floor2-abyss-bridge-face-qa-base`, then replayed it byte-for-byte as
  `b2a08f0` onto canonical Floor 1 PR #37 head `7f89b09`. The replay exposed
  four stale Floor 2 editor/public exports; regenerated only those artifacts.
  Fresh `npm run check` passed (118 files / 2,259 tests), and the dedicated
  nine-shot WebGL + Canvas bridge runs again blocked void traversal with zero
  browser errors. Deliberate repeat-crossing silence remains unchanged.

## 2026-08-10 — Maze Renderer 2

- Current prompt: replace CPU maze picture-making with a production Three.js/WebGL2 graphics backend, retain Canvas fallback and every existing gameplay/content contract, benchmark both paths, and add backward-compatible variable-height cell volumes with real low-to-tall boundary geometry.
- Safety checkpoint: the shared `/home/sloppymo/OnyxLabyrinth` worktree remains on dirty `feat/isobels-iso-spells` at `9e1761a` (ahead 5 / behind 2); unrelated Camp/progress files were not stashed, reset, or edited.
- Created isolated worktree `/home/sloppymo/OnyxLabyrinth-maze-renderer-2`, branch `feat/maze-renderer-2`, from fetched `origin/main` at `06ffb48`.
- Replayed the five local-only Isobel commits (`f415650`, `65dd63a`, `963f4da`, `f261543`, `9e1761a`) in order; they applied cleanly as `d0d5c60` through `3686ae4`.
- Integrated baseline gate passed: app/tools/test TypeScript, Vite build, 107 test files / 2,164 tests, floor validation, and export drift. Only the existing font/chunk build notices and known Namanda floor warnings appeared.
- Added opt-in (`?mazePerf=1`) bounded Canvas section timing plus `npm run benchmark:maze`; ordinary play performs no profiler timestamps or sample allocation. The harness covers straight/side/front/door, Isobel idle/walking, Camp route, Hot Boi's, Namanda, darkness, and combat return, and records screenshots, browser/GPU identity, frame pacing, heap probes, and render-section median/p95/p99.
- First production-preview baseline is under gitignored `playtest-screenshots/maze-renderer-2/benchmark/`. Chromium 140 reported SwiftShader, so its rAF pacing is diagnostic only. After regenerating the pinned corridor poses from the live 28×31 Floor 1 (the old table still pointed at pre-expansion rock), static render CPU median was 1.4–2.3 ms (p95 1.8–3.1 ms); Isobel walking exposed the real bottleneck at 26.8 ms p95 total, 24.4 ms of it CPU floor/ceiling casting. Browser errors were empty and the contact sheet was visually inspected.
- Instrumentation verification: app build passed; focused renderer/shell tests passed 175/175; standard web-game client rendered without app errors (its only console output was the skill client's own module-type warning); `git diff --check` passed.
- Next: commit the benchmark milestone, add the renderer backend boundary, then install/lazy-load Three.js for the WebGL2 backend with Canvas fallback.
- Benchmark milestone committed as `d6959b8` (`perf(renderer): add maze rendering benchmark harness`).
- Renderer boundary implemented: `MazeRenderer` owns init/floor/render/resize/disposal; `CanvasMazeRenderer` adapts the retained CPU renderer; factory parses `?mazeRenderer=canvas|webgl`; shell now owns distinct 2D and WebGL canvas surfaces plus active-surface opacity/snapshot routing. Floor and resize lifecycle are synchronized from the authoritative `GameState` without querying a scene graph.
- The transitional explicit WebGL request currently reports a reason and falls back to Canvas. Build passed; backend/shell tests passed 10/10; Isobel's full hub walkthrough passed with browser errors empty under `?mazeRenderer=webgl`; the shop-interior screenshot was visually inspected and preserved Isobel/counter/backdrop/mobile composition. The standard web-game client also ran (only its environment-owned module-type warning).
- Registry check: npm reports Three.js `0.185.1` as the current `latest` release. Next: install that pinned dependency and replace the transitional fallback with a lazy-loaded WebGL2 renderer that still falls back on initialization failure.

## 2026-08-08 — Isobel's Iso-spells

- Added a data-driven six-spell NPC shop, persisted purchased spell unlocks, and the mass-resurrection effect.
- Added Isobel and the exact SVG sign `ISOBEL'S / ISO-SPELLS` in a new six-cell Floor 1 side nook at `(16..17,27..29)`, reached through the single door between `(15,28)` and `(16,28)`.
- Focused tests/build/floor validation/export drift passed. Playwright browser binary was installed; title/prologue screenshot rendered with warnings empty. Full in-game shop navigation remains the next manual step if a debug teleport is added.

## 2026-08-08 — Floor 1 Camp hub

- Follow-up grounding gate: fixed the generic floor-standing map-sprite contract. The cache now measures post-key alpha bounds once per image; renderer source-crops to those bounds, preserves their aspect ratio, and anchors the lowest visible pixel to the projected floor line. This applies to Camp decor and map-sprite-backed feature billboards without per-Camp offsets or art regeneration.
- Scale correction: the cropped visible rectangle now inherits the original source-canvas pixel scale (`size / sourceHeight`), so alpha cropping removes padding without enlarging low/wide props. Fresh production captures visually rechecked the one-tile handcart and two-tile lantern; wheels and the lantern base meet the projected floor with no unexpected size jump.
- Diagnostic: all 27 Camp sprites were alpha-bounds audited. The handcart's 120×120 canvas contains a 95×59 visible rectangle ending nine transparent rows above the canvas bottom; multiple other assets have 4–44 trailing transparent rows. A temporary same-size debug sprite with opaque pixels on the literal canvas bottom was rendered at the handcart's one-tile pose, then removed. It and the cropped handcart both met the same projected floor line. Production captures of the restored handcart at one and two tiles were visually inspected; wheels visibly contact the floor. Browser console reported zero errors.
- Follow-up verification: `npm run check` passes: app/tools typecheck, Vite build, full Vitest suite (104 files / 2,136 tests), floor validation (only pre-existing Namanda warnings), and floor-export consistency. `git diff --check` passes.

- Current mission: establish The Camp as Floor 1's third major refuge: a 10×10 false-outdoor twilight settlement rendered by the existing raycaster, with a coherent PixelLab production library, populated layout, review gallery, walkthrough, and measured QA.
- Dedicated worktree `/home/sloppymo/OnyxLabyrinth-camp`, branch `agent/floor1-camp`; the original shared worktree remains untouched.
- Floor 1 safely expands east from 24×28 to 40×28 without shifting any authored coordinate. The open Camp heart is `(25,8)–(34,17)`, entered eastward from `(22,12)` through `(23,12)` and `(24,12)`; columns 35–39 remain unused rock.
- False-sky gate passed with existing ceiling casting: low-frequency muted navy material, worn earth, Camp masonry perimeter, sparse star ceiling features, and one physical root-curtain clue. No renderer extension was needed. Raw prototype evidence and findings live under `docs/camp-art-review/screenshots/false-sky-prototype/` and `docs/CAMP-FALSE-SKY-PROTOTYPE.md`.
- PixelLab production pass generated 54 candidates across materials, hero objects, support props, and ambient people. The first-pass library is frozen after native visual inspection and deterministic alpha/dimension/palette/bounds checks.
- Current assembled layout has 27 map-sprite placements, including six strong landmarks and seven ambient compositions depicting nine people. A 14-view production-preview walkthrough passes with no browser errors; its raw screenshots live under `docs/camp-art-review/screenshots/walkthrough/raw-gameplay/`.
- In-engine tuning enlarged the pavilion and added the accepted palisade checkpoint at the north perimeter. Build and focused Floor 1 assertions pass after this adjustment.
- Next: run the standard web-game client once against the final layout, measure normal/2× sprite load without permanent renderer instrumentation, build the review gallery/generation log, then run the complete project gate and commit coherent production phases.
- Final QA complete: the standard web-game client ran without captured errors; the 14-view Camp walkthrough and the 65-image review gallery were visually inspected; all gallery image requests resolve.
- Performance at the entrance reveal: 27 authored Camp sprites / 17 drawn per frame; temporary 54-sprite stress / 37 drawn per frame; both held 16.7 ms median/p95 frame pacing with no browser errors. The stress population was browser-memory-only.
- Full gate passed: 103 test files / 2,116 tests, app/tools TypeScript, Vite build, all-floor validation, and export drift.
- Completed commits: `6542000` false-sky shell, `bc32071` production PixelLab art/layout, `e53a3f1` visual regression QA. No push or merge.
- Handoff: `origin/main` advanced by five Saint Namanda commits during this pass and overlaps Floor 1 exports/registries/tests. Do not merge this stale-base branch directly; replay or reconcile the three Camp commits onto current main while preserving both hubs, then rerun `npm run check` and both walkthroughs.
- Deliberately deferred: merchant/storage/smith/companion interactions and named service NPCs. The physical service neighborhoods exist, but this art/area pass does not add commerce or companion systems.

## 2026-08-02 — Boss combat music

- Current prompt: replace procedural boss combat bed with authored music file (higher-difficulty-battle.mp3).
- Copied the supplied MP3 to public/assets/music/higher-difficulty-battle.mp3.
- Replaced the procedural oscillator-based boss bed with HTMLAudioElement streaming, matching the pattern used for other BGM tracks.
- Added BOSS_MUSIC_FILE constant and volume setting (0.5), removed bossBed config and related oscillator nodes.
- Updated startBossCombat/stopBossCombat to use music file instead of procedural generation.
- Updated audio test to mock HTMLAudioElement instead of checking oscillator behavior.
- Build passes and all 14 audio tests pass. Committed and ready to push.

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

## 2026-08-02 — Combat and title-menu SFX audibility

- Current prompt: raise battle-scene sound effects and make title-menu switching
  sounds audible over the title music.
- Loaded the `develop-web-game` skill and read the current product reading list.
- Worktree is clean on `agent/floor1-regional-tilesets`; keep the change scoped
  to audio presentation, add focused regression coverage, then build/test and
  verify title plus combat through the production preview and prescribed client.
- Loudness audit found the title cursor at roughly -16 dB peak after routing
  against title music peaking near -7.7 dB after its element volume; combat
  cues had a similar gap against Battle Theme v3. Added scoped 2x UI and 1.8x
  combat sample-family lifts, preserving per-cue ratios/layer ducking and the
  existing 0.8 master. The combat lift keeps the loudest layered presentation
  just under unity at the master input.
- Added focused tests for the title cursor playback gain and a ducked combat
  layer. Next: run focused tests/build, then production-preview verification.
- Focused audio/combat-audio suites pass 22/22. Full verification passes: all
  81 test files / 1,732 tests, both TypeScript checks, and the Vite production
  build. Next: drive title navigation and an Arena fight in production preview,
  confirm decoded samples/cue records, inspect screenshots, and review errors.
- The prescribed web-game client passed title navigation with no console errors;
  its screenshot was visually inspected. The production music-routing smoke
  also passed all 16 checks for normal/boss combat, transitions, media responses,
  and browser errors; its normal-combat screenshot was visually inspected.
- Browser-path review identified that the first title input starts asynchronous
  WAV decoding and could drop that first cursor/confirm cue. Added a per-id
  deferred/deduped UI play so the initial cue fires immediately after decode.
  Focused tests now pass 23/23, including the decode-in-flight case. Next: final
  full gates and updated production-preview cue/gain audit.
- Final gates pass after the deferred-cue change: all 81 test files / 1,733
  tests, both TypeScript checks, Vite production build, and `git diff --check`.
- Final prescribed-client run selected Arena on the title screen, reported the
  expected title route/state, and had no console errors; screenshot visually
  inspected. A separate production-browser gain audit confirmed the first
  cursor request was retained through decode and then played from a real buffer
  at 0.64 gain, while `combat:encounterStart` played from a real buffer at 0.72
  gain. All audio/visual readiness fields settled, failed assets and browser
  errors were empty, and the combat screenshot was visually inspected.
- No commit or push was created during this verification pass. The work was later committed and pushed, then incorporated into the clean merge branch.

## 2026-08-02 — Renderer wall glow wash reduction

- Current prompt: fix orange tint on walls by reducing glowWashAlphaScale from 0.22 to 0.02.
- The amber glow wash was painting over flat wall surfaces, shifting green-gray walls (average RGB 84,93,77) to orange (approximately 94,86,58).
- Reduced glowWashAlphaScale to 0.02 to preserve gold glow lines on genuine corners and depth discontinuities while eliminating the flat-wall amber wash.
- Also carried over completed audio SFX audibility improvements (UI gain 2×, combat gain 1.8×, deferred first-cue handling).
- Verified on a clean branch based on current main; build passes.

## 2026-08-02 — Boss combat music

- Current prompt: replace procedural boss combat bed with authored music file (higher-difficulty-battle.mp3).
- Copied the supplied MP3 to public/assets/music/higher-difficulty-battle.mp3.
- Replaced the procedural oscillator-based boss bed with HTMLAudioElement streaming, matching the pattern used for other BGM tracks.
- Added BOSS_MUSIC_FILE constant and volume setting (0.5), removed bossBed config and related oscillator nodes.
- Updated startBossCombat/stopBossCombat to use music file instead of procedural generation.
- Updated audio test to mock HTMLAudioElement instead of checking oscillator behavior.
- Build passes and all 14 audio tests pass. Committed and pushed.

## 2026-08-02 — Character creation music

- Current prompt: add music to character creation screen using one of the dungeon themes.
- Added party creation BGM using torchlight-beneath-stone.mp3 (from dungeon theme pool).
- Added startPartyCreationMusic/stopPartyCreationMusic methods to audio engine.
- Wired music start/stop to openPartyCreation controller lifecycle.
- Added party creation music test coverage.
- Edge case fix: added tryPlayPartyCreationMusicGuarded() to prevent resume() from starting music on wrong screen.
- Store previous mode before entering party creation to restore correct music on cancel (title→title, town→town).
- Added tests for resume guard and multiple start/stop cycles to prevent overlapping instances.
- Build passes and all 17 audio tests pass. Committed and pushed.

## 2026-08-01 — Quick-map controller binding

- Current prompt: bind the in-dungeon quick-map overlay to a controller button
  and make the overlay slightly transparent.
- Loaded the `develop-web-game` skill. Selected dungeon `Y` because Start and
  Select already own the action ring and save menu; `Y` was free in exploration.
- Added the `Y` toggle route, exposed `Y / V` in the pointer-visible map button,
  and set the complete overlay surface to 0.88 opacity. Next: focused tests,
  build, mocked-gamepad production-preview verification, and screenshot review.
- Focused controller/input/map/shell regression run passed 64/64; `git diff
  --check` is clean.
- `npm run build` passed and the full Vitest suite passed 81 files / 1,730
  tests. Production-preview verification used a mocked standard gamepad and
  confirmed physical button 3 (`Y`) opens, closes, and reopens the quick map;
  movement/turning, traps, menus, full map, combat return, stairs, and narrow
  layout all passed. Computed opacity was 0.88, readiness/errors were empty,
  and desktop/narrow screenshots were visually inspected. Evidence is under
  `/tmp/onyx-map-controller-opacity-rerun/`; the required web-game client also
  ran cleanly under `/tmp/onyx-map-controller-web-client/`. No commit or push.

## 2026-08-02 — Lonesome Forest title-map composition

- Current prompt: inspect the seven supplied summer Lonesome Forest sheets and
  demonstration image, catalog every 16×16 tile, then produce an original,
  deterministic, layered title-screen forest map and validate the rendered
  deliverables. No generated/redrawn pixels and no image-generation model.
- Loaded the `develop-web-game` skill. The live title stage is authoritatively
  768×672 (8:7), exactly 48×42 source tiles, so native output will target that
  design space with a 1536×1344 nearest-neighbor presentation export.
- All seven requested inputs were located and visually inspected. The requested
  `DETAIL_OBJECTS(1).png` corresponds to the supplied
  `Lonesome_Forest_DETAIL_OBJECTS.png`.
- Shared worktree contains unrelated edits, including title-adjacent files.
  Keep this slice isolated under `art/generated/lonesome_forest_title_map/`
  plus a standalone generator; do not modify existing runtime title code.
- Completed the isolated deliverable set under
  `art/generated/lonesome_forest_title_map/`: six labeled contact sheets,
  complete per-cell alpha/color catalog with curated useful roles and exact
  multi-cell patterns, explicit placement JSON, ten transparent layer PNGs,
  native/2x/debug/overview renders, README, validation report, and a layered
  OpenRaster file.
- Iterated through three rendered composition passes. Visual review corrected
  two misclassified rounded bank tiles, excessive water repetition, a tree
  pattern that accidentally included fallen-log cells, disconnected path
  diagonals, sparse perimeter framing, and a weak cave threshold. The final
  48×42 layout has a cardinally connected central route, bank-to-bank vertical
  bridge, continuous meandering river, tiered side shelves, dense edge forest,
  framed cave entrance, abandoned camp, fork sign, off-route chest, bones,
  flowers, river leaves, rocks, and lower discovery branches.
- Programmatic validation passes all checks: 768×672 native and 1536×1344
  presentation dimensions; 1,125 integer/grid-aligned source-tile placements;
  ten matching layers; fully opaque composite; all eight final colors drawn
  from the supplied source sheets; contiguous river; bridge reaches dry land
  on both banks; unchanged source hashes; nearest-neighbor-only scaling; and
  valid ten-layer ORA structure. `unzip -t` also reports no archive errors.
- The required web-game client ran against the live title route. A separate
  live browser proof injected the generated native image without editing
  runtime files; `title_ui_preview.png` shows the real lockup/menu over the map,
  with the quiet central clearing preserving readability and the bridge/river
  visible beneath the FF6 window. Browser console/page errors were empty.
- Final `npm run build` passed. Existing shared-worktree changes remain
  untouched; this slice changed only the generated art directory and this
  progress note. No commit or push was created.
- Refinement pass from user review replaced the shallow, nearly horizontal
  river with a 13-segment S profile; widened the dry main route to a three-cell
  approach outside the lockup-safe band; rebuilt edge trees as staggered,
  connected forest masses; raised the destination into a stepped ruined crown
  using the confirmed two-cell cliff-cave mouth; and broke up the repeated
  upper/lower framing. The bridge now owns both landing cells.
- Added explicit `pathsDoNotOverlapWater` and `pathsDoNotOverlapBridge`
  validation. Final metrics: 1,442 placements, 346/346 connected river cells,
  128 path cells, zero road/water overlaps, zero road/bridge overlaps, ten ORA
  layers, and all eight final colors sourced from the supplied sheets.
- Visually inspected the revised native, debug-grid, layer overview, gateway
  crop, river crop, and final real-title overlay. The 1280×800 browser proof is
  `title_ui_preview.png`; Playwright reported zero errors/warnings. Exact image
  hashes were stable across a second regeneration, ORA archive testing passed,
  Python compilation passed, `git diff --check` passed, and the final
  `npm run build` passed with only the existing large-chunk advisory.

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

## 2026-08-01 — Floor 2 Cursed Library tileset redo

- Current prompt: generate the coordinated four-texture Floor 2 Cursed Library
  set from the supplied comprehensive sprite/tileset brief, then clean and
  verify it in the shipping corridor renderer.
- Loaded the `imagegen` and `develop-web-game` skills. The current f2 set was
  audited before replacement; the wall reads as a library, but the floor and
  ceiling drift into mixed masonry instead of the requested wood-first story.
- Four built-in image-generation sources are complete: walnut bookshelf wall,
  horizontal plank Floor A, its darker worn Floor B twin, and a timber-beam /
  aged-plaster ceiling. The wall source established the shared palette for the
  other three assets.
- Added `scripts/process-generated-tileset.py` for deterministic 128px logical
  reduction, edge crossfading, exact wrap pixels, palette quantization, RGB
  normalization, luminance targeting, and 2x nearest-neighbor ship output.
- Persisted the four raw generations under local-only
  `assets/tilesets/f2-redo/sources/`. Candidate metrics: wall 32 colors / mean
  L65.22, Floor A 20 / L59.38, Floor B 20 / L52.48, ceiling 18 / L51.30.
  Every tile is RGB, 256px, exact-wrapped on both axes, and composed of true
  2x nearest-neighbor blocks. Contact, wall-repeat, A/B checker, and ceiling-
  repeat previews were visually inspected with no hard seam.
- Installed the four candidates into the shipping `src/assets/f2_*_256.png`
  slots. `npm run build` passes and focused renderer/floor suites pass 166/166.
- Ran the required generic web-game client after installing its matching
  Playwright Chromium runtime; its prologue screenshot/state were inspected.
  The existing corridor baseline client then captured all actual Floor 2
  poses: straight, side passage, adjacent front wall, door, darkness, treasure,
  NPC, and stair. Asset readiness failures were empty; the five primary views
  were visually inspected and show readable shelves, wood floors, timber /
  plaster ceilings, no black walls, no missing ceiling, and no texture stretch.
- A dedicated production-preview lifecycle probe on actual Floor 2 passed full
  automap open/close and combat/flee return. Canvas mean luminance stayed
  28.93 → 28.62 after map → 29.21 after combat; readiness failures and browser
  errors were empty. Evidence is under `/tmp/onyx-f2-tileset-browser/` and the
  static source/candidate previews remain under `assets/tilesets/f2-redo/`.
- Final gates: `npm run build`, all 81 Vitest files / 1,730 tests, and
  `git diff --check` pass. No commit or push was created; unrelated maze-prop
  and VFX worktree changes remain untouched.
- Next: the tileset redo is complete; a Floor 2 map/content redesign and new
  library enemy identities remain separate future slices.

## 2026-08-01 — Unified campaign-floor visual audit

- Current prompt: build one production-preview visual audit for all five live
  campaign floors, with runtime-derived/validated poses, objective rendering
  guardrails, lifecycle coverage, machine-readable output, and a human HTML
  gallery. Do not change floor content, renderer math, gameplay, or art.
- Loaded the `develop-web-game` skill and read the required corridor art/style
  guidance plus the existing discovery, baseline, transition, regional, shared
  library, and static-gallery scripts.
- Design decision: derive every pose from `__onyxDebug.FLOORS` in the running
  production bundle. The July 30 `corridor-poses.json` will not be an input.
  Every capture will re-read and verify floor/name/dimensions/position/facing,
  tile, route, warnings, and the current cell's resolved theme/zone before it
  is accepted. Floor 1's five runtime themes are required coverage.
- Next: implement the focused runner and gallery, then add the npm/docs entry
  and run the full build/test/browser/static-gallery verification loop.
- Added `scripts/playtests/floor-visual-audit.mjs`, `npm run visual:floors`, and
  scoped README/style-guide instructions. The runner creates per-floor PNG
  directories plus `report.json` and `index.html`, with runtime pose metadata,
  canvas probes, readiness/errors, and Floor 2 map/combat lifecycle evidence.
- A Floor 1-only production smoke passed objective checks. Visual inspection
  caught the first regional f2 pose looking immediately across into f1 despite
  standing on an f2 cell; regional selection now requires a sustained
  same-theme sightline (or a same-theme close wall), and reports forward theme
  depth so that misleading label cannot recur.
- The first all-floor calibration run captured floors 1–5 and exercised the
  lifecycle successfully. Its only failures were intended F3/F5 darkness at
  mean luminance 5.85/5.97 against a cutoff of 6, while non-background remained
  65.3%/67.4%. Lowered the black-frame floor to 4; the independent 8%
  non-background gate still rejects a flat background. Also biased the A/B
  variation pose toward unobstructed enclosed views after human inspection.
- Next: rerun the full audit cleanly, inspect its final gallery/screenshots,
  then finish the required build/test/diff/static-gallery gates.
- Final production-preview run:
  `ONYX_URL=http://127.0.0.1:5177/OnyxLabyrinth/?debug=1 ONYX_OUT=/tmp/onyx-floor-visual-audit-2026-08-01 npm run visual:floors`.
  It passed with 44 corridor captures and five lifecycle captures, all campaign
  floor ids 1-5 present, zero unavailable poses, zero failed capture/check
  results, and a consistent 744x651 corridor canvas. Final readiness failures,
  browser console/page/request failures, HTTP error responses, and debug error
  events were all empty. The report confirms `runtime-derived` poses and
  `savedPoseFileUsed: false`.
- Floor 1 produced 12 corridor captures: the seven common categories plus
  distinct f1/f2/f5/f4/f3 regional views. Floors 2-5 each produced eight: the
  seven common categories plus their runtime base theme. Floor 2's lifecycle
  used a real four-enemy non-boss encounter; the corridor survived both full
  automap close and flee/return at the same floor, position, facing, and f2
  theme (post-combat luminance/non-background ratios 0.986/0.992).
- Opened and inspected the latest straight, side-passage, depth-0 wall, door,
  A/B floor, darkness, landmark, Floor 1 regional, map-open, map-close, combat,
  and combat-return screenshots. All five floors retain wall/floor/ceiling
  texture, side openings do not become flat black cut-outs, close walls are
  textured, and no center seam or projection stretch was evident. Darkness is
  intentionally very dim but retains geometry; Floor 2 remains readable.
  Stair arrows are visually subtle against several current wall textures, so
  landmark identity is best read with the report metadata; this was recorded
  rather than changing renderer/content in this infrastructure-only task.
- `npm run tileset:gallery` reported 25/25 textures present. Its Floor 2
  singles, 3x3 repeat/seam panels, and floor A/B checkerboard were opened and
  inspected with no missing tile or visible wrap seam. This static source check
  remains distinct from the production corridor audit.
- Final gates pass: `npm run build`; 81 Vitest files / 1,730 tests; and
  `git diff --check`. Generated evidence is untracked under
  `/tmp/onyx-floor-visual-audit-2026-08-01/` (`report.json`, `index.html`, and
  49 PNGs). Exact/golden PNG comparison remains deliberately out of scope
  because flicker, scanlines, fog, and camera timing are live. No commit or push
  was created, and the pre-existing Floor 2, maze-prop, VFX, and other shared
  dirty-worktree changes remain untouched.

## 2026-08-02 — Lonesome Forest focused v2 art-direction revision

- Current prompt: preserve the 768×672 first-pass title map and make targeted
  placement-data changes for a more hand-authored river, forest, route,
  entrance, cliffs, open ground, and campsite; produce versioned v2 outputs,
  a native-scale comparison, layered ORA, real title-screen proof, and full
  deterministic/source-integrity validation.
- Loaded the `develop-web-game` and `playwright` skills. Scoped work to
  `art/generated/lonesome_forest_title_map/` plus this progress entry; no
  runtime game files or unrelated dirty worktree changes were modified.
- Preserved `final_native.png` by pinned SHA-256
  `8ac6c5936701545968a8443ac0bbca9bd9c4a4b94e622db8215a5e847e9ea07e`.
  The generator now refuses to write v2 if that baseline changes and writes
  only versioned outputs/layers.
- Completed two visual correction loops after the first technically valid v2
  candidate: narrowed the river while keeping asymmetric broad bends, removed
  incomplete-looking tree choices, strengthened selective route shoulders,
  reduced the gateway crown's mechanical width, and added the supplied stone
  threshold arch over the recessed two-cell mouth.
- Current v2 validation passes all checks: 768×672 / 48×42, 1,231 exact source
  placements, 316/316 connected water cells, 53/53 connected journey cells,
  zero path-water or path-bridge overlaps, supported cliff faces, clear gate
  approach, exact layer recomposition, eight source colors only, nearest 2×/4×
  previews, intact source hashes, and structurally valid ten-layer ORA.
- `npm run build` passes. The required web-game client booted the production
  preview; Playwright then injected the v2 bitmap behind the real title DOM at
  1280×800. The live title proof has zero console errors/warnings. Exact panel,
  lockup, wordmark, and menu bounds were measured and converted into native-map
  bounds for `placement_map_v2.json` and `final_debug_grid_v2.png`.
- Final foliage-only correction added eleven offset canopy connectors at
  existing mass boundaries; the final title proof shows continuous upper and
  side forest walls while retaining the route, bridge, logo, and gate gaps.
- Final determinism audit found and fixed timestamped ORA members. Two complete
  generator runs now produce identical hashes for the baseline, v2 native,
  2×/4× previews, debug grid, comparison, and editable ORA. Saved layer
  recomposition and the ORA merged image both exactly match the flattened v2.
- Final visual inspection covered native, measured debug grid, layer overview,
  native-scale comparison, 4× river/gateway/route crops, and the regenerated
  real-title proof. Browser warnings/errors remained empty after the final
  foliage pass. Final `npm run build`, `git diff --check`, ORA archive test,
  all 24 validation checks, and repeated byte-stable regeneration pass.
- Complete. No runtime integration, commit, or push was requested or performed.

## 2026-08-02 — Lonesome Forest title-map integration

- Current prompt: integrate the approved v2 Lonesome Forest map into the live
  game title screen and push it.
- Loaded `develop-web-game` and `github:yeet`. The current shared branch has
  unrelated dirty files and three already-pushed commits beyond `origin/main`;
  integration is deliberately limited to a shipping PNG, a title-only CSS
  module, and its clean `title-ui.ts` import. Shared `styles.css`, `main.ts`,
  generated art, and other in-flight changes remain unstaged.
- Installed the exact validated 768×672 v2 composite at
  `src/assets/lonesome_forest_title_map.png`. `title-map.css` preserves the
  native 8:7 fit, nearest-neighbor sampling, and stationary tile grid.
- Next: build, production-preview desktop/mobile title verification, then
  publish from a clean `origin/main` worktree so the existing branch's
  unrelated commits cannot leak into the title-map PR.
- Integration validation passed in the shared worktree and again from a clean
  `origin/main` publication worktree: `npm run build`; required web-game client;
  1280×800 and 390×844 production-preview screenshots; hashed map asset under
  the `/OnyxLabyrinth/` base; menu rerender persistence; zero browser warnings
  or errors. Both screenshots were visually inspected.
- Published isolated branch `agent/lonesome-forest-title`, commit `3bd653b`
  (`feat(title): add Lonesome Forest backdrop`), and draft PR #4 targeting
  `main`: https://github.com/sloppymo/OnyxLabyrinth/pull/4. The PR contains
  exactly the PNG, title CSS module, and title-controller import.
- Complete. The shared worktree remains on its pre-existing branch with its
  unrelated dirty changes preserved; the three integration files remain as a
  local mirror of the pushed PR to avoid switching/cherry-picking beneath
  parallel sessions.

## 2026-08-02 — Merge and publish complete shared worktree

- Current prompt: merge the title-map PR and push everything currently pending.
  The user explicitly confirmed whole-worktree scope, including every unignored
  modified and untracked file, so blanket staging is authorized for this pass.
- Converted draft PR #4 to ready-for-review and squash-merged it into `main` as
  `e246868` (`feat(title): add Lonesome Forest backdrop`). Refreshed
  `origin/main` afterward.
- Pre-publication gates pass on the complete shared worktree: `npm run build`;
  81 Vitest files / 1,730 tests; no failures. The prior production browser
  title checks remain clean at desktop and mobile sizes.
- Next: stage the entire unignored worktree, inspect the exact staged manifest,
  commit and push the current branch, open a PR to refreshed `main`, and merge it.

## 2026-08-08 — The Camp location gate

- Current prompt: build The Camp, a large approximately 10×10 false-outdoor
  Floor 1 refuge, using the existing first-person renderer and a coherent
  PixelLab MCP production-art library.
- Loaded the `develop-web-game`, `playwright`, and `imagegen` skills. Actual
  production asset generation is reserved for PixelLab MCP per the prompt;
  the image skill contributes inspection and artifact-QA discipline.
- Created isolated worktree `/home/sloppymo/OnyxLabyrinth-camp` on
  `agent/floor1-camp` from current `origin/main` at `8314483`. The shared main
  worktree's unrelated dirty combat/sprite work was not touched.
- Audited the live 24×28 Floor 1 grid and every coordinate overlay. There is
  no safe-margin untouched 10×10 region, or even a 6×6 one. The best 10×10
  candidate overwrites 28 active cells and substantial Saint Namanda content;
  the largest untouched rectangle is only 17×3.
- Mission stop gate reached before sky prototyping or PixelLab generation.
  Detailed evidence and ranked candidates are in `docs/CAMP-LOCATION-AUDIT.md`.
- The user approved a 40×28 eastward expansion, preserving every existing
  coordinate, with a 10×10 Camp heart at `(25,8)`–`(34,17)`, an east-facing
  approach from `(22,12)`, and untouched future rock at `x=35`–`x=39`.
- Expansion, approach, safe zone, theme zone, floor revision, exports, and
  editor-compatible serialization are implemented. Focused tests lock the
  10×10 openness and unused eastern headroom; floor validation has zero issues.
- False-sky candidate 1 was rejected in raw gameplay: discrete cloud masses
  repeated into a perspective polka-dot ceiling. Candidate 2/3 uses a nearly
  solid muted navy field plus three sparse star feature cells. Raw 1/3/5/8+
  tile and cross-room captures show open volume without obvious stamp motifs.
  Existing renderer architecture passes the P0 gate; no extension is needed.
- Added the persistent `scripts/playtests/camp-sky-prototype.mjs` capture and
  visually inspected all ten raw screenshots. Browser console/network errors:
  zero. Build and focused floor/validator tests pass.
- PixelLab MCP connection and production schemas are confirmed. Opening balance
  is 1,812 subscription generations. Production generation may now begin.

## 2026-08-08 — Camp recomposition in progress

- Corrected the renderer design to use a Camp-owned sky panorama instead of Floor 1's primary ceiling texture; heading-aware sampling and Camp-only readable-night lighting passed visual verification from the Camp's four headings with no browser errors.
- Repositioned Camp visual-only props into the fortified-caravan composition selected by the user; no collision, encounter, or gameplay data changed.
- Verification: production-preview Camp screenshots were visually reviewed from the four cardinal headings with zero browser console errors. `npm run build`, the focused renderer/floor tests (166), the full suite (104 files / 2,134 tests), floor validation, and floor export consistency all pass. Existing Floor 1 validator warnings concern Namanda content, not this Camp pass.

## 2026-08-10 — Maze Renderer 2

- Created isolated worktree `/home/sloppymo/OnyxLabyrinth-maze-renderer-2` on
  `feat/maze-renderer-2` from `origin/main` `06ffb48`, then replayed the five
  local-only Isobel commits. The original ahead-5/behind-2 Isobel worktree and
  unrelated dirty Camp/progress files remain untouched.
- Recorded the Canvas baseline with an opt-in bounded profiler and deterministic
  live corridor poses. Headless Chromium reports SwiftShader, so frame pacing is
  diagnostic only; CPU section timings remain useful comparative evidence.
- Added the graphics-only backend interface and graceful Canvas fallback, then
  installed Three 0.185.1 and implemented a WebGL2 renderer with 16x16 batched
  static BufferGeometry, shared prepared texture sources, GPU fog/depth, real
  doors/features, wall decals and text, NPC/decor billboards, ceiling features,
  hanging sprites, and cheap additive local glows.
- Added backward-compatible `heightZones`, pure `CellVolume` resolution and
  boundary-span compilation, validator/editor/schema/export preservation, and
  focused tests. The dev height laboratory demonstrates 1x/2x/3x ceilings,
  upper closure above a low portal, repeating tall-wall UVs, a high ceiling
  feature, and a ceiling-anchored chain.
- Browser checkpoints: Isobel WebGL walkthrough passes with zero errors and
  preserves the approved door/backdrop/character/counter composition. Height
  lab passes with zero errors at 13 visible draw calls / 296 triangles before
  the subsequent 16x16 chunk retune is remeasured.
- Next: rerun performance after the chunk retune, switch the verified production
  default, document architecture/limitations, exercise resource transitions,
  run the full verification gate, and make focused local commits. Nothing will
  be pushed or merged.
- Production default is now WebGL with `?mazeRenderer=canvas` retained. The
  equal-sample final benchmark uses 30 warmup + 90 measured frames per scene at
  744x651/DPR 1. Canvas Isobel-walking p95 is 29.3 ms versus WebGL 1.5 ms;
  WebGL static scene CPU submission is 0.4-1.5 ms p95 under SwiftShader.
- Final canonical gate passes: 112 test files / 2,186 tests, app and tools
  TypeScript, Vite build, floor validation, and floor export-check. The only
  warnings are the pre-existing font/chunk advisories and known Namanda floor
  lints. Repeated Floor 1↔2 resources are stable and all four hub walkthroughs
  pass with zero browser errors.
- Implementation commit: `b3bd967 feat(renderer): add webgl variable-height backend`.
  Documentation is the remaining local commit; no push, merge, or PR action.

## 2026-08-10 — Maze Renderer 2 vertical traversal

- Current prompt: first re-audit and stress-test the actual Renderer 2 branch,
  then add grid-based traversable ramps and local stairs across non-unit
  `floorZ` changes without physics, free movement, or stacked occupancy.
- Safety audit: fetched all remotes; `origin/main` remains `06ffb48`. The clean
  Renderer 2 branch remains at reported `ad96b2d`, ahead 13 / behind 0. The
  original Isobel worktree is still ahead 5 / behind 2 with unrelated dirty
  Camp art/progress files, all untouched.
- Created isolated worktree
  `/home/sloppymo/OnyxLabyrinth-maze-vertical-traversal` on
  `feat/maze-vertical-traversal`, branching directly from verified Renderer 2
  HEAD `ad96b2d`. Nothing will be pushed, merged, reset, rebased, or stashed.
- Next: map the actual renderer/movement/tooling architecture and complete the
  full pre-change verification, hardware diagnostic, benchmark, and tall-room
  visual audit before editing ramp code.
- Pre-change gate passed exactly at 112 test files / 2,186 tests, both app and
  tools TypeScript builds, Vite production build, floor validation, export
  drift, and `git diff --check`. Only the documented font/chunk advisories and
  known Namanda lints appeared.
- Existing Renderer 2 QA passed before ramp edits: the 1×/2×/3× height lab,
  ten-cycle Floor 1↔2 lifecycle, and all Camp/Namanda/Tavern/Isobel hub flows
  produced zero browser errors. Height captures were visually inspected from
  low→high and high→low; no cracks, inverted faces, texture stretch, ceiling
  leakage, sprite-anchor problems, or z-fighting were found.
- Headless Chromium 140 is confirmed WebGL2 SwiftShader. Its equal-sample
  pre-ramp WebGL benchmark remains software-only: Floor 1 straight 1.1/1.3 ms
  median/p95, Isobel hero 0.8/1.0, Isobel walking 1.0/1.8, tall lab captured
  separately at 5 draws / 320 triangles.
- Headed system Chrome 151 can access the real machine GPU: ANGLE OpenGL on
  NVIDIA GeForce RTX 2060 SUPER, WebGL2, 1280×800 viewport, 744×651 maze,
  DPR≈1. Pre-ramp headed med/p95: straight 0.7/0.9 ms, Isobel hero 0.5/0.7,
  Isobel walking 0.7/1.1, tall room 0.2/0.3. Reports are under ignored
  `playtest-screenshots/maze-vertical-traversal/pre-benchmark/`.
- Architecture decision: no mutable player Z. Add a pure resolved floor-surface
  model shared by traversal, validation, compiler, camera, visuals, and debug.
  `game/traversal.ts` remains authoritative; Three continues to consume state.
- Next: implement portable ramp definitions and surface math/tests first, then
  generalize boundary patches and camera elevation in separately verified
  slices.
- Portable surface slice complete: optional `ramps` round-trip through
  FloorDef/JSON/parser/clone/editor resize/schema/ASCII dump. `dir` names the
  uphill edge and `surface` selects `ramp` or `stairs`; endpoints derive from
  the connector cell's floorZ and uphill neighbor floorZ, so gradual chains do
  not duplicate fromZ/toZ.
- Added pure flat/ramp/stair surface sampling, global edge profiles, side-entry
  classification, exact edge matching, and world-position sampling. Game
  traversal now permits only meeting surfaces, preserving flat movement while
  blocking raw steps and ramp-side entry without querying WebGL.
- Validation now covers bounds, duplicates, non-uphill/zero rise, exact open
  low/high endpoints, strict wall sides, clearance at the surface high point,
  inter-floor stair conflicts, and unsupported NPC/map-sprite placement.
- Focused surface/map/validator/traversal tests pass 58/58; test TypeScript,
  tools TypeScript, production build, and `git diff --check` pass.
- Next: generalize vertical spans into sloped boundary patches and compile real
  ramp/stair floor meshes with deterministic geometry tests.
- Geometry slice complete and committed as `d05b20d`: endpoint-aware boundary
  patches retain legacy spans while supporting bottom0/bottom1/top0/top1;
  continuous ramps are one true sloped quad, side-wall bottoms follow the
  slope, and local stairs use four treads/four risers. A browser pass caught
  and fixed stair-side triangular voids by using solid low-base stringers.
- Camera elevation now samples the real surface beneath the shared interpolated
  X/Y display camera; no playerZ was added. Resting on a ramp uses its center
  height, reverse traversal is exact, turning preserves height, and WebGL head
  bob is a small independent world offset converted from the legacy 2.5px bob.
- `?mazePerf=1` now shows cell, surface kind/direction, surfaceZ, cameraY and
  ceilingZ. Canvas fallback explicitly warns that authored local-Z connectors
  require WebGL and otherwise retains legacy flat presentation.
- Dev Floor 92 proves one-cell ramp ascent/descent, in-motion elevation,
  turning on a ramp, a four-cell 0/.25/.5/.75/1 gradual climb, four-step local
  stairs, high room, elevated crate, ceiling grate and hanging chain. Twelve
  captures plus report/contact sheet live under ignored
  `playtest-screenshots/maze-vertical-traversal/vertical-demo/`; zero browser
  errors, 4 final visible draws / 260 triangles. Every capture was visually
  inspected; no remaining cracks, holes, inverted faces, z-fighting, fog or
  grounding errors.
- Renderer/geometry/tooling focused gate passes 82/82, production build passes,
  and the required standard web-game client also completed (its title/prologue
  smoke produced only the environment-owned module-type advisory).
- Next: commit camera/fixture slice, add documentation, then run before/after
  performance, resource lifecycle with the ramp floor, flat-scene parity,
  full check, and final visual regressions.
- Post-change flat-scene SwiftShader comparison shows no meaningful regression:
  straight 1.1/1.2 ms median/p95 (pre 1.1/1.3), Isobel hero 0.8/1.0
  (unchanged), and Isobel walking 1.1/1.5 (pre 1.0/1.8), with identical
  draw/triangle counts. Floor 1, darkness, combat return, height lab, normal
  lifecycle and all four hub walkthroughs pass with zero browser errors.
- Headed Chrome 151 remains confirmed on real ANGLE/NVIDIA RTX 2060 SUPER
  WebGL2. Post flat med/p95 is 0.7/1.0 ms for straight, 0.5/0.7 for Isobel
  hero and 0.6/0.8 for Isobel walking. New connector scenes are 0.1-0.2 ms
  median / 0.2-0.3 ms p95 at 4-7 visible draws and 260-266 triangles.
- Ten normal-floor/ramp-floor cycles return exactly to 70 textures and 7
  geometries. The floor editor smoke passes 9/9. Post screenshots preserve
  Isobel depth, low/high portal closure, fog and flat corridor framing.
- Final Vitest result is 114 files / 2,215 tests. The first full gate correctly
  caught stale generated ASCII floor dumps after the legend gained local-ramp
  arrows; all five tracked tool/public dumps were regenerated and reviewed.
  The final canonical gate now passes app/tools TypeScript, Vite build, all
  tests, floor validation, export parity, and `git diff --check`. Only the
  established font/chunk advisories and known Namanda content warnings remain.
- Reproducible headed/hardware selection, benchmark/lifecycle evidence and
  generated floor dumps are committed as `61d34b8`. Documentation is the last
  local commit; no push, merge, stash, rebase, reset, or PR action occurred.

## 2026-08-12 — Floor 1 verticality focused visual pass

- Real-browser pass covered the actual Floor 1 spawn and Gate approach, Index ramp `(10,18) w` in both directions, both Ember ramps `(13,4) e` / `(13,10) e` as a loop, rapid/slow ramp traversal, all 12 newly sealed boundaries, and the Stitchworks catwalk overlook.
- The only genuine regression was the catwalk view: the lower barred gate read as an unexplained full wall. WebGL now renders a low parapet above that gate while retaining the sealed grid boundary and blocked traversal; the post-fix screenshot shows the lower metal gate distinctly below the catwalk.
- Canvas fallback smoke still renders the architectural scene without disappearing. Browser warnings/errors remained empty, and `npm run check` passed: 116 files / 2,245 tests, app/tools typecheck, build, floor validation, and export parity. Existing Namanda content warnings remain unchanged.

## 2026-08-15 — Formation chemistry implementation baseline

- Created isolated worktree `/home/sloppymo/OnyxLabyrinth-formation-chemistry-implementation`
  on branch `feat/formation-chemistry` from baseline
  `11573958c9a69875317ef952f660ee01dc707420`.
- Phase 0 verification passed after installing dependencies from the lockfile:
  `npm run check` completed app/tools typechecks, Vite build, 120 Vitest files / 2,350
  tests, floor validation, and floor export parity. The only reported floor issues are
  the existing Namanda warnings.
- No formation data or production formation logic has been added. The authoritative
  synthesis remains pinned to commit `64a4cc50c723bb4b1dd3466ff3659b4b55ffd321`; the
  implementation handoff corrections treat passive resource disability as non-filtering
  and use the relief-encounter percentages as investigation heuristics only.

## Phase 1 — Formation metadata and type substrate

- Added narrow authored `ChemistryResourceGroup` membership, explicit enemy
  sprite alias resolution, stable encounter `id`/`family` metadata, and optional
  display names.
- Added chemistry selector/payoff/effect metadata, cooldown/use-cap fields,
  exact committed wind-up/action identity fields, dedicated chemistry event and
  telemetry types, and runtime enemy provenance fields for spawn/reward/removal.
- Added optional floor-local encounter pacing to `FloorDef` and the portable
  floor-map parser/round-trip path. No pacing behavior is active yet.
- Both combat painters now resolve `EnemyDef.spriteId` through the shared cache
  helper, preserving existing IDs and fallback behavior.
- Verification: targeted metadata/floor/cache tests passed (65 tests); full
  `npm run check` passed (120 files / 2,353 tests). Existing Namanda validation
  warnings are unchanged.

## Phase 2 — Resource chemistry and economy

- Implemented the shared `consumeAlly` substrate with exact authored group or
  ID selectors, oldest `spawnSerial` ordering, reservation, finite use caps,
  cooldown commitment, exact wind-up/action IDs, and no retargeting.
- Passive resource sleep/paralysis/disabled status does not disqualify a body;
  committed actors and active partners still break when dead or disabled.
- Consumption marks `removalCause: "consumed"` before the shared death sweep,
  suppresses the consumed body's later action, preserves ordinary rewards for
  original encounter enemies, and grants zero rewards to summoned bodies.
- Added fight-wide four-enemy summon budget, live three-per-row enforcement,
  per-ability max-use tracking, spawn provenance, and next-round enemy summon
  timing in both round-based and per-turn flows.
- Added the first inert S-tier ability definition (`crypt-slime-cannon`) so the
  primitive is exercised before the Floor 1 roster is activated.
- Verification: formation substrate tests cover exact gating, future untagged
  enemies, deterministic ordering, duplicate reservation, committed resource /
  actor / target death, interruption, caps/cooldowns, rewards, summon budget,
  and both combat APIs. Full `npm run check` passed (121 files / 2,363 tests).
- Post-gate contract correction: aligned the closed payoff union, exact
  `resource`/`partnerIds`/presentation fields, explicit Living Shield target
  metadata, and the authored .70/.65/.75 chemistry chances with the pinned
  synthesis. The corrective full gate also passed (121 files / 2,363 tests);
  no renderer or campaign roster behavior changed.

## Phase 3 — Chemistry events and first presentations

- Added a dedicated `chemistry` event lifecycle with explicit telegraph,
  resolve, consume, and break phases. Resolution now emits resolve before the
  exact resource is marked consumed; ordinary cast events carry only the
  per-target damage/heal payload and no longer create duplicate chemistry
  banners.
- Added one shared choreography path for Canvas and Phaser: Slime Cannon
  resource pull/arc/impact/removal, Bone Harvest restorative burst, Spawn Bomb
  party flash, and Combo Break. Chemistry effect ids are collected by the same
  asset validation path as ordinary combat effects.
- Added chemistry phase audio routing and fixed actor-disable wind-up cleanup
  so chemistry reservations are released when a committed actor is interrupted.
- Verification: chemistry choreography/audio/event tests passed; full
  `npm run check` passed (121 files / 2,367 tests), including app/tools
  TypeScript, Vite build, floor validation, and export parity. Browser visual
  forcing is deferred to the deterministic roster/scenario phase because the
  Phase 3 substrate has no active Crypt encounter roster yet.

## Phase 4 — Bounded guard/interception

- Added the separate `guard` token primitive with exact authored target IDs,
  two-round expiry, one-token consumption, non-stacking/self-guard rejection,
  and immediate invalidation when a guarder or target dies or is disabled.
- Routed the same guard lookup through attacks, ambushes, single-target damage
  spells, single-target techniques (including whole-action multi-hit redirect),
  previews, target-menu formatting, and the shared Canvas/Phaser choreography.
  Area and status-only actions bypass it; the intended target remains selected
  and the event carries the exact guarder/target IDs.
- Added the Living Shield ability metadata with explicit `crypt-warlock` /
  `crypt-demon-mage` target IDs, five-round cooldown, one-use cap, and .90
  chemistry chance. No campaign roster was activated in this phase.
- Verification: guard primitive tests cover round/per-turn setup, attack,
  spell, ambush, technique, multi-hit, bypasses, previews, expiry, death,
  disable, and recursion/stack rejection. Full `npm run check` passed:
  122 files / 2,376 tests, app/tools typechecks, Vite build, floor validation,
  and export parity. Existing Namanda validation warnings remain unchanged.

## Phase 5 — Partner and charged signatures

- Added `packStrike` with an exact committed partner and target, per-round
  partner-action reservation, no retargeting, and Combo Break on invalid actor,
  partner, or target. Hunting Pack resolves two fixed-power physical hits while
  both original enemy bodies remain alive and visible.
- Added Rune Overload on the existing `consumeAlly` substrate. It commits the
  exact conductive construct, leaves that battery alive and killable during the
  charge, consumes it after the delayed enemy turn, and discharges lightning to
  the full party without inventing a party target ID.
- Added shared pack convergence/recoil and Rune tether/charge/collapse/field
  choreography for Canvas and Phaser, plus a playback-duration fix so bespoke
  return steps cannot be clipped by the logical event cursor.
- Verification: targeted Pack/Rune and choreography tests passed (74 tests);
  full `npm run check` passed (123 files / 2,385 tests), including app/tools
  typechecks, Vite build, floor validation, and export parity. Existing Namanda
  validation warnings remain unchanged.

## Phase 6 — Floor 1 variants and first-test roster

- Added the exact 17 explicit low-power Crypt EnemyDefs referenced by the
  authoritative Floor 1 roster, each with a player-facing name, explicit
  reward/kit, and verified `spriteId` alias. Floors 2–5 native EnemyDefs and
  tables were not altered.
- Replaced the old Floor 1 encounter table with the specified 18 entries and
  pre-gate weights totaling 33, including the experimental
  `f1-slime-cluster` and `f1-bone-archer-line` relief encounters. Their later
  retention will be judged by trace/manual evidence; no arbitrary percentage
  gate was added.
- Added exact-Skeleton `ogre-toss` and a Crypt-specific capped Spawn summon so
  the F1 roster uses the intended low-power Crypt body without changing the
  existing later-floor `summon-imp` behavior. Random Floor 1 encounters now
  carry id/family/display metadata and explicitly enable chemistry; scripted,
  Arena, NPC, and non-F1 creation paths remain opt-out.
- Repository evidence required one focused test-contract update: the old
  generic weighted-pack minimum of 3 conflicts with the authoritative F1 table,
  whose measured value is exactly `82 / 33 = 2.4848` due to intentional
  two-body/solo relief and signature entries. The test now asserts that exact
  F1 value while preserving the existing Floors 2–5 minima.
- Verification: roster/data, alias, Ogre Toss, and encounter-metadata tests
  passed; full `npm run check` passed (123 files / 2,391 tests), including
  app/tools typechecks, Vite build, floor validation, and export parity.

## Phase 7 — Floor 1 pacing, family anti-repeat, and telemetry

- Applied the Floor 1-only encounter profile: rate `.05`, cooldown `14`, pity
  start `34`, and forced cap `52`. The exact discrete distribution measures
  mean gap `27.6911`, median `27`, p90 `40`, and hard maximum `52`; floors 2–5
  retain the global fallback profile.
- Added a module-local, session-only three-family buffer. Random dungeon rolls
  weight the newest family `0`, the second-newest `.25`, the third-newest `.5`,
  and older families `1`; if all candidates are excluded, authored weights
  provide a deterministic fallback. Floor changes and explicit fresh loads
  reset it, and forced/scripted, Arena, NPC, and safe-zone paths do not use it.
- Separated chemistry telemetry lifecycle metrics: enabled encounters record
  chemistry presence at formation creation, while eligibility is counted only
  after authored conditions, exact resources/partners, caps, cooldowns, and
  guard targets are valid; telegraph, attempt, resolve, and break remain
  distinct. Anti-repeat history is not serialized.
- Regenerated the tracked Floor 1 JSON/TXT exports after the pacing change.
- Verification: focused pacing/family/chemistry tests passed (114 tests); full
  `npm run check` passed (123 files / 2,395 tests), including app/tools
  typechecks, Vite build, floor validation, and export parity. Existing
  Namanda validation warnings remain unchanged.

## Phase 8 — Balance, relief audit, and browser acceptance

- Added the final F1 relief decision from evidence rather than arbitrary
  percentage gates. `f1-slime-cluster` was removed because 100-seed default,
  focused, and AoE traces produced no Split or meaningful kill-order decision;
  `f1-bone-archer-line` was removed because Archer pressure did not resolve
  before Archer death and Skeletons did not create a durable Archer-versus-line
  decision. Their six weight points were redistributed among surviving F1
  entries; no filler replacement was added.
- Fixed the authored F1 Hunting Pack initiative ordering after browser and
  simulation evidence showed the Werewolf acting before the leader, making the
  exact partner reservation ineligible. `crypt-hellhound` now acts before
  `crypt-werewolf`, with a data regression test.
- Added stale-queue and party-wipe reconciliation: actor death closes its
  exact chemistry wind-up once, and a party wipe closes any still-committed
  queued chemistry use without retargeting. Added tests for both paths.
- Added `scripts/playtests/formation-chemistry-phase8.ts` and regenerated
  `docs/playtests/2026-08-15-formation-chemistry-phase8.{json,md}`. The final
  N=100 run covers 21,600 matrix/lab fights and 1,200 ten-fight expeditions.
  F1 normal gaps are mean `27.6911`, median `27`, p90 `40`, max `52`.
  Across the active matrix, each chemistry id reconciles attempted uses as
  resolved plus broken: Slime Cannon `886 = 1 + 885`, Ogre Toss
  `902 = 343 + 559`, Living Shield `2,332 = 1,885 + 447`, Hunting Pack
  `821 = 3 + 818`, Spawn Bomb `1,758 = 1,054 + 704`, and Rune Overload
  `605 = 1 + 604`.
- Ten-fight expedition results are recorded in the report. Normal-route
  chemistry-aware runs completed ten fights `71/100` versus `56/100` for the
  no-chemistry control; quiet `69/100` versus `61/100`; dead `67/100` versus
  `68/100`; hot `71/100` versus `62/100`. The harness starts at level 1 with
  three potions and no intervening healing, so the remaining wipe/pressure
  signal is an explicit balance risk rather than a hidden acceptance claim.
- Browser acceptance used the production preview and Playwright in both
  Canvas (`?phaser=0`) and Phaser backends. Inspected all five S-tier scenes:
  Slime Cannon, Hunting Pack, Spawn Bomb, Living Shield marker/direct
  intercept/AoE bypass, and Rune Overload. Also inspected Bone Harvest, Ogre
  Toss, Pack Leap, and Combo Break. Screenshots are in
  `output/playwright/formation-chemistry-{canvas,phaser}/`; Canvas and Phaser
  console checks reported zero errors.
- Final verification: `npm run check` passed with 123 test files and 2,397
  tests; floor validation/export parity passed with only the existing Namanda
  warnings. No experimental branch was cherry-picked and nothing was pushed.

## Adversarial final audit — 2026-08-15

- Re-ran the lab after correcting its seed path: party stat rolls, combat RNG,
  and bark RNG are now paired and reproducible. The final N=100 artifact covers
  21,600 matrix/relief fights, 1,200 expeditions, and 33,040 per-fight CSV
  traces. Balanced aware play completed ten fights more often than default or
  no-chemistry control on every route, but Guarded Bomb remains a difficulty
  spike and several resource signatures are usually countered before payoff.
- Fixed four audit defects: duplicate/stale chemistry reservations, missing
  AoE guard-bypass telemetry, Arena inheriting the random F1 chemistry roster,
  and the debug fixture helper ignoring explicit combat states. Softened the
  F1 Forge variants after the first lab showed magic-heavy naive wipes.
- Final verdict is `PASS WITH TUNING`: contract tests and shared Canvas/Phaser
  presentation pass; organic signature frequency, Guarded Bomb attrition, and
  5th/10th/20th exposure fatigue remain human-playtest questions.

## 2026-08-09 — Isobel / Floor 1 correction pass

- Preserved the six-cell Isobel shop and shelf/sign presentation. Isovoid now
  removes enemy wards while preserving harmful enemy statuses and party buffs;
  Isobarrier stacking retains the strongest active reduction.
- Reworked the canonical F1 floor generator's floor wear: short cracks and
  small seam/corner moss patches replace broad green masses. Wall and ceiling
  assets remain untouched; revised bundled/public floor twins are byte-equal.
- Focused combat/shop tests: 102/102; production build and browser corridor/
  shop screenshots passed with no game console errors. Full project gate remains
  to be run before the focused changes are committed; this note is not staged
  with the unrelated Camp work.

## 2026-08-11 — Cistern basin replacement

- Diagnosed a user-reported "ugly placeholder" screenshot of a water tile in
  the corridor: the shipped `cistern-basin` map-sprite harvested a pot/urn
  cell from the Classic Dungeons pack (no basin exists in the pack), and its
  dark rectangular interior plus two symmetric drip-highlight accents read as
  a robot/helmet face at in-corridor render scale.
- Replaced it with an AI-generated asset via `scripts/pixellab-generate.mjs`
  (pixflux, 64x64, transparent), following the same path used for
  `anvil-altar`/`forge-guardian-statue`. Accepted first try; manually grounded
  (+8px). See `docs/MAZE-EVENT-SPRITE-PROMPT.md` #15 for the full prompt and
  the pareidolia-avoidance lesson.
- Removed the old deterministic `cisternBasin()` recipe from
  `scripts/generate-maze-props.mjs` so a routine re-run of that script cannot
  silently revert the new art.

## 2026-08-12 — Treasure chest replacement

- User called out the shipped `chest-closed`/`chest-open` map-sprites as
  "terrible vector" art: both were harvested from the Classic Dungeons pack's
  `classic_dungeons_animated_box_chest` cell and recolored, but that source
  cell is a low-detail, near-flat silhouette at 32x32 in-corridor scale — no
  wood-grain shading, no metal ramp on the iron bands — so it read as crude
  flat vector art next to AI-generated props like `anvil-altar` and
  `cistern-basin`.
- Replaced both with AI-generated art via `scripts/pixellab-generate.mjs`
  (pixflux, 64x64, transparent), same path as `cistern-basin`. Neither prompt
  landed first try: `chest-closed` first came back as a glowing purple
  monolith/portal until the silhouette was pinned down explicitly and
  "no purple/glow/aura/gemstone" was added to the negative list;
  `chest-open` took three passes to stop drawing a visible gem inside the
  cavity and to actually show a gap between the lid and the box instead of
  reading as closed. Both manually grounded (+9px closed, +10px open). See
  `docs/MAZE-EVENT-SPRITE-PROMPT.md` #1-2 for the full prompts and notes.
- Verified in-engine at the Floor 1 treasure tile (18,2): adjacent, two
  tiles back, and from the opposite (east) approach, plus the looted/open
  state forced via debug state mutation. Zero console errors,
  `scripts/playtests/verify-chest.mjs`.
- Removed the old deterministic `chestClosed()`/`chestOpen()` recipes (and
  their `save()` calls) from `scripts/generate-maze-props.mjs`, same
  pipeline-hygiene fix as the cistern basin.

## 2026-08-12 — Bones decor sprite replacement

- Surveyed remaining placeholder art after the chest fix; `bones.png` (a
  single-commit stub from the original floor-authoring-suite scaffold, never
  part of the deterministic harvest pipeline) barely read as a skull-and-arc
  shape at in-corridor scale — the ugliest asset still shipping.
- Replaced it with an AI-generated skeleton-remains pile via
  `scripts/pixellab-generate.mjs` (pixflux, 64x64, transparent), accepted
  first try. Prompt explicitly called for a low, floor-hugging pile rather
  than an upright skeleton pose. Manually grounded (+13px). See
  `docs/MAZE-EVENT-SPRITE-PROMPT.md` #7 for the full prompt and notes — this
  also resolves the doc's long-standing "overlaps map-sprite `bones`" flag,
  since prompt #7 and the `bones` map-sprite are now the same shipped asset.
- Verified in-engine at Floor 1's `(4,4)` bones placement from both approach
  directions (`scripts/playtests/verify-bones.mjs`), zero console errors,
  full `npm run check` gate green.
- `torch`, `crate`, and `barrel` were the same original crude placeholder
  batch; their replacement is documented below.

## 2026-08-12 — Basic decor trio replacement

- Diagnosed the remaining 121/128/145-byte `torch.png`, `crate.png`, and
  `barrel.png` files as the original floor-authoring-suite scaffold stubs:
  flat single-tone silhouettes with almost no material shading. They are plain
  `mapSprites` decor (`baseSize` 28/32/32), not tile-feature hooks, and their
  single-commit history has no deterministic recipe to retire.
- Replaced all three with AI-generated PixelLab sprites via
  `scripts/pixellab-generate.mjs` (pixflux, 64x64, transparent), accepted on
  the first try for each. The prompts explicitly pinned the sconce/cup/flame,
  box/top/front/side/bands, and barrel/rim/body/three-hoop silhouettes, while
  naming the likely cross-reads and face/helmet pareidolia as negatives.
- Manually grounded the accepted art: torch +6px, crate +5px, barrel +4px.
  Raw and grounded candidates are retained under
  `art/pixellab-candidates/maze-props/`.
- Verified in-engine at Floor 1 map-sprite placements torch (10,24), crate
  (16,8), and barrel (24,18), from two adjacent approach directions each via
  `scripts/playtests/verify-basic-decor.mjs`; screenshots were visually
  inspected and console/page errors were zero. One initial barrel north view
  faced a wall and was replaced with the south approach; the sprite itself
  rendered correctly from both valid views.

## 2026-08-12 — Ember scorch wall decal replacement

- Diagnosed `public/assets/wall-features/ember-scorch.png` (1,357 bytes) as the
  C-graded F1 wall decal that read as another centered rectangle. It is a
  `wallFeatures` decal, not a `mapSprites` floor prop, placed on east walls at
  Floor 1 (12,5) and (26,6); the existing `widthFrac`/`heightFrac`/`anchor`
  metadata in `src/data/wall-features.ts` did not need to change.
- Replaced it with an AI-generated 64x64 opaque PixelLab wall decal via
  `scripts/pixellab-generate.mjs` (pixflux, 64x64, `--background`), using the
  F1 wall tileset (`public/assets/tilesets/f1/wall.png`) as a `--palette` to
  lock the wall color. The first candidates drew a lit wall torch or brazier;
  subsequent candidates with any rust/red in the prompt produced a bright
  red-outlined circle/portal or a small red ember blob. The accepted 10th
  candidate removes all warm colors from the positive list and asks for a low,
  irregular, lopsided sooty scorch with a slightly lighter ashen edge so the
  shape is visible against the wall, not a centered rectangle and not a flame.
- Added `scripts/playtests/verify-ember-scorch.mjs` and captured the (26,6) east
  wall from the front cell and one tile back; screenshots were visually
  inspected and console/page errors were zero. The new decal is visible as a
  dark, low soot mark above the floor line.
- Full project gate passes: `npm run check` (typecheck, build, 2,164 Vitest
  tests, floor validate, floor export-check), with only the pre-existing
  Namanda-related floor warnings.
- Updated `docs/MAZE-EVENT-SPRITE-PROMPT.md` prompt #23 and the running
  progress log.

## 2026-08-23 — Card Trial production-feel pass

- Played real Card Trial fights before editing. The highest-value gaps were
  weak card commitment, quiet Guard/Opened/Consume state changes, missing
  enemy-turn punctuation, and no presentation-level decision telemetry.
- Added a reusable presentation vocabulary on the existing combat choreography:
  physical card commit/reflow, Guard gain and Guard absorption (`-G`/`BLOCK`),
  Opened exposure, Consume payoff, Rat cue, and explicit `ENEMY TURN` hand
  transition. Card Trial now routes these structured events through the
  existing combat SFX mapper without adding new audio assets.
- Added the debug-only live review fixture
  `scripts/playtests/card-trial-feel-review.mjs` for motion frames, five
  viewport states, sound snapshots, and Phaser/Canvas review. Added the
  presentation telemetry fields and corrected its decision-time summary to
  report milliseconds as seconds.
- Updated the same-session Card Trial exit fixture to navigate through the
  current Arena → Card Trial route. It passed with zero residue and a campaign
  party of four after exit.

## 2026-08-23 — Card Trial playtest operations

- Added a debug-only, versioned Card Trial session recorder with anonymous
  session/build metadata, seeded fight setup, semantic card/Move/Pass actions,
  interaction events, per-card exposure, context, and normalized state hashes.
- Added browser replay through production sparse DOM controls, first-difference
  reporting, renderer-health checks, and screenshot evidence. Added session
  summary/aggregate scripts, a deterministic state-aware input fuzzer, a local
  playtest build command, human observer protocol, and session-note template.
- Fixed recorder coverage for single-target cards confirmed through the target
  phase; direct engine state and presentation remain unchanged.
- Added the stable-UID hand re-entry fix found by Canvas fuzzing: a card that
  returns from discard during a reshuffle now re-enters from the deck pose
  instead of remaining hidden in its old discard animation.
- Verification completed against the production preview on port 5222:
  `npm run check` passed (148 files / 2,646 tests); the frozen reference policy
  completed 10/10 fights with no page errors; the same recorded session replayed
  with 136 matching action hashes on Phaser and a representative 18/18 Canvas
  fight; corrected fuzz runs passed 5 Canvas seeds × 100 steps and 3 Phaser
  seeds × 80 steps; sparse UI, art, target cycling, Front/Back, exit lifecycle,
  and feel-review fixtures passed with zero page errors. Generated
  session/fuzz/replay files are ignored under `output/playtest-artifacts/`.

## 2026-08-25 — F1 backdrop observability and floor bounce

- Added a pure authored-plate selection contract and asset regression: only a
  complete 768×672 F1 image can replace the procedural arena fallback.
- Exposed `__onyxDebug.readiness().f1ArenaBackdrop` with live load state,
  selected source, expected dimensions, and actual dimensions.
- Added one shared, static green-gray floor-bounce light parameter path. Canvas
  paints a radial gradient and Phaser paints matching quiet bands from the same
  live actor foot positions; no camera, gameplay, HUD, or backdrop geometry
  changed.
- Verification: `npm run check` passed (151 files / 2,661 tests). The standard
  web-game client, Card Trial sparse UI fixture, and fresh Phaser + Canvas F1
  captures passed with empty page-error lists. Both runtime probes reported
  `f1ArenaBackdrop.state = loaded`, `source = authored`, and 768×672 actual
  dimensions.

## 2026-08-27 — Wow / fun / professional continuation audit

- Current directive: audit prior presentation claims against the live production
  path, then ship at most three complete, verified set-pieces. Presentation only;
  campaign rules, floor geometry, Card Trial rules/numbers, and the future
  six-school proposal remain locked.
- Shared-worktree boundary: current unstaged source/art work is Card Trial owned by
  another session (`src/game/card-trial/`, `src/engine/card-trial-hand.test.ts`,
  Old Man card PNGs, plus related metadata/docs). Do not edit, restore, stage, or
  otherwise disturb those paths.
- Baseline branch is `feat/f1-battlefield-wow-pass` at `d2a49e2`, nine commits
  ahead of `origin/main`. Fresh production build and live scorecard are next;
  no presentation stream has been selected from historical reports alone.

### Set-piece 1 — Edgehollow as one physical town

- Live audit overturned the 2026-07-27 title/combat findings: title, boss
  nameplate/swirl/audio, formation lanes, and disabled Magic are already strong.
  The clearest remaining gap was Town/Inn/Temple/Shop sharing one flat brown
  field.
- Added one connected 768×672 Edgehollow square and facility camera cuts. The
  image-generation output was not shipped raw: it was reduced to hard 2× pixels,
  24 opaque RGB colors, and validated at the exact stage size before being
  placed in `src/assets/edgehollow_town_map.png`.
- `TownController` now emits presentation-only `data-town-scene` state for the
  square, inn, temple, outfitter/equip, and guild. `town-map.css` supplies the
  authored map, scene crops, material-tinted outer chrome, a stepped lamp pulse,
  and a reduced-motion freeze. No town rule, price, healing, inventory, or save
  behavior changed.
- Browser verification followed the real title → prologue → party → town →
  facility → save → dungeon path at 1280×800 and 390×844. Scene state matched
  every screen, title/dungeon neighbors were clean, reduced motion disabled the
  pulse, page errors were empty, readiness failures were empty, and confirm /
  cure samples all reported `bufferMissing: false`.
- Focused town tests pass 36/36; app/tools/test typechecks and production build
  pass. Full `npm run check` reached 2,731 passing tests but stopped on the one
  pre-existing Card Trial art failure: modified Old Man card PNGs are RGB
  (`colorType: 2`) while the frozen test expects RGBA (`colorType: 6`). Those
  other-session assets remain untouched, so floor gates did not run in that
  chained command.

### Set-piece 2 — A real camp inside the labyrinth

- Real-path capture confirmed Camp was still a blue status window on an empty
  gradient. The older forest-map captures were a debug-jump artifact, not a
  shipping-path background leak.
- Added `labyrinth_camp_scene.png`, a 768×672 occupied stone alcove with four
  resting bodies and one low brazier. The image-generation result was retained
  only as source evidence under ignored output; the shipping asset was reduced
  to 384×336 source pixels, nearest-neighbor doubled, and quantized to 32 opaque
  colors.
- `camp-scene.css` gives the existing Camp mode that physical room and one
  stepped firelight breath, with a static reduced-motion treatment. Camp phase
  state is presentation-only and is removed when the shared panel closes. The
  placeholder tilde-flame inside the FF6 window was removed; healing duration,
  restoration, menus, and all game rules are unchanged.
- Focused Camp tests pass 5/5 and production build passes. Real title → party →
  dungeon → Camp captures passed at 1280×800 and 390×844; the latter reported
  `animation-name: none` under reduced motion. Rest still fired the authored
  `ui:cureMenu` sample with `bufferMissing: false`; readiness failures and page
  errors were empty. The standard develop-web-game client also completed with
  no error artifact and the title neighbor remained clean.

### Set-piece 3 — The century-wipe returns to a waiting town

- Settled real-path capture confirmed Game Over preserved excellent copy but
  presented it on the same generic field as ordinary menus.
- Campaign Game Over now reuses the authored Edgehollow square under a heavy
  century-dark veil. One stepped reveal leaves the town silhouette and tiny
  lamps visible behind the unchanged lines; Enter removes all defeat-scene
  state and restores the same map at full town brightness. Reduced motion lands
  directly on the final dark composition.
- Arena wipes retain a separate neutral black-umber field and never show the
  century/town treatment. The shared panel's class and context data are removed
  on Continue in both paths.
- Focused Game Over tests pass 3/3 and production build passes. Desktop and
  390×844 captures verified campaign wipe → town, with no clipping or page
  errors; mobile reported no reveal animation under reduced motion. Arena wipe
  → Arena also passed with the neutral backdrop and no leaked context. The
  standard develop-web-game client completed again with no error artifact.

### Final verification and handoff

- `git diff --check` passes. The two shipping backdrops are indexed 768×672
  PNGs: Edgehollow uses 25 palette entries and Camp uses 33.
- Focused presentation suite passes 44/44 across Town, Camp, and Game Over.
  `npm run build`, `npm run floor:validate`, and `npm run floor:export-check`
  pass; floor validation reports only the existing Floor 1 content warnings.
- `npm run check` reaches 2,732 passing tests and one unrelated failure in
  `src/game/card-trial/card-art.test.ts`: the other session's modified Old Man
  card PNGs are RGB (`colorType: 2`) while the test requires RGBA
  (`colorType: 6`). The frozen Card Trial files and assets were left untouched.
- No campaign math, floor data, renderer/choreography code, global
  `src/styles.css`, or Card Trial source/art was changed by this pass. No commit
  or push was made.

### 2026-08-27 — Campaign Card Trial integration slice

- Added a pure campaign adapter that translates real authored encounter-table
  entries into the existing frozen Card Trial rules: the fixed Old Man + Rat
  King decks, real enemy names/sprites/HP, authored rows, and visible intents.
- Dungeon encounters now enter that Card Trial path while classic combat remains
  available for legacy NPC/stairs/alarm/Arena paths pending the next removal
  pass. Victory returns to the same dungeon coordinate and adds one persistent
  card reward; wipe returns to the same location without changing campaign HP or
  progression.
- Added save version 19 card-collection persistence, legacy v18 migration,
  debug snapshot visibility, and focused adapter/save tests. Updated the
  verification driver to follow the production sparse targeting UI.
- Verification: `npm run build` passed; focused campaign/save/isolation/
  presentation tests passed (44/44); production browser vertical slice passed
  with no failures or page errors, including exact-position return and
  save/load reward persistence. The full check still has the unrelated frozen
  Card Trial art failure caused by parallel RGB Old Man card PNG changes.
- Scoped files are ready to checkpoint; parallel Card Trial engine/types/art,
  six-school documents, simulations, and generated output remain uncommitted.

### 2026-08-27 — Durable campaign card-combat lifecycle

- Current request: canonize the new product contract, then turn the committed
  campaign Card Trial adapter into a durable seam with persistent per-hero
  decks/card instances, a pre-fight checkpoint, atomic rewards, exact dungeon
  restoration, and Retry / Edit Decks and Retry / Leave defeat choices.
- Preserve all unrelated dirty Card Trial simulation, effects, UI-art, and
  generated-output work. Stage and commit only explicit files owned by this
  task.
- Audit complete: commits `f2100d9` and `1cf4560` already supply the fixed duo
  and campaign encounter adapter. The adapter currently uses locked prototype
  decks, appends one reward only after victory, and automatically returns on a
  wipe; save format 19 stores only a flat `cardCollection`.
- Next: land the three canonical docs after the required check, then introduce
  a versioned campaign card-progress model and focused lifecycle tests before
  changing the result UI.
- Canonical docs committed as `496bef3` after a clean isolated `npm run check`
  (153 files / 2,665 tests plus build/floor gates). The shared checkout still
  has the known unrelated RGB card-art failure, so those PNGs remain untouched.
- Added the pure campaign-card state foundation: permanent instance ids,
  separate per-hero collections, exact 12-card active decks, a two-copy limit,
  idempotent deterministic rewards, save-data normalization, and validated
  physical-card swaps. Focused tests pass 6/6.
- Save format is now v20: v19 flat reward ids migrate into the correct hero
  collections, active decks and Mastery data round-trip, and an unresolved
  encounter transaction stores its checkpoint, seed, and exact reward.
- Runtime campaign fights now deal the saved physical deck instances. Victory
  fully restores the legacy-facing duo state, commits the reward idempotently,
  clears the transaction, and returns to the exact tile/facing. Defeat restores
  the same checkpoint and opens Retry / Edit Decks and Retry / Leave; the
  dialogue-based editor performs real collection-to-deck swaps and enforces
  exact size/two-copy rules. Continue after close-mid-combat reopens that menu.
- Focused progression/adapter/save/snapshot/input tests pass 71/71; app/tools
  TypeScript and the production Vite build pass.
- Hardened pending-encounter save normalization against malformed coordinates,
  ids, and non-integer values; focused coverage now passes 73/73.
- Production browser verification is green with no console/page errors:
  the victory slice grants one physical card, atomically clears the pending
  transaction, and reloads at the exact tile; the durable lifecycle separately
  proves wipe restoration, same-seed/same-reward Retry, a legal reserve swap,
  Leave persistence, and close-mid-combat Continue. All six lifecycle captures
  were inspected, including the fully rendered Floor 5 checkpoint after Leave.
- Exact staged-patch verification in a clean detached worktree passes the full
  `npm run check` gate: TypeScript/build, 154 test files and 2,675 tests, floor
  validation, and floor export consistency. In the shared checkout, all 2,708
  tests outside the unrelated in-flight RGB card-art assertion also pass.
