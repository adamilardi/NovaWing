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
		var portrait_uvs := Rect2()
		for mesh_node in meshes:
			# Transform actual vertices: rotating a mesh-local AABB can overestimate
			# the real geometry, especially for material batches starting at a hose.
			for surface in range(mesh_node.mesh.get_surface_count()):
				var arrays: Array = mesh_node.mesh.surface_get_arrays(surface)
				var material: Material = mesh_node.mesh.surface_get_material(surface)
				if model_name == "player" and material.resource_name == "player_face":
					var uvs: PackedVector2Array = arrays[Mesh.ARRAY_TEX_UV]
					if not uvs.is_empty():
						portrait_uvs.position = uvs[0]
						for uv in uvs:
							portrait_uvs = portrait_uvs.expand(uv)
						var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
						for i in range(0, indices.size(), 3):
							var a := uvs[indices[i]]
							var b := uvs[indices[i + 1]]
							var c := uvs[indices[i + 2]]
							if absf((b-a).cross(c-a)) < 1e-10:
								push_error("Collapsed triangle in pilot head UV wrap")
								failures += 1
								break
				var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
				for vertex in vertices:
					var world_vertex: Vector3 = mesh_node.global_transform * vertex
					bounds = AABB(world_vertex, Vector3.ZERO) if first else bounds.expand(world_vertex)
					first = false
		if model_name == "player":
			var animation: AnimationPlayer = model.find_child("AnimationPlayer", true, false)
			if animation == null or not animation.has_animation("PilotGlance") or portrait_uvs.size.x < 0.8 or portrait_uvs.size.y < 0.8:
				push_error("Pilot glance or portrait texture coordinates missing")
				failures += 1
			else:
				var clip := animation.get_animation("PilotGlance")
				var expected := ["Blink", "LookToCamera", "Attentive", "TailLag", "TailReturn"]
				for track in clip.get_track_count():
					if clip.track_get_type(track) != Animation.TYPE_BLEND_SHAPE:
						continue
					var path := clip.track_get_path(track)
					var peak := 0.0
					for key in clip.track_get_key_count(track):
						peak = maxf(peak, clip.track_get_key_value(track, key))
					if peak > 0.8:
						expected.erase(String(path.get_concatenated_subnames()))
				if not expected.is_empty():
					push_error("Missing animated pilot blend shapes: %s" % str(expected))
					failures += 1
		var muzzle: Node3D = model.find_child("Muzzle_Center", true, false)
		if muzzle == null or meshes.size() < 5 or meshes.size() > (11 if model_name == "player" else 10):
			push_error("Model hierarchy/batching mismatch: " + model_name)
			failures += 1
		if muzzle != null:
			var expected_direction := 1.0 if model_name == "player" else -1.0
			if muzzle.global_position.x * expected_direction <= 0.0:
				push_error("Wrong forward axis: " + model_name)
				failures += 1
		if bounds.size.y < 1.15 or bounds.size.z > 1.23 or bounds.size.x > 3.06:
			push_error("Wrong gameplay plane: " + model_name)
			failures += 1
		for source in manifest["models"]:
			if source["asset"] != model_name:
				continue
			if meshes.size() != source.get("exported_meshes", source["exported_material_batches"]):
				push_error("Imported material batch count differs from source: " + model_name)
				failures += 1
			for axis in range(3):
				if abs(bounds.position[axis] - source["bounds_xyz"][axis][0]) > 0.001 or abs(bounds.end[axis] - source["bounds_xyz"][axis][1]) > 0.001:
					push_error("Imported mesh differs from Blender source bounds: " + model_name)
					failures += 1
		print("MODEL_CHECK ", model_name, " meshes=", meshes.size(), " bounds=", bounds,
			" muzzle=", muzzle.global_position if muzzle != null else Vector3.ZERO)
		model.free()
	quit(failures)
