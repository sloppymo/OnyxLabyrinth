# Telegraph Wind-ups — Design Spec v1.0

**Date:** 2026-07-16
**Context:** Direction B, step 2 of the combat engagement work (`docs/COMBAT-ENGAGEMENT-AUDIT.md`, "Direction B — Telegraphs and answers"). Follows the rage economy retune (`2026-07-16-rage-economy-design.md`).

## 1. Problem

Big enemy abilities (party-wide nukes, boss signatures) resolve instantly on the enemy's turn. The party has no window to react: the first frame of a fight is "solved" partly because nothing the enemy does is ever anticipatable. The audit's Direction B prescribes **wind-up rounds for big enemy abilities plus interrupt tools for the party**.

**Interrupt model (designer decision, 2026-07-16):** *disable-cancels only.* No flinch-on-damage, no new player verb. Paralysis/sleep (including the Direction A boss 1-round stagger) cancels a wind-up; Defend halves the hit; blind gives a 50% whiff; killing the charger cancels. This makes Direction A's diminishing-return disables double as interrupt tools — two systems interlock, nothing new to balance.

## 2. Goals

- Fight-swinging enemy abilities are announced one full round before they fire.
- The party always has at least one real answer: disable it, Defend through it, blind it, or kill it.
- Both combat APIs behave identically (per-turn `resolveEnemyTurn` and round-based `resolveCombatRound`), including interrupts.
- Data-driven: any ability can opt in via one flag.

## 3. Non-goals

- No flinch/break-chance mechanic, no dedicated Interrupt verb, no new techniques/spells.
- No telegraphs for summons (a turn spent summoning is already its own telegraph), single-target nukes, buffs/heals.
- No changes to ability powers, conditions, weights, or cooldowns (only the opt-in flag is added).
- No changes to the pre-existing round-path behavior where a decided *normal* action does not re-check paralysis at resolution. The wind-up fire path is the only action kind that gets a resolution-time incapacitation check.
- Nothing from Direction C (row swap, boss phases, Analyze).

## 4. Data

`EnemyAbilityDef` gains `windUp?: boolean`. Flagged (7 abilities — all party-wide or party-suppressing):

| Ability | Effect | Why flagged |
|---------|--------|-------------|
| `hellfire` | allParty 6 fire | Warlock signature nuke |
| `magma-burst` | allParty 8 fire (HP<50%) | Flame Golem enrage |
| `dark-pulse` | allParty drain 4 | party-wide attrition |
| `memory-drain` | allParty drain 6 | boss signature |
| `echo-of-silence` | allParty blind 50% | boss control |
| `ghostly-wail` | allParty sleep 30% | party-wide control |
| `anti-magic-field` | party fizzle field 3 | party suppression |

`anti-magic-field` keeps its `firstTurn` condition: declared on turn 1, lands on turn 2. Intentional — counter-magic becomes anticipatable.

## 5. Engine (`src/game/combat.ts`)

### 5.1 State

```ts
// CombatState:
windUps: Record<string, { abilityId: string; name: string; targetId: string | null }>;
```

Keyed by enemy instance id. `name` is stored so UI surfaces need no data import. Initialized `{}` in `createCombatState` and in the hand-built `src/vfx-vignette.ts` literal.

### 5.2 Decision flow (`decideEnemyAction`, shared by both APIs)

1. **Incapacitated branch (existing sleep/paralysis check):** if a wind-up is stored for this enemy, delete it and emit the break event — the per-turn interrupt path.
2. **Fire branch (new, before everything else):** if `windUps[enemy.instanceId]` exists, return `{ kind: "ability", abilityId, targetId }` built from the stored entry (commitment — no re-decision, no weighted attack roll). The entry is deliberately NOT cleared here (see 5.3). Defensive retarget: re-run `pickAbilityTargetId` at fire time (all current flagged abilities target `allParty`/`self`, so this is a no-op safeguard for future single-target flags).
3. **Flag branch (new, where the ability action would normally be returned):** when `pickEnemyAbility` + the weighted `weight/(weight+2)` roll selects a `windUp`-flagged ability, store the wind-up, emit the telegraph event + log `"<name> begins charging <ability>!"`, and return `doNothing` (the turn is spent charging).

### 5.3 Resolution flow (`resolveEnemyAction`)

Before the existing ability dispatch: if `action.kind === "ability"` and `windUps[actor.instanceId]?.abilityId === action.abilityId`, this is a wind-up firing — delete the entry, then:

- if the actor is paralyzed or asleep **now** → emit the break event + log `"<name>'s <ability> is broken!"`, return. This is the round-path interrupt: in `resolveCombatRound` intents are decided at round start and the party phase runs before enemy resolution, so a disable landed mid-round must cancel here. Scoped strictly to wind-up firings; normal decided actions keep their existing behavior.
- otherwise fall through to `resolveEnemyAbility` unchanged (blind 50% whiff, fizzle fields, magic screens all still apply).

Killing the charger cancels trivially: dead enemies never decide (per-turn) and `resolveEnemyAction` returns early on dead actors (round path). The stale map entry is inert and discarded with combat state.

### 5.4 Events

```ts
| { type: "telegraph"; actorId: string; abilityId: string }
| { type: "telegraphBreak"; actorId: string; abilityId: string }
```

`telegraph` animates (banner); `telegraphBreak` animates (banner "Interrupted!") — it is the payoff of the player's interrupt.

## 6. UI surfacing

- **Banner (`combat-scene.ts`):** `telegraph` shows the ability name in the top banner (same `showBanner` path as spell/technique names); `telegraphBreak` shows "Interrupted!". Scene resolves names via a new `abilityNameFor` helper importing `enemyAbilityById` (mirrors `techniqueNameFor`).
- **Persistent tag (`combat-select-action-view.ts`):** the enemy-names window renders a `⚡<AbilityName>` tag for enemies with a `state.windUps` entry, riding the existing enemy status-tag renderer (same caveat as status tags: same-name enemies are grouped, so the tag shows if any in the group is charging).
- No new player-facing verbs, menus, or palette entries.

## 7. Testing (TDD)

In `src/game/combat-turns.test.ts` (per-turn API) and `src/game/combat.test.ts` or the turns suite (round path):

- Telegraph turn: flagged enemy (`hellfire`) spends its turn charging — no damage, `windUps` set, `telegraph` event, charging log line.
- Fire turn: next `resolveEnemyTurn` resolves Hellfire (all party damaged), entry cleared.
- Paralysis interrupt (per-turn): wind-up set, enemy paralyzed, next turn → no damage, entry cleared, break event.
- Sleep interrupt (per-turn): same with sleep.
- Kill interrupt: wind-up set, enemy killed → no fire, no crash.
- `anti-magic-field` wind-up: telegraphed on the first turn, fizzle field lands on the second (firstTurn × wind-up interplay).
- Non-flagged abilities resolve instantly as before (`acid-spit`).
- **Round-path parity:** `resolveCombatRound` — telegraph round 1, fire round 2.
- **Round-path interrupt (critical):** wind-up from round 1; round 2 the party paralyzes the enemy in the player phase; enemy phase → no fire, entry cleared, break event.
- UI: enemy window shows the `⚡` tag for a winding-up enemy (`combat-select-action-view.test.ts`).

## 8. Doc updates (same delivery)

- `docs/COMBAT-ENGAGEMENT-AUDIT.md` — Direction B step 2 row in the implementation-status table; Direction B description tick.
- `docs/AGENT-READING-LIST.md` — audit row + spec table row.
