# Agent reading list — current product docs

Use this list before acting on playtest, balance, combat UX, or perk work. Prefer these over older one-off prompts when they conflict.

**Last refreshed:** 2026-07-13 (added combat-flow follow-up prompt; combat-depth already shipped)

| Doc | Role | Status |
|-----|------|--------|
| [`AGENTS.md`](../AGENTS.md) | Hard engine rules, file map, pitfalls | **Authoritative** for code constraints |
| [`CLAUDE.md`](../CLAUDE.md) | Commands, architecture orientation | Authoritative; defers to AGENTS.md for `src/` rules |
| [`ARENA-REVIEW.md`](../ARENA-REVIEW.md) | Arena backdrop math/architecture review | Current (2026-07-13). W1 (dual camera) still open |
| [`PLAYTEST-DESIGN-REVIEW.md`](../PLAYTEST-DESIGN-REVIEW.md) | Design-facing playtest (Arena + town + dungeon) | Findings kept; **Status notes** section flags what code already changed |
| [`PLAYTEST-REPORT.md`](../PLAYTEST-REPORT.md) | Earlier E2E polish report | Footer/`T` claims are **stale** (dynamic `menuHintText` + `t` shortcut shipped); mobile map still lower priority |
| [`POLISH-ISSUES-PROMPT.md`](../POLISH-ISSUES-PROMPT.md) | Prompt for footer + mobile map | Footer/`T` part obsolete; mobile map still lower priority than combat flow |
| [`FOLLOWUP-COMBAT-UX-PERKS-PROMPT.md`](FOLLOWUP-COMBAT-UX-PERKS-PROMPT.md) | Late combat UX + perk delivery | **Done 2026-07-13** |
| [`FOLLOWUP-CASTER-ENDGAME-PROMPT.md`](FOLLOWUP-CASTER-ENDGAME-PROMPT.md) | T6–T7 caster verbs | **Done 2026-07-13 (Path A)** |
| [`FOLLOWUP-COMBAT-DEPTH-PROMPT.md`](FOLLOWUP-COMBAT-DEPTH-PROMPT.md) | Status/flee + wireable perks + DoT/regen (art only if needed) | **Done 2026-07-13** (see work-order item 5 for what shipped) |
| [`FOLLOWUP-COMBAT-FLOW-PROMPT.md`](FOLLOWUP-COMBAT-FLOW-PROMPT.md) | Combat tempo: target defaults, playback skip/speed, sticky Repeat | **Done 2026-07-13** (A–C + D1/D2/D3 + E party Auto shipped; encounter density still separate) |
| Design canvas (IDE) | `onyxlabyrinth-design-analysis.canvas.tsx` | Mechanics & balance judgment (2026-07-13) |

## Specs under `docs/superpowers/specs/`

| Spec | Use for | Caveat |
|------|---------|--------|
| `2026-07-11-class-perks-design.md` | Perk tiers, intended effects, flow | Numbers are placeholders; see **Implementation status** section in that doc |
| `2026-07-11-melee-techniques-design.md` | Rage / technique identity | Check `src/data/techniques.ts` for shipped kit |
| `2026-07-11-spell-expansion-design.md` | Spell corpus intent | Live spells stop at **tier 5**; unlock formula can open T6–T7 with no content |
| `2026-07-14-arena-renderer-design.md` | Arena room camera & rasterizers | Synced to shipped defaults 2026-07-13 |
| `2026-07-07-combat-select-action-dom-design.md` | FF6 windows DOM | Older; verify against `combat-select-action-view.ts` |

## Known stale claims (do not re-assert)

- ~~“No floor currently uses `events`”~~ — floors 1–3 all have `events` arrays in `floors.ts`.
- ~~“Arena L9 always starts on floor-1 trash”~~ — `main.ts` sets `arenaStartFloor = min(3, max(1, ceil(level/4)))` (L9 → floor 3). Re-verify before changing Arena scaling.
- ~~“Temple has no Remove Curse”~~ — `[R] Remove Curse` appears when cursed gear is equipped (`town-ui.ts`).
- Perk overlay “never implemented for Arena” — **false**; `endCombat` opens it for Arena when `pendingPerkChoices.length > 0`. Playtest likely auto-Enter dismissed it.

## Recommended work order (from design analysis)

1. ~~Late combat UX (L9+ spell scroll + description panel; technique name truncation).~~ **Done 2026-07-13** (scroll-follow + position counter + wrapped names + `T` shortcut).
2. ~~Perk overlay reliability (prove Arena + dungeon) + wire-or-honestly-stub `TODO(v1.1)` perks.~~ **Done 2026-07-13** (explicit ←/→+Enter confirmation guard; 11 perks gained function: Glass Cannon, Saint regen, Backstab, Assassin, Riposte, Retribution, Impale, plus damage-taken wiring activating Phalanx/Vanguard/Sentinel/Berserker's penalty; still-inert perks now say "(Not yet implemented — v1.1.)" in their UI copy; 22 `TODO(v1.1)` comment markers remain in `data/perks.ts`).
3. ~~Caster endgame verbs (fill T6–T7 or change unlock curve).~~ **Done 2026-07-13 (Path A):** Mage gains Meteor Swarm + Disintegrate at T6 and Freezing Sphere at T7; Priest gains Mass Regenerate (T6) and Holy Aura (T7) — design-doc verbs on existing effect kinds (DoT / armor-pen / Time Stop deferred). `levelUpChar` also caps unlocks at `maxContentSpellTier()` so empty tiers cannot recur.
4. Encounter density / Arena feel (only after re-checking current floor scaling).
5. ~~Status / flee as real levers.~~ **Done 2026-07-13** ([`FOLLOWUP-COMBAT-DEPTH-PROMPT.md`](FOLLOWUP-COMBAT-DEPTH-PROMPT.md)):
   - **Flee lever:** `thief-smoke-bomb` wired — flee auto-succeeds while living party HP < 30% (never vs bosses); `smokeBombFleeActive` in `combat.ts`, covered by `perks.test.ts`.
   - **Status readability:** FF6 windows now show compact colored tags (PSN/PAR/SLP/BLD/BRN/RGN) inside the name span of party and enemy rows (`combat-select-action-view.ts`, `.ff6-status-tag` in `styles.css`).
   - **Perks wired this pass (13):** Healer's Touch (+30% heal), Revival (res to 50% HP), Turn Undead / Judge / Inquisitor-damage-half (undead/demon multipliers via new `{ kind: "demon" }` enemy tag), Reach Mastery (flat 2 AC ignore), Brace (60% Defend), Juggernaut status immunity, Swindler shop discount (applied in `town-ui.ts` `buyPrice`), Chain Caster, Perfect Timing, Swashbuckler double-strike, Dark Templar lifesteal, Smoke Bomb. Descriptions updated; partial perks say which half works.
   - **Spell DoT/regen engine:** `SpellEffect` damage/heal gained optional `followup` (`dot` | `regen`); tracked on `CombatState.enemyDots`/`regenBuffs`, ticked in end-of-round status processing with `statusTick`/`spellEffect` events (burn pops orange, regen pops green). `mage-meteor-swarm` now applies 10/round fire burn ×3; `priest-mass-regenerate` 8/round regen ×3; new single-target `priest-regenerate` (T3). DoT ticks respect elemental resist/weakness.
   - **Remaining honest stubs:** 10 `TODO(v1.1)` markers in `data/perks.ts` (resistance/reflect/silence-immunity/steal-economy/party-wide-aura shapes that need new systems).
   - **No new art generated** — burn reuses the existing `fire_explosion` burst (orange-tinted `STATUS_STYLES.burn`); regen reuses the heal family. Phase D criteria never triggered.
6. **Combat flow / tempo.** ~~Prefer [`FOLLOWUP-COMBAT-FLOW-PROMPT.md`](FOLLOWUP-COMBAT-FLOW-PROMPT.md)~~ **Done 2026-07-13:** A–C tempo UX; Phase D: `incapacitated` event banner, SP/Rage menu line, hit recoil+flash; Phase E: `Q` party Auto (last command, never Flee/Item; Attack/Defend fallback). Encounter density stays #4.
