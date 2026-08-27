# Party Assembly Screen Redesign — Implementation Prompt

> **Retired 2026-08-27 — do not implement.** The campaign no longer has a
> party-assembly screen, selectable presets, or a custom character editor. The
> controller and preset data described here were deleted. Follow
> [`docs/CURRENT-PRODUCT-CONTRACT.md`](../../CURRENT-PRODUCT-CONTRACT.md).

**Audience:** an LLM engineer picking this up cold, with repo access. Read this whole document before writing any code. It is the product of a multi-round design conversation; every decision below was argued through, not guessed — the "why" is included so you can make good judgment calls on anything left open, and so you don't relitigate settled questions.

**Your mandate:** you are a meticulous, experienced software engineer and game developer. Match the codebase's existing conventions exactly (naming, file layout, CSS patterns, comment style). Do not introduce a parallel styling system, a parallel input system, or a parallel animation system where a shared one already exists — this repo has real infrastructure for input and sprite playback; find it and reuse it before you build anything new. Where you must make a judgment call not fully specified here, make it, document your reasoning briefly in a code comment or commit message, and move on — don't stall on it.

---

## 0. Required reading before you touch anything

1. `/CLAUDE.md` — project overview, commands, architecture.
2. `/AGENTS.md` — **read this in full**, especially "Hard rules," "Common pitfalls," and the "Borrowed title mode" section. It documents regressions that have already happened once in this codebase; don't repeat them.
3. This document, in full.
4. The current implementation, before writing a line of new code:
   - `src/engine/party-ui.ts` (the controller you're rewriting the `"choice"` phase of)
   - `src/engine/party-ui.test.ts` (existing tests — expect most of the `"choice"`-phase tests to need rewriting; the `"edit"`-phase tests should mostly survive untouched)
   - `src/game/preset-parties.ts` (the data)
   - `src/engine/party-sprite-cache.ts` (the sprite asset layer)
   - `src/engine/controller-input.ts` and `src/engine/menu-controller-adapter.ts` (the shared input layer)
   - `src/styles.css` lines ~194–230 (shared FF6 "stage" chrome) and ~1090–1300 (current party-choice styling, which you are replacing)

Do not skip step 4. Every fact in Section 3 below was verified by reading these files; verify them again yourself before relying on them, in case something has since changed.

---

## 1. What this screen is, and where it lives

OnyxLabyrinth is a Wizardry-style first-person dungeon crawler (TypeScript + Vite, no framework, hand-built DOM over a 2D canvas). This is the **party assembly / party select screen**: the first screen after the title's "New Game," where the player either picks one of four pre-made parties or builds a custom one.

It is owned by `PartyCreationController` in `src/engine/party-ui.ts`, specifically the `phase === "choice"` branch (`renderChoice()` and its key handling). The `phase === "edit"` branch (the six-... actually four-slot custom character editor) is a separate, already-working flow you are integrating with, not rebuilding. `PARTY_SIZE` is **4**, not 6 — if you see stale references to a six-slot party or "Fenn" anywhere (including in `CLAUDE.md`, which is out of date on this point), trust the code (`src/game/party.ts`, `PARTY_SIZE = 4`) over the doc.

The screen renders inside `#combat-panel.party-create-host` — the shared `FF6Window` blue/gold chrome that every out-of-combat menu in this game uses (title, town, camp, arena, party, game over). **Keep that outer window chrome** (border, corner treatment, color palette) so this screen still reads as "the same game" as every other menu. You are replacing what's *inside* the window, not the window itself.

---

## 2. The problem with the current screen

The current `"choice"` phase renders a vertical accordion list (via the shared `ff6-selection-list` component from `ff6-window-library.ts`): four rows, where the focused row expands to show portraits, strength/weakness text, and stats, while the other three collapse to two lines (label + member names only). This has multiple compounding problems, confirmed against a live screenshot during design review:

1. **Type hierarchy is inverted.** Member names ("Aria · Coda · Dell · Eve") render at similar size/weight to the preset name ("1. All Trades"). The member names are the least actionable text on the screen — the player has no faces or history attached to those strings yet. The thing the player is actually choosing (a strategy) reads as subordinate to a list of names.
2. **The accordion breaks the cursor's spatial contract.** Pressing Down on the focused row causes it to collapse (~200px vanishes) while the next row expands — the row you're moving *toward* jumps upward on screen while your thumb moves down. Repeat-scrolling feels unpredictable. Fixed-height rows exist in classic JRPG menus specifically so cursor motion is metronomic.
3. **The con/weakness line is visibly dimmer than the pro/strength line.** In this visual language, dim gray reads as *disabled*. The tradeoff is half the decision and should be exactly as legible as the upside.
4. **Redundant selection indicators** — a `▶` cursor glyph *and* a full-width lighter-blue background panel both signal "this is selected." Doubling up makes the highlight read as a card rather than a state, which is part of what invites accordion-style expansion in the first place.
5. **Portraits are small and empty-feeling** — real sprite art shrunk into ~64px boxes with lots of dead navy space around a tiny visible sprite.
6. **Mixed input model.** The footer reads `D-pad · A confirm · 1-4 preset · C custom · B back` — four different input paradigms on one screen, and `C` isn't a standard face button in an A/B/X/Y scheme.
7. **Verb mismatch.** "Assemble Your Party" promises construction; a preset picker delivers selection. (Resolved once custom is a real, always-reachable option — see below — so keep the title.)
8. **Custom party is a footer promise, not a real option** — described in the hint text (`C custom`) rather than being a genuine, focusable, always-visible element.

Do not "fix" this by re-tuning the accordion's timing or spacing. The accordion itself is the root cause of (1), (2), and (4); it needs to be replaced, not patched — there's a half-finished patch already in git history that tried to fix row-overlap on top of the accordion and made the CSS more complex without addressing the underlying issue. Don't repeat that.

---

## 3. Verified codebase facts (ground truth — don't re-derive, don't guess)

### 3.1 Data model

- `PARTY_SIZE = 4` (`src/game/party.ts`).
- `src/game/preset-parties.ts` exports `PRESET_PARTIES: readonly PresetPartyDef[]`, exactly 4 entries: `balanced` ("All Trades"), `iron` ("Shield Wall"), `glass` ("Glass Cannons"), `blades` ("All Steel").
- Each `PresetPartyDef` has `{ id, label, tagline, strength, weakness, members }`. `members: readonly PresetMember[]`, each `{ name, race, alignment, cls, slot }` where **`slot` is 0–1 for front row, 2–3 for back row** — this is real formation data already in the schema, not something to invent. Use it: a 2×2 sprite block with top row = front (slots 0/1), bottom row = back (slots 2/3) visually communicates formation for free.
- Real roster names, for reference: All Trades = Aria/Coda/Dell/Eve; Shield Wall = Bram/Gareth/Helga/Mira; Glass Cannons = Sable/Wren/Nyx/Iris; All Steel = Rook/Pike/Shade/Voss.
- `PresetPartyDef` currently has no per-role or ATK/DEF/SUP data — you will need to add fields for the composition pips (role per member) and the three segmented stat bars. See Section 6 "Open decisions" for how to source these values.

### 3.2 Sprite assets

- `src/engine/party-sprite-cache.ts`: `partyIdleSpriteUrl(cls: CharacterClass): string` returns the URL of the full idle strip (all frames, horizontal, 100×100px per frame). `getPartySpriteStrip(cls, "idle")` returns `{ strip: SpriteStrip, img: HTMLImageElement } | null` once the bundle is loaded, where `SpriteStrip.frameCount` is derived from image width (`width / 100`), and idle's playback config is `{ fps: 6, loop: true }` (see `STATE_CONFIG` in the same file).
- The pack art **faces right**; the combat renderer draws party members mirrored (`transform: scaleX(-1)`) because the party fights on the right side of the screen facing left. The current `party-ui.ts` preview (`spritePreviewHtml`) already applies this same mirror via CSS (`.party-sprite-preview img { transform: scaleX(-1); }`) — keep that convention for visual consistency with combat.
- **Currently the party-select screen shows only frame 0, frozen** — the code comment literally says "Idle strip clipped to frame 0." The clip technique: `.party-sprite-preview` is a fixed-size box (`width/height: 100px` or `48px` for the `--sm` variant) with `overflow: hidden`; the `<img>` inside is `height: 100px; width: auto` (so it renders at natural aspect, i.e. the *entire* multi-frame strip at 100px tall), and the container's width being exactly one frame-width clips everything past frame 0.
- **You are turning this into a real animation.** To do that you need to shift the visible frame over time — either translate the `<img>` horizontally by `-frameIndex * TILE_SIZE` on a shared timer, or switch the tile to a `background-image` with animated `background-position-x`. **Watch the mirror sign**: the existing `scaleX(-1)` on the image means a naive positive `translateX` will appear to animate backwards relative to unmirrored math — verify the direction empirically (load it, watch it play forward) rather than assuming a sign.
- **Recommend one shared driver, not one timer per tile.** At most ~12 sprite tiles are ever visible at once (current party ×4 + two dimmed peek neighbors ×4 each). Drive all of them off one `requestAnimationFrame` loop computing `frameIndex = Math.floor(elapsed * fps) % frameCount` per class, rather than N independent `setInterval`s.
- **Only ever use the `idle` state on this screen.** Do not cycle through `walk`/`attack`/`hurt`/`death` — a death-frame flourish on a party-*select* screen is thematically wrong; this was explicitly decided against during design review.
- Respect `prefers-reduced-motion`: freeze on frame 0 when it's set, same as the current static behavior.

### 3.3 Input plumbing — read this carefully, it determines your implementation approach

There are **two independent, non-overlapping paths** currently feeding `PartyCreationController.handleKey()`, and they behave differently:

1. **Keyboard**, via a raw listener in `main.ts` (~line 1470): `window.addEventListener("keydown", (e) => { if (state.mode !== "party_creation" ...) return; partyCreationController.handleKey(e.key); })`. This uses **native OS key-repeat** — there is no custom DAS/ARR (delayed-auto-shift/auto-repeat-rate) timing anywhere in this path today.
2. **Gamepad**, via `globalInput` (`createControllerInput`, instantiated with `attachListeners: false`, so it *only* polls the Gamepad API on a `requestAnimationFrame` loop — it does not also receive keyboard events; confirmed by checking every call site of `globalInput.handleKeyboardDown`, which is gated to `state.mode === "combat"` only and therefore never fires for party creation). Gamepad presses flow through `routeControllerEvent` → `controllerEventToMenuKey()` (`src/engine/menu-controller-adapter.ts`) → `partyCreationController.handleKey(key)`.
   - **`controllerEventToMenuKey` only forwards `kind === "press"` events** (no hold/repeat at all today) and **only maps `up/down/left/right/a/b/select`** to synthetic key strings. **It has no mapping for `x` or `y`.** If you want `Y` to trigger "edit as custom" on a gamepad, you must add an entry to `PRESS_TO_KEY` in `menu-controller-adapter.ts` (e.g. `y: "y"`) — a small, low-risk change, but a real one, and it affects every menu routed through this adapter (title/town/camp/game_over/party_creation/etc.), so keep the added mapping generic (a literal `"y"` key string) rather than party-creation-specific.
   - There is **no repeat/hold-based re-fire mechanism anywhere in the shared input stack today**. If you want metronomic DAS/ARR-style repeat (recommended: ~250ms initial delay, ~90–100ms repeat, matching the cadence discussed in design review), **implement it locally inside `PartyCreationController`** — track "direction currently held" + a timestamp, and re-issue the move on your own timer/rAF tick, rather than modifying `controller-input.ts`'s hold semantics globally. That shared module is used by every other menu and by combat; don't change its behavior contract for one screen.
3. `Y` already has an established meaning elsewhere in this game's input vocabulary: `combat-select-action-view.ts` uses `A/B/X/Y` as the four quick-action palette glyphs in combat (`PALETTE_GLYPHS`). Different mode, so no runtime conflict — but it tells you the game already treats `Y` as a legitimate fourth action slot, which supports using it here too.
4. Keyboard-equivalent for the gamepad `y` button, per the existing shared `KEYBOARD_MAP` in `controller-input.ts`, is the literal `d` key (not `C`, which an earlier draft mockup assumed incorrectly — that mockup was a standalone HTML reference file, not derived from this codebase). If you add keyboard support for "edit as custom," it should be reachable via whatever key the raw keydown listener recognizes for it — decide one canonical key (suggest `y`/`Y` to mirror the gamepad glyph shown on screen) and don't introduce a second, inconsistent binding.

### 3.4 Window chrome / aspect ratio

- `src/styles.css` (~lines 207–222): a comment states plainly that title/town/camp/arena/**party**/game-over all "fill the same 8:7 stage as the corridor" via one shared `aspect-ratio: 8 / 7` rule.
- **Design decision: this screen becomes 1:1 (square), overriding that shared rule for this screen only.** This is an intentional, explicit deviation — confirmed twice in design review — not an oversight. Scope the override narrowly (e.g. a modifier class on the party-creation host element) so you do not change the aspect ratio for title/town/camp/arena/game-over, which must keep 8:7.
- No existing role/class color tokens exist in this codebase (`grep -rn "classColor\|roleColor"` returns nothing). You're adding new ones for the composition pips — see Section 5.4. Prefer extending the existing CSS custom-property vocabulary already used in this stylesheet (e.g. however `--amber` is scoped/named) rather than importing a foreign token set wholesale from a reference mockup.

---

## 4. Final design: single-party carousel

Earlier design rounds considered a 2×2 "all four presets at once" grid (optimizing for at-a-glance comparison) before settling on this. **The final direction explicitly deprioritizes side-by-side comparison in favor of showing full-size, animated party sprites** — that tradeoff was made deliberately, not accidentally; don't second-guess it back toward a grid.

### 4.1 Structure

One party "card" fills the main content area at a time. Left/Right cycles through a **wrapping carousel**: the 4 presets, plus **Custom Party as a 5th, always-present stop** at the end of the wrap (Custom → wraps back to preset 1, preset 1 ← wraps back from Custom). This gives you:

- **One input model**: pure Left/Right to cycle, `A` to confirm, `B` to back out, `Y` to "edit as custom" from whatever preset is currently focused. No number-key shortcuts, no dedicated "custom" button — custom is just another stop on the carousel, which also satisfies "never hide custom" for free (it's always one press away, and its peek sliver is always partially visible at either end).
- **A layout that scales past 4 presets** without redesign, unlike a fixed grid — a real advantage of this approach if more presets ship later.

### 4.2 Peek edges

The centered card is flanked by thin, partially-transparent slivers of the previous/next cards in the carousel (their real content — dimmed sprites and name — not just a color block; this directly serves "showcase the sprites"). Suggested starting values: peek width ≈ 8–12% of the frame's inner width per side, opacity ≈ 0.35–0.45, small `‹`/`›` chevron affordances at the outer edge of each peek sliver. Pressing Left/Right **slides** the filmstrip by one card-width (recommend ~180–220ms ease-out) so the neighbor becomes the new centered, full-opacity card — this is a position/opacity transition only, never a resize, in keeping with "nothing resizes, ever" (see 4.5).

This is keyboard/gamepad-first input, per the rest of this game — build it for D-pad/arrow-key/left-right cycling with visible chevron affordances, not for pointer/click interaction on the peek slivers.

### 4.3 Card anatomy (top to bottom)

1. **Header row**: preset name, large and bright — the single most prominent text element on the card, fixing the inverted hierarchy from the old screen — plus the **composition strip** on the same row: one role-colored glyph pip per party member, in party order, matching the sprite order below. This is the primary comparison signal now that cards aren't shown side-by-side (see 5.4).
2. **2×2 sprite block**: four square tiles, top row = front line (member `slot` 0/1), bottom row = back line (`slot` 2/3), each playing its class's idle animation on loop (Section 3.2). Member name in small, clearly subordinate text under each tile — this is deliberately *de-emphasized* relative to the header, the inverse of the old screen's hierarchy. **No per-portrait frame/corner-treatment glyphs of any kind** — role signal lives only in the header comp-strip, not duplicated onto individual portraits. This was an explicit, twice-stated instruction during design review; do not add a decorative frame system to the sprite tiles.
3. **Stat row**: three segmented bars, `ATK` / `DEF` / `SUP`, 5 blocks each (`▰▰▰▱▱` style — filled vs. empty blocks, not a smooth gradient bar; countable/exact reads better at this resolution).
4. **Tag line**: one short flavor string in quotes, e.g. `"Jack of all trades"`. Flavor only — no decision weight; the real tradeoff lives in the detail strip below.

### 4.4 Detail strip (persistent, fixed geometry, below the card)

Two fixed lines showing the *focused* card's full pro/con, regardless of which carousel position is centered:

```
▲ Flexible — heal, burn, stab, and tank.
▼ No specialist edge; mediocre at everything.
```

- **Equal legibility for both lines** — same luminance, differentiated only by hue and glyph (`▲` vs `▼`), never by dimming the con line. Dim gray reads as *disabled* in this visual language; the downside is half the decision and must read with the same weight as the upside.
- When Custom is the focused stop, there's no preset pro/con to show — render a single centered line instead (e.g. "Choose any four recruits and shape their roles yourself.") rather than leaving the two-line format oddly half-filled.
- This region's height must never change based on content length — pick a max content length and enforce it (see the acceptance criteria).

### 4.5 Fixed geometry — the non-negotiable

**Nothing on this screen resizes, moves, or reflows based on focus.** This is the single fix that eliminates the accordion's core problem (the "spatial contract break" in Section 2, item 2). The *only* motion allowed:

- The carousel slide (position/opacity, on cycle).
- Idle sprite animation (frame stepping, continuous).
- A short selection-confirm flash (border/fill brightness pulse, ~100–120ms, on `A`).
- All of the above disabled under `prefers-reduced-motion` — freeze sprites on frame 0, cut the slide instantly instead of animating it, skip the confirm flash.

Verify this with actual `getBoundingClientRect()` comparisons across focus/cycle transitions if you write tests for it — a good regression guard given this is the exact bug you're fixing.

### 4.6 Selection idiom

One job per signal, not two doing the same job: the **centered position + full opacity + a border/glow treatment** on the card *is* the focus state. Don't also add a separate translucent overlay panel underneath it — that combination is what made the old screen's highlight read as "a card" (inviting expansion) rather than "a state." A cursor glyph is optional/redundant here since carousel position already unambiguously communicates focus (there's only ever one centered card).

### 4.7 Role taxonomy (for the composition pips only)

| Role | Glyph | Notes |
|---|---|---|
| Tank | kite-shield glyph | |
| Healer | leaf/droplet glyph | avoid a medical-cross glyph |
| Phys DPS | sword glyph | |
| Magic DPS | four-point spark glyph | |
| Support | upward-chevron glyph | |
| Hybrid | split glyph, half each hue | for any class that logically spans two roles |

Silhouette should carry the meaning (each glyph identifiable at small size in grayscale); color reinforces it but isn't load-bearing alone, for colorblind/CRT-bleed accessibility. **This table governs the comp-strip pips only** — per 4.3.2, portraits themselves carry no glyph or frame treatment.

You'll need to map the 7 playable classes (`Fighter, Mage, Priest, Thief, Halberdier, Duelist, Crusader` — see `CLASSES` in `src/game/party.ts`) onto this 6-role taxonomy. That mapping isn't defined anywhere yet — pick a sensible one and write it down explicitly (a comment or a small exported constant), don't leave it implicit. Nobody has verified a "correct" mapping against class balance/fantasy — treat your first pass as a reasonable default, not gospel.

---

## 5. Open decisions — resolve these explicitly, don't leave them implicit

1. **ATK/DEF/SUP bar values**: hand-authored per preset (add fields to `PresetPartyDef`, alongside the existing `tagline`/`strength`/`weakness`) vs. derived from real character stats at render time. **Recommend hand-authored** — it lets the screen communicate a clean, legible signal independently of balance-patch churn, consistent with how `tagline`/`strength`/`weakness` are already hand-authored flavor/design text on the same data type, not computed.
2. **Class → role mapping** for the comp-strip pips (Section 4.7) — not defined anywhere yet. Pick one, document it.
3. **Peek sliver exact width/opacity/transition timing** — starting values given in 4.2; tune by eye once it's running.
4. Whether `Custom Party`'s carousel stop shows the player's **last-used custom party** (if one exists in save data) instead of empty dotted slots — nice-to-have, not required for a correct first implementation. If out of scope for this pass, render empty dotted slots and note the gap in a comment.

---

## 6. Constraints from `AGENTS.md` / `CLAUDE.md` (do not violate)

- **Do not change game logic** (combat math, encounter rates, map data, movement/collision) — this is a pure UI/presentation rewrite of one screen's `"choice"` phase. Party creation *logic* (`createCharacter`, `createPresetParty`, stat rolling) is untouched.
- `npm run build` (`tsc && vite build`) **must pass with zero TypeScript errors** before this is done — `noUnusedLocals`/`noUnusedParameters`/`noFallthroughCasesInSwitch` are enforced.
- `npm test` (Vitest) must pass. Expect to substantially rewrite `party-ui.test.ts`'s `"choice"`-phase tests since the interaction model is changing (accordion → carousel); the `"edit"`-phase tests should be unaffected.
- This is a UI/frontend change — **start the dev server and use the feature in a browser before calling it done.** Verify: keyboard cycling, gamepad cycling if you can test it (or at minimum, code-review the `menu-controller-adapter.ts` change carefully since it's shared), `Y`-into-custom-editor pre-population, `prefers-reduced-motion`, and that no text wraps/clips at the screen's minimum supported size.
- Conventional commit style if you commit (`feat(party): ...`), summary under 72 characters, no debug `console.log`/`window.__` exposures left behind.
- Respect `shell.showMode()` as the single source of truth for DOM mode visibility — don't add a parallel visibility toggle for this screen.

---

## 7. Acceptance criteria

- [ ] Centered and peek cards have byte-identical geometry across every focus/cycle state — no element resizes, only position/opacity/slide.
- [ ] All 4 sprite tiles on the centered card play their idle loop continuously (6fps, from real strip data) except under `prefers-reduced-motion`.
- [ ] 2×2 sprite block top row matches `slot` 0/1 (front), bottom row matches `slot` 2/3 (back), for every preset.
- [ ] No glyph/frame decoration on individual portrait tiles — role signal appears only in the header comp-strip pips.
- [ ] Con line's rendered luminance is within ~10% of the pro line's; differentiated by hue/glyph only.
- [ ] Every comp-strip role glyph is distinguishable from the others in a grayscale render.
- [ ] Left/Right cycles through all 4 presets + Custom, wrapping in both directions, with no other input paradigm (no number keys, no non-standard face buttons).
- [ ] Custom Party is reachable purely by cycling and confirmed with `A` — same as any preset, no unique button required to reach it (only to shortcut *into* it from a preset, via `Y`).
- [ ] `Y`, pressed while any preset is centered, opens the existing custom editor pre-populated with that preset's 4 members.
- [ ] No text wraps or clips at the screen's minimum supported resolution.
- [ ] `prefers-reduced-motion` disables the carousel slide animation (cuts instantly instead), the sprite idle loop (freezes on frame 0), and the confirm flash.
- [ ] `npm run build` and `npm test` both pass.

---

## 8. Suggested task order

1. Data: extend `PresetPartyDef` with role-per-member and ATK/DEF/SUP fields; pick and document the class→role mapping.
2. Static layout at the new 1:1 aspect (scoped override, not global): header, 2×2 sprite grid (frame-0 only, no animation yet), stat bars, tag, detail strip — hardcoded to preset 1, no navigation yet. Verify geometry against Section 4.5 before adding any interactivity.
3. Carousel state machine: centered index + wrap, Left/Right handling from both input paths (Section 3.3), including the new local repeat-timing layer.
4. Peek edges: adjacent cards rendered dimmed at the frame margins, slide transition on cycle.
5. Sprite animation: shared frame-stepping driver, wire into all visible tiles (centered + 2 peeks), verify mirror-transform direction empirically.
6. `Y`-into-custom-editor wiring, including the `menu-controller-adapter.ts` gamepad mapping addition.
7. Detail strip content binding (including the Custom-party special case), reduced-motion handling, confirm flash.
8. Rewrite `party-ui.test.ts`'s `"choice"`-phase coverage against the new interaction model. Manual verification pass per Section 6.
