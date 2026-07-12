# LLM Playtest Prompt: Arena Mode + VFX/Sprite Audit

## Your goal

Playtest the **Arena mode** of **OnyxLabyrinth** (a Wizardry-style first-person dungeon crawler, TypeScript + Vite, hand-built DOM + 2D canvas combat). Record every spell and technique you can trigger, note whether its visual effect is **distinct** or a **generic fallback**, and verify that all newly downloaded sprite assets are actually being used.

This is a visual audit, not a balance audit. You are checking:
1. Every spell has a unique or appropriate VFX.
2. Every melee technique has visible feedback.
3. New sprite strips from `~/Downloads/Spell Effects/` appear in-game.
4. Nothing renders as a black box, missing texture, or stuck fallback.

---

## Setup

1. The repo is at `/home/sloppymo/OnyxLabyrinth/`.
2. Run a production preview:
   ```bash
   cd /home/sloppymo/OnyxLabyrinth
   npm run build
   npx vite preview --port 5176 --base /OnyxLabyrinth/
   ```
3. Open the URL it prints (usually `http://localhost:5176/OnyxLabyrinth/`).

---

## How to access Arena mode

From the title screen, press **A** to select **Arena**, then confirm with **Enter**.

Arena starts the party at a higher level than a fresh dungeon run and throws consecutive enemy waves at you. This is the fastest way to exercise spells and techniques without dungeon exploration.

---

## Reference: where VFX are configured

Read these files before you start, or have them open while testing:

- `src/engine/combat-scene.ts` — `SPELL_OVERRIDES` and `ELEMENT_STYLES` map spells to sprite names.
- `src/engine/effect-sprite-cache.ts` — `EFFECT_STRIPS` lists every sprite strip the engine knows how to load.
- `public/assets/effects/` — the actual sprite PNGs currently shipped.
- `src/data/spells.ts` — all Mage/Priest spells; ignore `mage-wayfinder`, `mage-levitate`, and `priest-light` (they are dungeon-only).
- `src/data/techniques.ts` — all melee techniques for Fighter/Thief/Halberdier/Duelist/Crusader.

---

## Expected new sprite coverage

The downloaded packs are in `~/Downloads/Spell Effects/`:

- **Pixelart Spells** by DevWizard — `Pixelart Spells/PNG Files/`
- **Magic Pack 9** by ansimuz — `Magic Pack 9 files/`
- **Foozle Pixel Magic Effects** — `Foozle_2DE0001_Pixel_Magic_Effects/`

After integration, the shipped strips in `public/assets/effects/` should include (non-exhaustive):

| Prefix | Source pack | Example files |
|--------|-------------|---------------|
| `px_` | Pixelart Spells | `px_fireball.png`, `px_ice_lance.png`, `px_light_bolt.png`, `px_shield.png`, `px_magic_sparks.png`, `px_darkness_orb.png`, `px_bolt_purity.png` |
| `mp_` | Magic Pack 9 | `mp_fire_bomb.png`, `mp_lightning.png`, `mp_spark.png`, `mp_dark_bolt.png` |
| `fz_` | Foozle | `fz_fireball.png`, `fz_explosion.png`, `fz_molten_spear.png`, `fz_portal.png`, `fz_portal_orange.png`, `fz_portal_gold.png` |

**Verify:** every name referenced in `SPELL_OVERRIDES` exists as a key in `EFFECT_STRIPS`, and every `EFFECT_STRIPS` key has a matching PNG in `public/assets/effects/`.

---

## Test procedure

### Phase 1 — Spell inventory pass

Build a party that includes at least:
- One **Mage**
- One **Priest**
- One **Fighter** / **Thief** / **Halberdier** / **Duelist** / **Crusader** (one of each if possible)

In Arena, let enemies live long enough for you to cast each spell category:

#### Mage damage spells
- `mage-fire-bolt`, `mage-ember`
- `mage-frostbite`
- `mage-spark`
- `mage-poison-spray`
- `mage-burning-hands` (group)
- `mage-fireball` (all enemies)
- `mage-cone-of-cold` (group)
- `mage-ice-storm` (all)
- `mage-immolate`

For each, record:
- Does it show a **projectile**?
- Does it show an **impact/burst**?
- Does it show a **field/zone** for group/all spells?
- Is the effect visually distinct from the generic `fireball` / `ice_burst` / `red_energy` fallbacks?
- Any black boxes, flickering, or sprites that never animate?

#### Mage disable / utility spells
- `mage-sleep`
- `mage-hold-person`
- `mage-web`
- `mage-silence`
- `mage-dispel-magic`
- `mage-arcane-ward`
- `mage-spell-shield`

#### Mage summons
- `mage-lesser-summon`
- `mage-summon-fire-elemental`
- `mage-conjure-elemental`
- `mage-gate`

#### Priest damage spells
- `priest-sacred-flame`
- `priest-guiding-bolt`
- `priest-divine-smite`
- `priest-sunburst`

#### Priest heals / cures
- `priest-cure-wounds`
- `priest-cure-serious`
- `priest-cure-critical`
- `priest-heal`
- `priest-mass-cure`
- `priest-mass-heal`
- `priest-neutralize-poison`

#### Priest buffs / shields / summons
- `priest-shield-of-faith`
- `priest-bless`
- `priest-summon-guardian`
- `priest-summon-celestial-guardian`
- `priest-summon-celestial`

### Phase 2 — Technique pass

Trigger every technique you can reach from the combat **Tech** menu:

- **Fighter**: Power Attack, Shield Bash, Taunt, Whirlwind, Crushing Blow, Battle Cry
- **Thief**: Quick Slash, Feint, Poison Blade, Caltrops, Throat Slash, Shadow Strike
- **Halberdier**: Sweep, Brace, Impale, Pike Wall, Pole Vault, Phalanx Break
- **Duelist**: Lunge, Riposte, Flurry, Disarm, Perfect Strike, Blade Storm
- **Crusader**: Smite, Lay on Hands, Judgment, Aura of Protection, Banishing Strike, Divine Wrath

For each technique, record:
- Does a **banner** with the technique name appear?
- Does the actor play an **attack animation**?
- Does the target show a **hit flash / damage popup**?
- For status-inflicting techniques (e.g., Shield Bash, Poison Blade), does a status VFX appear?
- For buff/heal techniques (e.g., Battle Cry, Lay on Hands, Aura of Protection), does a buff VFX appear?
- Do multi-hit techniques (Flurry, Blade Storm) show multiple impacts?
- Do row/column techniques (Sweep, Impale, Pike Wall) hit the correct number of targets visually?

### Phase 3 — Sprite coverage audit

1. List every key in `EFFECT_STRIPS` (`src/engine/effect-sprite-cache.ts`).
2. List every PNG in `public/assets/effects/`.
3. List every sprite name referenced in `SPELL_OVERRIDES` (`src/engine/combat-scene.ts`).
4. Cross-check:
   - Any `SPELL_OVERRIDES` name missing from `EFFECT_STRIPS`? → **broken VFX**
   - Any `EFFECT_STRIPS` key with no PNG file? → **missing asset**
   - Any PNG file with no `EFFECT_STRIPS` entry? → **unused asset**
   - Any downloaded asset from `~/Downloads/Spell Effects/` not copied/registered? → **integration gap**

### Phase 4 — Visual defects

While running the above, watch for:
- **Black boxes** where a sprite should be (usually a missing/corrupt PNG or wrong frame size).
- **Sprites that don't animate** (static single frame for a multi-frame strip).
- **Giant or tiny sprites** (scale wrong).
- **Misaligned projectiles** (fired from wrong actor, hitting wrong target).
- **Fields that cover the wrong area** (too small/large, wrong position).
- **Z-order issues** (effect drawn behind actors).
- **Fallback effects** (generic `red_energy`, `fireball`, `ice_burst`) on spells that should have custom VFX.

---

## How to force specific spells/techniques in Arena

If RNG makes it hard to see a spell, remember:
- Arena waves are pre-defined; advancing waves gives different enemy formations.
- You can restart Arena from the title screen.
- The fastest way to cast many spells is to keep a Priest/Mage alive and let weaker enemies survive.
- If a technique requires a prerequisite (e.g., Shadow Strike from Hide), set up the prerequisite first.

---

## Report template

Produce a markdown report with these sections:

```markdown
# Arena VFX Playtest Report

## Summary
- Total spells tested: X / Y
- Total techniques tested: X / Y
- New sprite strips registered: X
- New sprite strips actually seen in-game: X
- Critical issues: N
- Minor issues: N

## Spell-by-spell findings
| Spell | Expected VFX | Seen? | Distinct? | Notes |
|-------|--------------|-------|-----------|-------|
| mage-ember | px_fireball + fz_explosion | Yes | Yes | Looks good |
| ... | ... | ... | ... | ... |

## Technique-by-technique findings
| Technique | Banner? | Hit FX? | Status/Buff FX? | Notes |
|-----------|---------|---------|-----------------|-------|
| Power Attack | Yes | Yes | N/A | ... |
| ... | ... | ... | ... | ... |

## Sprite coverage audit
### Used in SPELL_OVERRIDES and registered
- px_fireball, fz_explosion, mp_fire_bomb, ...

### Registered but not referenced by any spell
- (list)

### Referenced but missing from EFFECT_STRIPS / public/assets/effects/
- (list — these are broken)

### Downloaded assets not yet integrated
- (list files/folders from ~/Downloads/Spell Effects/)

## Visual defects
1. **[Severity]** Description + spell/technique + screenshot if possible.

## Recommendations
1. ...
```

---

## Constraints

- Do **not** change game logic, combat math, or encounter rates.
- Do **not** remove existing effects (fog, glow, vignette, CRT scanlines).
- If you find broken/missing sprites, file findings but do not commit code changes unless asked.
- Always include **spell/technique name** and **screenshot path** for every visual issue.
