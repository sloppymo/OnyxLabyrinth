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

## Sequence

`A (done) + C Option 1 provisional → B (dungeon HUD) → town hierarchy → title/party identity (cinematic).`
