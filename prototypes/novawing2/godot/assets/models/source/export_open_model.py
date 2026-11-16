"""Export saved Blender edits without regenerating or replacing the source.

blender -b source/player.blend -P source/export_open_model.py
"""
import bpy
import sys
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parent))
import generate_fleet as fleet

fleet.ROOT=bpy.data.objects.get('Model')
if fleet.ROOT is None or 'asset' not in fleet.ROOT:
    raise RuntimeError('Open one of the NovaWing fleet .blend source files first.')
kind=fleet.ROOT['asset']
fleet.GROUPS={obj.name:obj for obj in fleet.ROOT.children}
fleet.MATS={mat.name.removeprefix(kind+'_'):mat for mat in bpy.data.materials
            if mat.name.startswith(kind+'_')}
count=fleet.export_batched(kind)
print(f'Exported {kind}.glb with {count} material batches; Blender source remains untouched.')
