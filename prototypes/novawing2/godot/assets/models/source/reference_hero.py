"""Original seated pilot and interceptor, authored in an empty Blender scene."""
import math
from pathlib import Path

import bpy
from mathutils import Vector


def build(api, shapes):
    # The common fleet tools supply primitive mesh constructors and export conventions.
    ball = shapes.ellipsoid
    strand = shapes.flowing_lock
    cable = shapes.tube
    mesh = api.mesh
    api.MATS['hair'].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.65,.17,.28,1)
    api.MATS['accent'].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.083,.033,.105,1)

    cloth=api.MATS['accent'].node_tree.nodes['Principled BSDF']
    cloth.inputs['Roughness'].default_value=.54
    cloth.inputs['Metallic'].default_value=.03
    cloth.inputs['Sheen Weight'].default_value=.22
    skin_shader=api.MATS['skin'].node_tree.nodes['Principled BSDF']
    skin_shader.inputs['Base Color'].default_value=(.66,.32,.245,1)
    skin_shader.inputs['Subsurface Weight'].default_value=.13
    skin_shader.inputs['Subsurface Scale'].default_value=.012

    def lathe(name, stations, material, section='Hull'):
        part = api.loft(name, stations, material, section, sides=32)
        for face in part.data.polygons:
            face.use_smooth = len(face.vertices) == 4
        return part

    # A full keel below two separate longitudinal cockpit walls leaves the seat open.
    lathe('Ventral monocoque', [(-1.17,.03,0,.045,.08),(-.94,-.12,0,.15,.26),
          (-.53,-.20,0,.16,.33),(.10,-.23,0,.16,.35),(.68,-.20,0,.13,.27),
          (1.08,-.16,0,.08,.16),(1.46,-.12,0,.012,.013)], 'armor')
    for side in (-1,1):
        def flank(name, stations, mat):
            return lathe(name, [(x,y,side*z,h,w) for x,y,z,h,w in stations],mat)
        flank('Swept cockpit cheek', [(-1.15,.04,.09,.06,.05),(-.93,.20,.17,.20,.085),
              (-.70,.20,.26,.25,.09),(-.46,-.012,.31,.15,.085),(.02,-.07,.34,.114,.065),
              (.43,-.015,.29,.14,.075),(.86,-.035,.19,.15,.08),(1.43,-.12,.008,.012,.012)],'armor')
        rail=[(-.97,.33,.16),(-.74,.42,.23),(-.55,.21,.29),(-.41,.09,.31),
              (.00,.045,.33),(.35,.105,.30),(.58,.13,.25),(.82,.09,.19)]
        cable('Rolled inner cockpit rim',[(x,y,side*z) for x,y,z in rail],.017,'steel')
        for i in range(4):
            x=-.23+i*.115
            api.box('Sill service light',(x,-.043,side*.400),(.052,.010,.010),'glow',bevel=.002)
        z=side*.434
        y=-.12-side*.10
        flank('Engine bridge',[(-.94,-.09,.24,.07,.06),(-.71,y,.35,.11,.14),
              (-.25,y,.39,.09,.11),(.04,y,.37,.04,.05)],'light')
        lathe('Tapered outboard nacelle',[(x,y,z,r,r*.93) for x,r in
              [(-1.14,.034),(-1.03,.11),(-.84,.159),(-.53,.181),(-.12,.175),(.09,.155)]],'armor','Engines')
        lathe('Stepped emitter jacket',[(x,y,z,r,r) for x,r in
              [(.08,.146),(.13,.157),(.18,.139),(.33,.127),(.43,.108)]],'dark','Weapons')
        for x,r in [(-.73,.172),(-.15,.176),(.1,.15),(.20,.134),(.32,.125),(.435,.11)]:
            api.ring('Machined pod band',x,y,z,r,.009,'steel',segments=20)
        for x,r,mat in [(.444,.101,'accent'),(.455,.084,'glow'),(.466,.051,'warning')]:
            api.cylinder('Amber emitter aperture',(x,y,z),r,.009,mat)
        api.marker('Engine_Pod_'+str(side),(-1.15,y,z))
        api.marker('Muzzle_Pod_'+str(side),(.47,y,z))
    lathe('Faceted instrument hood',[(.36,.048,0,.12,.23),(.48,.13,0,.19,.23),
          (.68,.11,0,.16,.215),(.97,-.005,0,.083,.14),(1.40,-.11,0,.014,.018)],'light')
    for side in (-1,1):
        cable('Cowling panel seam',[(.492,.283,side*.137),(.60,.275,side*.118),
              (.69,.253,side*.091),(.84,.172,side*.064),(.94,.096,side*.043)],.006,'dark')
    for i in range(3):
        x=.53+i*.043
        api.box('Cowling vent',(x,.317-i*.009,0),(.021,.009,.082),'dark',bevel=.003)
    api.marker('Muzzle_Center',(1.47,-.12,0))
    ball('Bucket seat cushion',(-.18,-.025,0),(.31,.092,.27),'dark')
    back=ball('High backed seat',(-.49,.31,0),(.10,.42,.245),'dark')
    back.rotation_euler.z=.19
    for side in (-1,1):
        cable('Raised seat bolster',[(-.40,.02,side*.19),(-.47,.31,side*.21),
              (-.54,.61,side*.17),(-.52,.69,side*.13)],.037,'light')

    # Pilot-space x is shoulder width, y is height, z points out of her chest.
    # Turn the torso slightly across the cockpit so both hands read from +Z.
    def pilot(x,y,z):
        return Vector((-.20+.50*x+.866*z, y, -.866*x+.50*z))

    def garment(name, rows, mat):
        verts=[]
        count=32
        for y,width,depth,forward in rows:
            for j in range(count):
                a=math.tau*j/count
                verts.append(pilot(width*math.sin(a),y,forward+depth*math.cos(a)))
        faces=[tuple(range(count)),tuple(reversed(range(len(verts)-count,len(verts))))]
        for i in range(0,len(verts)-count,count):
            faces.extend((i+j,i+count+j,i+count+(j+1)%count,i+(j+1)%count) for j in range(count))
        # Right-handed local frame. Outward-facing skin along the open ring rows.
        obj=mesh(name,verts,[tuple(reversed(f)) for f in faces],mat)
        for p in obj.data.polygons:
            p.use_smooth=True
        return obj

    def bell(value, center, radius):
        return math.exp(-((value-center)/radius)**2)

    # One continuous surface carries the anatomy through the cloth opening.
    # Stations give the rib cage, waist and pelvis their own cross sections.
    stations=[(.024,.146,.113,.010),(.105,.182,.143,.016),(.174,.171,.124,.009),
              (.222,.149,.110,.001),(.285,.127,.100,-.007),(.328,.130,.098,-.018),
              (.372,.147,.111,-.026),(.408,.161,.121,-.030),(.465,.177,.125,-.029),
              (.528,.189,.119,-.035),(.577,.201,.104,-.043),(.605,.183,.092,-.048),
              (.636,.116,.073,-.055),(.664,.071,.061,-.058)]
    def torso_point(a,y):
        index=next((i for i in range(len(stations)-1) if y<=stations[i+1][0]),len(stations)-2)
        lo,hi=stations[index:index+2]
        t=(y-lo[0])/(hi[0]-lo[0])
        width,depth,axis=[lo[i]*(1-t)+hi[i]*t for i in (1,2,3)]
        x=width*math.sin(a)
        front=max(0,math.cos(a))
        z=depth*math.cos(a)
        # Blend a pair of broad ellipsoids into the rib cage in each horizontal
        # slice. Sampling radially lets fullness extend around the outer cup.
        center_y=.491
        radius_y=.111
        if abs(y-center_y)<radius_y+.024 and front>0:
            base_radius=math.hypot(x,z)
            dx,dz=x/base_radius,z/base_radius
            vertical=((y-center_y)/radius_y)**2
            def surface_distance(r):
                lateral=(abs(dx*r)-.092)/.109
                forward=(dz*r-.094)/.108
                breast=(math.sqrt(lateral*lateral+forward*forward+vertical)-1)*.108
                ribs=r-base_radius
                blend=max(.024-abs(breast-ribs),0)
                return min(ribs,breast)-blend*blend/.096
            inner,outer=base_radius,base_radius+.22
            for _ in range(17):
                mid=(inner+outer)*.5
                if surface_distance(mid)<0:
                    inner=mid
                else:
                    outer=mid
            x,z=dx*inner,dz*inner
        relief=0
        # Shallow tension folds follow the bias of the cropped upper panel.
        for line in (.61,.624):
            relief+=.0035*bell(y,line+.07*x,.004)*bell(x,.026,.13)
        relief+=.020*bell(x,0,.111)*bell(y,.218,.062)
        relief-=.014*bell(x,0,.012)*bell(y,.233,.013)
        relief-=.006*bell(x,0,.014)*bell(y,.30,.065)
        depth_offset=front**.7*relief
        return pilot(x,y,axis+z+depth_offset)

    def neckline(a):
        t=min(1,abs(a)/1.28)
        # A deep center plunge with the outer cups sweeping up into the sleeves.
        bottom=.421+.150*(.18*t+.82*t**1.65)
        top=.601-.028*t**2
        return bottom,top

    n=80
    vertices=[]
    faces=[]
    materials=[]
    # Angular rows follow each hem exactly, so the opening has smooth edges.
    bands=[(0,24,'skin'),(1,3,'accent'),(2,16,'accent'),
           (3,16,'opening'),(4,12,'accent')]
    for j in range(n):
        a=(j/n*2-1)*math.pi
        low,high=neckline(a)
        ys=(.024,.381,.396,low,high,.664)
        column=[]
        for band,steps,mat in bands:
            column.extend(ys[band]+(ys[band+1]-ys[band])*i/steps for i in range(steps))
        column.append(ys[-1])
        vertices.extend(torso_point(a,y) for y in column)
    height=len(column)
    for j in range(n):
        row=0
        for _,steps,mat in bands:
            angle=((j+.5)/n*2-1)*math.pi
            exposed=(mat=='skin' or (mat=='opening' and abs(angle)<1.28))
            for i in range(steps):
                k=j*height+row
                l=((j+1)%n)*height+row
                faces.append((k,l,l+1,k+1))
                materials.append(0 if exposed else 1)
                row+=1
    torso=mesh('Sculpted torso with plunge bodice and cropped shrug',vertices,faces,'skin')
    torso.data.materials.append(api.MATS['accent'])
    for face,slot in zip(torso.data.polygons,materials):
        face.use_smooth=True
        face.material_index=slot
    for edge,name in [(0,'Bound sweetheart cup edge'),(1,'Turned shrug hem')]:
        angles=[1.28*(i/18-1) for i in range(37)]
        cable(name,[torso_point(a,neckline(a)[edge]) for a in angles],.0026,'accent',sides=4)
    garment('Plum belted briefs',[(.02,.135,.12,.018),(.075,.19,.149,.019),
            (.14,.185,.144,.013),(.169,.174,.137,.009)],'accent')
    garment('Flight belt',[(.142,.185,.146,.011),(.167,.178,.141,.009)],'dark')
    ball('Brass belt clasp',pilot(0,.155,.153),(.024,.016,.022),'warning')
    garment('Raised collar',[(.636,.077,.064,-.055),(.687,.068,.061,-.057)],'accent')
    garment('Neck',[(.666,.061,.053,-.057),(.759,.059,.054,-.059)],'skin')
    for s in (-1,1):
        def limb(name,points,width,depth,mat):
            return strand(name,[pilot(s*x,y,z) for x,y,z in points],width,depth,mat)
        limb('Seated thigh',[(.12,.095,.025),(.137,.105,.14),(.145,.09,.26),(.14,.035,.41)],
             [.081,.106,.09,.065],[.084,.109,.094,.066],'skin')
        limb('Shin and boot',[(.14,.033,.41),(.144,-.035,.405),(.136,-.127,.33)],
             [.064,.06,.04],[.063,.057,.041],'accent')
        limb('Long fitted sleeve',[(.143,.561,-.047),(.163,.565,-.047),(.188,.545,-.041),(.200,.502,-.035),(.217,.426,-.025),
             (.241,.31,.012),(.237,.267,.11),(.218,.235,.22)],
             [.046,.060,.067,.064,.058,.050,.046,.031],[.046,.059,.065,.062,.056,.050,.042,.030],'accent')
        grip=pilot(s*.216,.216,.242)
        base=pilot(s*.216,.048,.281)
        cable('Angled control stick',[base,grip,grip+Vector((0,.040,0))],.023,'dark')
        ball('Stick socket',base,(.061,.036,.055),'steel')
        limb('Tapered palm',[(.218,.239,.216),(.221,.230,.233),
             (.224,.217,.250),(.222,.197,.250)], [.025,.031,.033,.023],
             [.023,.025,.024,.018],'skin')
        for j in range(4):
            y=.232-j*.013
            tip=.198+.007*abs(j-1)
            limb('Finger around stick',[(.235,y,.243),(.239,y+.002,.259),
                 (.230,y+.001,.273),(.214,y-.003,.276),(tip,y-.006,.268)],
                 [.008,.0085,.008,.007,.004],[.009,.009,.008,.006,.004],'skin')
        limb('Opposed thumb',[(.207,.220,.234),(.198,.231,.242),
             (.195,.236,.253),(.207,.234,.266)], [.012,.011,.009,.005],
             [.014,.012,.010,.005],'skin')

    existing=set(api.ROOT.children_recursive)
    # Fit the face surface to the artwork using horizontal slices through brow,
    # cheeks, jaw and chin. The nose has additional depth in the center columns.
    face=api.material('player_face',(1,1,1),.0,.7)
    api.MATS['face']=face
    tex=face.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image=bpy.data.images.load(str(Path(__file__).with_name('hero_face.png')))
    tex.image.pack()
    face.node_tree.links.new(tex.outputs['Color'],face.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    rows=[(.72,70,86,169,.045),(.744,48,109,160,.068),(.78,30,123,143,.088),
          (.825,20,133,123,.106),(.85,17,138,108,.116),(.88,14,141,89,.105),
          (.913,12,143,75,.098),(.956,13,145,49,.103),(.995,20,141,23,.094),
          (1.023,31,130,3,.073)]
    verts=[]; uvs=[]; faces=[]
    smooth_rows=[]
    for first,second in zip(rows,rows[1:]):
        for step in range(4):
            smooth_rows.append([a+(b-a)*step/4 for a,b in zip(first,second)])
    smooth_rows.append(rows[-1])
    for y,left,right,py,depth in smooth_rows:
        for j in range(41):
            t=j/40
            px=left+(right-left)*t
            x=(px-76)*.00202
            arch=(1-abs(2*t-1)**2.8)**.65
            nose=.027*bell(px,95,11)*bell(py,110,22)
            cheeks=.008*(bell(px,42,17)+bell(px,123,12))*bell(py,105,15)
            lips=.007*bell(px,85,18)*bell(py,145,6)
            verts.append(pilot(x,y,-.059+depth*arch+nose+cheeks+lips))
            uvs.append((px/151,1-py/174))
    for row in range(len(smooth_rows)-1):
        for j in range(40):
            k=row*41+j
            faces.append((k,k+1,k+42,k+41))
    skin=mesh('Sculpted portrait mask',verts,faces,'face')
    uv=skin.data.uv_layers.new(name='UVMap')
    for p in skin.data.polygons:
        p.use_smooth=True
        for i in p.loop_indices:
            uv.data[i].uv=uvs[skin.data.loops[i].vertex_index]
    # Continue the jaw behind the painted face. The ear and cheek remain
    # volumetric in profile and through the animated head turn.
    wrap=[]
    quads=[]
    sides=24
    for row,(y,left,right,py,depth) in enumerate(rows):
        center=((left+right)/2-76)*.00202
        radius=(right-left)*.00101
        for j in range(sides+1):
            a=math.pi*j/sides
            wrap.append(pilot(center+radius*math.cos(a),y,-.059-depth*1.36*math.sin(a)))
        if row:
            for j in range(sides):
                k=(row-1)*(sides+1)+j
                quads.append((k,k+1,k+sides+2,k+sides+1))
    jaw=mesh('Jaw, cheeks and back of skull',wrap,quads,'skin')
    for f in jaw.data.polygons:
        f.use_smooth=True
    for side in (-1,1):
        ball('Auricle',pilot(side*.127,.863,-.077),(.019,.037,.022),'skin')
        helix=[pilot(side*x,y,z) for x,y,z in
               [(.13,.84,-.077),(.146,.851,-.078),(.148,.873,-.092),
                (.141,.891,-.085),(.136,.889,-.069),(.139,.868,-.062)]]
        cable('Outer ear fold',helix,.0038,'skin',sides=4)
    # UVs follow each lock from root to tip. A shared embedded fiber texture
    # carries fine strands even when individual flyaways shrink to a few pixels.
    import numpy as np
    rng=np.random.default_rng(72)
    v,u=np.mgrid[0:512,0:256]/np.array([512,256])[:,None,None]
    shading=np.zeros_like(u)
    for freq,weight in [(8,.12),(17,.11),(35,.08),(66,.06),(112,.04)]:
        phase=rng.uniform(0,math.tau)
        shading+=weight*np.sin(math.tau*freq*u+phase+.6*np.sin(math.tau*v+phase))
    shading+=.15*np.sin(math.tau*u)+.075*np.cos(math.tau*(v-.15))
    tone=np.array([.75,.348,.455])[None,None,:]*(1+shading[:,:,None])
    texture=bpy.data.images.new('Rose silk longitudinal fibers',256,512,alpha=False)
    rgba=np.ones((512,256,4),dtype='f')
    rgba[:,:,:3]=tone
    texture.pixels.foreach_set(rgba.ravel())
    texture.pack()
    hair_mat=api.MATS['hair']
    shader=hair_mat.node_tree.nodes['Principled BSDF']
    node=hair_mat.node_tree.nodes.new('ShaderNodeTexImage')
    node.image=texture
    hair_mat.node_tree.links.new(node.outputs['Color'],shader.inputs['Base Color'])
    shader.inputs['Roughness'].default_value=.43
    shader.inputs['Metallic'].default_value=.015

    def hair_lock(name,points,widths,depths):
        # Unwrap the swept perimeter with a continuous seam along the lock.
        obj=strand(name,points,widths,depths,'hair')
        sides=16
        data=obj.data
        rings=len(data.vertices)//sides
        uv=data.uv_layers.new(name='UVMap')
        for face in data.polygons:
            js=[data.loops[l].vertex_index%sides for l in face.loop_indices]
            seam=min(js)==0 and max(js)==sides-1
            for l in face.loop_indices:
                row,col=divmod(data.loops[l].vertex_index,sides)
                uv.data[l].uv=((sides if seam and col==0 else col)/sides,row/(rings-1))
        return obj

    ball('Gathered rose crown',pilot(0,.912,-.113),(.139,.166,.137),'hair')
    for s in (-1,1):
        # Sections are combed outward from a center part across the crown.
        for j in range(10):
            t=j/9
            phi=.45+1.5*t
            pts=[]
            for k in range(7):
                q=k/6
                theta=.095+q*(1.26+.11*t)
                lon=phi+(1.57-phi)*q*.72
                pts.append(pilot(s*.142*math.sin(theta)*math.sin(lon),
                         .910+.171*math.cos(theta),
                         -.113+.142*math.sin(theta)*math.cos(lon)))
            hair_lock('Gathered crown section',pts,[.004,.012,.018,.019,.017,.011,.002],
                      [.002,.004,.006,.007,.006,.004,.001])
        tie=pilot(s*.132,.990,-.120)
        ball('Plum ponytail binding',tie,(.038,.038,.041),'accent')
        for j in range(17):
            t=j/16
            phase=j*2.39996
            layers=math.sin(phase)
            pts=[]
            for k in range(9):
                q=k/8
                spread=math.sin(math.pi*q*.8)
                x=.13+q*(.20+.075*t)+.035*spread*math.cos(phase)
                y=.99+.092*math.sin(q*math.tau+.2)*spread
                y+=.072*layers*spread+.11*math.sin(math.pi*q)+q*(.11*math.sin(phase+4*q)-.040)
                z=-.13-q*(.28+.12*t)+.050*math.cos(phase)*spread
                pt=pilot(s*x,y-(.045*q if s<0 else 0),z)
                pt.x-=q*(.23+.22*t)
                pt.z+=q*(tie.z-pt.z)*.43
                pts.append(pt)
            wispy=j%4==0
            radius=.006 if wispy else .025+.008*(1-t)
            widths=[radius*w for w in (.55,.87,1,1,.86,.66,.46,.22,.014)]
            hair_lock('Ponytail flyaway' if wispy else 'Layered ponytail wave',pts,
                      widths,[w*.48 for w in widths])
        for j in range(8):
            t=j/7
            pts=[(.002+.006*t,1.067,-.094+.025*t),(.014+.039*t,1.062,-.034),
                 (.050+.057*t,1.034-.017*t,.002),(.072+.061*t,1.008-.029*t,.018),
                 (.094+.048*t,.977-.039*t,.021),(.123+.016*t,.939-.046*t,.002),
                 (.104+.042*t,.929-.084*t,-.005)]
            hair_lock('Side swept tapered fringe',[pilot(s*x,y,z) for x,y,z in pts],
                      [.003,.014,.017,.018,.012,.007,.0006],
                      [.002,.006,.008,.008,.006,.003,.0004])
        for j in range(3):
            t=j/2
            pts=[(.128,.975,-.045),(.141+.005*t,.914,-.048),(.136+.012*t,.853,-.035),
                 (.147+.012*t,.794,-.027),(.136+.018*t,.755,-.013),
                 (.127+.018*t,.739-.031*t,.006)]
            hair_lock('Temple tendril',[pilot(s*x,y,z) for x,y,z in pts],
                      [.008,.011,.009,.007,.004,.0005],[.004,.006,.005,.004,.002,.0003])

    head_parts=set(api.ROOT.children_recursive)-existing
    pivot=api.group('PilotGlance')
    pivot.location=pilot(0,.715,-.059)
    bpy.context.view_layer.update()
    for part in head_parts:
        world=part.matrix_world.copy()
        part.parent=pivot
        part.matrix_world=world
    api.marker('Pilot_Head',pilot(0,.88,-.05))
    bpy.context.scene.render.fps=24
    for frame,yaw in [(1,-15),(91,-15),(108,-45),(129,-45),(150,-15),(265,-15)]:
        pivot.rotation_euler.y=math.radians(yaw)
        pivot.keyframe_insert(data_path='rotation_euler',frame=frame)
    pivot.animation_data.action.name='PilotGlance'
    bpy.context.scene.frame_set(1)
