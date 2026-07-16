# ONYX LABYRINTH — UI/UX tranche handoff (for another LLM)

**Date:** 2026-07-15 (revised evening — four flags from review of prior handoff)  
**Game:** Wizardry-style 1st-person dungeon crawler (TypeScript + Vite, canvas corridor + DOM UI). Target: Steam Deck / controller-first. Aesthetic: FF6-style blue chrome.  
**Before code:** read `AGENTS.md` / `CLAUDE.md`. Do not change combat math / dungeon geometry unless asked.

---

## Why this work happened

An external LLM reviewed five screenshots and ranked five fixes. We did **not** implement that list as one megapatch. We corrected “kill the letterbox via integer scale,” then ran **A → C (decision) → B** so tokens mint once and get reused.

---

## Sequence

1. **A — Combat party window** (shipped) — mints shared tokens  
2. **C — Letterbox spike** (Option 1 **provisional**) — density budget for B  
3. **B — Dungeon HUD rebuild** (shipped; keyboard discoverability closed same evening)  
4. *Next:* **Deck hardware check first** (gates further densify work) → then town hierarchy → combat honorable mentions as filler → title/party on cinematic track  

**Do not start town before the Deck check.** If 18px fails on device, remediation (bigger type in-box or reopen C toward buffer widen) touches every screen including a freshly polished town window.

**2026-07-15 status:** Deck check still not run — no physical device available this session. Checklist prepared at `2026-07-15-deck-gate-checklist.md`; next agent/human must fill the six answers on real hardware before lighting or town work starts.

---

## C — Letterbox / scale

### Arithmetic

- Deck **1280×800**; logical playfield **768×672**  
- Max integer scale = **1×** → “integer-scale to fill” is a **no-op** on Deck  

### Decision

**Option 1 provisional** — accept letterbox; densify in-box.

**A quietly moved C’s goalposts:** A’s layout fix dropped roster type from 26px (`--fs-small`) to **18px**. Option 1 was predicated on A being readable at 1× — **18px is now the readability floor the Deck check validates** (~2mm glyph height on Deck’s ~215ppi at arm’s length: plausibly fine, genuinely borderline).

| Field | Value |
|-------|--------|
| Confidence | Provisional until Deck check |
| Re-open | If Deck check fails name/HP/`SP`/`RG`/bar/acting plate at 18px |
| If → Option 3 | Stop / re-plan before buffer widen |

**Spike:** `docs/superpowers/specs/2026-07-15-letterbox-scale-spike.md`

---

## A — Combat roster tokens (shipped)

**Doc:** `docs/superpowers/specs/2026-07-15-combat-roster-tokens.md`

| Topic | Decision |
|-------|----------|
| Resources | **One** `RES` column — `SP cur/max` or `RG cur/max` with **letter** prefixes (FF6-period labels; no unicode — emoji/font risk with the FF36 face) |
| Empty | Dim positional `—` |
| Headers | **No** sticky header row |
| Bar | **48px** fixed; ≥1px fill if alive; color ≤50%/≤25% |
| Acting | **Inverted name plate** — not `▶` |
| Glyph rule | **`▶` = menu selection only**, game-wide |
| Ceilings | HP/SP ≤ 999, Rage ≤ 99 (L12 optimistic ~330/146/22) |
| Type size | **18px** (see C linkage above) |

### Combat flex verification (flag 2 — run 2026-07-15)

Nudging menu/enemy/party flex (~28% / ~22% / remainder → party ~354px) is a combat-window geometry change. **Smoke checklist run:** Arena fight screenshot + live DOM measurements.

| Check | Result |
|-------|--------|
| Combat starts; three bottom windows | Yes |
| Party names visible; acting plate | Yes (Aria plate; nameW≈120) |
| RES `SP`/`RG` prefixes | Yes |
| Windows vs sprites | winTop 514 vs canvasBottom 686 — windows along bottom; party sprites in scene above |
| Full AGENTS 12-point combat checklist | **Smoke only** — not every item (spell banner, hurt anim, summon rows, etc.). Remaining items still open if polish continues |

Screenshot: `…/assets/onyx-ux-shots/08-combat-flex-check.png`

---

## B — Dungeon HUD (shipped)

**Doc:** `docs/superpowers/specs/2026-07-15-dungeon-hud-rebuild.md`

- Viewport-only chrome; **no** permanent WASD legend  
- Message band (events, clear-on-input, ≤2 lines) + `F1 · N` chrome  
- Contextual prompts (state); v1 = Unlock only (`U` / pad `A`)  
- Party overlay: six **two-line** HP cells from A’s bar language; status notches; no SP/RG on strip  
- FF6-blue viewport frame  

### Keyboard discoverability (flag 3 — verified + closed)

| Input | Opens | Camp/Map/Town listed? |
|-------|-------|------------------------|
| Esc | **Save/Load only** (`openSaveMenu` / `save-ui.ts`) | **No** |
| G | Grimoire (`spell-ui.ts`) | No |
| Start (pad) | Action ring | **Yes** |
| C/M/T/U | Still in `input.ts` | Hotkeys exist; were orphaned after legend kill |

**Gap existed** (Esc is not a verb menu). **Closed:**

1. **Tab** opens the action ring (keyboard door = pad Start) — `input.ts` `onActionRing` → `openActionRing()`  
2. First dungeon entry per session: entry message line 2 = `Tab: Actions · Esc: Save` (strip event; teaches the *door*, not every room)

### Grimoire message transcript (flag 4)

**UNVERIFIED / not shipped.** Truncation-to-grimoire was a spec claim only. `spell-ui.ts` is cast-only — no transcript store. Do not cite as done.

---

## Recommended order (what’s open)

1. **Deck check** (15 min, five Y/N on A roster + B HUD) — **top of queue; gates densify branch**  
2. *(Done this evening)* Grimoire verify + keyboard door — closed above  
3. **Town hierarchy** — only after Deck check passes or consciously accepts 18px  
4. Combat honorable mentions as filler  
5. Title/party identity on cinematic track  

### Deck check questions (reuse)

1. Name + HP + `SP`/`RG` readable without squinting?  
2. 48px bars help triage?  
3. Inverted acting plate clear vs scene marker?  
4. Letterbox Fine / Annoying?  
5. If Annoying: Mush OK / Widen later?  
6. **Can you identify a back-row enemy type at arm’s length?** (0.75-scale; covers ground-plane)

Full protocol: `docs/superpowers/specs/2026-07-15-letterbox-scale-spike.md` § Deck hardware check.

---

## Hard rules to preserve

- Don’t change vanishing-point / fog / glow / vignette / scanlines without being asked  
- `#message:empty` must stay hidden  
- `showMode()` owns visibility; trap modality gates dungeon input  
- Canvas cap **768×672**  
- Borrowed `"title"` overlays: own controller + `justOpened*`  
- Combat/scene geometry changes → AGENTS combat verification checklist  

---

## One-paragraph summary

We built combat roster tokens (A) and a viewport-first dungeon HUD (B) under a provisional “accept Deck letterbox” decision (C). A’s column fix dropped roster type to **18px**, which elevates the Deck readability check to the top of the queue before town/title densify work. Combat flex was smoke-verified. Keyboard discoverability after legend removal was verified as a real gap (Esc = Save only); closed with Tab → action ring + a one-line first-entry hint. Grimoire-as-transcript remains **UNVERIFIED / not shipped**.
