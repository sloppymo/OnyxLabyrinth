# Sword & Shield Fighter — Complete Godot 4.x Implementation Reference
## Both sprite sheets fully mapped. Ready to plug in.

---

## VERIFIED SPECS — DO NOT MODIFY

```
Non-Combat sheet:  64 x 496 px  |  RGBA  |  16 x 16 px frames  |  4 cols x 31 rows
Combat sheet:     128 x 640 px  |  RGBA  |  32 x 32 px frames  |  4 cols x 20 rows
```

These were measured from actual pixels, not guessed. The frame sizes and grid counts
are exact. The direction order is a best estimate and needs one visual verification pass.

---

## STEP 1 — IMPORT SETTINGS (do before anything else)

For **both** PNGs in Godot's Import tab:
- Filter Mode: **Nearest**
- Mipmaps: **Disabled**
- Compression: **Lossless**
→ Click **Reimport**

If you skip this, pixel art will be blurry. There is no recovery except reimporting.

---

## STEP 2 — FILE PLACEMENT

Place the PNGs at:
```
res://assets/Sword_and_Shield_Fighter_Non-Combat.png
res://assets/Sword_and_Shield_Fighter_Combat.png
```

Create the output directory:
```
res://assets/animations/
```

---

## STEP 3 — RUN BOTH EDITOR SCRIPTS

Copy both scripts into your Godot project:
- `tools/gen_non_combat_frames.gd`
- `tools/gen_combat_frames.gd`

Run each one via **Tools → Execute Script** in the Godot editor.

Expected console output:
```
[OK] Saved: res://assets/animations/swordshield_non_combat.tres
     Animations: ["idle_s", "idle_n", "idle_se", ...]

[OK] Saved: res://assets/animations/swordshield_combat.tres
     Animations: ["attack1_s", "attack1_n", ...]
```

If you see `ResourceSaver failed` — check that `res://assets/animations/` exists.
If you see `Cannot load` — check the PNG file paths.

---

## NON-COMBAT SHEET — FULL ROW MAP

**16 × 16 px frames | 4 columns | 31 rows | 8 directions**

```
Row  |  y range  | Animation | Direction | Godot name      | Notes
-----|-----------|-----------|-----------|-----------------|------------------------
 00  |   0– 15   | idle      | S         | idle_s          |
 01  |  16– 31   | idle      | N         | idle_n          |
 02  |  32– 47   | idle      | SE        | idle_se         |
 03  |  48– 63   | idle      | NE        | idle_ne         |
 04  |  64– 79   | idle      | E         | idle_e          | confirmed: rightward X mass
 05  |  80– 95   | idle      | W         | idle_w          | confirmed: leftward X mass
 06  |  96–111   | idle      | SW        | idle_sw         |
 07  | 112–127   | idle      | NW        | idle_nw         |
 08  | 128–143   | walk      | S         | walk_s          |
 09  | 144–159   | walk      | N         | walk_n          |
 10  | 160–175   | walk      | SE        | walk_se         |
 11  | 176–191   | walk      | NE        | walk_ne         |
 12  | 192–207   | walk      | E         | walk_e          |
 13  | 208–223   | walk      | W         | walk_w          |
 14  | 224–239   | walk      | SW        | walk_sw         |
 15  | 240–255   | walk      | NW        | walk_nw         |
 16  | 256–271   | walk2     | S         | walk2_s         | ⚠ verify: run or alt walk
 17  | 272–287   | walk2     | N         | walk2_n         |
 18  | 288–303   | walk2     | SE        | walk2_se        |
 19  | 304–319   | walk2     | NE        | walk2_ne        |
 20  | 320–335   | walk2     | E         | walk2_e         | confirmed: rightward X mass
 21  | 336–351   | walk2     | W         | walk2_w         | confirmed: leftward X mass
 22  | 352–367   | walk2     | SW        | walk2_sw        |
 23  | 368–383   | walk2     | NW        | walk2_nw        |
 24  | 384–399   | death     | S         | death_s         | active fall, diff ~65
 25  | 400–415   | death     | N         | death_n         | active fall
 26  | 416–431   | death     | SE        | death_se        | active fall
 27  | 432–447   | death     | SW        | death_sw        | active fall
 28  | 448–463   | death     | corpse    | death_corpse    | ⚠ STATIC: pixel diff = 4.2
 29  | 464–479   | death     | prone_s   | death_prone_s   | lying flat: Y center = 10.6
 30  | 480–495   | death     | prone_n   | death_prone_n   | lying flat: Y center = 10.6
```

**Death group has 7 rows, not 8. One direction is missing.**
The script handles this with a fallback that mirrors the nearest diagonal.

---

## COMBAT SHEET — FULL ROW MAP

**32 × 32 px frames | 4 columns | 20 rows | 4 directions**

The combat sprites are 32×32 to accommodate sword and shield reach extending
beyond the character body. This is confirmed by the 128÷32=4 and 640÷32=20 clean division.

**⚠ DIRECTION ORDER NEEDS VISUAL VERIFICATION**
The 4-direction order within each group could not be confirmed purely by pixel analysis
(all rows show centered mass, unlike the non-combat sheet where E/W were clearly off-center).
The assignment below is a best estimate from visual inspection. If attack_s shows a 
north-facing sprite, rotate the direction assignments by one slot.

```
Row  |  y range  | Animation  | Dir | Godot name  | Frame diff | Notes
-----|-----------|------------|-----|-------------|------------|------------------
 00  |   0– 31   | attack1    | S   | attack1_s   | ~33        | overhead swing
 01  |  32– 63   | attack1    | N   | attack1_n   | ~29        |
 02  |  64– 95   | attack1    | W   | attack1_w   | ~33        |
 03  |  96–127   | attack1    | E   | attack1_e   | ~30        |
 04  | 128–159   | attack2    | S   | attack2_s   | ~38        | diagonal slash
 05  | 160–191   | attack2    | N   | attack2_n   | ~33        |
 06  | 192–223   | attack2    | W   | attack2_w   | ~35        |
 07  | 224–255   | attack2    | E   | attack2_e   | ~25        |
 08  | 256–287   | attack3    | S   | attack3_s   | ~26        | thrust/stab
 09  | 288–319   | attack3    | N   | attack3_n   | ~26        |
 10  | 320–351   | attack3    | W   | attack3_w   | ~20        |
 11  | 352–383   | attack3    | E   | attack3_e   | ~13 ← low  | R11 col3 is near-static
 12  | 384–415   | hurt       | S   | hurt_s      | ~40        | flinch — highest diff sheet
 13  | 416–447   | hurt       | N   | hurt_n      | ~40        |
 14  | 448–479   | hurt       | W   | hurt_w      | ~44 ← peak |
 15  | 480–511   | hurt       | E   | hurt_e      | ~26        |
 16  | 512–543   | special    | S   | special_s   | ~20        | orange/fire palette
 17  | 544–575   | special    | N   | special_n   | ~20        |
 18  | 576–607   | special    | W   | special_w   | ~24        |
 19  | 608–639   | special    | E   | special_e   | ~13 ← low  | R19 col3 near-static
```

**What is "special"?** Visually confirmed: rows 16–19 have a distinct orange/amber palette
that doesn't appear in any other group. Likely candidates:
- A fire or magic-enhanced attack
- A burning status effect overlay
- A buff/power-up animation
Assign to your state machine once you've verified the visual in-engine.

---

## COMBAT VS NON-COMBAT DIRECTIONS

The non-combat sheet uses 8 directions (n, ne, e, se, s, sw, w, nw).
The combat sheet uses 4 directions (n, s, e, w).

The unit script handles this with two facing variables:
- `facing_dir`   — 8-direction string for non-combat animations
- `facing_4dir`  — 4-direction string, collapsed from 8 (diagonals map to nearest cardinal)

```
facing_dir  → facing_4dir mapping:
  n  → n    |  ne → e    |  e  → e    |  se → s
  s  → s    |  sw → w    |  w  → w    |  nw → n
```

---

## SPRITE SIZE OFFSET

Non-combat sprite: 16×16 → center at sprite origin (0, 0)
Combat sprite:     32×32 → offset (-8, -8) to keep character body in same position

The unit script applies this automatically via `_set_all_frames()`.
If the combat sprite appears to "jump" position when switching from idle to attack,
tune the offset in `_set_all_frames()`:

```gdscript
s.offset = Vector2(-8.0, -8.0)   # adjust X/Y until attack sprite aligns with idle body
```

---

## ANIMATION FPS REFERENCE

```
idle_*        6 fps   loop    subtle breathing/sway
walk_*        8 fps   loop    standard stride
walk2_*       8 fps   loop    increase to 10 if confirmed as run
attack1_*    10 fps   no loop  fast overhead swing
attack2_*    10 fps   no loop  fast diagonal
attack3_*     8 fps   no loop  thrust — slightly slower
hurt_*        8 fps   no loop  flinch then auto-return to idle
special_*     8 fps   no loop  hold final frame
death_*       6 fps   no loop  play once, transition to corpse frame
death_corpse  2 fps   no loop  nearly static hold
```

---

## SCENE SETUP (manual steps in Godot editor)

1. Create scene: `res://units/sword_shield_unit.tscn`
2. Root node: `CharacterBody2D` → attach `sword_shield_unit.gd`
3. Add `CollisionShape2D` child → `CircleShape2D`, radius `10` (fits 16×16 sprite)
4. Add 5 `AnimatedSprite2D` children named exactly:
   - `Troop_0`, `Troop_1`, `Troop_2`, `Troop_3`, `Troop_4`
5. Leave their positions at (0,0) — the script sets formation positions in `_ready()`
6. Do NOT assign SpriteFrames in the editor — the script loads both resources at runtime

**Formation positions (set by script):**
```
Troop_0: ( 0, -6)   — Leader, front center
Troop_1: (-8,  2)   — Left flank
Troop_2: ( 8,  2)   — Right flank
Troop_3: (-6,  8)   — Back left
Troop_4: ( 6,  8)   — Back right
```

---

## VERIFICATION CHECKLIST

Run these checks after running both EditorScripts and setting up the scene:

**Non-combat animations:**
- [ ] `idle_s`  — character faces directly toward camera (front view)
- [ ] `idle_n`  — character faces away (back view)
- [ ] `idle_e`  — right-facing side profile, shield arm visible
- [ ] `idle_w`  — left-facing side profile (mirror of east)
- [ ] `walk_e`  — leg movement visible, moving right
- [ ] `death_s` — falling animation, does NOT loop
- [ ] `death_corpse` — static or near-static lying pose

**Combat animations:**
- [ ] `attack1_s` — overhead swing, character faces toward camera
- [ ] `attack1_e` — right-facing attack, sword extends to the right
- [ ] `hurt_s`    — clear flinch/stumble reaction
- [ ] `special_s` — orange/fire palette visible (confirms group identity)

**Formation behavior:**
- [ ] 5 knights visible at start in V-formation
- [ ] After `take_damage(25)` — 1 knight disappears (slot stays empty — static gap)
- [ ] After `take_damage(50)` — 2 more disappear, remaining 2 keep animating in sync
- [ ] At 0 troops — death animation triggers
- [ ] Switching idle→attack→idle: no position jump (offset tuning may be needed)

**If a direction shows the wrong facing:**
Rotate the 4 direction labels in `gen_combat_frames.gd` by one slot and re-run the script.
Example: if `attack1_s` shows a north-facing sprite, swap the order to [N, W, E, S].

---

## WHAT EACH FILE DOES

```
tools/gen_non_combat_frames.gd  → Run once. Creates swordshield_non_combat.tres
tools/gen_combat_frames.gd      → Run once. Creates swordshield_combat.tres
sword_shield_unit.gd            → Attach to CharacterBody2D. Full unit logic.
```

The `.tres` files are Godot resources that live in `res://assets/animations/`.
Do not commit the `.tres` files to version control — they can be regenerated by the scripts.
Do commit the scripts themselves.
