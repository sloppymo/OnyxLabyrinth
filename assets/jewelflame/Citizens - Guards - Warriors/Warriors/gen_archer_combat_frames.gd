@tool
extends EditorScript

## Run via: Tools → Execute Script
## Generates: res://assets/animations/archer_combat.tres
##
## SOURCE SHEET SPECS (pixel-measured):
##   File: Archer_Combat.png
##   Size: 128 x 256 px  |  RGBA
##   Frame: 32 x 32 px   ← larger than non-combat to fit bow reach
##   Grid: 4 cols x 8 rows = 32 total frames
##
## CRITICAL FINDING — MIRROR ROWS:
##   R00 vs R01: flipped_diff = 0.0  → R01 is R00 horizontally mirrored (100% confirmed)
##   R04 vs R05: flipped_diff = 0.0  → R05 is R04 horizontally mirrored (100% confirmed)
##   R02 vs R03: flipped_diff = 37.3 → DISTINCT poses (not mirrors)
##   R06 vs R07: flipped_diff = 37.5 → DISTINCT poses (not mirrors)
##
##   This means the sheet encodes 4 shoot directions as: E, W(mirror), S, N
##   And 2 hurt directions as: one direction + its horizontal mirror
##
## ANIMATION GROUPS:
##   Rows 00-03  → SHOOT   (4 directions: E, W, S, N)
##   Rows 04-05  → HURT    (2 directions + mirror)
##   Rows 06-07  → DEATH   (2 distinct directions)
##
## DIRECTION ASSIGNMENTS (best estimate — verify visually):
##   Row 00 = shoot_e   (archer facing right, bow raised, arrow fires right)
##   Row 01 = shoot_w   (horizontal mirror of row 00)
##   Row 02 = shoot_s   (archer shooting toward viewer/downward)
##   Row 03 = shoot_n   (archer shooting away from viewer/upward)
##   Row 04 = hurt_e    (flinch, right-facing)
##   Row 05 = hurt_w    (mirror of row 04)
##   Row 06 = death_s   (collapse, front-facing)
##   Row 07 = death_n   (collapse, back-facing or second direction)
##
## ARROW FLASH FRAMES:
##   Frames 0-1 = draw/aim (no arrow visible)
##   Frames 2-3 = release (white arrow pixels present: [0,0,8,6] per row)
##   Use frame 2 as the damage-dealing "impact frame" in your state machine.
##
## SPRITE SIZE NOTE:
##   Non-combat frames: 16×16 — use offset (0, 0)
##   Combat frames:     32×32 — use offset (-8, -8) to center on character body
##   The archer's bow extends ~8px beyond the body in each direction.

func _run() -> void:
	var tex_path := "res://assets/Citizens - Guards - Warriors/Warriors/Archer_Combat.png"
	var out_path := "res://assets/animations/archer_combat.tres"

	var texture := load(tex_path)
	if texture == null:
		push_error("Cannot load texture: " + tex_path)
		return

	var sf := SpriteFrames.new()
	sf.remove_animation("default")

	var fw := 32
	var fh := 32

	# [anim_name, start_row, num_frames, fps, loop]
	var animations: Array = [
		# ── SHOOT: frames 0-1 = draw/aim, frames 2-3 = release with arrow flash ──
		# Deal damage when animation reaches frame index 2.
		["shoot_e",   0,  4, 10.0, false],   # confirmed by white pixels in frames 2-3
		["shoot_w",   1,  4, 10.0, false],   # mirror of shoot_e (flipped_diff = 0.0)
		["shoot_s",   2,  4, 10.0, false],   # distinct pose (flipped_diff = 39.6 vs row 3)
		["shoot_n",   3,  4, 10.0, false],   # distinct pose
		# ── HURT: flinch reaction — no bow visible, clear recoil ─────────────────
		# Low frame diff (~17.6) compared to shoot (~37-40) = subtle reaction.
		["hurt_e",    4,  4,  8.0, false],
		["hurt_w",    5,  4,  8.0, false],   # mirror of hurt_e (flipped_diff = 0.0)
		# ── DEATH: collapse animation — 2 distinct directions ────────────────────
		["death_s",   6,  4,  6.0, false],
		["death_n",   7,  4,  6.0, false],
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
