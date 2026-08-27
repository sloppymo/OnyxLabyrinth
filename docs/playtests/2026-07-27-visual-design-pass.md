# Visual design pass — 2026-07-27

> **Historical roster note (2026-08-27):** This report remains useful for
> visual direction, but its party-choice screenshots and default-roster flow
> predate the fixed Old Man + Rat King campaign contract. See
> [`docs/CURRENT-PRODUCT-CONTRACT.md`](../CURRENT-PRODUCT-CONTRACT.md).

Art-director-style visual review. Not a code review, not a balance pass — a
look at how OnyxLabyrinth *reads* as a visual product, backed by screenshots
actually captured from a running build.

Screenshots: `playtest-screenshots/2026-07-27-visual-pass/` (gitignored, not
committed). Method details in §9.

## 1. Executive take

**Promising, not yet shippable, and it's a two-speed game.** The combat
scene is a real, considered piece of visual design — sprite work, a swampy
backdrop, forecast UI, a functioning three-beat spell-cast animation, a boss
nameplate with its own subtitle. The ending sequence (`30-ending-beat-late.png`)
is the single best composed image in the build. But every screen that isn't
combat or the black-field narration — title, town, arena setup, save, the
grimoire — is the *identical* undecorated blue window floating on a black
void. A player's very first frame (`01-title.png`) and a huge fraction of
total play time (town, menus, the save screen) carry zero atmosphere. Today
this reads as a strong combat mockup wearing a placeholder's clothes for
everything else. The fix is cheap relative to the combat work already done:
none of this needs new art pipelines, it needs *backgrounds* behind windows
that already exist.

## 2. What sings

- **`30-ending-beat-late.png` / `31-post-ending-return.png`** — a glowing
  lamp centered in a doorway, cool teal boss-chamber fog and floor-ripple
  decals framing a warm amber light source, paired with "The lamp is empty."
  This is a genuine money shot — the kind of image that belongs on a store
  page. It's proof the team can compose a scene when it commits to one.
- **`19-combat-spell-menu.png` / `21-combat-target-select.png`** — the
  combat forecast UI (`15-23 KO`, `Unwounded · Guaranteed KO`, hit-chance
  percentages) is more informative than vanilla FF6's own menus. This is a
  legitimate improvement on the reference, not just homage.
- **`25-boss-start.png`** — the boss nameplate window (small caption "THE
  CRYING MAN" over a larger title, plus an italic subtitle "Deranged
  Sanctum") and the boss arena's cyan sparkle-particle backdrop instantly
  separate a boss fight from a trash fight. Good use of a cheap effect.
- **`17-combat-trash-start.png`** — slime trash fights sit on a distinct
  swampy-green backdrop with puddle decals; party sprites are a coherent,
  well-drawn chibi set, consistently scaled and colored across all four
  classes.
- **`15-grimoire.png` / `24-game-over-wipe.png`** — the copy is doing real
  work as graphic design: "A soft magical radiance that holds back darkness
  zones," "Nobody here gets older. Nobody here leaves for good.," "The
  labyrinth does not keep the dead." Flavor text is consistently better
  than the UI chrome that holds it.
- **`02-prologue-early.png` / `29-ending-beat1.png`** — the black-field
  typewriter narration is genre-correct FF6/FF6-style presentation, and it's
  used consistently to bookend the whole campaign (opening war myth, closing
  wish).

## 3. What fights the eye

- **Every non-combat, non-narration screen is the same floating window on
  pure black** — title (`01-title.png`), town hub (`06-town-main.png`),
  arena setup (`32-arena-setup.png`), save/load (`16-save-menu.png`),
  grimoire (`15-grimoire.png`). No background art, no parallax, no texture,
  no color variation beyond the blue-window chrome itself. **Tag: Art
  direction taste / Content gap.** This is the biggest single issue in the
  build.
- **Text truncation on the party-choice screen** (`04-party-choice.png`):
  "Aria · Coda · Dell · E…" and "Build four adventu…" both clip mid-word in
  a column with visibly empty space to their right. **Tag: Bug (polish).**
- **Duplicate stray HP line on town roster screens** (`07b-town-inn.png`):
  every character's real stat line (`HP 38/38 (100%) SP 0/0 (100%)`) is
  immediately followed by a second, unlabeled `HP 0/120` line that doesn't
  match anyone's actual level or stats and is identical for all four party
  members regardless of class. Reproduced on both Inn and (in an earlier
  capture) Temple, so it's shared roster-list markup, not one screen's bug.
  **Tag: Bug.**
- **Enemy formation reads as a pile, not a rank**, in both trash and boss
  fights (`17-combat-trash-start.png`, `25-boss-start.png`). Enemies are
  zippered along one diagonal in the lower-left instead of occupying their
  own visual lane the way the party does on the right; in the 5-enemy boss
  formation several sprites significantly overlap and are hard to
  individually parse at a glance. **Tag: Art direction taste.**
- **Spark's travel-phase VFX is a flat, undifferentiated magenta rectangle**
  (`debug-spark-220ms.png`) with no bolt/zigzag silhouette — it reads as a
  placeholder color swatch rather than "lightning," even though the charge
  and impact beats around it (a rising bar, then a red burst + damage
  number + sparkle scatter, `debug-spark-450ms.png`) are perfectly fine.
  **Tag: Polish** — the weak link in an otherwise complete three-beat cast
  animation, not a broken system.
- **A small, low-contrast dark prop sits at the left frame edge** in every
  view from tile (5,7) facing north (`09-corridor-straight.png`,
  `23-combat-victory-or-post.png`) — consistent across multiple otherwise-
  unrelated captures at that exact position, so it reads as a real
  wall-mounted decoration (torch/sconce) rather than a UI glitch, but it's
  unlit/undetailed enough that it's easy to mistake for a rendering error.
  **Tag: Polish**, low confidence on root cause, worth an art pass either way.
- **Point-blank walls give zero orientation cues.** Facing directly into a
  wall you're touching — whether in a wide room (`decisive-pointblank-in-
  room.png`) or a narrow corridor (`10-corridor-crossroads.png`) — fills the
  entire frame with wall texture and drops floor, ceiling, and side-wall
  reveal entirely. Verified this is **not** a bug: it reproduces identically
  regardless of corridor width, and AGENTS.md's own renderer checklist
  states the intended behavior for depth-0 walls is exactly this
  ("shows a textured surface, not a black rectangle"). **Tag: Art direction
  taste** — genre-authentic (Wizardry never gave you a peripheral-vision
  cue either), but modern players may misread the full-bleed fill as "did
  something break" for a beat before they turn.

## 4. Screen-by-screen notes

**Title.** A single un-decorated blue window ("ONYX LABYRINTH," New
Game/Arena) on a black canvas. No logo treatment, no background, no
motion. This is the first thing every player sees and it currently sells
nothing about tone, setting, or genre — a text-only options list would look
identical if you deleted the pixel font.

**Prologue.** Correct: full-bleed black field, cream typewriter text,
▼ input-wait glyph. Matches the SNES-era style guide and is the strongest
non-combat visual language in the game. It's also the *only* place outside
combat where the game feels like it has a directed visual identity.

**Town.** Same floating window as the title screen, now listing Inn/Temple/
Shop/Guild/Equip/Reform/Enter Dungeon/Save. The Shop screen
(`07-town-shop.png`) is the most developed menu in the game — tabs, prices,
greyed-out unaffordable items, a live stat-comparison tooltip — and it's
still just black-void-plus-window. Edgehollow, the town this is meant to
evoke, has no visual presence at all.

**Dungeon.** The actual strongest non-combat art: sandstone brick walls with
amber edge-glow, mossy staining, a checkerboard floor, subtle torch flicker,
scripted wall inscriptions ("THE WATER REMEMBERS") tied to the water motif.
The automap (`14-automap.png`) is appropriately minimal and legible. Water
and darkness tiles carry small glyph icons (≈, a crescent) that read as a
coherent hazard-icon language once you know to look for them, though at
close range the darkness tile's visibility drop isn't obviously perceptible
(the wall is only one tile away regardless).

**Combat.** See §5.

**Menus/overlays.** Grimoire, save menu, and the arena level-picker are all
functionally clean and typographically consistent with each other — but
that consistency is the problem, since "consistent" here means "always the
same bare window." The Shop and Inn/Temple screens are the exception, with
real information density.

**Ending/wipe.** The Game Over screen commits to the century-cycle lore
directly in copy ("Year 3947. A hundred years in the dark. Edgehollow is
still waiting.") and correctly shows the party as revived/standing — that's
thematically deliberate, not a bug, since the whole point of the century
cycle is that nobody actually dies. The ending's lamp shot is the visual
highlight of the entire build (§2).

## 5. Combat visual verdict

Yes — combat is the showcase, and it's the only screen where art, motion,
and UI chrome are all pulling in the same direction at once.

**Three beats that work:**
1. The boss nameplate + subtitle + particle backdrop swap
   (`25-boss-start.png`) — an immediate, cheap "this fight matters" signal.
2. The target-forecast window (`21-combat-target-select.png`) — showing
   `15-23 KO`/`Guaranteed KO` per candidate before you commit is better
   information design than the FF6 reference it's homaging.
3. The spell impact beat (`debug-spark-450ms.png`) — red burst, white
   damage number, particle scatter, all landing in the same frame reads as
   a satisfying hit.

**Three beats that clutter or mismatch:**
1. Enemy formations pile diagonally into the lower-left instead of holding
   a rank, most visible with 5 enemies in the boss fight (`25-boss-start.png`)
   — sprites overlap and the read gets muddy exactly when you most want to
   see what you're fighting.
2. Spark's travel-phase sprite is a flat rectangle with no silhouette
   (`debug-spark-220ms.png`), sitting between two well-made beats.
3. The green puddle backdrop reads at first glance like a slime-specific
   effect (it appears under a skeleton pack in Arena too,
   `33-arena-wave1-combat.png`) — it's actually a fixed floor-1 battle
   background, not an enemy interaction. Not wrong, just a missed
   opportunity for the backdrop to react to what's actually fighting you.

## 6. Motion & VFX verdict

Coherent, not firework-pile-on. The turn choreography (walk in → attack →
hurt + damage popup → walk back) plays cleanly, the playback-speed chip
(`Shift:2x · Tab:FAST`) is a nice tempo-control affordance, and barks/dialog
didn't clutter any captured frame. The one gap is spell VFX quality varying
per-spell-tier: Spark's charge/impact are polished but its travel shape is
a placeholder-grade rectangle. Given the codebase's own history (recently
wired "unused VFX strips and layered SFX"), this reads like exactly the kind
of tier-1-spell gap that pass was meant to close and may not have reached
this specific spell yet.

## 7. Top 5 visual recommendations

1. **Give the non-combat screens a background.** Title, town, save, arena
   setup, and grimoire all sit on pure black. Even a single static
   illustrated backdrop per context (a torch-lit town square behind the
   town window, a labyrinth-mouth behind the title window) would close the
   single biggest gap in the build without touching engine code.
2. **Restage enemy formations as a rank, not a pile.** Give enemies the same
   per-slot spacing discipline the party already has, especially for 4-5
   enemy boss packs where overlap currently hides bodies.
3. **Pass a bolt/beam silhouette onto Spark's travel VFX** (and audit
   sibling tier-1 spells for the same gap) so the projectile phase reads as
   elemental rather than as an unstyled color swatch.
4. **Fix the party-choice text truncation** — "Aria · Coda · Dell · E…" and
   "Build four adventu…" clip in a column with room to spare; either widen
   the column or shrink the type.
5. **Investigate the duplicate `HP 0/120` line** on town roster screens
   (Inn, Temple) — it's the only outright-broken-looking UI element found in
   this pass, and it appears on some of the most-visited screens in the
   game (a player rests at the Inn constantly).

## 8. Visual bugs found

- **P2 — Duplicate stray stat line on town roster screens.** Repro: New
  Game → default party → Town → Inn (or Temple). Every character's real
  `HP x/x (100%) SP x/x (100%)` line is followed by an unlabeled
  `HP 0/120` line, identical across all four characters regardless of
  class/level. Screenshot: `07b-town-inn.png`.
- **P2 — Text truncation on party-choice screen.** Repro: New Game →
  advance prologue → party-choice screen. "Default Party" row shows
  "Aria · Coda · Dell · E…" and "Create Your Own" shows "Build four
  adventu…", both clipped with visible empty space remaining in the row.
  Screenshot: `04-party-choice.png`.
- **Not a bug (verified, downgraded):** a corridor view that appeared to
  lose all perspective when turning to face a wall (`debug-wallcheck-5-7-
  facing-east.png`) was initially suspected as a renderer regression.
  Direct-jump testing at multiple positions (`decisive-pointblank-in-
  room.png`, `decisive-crossroads-north.png`) confirmed this is the
  renderer's consistent, intended behavior for any wall at zero distance,
  independent of corridor width — matching AGENTS.md's own checklist
  language for depth-0 walls. Listed here only so a future pass doesn't
  re-investigate it as a regression.

## 9. Method note

- **Build:** local production preview, `npm run build` (clean) then
  `npx vite preview --port 5176 --base /OnyxLabyrinth/`, loaded with
  `?debug=1`. **The working tree was dirty at capture time** (an in-progress
  party-size refactor — `src/game/active-roster.ts` deleted, default party
  is 4 members, not the 6 CLAUDE.md currently describes). "Four souls brave
  the labyrinth," "Slot 1 of 4," and "4/4 alive" are internally consistent
  with the current code and are **not** flagged as bugs here.
- **Tooling:** Playwright driven directly via the `?debug=1`
  `window.__onyxDebug` surface (`scripts/playtests/lib.mjs` helpers —
  `jumpTo`, `snap`, `waitForIdle`) plus a new one-off capture script,
  `scripts/playtests/visual-pass-2026-07-27.mjs`, written for this session.
  Combat/boss/ending were reached via `createCombatFromEncounter` +
  `startCombat`/`exitDebugCombat`, not real dungeon fighting.
  OS: Linux, headless Chromium via Playwright, 1280×800 viewport.
- **Screenshot folder:** `playtest-screenshots/2026-07-27-visual-pass/`
  (gitignored per repo convention, not committed).
- **Harness note (not a visual finding):** Arena's level-picker screen can
  get its `combatController` wedged (`route` sticks at `none` forever) if a
  second Enter lands before `combatTransitionActive` flips true after the
  first pick — reproduced only under scripted key-spam faster than a human
  could plausibly type; a single press-then-wait is reliable. Flagged here
  for whoever next scripts Arena, not filed as a P-severity bug.
- **What this pass did not cover:** NPC dialogue panels, the Equip screen,
  the perk-selection overlay, camp mode, and mobile/touch presentation —
  none were reached in this session's path. Arena wave 2 combat was
  attempted but timed out before reaching a fight; only wave 1 and the
  wave hub were captured.

## Net question

**Protect:** the black-field narration language (prologue/ending), the
combat forecast UI, and the dungeon corridor's amber/stone atmosphere —
these are the load-bearing pieces of the game's identity and they're
already good. **Cut or redesign:** nothing needs cutting; the gap is
additive (backgrounds behind existing windows, formation spacing, one
VFX pass), not corrective. **Is it shippable-looking today?** Not yet — it
is a genuinely strong combat mockup wearing placeholder clothes for
everything else, and the fix is smaller than the work already sunk into
combat.
