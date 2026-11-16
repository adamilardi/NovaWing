"""NovaWing original geometry. Run with Blender 4.3+: blender -b -t 4 -P this_file.

Authoring / exported coordinates: X flight, Y wings, Z dorsal (toward camera).
The glTF Y-up conversion is deliberately disabled for Godot's XY arena.
No downloaded meshes, textures, fonts, or add-ons are used.
"""
import bpy
import math
import json
from pathlib import Path
from mathutils import Vector

BASE = Path(__file__).resolve().parent.parent
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
        mod.segments = 1
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
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=length, location=center)
    obj = bpy.context.object
    obj.name = name
    if axis == 'X':
        obj.rotation_euler.y = math.pi/2
    obj.data.materials.append(MATS[mat])
    obj.parent = GROUPS[section]
    return obj


def ring(name, x, y, z, radius, tube, mat, section='Engines', axis='X', segments=12):
    bpy.ops.mesh.primitive_torus_add(major_segments=segments, minor_segments=4,
        location=(x,y,z), major_radius=radius, minor_radius=tube)
    obj=bpy.context.object
    obj.name=name
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


def fighter(kind):
    if kind=='player':
        loft('Long blue spear fuselage',[(-.78,0,0,.19,.14),(-.32,0,.025,.255,.19),(.35,0,.01,.17,.14),(1.02,0,-.015,.012,.025)],'armor')
        loft('Silver keel',[(-.64,0,-.12,.14,.055),(.35,0,-.09,.13,.08),(.91,0,-.025,.025,.018)],'steel')
        for s in [-1,1]:
            wing('Swept main wing '+str(s),[(-.63,.16),(.18,.17),(-.31,.84),(-.78,.91),(-.54,.56)],s)
            wing('Raised wing plate '+str(s),[(-.5,.25),(-.02,.25),(-.36,.72),(-.66,.79)],s,'light',.035,.035)
            wing('Cobalt wing inset '+str(s),[(-.48,.32),(-.17,.32),(-.4,.64),(-.6,.69)],s,'armor',.06,.024)
            wing('Wing leading cyan line '+str(s),[(.08,.21),(.015,.21),(-.42,.79),(-.34,.77)],s,'glow',.071,.015)
            wing('Forward canard '+str(s),[(.61,.1),(.3,.15),(.13,.43),(.36,.38)],s,'armor',.01,.055)
            engine('Drive_'+('Port' if s>0 else 'Starboard'),-.57,s*.32,.13,.55)
            cannon('Wing_'+('Port' if s>0 else 'Starboard'),-.22,s*.77,.06,.54)
            panel_vents('Wing cooling '+str(s),-.55,s*.53,.091,3)
        cockpit(.23,.13,.66,.2)
        plate('Nose silver flash',[(.89,0),(.55,.05),(.55,-.05)],.128,.012,'light')
        marker('Muzzle_Center',(1.07,0,0))
    elif kind=='scout':
        loft('Scout wedge', [(-.65,0,0,.26,.15),(-.1,0,.03,.25,.2),(.97,0,0,.018,.03)],'armor')
        for s in [-1,1]:
            wing('Scout delta '+str(s),[(.45,.13),(-.12,.8),(-.72,.91),(-.48,.3)],s)
            wing('Scout armored ridge '+str(s),[(.22,.22),(-.19,.67),(-.53,.75),(-.34,.33)],s,'light',.05,.04)
            wing('Scout signal stripe '+str(s),[(-.2,.58),(-.25,.66),(-.54,.74),(-.49,.66)],s,'glow',.079,.018)
            engine('Scout_'+str(s),-.57,s*.3,.13,.48)
            cannon('Scout_'+str(s),.34,s*.25,.07,.41)
        cockpit(.14,.105,.56,.2)
        panel_vents('Scout cooling',-.44,0,.24,4)
        marker('Muzzle_Center',(1.03,0,0))
    elif kind=='swarm':
        loft('Swarm armored heart',[(-.61,0,0,.2,.16),(-.14,0,.025,.29,.22),(.44,0,0,.2,.13)],'armor')
        for s in [-1,1]:
            wing('Swarm hooked mandible '+str(s),[(-.31,.18),(.41,.18),(.99,.49),(.38,.6),(-.43,.9),(-.72,.59)],s)
            wing('Swarm shell inset '+str(s),[(-.2,.31),(.34,.3),(.65,.47),(.23,.46),(-.41,.74)],s,'light',.055,.05)
            wing('Swarm edge light '+str(s),[(.36,.27),(.8,.48),(.69,.5),(.33,.33)],s,'glow',.1,.018)
            cannon('Mandible_'+str(s),.65,s*.45,.02,.46,.04)
        engine('Swarm_single',-.6,0,.19,.39)
        cylinder('Swarm optic',(0,0,.246),.115,.045,'glass','Hull','Z',8)
        ring('Swarm sensor rim',0,0,.25,.133,.024,'steel','Hull','Z',8)
        marker('Muzzle_Center',(.65,0,0))
    elif kind=='chaser':
        loft('Chaser needle',[(-.69,0,0,.13,.12),(-.05,0,.035,.2,.22),(1.04,0,0,.014,.03)],'armor')
        for s in [-1,1]:
            wing('Chaser swept pylon '+str(s),[(.35,.12),(-.07,.71),(-.73,.86),(-.45,.31)],s)
            loft('Chaser nacelle '+str(s),[(-.75,s*.67,0,.15,.16),(-.03,s*.67,0,.12,.14),(.5,s*.67,0,.014,.035)],'light','Wings')
            wing('Chaser blade light '+str(s),[(.22,.18),(.16,.18),(-.22,.7),(-.14,.69)],s,'glow',.091,.022)
            engine('Chaser_booster_'+str(s),-.61,s*.67,.15,.45)
            cannon('Chaser_'+str(s),.51,s*.67,.02,.41,.05)
            panel_vents('Chaser cooling '+str(s),-.44,s*.67,.16,4)
        cockpit(.2,.09,.7,.21)
        marker('Muzzle_Center',(1.09,0,0))
    elif kind=='diver':
        loft('Diver armored spear',[(-.64,0,0,.2,.13),(.05,0,.025,.26,.23),(.97,0,0,.025,.04)],'armor')
        for s in [-1,1]:
            wing('Forward scythe '+str(s),[(-.59,.17),(-.62,.73),(-.06,.9),(.61,.72),(.87,.42),(.22,.57),(-.09,.31)],s)
            wing('Scythe raised armor '+str(s),[(-.47,.35),(-.45,.68),(-.04,.76),(.47,.66),(.11,.65),(-.19,.41)],s,'light',.06,.045)
            wing('Scythe cutting light '+str(s),[(-.03,.79),(.57,.66),(.69,.55),(.55,.73),(-.03,.87)],s,'glow',.041,.024)
            engine('Diver_'+str(s),-.59,s*.26,.135,.49)
            cannon('Diver_'+str(s),.62,s*.6,.025,.36,.045)
        cockpit(.19,.13,.56,.24)
        panel_vents('Diver spine',-.44,0,.21,3)
        marker('Muzzle_Center',(1.04,0,0))


def boss():
    loft('Dreadnought main armored spine',[(-1.22,0,0,.57,.24),(-.65,0,.06,.7,.42),(.3,0,.04,.55,.36),(1.25,0,0,.25,.19)],'armor')
    loft('Dreadnought dorsal carapace',[(-.99,0,.27,.38,.16),(-.4,0,.35,.47,.22),(.55,0,.22,.29,.15)],'light')
    for s in [-1,1]:
        wing('Dreadnought curved outriggers '+str(s),[(-1.11,.37),(-1.35,.99),(-.85,1.47),(.39,1.44),(1.22,1.02),(1.35,.65),(.64,.96),(-.21,.87),(-.45,.4)],s,'armor',0,.27)
        wing('Dreadnought broadside armor '+str(s),[(-.97,.68),(-1.13,1.01),(-.72,1.3),(.31,1.29),(.85,1.03),(-.31,1.03)],s,'light',.17,.12)
        wing('Dreadnought hot edge '+str(s),[(-.65,1.36),(.37,1.35),(.61,1.22),(.31,1.42),(-.64,1.43)],s,'glow',.11,.03)
        loft('Dreadnought fore jaw '+str(s),[(-.05,s*.57,.08,.21,.2),(.6,s*.58,.08,.22,.2),(1.48,s*.33,.02,.045,.07)],'armor','Weapons')
        loft('Jaw dorsal blade '+str(s),[(.05,s*.57,.25,.13,.065),(.57,s*.59,.26,.12,.06),(1.34,s*.36,.09,.025,.025)],'light','Weapons')
        engine('Dreadnought_main_'+str(s),-1.02,s*.83,.23,.52)
        engine('Dreadnought_aux_'+str(s),-.98,s*.34,.17,.48)
        cannon('Heavy_broadside_'+str(s),.98,s*1.04,.08,.62,.09)
        # Three genuinely separate launch tubes on each missile bank.
        for j in range(3):
            cylinder('Missile silo '+str(s)+'_'+str(j),(-.45+j*.2,s*1.09,.28),.065,.07,'dark','Weapons','Z',8)
            cylinder('Missile cap '+str(s)+'_'+str(j),(-.45+j*.2,s*1.09,.321),.043,.014,'warning','Weapons','Z',8)
        for j in range(4):
            box('Dreadnought gill '+str(s)+'_'+str(j),(-.65+j*.14,s*.61,.36),(.045,.19,.065),'dark',bevel=.006)
        marker('Muzzle_Spread_'+str(s),(1.4,s*.73,.05))
    # Circular exposed reactor reads as the boss weak point from the fixed +Z camera.
    cylinder('Reactor black well',(.0,0,.525),.33,.07,'dark','Hull','Z',16)
    ring('Reactor armored outer rim',0,0,.56,.345,.055,'steel','Hull','Z',16)
    ring('Reactor energy containment',0,0,.59,.258,.028,'glow','Hull','Z',16)
    cylinder('Reactor luminous pupil',(0,0,.58),.175,.035,'glass','Hull','Z',12)
    for angle in [0,math.pi/2,math.pi,math.pi*1.5]:
        x,y=.31*math.cos(angle),.31*math.sin(angle)
        box('Reactor armored lock '+str(angle),(x,y,.62),(.11,.11,.06),'armor',bevel=.016)
    cannon('Central_siege',.92,0,.01,.72,.14)
    marker('Muzzle_Center',(1.53,0,.01))


PALETTES={
 'player': {'armor':(.015,.18,.56),'light':(.1,.43,.82),'glow':(.015,.72,1),'glass':(.04,.86,1)},
 'scout': {'armor':(.5,.035,.065),'light':(.85,.13,.13),'glow':(1,.2,.035),'glass':(1,.52,.09)},
 'swarm': {'armor':(.43,.035,.27),'light':(.77,.11,.41),'glow':(1,.15,.52),'glass':(1,.51,.12)},
 'chaser': {'armor':(.25,.055,.53),'light':(.48,.2,.79),'glow':(.53,.25,1),'glass':(1,.2,.55)},
 'diver': {'armor':(.62,.2,.025),'light':(.96,.47,.065),'glow':(1,.67,.12),'glass':(1,.12,.04)},
 'boss': {'armor':(.36,.025,.06),'light':(.65,.075,.12),'glow':(.77,.055,1),'glass':(.2,.9,1)},
}


def point_at(obj,target):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()


def presentation(kind):
    scene=bpy.context.scene
    scene.render.engine='CYCLES'
    scene.cycles.samples=24
    scene.cycles.use_denoising=True
    scene.render.resolution_x=1024
    scene.render.resolution_y=768
    scene.render.resolution_percentage=100
    scene.world.color=(.018,.027,.055)
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.025,.04,.075,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.65
    scene.view_settings.view_transform='AgX'
    for name,pos,power,size,color in [('Key',(-1.5,2.5,5),550,4,(.7,.84,1)),('Warm rim',(2,-3,2),380,3,(1,.45,.25)),('Cool fill',(-3,-1,3),330,3,(.22,.5,1))]:
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
                area.spaces.active.region_3d.view_rotation=Quaternion((1,0,0,0))
                area.spaces.active.region_3d.view_distance=4.5 if kind=='boss' else 3.0
                area.spaces.active.region_3d.view_perspective='ORTHO'
    scene.render.filepath=str(BASE/'previews'/f'{kind}_perspective.png')
    bpy.ops.render.render(write_still=True)
    cam.location=(0,0,7)
    cam.rotation_euler=(0,0,0)
    scene.render.filepath=str(BASE/'previews'/f'{kind}_top.png')
    bpy.ops.render.render(write_still=True)


def export_batched(kind):
    """Keep the Blender source individually editable; batch GLB by material.

    Six material draws per fighter is more suitable for browser/mobile waves
    than sending every small panel and engine ring as its own mesh instance.
    """
    geometry=group('Geometry')
    bpy.context.view_layer.update()
    originals=[o for o in ROOT.children_recursive if o.type=='MESH']
    batches=[]
    for material_key,mat in MATS.items():
        copies=[]
        for original in originals:
            if original.data.materials[0] != mat:
                continue
            copy=original.copy()
            copy.data=original.data.copy()
            bpy.context.collection.objects.link(copy)
            copy.parent=geometry
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
        batch.name='Surface_'+material_key
        batches.append(batch)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [ROOT,geometry,GROUPS['Attachments'],*GROUPS['Attachments'].children,*batches]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active=ROOT
    bpy.ops.export_scene.gltf(filepath=str(BASE/f'{kind}.glb'),export_format='GLB',use_selection=True,
        export_yup=False,export_animations=False,export_cameras=False,export_lights=False,
        export_materials='EXPORT',export_extras=True)
    count=len(batches)
    for obj in [*batches,geometry]:
        bpy.data.objects.remove(obj,do_unlink=True)
    return count


def build(kind):
    global ROOT,GROUPS,MATS
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in list(bpy.data.materials):
        bpy.data.materials.remove(block)
    GROUPS={}
    MATS={key:material(kind+'_'+key,color,emission=1.5 if key=='glow' else .5 if key=='glass' else 0)
          for key,color in PALETTES[kind].items()}
    MATS['dark']=material(kind+'_graphite',(.019,.028,.047),.7,.39)
    MATS['steel']=material(kind+'_titanium',(.3,.4,.49),.75,.28)
    MATS['warning']=material(kind+'_silo_amber',(1,.4,.035),.3,.3,1.0)
    ROOT=bpy.data.objects.new('Model',None)
    bpy.context.collection.objects.link(ROOT)
    ROOT['asset']=kind
    ROOT['forward_axis']='+X' if kind=='player' else '-X'
    ROOT['camera_axis']='+Z'
    for name in ['Hull','Wings','Engines','Weapons','Attachments']:
        group(name)
    if kind=='boss':
        boss()
    else:
        fighter(kind)
    if kind!='player':
        ROOT.rotation_euler.z=math.pi
    bpy.context.view_layer.update()
    # Bake modifiers so Blender and Godot display the exact same original geometry.
    for obj in list(ROOT.children_recursive):
        if obj.type=='MESH':
            bpy.context.view_layer.objects.active=obj
            for mod in list(obj.modifiers):
                bpy.ops.object.modifier_apply(modifier=mod.name)
    verts=[obj.matrix_world@v.co for obj in ROOT.children_recursive if obj.type=='MESH' for v in obj.data.vertices]
    bounds=[(min(v[i] for v in verts),max(v[i] for v in verts)) for i in range(3)]
    stats={'asset':kind,'bounds_xyz':bounds,'mesh_objects':sum(o.type=='MESH' for o in ROOT.children_recursive),
           'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in ROOT.children_recursive if o.type=='MESH'),
           'attachments':{o.name:list(o.matrix_world.translation) for o in GROUPS['Attachments'].children},
           'forward':'+X' if kind=='player' else '-X','camera':'+Z'}
    stats['exported_material_batches']=export_batched(kind)
    presentation(kind)
    bpy.ops.object.select_all(action='DESELECT')
    ROOT.select_set(True)
    bpy.context.view_layer.objects.active=ROOT
    bpy.ops.wm.save_as_mainfile(filepath=str(BASE/'source'/f'{kind}.blend'))
    return stats


if __name__=='__main__':
    bpy.context.preferences.filepaths.save_version=0
    manifest={'generator':'Blender 4.3.2; original procedural hard-surface geometry',
              'coordinates':'Godot XY gameplay plane; +Z dorsal/camera. No import rotation required.',
              'models':[build(kind) for kind in PALETTES]}
    (BASE/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    cards=''.join(f'<figure><img src="{kind}_perspective.png" alt="{kind} perspective render"><figcaption>{kind.upper()}</figcaption><a href="{kind}_top.png">View gameplay silhouette</a></figure>' for kind in PALETTES)
    (BASE/'previews'/'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NovaWing 2 — 3D fleet</title><style>body{margin:0;padding:36px;background:#07101e;color:#e0efff;font:16px system-ui}h1{margin:0 0 8px}p{color:#9bb4ce}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(350px,1fr));gap:18px}figure{margin:0;background:#101d30;padding:14px;border:1px solid #26405d;border-radius:12px}img{width:100%;height:auto}figcaption{font-weight:700;letter-spacing:.12em;margin:10px 0}a{color:#73dcff;font-size:14px}</style><h1>NovaWing 2 · 3D fleet</h1><p>Original editable Blender geometry · Embedded materials · Godot GLB exports</p><main>'+cards+'</main></html>')
