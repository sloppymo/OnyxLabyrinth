# Handoff: OnyxLabyrinth dungeon-depth feature work

You're picking up work on **OnyxLabyrinth**, a Wizardry-style first-person dungeon
crawler (TypeScript + Vite, no UI framework — a 2D canvas renders the pseudo-3D
corridor, everything else is hand-built DOM). Repo root: the project has
`CLAUDE.md` (orientation + commands) and `AGENTS.md` (detailed file map, hard
rules, verification checklists, and a "common pitfalls" list with the actual
bugs that were hit and fixed). **Read both before touching `src/`** — AGENTS.md
especially, since it documents exact regressions from this project's history.

Live build: https://sloppymo.github.io/OnyxLabyrinth/ (GitHub Pages, served
from the `docs/` folder, kept in sync with `dist/` after every feature is
verified).

## What just happened (six-phase feature arc, all shipped and committed)

The user asked to "flesh out the dungeon system a lot more" and approved a
6-phase plan, executed sequentially with build/test/browser-verify/commit
after each phase:

1. **Summoning UI** — combat summons (BAMORDI/SOCORDI) show as targetable rows
   in the FF6 combat windows.
2. **Trapped treasure chests** — `game/features.ts`, `state.pendingTrap`.
   Stepping on a trapped chest gates ALL dungeon input behind a modal
   Inspect / Disarm / Open / Leave prompt (dedicated keydown listener owns
   I/D/O/L + Esc; every other dungeon handler is gated with
   `!state.pendingTrap`).
3. **Persistent utility spells** — `game/persistent-spells.ts` +
   `engine/spell-ui.ts` (dungeon grimoire, `G` key). Milwa (light), Litofit
   (levitation), Dumapic (detect) are dungeon-only buffs
   (`state.persistentBuffs`, tick/clear lifecycle) also castable from the camp
   menu. Camping clears them. These spells are filtered out of combat spell
   lists (`isUtilitySpell` in combat-ui.ts) — the combat resolver has no case
   for them.
4. **Water tiles + swimming** — `handleWater`/`swimChance` in `features.ts`.
   Learn-by-doing per-character `state.swimSkill`. Ring of Water Walking (a
   new `"trinket"` item type — carried, never equipped, never shop stock)
   bypasses swim checks.
5. **Item identification + cursed gear** — inventory migrated from `string[]`
   to `InventoryEntry[]` (`{ itemId, identified }`); save format bumped to v5
   with a v4→v5 migration (old saves: everything identified). Chest
   weapons/armor drop unidentified ("Unknown Weapon" etc.), appraised at the
   shop for 50g or identified for free on equip. `ItemDef.cursed` items
   force-equip on pickup (`forceEquip`) and can't be manually displaced —
   `equipItem` refuses to replace a cursed item in a slot; only the Temple's
   `[R] Remove Curse` (100g) destroys them (from loadout AND inventory).
   **Critical invariant:** after combat, inventory reconciliation MUST use
   `reconcileInventoryAfterCombat` — never rebuild the list from item counts,
   which destroys the per-instance `identified`/cursed flags.
6. **Dungeon NPCs** — `game/npc.ts` (pure logic) + `engine/npc-ui.ts` (panel
   UI, borrows `"title"` mode like the save/grimoire menus). Three NPCs live
   on floors 1–3: Maro the Stranded (samurai sprite), Vestra (lab-assistant
   sprite), Kazeharu the Ronin (ronin sprite) — **NPC combat identities are
   constrained to enemies that already have full sprite art strips** in
   `sprite-manifest.ts` (this was an explicit user decision: "don't make him
   a forge spirit unless we have a good sprite for that — make it whatever we
   have a sprite for"). Panel: Talk (menu topics + a free-typed keyword phase
   that unlocks hidden responses) / Barter / Give (disposition-gated one-time
   reward) / Steal (Thief-only, botched steal starts a fight) / Attack /
   Leave. **NPCs are additive-only by explicit user decision — hints, trades,
   flavor, NEVER campaign gating** (no NPC blocks a key, door, or boss).
   Attacking starts a real fight against the NPC's `combatEnemyIds`
   formation; victory permanently kills them (`state.killedNPCs`,
   `markKilled`/`applyKilledNPCs`) — the tile clears and stays cleared across
   floor transitions AND save/load (both `transitionToFloor` and
   `save.ts`'s `deserialize` must run `applyKilledNPCs` on the fresh floor
   clone, or a killed NPC reappears).

After phase 6, the user separately asked for two more things in the same
session:

7. **Party-creation choice screen** — `engine/party-ui.ts`'s
   `PartyCreationController` now opens on a `"choice"` phase: two cards,
   **Default Party** (pre-built six: Aria/Bram/Coda/Dell/Eve/Fenn, selected
   first) vs **Create Your Own** (the pre-existing six-slot custom editor,
   now `"edit"` phase). Arrow keys toggle + Enter confirms, with [D]/[C]
   hotkeys. Esc from slot 1 of the editor now returns to the choice screen
   instead of cancelling outright.
8. **Deploy** — `docs/` was rebuilt from `dist/` and pushed to `origin/main`
   (commit `289935f`), so everything above is live.

## Current git state

`main` is up to date with `origin/main` as of commit `683e3a1`
(`docs: document dungeon depth systems and party choice screen`, on top of
`289935f`, the `docs(deploy)` commit that shipped the six phases + party
choice screen). Working tree has **unrelated, pre-existing experimental
leftovers** that are NOT part of this feature work and were explicitly left
alone per the user ("don't worry about the lizard ones, they're just
experiments"):

- Modified (uncommitted): `public/assets/enemies/werewolf/*.png`,
  `sprite-preview.html`, `src/data/enemies.ts`, `src/engine/sprite-manifest.ts`
  — these carry a `lizard-warrior` enemy def + encounter-table entries whose
  sprite strip renders with a **visible checkerboard transparency bug** (the
  background wasn't keyed out correctly). Confirmed broken in a live combat
  screenshot.
- Untracked: `public/assets/enemies/lizard-warrior/`,
  `scripts/process-lizard-warrior.py`, various `.tmp-*` scratch files/dirs
  (safe to ignore — repo convention per CLAUDE.md), a few loose docs
  (`ADVANCED_DEVELOPMENT_PROMPT.md`, `PLAYTEST-RESULTS.md`, two
  `generate_ff6_battle_music*.py` scripts, `visual-companion-scripts/`).

**Do not commit or "fix" the lizard-warrior work unless the user asks** — it's
a known-broken experiment they're aware of and unconcerned with for now.

## Verification workflow this project uses (follow it for new work)

For every feature: `npm run build` (tsc gate, must be zero errors — the repo
has `noUnusedLocals`/`noUnusedParameters`/`noFallthroughCasesInSwitch`
enforced) → `npm test` (vitest, currently 364 tests across 16 files, all
green) → Puppeteer browser verification against the production preview
(`npx vite preview --port <port> --base /OnyxLabyrinth/`, boot via
`?debug=1` which exposes `window.__onyxDebug` for state
inspection/mutation) → screenshot the key states → update AGENTS.md (file
map row + a "common pitfalls" entry if you hit a real gotcha) → commit with
conventional-commit style (`feat(scope):` etc.) and the footer
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (adjust the name to
whichever model is doing the work) — only push/deploy to `docs/` when asked.

Puppeteer boot sequence for the debug harness: `goto('<url>?debug=1')`, wait
for `#app`; if `state.mode === "party_creation"` it now lands on the new
choice screen (`ArrowDown` then `d` for default, or `Enter` on the
pre-selected default card) rather than straight into the character editor;
then arrow down to "Enter Dungeon" in the town menu and `Enter`.

## Known outstanding item (not part of this arc, pre-existing)

There's a memory note: **party-creation autosave resume has a soft-lock bug**
— unloading mid-party-creation and resuming re-enters a broken state. Unfixed,
not touched this session. Worth checking `MEMORY.md` / project memory for
details if the user brings it up.

## What I want from you

Don't just start implementing. First:

1. Read `CLAUDE.md` and `AGENTS.md`, skim the file map, and look at the
   `game/npc.ts` + `engine/npc-ui.ts` pair as a reference for how a full
   feature (pure logic + DOM controller + tests + docs) is structured in
   this codebase.
2. Given everything above — the six shipped phases, the party-choice
   screen, the pre-existing autosave soft-lock bug, and the abandoned
   lizard-warrior sprite experiment — **propose a prioritized list of next
   steps** with your reasoning for the ordering. Consider things like:
   depth vs. breadth (more dungeon systems vs. polishing what exists),
   whether the party-creation autosave bug should jump the queue since it's
   a real soft-lock, whether the NPC system is more valuable extended to
   more floors or left as-is, and anything you notice while reading the code
   that looks like a gap, inconsistency, or missed edge case the user hasn't
   flagged yet.
3. Present that list back before writing any code, so the user can pick a
   direction rather than you committing to one.
