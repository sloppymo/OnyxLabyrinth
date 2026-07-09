@tool
extends EditorScript

## Run via: Tools → Execute Script
## Generates: res://assets/animations/swordshield_combat.tres
##
## SOURCE SHEET SPECS (measured, not guessed):
##   File: Sword_and_Shield_Fighter_Combat.png
##   Size: 128 x 640 px  |  RGBA
##   Frame: 32 x 32 px  ← DIFFERENT from non-combat (16x16)
##   Grid: 4 cols x 20 rows = 80 total frames
##   Each row = 4 animation frames for one direction
##
## WHY 32x32: The combat sheet stores sprites as 32x32 to accommodate weapon
##   reach — the sword and shield extend beyond the character body.
##   The 128px width / 32px = 4 animation frames per row. Clean divide. ✓
##   The 640px height / 32px = 20 rows.
##
## ANIMATION GROUPS (5 groups x 4 rows = 20 rows):
##   Rows 00-03  → GROUP A: ATTACK_1  (overhead swing)        frame diff ~31-33
##   Rows 04-07  → GROUP B: ATTACK_2  (diagonal/horizontal)   frame diff ~25-37
##   Rows 08-11  → GROUP C: ATTACK_3  (thrust/stab)           frame diff ~13-26
##   Rows 12-15  → GROUP D: HURT      (flinch reaction)       frame diff ~26-44
##   Rows 16-19  → GROUP E: SPECIAL   (fire/effect anim)      frame diff ~12-24
##
## DIRECTION ORDER — 4 DIRECTIONS per animation (not 8 like non-combat)
##   ⚠ VERIFY VISUALLY — directions could not be confirmed by pixel mass
##   Best estimate from visual inspection:
##   Row offset +0 = S  (toward viewer)
##   Row offset +1 = N  (away from viewer)
##   Row offset +2 = W  (left-facing)
##   Row offset +3 = E  (right-facing)
##
## NOTES ON MIXED SPRITE SIZES:
##   Non-combat AnimatedSprite2D: use these at scale 1.0, offset (0,0)
##   Combat AnimatedSprite2D: use at scale 1.0, offset (-8, -8)
##   This centers the 32x32 combat sprite relative to the 16x16 non-combat
##   character body. Tune as needed after visual check.

func _run():
	var tex_path := "res://assets/Sword_and_Shield_Fighter_Combat.png"
	var out_path := "res://assets/animations/swordshield_combat.tres"

	var texture := load(tex_path)
	if texture == null:
		push_error("Cannot load: " + tex_path + " — check file path")
		return

	var sf := SpriteFrames.new()
	sf.remove_animation("default")

	var fw := 32
	var fh := 32

	# [anim_name, start_row, num_frames, fps, loop]
	var animations := [
		# ── ATTACK_1: overhead sword swing ────────────────────
		# High animation energy (diff ~32). 4 frames: wind-up → apex → follow-through → recover
		["attack1_s",  0,  4, 10.0, false],
		["attack1_n",  1,  4, 10.0, false],
		["attack1_w",  2,  4, 10.0, false],
		["attack1_e",  3,  4, 10.0, false],
		# ── ATTACK_2: diagonal / horizontal slash ─────────────
		# Slightly higher energy (diff ~35). Wider arc than attack1.
		["attack2_s",  4,  4, 10.0, false],
		["attack2_n",  5,  4, 10.0, false],
		["attack2_w",  6,  4, 10.0, false],
		["attack2_e",  7,  4, 10.0, false],
		# ── ATTACK_3: thrust / stab (or block) ────────────────
		# Lower energy at end (R11 diff ~13) = recovery frame is near-static.
		["attack3_s",  8,  4,  8.0, false],
		["attack3_n",  9,  4,  8.0, false],
		["attack3_w", 10,  4,  8.0, false],
		["attack3_e", 11,  4,  8.0, false],
		# ── HURT: damage flinch reaction ──────────────────────
		# Highest animation energy in the sheet (diff ~40-44).
		# Frame 3 (R15 col 3) appears nearly static = recovery pose.
		["hurt_s",    12,  4,  8.0, false],
		["hurt_n",    13,  4,  8.0, false],
		["hurt_w",    14,  4,  8.0, false],
		["hurt_e",    15,  4,  8.0, false],
		# ── SPECIAL: fire/glow effect animation ───────────────
		# Distinctive orange/amber color palette — verify if this is:
		#   (a) a fire/magic special attack
		#   (b) a burning/status effect overlay
		#   (c) a victory or buff animation
		# R19 diff ~12 = final frame is nearly static (hold pose)
		["special_s", 16,  4,  8.0, false],
		["special_n", 17,  4,  8.0, false],
		["special_w", 18,  4,  8.0, false],
		["special_e", 19,  4,  8.0, false],
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
			sf.add_frame(anim_name, atlas)

	var err := ResourceSaver.save(sf, out_path)
	if err == OK:
		print("[OK] Saved: ", out_path)
		print("     Animations: ", sf.get_animation_names())
	else:
		push_error("ResourceSaver failed with code: " + str(err))
