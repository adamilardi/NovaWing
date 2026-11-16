extends Resource
class_name NW2LevelConfig

@export_range(3.0, 180.0, 0.5) var wave_seconds := 60.0
@export_range(0.0, 10.0, 0.1) var first_wave_delay := 1.5
@export var wave_beats: Array[NW2WaveBeat] = []
