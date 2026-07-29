# OnyxLabyrinth Combat-Only Playtest — 2026-07-28

Art-director-adjacent **combat feel** review (Arena + forced boss/heavy pack).
Screenshots + logs: `playtest-screenshots/2026-07-28-combat-pass/` (gitignored).
Driver: `scripts/playtests/combat-only-pass-2026-07-28.mjs`.

**Harvest status (2026-07-28):**
| Rec | Status |
|-----|--------|
| 1 Differentiate technique / low-tier magic VFX | **Open** |
| 2 Grey out unusable palette slots | **Open** |
| 3 `ui:confirm` bufferMissing | **Open** |
| 4 Audio readiness before jump/boot combat | **Done** — `ensureAudioResumed` in `scripts/playtests/lib.mjs` (`2d749e3`); polls `readiness().audioCombat` |
| 5 Swirl-in visual identity first ~500ms | **Open** |

Implement brief: [`../FOLLOWUP-2026-07-28-COMBAT-ONLY-PASS.md`](../FOLLOWUP-2026-07-28-COMBAT-ONLY-PASS.md).

## 1. Executive take
**Ship-with-caveats.** The core loop — palette → target → choreography → damage pop → next actor — is solid and readable at Level 6 Arena difficulty: I never lost track of who was acting, who was hurt, or what an enemy had just done to me. The FF6-window chrome (windows, banners, flavor text on techniques) is genuinely polished. What's *not* there yet is presentation range: two of five verbs I tested (Magic, Technique) look almost identical in motion — banner + small burst + damage number — so a whole fight can read as "watch numbers appear over a static tableau" rather than a fight. Combat is a real asset, not the star yet, but close.

## 2. What sings
- **The enemy roster/turn-order panel** (bottom-left list, top-right queue) is excellent — `Name ×N` grouping, status tags rendered inline (`⚡Anti-Magic Field`, `PSN`), boss entries highlighted in orange. Confirmed on `wave2-02-spell-menu.png` and the boss fight — always legible even with 5 enemies.
- **Technique detail panel** (`wave3-02-technique-menu.png`) — cost, class restriction, range, and a flavor line ("A devastating overhead blow that sacrifices finesse for raw power") in the same window. This is the single best-designed screen I saw all session.
- **Status telegraphing** — "SILENCED" in bright magenta over a portrait, "GUARD" in cyan over a defending character, poison tag on the HP bar — all read instantly at a glance (`40-heavy-pack-start.png`, `wave5-02-defend.png`).
- **Boss presentation** — "The Dead Boy" nameplate banner + name/subtitle ("Forge of Ashes") + a distinct lava-cracked backdrop that's nowhere else in the trash waves (`51-boss-palette.png`). Display name matches shipped canon exactly.
- **Flee refusal** against a boss is instant and unambiguous: "Can't run away!" banner, no wasted turn (`52-boss-flee-attempt.png`).
- **Enemy abilities get player-grade presentation** — a Warlock's Anti-Magic Field cast gets the same top-banner treatment as a party spell (`wave4-02-item-menu.png`). Consistency, not a two-tier system.

## 3. What doesn't
- **[UX]** Magic and Technique VFX are visually interchangeable at this power tier: a small circular puff + a "1" damage number, whether it's Ember (fire) or a melee technique. Only the top banner text tells you what happened (`wave2-03-spell-vfx-1-f4.png` vs `wave3-03-technique-vfx-f3.png`). At level 6 this reads as undercooked, not intentional restraint.
- **[Content gap]** I never got a genuine "control" spell (sleep/silence/buff-the-party) into a caster's hand in five waves — only damage and one heal (Sacred Flame) surfaced. Can't speak to how control spells present; flagging as untested, not "fine."
- **[Bug, P2]** `ui:confirm`'s audio buffer reported `bufferMissing: true` consistently across every Arena wave in an otherwise fully warm session — the one persistent audio gap I could isolate cleanly.
- **[Bug, P1/P2 candidate]** The isolated boss encounter (via debug `jumpTo` straight into `forceEncounter`, no title-screen dwell) had **all three** fired cues (`bossAppear`, `miss`, `defend`) report `bufferMissing: true` — 100% miss rate, versus near-zero misses in the Arena run that went through the real title screen first. Pattern is consistent with sample buffers not finishing load before combat starts when the boot path skips normal UI dwell time. Flagging as a hypothesis, not confirmed — see Method note.
- **[UX/Taste]** The swirl-in transition (`01-arena-swirl-in-f2.png`) is a near-solid black frame with a faint darker ribbon for a good chunk of its duration — reads as a slow fade-through-black more than a "swirl," which undersells the moment of committing to a fight.
- **[Content gap]** Coda (Thief) never triggered the `attack_ranged` bow pose across any wave — default Arena loadout carries no long-range weapon, so this documented feature path went completely unexercised. Not a bug, but untested.

## 4. Verb report
**Great:**
1. **Attack** — fast, no ambiguity, target cursor always clear, resolves in one beat.
2. **Defend** — instant "GUARD" tag, zero friction, does exactly what it says.
3. **Item** — correctly shared across the party (potions depleted 2→1→0 across turns, "No items!" fired accurately once exhausted) — inventory-as-shared-resource reads clean.

**Empty/confusing:**
1. **Magic**, when the acting character can't cast — "No magic!" flashes, but a player still has to press the key and wait for the flash before falling back; a disabled/greyed palette slot would communicate this before the keypress.
2. **Technique** — mechanically fine, but its damage/impact visuals are indistinguishable from a plain attack once the banner scrolls past.
3. **Analyze** — functional but the "post-analyze" result state gave me nothing visually distinct to screenshot; if it's producing intel, it's not staging that intel memorably.

No class felt actively *worse* to pilot than another in this pass — Aria (Fighter) and Coda (Thief) both piloted cleanly; I didn't get enough clean turns on Dell/Eve specifically to judge caster feel beyond "casts resolve correctly."

## 5. Audiovisual report
- **Formation**: 5-enemy heavy pack (`40-heavy-pack-start.png`) shows real diagonal cascade as documented, but the top two enemies (a scythe-wielder and a red demon) visibly overlap at the stack's origin — partial occlusion of a mid-pack sprite, worth a look at 5+ enemy density specifically.
- **VFX quality variance**: confirmed real — Ember (fire) and Sacred Flame (a travelling white orb, `wave2-03-spell-vfx-2-f3.png`) both show actual charge→travel→impact; techniques and low-tier magic collapse to a generic puff. Quality is not uniform across the verb set.
- **SFX layering**: real evidence of distinct cue IDs per element (`elementFire`, `elementDivine`, `elementPhysical`) and per action type (`technique`, `itemUse`, `criticalHit`, `statusPoison`) firing correctly and in the right sequence relative to the visual beat, per the debug audio log. I could not judge *timbre* or punchiness headless — see Method note.
- **Swirl in/out**: in only as a near-black fade with a faint ribbon shape; didn't get a clean read on swirl-out since exits were driven via debug `exitDebugCombat` rather than a natural victory in most waves.
- **Windows vs. canvas**: no clipping or overlap observed between the FF6 windows and the combat canvas at any point, including 5-enemy and boss density.

## 6. Difficulty gut
- **Trash/mid (Arena L6, waves 1–5, 3–5 enemies each)**: soft. All five waves resolved in single-digit real turns with no character dropping below ~60% HP, and Attack alone cleared wave 1 with zero optimization.
- **Boss (The Dead Boy, level 10 via debug)**: didn't get a full sample — only one player turn was driven before the pass moved on — so no informed read on boss difficulty. Sample size: 1 turn, insufficient to call.
- Overall: five trash waves is a thin sample for a "soft/mean/interesting" verdict on trash balance generally, though consistent within this sample.

## 7. Top 5 combat recommendations
1. Differentiate technique/low-tier-magic impact VFX from plain attacks — right now the banner text is doing all the identification work.
2. Grey out (not just flash-reject) palette slots the current actor can't use — Cast when no spells, Item when empty — before the keypress, not after.
3. Investigate the `ui:confirm` buffer-missing gap; small but cleanly reproducible across every wave.
4. Check audio-sample readiness timing when combat starts immediately off a jump/boot with no title-screen dwell (matches the debug-boss-fight 100%-miss pattern) — if real players can hit an encounter this fast (e.g., a random encounter right after Continue), they'd hit silent SFX too.
5. Give the swirl-in transition more visual identity in its first ~500ms — right now it reads as a black fade, not a combat "swirl."

## 8. Bugs
- **P1 (unconfirmed, needs headed-browser repro):** All 3 audio cues in an isolated debug-jumped boss fight (`bossAppear`, `miss`, `defend`) reported `bufferMissing: true`; the same cue categories loaded fine in the Arena session that went through the title screen first. Repro: `jumpTo` → `forceEncounter({allowBoss:true})` immediately after fresh page load, then `sounds()`.
- **P2:** `ui:confirm` cue's buffer reported missing consistently across an entire Arena session (5 waves), while combat SFX buffers loaded fine in the same session.
- **P2 (curiosity, not confirmed):** `combat:bossPhase` cue fired during non-boss Arena waves (mundane enemies only, per the on-screen roster). Could be a legitimate elite-tier reuse of the same cue category rather than a bug — didn't chase further.

## 9. Method note
**Fought:** Arena at Level 6 (the picker's only viable "mid" option — 7/8 aren't selectable), 5 consecutive waves each emphasizing one verb (Attack/Magic/Technique/Item/Defend+Analyze), a forced 5-enemy heavy pack via `jumpTo`+`forceEncounter` on floor 4, one boss ("The Dead Boy") via the same debug route on floor 3 including a flee attempt, and a normal-speed-vs-Shift+Tab tempo A/B (baseline ~16.8s wall-clock per fight vs. ~9.8s with Shift held + Tab toggled — roughly 40% faster, both via 4-turn all-Attack fights so the comparison isn't verb-confounded).

**Skipped:** dungeon exploration, town, prologue/ending, two of the three floor bosses (Lonely Girl, Crying Man), a clean control-type spell sample, and any judgment of actual audio timbre/punchiness — this ran headless via Playwright, so cue *firing and sequencing* is verified from the debug audio log, but nothing was audible to judge quality.

**Known limitation:** the debug snapshot's `selection` field sometimes reflects the persistent turn-order sidebar rather than an open verb submenu, which initially looked like enemies appearing inside a spell list — resolved by reading the actual screenshots directly rather than trusting the JSON; flagging so this doesn't get mistaken for a real UI bug by a future reader of the raw logs.
