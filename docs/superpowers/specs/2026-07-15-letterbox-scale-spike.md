# Letterbox / scale decision spike (C)

**Date:** 2026-07-15  
**Status:** **Provisionally decided — Option 1** (2026-07-15 evening)  
**Blocks:** Tranche B only if we later flip to option 3 after a real Deck check

## Arithmetic (don't budget as "integer-scale fill")

| | |
|--|--|
| Steam Deck panel | 1280 × 800 |
| Logical playfield | 768 × 672 (8:7, also canvas cap) |
| Max integer scale to fill height | `floor(800/672) = 1` |
| Max integer scale to fill width | `floor(1280/768) = 1` |

On Deck, “integer-scale the 8:7 box to fill” is a **no-op**. Integer scale only pays on 1080p+ panels.

## Decision fork (reference)

1. **Accept Deck letterbox** — densify in-box.
2. **Non-integer ~1.19× fill** — shimmer/mush/upscale work.
3. **Widen buffer toward 16:10** — product+render; **blocks B**.

## Decision (provisional)

**Chosen: Option 1 — accept Deck letterbox; spend budget on in-box density.**

| Field | Value |
|-------|--------|
| Rationale | Deck hardware check deferred. Integer scale already maxed at 1× on Deck; widen/non-integer are larger bets than the dungeon HUD rewrite. |
| Confidence | **Provisional** — no physical Deck pass on A's roster yet. Re-open C if a later Deck check fails: name/HP/`SP`/`RG` illegible, bars useless, or acting plate unclear. |
| B density budget | Design for **1× / ~4.2″ physical width**. Min type ≈ A's roster **18px** FF36 (A's layout fix dropped from `--fs-small` 26px — **this 18px is now the readability floor the Deck check validates**). HP bar **48px**. One condensed party overlay; no second bar language. |
| Go / no-go for B | **Go.** |
| If later → Option 3 | **Stop B / re-plan** before shipping buffer widening. |

## Reference sizes from tranche A

- HP bar: **48px** fixed (≥1px fill when hp > 0)
- Party numerals: 7ch / 10ch at **18px** roster type
- UI font: FF36 via `--game-font`

## Deck hardware check (gates densify / lighting)

**When:** Before lighting pass or further 18px densify. ~15 min on device.  
**Panel:** Steam Deck OLED/LCD at native **1280×800**, game at **1×** letterbox (768×672 playfield). Hold at normal arm’s length (~40–50 cm).

### Six Y/N

| # | Question | Pass = |
|---|----------|--------|
| 1 | Name + HP + `SP`/`RG` readable without squinting? | Y |
| 2 | 48px HP bars help triage (who’s hurt)? | Y |
| 3 | Inverted acting plate clear vs scene triangle? | Y |
| 4 | Letterbox Fine / Annoying? | Fine → Y; Annoying → N |
| 5 | If Annoying: Mush OK / Widen later? | Mush OK → stay Opt 1; Widen → reopen C Opt 3 |
| 6 | **Can you identify a back-row enemy type at arm’s length?** (0.75-scale sprite) | Y |

**Fail any of 1–3 or 6 → stop before lighting.** Remediation = type bump in-box and/or reopen C.  
**4–5 = C only** (letterbox comfort).

### How to poke the surfaces

1. Boot https://sloppymo.github.io/OnyxLabyrinth/ (or local preview) on Deck.  
2. New Game → Default Party → Arena or dungeon combat with 2+ rows of enemies.  
3. Answer 1–3 + 6 on the **combat roster + field**.  
4. Enter dungeon; answer 1–2 on **B’s bottom HP overlay** (same 18px language).  
5. Answer 4–5 on overall letterbox feel.

Record answers in a reply; do not start the lighting pass until this returns.

**2026-07-15 status:** No physical Deck available in this session. A one-page checklist was prepared (`2026-07-15-deck-gate-checklist.md`) instead of a desktop/Playwright proxy, per the rule above that a proxy cannot substitute for a pass/fail. Gate remains **open** — Decided/Option-1 status below stays provisional until the six answers come back from a real device.

## Sequence (post-check)

`Deck check → (pass) lighting → town hierarchy → C provisional→decided`  
`Deck check → (fail) type bump and/or reopen C Opt 3 — stop before lighting`

