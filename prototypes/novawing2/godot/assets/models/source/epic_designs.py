"""Volumetric NovaWing fleet, modeled from the active game's visual identities.

Sculpted details use mesh geometry. The generator applies the hull livery before export.
Coordinates stay in the XY gameplay plane; meshes are authored nose +X, with
the host exporter rotating hostile roots to -X. Z relief faces the camera.
"""
import math
import bpy
from mathutils import Matrix, Vector

A = None

PALETTES = {
    'player': {'armor':(.64,.72,.8),'light':(.29,.33,.44),'accent':(.12,.045,.16),
               'glow':(1,.28,.055),'glass':(.029,.052,.083),'hair':(.78,.24,.36),'skin':(.65,.316,.245)},
    'scout': {'armor':(.37,.012,.023),'light':(.72,.045,.025),'accent':(.8,.16,.015),
              'glow':(1,.21,.015),'glass':(.95,.45,.035),'flesh':(.15,.012,.055)},
    'swarm': {'armor':(.23,.018,.13),'light':(.54,.045,.23),'accent':(.66,.14,.29),
              'glow':(.58,.86,.035),'glass':(.82,.48,.015),'flesh':(.095,.018,.12)},
    'chaser': {'armor':(.009,.035,.34),'light':(.018,.17,.64),'accent':(.075,.45,.84),
               'glow':(.015,.63,.9),'glass':(.015,.22,.3),'warning':(.95,.49,.025)},
    'diver': {'armor':(.36,.07,.012),'light':(.7,.2,.025),'accent':(.9,.39,.045),
              'glow':(1,.25,.015),'glass':(.9,.55,.03),'flesh':(.15,.024,.065)},
    'boss': {'armor':(.3,.012,.033),'light':(.55,.028,.055),'accent':(.36,.045,.2),
             'glow':(.015,.63,.8),'glass':(.58,.8,.025),'flesh':(.12,.012,.15),'bone':(.35,.24,.36)},
}


def ellipsoid(name,center,radii,mat,section='Hull',segments=16,rings=8,smooth=True):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments*2,ring_count=rings*2,location=center)
    obj=bpy.context.object
    obj.name=name
    obj.scale=radii
    obj.data.materials.append(A.MATS[mat])
    obj.parent=A.GROUPS[section]
    if smooth:
        for poly in obj.data.polygons:
            poly.use_smooth=True
    return obj


def shell(name,poly,z,rise,mat='armor',section='Hull',thickness=.045):
    """Compound convex armor: rolled perimeter, rising shoulder, crowned top."""
    area=sum(poly[i][0]*poly[(i+1)%len(poly)][1]-poly[(i+1)%len(poly)][0]*poly[i][1] for i in range(len(poly)))
    if area<0:
        poly=list(reversed(poly))
    cx=sum(x for x,y in poly)/len(poly)
    cy=sum(y for x,y in poly)/len(poly)
    n=len(poly)
    verts=[]
    for scale,height in [(1,z-thickness),(.99,z),(.81,z+rise*.63),(.43,z+rise)]:
        verts.extend([(cx+(x-cx)*scale,cy+(y-cy)*scale,height) for x,y in poly])
    faces=[tuple(reversed(range(n))),tuple(range(3*n,4*n))]
    faces += [(r*n+i,r*n+(i+1)%n,(r+1)*n+(i+1)%n,(r+1)*n+i) for r in range(3) for i in range(n)]
    return A.mesh(name,verts,faces,mat,section,bevel=.006)


def tube(name,points,radius,mat='steel',section='Hull',sides=8,smooth=True):
    """Mesh hose following a smoothed Catmull-Rom path; useful for real cables."""
    vectors=[Vector(p) for p in points]
    samples=[]
    for i in range(len(vectors)-1):
        p0=vectors[max(0,i-1)];p1=vectors[i];p2=vectors[i+1];p3=vectors[min(i+2,len(vectors)-1)]
        for step in range(4):
            t=step/4
            samples.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
    samples.append(vectors[-1])
    return swept(name,samples,[radius]*len(samples),[radius]*len(samples),mat,section,sides,smooth)


def swept(name,points,widths,depths,mat,section='Hull',sides=8,smooth=True):
    sides *= 2
    points=[Vector(p) for p in points]
    verts=[]
    for i,point in enumerate(points):
        tangent=(points[min(i+1,len(points)-1)]-points[max(i-1,0)]).normalized()
        ref=Vector((0,0,1)) if abs(tangent.z)<.9 else Vector((0,1,0))
        across=tangent.cross(ref).normalized()
        up=across.cross(tangent).normalized()
        for j in range(sides):
            angle=2*math.pi*j/sides
            verts.append(point+across*math.cos(angle)*widths[i]+up*math.sin(angle)*depths[i])
    faces=[tuple(reversed(range(sides))),tuple(range((len(points)-1)*sides,len(points)*sides))]
    faces.extend((r*sides+j,r*sides+(j+1)%sides,(r+1)*sides+(j+1)%sides,(r+1)*sides+j) for r in range(len(points)-1) for j in range(sides))
    obj=A.mesh(name,verts,faces,mat,section)
    # Recalculate winding: sweep frame may be left-handed; Blender can resolve it.
    import bmesh
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth=True
    return obj


def flowing_lock(name,points,widths,depths,mat):
    points=[Vector(p) for p in points]
    curve=[];ww=[];dd=[]
    for i in range(len(points)-1):
        p0=points[max(0,i-1)];p1=points[i];p2=points[i+1];p3=points[min(len(points)-1,i+2)]
        for step in range(3):
            t=step/3
            curve.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
            ww.append(widths[i]*(1-t)+widths[i+1]*t)
            dd.append(depths[i]*(1-t)+depths[i+1]*t)
    curve.append(points[-1]);ww.append(widths[-1]);dd.append(depths[-1])
    return swept(name,curve,ww,dd,mat,sides=8)


def spike(name,start,end,radius,mat='steel',section='Hull',vertices=8):
    start,end=Vector(start),Vector(end)
    delta=end-start
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=radius,radius2=.005,depth=delta.length,location=(start+end)/2)
    obj=bpy.context.object;obj.name=name
    obj.rotation_euler=delta.to_track_quat('Z','Y').to_euler()
    obj.data.materials.append(A.MATS[mat]);obj.parent=A.GROUPS[section]
    return obj


def bolt(name,x,y,z,r=.018):
    return A.cylinder(name,(x,y,z),r,.014,'steel','Hull','Z',8)


def vent(name,x,y,z,length=.23,width=.11,count=5):
    A.box(name+' recessed socket',(x,y,z),(length+.035,width+.035,.045),'dark',bevel=.012)
    for i in range(count):
        A.box(name+' louver '+str(i),(x-length/2+(i+.5)*length/count,y,z+.031),(length/count*.42,width,.035),'steel',bevel=.004)


def port(name,x,y,z,radius=.11,core='glow'):
    A.cylinder(name+' black recess',(x,y,z),radius,.035,'dark','Hull','Z',16)
    A.ring(name+' machined bezel',x,y,z+.022,radius,.018,'steel','Hull','Z',16)
    A.cylinder(name+' lens',(x,y,z+.025),radius*.68,.015,core,'Hull','Z',16)
    A.box(name+' lens divider',(x,y,z+.046),(radius*1.5,.022,.025),'dark',bevel=.004)


def impeller(name, x, y, z, radius, hub):
    """Recessed compressor with swept vanes visible from the arena camera."""
    A.cylinder(name+' inlet', (x,y,z), radius, .035, 'dark', 'Engines', 'Z', 16)
    A.ring(name+' outer lip', x,y,z+.018, radius, radius*.1, 'steel', 'Engines', 'Z', 16)
    for vane in range(7):
        angle = math.tau*vane/7
        points = [(x+radius*r*math.cos(angle+a), y+radius*r*math.sin(angle+a))
                  for r,a in [(.22,0),(.83,.31),(.79,.64),(.38,.36)]]
        A.plate(name+' vane '+str(vane), points, z+.025, .012, 'steel', 'Engines', 0)
    ellipsoid(name+' hub', (x,y,z+.04), (radius*.3,radius*.3,radius*.18),
              hub, 'Engines', segments=8, rings=4)


def drive(name,x,y,z,radius=.22,length=.52,flame=.26,organic=False,compressor=False):
    """Heavy cylindrical drive with segmented casing and an actual rear nozzle."""
    A.loft(name+' turbine housing',[(x-length/2,y,z,radius*.91,radius*.91),(x-length*.2,y,z,radius*1.16,radius*1.14),(x+length*.32,y,z,radius*.98,radius*.95),(x+length/2,y,z,radius*.71,radius*.69)],'dark','Engines',12)
    for i in range(3):
        A.ring(name+' machined hoop '+str(i),x-length/2+i*.075,y,z,radius*(.98 if i<2 else 1.09),.025,'steel','Engines',segments=16)
    # Longitudinal armor segments reveal the black cooling channels beneath.
    for k in range(6):
        a=2*math.pi*k/6
        yy=y+math.cos(a)*radius*.92;zz=z+math.sin(a)*radius*.92
        shell(name+' casing scale '+str(k),[(x-.07,yy-.062),(x+.2,yy-.07),(x+.27,yy),(x+.16,yy+.07),(x-.08,yy+.06)],zz,.045,'armor','Engines') if k in [0,3] else None
    shell(name+' dorsal cowl',[(x-.12,y-radius*.65),(x+.23,y-radius*.63),(x+.3,y),(x+.15,y+radius*.65),(x-.12,y+radius*.65)],z+radius*.86,.065,'armor','Engines')
    if compressor:
        impeller(name+' compressor', x+.04,y,z+radius*.86+.07, radius*.51,'glow')
    else:
        vent(name+' dorsal heat sink',x+.02,y,z+radius*1.2,.19,radius*.65,4)
    rear=x-length/2-.02
    A.cylinder(name+' inner exhaust shadow',(rear,y,z),radius*.8,.02,'dark','Engines',vertices=16)
    A.ring(name+' exhaust ion rim',rear-.012,y,z,radius*.69,.017,'glow','Engines',segments=16)
    A.cylinder(name+' exhaust core',(rear-.016,y,z),radius*.52,.022,'glow','Engines',vertices=16)
    # Opaque nested geometry makes a restrained visible plume without sprites.
    if flame:
        A.loft(name+' blue exhaust mantle',[(rear-flame,y,z,.008,.008),(rear-flame*.43,y,z,radius*.43,radius*.4),(rear,y,z,radius*.56,radius*.5)],'glass' if not organic else 'glow','Engines',8)
        A.loft(name+' ion flame core',[(rear-flame*.76,y,z,.006,.006),(rear-flame*.25,y,z,radius*.24,radius*.22),(rear-.01,y,z,radius*.33,radius*.31)],'glow','Engines',8)
    A.marker('Engine_'+name,(rear,y,z))


def eye(name,x,y,z,radius=.09,color='glass',slit=True):
    ellipsoid(name+' socket',(x,y,z),(radius*1.35,radius*.88,radius*.43),'flesh',segments=12,rings=6)
    ellipsoid(name+' eyeball',(x,y,z+radius*.33),(radius,radius*.64,radius*.4),color,segments=16,rings=8)
    ellipsoid(name+' pupil',(x+.013,y,z+radius*.68),(radius*.17 if slit else radius*.38,radius*.48,radius*.07),'dark',segments=8,rings=6)
    ellipsoid(name+' catchlight',(x-radius*.24,y+radius*.22,z+radius*.72),(radius*.14,radius*.12,radius*.08),'glow',segments=8,rings=4)


def ribbed_hose(name,points,radius=.055,mat='flesh',ribmat='steel'):
    tube(name+' cable',points,radius,mat,sides=8)
    # Raised individual cuffs are visible geometry, not printed surface detail.
    for i,p in enumerate(points):
        pp=Vector(points[max(0,i-1)]);pn=Vector(points[min(len(points)-1,i+1)])
        obj=A.ring(name+' cuff '+str(i),*p,radius*1.03,.012,ribmat,'Hull','Z',10)
        obj.rotation_euler=(pn-pp).to_track_quat('Z','Y').to_euler()


def player():
    # Open monocoque interceptor, with the cockpit and outboard nacelles built
    # as separate volumes. The slight bank keeps both pods legible in side view.
    A.loft('Titanium belly', [(-1.02,-.12,-.02,.05,.07),(-.76,-.13,0,.18,.24),
           (-.35,-.16,0,.205,.30),(.28,-.16,0,.19,.285),(.74,-.15,0,.165,.207),
           (1.08,-.13,0,.103,.107),(1.37,-.095,0,.009,.012)],'armor',sides=28)
    A.loft('Long ventral keel', [(-.81,-.24,0,.047,.14),(-.25,-.302,0,.078,.17),
           (.42,-.284,0,.055,.15),(1.31,-.099,0,.009,.017)],'light',sides=16)
    ellipsoid('Cockpit footwell',(-.075,-.026,.073),(.47,.126,.192),'dark')
    shell('Near cockpit flank',[(-.66,.044),(-.51,.08),(-.34,.038),(-.13,.004),
          (.16,.009),(.42,.07),(.58,.025),(.32,-.082),(-.23,-.131),(-.55,-.084)],
          .205,.032,'armor')
    A.box('Low pilot seat pan',(-.17,.052,.14),(.36,.07,.21),'dark',bevel=.024)
    for side in [-1,1]:
        z=side*.21
        flowing_lock('Cockpit rolled sill '+str(side),[(-.56,.14,z),(-.44,.074,z+.035),
            (-.18,.032,z+.05),(.115,.036,z+.05),(.43,.09,z+.018),(.56,.068,z)],
            [.052,.048,.041,.038,.033,.016],[.039,.035,.032,.032,.027,.012],'armor')
    shell('Inset seat back',[(-.54,.06),(-.49,.39),(-.45,.57),(-.35,.59),
          (-.30,.51),(-.34,.27),(-.29,.09)],.035,.085,'dark')
    tube('Seat surround',[(-.52,.12,.137),(-.49,.38,.14),(-.432,.553,.139),
         (-.366,.535,.147)],.019,'steel')
    for j in range(3):
        A.box('Backrest padded rib '+str(j),(-.429,.24+j*.075,.134),(.099,.053,.037),'dark',bevel=.014)
    A.loft('Instrument shroud',[(.31,.074,.12,.106,.095),(.46,.115,.11,.135,.131),
           (.6,.09,.107,.106,.10),(.79,.008,.08,.028,.035)],'dark',sides=20)
    shell('Brushed forward cowling',[(.47,.064),(.64,.053),(1.36,-.093),
          (1.06,-.139),(.74,-.135),(.48,-.071)],.071,.07,'light')
    for i in range(3):
        A.box('Nose access slot '+str(i),(.78+i*.047,-.061,.158-i*.005),
              (.023,.039,.007),'dark',bevel=.002)
    for side in [-1,1]:
        y=-.078-side*.23
        z=side*.286
        A.loft('Pod pylon '+str(side),[(-.77,y,z*.69,.078,.1),
               (-.39,y,z*.79,.124,.118),(-.03,y,z*.85,.076,.075)],'armor',sides=16)
        A.loft('Nacelle '+str(side),[(-1.06,y,z,.09,.09),(-.94,y,z,.127,.12),
               (-.67,y,z,.144,.135),(-.26,y,z,.144,.13),(.07,y,z,.086,.081)],
               'armor','Engines',24)
        A.loft('Gun sleeve '+str(side),[(-.39,y+.027,z+.051,.077,.08),
               (-.22,y+.035,z+.063,.093,.09),(.17,y+.037,z+.061,.071,.069),
               (.42,y+.038,z+.059,.052,.052)],'dark','Weapons',20)
        for j,x in enumerate([-.95,-.87,-.29,-.21,.10,.33]):
            radius=[.122,.13,.092,.093,.078,.063][j]
            yy,zz=(y,z) if j<2 else (y+.036,z+.06)
            A.ring('Machined collar '+str(side)+' '+str(j),x,yy,zz,radius,.011,'steel',segments=16)
        A.box('Pod breech '+str(side),(-.27,y+.095,z+.096),(.34,.081,.122),'dark',bevel=.017)
        for j in range(4):
            A.box('Pod heat rib '+str(side)+' '+str(j),(-.382+j*.064,y+.143,z+.095),
                  (.025,.022,.12),'steel',bevel=.004)
        A.cannon('Pod_'+str(side),.343,y+.037,z+.061,.25,.045)
        A.cylinder('Amber exhaust '+str(side),(-1.065,y,z),.081,.017,'glow',vertices=16)
        A.marker('Engine_Pod_'+str(side),(-1.075,y,z))
        for j in range(3):
            A.box('Amber service lamp '+str(side)+' '+str(j),(-.61+j*.044,y+.077,z+.109),
                  (.025,.011,.009),'glow',bevel=.003)
    shell('Aft dorsal spine',[(-1.07,-.09),(-.95,.32),(-.84,.52),(-.72,.44),
          (-.51,.08),(-.48,-.08)],-.10,.10,'armor','Wings')
    shell('Dorsal fin inset',[(-.962,.105),(-.86,.398),(-.774,.382),(-.674,.18)],
          .009,.021,'light','Wings')
    for obj in A.ROOT.children_recursive:
        if obj.name.startswith(('Titanium belly','Nacelle ','Instrument shroud','Gun sleeve')):
            for poly in obj.data.polygons:
                poly.use_smooth = len(poly.vertices) == 4
    A.marker('Muzzle_Center',(1.38,-.095,0))
    heroine()


def pilot_contour(name, sections, material):
    """Elliptical cross sections from waist to shoulder or chin to crown."""
    sides = 32
    verts = []
    for y, back, front, z, depth in sections:
        center = (front+back)/2
        for j in range(sides):
            angle = math.tau*j/sides
            verts.append((center+(front-back)/2*math.cos(angle), y, z+depth*math.sin(angle)))
    last = len(verts)-sides
    faces = [tuple(range(sides)), tuple(reversed(range(last,last+sides)))]
    faces.extend((i+j, i+sides+j, i+sides+(j+1)%sides, i+(j+1)%sides)
                 for i in range(0,last,sides) for j in range(sides))
    obj = A.mesh(name,verts,faces,material)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def pilot_face():
    # Project the three-quarter painting over a rounded jaw and raised nose.
    mat = A.material('player_face', (.53,.22,.105), metallic=0, roughness=.66)
    A.MATS['face'] = mat
    image = bpy.data.images.load(str(A.BASE/'source'/'pilot_head_wrap.jpg'))
    image.pack()
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = image
    tex.extension = 'REPEAT'
    shader = mat.node_tree.nodes.get('Principled BSDF')
    mat.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color'])
    head = pilot_contour('Pilot three quarter portrait',[
        (.524,-.08,-.012,.326,.035),(.538,-.123,.013,.33,.064),
        (.566,-.151,.037,.33,.08),(.60,-.169,.052,.33,.093),
        (.637,-.179,.061,.33,.105),(.674,-.187,.064,.33,.106),
        (.712,-.187,.06,.33,.102),(.751,-.171,.05,.325,.097),
        (.78,-.142,.024,.318,.064)],'face')
    uv = head.data.uv_layers.new(name='UVMap')
    for vert in head.data.vertices:
        x,y,z = vert.co
        if z > .34:
            def relief(cx,cy,width,height):
                return math.exp(-((x-cx)/width)**2-((y-cy)/height)**2)
            vert.co.z += (.043*relief(.004,.627,.025,.034)
                          + .018*relief(-.003,.652,.019,.052)
                          + .014*relief(-.083,.641,.048,.024)
                          + .009*relief(-.022,.583,.039,.013)
                          - .012*relief(-.057,.683,.04,.018))
    for poly in head.data.polygons:
        loops = list(poly.loop_indices)
        if len(loops) > 4:
            # Flat chin and crown caps sample small skin patches at the nape.
            for i in loops:
                point = head.data.vertices[head.data.loops[i].vertex_index].co
                uv.data[i].uv = (.055+point.x*.26,.14+point.z*.16)
            continue
        us = [((.75-(head.data.loops[i].vertex_index%32)/32)%1) for i in loops]
        seam = max(us)-min(us) > .5
        for i,u in zip(loops,us):
            point = head.data.vertices[head.data.loops[i].vertex_index].co
            uv.data[i].uv = (u+1 if seam and u < .5 else u, (point.y-.524)/.256)


def balconette_cup(side):
    # The fitted lower cup and exposed upper curve share their neckline vertices.
    # Offset the far side in the three-quarter seat pose to retain both silhouettes.
    cx,cy,cz = (-.014 if side == 1 else .024),.401,.315+side*.072
    segments = 40
    def point(theta,latitude):
        band = math.cos(latitude)
        return (cx+.111*band*math.cos(theta),cy+.100*math.sin(latitude),
                cz+.090*band*math.sin(theta))
    rim = []
    for material,lower,upper in [('accent',-math.pi/2,0),('skin',0,math.pi/2)]:
        verts = []
        for row in range(11):
            for j in range(segments):
                theta = math.tau*j/segments
                edge = .13 + .20*side*math.sin(theta) - .10*math.cos(theta)
                start,end = (lower,edge) if material=='accent' else (edge,upper)
                verts.append(point(theta,start+(end-start)*row/10))
                if material=='accent' and row==10:
                    rim.append(verts[-1])
        faces = [(k*segments+j,(k+1)*segments+j,(k+1)*segments+(j+1)%segments,
                  k*segments+(j+1)%segments) for k in range(10) for j in range(segments)]
        obj = A.mesh('Pilot balconette '+material+' '+str(side),verts,faces,material)
        for poly in obj.data.polygons:
            poly.use_smooth = True
    swept('Pilot rolled cup piping '+str(side),rim+[rim[0]],[.0028]*(segments+1),
          [.0028]*(segments+1),'accent',sides=5)



def heroine():
    existing = set(A.ROOT.children_recursive)
    waist = pilot_contour('Pilot bare waist and shoulders',[
        (.12,-.29,-.025,.28,.096),(.19,-.277,-.031,.282,.103),
        (.215,-.263,-.025,.285,.105),(.235,-.247,-.026,.289,.102),
        (.245,-.24,-.033,.291,.097),(.255,-.235,-.037,.293,.097),
        (.273,-.227,-.038,.296,.099),(.30,-.225,-.023,.30,.11),
        (.37,-.23,.04,.31,.122),(.42,-.225,.05,.311,.129),
        (.455,-.22,.021,.306,.106),(.492,-.158,-.044,.302,.072)],'skin')
    pilot_contour('Pilot buckled riding leathers',[
        (.11,-.324,-.014,.267,.116),(.155,-.312,-.016,.277,.116),
        (.197,-.276,-.031,.285,.109)],'dark')
    A.box('Pilot silver belt buckle',(-.147,.185,.396),(.066,.03,.014),'steel',bevel=.005)
    pelvis = set(A.ROOT.children_recursive)-existing
    # Lengthen the visible waist above the seated hips; keep the belt in the seat.
    rise = .085
    for vertex in waist.data.vertices:
        x,y,z = vertex.co
        if z > .30:
            vertex.co.z -= .012*math.exp(-((x+.071)/.016)**2-((y-.245)/.008)**2)
        t = min(1,max(0,(y-.188)/.112))
        vertex.co.y += rise*t
    # The side panel hugs the ribs and steps down beneath the two rounded cups.
    top = pilot_contour('Pilot racer side panel',[
        (.304,-.231,-.004,.304,.117),(.318,-.235,.027,.306,.127),
        (.337,-.236,.043,.31,.14),(.365,-.238,.041,.314,.15),
        (.391,-.235,.025,.316,.15),(.416,-.228,.002,.315,.141),
        (.436,-.219,-.041,.312,.12),(.456,-.20,-.086,.31,.093)],'accent')
    for side in (-1,1):
        balconette_cup(side)
    # Slash the satin at the flank. Each irregular aperture opens onto a fitted
    # graphite underlayer; fine metal staples bridge the edges on the near side.
    lining = top.copy()
    lining.data = top.data.copy()
    bpy.context.collection.objects.link(lining)
    lining.name = 'Pilot graphite crop lining'
    lining.data.materials[0] = A.MATS['dark']
    for vertex in lining.data.vertices:
        vertex.co.z = .315 + (vertex.co.z-.315)*.92
        vertex.co.x = -.08 + (vertex.co.x+.08)*.974
    for j in range(2):
        x,y = -.165+j*.032,.365+j*.023
        outline = [(x,y),(x+.033,y-.001),(x+.068,y-.013),(x+.1,y-.015),
                   (x+.054,y-.016),(x+.025,y-.008)]
        blade = A.plate('Tailoring cut',outline,.53,.44,'dark',bevel=0)
        cut = top.modifiers.new('Bias rip','BOOLEAN')
        cut.operation = 'DIFFERENCE'
        cut.object = blade
        bpy.context.view_layer.objects.active = top
        bpy.ops.object.modifier_apply(modifier=cut.name)
        bpy.data.objects.remove(blade,do_unlink=True)
    def on_fabric(x,y):
        hit,point,_,_ = top.ray_cast(Vector((x,y,.8)),Vector((0,0,-1)))
        return (x,y,point.z+.003) if hit else (x,y,.46)
    tube('Pilot silver neckline', [on_fabric(x,y) for x,y in [
        (-.155,.45),(-.134,.444),(-.108,.437),(-.086,.426),(-.069,.414)]],
        .004,'steel',sides=5)
    # A silver princess seam sweeps into a pointed enamel accent.
    seam = [on_fabric(x,y) for x,y in [(-.102,.316),(-.058,.33),
            (-.026,.343),(-.015,.353),(.002,.369)]]
    tube('Pilot swept silver seam',seam,.0035,'steel',sides=5)
    clasp = on_fabric(-.129,.429)
    x,y,z = clasp
    shell('Pilot clasp bezel',[(x-.027,y),(x,y+.019),(x+.034,y),
          (x,y-.019)],z,.007,'steel',thickness=.004)
    shell('Pilot teal enamel stone',[(x-.018,y),(x,y+.012),(x+.023,y),
          (x,y-.012)],z+.008,.007,'glass',thickness=.002)
    for j in range(2):
        x,y = -.115+j*.032,.357+j*.023
        tube('Pilot tear clasp '+str(j),[on_fabric(x-.003,y+.005),
             on_fabric(x+.002,y-.01)],.0035,'steel',sides=5)
    pilot_contour('Pilot graphite elastic hem',[
        (.299,-.23,-.009,.304,.118),(.305,-.233,.001,.305,.122),
        (.315,-.236,.024,.307,.127)],'dark')
    flowing_lock('Off shoulder satin drape',[(-.215,.398,.429),(-.163,.39,.454),
        (-.085,.387,.464),(-.035,.393,.477),(.013,.4,.466),(.055,.406,.433)],
        [.016,.017,.016,.014,.012,.005],[.009,.009,.009,.008,.006,.003],'accent')
    pilot_contour('Pilot neck',[(.452,-.154,-.045,.30,.06),
        (.50,-.145,-.054,.31,.056),(.54,-.125,-.025,.32,.056),
        (.58,-.135,-.015,.32,.06)],'skin')
    pilot_contour('Pilot narrow leather choker',[(.512,-.144,-.043,.314,.061),
        (.529,-.138,-.038,.317,.061)],'dark')
    flowing_lock('Pilot near arm on side stick',[(-.19,.447,.36),(-.219,.419,.399),
        (-.247,.355,.418),(-.268,.275,.429),(-.254,.225,.436),
        (-.208,.189,.44),(-.145,.157,.441)],[.035,.05,.043,.034,.029,.033,.023],
        [.036,.05,.044,.034,.03,.034,.023],'skin')
    flowing_lock('Pilot near flight glove',[(-.158,.165,.441),(-.14,.153,.444),
        (-.121,.148,.447),(-.109,.135,.438)],[.024,.03,.028,.013],
        [.023,.028,.021,.014],'dark')
    A.box('Near control pedestal',(-.118,.061,.421),(.076,.059,.046),'dark',bevel=.012)
    tube('Near control stick',[(-.116,.065,.422),(-.12,.114,.439),(-.12,.15,.448)],.013,'steel')
    flowing_lock('Pilot far arm',[(-.121,.452,.242),(-.092,.429,.22),
        (.004,.354,.19),(.087,.291,.198),(.188,.23,.22),(.257,.192,.24)],
        [.032,.048,.037,.032,.032,.021],[.033,.045,.035,.031,.03,.022],'skin')
    flowing_lock('Pilot throttle glove',[(.214,.217,.225),(.241,.201,.236),
        (.265,.19,.244),(.279,.176,.233)],[.027,.031,.028,.017],
        [.027,.03,.023,.016],'dark')
    tube('Pilot throttle grip',[(.274,.088,.21),(.274,.18,.23)],.014,'steel')
    flowing_lock('Near plum sleeve',[(-.207,.421,.383),(-.222,.397,.394),
        (-.235,.376,.4)],[.056,.056,.05],[.054,.054,.048],'accent')
    flowing_lock('Far plum sleeve',[(-.102,.442,.231),(-.084,.42,.216),
        (-.062,.403,.207)],[.046,.047,.041],[.042,.044,.04],'accent')
    for side in [-1,1]:
        z=.208+side*.066
        flowing_lock('Pilot seated thigh '+str(side),[(-.144,.127,z),(-.048,.117,z+.024),
            (.096,.108,z+.025),(.204,.093,z+.02),(.25,.076,z)],
            [.064,.074,.065,.053,.04],[.055,.055,.05,.044,.038],'skin')
        flowing_lock('Boot beneath dash '+str(side),[(.219,.092,z+.016),(.252,.078,z),
            (.282,.035,z-.012),(.334,.017,z-.021)],[.053,.049,.043,.039],
            [.046,.044,.038,.032],'dark')
    head_start = set(A.ROOT.children_recursive)
    pilot_face()
    ellipsoid('Pilot comm stud',(-.144,.64,.409),(.019,.025,.009),'steel',segments=10,rings=6)
    ellipsoid('Pilot comm inset',(-.144,.641,.416),(.009,.014,.005),'glass',segments=8,rings=5)
    pilot_contour('Pilot swept undercut',[(.595,-.18,-.154,.31,.035),
        (.65,-.213,-.13,.315,.078),(.714,-.221,-.084,.317,.098),
        (.749,-.215,.028,.32,.097),(.794,-.178,.034,.319,.086),
        (.815,-.127,-.004,.319,.063),(.823,-.098,-.047,.317,.032)],'hair')
    # Two high gathered tails; the locks fan out in different depth planes.
    # Fine loose strands bridge the larger clumps at the bends of each curl.
    for side in [-1,1]:
        root = (-.112-side*.079,.764,.31+side*.058)
        ellipsoid('Tail tie '+str(side),root,(.046,.044,.04),'dark',segments=10,rings=6)
        for j in range(6):
            t=j/5
            reach=(.47 if side==1 else .38)+.21*math.sin(math.pi*(t+.1))
            fan=(t-.5)*.21
            points=[root,(-.23,.83+fan*.35,.31+side*.10),
                    (-.36,.844+fan+side*.035,.30+side*.16),
                    (-reach*.75,.746+fan+side*.08,.27+side*.19),
                    (-reach,.71+fan+side*.11,.28+side*.20),
                    (-reach-.067,.761+fan+side*.13,.32+side*.19),
                    (-reach-.056+.065*t,.81+fan+side*.14,.36+side*.18)]
            if side == -1:
                points=[root, (.027,.812+fan*.24,.284),(.117,.79+fan*.52,.263),
                        (.194,.747+fan,.256),(.25+.03*j,.707+fan,.246),
                        (.32+.022*j,.692+fan+.04*math.cos(j),.268),
                        (.35+.021*j,.712+fan+.094*math.cos(j),.289)]
            # Give each lock its own arc, lift and turn at the tip.
            points=[(x+.055*math.sin(1.3*j+.6*k)*k/6,
                     y+.048*math.sin(.9*j+.8*k)*k/6,
                     z+.060*math.sin(1.1*j+.7*k)*k/6) for k,(x,y,z) in enumerate(points)]
            widths=[.020,.045,.041,.033,.020,.009,.001]
            flowing_lock('Rose ponytail '+str(side)+' '+str(j),points,widths,
                         [w*.65 for w in widths],'hair')
            ridge=[(x,y+.008,z+w*.65) for (x,y,z),w in zip(points,widths)]
            flowing_lock('Rose flyaway '+str(side)+' '+str(j),ridge,
                         [.003,.004,.004,.003,.002,.001,.0006],
                         [.002,.003,.003,.002,.002,.001,.0006],'hair')
    for j in range(5):
        t=j/4
        flowing_lock('Parted pink fringe '+str(j),[(-.075,.809,.363),
            (-.09-.053*t,.809-.014*t,.39),(-.147-.035*t,.773-.026*t,.41),
            (-.171-.039*t,.717-.029*t,.411),(-.145-.062*t,.675-.028*t,.393)],
            [.015,.032,.028,.017,.0015],[.012,.021,.014,.009,.001],'hair')
    flowing_lock('Far temple fringe',[(-.068,.808,.362),(-.015,.79,.37),
        (.021,.746,.371),(.049,.709,.35),(.051,.682,.327)],
        [.026,.038,.031,.019,.001],[.016,.023,.016,.008,.001],'hair')
    head_parts = set(A.ROOT.children_recursive)-head_start
    A.marker('Pilot_Head',(-.075,.665,.33))
    # Tip the complete figure into the dive, keeping the seat as the pivot.
    pivot = Vector((-.17,.16,.28))
    lean = Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(-11),4,'Z') @ Matrix.Translation(-pivot)
    for part in set(A.ROOT.children_recursive)-existing:
        if part not in pelvis:
            part.location.y += rise
        part.matrix_basis = lean @ part.matrix_basis
    rig = A.group('PilotGlance')
    rig.location = lean @ Vector((-.097,.55+rise,.32))
    bpy.context.view_layer.update()
    for part in head_parts:
        world = part.matrix_world.copy()
        part.parent = rig
        part.matrix_world = world
    # Hold the forward pose, look toward +Z, then settle back into flight.
    scene = bpy.context.scene
    scene.render.fps = 24
    for frame,yaw,tilt in [(1,34,0),(91,34,0),(108,-8,4),(129,-8,4),
                            (150,34,0),(265,34,0)]:
        rig.rotation_euler = (0,math.radians(yaw),math.radians(tilt))
        rig.keyframe_insert(data_path='rotation_euler',frame=frame)
    rig.animation_data.action.name = 'PilotGlance'
    scene.frame_set(1)




def predator(kind):
    # Solid rounded machine core, broken armor silhouette, and a bright amber eye.
    A.loft('Predator black mechanical spine',[(-.85,0,0,.22,.22),(-.42,0,.02,.36,.3),(.07,0,.01,.29,.23),(.5,0,.03,.18,.17)],'dark',sides=12)
    for side in [-1,1]:
        s=side
        shell('Segmented crimson shoulder '+str(s),[(-.76,s*.25),(-.54,s*.6),(-.02,s*.57),(.23,s*.34),(-.14,s*.2)],.08,.18,'armor')
        shell('Sharp shoulder crown '+str(s),[(-.66,s*.36),(-.43,s*.56),(-.04,s*.49),(-.2,s*.31)],.24,.08,'light')
        shell('Forward hooked mandible '+str(s),[(.12,s*.17),(.51,s*.2),(1.02,s*.37),(.79,s*.57),(.3,s*.41)],.03,.13,'armor','Weapons')
        shell('Mandible hot edge '+str(s),[(.48,s*.24),(.91,s*.38),(.78,s*.43),(.45,s*.34)],.2,.038,'light','Weapons')
        # A circular mechanical joint and real hoses connect the jaw to its body.
        port('Predator jaw hinge '+str(s),.05,s*.26,.31,.105,'accent')
        ribbed_hose('Predator tendon '+str(s),[(-.63,s*.19,.29),(-.42,s*.14,.34),(-.22,s*.16,.33),(.02,s*.2,.29),(.2,s*.27,.24)],.035,'flesh','steel')
        spike('Predator rear horn '+str(s),(-.54,s*.49,.12),(-.91,s*.83,.16),.09,'light')
        spike('Predator jaw tooth '+str(s),(.65,s*.3,.07),(.79,s*.14,.08),.048,'steel','Weapons')
        A.cannon('Predator_claw_'+str(s),.65,s*.39,.07,.33,.039)
        for j in range(3):
            A.box('Predator exposed rib '+str(s)+'_'+str(j),(-.5+j*.11,s*.08,.33),(.035,.17,.055),'steel',bevel=.009)
    # Central sensor sits in a sculpted socket between protective jaws.
    shell('Predator recessed sensor bridge',[(.08,-.15),(.39,-.19),(.62,-.09),
          (.68,0),(.59,.12),(.38,.18),(.08,.14)],.12,.11,'dark')
    eye('Predator furnace eye',.38,0,.22,.18,'glass',False)
    shell('Predator eye brow',[(.1,.1),(.42,.17),(.68,.1),(.54,.06),(.22,.06)],.36,.07,'light')
    drive('Predator_main',-.71,0,.0,.26,.4,.24)
    for s in [-1,1]:
        shell('Predator swept rear fin '+str(s),[(-.65,s*.34),(-.37,s*.48),(-.63,s*.8),(-1.02,s*.73)],-.07,.075,'armor','Wings')
    A.marker('Muzzle_Center',(1.06,0,.05))


def swarm():
    # Biological beetle drone: compact thorax, split shell, six jointed limbs.
    ellipsoid('Swarm dark organic thorax',(-.15,0,.04),(.55,.38,.25),'flesh',segments=20,rings=10)
    for s in [-1,1]:
        shell('Swarm split carapace '+str(s),[(-.67,s*.06),(-.57,s*.35),(-.1,s*.49),(.28,s*.27),(.26,s*.055)],.14,.16,'armor')
        shell('Swarm carapace crest '+str(s),[(-.5,s*.18),(-.2,s*.38),(.08,s*.28),(-.14,s*.13)],.3,.05,'light')
        for j in range(3):
            x=-.48+j*.27
            points=[(x,s*.29,.05),(x-.08,s*(.48+j*.025),.09),(x+.1,s*(.73-j*.03),.04),(x+.36,s*(.85-j*.09),-.02)]
            tube('Swarm articulated leg '+str(s)+'_'+str(j),points,.046,'dark','Wings',sides=8)
            shell('Swarm leg scute '+str(s)+'_'+str(j),[(x-.12,s*.48),(x+.01,s*.7),(x+.31,s*.82),(x+.11,s*.6)],.07,.05,'light','Wings')
            spike('Swarm sharp leg tip '+str(s)+'_'+str(j),(x+.14,s*(.72-j*.03),.04),(x+.36,s*(.85-j*.09),-.03),.052,'accent','Wings')
        swept('Swarm hooked feeding claw '+str(s),[(.2,s*.16,.1),(.58,s*.24,.08),(.86,s*.42,.05),(.96,s*.22,.045)],[.11,.095,.055,.003],[.11,.1,.06,.003],'armor','Weapons',10)
        for j in range(3):
            x = -.44 + j*.14
            y = s*(.22 + .035*math.sin(j*math.pi/2))
            ellipsoid('Swarm luminous shell pore '+str(s)+'_'+str(j), (x,y,.353),
                      (.038-j*.005,.017,.012), 'glow', segments=8, rings=4)
        eye('Swarm lateral eye '+str(s),.19,s*.29,.34,.075,'glow')
    eye('Swarm giant compound eye',.3,0,.24,.18,'glass',False)
    for s in [-1,1]:
        tube('Swarm antenna '+str(s),[(.36,s*.19,.25),(.6,s*.38,.3),(.78,s*.59,.29)],.018,'flesh','Hull',6)
        ellipsoid('Swarm antenna light '+str(s),(.78,s*.59,.29),(.03,.035,.03),'glow',segments=8,rings=6)
    drive('Swarm_biojet',-.67,0,-.03,.19,.3,.2,True)
    A.marker('Muzzle_Center',(1.01,0,.04))


def chaser():
    # The original blue armored enemy: heavy round aft machinery and a low snout.
    A.loft('Blue armored keel',[(-.85,0,0,.28,.25),(-.38,0,.025,.32,.3),(.14,0,.015,.24,.22),(.66,0,-.015,.16,.14),(1.02,0,-.025,.035,.04)],'dark',sides=12)
    shell('Blue forward armored snout',[(.15,-.22),(.62,-.2),(1.04,-.01),(.72,.18),(.27,.23),(.06,.1)],.07,.18,'armor')
    shell('Cobalt nose crown',[(.44,-.11),(.78,-.095),(.94,0),(.65,.11),(.39,.12)],.24,.07,'light')
    A.loft('Recessed black sensor canopy',[(.26,0,.26,.115,.035),(.5,0,.3,.14,.09),(.7,0,.21,.025,.025)],'dark',sides=12)
    A.loft('Smoked cyan armored sensor',[(.31,0,.285,.09,.024),(.5,0,.325,.104,.06),(.65,0,.26,.025,.018)],'glass',sides=12)
    tube('Sensor luminous rim',[(.3,-.09,.31),(.48,-.12,.37),(.63,-.04,.3)],.011,'glow',sides=6)
    for s in [-1,1]:
        shell('Blue massive rear shoulder '+str(s),[(-.74,s*.15),(-.51,s*.47),(-.1,s*.48),(.16,s*.3),(-.05,s*.12)],.13,.2,'armor')
        shell('Blue shoulder crown '+str(s),[(-.57,s*.26),(-.36,s*.42),(-.1,s*.37),(-.12,s*.22)],.36,.055,'light')
        impeller('Blue shoulder compressor '+str(s),-.24,s*.31,.43,.12,'warning')
        shell('Blue swept rear blade '+str(s),[(-.76,s*.35),(-.31,s*.52),(-.54,s*.84),(-1.03,s*.75)],-.05,.1,'armor','Wings')
        shell('Blue blade bright leading edge '+str(s),[(-.72,s*.48),(-.47,s*.6),(-.61,s*.75),(-.9,s*.69)],.08,.04,'light','Wings')
        drive('Blue_heavy_'+str(s),-.69,s*.25,-.04,.21,.48,.27)
        tube('Blue hydraulic line '+str(s),[(-.54,s*.12,.34),(-.3,s*.09,.36),(-.09,s*.14,.31),(.12,s*.2,.25)],.028,'steel')
        A.cannon('Blue_sidegun_'+str(s),.24,s*.37,-.03,.58,.05)
        for j in range(3):
            A.box('Blue amber shoulder status '+str(s)+'_'+str(j),(-.52+j*.065,s*.4,.435),(.028,.025,.012),'warning',bevel=.002)
    for j in range(5):
        A.box('Blue exposed spinal cooling fin '+str(j),(-.42+j*.08,0,.35),(.035,.19,.1),'steel',bevel=.008)
    A.marker('Muzzle_Center',(1.08,0,0))


def diver():
    # Aggressive hornet: muscular amber armor over an exposed dark segmented spine.
    ellipsoid('Diver compressed thorax',(-.23,0,0),(.48,.3,.24),'dark',segments=16,rings=8)
    for s in [-1,1]:
        shell('Diver engine shoulder '+str(s),[(-.7,s*.08),(-.53,s*.39),(-.2,s*.44),(.01,s*.18)],.09,.19,'armor')
        shell('Diver shoulder crest '+str(s),[(-.59,s*.16),(-.4,s*.35),(-.22,s*.33),(-.32,s*.13)],.29,.065,'light')
        swept('Diver curled attack pincer '+str(s),[(-.35,s*.28,.02),(-.2,s*.57,.06),(.23,s*.78,.055),(.71,s*.66,.04),(.98,s*.31,.015)],[.11,.14,.13,.085,.003],[.11,.12,.11,.075,.004],'armor','Wings',10,False)
        swept('Diver pincer raised ridge '+str(s),[(-.27,s*.37,.13),(-.1,s*.59,.18),(.28,s*.72,.17),(.64,s*.6,.13),(.85,s*.38,.06)],[.055,.062,.06,.042,.003],[.028,.028,.028,.022,.003],'light','Wings',8,False)
        tube('Diver visible pincer tendon '+str(s),[(-.16,s*.25,.14),(.01,s*.43,.12),(.29,s*.53,.12),(.56,s*.49,.1)],.033,'flesh')
        for j in range(3):
            spike('Diver inner saw tooth '+str(s)+'_'+str(j),(.12+j*.18,s*.56,.06),(.2+j*.18,s*.43,.04),.037,'steel','Weapons')
        port('Diver rotary joint '+str(s),-.17,s*.32,.34,.09,'accent')
        drive('Diver_twin_'+str(s),-.65,s*.19,-.03,.19,.42,.22)
    A.loft('Diver armored needle nose',[(.04,0,0,.18,.17),(.5,0,.03,.13,.15),(.99,0,.0,.016,.03)],'light',sides=10)
    shell('Diver optic housing',[(.03,-.09),(.22,-.15),(.46,-.09),(.55,0),
          (.46,.09),(.22,.15),(.03,.09)],.12,.095,'dark')
    eye('Diver fiery targeting optic',.25,0,.21,.12,'glass',False)
    for j in range(4):
        shell('Diver segmented spine '+str(j),[(-.52+j*.14,-.1),(-.43+j*.14,-.1),(-.4+j*.14,0),(-.43+j*.14,.1),(-.52+j*.14,.1)],.25,.065,'steel')
    A.marker('Muzzle_Center',(1.04,0,.025))


def boss():
    # Biological hull keeps its rounded weight even where armor is absent.
    # Terminate the torso BEHIND the mouth's rear lip (x=.12). A full ellipsoid
    # beneath the funnel would occlude its hollow throat from the +Z camera.
    ellipsoid('Leviathan exposed muscular core',(-.48,0,-.04),(.59,.85,.3),'flesh',segments=24,rings=12)
    ellipsoid('Leviathan swollen aft abdomen',(-.72,0,-.015),(.55,1.03,.35),'armor',segments=20,rings=10)
    for j in range(7):
        x=-.94+j*.15
        tube('Leviathan exposed dorsal rib '+str(j),[(x,-.52,.2),(x+.03,-.32,.33),(x+.075,0,.41),(x+.03,.32,.33),(x,.52,.2)],.043,'accent',sides=8)
        if j<5:
            shell('Leviathan dorsal spinal scute '+str(j),[(x-.05,-.13),(x+.07,-.17),(x+.16,0),(x+.07,.17),(x-.05,.13)],.4,.065,'armor')
    for s in [-1,1]:
        ribbed_hose('Leviathan exposed abdominal conduit '+str(s),[(-1.02,s*.44,.25),(-.78,s*.39,.39),(-.5,s*.34,.4),(-.22,s*.34,.36),(.08,s*.42,.24)],.055,'flesh','bone')
    for s in [-1,1]:
        # Three overlapping cranial plates, with pointed lips and scalloped edges.
        shell('Leviathan great cheek carapace '+str(s),[(-1.02,s*.43),(-.8,s*1.07),(-.3,s*1.19),(.18,s*1.03),(.84,s*.69),(1.18,s*.48),(.76,s*.32),(.21,s*.51),(-.29,s*.52)],.1,.27,'armor')
        shell('Leviathan cheek crown '+str(s),[(-.76,s*.67),(-.49,s*1.05),(-.11,s*.98),(.42,s*.75),(.5,s*.56),(.07,s*.67),(-.29,s*.67)],.38,.11,'light')
        shell('Leviathan ridged forehead '+str(s),[(.19,s*.62),(.6,s*.81),(.99,s*.57),(1.19,s*.27),(.88,s*.31),(.58,s*.47)],.34,.17,'armor')
        for j in range(3):
            x=-.54+j*.34
            shell('Leviathan overlapping scale '+str(s)+'_'+str(j),[(x-.17,s*.51),(x-.04,s*.72),(x+.23,s*.67),(x+.28,s*.47),(x+.02,s*.4)],.47-j*.015,.075,'light' if j==1 else 'armor')
        # Large purple ribbed tubes follow both cheeks and remain visible between plates.
        pts=[(-.91,s*.73,.12),(-.63,s*.69,.25),(-.33,s*.59,.33),(-.01,s*.56,.36),(.26,s*.5,.31),(.47,s*.42,.27)]
        ribbed_hose('Leviathan facial sinew '+str(s),pts,.083,'flesh','bone')
        for j in range(6):
            x=-.8+j*.17
            tube('Leviathan exterior rib '+str(s)+'_'+str(j),[(x,s*.73,.1),(x+.04,s*.91,.17),(x+.15,s*1.03,.22)],.028,'accent',sides=6)
        # Eye sizes vary, like the original many-eyed monster.
        for j,(x,y,r) in enumerate([(.51,.84,.135),(.08,.9,.096),(-.3,.88,.075),(.83,.55,.073)]):
            yy=s*y
            ez=[.43,.5,.56,.57][j]
            shell('Leviathan ocular carapace mound '+str(s)+'_'+str(j),[(x-r*1.55,yy-r*.95),(x+r*.9,yy-r*1.12),(x+r*1.6,yy),(x+r*.8,yy+r*1.15),(x-r*1.6,yy+r*.7)],ez-.15,.17,'armor')
            eye('Leviathan living eye '+str(s)+'_'+str(j),x,yy,ez,r,'glass')
            tube('Leviathan protective eyelid '+str(s)+'_'+str(j),[(x-r*1.1,yy+s*r*.5,ez+.06),(x,yy+s*r*.9,ez+.1),(x+r,yy+s*r*.4,ez+.06)],r*.18,'light',sides=8)
        spike('Leviathan cheek horn '+str(s),(.15,s*1.04,.29),(.57,s*1.27,.32),.095,'light')
        spike('Leviathan rear barb '+str(s),(-.74,s*.97,.19),(-1.09,s*1.22,.14),.09,'accent')
        # Bundled real cables bridge armor and engines.
        for j in range(3):
            tube('Leviathan trailing vascular cable '+str(s)+'_'+str(j),[(.1-j*.14,s*.37,.09),(-.13-j*.14,s*.5,-.05),(-.48-j*.12,s*.61,-.03),(-.72,s*(.67+j*.08),.03)],.025,'accent',sides=6)
    # Three massive aft drives match the sprite, rather than two fighter engines.
    for y in [-.85,0,.85]:
        drive('Leviathan_triple_'+str(y),-1.02,y,-.02,.255,.45,.25,True)
    # Raised missile batteries, arranged visibly around the organic back.
    for s in [-1,1]:
        missile_battery('Leviathan missile battery '+str(s),-.61,s*.82,.6)
    missile_battery('Leviathan dorsal battery',-.78,.02,.59,small=True)
    # A hollow, camera-facing forward maw: layered lips, teeth and deep cyan throat.
    mouth()
    A.marker('Muzzle_Center',(1.28,0,.18))
    A.marker('Muzzle_Spread_-1',(1.14,-.75,.15))
    A.marker('Muzzle_Spread_1',(1.14,.75,.15))


def missile_battery(name,x,y,z,small=False):
    w=.29 if small else .37;h=.25 if small else .31
    A.box(name+' armored rack',(x,y,z),(w,h,.16),'accent','Weapons',.025)
    A.box(name+' recessed face',(x+.005,y,z+.09),(w*.86,h*.81,.025),'dark','Weapons',.008)
    for i in range(3):
        for j in range(2 if small else 3):
            xx=x+(i-1)*w*.25;yy=y+(j-(.5 if small else 1))*h*.27
            A.cylinder(name+' silo rim '+str(i)+'_'+str(j),(xx,yy,z+.115),.035 if not small else .029,.025,'steel','Weapons','Z',8)
            A.cylinder(name+' armed missile '+str(i)+'_'+str(j),(xx,yy,z+.133),.022,.022,'light','Weapons','Z',8)
    for xx in [x-w*.44,x+w*.44]:
        A.box(name+' rail',(xx,y,z+.12),(.025,h*.94,.033),'bone','Weapons',.005)


def mouth():
    cx=.67;rx=.55;ry=.66
    # A true open funnel. No face fills the mouth; throat is recessed toward -Z.
    n=32
    rings=[(1.08,.3),(1.0,.45),(.85,.41),(.73,.2),(.58,.015),(.3,-.12)]
    verts=[(cx+math.cos(2*math.pi*j/n)*rx*r,math.sin(2*math.pi*j/n)*ry*r,z) for r,z in rings for j in range(n)]
    faces=[(k*n+j,k*n+(j+1)%n,(k+1)*n+(j+1)%n,(k+1)*n+j) for k in range(len(rings)-1) for j in range(n)]
    obj=A.mesh('Leviathan hollow purple gullet',verts,faces,'flesh')
    for p in obj.data.polygons:p.use_smooth=True
    # Rolled lip and internal folds follow the ellipse in 3D.
    for k,(r,z,width,mat) in enumerate([(1.04,.38,.045,'accent'),(.89,.41,.025,'bone'),(.71,.18,.025,'accent'),(.55,.01,.019,'glow'),(.33,-.085,.02,'glow')]):
        points=[(cx+math.cos(2*math.pi*j/32)*rx*r,math.sin(2*math.pi*j/32)*ry*r,z) for j in range(33)]
        swept('Leviathan mouth concentric fold '+str(k),points,[width]*len(points),[width]*len(points),mat,sides=6)
    for j in range(20):
        a=2*math.pi*j/20
        # Alternate long hooks and small teeth around the deep throat.
        reach = .53 if j%2 == 0 else .69
        profile = [(.96,a,.48),(.87,a+.018,.54),(.73,a+.07,.48),(reach,a+.14,.32)]
        points = [(cx+math.cos(t)*rx*r,math.sin(t)*ry*r,z) for r,t,z in profile]
        swept('Leviathan hooked fang '+str(j),points,[.041,.045,.029,.003],
              [.038,.037,.021,.002],'bone','Weapons',sides=5)
    # Curved cyan nerves spiral into the throat, like the original luminous maw.
    for j in range(7):
        a=2*math.pi*j/7
        pts=[]
        for k in range(7):
            r=.12+k*.09;angle=a+k*.14
            pts.append((cx+math.cos(angle)*rx*r,math.sin(angle)*ry*r,-.1+k*.036))
        tube('Leviathan spiral cyan nerve '+str(j),pts,.013,'glow',sides=6)
    ellipsoid('Leviathan deep throat light',(cx,0,-.145),(.1,.13,.015),'glow',segments=16,rings=8)
    A.marker('Maw_Core',(cx,0,-.1))


def build(api,kind):
    global A
    A=api
    if kind=='player':
        import reference_hero
        import sys
        reference_hero.build(api, sys.modules[__name__])
    elif kind=='scout':predator(kind)
    elif kind=='swarm':swarm()
    elif kind=='chaser':chaser()
    elif kind=='diver':diver()
    elif kind=='boss':boss()
