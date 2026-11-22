@tool
extends Marker3D
class_name NW2PickupMarker

@export_range(0.0, 180.0, 0.1) var at_second := 4.0
@export_enum("WEAPON", "BOOST", "SHIELD", "REPAIR", "BOMB") var pickup_kind := "WEAPON"
