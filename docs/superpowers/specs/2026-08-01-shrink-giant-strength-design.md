# Shrink + Giant Strength — design

**Status:** Approved for implementation (retuned; user “do it” 2026-08-01)  
**Scope:** Two paired body-magic combat spells — Mage Shrink, Priest Giant Strength

## Goals

- Readable JRPG body magic with sprite-scale presentation
- Mage gets a lasting single-target soft-control verb beyond pure damage
- Priest gets a short offensive buff window with real downside

## Spells

### Shrink (`mage-shrink`)

| Field | Value |
|--------|--------|
| Class | Mage |
| Tier | 6 |
| SP | 18 |
| Target | `singleEnemy` |
| Duration | Rest of combat (until death or Dispel Magic) |
| Status | `shrunk` |

Effects while `shrunk`:

- Sprite draw scale **×0.5** (canvas + Phaser; foot-anchored)
- All **outgoing** damage **×0.5** (melee, abilities, spells)
- **No evade buff** (retune: original +30% evade stacked too cleanly with half damage)

Bosses: allowed. No stacking; re-cast is a no-op if already shrunk.

### Giant Strength (`priest-giant-strength`)

| Field | Value |
|--------|--------|
| Class | Priest (Crusader via priest list) |
| Tier | 6 |
| SP | 16 |
| Target | `singleAlly` |
| Duration | **3 rounds** (end-of-round ticks; refresh resets to 3) |
| Status | `giantStrength` |

Effects while `giantStrength`:

- Sprite draw scale **×1.3**
- All **outgoing** damage **×1.5**
- All **incoming** damage **×1.2**
- Physical evade chance **−0.20 absolute** (floored at 0)

Cleared by: timer expiry, KO, Dispel Magic.

## Non-goals

- Floor/dungeon utility casts
- AoE versions
- New VFX strips (reuse existing buff/debuff choreography styles)

## Implementation sketch

1. Extend `StatusEffect` with `shrunk` | `giantStrength`
2. New spell effect kind `applyCombatStatus` (or extend disable/buff) + timers map for Giant Strength
3. Damage funnel / evade sites read status
4. Combat scene + Phaser multiply slot scale when status present
5. UI tags `SHK` / `GNT`; Dispel clears both
6. Unit tests for math + duration + dispel
