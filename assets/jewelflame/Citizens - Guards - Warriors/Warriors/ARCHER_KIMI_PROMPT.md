# TASK: Implement Archer unit sprites in Godot 4.x

You are implementing the Archer unit for a Godot 4.x RTS game.
All analysis has already been done. You are an executor, not an analyst.
Do not re-examine the PNGs. All measurements are in this prompt.
Do not deviate from the specs. Do not ask clarifying questions. Just build it.

---

## PROJECT ROOT

```
Godot project root:  /home/sloppymo/jewelflame/
res:// maps to:      /home/sloppymo/jewelflame/
```

---

## FILES IN THIS DIRECTORY (source files, already on disk)

```
/home/sloppymo/jewelflame/assets/Citizens - Guards - Warriors/Warriors/Archer_Combat.png
/home/sloppymo/jewelflame/assets/Citizens - Guards - Warriors/Warriors/Archer_Non-Combat.png
/home/sloppymo/jewelflame/assets/Citizens - Guards - Warriors/Warriors/gen_archer_non_combat_frames.gd
/home/sloppymo/jewelflame/assets/Citizens - Guards - Warriors/Warriors/gen_archer_combat_frames.gd
/home/sloppymo/jewelflame/assets/Citizens - Guards - Warriors/Warriors/archer_unit.gd
```

---

## VERIFIED SPECS — HARDCODED, DO NOT RECALCULATE

```
Non-Combat PNG:  64 x 496 px  |  RGBA  |  16 x 16 px per frame  |  4 cols x 31 rows
Combat PNG:     128 x 256 px  |  RGBA  |  32 x 32 px per frame  |  4 cols x 8 rows
```

The combat sheet uses 32×32 frames to accommodate bow reach beyond the character body.
This is intentional and confirmed by pixel measurement.

---

## CRITICAL FACTS ABOUT THE COMBAT SHEET

This is different from the Sword & Shield combat sheet. Read carefully.

**Mirror rows (mathematically confirmed, flipped_diff = 0.0):**
- Row 01 is Row 00 flipped horizontally — they are 100% identical when mirrored
- Row 05 is Row 04 flipped horizontally — same
- The artist stored mirrored directions as separate rows rather than using Godot's flip

**Only 8 rows total (not 20 like Sword & Shield):**
- Rows 00-03 = SHOOT (4 directions)
- Rows 04-05 = HURT (1 direction + mirror)
- Rows 06-07 = DEATH (2 distinct directions)

**Arrow release frame = frame index 2:**
- Frames 0-1 = draw/aim (no arrow visible)
- Frames 2-3 = release (white arrow pixels measured: [0, 0, 8, 6] per row)
- Deal ranged damage when animation reaches frame 2, not at animation_finished

---

## STEP 1 — CREATE DIRECTORY STRUCTURE

```bash
mkdir -p "/home/sloppymo/jewelflame/assets/animations"
mkdir -p "/home/sloppymo/jewelflame/tools"
mkdir -p "/home/sloppymo/jewelflame/units"
mkdir -p "/home/sloppymo/jewelflame/tests"
```

(These may already exist from Sword & Shield setup. mkdir -p is safe to re-run.)

---

## STEP 2 — COPY FILES INTO PROJECT

```bash
cp "/home/sloppymo/jewelflame/assets/Citizens - Guards - Warriors/Warriors/gen_archer_non_combat_frames.gd" \
   "/home/sloppymo/jewelflame/tools/gen_archer_non_combat_frames.gd"

cp "/home/sloppymo/jewelflame/assets/Citizens - Guards - Warriors/Warriors/gen_archer_combat_frames.gd" \
   "/home/sloppymo/jewelflame/tools/gen_archer_combat_frames.gd"

cp "/home/sloppymo/jewelflame/assets/Citizens - Guards - Warriors/Warriors/archer_unit.gd" \
   "/home/sloppymo/jewelflame/units/archer_unit.gd"
```

After copying, res:// paths are:
```
res://assets/Citizens - Guards - Warriors/Warriors/Archer_Non-Combat.png
res://assets/Citizens - Guards - Warriors/Warriors/Archer_Combat.png
res://tools/gen_archer_non_combat_frames.gd
res://tools/gen_archer_combat_frames.gd
res://units/archer_unit.gd
```

---

## STEP 3 — SET PNG IMPORT SETTINGS

Write these .import sidecar files next to the PNGs:

**`/home/sloppymo/jewelflame/assets/Citizens - Guards - Warriors/Warriors/Archer_Non-Combat.png.import`**

```ini
[remap]

importer="texture"
type="CompressedTexture2D"
uid="uid://archer_nc"
path="res://.godot/imported/Archer_Non-Combat.png-archer_nc.ctex"
metadata={
"vram_texture": false
}

[deps]

source_file="res://assets/Citizens - Guards - Warriors/Warriors/Archer_Non-Combat.png"
dest_files=["res://.godot/imported/Archer_Non-Combat.png-archer_nc.ctex"]

[params]

compress/mode=0
compress/high_quality=false
compress/lossy_quality=0.7
compress/normal_map=0
compress/channel_pack=0
mipmaps/generate=false
mipmaps/limit=-1
roughness/mode=0
roughness/src_normal=""
process/fix_alpha_border=true
process/premult_alpha=false
process/normal_map_invert_y=false
process/hdr_as_srgb=false
process/hdr_clamp_exposure=false
process/size_limit=0
detect_3d/compress_to=1
svg/scale=1.0
editor/scale_with_editor_scale=false
editor/convert_colors_with_editor_theme=false
```

**`/home/sloppymo/jewelflame/assets/Citizens - Guards - Warriors/Warriors/Archer_Combat.png.import`**

```ini
[remap]

importer="texture"
type="CompressedTexture2D"
uid="uid://archer_co"
path="res://.godot/imported/Archer_Combat.png-archer_co.ctex"
metadata={
"vram_texture": false
}

[deps]

source_file="res://assets/Citizens - Guards - Warriors/Warriors/Archer_Combat.png"
dest_files=["res://.godot/imported/Archer_Combat.png-archer_co.ctex"]

[params]

compress/mode=0
compress/high_quality=false
compress/lossy_quality=0.7
compress/normal_map=0
compress/channel_pack=0
mipmaps/generate=false
mipmaps/limit=-1
roughness/mode=0
roughness/src_normal=""
process/fix_alpha_border=true
process/premult_alpha=false
process/normal_map_invert_y=false
process/hdr_as_srgb=false
process/hdr_clamp_exposure=false
process/size_limit=0
detect_3d/compress_to=1
svg/scale=1.0
editor/scale_with_editor_scale=false
editor/convert_colors_with_editor_theme=false
```

---

## STEP 4 — CREATE THE UNIT SCENE

Create `/home/sloppymo/jewelflame/units/archer_unit.tscn`:

```
[gd_scene load_steps=4 format=3 uid="uid://archer_unit_scene"]

[ext_resource type="Script" path="res://units/archer_unit.gd" id="1_script"]

[sub_resource type="CircleShape2D" id="1_circle"]
radius = 10.0

[node name="ArcherUnit" type="CharacterBody2D"]
script = ExtResource("1_script")

[node name="CollisionShape2D" type="CollisionShape2D" parent="."]
shape = SubResource("1_circle")

[node name="Troop_0" type="AnimatedSprite2D" parent="."]

[node name="Troop_1" type="AnimatedSprite2D" parent="."]

[node name="Troop_2" type="AnimatedSprite2D" parent="."]

[node name="Troop_3" type="AnimatedSprite2D" parent="."]

[node name="Troop_4" type="AnimatedSprite2D" parent="."]
```

Rules:
- Do NOT assign SpriteFrames in the scene file — script loads both at runtime
- Do NOT set positions — script sets formation positions in _ready()
- Do NOT set offsets — script manages offsets when switching sprite sheets
- Node names must be EXACTLY `Troop_0` through `Troop_4`

---

## STEP 5 — CREATE THE TEST SCENE

Create `/home/sloppymo/jewelflame/tests/archer_test.tscn`:

```
[gd_scene load_steps=3 format=3 uid="uid://archer_test_scene"]

[ext_resource type="PackedScene" path="res://units/archer_unit.tscn" id="1_unit"]
[ext_resource type="Script" path="res://tests/archer_test.gd" id="2_script"]

[node name="ArcherTest" type="Node2D"]
script = ExtResource("2_script")

[node name="HUD" type="Label" parent="."]
position = Vector2(10, 10)
text = "Keys: [1] -1 troop  [2] -2 troops  [3] shoot  [4] hurt  [R] reset  [LClick] move  [RClick] fire-at"

[node name="ArcherUnit" parent="." instance=ExtResource("1_unit")]
position = Vector2(200, 200)
```

Create `/home/sloppymo/jewelflame/tests/archer_test.gd`:

```gdscript
extends Node2D

@onready var unit: ArcherUnit = $ArcherUnit

func _ready() -> void:
	print("Archer test ready. Troops: ", unit.current_troops)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed:
		match event.keycode:
			KEY_1:
				unit.take_damage(20)
				print("Troops remaining: ", unit.current_troops)
			KEY_2:
				unit.take_damage(40)
				print("Troops remaining: ", unit.current_troops)
			KEY_3:
				unit.set_state(ArcherUnit.State.ATTACKING)
				print("Shoot triggered — watch for arrow at frame 2")
			KEY_4:
				unit.set_state(ArcherUnit.State.HURT)
				print("Hurt triggered")
			KEY_R:
				get_tree().reload_current_scene()

	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_LEFT:
			unit.move_toward_target(get_global_mouse_position())
			print("Moving to: ", get_global_mouse_position())
		elif event.button_index == MOUSE_BUTTON_RIGHT:
			unit.fire_at(get_global_mouse_position())
			print("Firing at: ", get_global_mouse_position())
```

---

## STEP 6 — CREATE THE VALIDATION SCRIPT

Create `/home/sloppymo/jewelflame/tools/validate_archer.gd`:

```gdscript
@tool
extends EditorScript

func _run() -> void:
	var checks := [
		"res://assets/Citizens - Guards - Warriors/Warriors/Archer_Non-Combat.png",
		"res://assets/Citizens - Guards - Warriors/Warriors/Archer_Combat.png",
		"res://assets/animations/archer_non_combat.tres",
		"res://assets/animations/archer_combat.tres",
		"res://units/archer_unit.gd",
		"res://units/archer_unit.tscn",
		"res://tests/archer_test.tscn",
	]

	var all_ok := true
	for path in checks:
		if ResourceLoader.exists(path):
			print("[OK]      ", path)
		else:
			print("[MISSING] ", path)
			all_ok = false

	if all_ok:
		print("\n✓ All files present. Run the test scene.")
	else:
		print("\n✗ Some files missing. See above.")

	var nc = load("res://assets/animations/archer_non_combat.tres")
	if nc:
		var anims := nc.get_animation_names()
		print("\nNon-combat animations (", anims.size(), " — expected 31):")
		for a in anims:
			print("  ", a, " — ", nc.get_frame_count(a), " frames")

	var co = load("res://assets/animations/archer_combat.tres")
	if co:
		var anims := co.get_animation_names()
		print("\nCombat animations (", anims.size(), " — expected 8):")
		for a in anims:
			print("  ", a, " — ", co.get_frame_count(a), " frames")
```

---

## STEP 7 — GENERATE THE SPRITEFRAMES RESOURCES

⚠ Requires Godot editor. Cannot be done from command line.

```
# IN ORDER, inside the Godot editor:

1. Open project at /home/sloppymo/jewelflame/

2. Tools → Execute Script → res://tools/gen_archer_non_combat_frames.gd → Run
   Expected: [OK] Saved: res://assets/animations/archer_non_combat.tres

3. Tools → Execute Script → res://tools/gen_archer_combat_frames.gd → Run
   Expected: [OK] Saved: res://assets/animations/archer_combat.tres

4. Tools → Execute Script → res://tools/validate_archer.gd → Run
   Expected: [OK] for all 7 paths, 31 non-combat animations, 8 combat animations

5. Open res://tests/archer_test.tscn → F5 to run
```

---

## ANIMATION REFERENCE

**Non-combat (16×16, 8 directions each):**
```
idle_[dir]    6 fps  loop    subtle bow-hold sway
walk_[dir]    8 fps  loop    walking stride with bow
walk2_[dir]   8 fps  loop    second stride cycle
death_[dir]   6 fps  no loop falling animation
death_corpse  2 fps  no loop near-static hold (pixel diff = 3.3)
death_prone_* 6 fps  no loop lying flat (Y center ~10.2)
```

**Combat (32×32, limited directions):**
```
shoot_[e/w/s/n]  10 fps  no loop  frames 0-1=aim, frames 2-3=arrow release
hurt_[e/w]        8 fps  no loop  flinch reaction, no bow visible
death_[s/n]       6 fps  no loop  collapse animation
```

**Direction fallback logic (baked into archer_unit.gd):**
- hurt only has e/w — n and s fall back to s and e respectively
- death only has s/n — diagonals fall back to nearest cardinal
- Non-combat death only has 7 of 8 directions — diagonals mirror each other

---

## CRITICAL CONSTRAINTS

1. **DO NOT hand-edit .tres files.** Generated by ResourceSaver only.

2. **DO NOT change frame sizes.** 16×16 non-combat, 32×32 combat. Pixel-measured.

3. **DO NOT reposition dead troops.** Static gaps are intentional.
   `_sync_troop_visibility()` handles this. Add no repositioning logic.

4. **DO NOT modify archer_unit.gd** unless fixing a syntax error. It is complete.

5. **Arrow damage at frame 2, not animation_finished.** The `_check_arrow_frame()`
   method in the script handles this. Do not move damage dealing to animation_finished.

6. **shoot_w is a genuine mirror, not an error.** The artist stored horizontal flips
   as separate rows. The SpriteFrames resource treats them as normal animations.
   Do not try to generate shoot_w by flipping shoot_e in code — it's already in the sheet.

7. **Spaces in the asset path are real.** `Citizens - Guards - Warriors` is the
   literal directory name. Do not escape or normalize it.

---

## EXPECTED FILE TREE WHEN DONE

```
/home/sloppymo/jewelflame/
├── assets/
│   ├── Citizens - Guards - Warriors/
│   │   └── Warriors/
│   │       ├── Archer_Non-Combat.png              ← stays here
│   │       ├── Archer_Non-Combat.png.import        ← you write this
│   │       ├── Archer_Combat.png                  ← stays here
│   │       └── Archer_Combat.png.import            ← you write this
│   └── animations/
│       ├── archer_non_combat.tres                 ← generated by EditorScript
│       └── archer_combat.tres                     ← generated by EditorScript
├── tools/
│   ├── gen_archer_non_combat_frames.gd            ← copied
│   ├── gen_archer_combat_frames.gd                ← copied
│   └── validate_archer.gd                         ← you write this
├── units/
│   ├── archer_unit.gd                             ← copied, do not modify
│   └── archer_unit.tscn                           ← you write this
└── tests/
    ├── archer_test.tscn                           ← you write this
    └── archer_test.gd                             ← you write this
```

---

## SUCCESS CRITERIA

1. `validate_archer.gd` prints `[OK]` for all 7 paths
2. Non-combat: 31 animations, 4 frames each
3. Combat: 8 animations, 4 frames each
4. Test scene shows 5 archers in V-formation playing `idle_s`
5. `[1]` → one archer disappears, gap stays empty, others keep animating
6. `[3]` → all visible archers play shoot animation; console prints "Arrow released!" at frame 2
7. Right-click → unit faces click target and fires
8. No blurry sprites (Nearest filter in Import dock)

**Failure checklist:**
- `[MISSING] archer_*.tres` → EditorScripts not run yet
- Blurry sprites → Import dock not Nearest; reimport both PNGs
- `Invalid get index 'Troop_0'` → node names wrong in .tscn
- `Cannot load` in EditorScript → PNG path not patched in gen scripts
- Arrow damage fires at wrong time → `_check_arrow_frame()` not being called;
  confirm `_physics_process` runs while in ATTACKING state
- shoot_n shows wrong direction → rotate direction labels in gen_archer_combat_frames.gd
  by one slot and re-run (30-second fix)
