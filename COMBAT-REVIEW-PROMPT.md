# Prompt: Evaluate and evolve OnyxLabyrinth's FF6-style combat system

## Your role

You are a senior game programmer and combat designer with deep knowledge of 16-bit JRPGs (especially Final Fantasy VI) and classic dungeon crawlers (especially Wizardry V/VI). You have full access to this repository and can run commands. Your job is to (1) critically evaluate a just-completed combat presentation revamp, (2) find bugs and game-feel problems, and (3) produce a prioritized, concrete roadmap that takes this from "working" to "a satisfying, fun 16-bit RPG combat system."

Read `AGENTS.md` and `CLAUDE.md` in the repo root FIRST — they contain hard rules (things you must not change without explicit approval), verification checklists, and the file map. Respect them.

## Project context

OnyxLabyrinth is a Wizardry-style first-person dungeon crawler (TypeScript + Vite, no framework, canvas + hand-built DOM). Combat rules follow the design docs in the repo root (`wizardry_v_clone_design_doc.md`, `wizardry-v-combat-reference.md`): 6-member party, front/back rows, AGI initiative, weapon ranges, spell tiers, status effects.

Commands:
- `npm run build` — must pass with zero TS errors (this is the lint gate)
- `npm test` — vitest, currently 270 passing
- `npx vite preview --port 5176 --base /OnyxLabyrinth/` after a build — serve for browser verification
- `npm run sprite-preview:generate` — regenerates `sprite-preview.html`, an animated preview of every sprite strip the game loads

## What was just built (the work you are evaluating)

The combat system was revamped from a Wizardry-style round-based text flow to an FF6-style presentation. The stated goals were: FF6's layout and experience, use of purchased 100×100 animated side-view sprite packs, FF6-style bouncing damage numbers, and FF6 rhythm. The user explicitly chose:
- **Hybrid turn flow** ("per-actor instant resolve"): AGI-initiative queue built at round start (party + summons + enemies interleaved); each actor's action resolves and animates the moment it's confirmed; enemies act on their turns automatically; end-of-round status ticks. NOT true ATB (no time gauges) — this was a deliberate scope decision to preserve the tested combat resolver.
- **FF6-minimal text**: no scrolling combat log during battle; communication is via animation, damage popups, and a top banner showing spell names.

### Architecture

- `src/game/combat.ts` — two resolution APIs sharing the same internals (identical math): legacy round-based `resolveCombatRound` (kept, still fully tested) and the per-turn API driving the UI: `beginRound` / `resolvePlayerTurn` / `resolveEnemyTurn` / `resolveAllyTurn` / `endRound`. All pure (clone in, new state out). Structured `CombatEvent`s are emitted 1:1 with log lines; the renderer consumes ONLY events (no regex log parsing) — log-only lines get no animation by design.
- `src/engine/combat-scene.ts` — canvas scene: enemies LEFT, party RIGHT (FF6 orientation), animated strips, a step-based choreography engine (`playTurn` builds a timed step list per resolved turn: walk forward → attack anim → hurt anim + bouncing damage popup at impact → walk back), spell banner window, blinking target cursor, death fade-outs, procedural fallback silhouettes if a strip fails to load.
- `src/engine/combat-ui.ts` — controller/turn machine: menu → target/spell/item submenus → playback → next turn → round end → victory/defeat/fled result window. Keyboard (arrows/Enter/Esc, letter shortcuts) + mouse.
- `src/engine/combat-select-action-view.ts` — FF6 blue-gradient DOM windows overlaid on the canvas bottom: action menu (Attack/Magic/Defend/Item/Hide/Run), enemy name list with counts, party name/HP/SP table with HP bars; centered result window.
- `src/engine/party-sprite-cache.ts` — class→sprite mapping (Fighter→Knight, Mage→Wizard, Priest→Priest, Thief→Archer, Ninja→Swordsman), strips at `public/assets/party/<class>/{idle,walk,attack,cast,hurt,death}.png`, frame counts derived from strip width at load. Party art faces right, drawn mirrored.
- `src/engine/sprite-manifest.ts` + `enemy-sprite-cache.ts` — 16/16 enemies now have strips at `public/assets/enemies/<id>/{idle,attack,hurt,death}.png` (enemy art faces right, drawn unmirrored). Seven former "blob" enemies were re-themed to match available pack art (Giant Rat→Slime, Dust Sprite→Skeleton, Animated Book→Armored Skeleton, Paper Wasp→Skeleton Archer, Cobweb→Orc, Imp→Elite Orc, Rift Moth→Werewolf) — ids/names/art changed, stats/specials/encounter weights unchanged.
- The old `combat-renderer.ts` (canvas message box + procedural sprites + regex-driven animation) was deleted.

### How it was verified

- 270 unit tests pass, including new suites: `combat-turns.test.ts` (per-turn API contracts), `combat-scene.test.ts` (choreography step scheduling), `party-sprite-cache.test.ts`, `combat-select-action-view.test.ts` (DOM windows), and an encounter-table integrity test (every `enemyId` in every floor's table must resolve — this exists because the bestiary rename initially missed the string references and floor 1 silently spawned only Training Dummies; the browser test caught it).
- Browser-driven E2E passes: party creation → town → dungeon → encounter → menus → attack/spell playback with damage numbers → victory → back to dungeon with corridor textures intact. A reusable Playwright driver exists at `.tmp-verify-ff6.mjs` (imports playwright from the global npm root; uses system Chrome at `/usr/bin/google-chrome`; game flow: ArrowDown+`d` for default party, 6×ArrowDown+Enter in town to enter the dungeon, random-walk with >210ms between keys to trigger encounters).

## Known gaps, quirks, and honest self-assessment (verify these, then go beyond them)

1. **Feel/juice is minimal.** No screen shake, no hit-stop, no flash on big hits, no crit distinction in popups (crits double damage silently — the "critical hit!" log line has no structured event, so nothing animates). Attack walk-in is a fixed 70px offset, not a dash to the target like FF6.
2. **No combat audio at all.** `src/engine/audio.ts` is procedural WebAudio with dungeon ambience/footsteps/doors only. No hit sounds, spell sounds, victory fanfare, or combat music.
3. **Defend/Hide/statuses are popup-text only** (GUARD / HIDDEN / SILENCED). Status effects on party members are not visible anywhere persistent in the FF6 windows (the old view had status text; the new party window shows only name/HP/SP).
4. **Summoned allies** (BAMORDI/SOCORDI) still draw as procedural glowing orbs, not sprites.
5. **Instant resolve removes round planning**: you can't review/undo earlier characters' actions (old system had a "Round order" review before resolving). Deliberate tradeoff — evaluate whether it hurts tactics.
6. **Escape/back only works within submenus**; there is no "back to previous character."
7. **Multi-enemy target cursor** blinks over the candidate on the scene, but enemies are identified in the menu by name only — duplicate names (e.g. "Slime ×2 in the list as two 'Slime' rows") are ambiguous except by cursor position.
8. **Layout constants are hand-tuned** for the 768×672 canvas with ~175px of DOM windows over the bottom; the `@media (max-width: 640px)` handling of the windows is rough. Party/enemy sprite art occupies only ~40% of each 100×100 frame, so draw sizes are inflated (PARTY_SIZE 210, ENEMY_SIZE 300) — check clipping with 4+ enemy encounters (enemy rows stagger 96px vertically; 4th+ enemy may sit under the windows).
9. **Round banner/indicator is gone** — no "Round N" display anywhere.
10. **Boss fight unverified** — floor 5 boss (`headmasters-echo` variants, silenceRandom special) has never been watched end-to-end in the new system. `main.ts` also has a `TEMP` hack: fresh dungeon entry starts at floor 4 "for ogre verification" — should probably revert to floor 1.
11. **Known pre-existing bug (untouched):** autosave fires on unload during `party_creation`, and resuming that save shows a blank panel (no controller constructed). See memory/AGENTS notes.
12. **Performance:** `structuredClone` of full combat state per turn + per-frame DOM re-render when `windowsDirty` — fine at this scale, but confirm no jank during long fights.
13. **`enemyHealthDescriptor`** (Unwounded/Wounded/etc.) was dropped from target lists for space — enemy health is now invisible to the player (FF6 also hides it, but Wizardry showed qualitative health; judge which serves this game).

## What to produce

1. **Code review** — correctness first: walk the per-turn flow (`combat-ui.ts` → `combat.ts` per-turn API → `combat-scene.ts` choreography) hunting for state-machine holes: deaths mid-queue, flee during round, silence timing, summons entering mid-round, KO'd actor whose turn hasn't come, simultaneous end conditions, stale `justDied`, popups/cursors surviving phase changes, the result window racing playback. Verify claims in this prompt against the actual code.
2. **Play it** — build, preview, and drive it with Playwright (adapt `.tmp-verify-ff6.mjs`). Screenshot and judge: readability, pacing (is playback too slow/fast? menus snappy?), whether damage numbers land at the right moment, whether a full 6v4 fight drags.
3. **Game-feel gap analysis vs FF6** — what specifically makes FF6 combat feel good that this lacks (attack dashes, hit-stop, flicker on hit, fanfare, ATB tension, victory pose, spell full-screen effects, formation variety, back attacks/preemptive strikes...)? Be concrete about which are worth porting to a hybrid turn system and which aren't.
4. **Prioritized roadmap** — ordered list of next steps, each with: rationale (why it moves "fun"), rough size (S/M/L), files touched, and how to verify it. Separate: (a) quick wins (< 1 day each), (b) systems work (audio, boss polish, status UI), (c) stretch (true ATB option, spell effect library, battle backgrounds per floor). Include test additions — especially an automated screenshot-diff or scripted-fight harness so combat regressions get caught without manual play.
5. **Call out anything in this prompt that turns out to be wrong** when you inspect the code — treat it as a claim sheet, not ground truth.

## Constraints

- Do not change combat math, encounter rates, or map data without flagging it as a proposal first (AGENTS.md hard rule).
- `npm run build` must stay at zero TS errors; `npm test` must stay green; new combat actions MUST emit structured `CombatEvent`s or they will not animate.
- Renderer/combat changes require browser verification per the AGENTS.md checklists before being called done.
- Conventional commits (`feat(combat): ...`), no debug code (`console.log`, `window.__`) in commits, never mutate git history.
