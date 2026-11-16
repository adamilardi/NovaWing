extends Node3D

# NovaWing 2 engine comparison: all collisions remain circles on the XY plane.
# Z, banking, and the scenery are presentation only, so visual depth cannot dodge a shot.
const LEFT := -8.7
const RIGHT := 8.7
const TOP := 4.8
const BOTTOM := -4.8
const WAVE_SECONDS := 60.0
const PLAYER_SPEED := 6.8
const BULLET_SPEED := 14.0
const ENEMY_SCENES := {
	"scout": preload("res://scenes/enemy_scout.tscn"),
	"swarm": preload("res://scenes/enemy_swarm.tscn"),
	"chaser": preload("res://scenes/enemy_chaser.tscn"),
	"diver": preload("res://scenes/enemy_diver.tscn"),
	"asteroid": preload("res://scenes/enemy_asteroid.tscn"),
	"mine": preload("res://scenes/enemy_mine.tscn")
}
const BOSS_SCENE := preload("res://scenes/boss_ship.tscn")
const PICKUP_SCENE := preload("res://scenes/pickup.tscn")

@export var level_config: NW2LevelConfig

var rng := RandomNumberGenerator.new()
var phase := "waves"
var elapsed := 0.0
var spawn_clock := 0.0
var shot_clock := 0.0
var boss_clock := 0.0
var iframe_clock := 0.0
var debug_clock := 0.0
var visual_clock := 0.0
var score := 0
var shots_fired := 0
var boss_spawned := false
var boss_defeated := false
var wave_limit := WAVE_SECONDS
var hp := 3
var max_hp := 3
var boost := 100.0
var weapon_rank := 1
var shield := 0
var bomb_stock := 0
var auto_fire := false
var paused := false
var player: Node3D
var player_spawn_position := Vector3(-5.4, 0.0, 1.0)
var enemy_entry: Marker3D
var boss_entry: Marker3D
var pickup_schedule: Array[NW2PickupMarker] = []
var boss: Node3D
var boss_hp := 100.0
var boss_max_hp := 100.0
var enemies: Array = []
var bullets: Array = []
var pickups: Array = []
var particles: Array = []
var stars: Array = []
var decor: Array = []
var touch_move_id := -1
var touch_target := Vector2.ZERO
var touch_firing := false
var touch_boost := false
var touch_fire_ids: Dictionary = {}
var powerup_index := 0
var wave_index := 0
var top_label: Label
var status_label: Label
var hint_label: Label
var center_label: Label
var boss_label: Label
var pause_button: Button
var restart_button: Button
var boost_button: Button
var fire_button: Button
var bomb_button: Button

func _ready() -> void:
	rng.seed = 901710
	player = $PlayerShip
	player_spawn_position = player.position
	max_hp = int(player.get("max_health"))
	enemy_entry = $GameplayMarkers/EnemyEntry
	boss_entry = $GameplayMarkers/BossEntry
	$EditorPreview_HiddenAtRuntime.visible = false
	for marker in $GameplayMarkers/PickupBeats.get_children():
		if marker is NW2PickupMarker:
			pickup_schedule.append(marker)
	pickup_schedule.sort_custom(func(a: NW2PickupMarker, b: NW2PickupMarker) -> bool: return a.at_second < b.at_second)
	for star in get_tree().get_nodes_in_group("scroll_star"):
		stars.append({"node": star, "speed": star.get_meta("scroll_speed", 1.0)})
	for rock in get_tree().get_nodes_in_group("scroll_decor"):
		decor.append({"node": rock, "speed": rock.get_meta("scroll_speed", 0.6)})
	wave_limit = level_config.wave_seconds
	_build_ui()
	_reset_game()
	if OS.has_feature("web"):
		var requested_limit = JavaScriptBridge.eval("Number(new URLSearchParams(location.search).get('testWaves'))", true)
		if typeof(requested_limit) == TYPE_FLOAT or typeof(requested_limit) == TYPE_INT:
			if requested_limit >= 3.0 and requested_limit < 60.0:
				wave_limit = float(requested_limit)

func _mat(color: Color, glow := false) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.metallic = 0.18
	material.roughness = 0.48
	if glow:
		material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		material.emission_enabled = true
		material.emission = color
	return material

func _mesh(parent: Node3D, mesh: Mesh, color: Color, at: Vector3, rotation_z := 0.0, glow := false) -> MeshInstance3D:
	var part := MeshInstance3D.new()
	part.mesh = mesh
	part.material_override = _mat(color, glow)
	part.position = at
	part.rotation.z = rotation_z
	parent.add_child(part)
	return part

func _box(parent: Node3D, size: Vector3, color: Color, at: Vector3, rotation_z := 0.0, glow := false) -> MeshInstance3D:
	var shape := BoxMesh.new()
	shape.size = size
	return _mesh(parent, shape, color, at, rotation_z, glow)

func _sphere(parent: Node3D, radius: float, color: Color, at: Vector3, glow := false) -> MeshInstance3D:
	var shape := SphereMesh.new()
	shape.radius = radius
	shape.height = radius * 2.0
	shape.radial_segments = 8
	shape.rings = 4
	return _mesh(parent, shape, color, at, 0.0, glow)

func _label(parent: Control, text_value: String, pos: Vector2, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = text_value
	label.position = pos
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	parent.add_child(label)
	return label

func _button(parent: Control, text_value: String, pos: Vector2, size: Vector2) -> Button:
	var button := Button.new()
	button.text = text_value
	button.position = pos
	button.size = size
	button.add_theme_font_size_override("font_size", 19)
	button.focus_mode = Control.FOCUS_NONE
	parent.add_child(button)
	return button

func _build_ui() -> void:
	var canvas := CanvasLayer.new()
	add_child(canvas)
	var ui := Control.new()
	ui.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	canvas.add_child(ui)
	var top_bar := ColorRect.new()
	top_bar.color = Color(0.006, 0.018, 0.045, 0.84)
	top_bar.position = Vector2.ZERO
	top_bar.size = Vector2(1280, 124)
	top_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui.add_child(top_bar)
	var bottom_bar := ColorRect.new()
	bottom_bar.color = Color(0.006, 0.018, 0.045, 0.76)
	bottom_bar.position = Vector2(0, 661)
	bottom_bar.size = Vector2(1280, 59)
	bottom_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui.add_child(bottom_bar)
	top_label = _label(ui, "", Vector2(24, 16), 24, Color(0.75, 0.94, 1.0))
	status_label = _label(ui, "", Vector2(24, 53), 18, Color(0.48, 0.82, 0.94))
	hint_label = _label(ui, "WASD / arrows: fly     SPACE: fire     SHIFT: boost     B: bomb     P: pause     R: restart", Vector2(24, 675), 16, Color(0.63, 0.81, 0.98))
	center_label = _label(ui, "", Vector2(394, 248), 34, Color(1.0, 0.93, 0.65))
	boss_label = _label(ui, "", Vector2(620, 16), 24, Color(1.0, 0.53, 0.53))
	pause_button = _button(ui, "PAUSE", Vector2(1092, 18), Vector2(150, 48))
	pause_button.pressed.connect(_toggle_pause)
	restart_button = _button(ui, "RESTART", Vector2(1092, 76), Vector2(150, 45))
	restart_button.pressed.connect(_reset_game)
	boost_button = _button(ui, "BOOST", Vector2(24, 582), Vector2(140, 65))
	boost_button.button_down.connect(func() -> void: touch_boost = true)
	boost_button.button_up.connect(func() -> void: touch_boost = false)
	fire_button = _button(ui, "FIRE", Vector2(1092, 570), Vector2(150, 78))
	fire_button.button_down.connect(func() -> void: touch_firing = true)
	fire_button.button_up.connect(func() -> void: touch_firing = false)
	bomb_button = _button(ui, "BOMB", Vector2(925, 590), Vector2(148, 58))
	bomb_button.pressed.connect(_use_bomb)

func _clear_entities() -> void:
	for group in [enemies, bullets, pickups, particles]:
		for item in group:
			var node: Node3D = item["node"]
			node.queue_free()
		group.clear()
	if is_instance_valid(boss):
		boss.queue_free()
	boss = null

func _reset_game() -> void:
	_clear_entities()
	phase = "waves"
	elapsed = 0.0
	spawn_clock = level_config.first_wave_delay
	shot_clock = 0.0
	boss_clock = 0.0
	iframe_clock = 0.0
	debug_clock = 0.0
	visual_clock = 0.0
	score = 0
	shots_fired = 0
	boss_spawned = false
	boss_defeated = false
	hp = max_hp
	boost = 100.0
	weapon_rank = 1
	shield = 0
	bomb_stock = 0
	paused = false
	get_tree().paused = false
	player.position = player_spawn_position
	player.visible = true
	player.rotation = Vector3.ZERO
	boss_hp = boss_max_hp
	powerup_index = 0
	wave_index = 0
	touch_move_id = -1
	touch_firing = false
	touch_boost = false
	touch_fire_ids.clear()
	center_label.text = ""
	_update_hud()

func _toggle_pause() -> void:
	if phase == "won" or phase == "lost":
		return
	paused = not paused
	center_label.text = "PAUSED" if paused else ""
	pause_button.text = "RESUME" if paused else "PAUSE"
	_update_hud()

func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_P:
			_toggle_pause()
		elif event.keycode == KEY_R:
			_reset_game()
		elif event.keycode == KEY_B:
			_use_bomb()
		elif event.keycode == KEY_F:
			auto_fire = not auto_fire
	if event is InputEventScreenTouch:
		if event.pressed:
			if _touch_on_button(event.position):
				return
			if event.position.x < get_viewport().get_visible_rect().size.x * 0.54 and touch_move_id < 0:
				touch_move_id = event.index
				touch_target = _touch_world(event.position)
			else:
				touch_fire_ids[event.index] = true
		else:
			if event.index == touch_move_id:
				touch_move_id = -1
			touch_fire_ids.erase(event.index)
	elif event is InputEventScreenDrag and event.index == touch_move_id:
		touch_target = _touch_world(event.position)

func _touch_on_button(screen_pos: Vector2) -> bool:
	for button in [pause_button, restart_button, boost_button, fire_button, bomb_button]:
		if button.get_global_rect().has_point(screen_pos):
			return true
	return false

func _touch_world(screen_pos: Vector2) -> Vector2:
	var size := get_viewport().get_visible_rect().size
	return Vector2(lerp(LEFT, RIGHT, screen_pos.x / max(1.0, size.x)), lerp(TOP, BOTTOM, screen_pos.y / max(1.0, size.y)))

func _process(delta: float) -> void:
	var dt := minf(delta, 0.05)
	visual_clock += dt
	_update_scenery(dt)
	if paused or phase == "won" or phase == "lost":
		_publish_debug(dt)
		return
	elapsed += dt
	iframe_clock = maxf(0.0, iframe_clock - dt)
	shot_clock -= dt
	_move_player(dt)
	if (Input.is_key_pressed(KEY_SPACE) or touch_firing or not touch_fire_ids.is_empty() or auto_fire) and shot_clock <= 0.0:
		_fire_player()
		shot_clock = 0.17 if weapon_rank > 1 else 0.21
	if phase == "waves":
		_update_waves(dt)
		if elapsed >= wave_limit:
			_start_boss()
	elif phase == "boss":
		_update_boss(dt)
	_update_enemies(dt)
	_update_bullets(dt)
	_update_pickups(dt)
	_update_particles(dt)
	_update_hud()
	_publish_debug(dt)

func _move_player(dt: float) -> void:
	var direction := Vector2.ZERO
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
		direction.x -= 1.0
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		direction.x += 1.0
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
		direction.y += 1.0
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
		direction.y -= 1.0
	if touch_move_id >= 0:
		var difference := touch_target - Vector2(player.position.x, player.position.y)
		if difference.length() > 0.16:
			direction = difference.normalized()
	var boosting := (Input.is_key_pressed(KEY_SHIFT) or touch_boost) and boost > 1.0
	if boosting:
		boost = maxf(0.0, boost - dt * 34.0)
	else:
		boost = minf(100.0, boost + dt * 10.0)
	if direction.length_squared() > 1.0:
		direction = direction.normalized()
	var speed := PLAYER_SPEED * (1.65 if boosting else 1.0)
	player.position.x = clampf(player.position.x + direction.x * speed * dt, LEFT, RIGHT - 1.0)
	player.position.y = clampf(player.position.y + direction.y * speed * dt, BOTTOM, TOP)
	player.rotation.x = lerpf(player.rotation.x, -direction.y * 0.23, 0.12)
	player.rotation.y = lerpf(player.rotation.y, -direction.x * 0.28, 0.12)
	player.visible = iframe_clock <= 0.0 or int(iframe_clock * 12.0) % 2 == 0

func _fire_player() -> void:
	shots_fired += 1
	var spread := [-0.24, 0.24] if weapon_rank >= 2 else [0.0]
	for offset in spread:
		_create_bullet(Vector2(player.position.x + 0.8, player.position.y + offset), Vector2(BULLET_SPEED, offset * 1.5), true, 2.0 if weapon_rank >= 3 else 1.0)
	if weapon_rank >= 3:
		_create_bullet(Vector2(player.position.x + 0.7, player.position.y), Vector2(BULLET_SPEED, 0.0), true, 1.0)

func _create_bullet(where: Vector2, velocity: Vector2, friendly: bool, damage: float) -> void:
	var node := Node3D.new()
	add_child(node)
	node.position = Vector3(where.x, where.y, 1.25)
	if friendly:
		_box(node, Vector3(0.39, 0.10, 0.12), Color(0.42, 0.96, 1.0), Vector3.ZERO, 0.0, true)
	else:
		_sphere(node, 0.15, Color(1.0, 0.29, 0.25), Vector3.ZERO, true)
	bullets.append({"node": node, "velocity": velocity, "friendly": friendly, "damage": damage, "radius": 0.15})

func _current_pattern() -> String:
	var beat := _current_beat()
	if beat == null or beat.patterns.is_empty():
		return "v"
	var pick: String = beat.patterns[wave_index % beat.patterns.size()]
	wave_index += 1
	return pick

func _current_beat() -> NW2WaveBeat:
	for beat in level_config.wave_beats:
		if elapsed < beat.until_second:
			return beat
	if not level_config.wave_beats.is_empty():
		return level_config.wave_beats.back()
	return null

func _wave_gap() -> float:
	var beat := _current_beat()
	if beat == null:
		return 2.4
	return rng.randf_range(beat.gap_min, beat.gap_max)

func _update_waves(dt: float) -> void:
	spawn_clock -= dt
	if spawn_clock <= 0.0:
		_spawn_wave(_current_pattern())
		spawn_clock = _wave_gap()
	if powerup_index < pickup_schedule.size() and elapsed >= pickup_schedule[powerup_index].at_second:
		var marker: NW2PickupMarker = pickup_schedule[powerup_index]
		_spawn_pickup(marker.pickup_kind, Vector2(marker.global_position.x, marker.global_position.y))
		powerup_index += 1

func _spawn_wave(pattern: String) -> void:
	var entry_x := enemy_entry.global_position.x
	var entry_y := enemy_entry.global_position.y
	if pattern == "v":
		var center := rng.randf_range(-2.5, 2.5)
		for i in range(5):
			_spawn_enemy(Vector2(entry_x + 0.1 + abs(i - 2) * 0.62, entry_y + center + (i - 2) * 0.63), "scout")
	elif pattern == "diagonal":
		var up := -1.0 if wave_index % 2 == 0 else 1.0
		for i in range(5):
			_spawn_enemy(Vector2(entry_x - 0.3 + i * 0.64, entry_y + up * (-2.5 + i * 0.78)), "scout")
	elif pattern == "swarm":
		for i in range(7):
			_spawn_enemy(Vector2(entry_x - 0.2 + i * 0.34, entry_y + rng.randf_range(-3.8, 3.8)), "swarm")
	elif pattern == "chaser":
		for i in range(3):
			_spawn_enemy(Vector2(entry_x + i * 1.0, entry_y + rng.randf_range(-3.2, 3.2)), "chaser")
	elif pattern == "asteroid" or pattern == "mine":
		for i in range(4):
			_spawn_enemy(Vector2(entry_x + i * 1.1, entry_y + rng.randf_range(-4.2, 4.2)), pattern)
	elif pattern == "sandwich":
		for i in range(3):
			_spawn_enemy(Vector2(entry_x + i * 0.9, entry_y - 3.5 + i * 0.35), "chaser")
			_spawn_enemy(Vector2(entry_x + i * 0.9, entry_y + 3.5 - i * 0.35), "chaser")
	elif pattern == "sky":
		for i in range(4):
			_spawn_enemy(Vector2(entry_x - 1.8 + i * 0.8, entry_y + 5.4 + i * 0.4), "diver")

func _spawn_enemy(where: Vector2, kind: String) -> void:
	var node: Node3D = ENEMY_SCENES.get(kind, ENEMY_SCENES["scout"]).instantiate()
	$LiveEnemies.add_child(node)
	var health := float(node.get("max_health"))
	var radius := float(node.get("hit_radius"))
	var speed := float(node.get("approach_speed"))
	node.position = Vector3(where.x, where.y, 0.6)
	enemies.append({"node": node, "kind": kind, "health": health, "radius": radius, "speed": speed, "score": int(node.get("score_value")), "clock": rng.randf_range(0.0, 6.0), "fire": rng.randf_range(1.4, 3.3)})

func _update_enemies(dt: float) -> void:
	for i in range(enemies.size() - 1, -1, -1):
		var enemy: Dictionary = enemies[i]
		var node: Node3D = enemy["node"]
		enemy["clock"] += dt
		node.position.x -= float(enemy["speed"]) * dt
		var kind: String = enemy["kind"]
		if kind == "chaser":
			node.position.y = move_toward(node.position.y, player.position.y, dt * 1.25)
		elif kind == "swarm" or kind == "scout":
			node.position.y += sin(float(enemy["clock"]) * 3.5) * dt * 0.55
		elif kind == "diver":
			node.position.y -= 2.1 * dt
		node.rotation.z += dt * 0.22 if kind == "asteroid" or kind == "mine" else 0.0
		enemy["fire"] -= dt
		if enemy["fire"] <= 0.0 and node.position.x < 7.5 and node.position.x > player.position.x + 1.2 and kind != "asteroid" and kind != "mine" and elapsed > 7.0:
			if rng.randf() < (0.22 if elapsed < 14.0 else 0.42):
				var aim := (Vector2(player.position.x, player.position.y) - Vector2(node.position.x, node.position.y)).normalized()
				_create_bullet(Vector2(node.position.x - 0.6, node.position.y), aim * 5.0, false, 1.0)
			enemy["fire"] = rng.randf_range(2.2, 3.8)
		if node.position.x < LEFT - 2.0 or node.position.y < BOTTOM - 2.0:
			_remove_entity(enemies, i)
		elif iframe_clock <= 0.0 and Vector2(node.position.x - player.position.x, node.position.y - player.position.y).length() < float(enemy["radius"]) + float(player.get("hit_radius")):
			_hurt_player()
			_remove_entity(enemies, i)

func _remove_entity(group: Array, index: int) -> void:
	var node: Node3D = group[index]["node"]
	node.queue_free()
	group.remove_at(index)

func _update_bullets(dt: float) -> void:
	for i in range(bullets.size() - 1, -1, -1):
		var bullet: Dictionary = bullets[i]
		var node: Node3D = bullet["node"]
		var velocity: Vector2 = bullet["velocity"]
		node.position.x += velocity.x * dt
		node.position.y += velocity.y * dt
		if node.position.x < LEFT - 2.0 or node.position.x > RIGHT + 2.0 or absf(node.position.y) > 6.0:
			_remove_entity(bullets, i)
			continue
		if bullet["friendly"]:
			var hit := false
			if phase == "boss" and is_instance_valid(boss) and Vector2(node.position.x - boss.position.x, node.position.y - boss.position.y).length() < float(boss.get("hit_radius")):
				boss_hp -= float(bullet["damage"])
				_spawn_spark(node.position, Color(1.0, 0.6, 0.28))
				hit = true
				if boss_hp <= 0.0:
					_win()
			else:
				for j in range(enemies.size() - 1, -1, -1):
					var enemy: Dictionary = enemies[j]
					var target: Node3D = enemy["node"]
					if Vector2(node.position.x - target.position.x, node.position.y - target.position.y).length() < float(enemy["radius"]) + 0.15:
						enemy["health"] -= float(bullet["damage"])
						_spawn_spark(node.position, Color(0.95, 0.7, 0.43))
						hit = true
						if enemy["health"] <= 0.0:
							score += int(enemy["score"])
							boost = minf(100.0, boost + 12.0)
							_spawn_spark(target.position, Color(1.0, 0.45, 0.2))
							_remove_entity(enemies, j)
						break
			if hit:
				_remove_entity(bullets, i)
		elif iframe_clock <= 0.0 and Vector2(node.position.x - player.position.x, node.position.y - player.position.y).length() < float(player.get("hit_radius")) + 0.06:
			_hurt_player()
			_remove_entity(bullets, i)

func _spawn_spark(where: Vector3, color: Color) -> void:
	var node := Node3D.new()
	add_child(node)
	node.position = where
	_sphere(node, 0.23, color, Vector3.ZERO, true)
	particles.append({"node": node, "time": 0.18})

func _update_particles(dt: float) -> void:
	for i in range(particles.size() - 1, -1, -1):
		var item: Dictionary = particles[i]
		item["time"] -= dt
		var node: Node3D = item["node"]
		node.scale = Vector3.ONE * (0.3 + float(item["time"]) * 3.0)
		if item["time"] <= 0.0:
			_remove_entity(particles, i)

func _hurt_player() -> void:
	if shield > 0:
		shield -= 1
	else:
		hp -= 1
	iframe_clock = 1.2
	_spawn_spark(player.position, Color(0.5, 0.9, 1.0))
	if hp <= 0:
		phase = "lost"
		player.visible = false
		center_label.text = "MISSION FAILED\nPRESS R TO RESTART"

func _spawn_pickup(kind: String, where: Vector2) -> void:
	var node: Node3D = PICKUP_SCENE.instantiate()
	add_child(node)
	node.position = Vector3(where.x, where.y, 0.8)
	var color := Color(0.4, 0.9, 1.0)
	if kind == "REPAIR": color = Color(0.42, 1.0, 0.48)
	if kind == "BOMB": color = Color(1.0, 0.5, 0.4)
	if kind == "WEAPON": color = Color(1.0, 0.84, 0.3)
	if kind == "SHIELD": color = Color(0.6, 0.53, 1.0)
	for part in [node.get_node("Core"), node.get_node("Ring")]:
		part.material_override = _mat(color, true)
	pickups.append({"node": node, "kind": kind, "clock": 0.0})

func _update_pickups(dt: float) -> void:
	for i in range(pickups.size() - 1, -1, -1):
		var item: Dictionary = pickups[i]
		var node: Node3D = item["node"]
		item["clock"] += dt
		node.position.x -= 2.4 * dt
		node.rotation.y += dt * 2.0
		if node.position.x < LEFT - 1.0:
			_remove_entity(pickups, i)
		elif Vector2(node.position.x - player.position.x, node.position.y - player.position.y).length() < 0.75:
			var kind: String = item["kind"]
			if kind == "WEAPON": weapon_rank = mini(3, weapon_rank + 1)
			if kind == "BOOST": boost = 100.0
			if kind == "SHIELD": shield += 1
			if kind == "REPAIR": hp = mini(max_hp, hp + 1)
			if kind == "BOMB": bomb_stock += 1
			score += 50
			_spawn_spark(node.position, Color(0.8, 1.0, 0.7))
			_remove_entity(pickups, i)

func _use_bomb() -> void:
	if bomb_stock <= 0 or paused or phase == "won" or phase == "lost":
		return
	bomb_stock -= 1
	for i in range(enemies.size() - 1, -1, -1):
		var node: Node3D = enemies[i]["node"]
		_spawn_spark(node.position, Color(1.0, 0.8, 0.4))
		score += int(enemies[i]["score"])
		_remove_entity(enemies, i)
	for i in range(bullets.size() - 1, -1, -1):
		if not bullets[i]["friendly"]:
			_remove_entity(bullets, i)
	if phase == "boss":
		boss_hp = maxf(1.0, boss_hp - 10.0)

func _start_boss() -> void:
	phase = "boss"
	boss_spawned = true
	for i in range(enemies.size() - 1, -1, -1):
		_remove_entity(enemies, i)
	for i in range(bullets.size() - 1, -1, -1):
		_remove_entity(bullets, i)
	boss = BOSS_SCENE.instantiate()
	$LiveBoss.add_child(boss)
	boss.position = boss_entry.global_position
	boss_max_hp = float(boss.get("max_health"))
	boss_hp = boss_max_hp
	boss_clock = 0.8
	center_label.text = "BOSS INBOUND"

func _update_boss(dt: float) -> void:
	if not is_instance_valid(boss):
		return
	boss.position.x = move_toward(boss.position.x, boss_entry.global_position.x - 1.4, dt * 0.9)
	boss.position.y = boss_entry.global_position.y + sin((elapsed - wave_limit) * 0.85) * 2.4
	boss.rotation.y = sin(elapsed * 1.5) * 0.1
	if elapsed > wave_limit + 2.0:
		center_label.text = ""
	boss_clock -= dt
	if boss_clock <= 0.0 and boss.position.x < boss_entry.global_position.x - 0.8:
		var target_angle := (Vector2(player.position.x - boss.position.x, player.position.y - boss.position.y)).angle()
		for spread in [-0.3, 0.0, 0.3]:
			var velocity := Vector2.RIGHT.rotated(target_angle + spread) * 5.0
			_create_bullet(Vector2(boss.position.x - 1.1, boss.position.y), velocity, false, 1.0)
		boss_clock = 1.15

func _win() -> void:
	phase = "won"
	boss_defeated = true
	score += int(boss.get("score_value"))
	if is_instance_valid(boss):
		_spawn_spark(boss.position, Color(1.0, 0.7, 0.3))
		boss.queue_free()
		boss = null
	center_label.text = "OPEN SPACE CLEARED\nPRESS R TO REPLAY"

func _update_scenery(dt: float) -> void:
	for star in stars:
		var node: Node3D = star["node"]
		node.position.x -= float(star["speed"]) * dt
		if node.position.x < -10.7:
			node.position.x = 10.7
	for rock in decor:
		var node: Node3D = rock["node"]
		node.position.x -= float(rock["speed"]) * dt
		node.rotation.y += dt * 0.14
		if node.position.x < -11.5:
			node.position.x = 11.5

func _update_hud() -> void:
	var time_text := "%02d:%02d" % [int(elapsed / 60.0), int(elapsed) % 60]
	top_label.text = "NOVA // OPEN SPACE    %s    SCORE %06d" % [time_text, score]
	status_label.text = "HULL %d/%d    SHIELD %d    GUN %d    BOOST %d%%    BOMBS %d" % [hp, max_hp, shield, weapon_rank, int(boost), bomb_stock]
	boss_label.text = "BOSS %d / %d" % [maxi(0, int(ceil(boss_hp))), int(boss_max_hp)] if phase == "boss" else ""
	if phase == "won" or phase == "lost":
		hint_label.text = "R: restart     Touch RESTART to fly again"
	else:
		hint_label.text = "WASD / arrows: fly     SPACE: fire     SHIFT: boost     B: bomb     F: auto fire     P: pause     R: restart"

func _publish_debug(dt: float) -> void:
	if not OS.has_feature("web"):
		return
	debug_clock -= dt
	if debug_clock > 0.0:
		return
	debug_clock = 0.25
	var snapshot := {
		"engine": "godot", "phase": phase, "elapsed": snappedf(elapsed, 0.01),
		"player": {"x": snappedf(player.position.x, 0.01), "y": snappedf(player.position.y, 0.01), "hp": hp},
		"score": score, "boost": int(boost), "bossHp": maxi(0, int(ceil(boss_hp))),
		"enemies": enemies.size(), "bullets": bullets.size(), "pickups": pickups.size(),
		"paused": paused, "autoFire": auto_fire, "ready": true,
		"shotsFired": shots_fired, "bossSpawned": boss_spawned, "bossDefeated": boss_defeated
	}
	JavaScriptBridge.eval("window.novaWing2State = " + JSON.stringify(snapshot) + ";", true)
