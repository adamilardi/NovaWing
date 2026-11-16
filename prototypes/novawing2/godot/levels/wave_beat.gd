extends Resource
class_name NW2WaveBeat

## The beat ends when the level clock reaches this second.
@export_range(0.0, 120.0, 0.1) var until_second := 7.0
## Keys map to the reusable enemy scene compositions in main.gd.
@export var patterns: PackedStringArray = ["v", "diagonal"]
@export_range(0.1, 10.0, 0.05) var gap_min := 2.0
@export_range(0.1, 10.0, 0.05) var gap_max := 2.7
