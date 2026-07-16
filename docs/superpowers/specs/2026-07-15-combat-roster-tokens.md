# Combat roster tokens (addendum)

**Date:** 2026-07-15  
**Status:** Approved for build (tranche A)  
**Consumers:** `combat-select-action-view` party window now; dungeon party strip (tranche B) derives from this token.

## Why this exists

The combat party window was unlabeled soup (bare SP vs yellow Rage vs wandering dashes) with a wrap-under HP bar burning vertical density. This addendum mints the shared **party-resource-row** language B will inherit.

## Column maxima audit

Pulled from `leveling.ts` growth (`floor((effVIT*2+hpBonus)*0.5…)`, casters `floor(effCast*0.5…)`), `MAX_STAT = 18`, perk one-shots (`maxHpPercent` up to +20% / +15%, `maxSpPercent` +20%), `maxRageForLevel = 10 + level`. No `hpGrowthBonusPercent` / gear VIT/INT currently stocked in content; optimistic L12 still assumes those percents apply.

| Resource | Optimistic L12 | Spec display ceiling | Worst display string |
|----------|----------------|----------------------|----------------------|
| HP | ~330 | **≤ 999** | `999/999` (7 glyph) |
| SP | ~146 | **≤ 999** | `SP 999/999` (10 glyph) |
| Rage | 22 at L12 | **≤ 99** | `RG 99/99` (7 glyph) |

**Token validity:** layout is valid while HP ≤ 999, SP ≤ 999, Rage ≤ 99. Crossing those ceilings is a content/systems change that must widen columns — not a silent reflow.

## Token: `party-resource-row`

Grid, left → right (no header row):

| Col | Id | Width | Content |
|-----|-----|-------|---------|
| 0 | `actor` | fixed plate treatment | **Acting** character: inverted name plate. Empty for others. See Glyph rule. |
| 1 | `name` | `minmax(0, 1fr)` | Name text (truncates) + status tags (never truncate) |
| 2 | `hpBar` | **48px** fixed | Fill = hp/maxHp; border always on |
| 3 | `hpNum` | **7ch** (holds `999/999`) | `cur/max`, right-aligned |
| 4 | `res` | **10ch** (holds `SP 999/999`) | See resource rule |

Bar is a **required** element (not an optional collapsed slot). Validated at logical 1× / 768-wide.

### Resource column

One column; never SP and Rage on the same row (engine invariant).

- Caster (`maxSp > 0`): `SP cur/max` — cool SP tint
- Technique class: `RG cur/max` — warm rage tint
- Neither / summon: dim `—` **right-aligned where numerals sit** (same cell geometry; no width collapse)

`SP` / `RG` prefixes are 2-glyph fixed width in the pixel face. Inline prefix only — no stacked micro-labels, no window header row.

### HP bar fill math

- Width: 48px outer; 1px border each side → 46px fill track.
- Fill = percentage of track; **clamp to ≥ 1px whenever `hp > 0`**; **0px only at KO / hp ≤ 0**.
- Color stops (carry triage; don't rely on sliver width): full / wounded ≤50% / critical ≤25%.
- HP numerals adopt the same color stops.

### Acting vs selection (glyph rule)

**One glyph = one meaning, game-wide:**

- `▶` means **menu selection only** (action list, target list, town/title/etc.). Never “currently acting.”
- **Currently acting** = inverted name plate on the roster row (background + gold/bright name). Stronger at Deck glance than a 1ch glyph; avoids collision when heal-targeting paints a selection highlight on another row while the actor is still “current.”

Scene field marker stays authoritative for who’s acting in the arena; roster plate must match `currentCharacterId` on every windows rebuild.

Inspect (cyan outline) is orthogonal — not acting, not menu `▶`.

### Truncation priority (name cell)

Status tags **survive**; the name text ellipsizes first. Prefer `Fen…  PSN` over clipping the poison tag.

### Font / density note

DOM windows use `--game-font: "FF36", … monospace`. FF36 is monospace bitmap; tabular-nums is belt-and-suspenders.

**Roster row type size is 18px, not `--fs-small` (26px).** At 26px, `7ch + 10ch + 48px` overflows the ~300px party pane and collapses the name column to 0 width (observed in the A build). Spec ceilings still hold: `ch` tracks the row font-size, so `999/999` / `SP 999/999` fit the same 7ch / 10ch columns at 18px. Name column uses `minmax(56px, 1fr)` so it cannot crush to zero if another column drifts.

**C linkage:** Option 1 (“accept letterbox”) assumed A’s roster readable at 1×. A’s layout fix dropped type from 26→**18px**; that 18px is now the readability floor the Deck hardware check validates. Do not stack town/title densify work until that check lands (or consciously accepts 18px on device).

## Non-goals (A)

Action-window footer dedupe, greyed Skill reason, enemy-window density, town/title/dungeon shell, buffer resize.

## Inheritance for B (dungeon strip)

Same `hpBar` width + fill clamp + color stops; same `hpNum` / `res` rules and ceilings; no header; no acting-plate required while moving (optional later). Condensed density may shorten names further — must not invent a second bar language.

## Related

- C-spike (parallel decision): [`2026-07-15-letterbox-scale-spike.md`](./2026-07-15-letterbox-scale-spike.md)
- Prior combat DOM design: `2026-07-07-combat-select-action-dom-design.md`
