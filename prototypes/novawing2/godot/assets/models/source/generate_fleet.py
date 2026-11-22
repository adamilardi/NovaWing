"""NovaWing original geometry. Run with Blender 4.3+: blender -b -t 4 -P this_file.

Authoring / exported coordinates: X flight, Y wings, Z dorsal (toward camera).
The glTF Y-up conversion is deliberately disabled for Godot's XY arena.
No downloaded meshes, textures, fonts, or add-ons are used.
"""
import bpy
import math
import json
import sys
from pathlib import Path
from mathutils import Vector

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0,str(Path(__file__).resolve().parent))
import epic_designs
import scrapyard_paint
MATS = {}
ROOT = None
GROUPS = {}


def material(name, color, metallic=0.5, roughness=0.33, emission=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Emission Color'].default_value = (*color, 1)
    shader.inputs['Emission Strength'].default_value = emission
    return mat


def group(name):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = ROOT
    GROUPS[name] = obj
    return obj


def mesh(name, verts, faces, mat, section='Hull', bevel=0.0):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.materials.append(MATS[mat])
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.parent = GROUPS[section]
    if bevel:
        mod = obj.modifiers.new('Machined armor edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        mod.affect = 'EDGES'
        mod = obj.modifiers.new('Weighted armor normals', 'WEIGHTED_NORMAL')
        mod.keep_sharp = True
        mod.weight = 30
    return obj


def plate(name, points, z, thickness, mat, section='Hull', bevel=0.012):
    n = len(points)
    # All author polygons are made counterclockwise before extrusion.
    area = sum(points[i][0]*points[(i+1)%n][1]-points[(i+1)%n][0]*points[i][1] for i in range(n))
    if area < 0:
        points = list(reversed(points))
    verts = [(x,y,z-thickness/2) for x,y in points] + [(x,y,z+thickness/2) for x,y in points]
    faces = [tuple(reversed(range(n))), tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name, verts, faces, mat, section, bevel)


def box(name, center, size, mat, section='Hull', bevel=0.012):
    x,y,z = center
    a,b,c = [v/2 for v in size]
    return plate(name, [(x-a,y-b),(x+a,y-b),(x+a,y+b),(x-a,y+b)], z, c*2, mat, section, bevel)


def loft(name, sections, mat, section='Hull', sides=8, bevel=0.0):
    # rings are x, y center, z center, width radius, depth radius
    verts = [(x,y+math.cos(2*math.pi*i/sides+math.pi/8)*w,z+math.sin(2*math.pi*i/sides+math.pi/8)*h)
             for x,y,z,w,h in sections for i in range(sides)]
    faces = [tuple(reversed(range(sides))), tuple(range((len(sections)-1)*sides,len(sections)*sides))]
    faces += [(r*sides+i,r*sides+(i+1)%sides,(r+1)*sides+(i+1)%sides,(r+1)*sides+i)
              for r in range(len(sections)-1) for i in range(sides)]
    return mesh(name, verts, faces, mat, section, bevel)


def cylinder(name, center, radius, length, mat, section='Engines', axis='X', vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices*2, radius=radius, depth=length, location=center)
    obj = bpy.context.object
    obj.name = name
    if axis == 'X':
        obj.rotation_euler.y = math.pi/2
    obj.data.materials.append(MATS[mat])
    obj.parent = GROUPS[section]
    return obj


def ring(name, x, y, z, radius, tube, mat, section='Engines', axis='X', segments=12):
    bpy.ops.mesh.primitive_torus_add(major_segments=segments*2, minor_segments=8,
        location=(x,y,z), major_radius=radius, minor_radius=tube)
    obj=bpy.context.object
    obj.name=name
    for face in obj.data.polygons:
        face.use_smooth=True
    if axis=='X':
        obj.rotation_euler.y=math.pi/2
    obj.data.materials.append(MATS[mat])
    obj.parent=GROUPS[section]
    return obj


def marker(name, location):
    obj=bpy.data.objects.new(name,None)
    bpy.context.collection.objects.link(obj)
    obj.parent=GROUPS['Attachments']
    obj.location=location
    obj.empty_display_type='ARROWS'
    obj.empty_display_size=0.12
    return obj


def engine(name, x, y, radius=0.13, length=0.48):
    loft(name+'_Cowl',[(x-length/2,y,0,radius*.9,radius*.85),
        (x-length*.15,y,0,radius*1.15,radius),(x+length/2,y,0,radius*.8,radius*.8)],'dark','Engines')
    for i in range(2):
        ring(name+'_NozzleBand'+str(i),x-length/2+i*.055,y,0,radius*.9,.025,'steel')
    cylinder(name+'_ExhaustCore',(x-length/2-.016,y,0),radius*.67,.018,'glow')
    box(name+'_DorsalEnergyRail',(x-.06,y,radius*.94),(.3,.035,.025),'glow','Engines',.004)
    marker('Engine_'+name,(x-length/2-.06,y,0))


def cannon(name, x, y, z=0.04, length=.42, radius=.043):
    cylinder(name+'_Barrel',(x,y,z),radius,length,'steel','Weapons',vertices=8)
    cylinder(name+'_MuzzleCollar',(x+length/2-.035,y,z),radius*1.45,.07,'dark','Weapons',vertices=8)
    cylinder(name+'_MuzzleLens',(x+length/2+.005,y,z),radius*.78,.012,'glow','Weapons',vertices=8)
    marker('Muzzle_'+name,(x+length/2+.035,y,z))


def cockpit(x=.2, width=.12, length=.65, z=.21):
    loft('Canopy armored gasket',[(x-length/2-.035,0,z,width*.45,.045),(x-.1,0,z+.015,width*1.16,.095),
        (x+length/2+.025,0,z,width*.16,.02)],'dark',bevel=.008)
    loft('Faceted luminous canopy',[(x-length/2,0,z+.035,width*.38,.035),(x-.08,0,z+.055,width,.095),
        (x+length/2,0,z+.02,width*.08,.01)],'glass')
    box('Canopy center spine',(x-.1,0,z+.151),(.21,.018,.018),'steel',bevel=.003)


def panel_vents(name, x, y, z, count=4):
    for i in range(count):
        box(name+str(i),(x+i*.058,y,z),(.022,.13,.016),'dark',bevel=.003)


def wing(name, poly, side, mat='armor', z=-.035, thickness=.1):
    return plate(name,[(x,y*side) for x,y in poly],z,thickness,mat,'Wings',.014)


def point_at(obj,target):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()


def presentation(kind):
    scene=bpy.context.scene
    scene.render.engine='CYCLES'
    scene.cycles.samples=32
    scene.cycles.use_denoising=True
    scene.render.resolution_x=1024
    scene.render.resolution_y=768
    scene.render.resolution_percentage=100
    scene.world.color=(.018,.027,.055)
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.025,.04,.075,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.4
    scene.view_settings.view_transform='AgX'
    for name,pos,power,size,color in [('Key',(-1.5,2.5,5),330,4,(.78,.87,1)),('Warm rim',(2,-3,2),190,3,(1,.55,.38)),('Cool fill',(-3,-1,3),180,3,(.22,.5,1))]:
        data=bpy.data.lights.new(name,'AREA')
        data.energy=power
        data.shape='DISK'
        data.size=size
        data.color=color
        obj=bpy.data.objects.new(name,data)
        scene.collection.objects.link(obj)
        obj.location=pos
        point_at(obj,(0,0,0))
    data=bpy.data.cameras.new('Preview camera')
    cam=bpy.data.objects.new('Preview camera',data)
    scene.collection.objects.link(cam)
    if kind == 'player':
        from mathutils import Matrix
        target=Vector((0,.20,0))
        cam.location=target+Vector((4.8,3.8,4.9))
        back=(cam.location-target).normalized()
        right=Vector((0,1,0)).cross(back).normalized()
        cam.rotation_euler=Matrix((right,back.cross(right),back)).transposed().to_euler()
    else:
        cam.location=(.3,-3.3,7)
        point_at(cam,(0,0,0))
    data.type='ORTHO'
    data.ortho_scale=4.05 if kind=='boss' else 2.85
    scene.camera=cam
    # Comfortable startup viewport: editable meshes, material colors, top-down.
    from mathutils import Quaternion
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.shading.type='MATERIAL'
                area.spaces.active.region_3d.view_rotation=(cam.rotation_euler.to_quaternion() if kind=='player' else Quaternion((1,0,0,0)))
                if kind=='player':
                    area.spaces.active.region_3d.view_location=target
                area.spaces.active.region_3d.view_distance=4.5 if kind=='boss' else 3.0
                area.spaces.active.region_3d.view_perspective='ORTHO'
    scene.render.filepath=str(BASE/'previews'/f'{kind}_perspective.png')
    bpy.ops.render.render(write_still=True)
    cam.location=(0,.16 if kind=='player' else 0,7)
    cam.rotation_euler=(0,0,0)
    scene.render.filepath=str(BASE/'previews'/f'{kind}_top.png')
    bpy.ops.render.render(write_still=True)


def export_batched(kind):
    """Keep the Blender source individually editable; batch GLB by material.

    A small number of material draws per ship is more suitable for browser/mobile
    waves than sending every armor plate and engine ring as its own mesh instance.
    """
    geometry=group('Geometry')
    bpy.context.view_layer.update()
    originals=[o for o in ROOT.children_recursive if o.type=='MESH']
    batches=[]
    rig=GROUPS.get('PilotGlance')
    hull=[o for o in originals if rig is None or o.parent != rig]
    groups=[('Surface_'+key,geometry,[o for o in hull if o.data.materials[0] == mat])
            for key,mat in MATS.items()]
    if rig is not None:
        groups.append(('PilotPortrait',rig,[o for o in originals if o.parent == rig]))
    for batch_name,parent,parts in groups:
        copies=[]
        for original in parts:
            copy=original.copy()
            copy.data=original.data.copy()
            bpy.context.collection.objects.link(copy)
            copy.parent=parent
            copy.matrix_world=original.matrix_world.copy()
            copies.append(copy)
        if not copies:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        for copy in copies:
            copy.select_set(True)
        bpy.context.view_layer.objects.active=copies[0]
        if len(copies)>1:
            bpy.ops.object.join()
        batch=bpy.context.object
        batch.name=batch_name
        # A batch inherits its first detail's local frame (possibly a tilted hose
        # cuff). Bake that frame so Godot's per-mesh AABB is the actual ship bound.
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        batches.append(batch)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [ROOT,geometry,GROUPS['Attachments'],*GROUPS['Attachments'].children,*batches]:
        obj.select_set(True)
    if rig is not None:
        rig.select_set(True)
    bpy.context.view_layer.objects.active=ROOT
    bpy.ops.export_scene.gltf(filepath=str(BASE/f'{kind}.glb'),export_format='GLB',use_selection=True,
        export_yup=False,export_animations=rig is not None,export_frame_range=False,export_cameras=False,export_lights=False,
        export_materials='EXPORT',export_extras=True)
    count=sum(len(batch.data.materials) for batch in batches)
    for obj in [*batches,geometry]:
        bpy.data.objects.remove(obj,do_unlink=True)
    return len(batches),count


def build(kind):
    global ROOT,GROUPS,MATS
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in list(bpy.data.materials):
        bpy.data.materials.remove(block)
    GROUPS={}
    MATS={key:material(kind+'_'+key,color,
          metallic=.05 if key in ['skin','hair','flesh','bone'] else .35,
          roughness=.52 if key in ['skin','flesh','bone'] else .32,
          emission=2.0 if key=='glow' else (.2 if kind in ['player','chaser'] else .65) if key=='glass' else 0)
          for key,color in epic_designs.PALETTES[kind].items()}
    MATS['dark']=material(kind+'_graphite',(.019,.028,.047),.7,.39)
    MATS['steel']=material(kind+'_titanium',(.3,.4,.49),.75,.28)
    if 'warning' not in MATS:
        MATS['warning']=material(kind+'_silo_amber',(1,.4,.035),.3,.3,.7)
    ROOT=bpy.data.objects.new('Model',None)
    bpy.context.collection.objects.link(ROOT)
    ROOT['asset']=kind
    ROOT['forward_axis']='+X' if kind=='player' else '-X'
    ROOT['camera_axis']='+Z'
    for name in ['Hull','Wings','Engines','Weapons','Attachments']:
        group(name)
    epic_designs.build(sys.modules[__name__],kind)
    bpy.context.view_layer.update()
    scrapyard_paint.paint(kind, MATS['armor'])
    for obj in ROOT.children_recursive:
        if obj.type == 'MESH' and obj.data.materials[0] == MATS['armor']:
            scrapyard_paint.unwrap(obj, 3.8 if kind == 'boss' else 2.8)
    if kind!='player':
        ROOT.rotation_euler.z=math.pi
    bpy.context.view_layer.update()
    # Bake modifiers so Blender and Godot display the exact same original geometry.
    for obj in list(ROOT.children_recursive):
        if obj.type=='MESH':
            bpy.context.view_layer.objects.active=obj
            for mod in list(obj.modifiers):
                bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.context.view_layer.update()
    native=[obj.matrix_world@v.co for obj in ROOT.children_recursive if obj.type=='MESH' for v in obj.data.vertices]
    span=[max(v[i] for v in native)-min(v[i] for v in native) for i in range(3)]
    limits=(3.05,2.95,1.22) if kind=='boss' else (2.15,1.8,1.0)
    scale=min(limits[i]/span[i] for i in range(3))
    ROOT.scale=(scale,scale,scale)
    bpy.context.view_layer.update()
    verts=[obj.matrix_world@v.co for obj in ROOT.children_recursive if obj.type=='MESH' for v in obj.data.vertices]
    bounds=[(min(v[i] for v in verts),max(v[i] for v in verts)) for i in range(3)]
    stats={'asset':kind,'bounds_xyz':bounds,'mesh_objects':sum(o.type=='MESH' for o in ROOT.children_recursive),
           'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in ROOT.children_recursive if o.type=='MESH'),
           'attachments':{o.name:list(o.matrix_world.translation) for o in GROUPS['Attachments'].children},
           'forward':'+X' if kind=='player' else '-X','camera':'+Z'}
    meshes,surfaces=export_batched(kind)
    stats['exported_material_batches']=surfaces
    if meshes != surfaces:
        stats['exported_meshes']=meshes
    presentation(kind)
    bpy.ops.object.select_all(action='DESELECT')
    ROOT.select_set(True)
    bpy.context.view_layer.objects.active=ROOT
    bpy.ops.wm.save_as_mainfile(filepath=str(BASE/'source'/f'{kind}.blend'))
    return stats


if __name__=='__main__':
    bpy.context.preferences.filepaths.save_version=0
    requested=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else list(epic_designs.PALETTES)
    previous=json.loads((BASE/'manifest.json').read_text()) if (BASE/'manifest.json').exists() else {'models':[]}
    updated={item['asset']:item for item in previous['models']}
    for kind in requested:
        updated[kind]=build(kind)
    manifest={'generator':'Blender 4.3.2; volumetric geometry inspired by active NovaWing sprite identities',
              'coordinates':'Godot XY gameplay plane; +Z dorsal/camera. No import rotation required.',
              'models':[updated[kind] for kind in epic_designs.PALETTES if kind in updated]}
    (BASE/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    from make_gallery import make_gallery
    make_gallery(BASE)
