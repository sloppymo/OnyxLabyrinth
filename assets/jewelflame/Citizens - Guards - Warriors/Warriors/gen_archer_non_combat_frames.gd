@tool
extends EditorScript

## Run via: Tools → Execute Script
## Generates: res://assets/animations/archer_non_combat.tres
##
## SOURCE SHEET SPECS (pixel-measured):
##   File: Archer_Non-Combat.png
##   Size: 64 x 496 px  |  RGBA
##   Frame: 16 x 16 px
##   Grid: 4 cols x 31 rows = 124 total frames
##
## STRUCTURE — identical layout to Sword_and_Shield_Fighter_Non-Combat.png:
##   Rows 00-07  → IDLE   (8 directions × 4 frames)
##   Rows 08-15  → WALK   (8 directions × 4 frames)
##   Rows 16-23  → WALK2  (8 directions × 4 frames)
##   Rows 24-30  → DEATH  (7 rows — see breakdown below)
##
## DIRECTION ORDER within each 8-row group (confirmed by pixel mass analysis):
##   offset +0 = S    offset +1 = N    offset +2 = SE   offset +3 = NE
##   offset +4 = E    offset +5 = W    offset +6 = SW   offset +7 = NW
##   E/W confirmed: R20 X-centers shift right (7.9→11.0), R21 shift left (7.1→4.0)
##
## DEATH ROW BREAKDOWN:
##   Row 24 = death_s     Row 25 = death_n     Row 26 = death_se   Row 27 = death_sw
##   Row 28 = death_corpse (pixel diff 3.3 — near-static hold frame)
##   Row 29 = death_prone_s   Row 30 = death_prone_n  (Y center ~10.2 — lying flat)

func _run() -> void:
	var tex_path := "res://assets/Citizens - Guards - Warriors/Warriors/Archer_Non-Combat.png"
	var out_path := "res://assets/animations/archer_non_combat.tres"

	var texture := load(tex_path)
	if texture == null:
		push_error("Cannot load texture: " + tex_path)
		push_error("Check that the PNG is at this res:// path and has been imported.")
		return

	var sf := SpriteFrames.new()
	sf.remove_animation("default")

	var fw := 16
	var fh := 16

	# [anim_name, start_row, num_frames, fps, loop]
	var animations: Array = [
		# ── IDLE ──────────────────────────────────────────────────────────────
		["idle_s",        0,  4, 6.0, true],
		["idle_n",        1,  4, 6.0, true],
		["idle_se",       2,  4, 6.0, true],
		["idle_ne",       3,  4, 6.0, true],
		["idle_e",        4,  4, 6.0, true],
		["idle_w",        5,  4, 6.0, true],
		["idle_sw",       6,  4, 6.0, true],
		["idle_nw",       7,  4, 6.0, true],
		# ── WALK ──────────────────────────────────────────────────────────────
		["walk_s",        8,  4, 8.0, true],
		["walk_n",        9,  4, 8.0, true],
		["walk_se",      10,  4, 8.0, true],
		["walk_ne",      11,  4, 8.0, true],
		["walk_e",       12,  4, 8.0, true],
		["walk_w",       13,  4, 8.0, true],
		["walk_sw",      14,  4, 8.0, true],
		["walk_nw",      15,  4, 8.0, true],
		# ── WALK2 (verify in-engine: second stride phase or run gait) ─────────
		["walk2_s",      16,  4, 8.0, true],
		["walk2_n",      17,  4, 8.0, true],
		["walk2_se",     18,  4, 8.0, true],
		["walk2_ne",     19,  4, 8.0, true],
		["walk2_e",      20,  4, 8.0, true],   # E confirmed: X mass shifts rightward
		["walk2_w",      21,  4, 8.0, true],   # W confirmed: X mass shifts leftward
		["walk2_sw",     22,  4, 8.0, true],
		["walk2_nw",     23,  4, 8.0, true],
		# ── DEATH ─────────────────────────────────────────────────────────────
		["death_s",      24,  4, 6.0, false],
		["death_n",      25,  4, 6.0, false],
		["death_se",     26,  4, 6.0, false],
		["death_sw",     27,  4, 6.0, false],
		["death_corpse", 28,  4, 2.0, false],  # pixel diff = 3.3 — near-static
		["death_prone_s",29,  4, 6.0, false],  # Y center ~10.2 — lying flat
		["death_prone_n",30,  4, 6.0, false],
	]

	for anim_data in animations:
		var anim_name   : String = anim_data[0]
		var start_row   : int    = anim_data[1]
		var num_frames  : int    = anim_data[2]
		var fps         : float  = anim_data[3]
		var should_loop : bool   = anim_data[4]

		sf.add_animation(anim_name)
		sf.set_animation_speed(anim_name, fps)
		sf.set_animation_loop(anim_name, should_loop)

		for col in range(num_frames):
			var atlas := AtlasTexture.new()
			atlas.atlas = texture
			atlas.region = Rect2(col * fw, start_row * fh, fw, fh)
			atlas.filter_clip = true
			sf.add_frame(anim_name, atlas)

	var err := ResourceSaver.save(sf, out_path)
	if err == OK:
		print("[OK] Saved: ", out_path)
		print("     Total animations: ", sf.get_animation_names().size())
	else:
		push_error("ResourceSaver failed with code: " + str(err))
		push_error("Make sure res://assets/animations/ directory exists.")
