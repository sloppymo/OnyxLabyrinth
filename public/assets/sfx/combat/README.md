# Combat sound effects

Combat SFX samples sourced from a **Final Fantasy VI** (SNES) sound-effect
rip. Unlike `public/assets/sfx/ui/README.md`, this file does not claim any
license or permission from Square Enix — none has been independently
verified for this set. These are copyrighted assets from a commercial game;
treat their presence here as the project owner's own risk assessment, not a
cleared asset pack.

| File | Combat moment | Source pack name |
|------|----------------|-------------------|
| `attack-hit.wav` | Physical hit (attack/ambush/technique, non-crit) | `A8SwordSlash.wav` |
| `critical-hit.wav` | Physical critical hit | `DAFlailHit.wav` |
| `miss.wav` | Attack/technique evaded or missed | `0DMiss.wav` |
| `defend.wav` | Defend action | `A0BlockShield.wav` |
| `enemy-defeated.wav` | Non-boss enemy destroyed | `2DMonsterDeath.wav` |
| `boss-defeated.wav` | Boss destroyed | `F2BossDeath.wav` |
| `party-knocked-out.wav` | Party member reaches 0 HP | `BEDeathToll.wav` |
| `revived.wav` | Ally revived (item/spell) | `1EPhoenixDown.wav` (trimmed) |
| `flee.wav` | Successful flee | `04RunAway.wav` |
| `fizzle.wav` | Spell fizzles (silence/antimagic/fizzle field) | `35BreakSpell.wav` (trimmed) |
| `poison-tick.wav` | Poison damage tick | `20Poison.wav` |
| `burn-tick.wav` | Burn DoT tick | `16Fire1.wav` |
| `heal-cast.wav` | Heal spell/item resolves | `7DHealingSound.wav` (trimmed) |
| `buff-cast.wav` | Armor/screen buff spell | `45Shell.wav` (trimmed) |
| `summon-cast.wav` | Summon spell | `67EsperShining.wav` (trimmed) |
| `debuff-cast.wav` | Enemy debuff effect | `6FRetort.wav` |
| `status-sleep.wav` | Sleep inflicted | `41MultipleTing.wav` (trimmed) |
| `status-paralysis.wav` | Paralysis inflicted | `68Snare.wav` (trimmed) |
| `status-blind.wav` | Blind inflicted | `71EerieWave.wav` (trimmed) |
| `status-poison.wav` | Poison inflicted | `22Bio.wav` |
| `element-fire.wav` | Fire-element cast | `19Fire3.wav` |
| `element-cold.wav` | Cold-element cast | `18Ice1.wav` |
| `element-lightning.wav` | Lightning-element cast | `15Bolt3.wav` |
| `element-water.wav` | Water-element cast | `CEWaterSplash.wav` |
| `element-earth.wav` | Earth-element cast | `A5Earthquake.wav` (trimmed) |
| `element-wind.wav` | Wind-element cast | `6EWind.wav` |
| `element-divine.wav` | Divine/undead-element cast | `02WhiteMagic.wav` |
| `element-physical.wav` | Non-elemental physical spell (e.g. Disintegrate) | `0CLaserAtk.wav` (trimmed) |
| `technique.wav` | Melee technique activation | `C9SwdTech.wav` |
| `item-use.wav` | Consumable item used in combat | `34CurativeItem.wav` (trimmed) |
| `boss-appear.wav` | Boss encounter begins | `EFBossAppearingEscaping.wav` |
| `boss-phase.wav` | Boss crosses a phase threshold / telegraphs | `DFCharge.wav` (trimmed) |
| `silence.wav` | Enemy silences a party member | `58Vanish.wav` (trimmed) |
| `analyze.wav` | Analyze verb used | `09Scan.wav` |
| `encounter-start.wav` | Random encounter begins (non-boss) | `C1Encounter.wav` |

Mapping was done from filenames only — no audio playback was available while
selecting these, so some (particularly the status/element picks, which had
no exact-name match) are best-guesses and may not fit once heard. Swap freely.

`element-*`/status/buff-debuff files that came from long (2.5s+) source
clips were trimmed to ~1.3-2.0s with a short fade-out via ffmpeg so they fit
the game's fast, non-gated combat pace; everything else is untouched.
