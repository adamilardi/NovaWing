extends SceneTree

# Run after Godot editor import:
# godot --headless --path <project> --script res://assets/models/source/verify_models.gd
func _init() -> void:
	call_deferred("_verify")

func _verify() -> void:
	var failures := 0
	var manifest = JSON.parse_string(FileAccess.get_file_as_string("res://assets/models/manifest.json"))
	for model_name in ["player", "scout", "swarm", "chaser", "diver", "boss"]:
		var packed: PackedScene = load("res://assets/models/%s.glb" % model_name)
		if packed == null:
			push_error("Missing model: " + model_name)
			failures += 1
			continue
		var model := packed.instantiate()
		root.add_child(model)
		var meshes := model.find_children("*", "MeshInstance3D", true, false)
		var bounds := AABB()
		var first := true
		for mesh_node in meshes:
			var mesh_bounds: AABB = mesh_node.global_transform * mesh_node.get_aabb()
			bounds = mesh_bounds if first else bounds.merge(mesh_bounds)
			first = false
		var muzzle: Node3D = model.find_child("Muzzle_Center", true, false)
		if muzzle == null or meshes.size() < 5 or meshes.size() > 7:
			push_error("Model hierarchy/batching mismatch: " + model_name)
			failures += 1
		if muzzle != null:
			var expected_direction := 1.0 if model_name == "player" else -1.0
			if muzzle.global_position.x * expected_direction <= 0.0:
				push_error("Wrong forward axis: " + model_name)
				failures += 1
		if bounds.size.y < 1.4 or bounds.size.z > 1.0:
			push_error("Wrong gameplay plane: " + model_name)
			failures += 1
		for source in manifest["models"]:
			if source["asset"] != model_name:
				continue
			for axis in range(3):
				if abs(bounds.position[axis] - source["bounds_xyz"][axis][0]) > 0.001 or abs(bounds.end[axis] - source["bounds_xyz"][axis][1]) > 0.001:
					push_error("Imported mesh differs from Blender source bounds: " + model_name)
					failures += 1
		print("MODEL_CHECK ", model_name, " meshes=", meshes.size(), " bounds=", bounds,
			" muzzle=", muzzle.global_position if muzzle != null else Vector3.ZERO)
		model.free()
	quit(failures)
