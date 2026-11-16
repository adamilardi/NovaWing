@tool
extends Node3D
class_name NW2Actor

## Circle on the XY combat plane. Decorative Z depth and mesh banking are ignored.
@export_range(0.1, 4.0, 0.01) var hit_radius := 0.45
@export_range(1.0, 500.0, 1.0) var max_health := 1.0
@export_range(0.0, 20.0, 0.1) var approach_speed := 3.0
@export_range(0, 5000, 10) var score_value := 100
