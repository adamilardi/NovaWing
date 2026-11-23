"""Original seated pilot and interceptor, authored in an empty Blender scene."""
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


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
        # A segmented titanium heat shield follows the curvature of each pod.
        # Negative space between the shells exposes the darker enamel beneath.
        for sector in range(6):
            shield=[]
            for x,r,taper in [(-.69,.178,.10),(-.63,.184,0),(-.31,.185,0),(-.25,.180,.15)]:
                for step in range(9):
                    a=math.tau*sector/6+.065+taper+(step/8)*(.87-2*taper)
                    shield.append((x,y+r*math.cos(a),z+.94*r*math.sin(a)))
            panels=[(k,k+1,k+10,k+9) for row in (0,9,18) for k in range(row,row+8)]
            shield_obj=mesh('Segmented nacelle heat shield',shield,panels,'light','Engines')
            for poly in shield_obj.data.polygons:
                poly.use_smooth=True
        for step in range(10):
            a=step*math.tau/10
            vane=[(x,y+radius*math.cos(a+twist),z+radius*math.sin(a+twist))
                  for x,radius,twist in [(.461,.098,0),(.464,.094,.21),(.477,.055,.51),(.474,.051,.27)]]
            mesh('Iris emitter leaf',vane,[(0,1,2,3)],'steel','Weapons')
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
        sleeve=limb('Long fitted sleeve',[(.143,.561,-.047),(.163,.565,-.047),(.188,.545,-.041),(.200,.502,-.035),(.217,.426,-.025),
             (.241,.31,.012),(.237,.267,.11),(.218,.235,.22)],
             [.046,.060,.067,.064,.058,.050,.046,.031],[.046,.059,.065,.062,.056,.050,.042,.030],'accent')
        # Tailoring follows the sleeve's swept rings, including the elbow bend.
        sleeve_mesh=sleeve.data
        for ring in (7,8,18,19):
            loop=[sleeve_mesh.vertices[ring*16+j].co.copy() for j in range(16)]
            cable('Bound sleeve piping',loop+[loop[0]],.0019,'dark',sides=6)
        for col in (2,6):
            seam=[sleeve_mesh.vertices[row*16+col].co.copy() for row in range(6,21)]
            cable('Princess sleeve seam',seam,.0016,'accent',sides=4)
        # Sew a double chevron into the outward-facing upper sleeve.
        for band in (0,.014):
            points=[pilot(s*x,y+band,z) for x,y,z in
                    [(.251,.493,-.066),(.265,.477,-.032),(.256,.493,.003)]]
            cable('Flight rank braid',points,.0028,'warning',sides=6)
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

    # Restraints conform to the seated body. Sample across each strap as well as
    # along it so the webbing follows the chest and keeps a flat, woven profile.
    for side in (-1,1):
        web=[]
        strap_faces=[]
        for row in range(41):
            t=row/40
            y=.161+.465*t
            angle=side*(.21+.73*math.sin(t*math.pi/2))
            for col in range(5):
                a=angle+(col-2)*.055
                point=torso_point(a,y)
                offset=.013+.002*math.sin(col*math.pi/4)
                point+=pilot(math.sin(a)*offset,0,math.cos(a)*offset)-pilot(0,0,0)
                web.append(point)
            if row:
                for col in range(4):
                    k=(row-1)*5+col
                    strap_faces.append((k,k+1,k+6,k+5))
        strap=mesh('Graphite shoulder restraint',web,strap_faces,'dark')
        for face in strap.data.polygons:
            face.use_smooth=True
        # Wrap the shoulder ends back around the seat anchors.
        end=web[-5:]
        shoulder_verts=[]
        for row in range(13):
            t=row/12
            for col,start in enumerate(end):
                crown=pilot(side*.126+(col-2)*.008,.647,-.051)
                anchor=pilot(side*.137+(col-2)*.009,.571,-.152)
                shoulder_verts.append((1-t)**2*start+2*(1-t)*t*crown+t*t*anchor)
        shoulder_faces=[(row*5+c,row*5+c+1,row*5+c+6,row*5+c+5)
                        for row in range(12) for c in range(4)]
        shoulder=mesh('Shoulder return webbing',shoulder_verts,shoulder_faces,'dark')
        for poly in shoulder.data.polygons:
            poly.use_smooth=True
        cable('Woven restraint selvedge',web[::5],.0017,'accent',sides=4)
        for row in (23,25):
            cable('Restraint adjuster crossbar',web[row*5:row*5+5],.0035,'steel')
        for col in (0,4):
            cable('Restraint adjuster rail',[web[row*5+col] for row in (23,24,25)],.0035,'steel')
    ball('Rotary harness release',pilot(0,.168,.171),(.032,.028,.025),'dark')
    ball('Release button',pilot(0,.169,.189),(.019,.017,.014),'warning')

    existing=set(api.ROOT.children_recursive)
    # Fit the face surface to the artwork using horizontal slices through brow,
    # cheeks, jaw and chin. The nose has additional depth in the center columns.
    face=api.material('player_face',(1,1,1),.0,.48)
    api.MATS['face']=face
    tex=face.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image=bpy.data.images.load(str(Path(__file__).with_name('pilot_albedo.jpg')))
    tex.image.pack()
    face.node_tree.links.new(tex.outputs['Color'],face.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    # Frontal albedo landmarks in normalized UV space, from chin to hairline.
    # Each row specifies height, left/right cheek boundary, image Y and facial depth.
    rows=[(.718,.478,.522,.951,.047),(.726,.425,.575,.939,.078),
          (.747,.359,.641,.903,.096),(.774,.303,.697,.847,.100),
          (.800,.264,.736,.775,.103),(.831,.243,.757,.690,.099),
          (.858,.227,.773,.617,.104),(.892,.209,.791,.521,.113),
          (.915,.195,.805,.440,.108),(.939,.194,.806,.362,.117),
          (.973,.209,.791,.255,.121),(1.005,.246,.754,.163,.117),
          (1.035,.309,.691,.095,.101)]
    face_width=.438
    def face_point(px, py):
        row=next((i for i in range(len(rows)-1) if py >= rows[i+1][3]),len(rows)-2)
        low,high=rows[row:row+2]
        k=(py-low[3])/(high[3]-low[3])
        y,left,right,_,depth=[a+(b-a)*k for a,b in zip(low,high)]
        t=max(0,min(1,(px-left)/(right-left)))
        x=(px-.5)*face_width
        arch=math.sqrt(max(0,1-(2*t-1)**2))
        eye=abs(px-.5)
        sockets=-.012*bell(eye,.15,.085)*bell(py,.44,.041)
        lids=.008*bell(eye,.15,.065)*bell(py,.44,.019)
        brow=.009*bell(eye,.16,.092)*bell(py,.354,.032)
        bridge=.031*bell(px,.5,.042)*bell(py,.495,.113)
        nose=.044*bell(px,.5,.053)*bell(py,.610,.044)
        nostrils=.015*bell(eye,.047,.023)*bell(py,.636,.024)
        cheeks=.013*bell(eye,.19,.082)*bell(py,.541,.073)
        lips=bell(px,.5,.10)*(.012*bell(py,.747,.017)+.014*bell(py,.784,.022))
        chin=.012*bell(px,.5,.11)*bell(py,.887,.046)
        relief=sockets+lids+brow+bridge+nose+nostrils+cheeks+lips+chin
        hairline=max(0,(y-.973)/.062)**2
        forehead_y=y+hairline*(.009-.024*abs(2*t-1)**1.6)
        return pilot(x,forehead_y,-.059+arch*(depth+relief))

    verts=[]; uvs=[]; faces=[]
    # Extra loops around the eyelids keep the lashes and iris on their own
    # moving vertices. Mouth and brow motion use the same continuous surface.
    scanlines=[]
    for first,second in zip(rows,rows[1:]):
        steps=20 if .40 < first[3] < .55 else 5
        for step in range(steps):
            scanlines.append([a+(b-a)*step/steps for a,b in zip(first,second)])
    scanlines.append(rows[-1])
    columns=81
    for y,left,right,py,depth in scanlines:
        for j in range(columns):
            px=left+(right-left)*j/(columns-1)
            verts.append(face_point(px,py))
            uvs.append(((px-.18)/.64,1-py))
    for row in range(len(scanlines)-1):
        for j in range(columns-1):
            k=row*columns+j
            faces.append((k,k+1,k+columns+1,k+columns))
    skin=mesh('Sculpted portrait mask',verts,faces,'face')
    uv=skin.data.uv_layers.new(name='UVMap')
    for p in skin.data.polygons:
        p.use_smooth=True
        for i in p.loop_indices:
            uv.data[i].uv=uvs[skin.data.loops[i].vertex_index]
    def key_pose(key, frames):
        for frame,value in frames:
            key.value=value
            key.keyframe_insert(data_path='value',frame=frame)
        key.value=0

    def ease(value):
        t=max(0,min(1,value))
        return t*t*(3-2*t)

    skin.name='PilotFace'
    skin.shape_key_add(name='Basis')
    blink=skin.shape_key_add(name='Blink')
    gaze=skin.shape_key_add(name='LookToCamera')
    focus=skin.shape_key_add(name='Attentive')
    # Sample the upper lash margin and waterline in the source portrait. Skin
    # above the lash margin travels with it instead of flattening the lashes.
    lid_margins=[
        (107,505,506),(129,498,515),(154,487,521),(182,480,526),
        (207,479,528),(231,483,526),(256,495,525),(279,513,524),(293,522,523),
        (477,524,525),(496,514,525),(521,495,527),(544,484,529),
        (568,482,529),(592,484,525),(619,493,520),(647,506,511),(657,510,511)]
    def blink_y(u,py):
        x=u*768
        if not (107<x<293 or 477<x<657):
            return py
        a,b=next((a,b) for a,b in zip(lid_margins,lid_margins[1:]) if a[0]<=x<=b[0])
        t=(x-a[0])/(b[0]-a[0])
        upper=(a[1]+t*(b[1]-a[1]))/1152
        lower=(a[2]+t*(b[2]-a[2]))/1152
        closed=upper+.79*(lower-upper)
        if py<upper:
            return py+(closed-upper)*(1-ease((upper-py)/.051))
        if py>lower:
            return py+(closed-lower)*(1-ease((py-lower)/.040))
        return closed+(py-closed)*.012

    for index,(u,v) in enumerate(uvs):
        px,py=.18+.64*u,1-v
        # The left and right iris centers are asymmetric in the frontal albedo.
        iris=.18+.64*(207 if px<.5 else 567)/768
        distance=abs(px-iris)
        blink.data[index].co=face_point(px,blink_y(u,py))
        # Translate the iris and adjacent sclera; taper off before the canthi.
        look=(1-ease((distance-.026)/.047))*(1-ease((abs(py-.436)-.012)/.014))
        gaze.data[index].co=face_point(px-.017*look,py-.0015*look)
        eyebrow=bell(px,iris,.083)*bell(py,.364,.030)
        smile=bell(abs(px-.5),.092,.042)*bell(py,.764,.026)
        cheek=bell(px,iris,.075)*bell(py,.57,.060)
        focus.data[index].co=face_point(px,py-.013*eyebrow-.010*smile-.004*cheek)
    key_pose(blink,[(1,0),(52,0),(54,1),(55,1),(59,0),
                    (137,0),(139,1),(143,0),(214,0),(216,.96),(220,0),(265,0)])
    key_pose(gaze,[(1,0),(85,0),(88,1),(104,.95),(113,.56),(126,.55),
                   (130,0),(265,0)])
    key_pose(focus,[(1,0),(87,0),(103,.82),(115,1),(129,.84),(154,0),(265,0)])
    skin.data.shape_keys.animation_data.action.name='Pilot face performance'
    # Continue the jaw behind the painted face. The ear and cheek remain
    # volumetric in profile and through the animated head turn.
    wrap=[]
    quads=[]
    sides=24
    for row,(y,left,right,py,depth) in enumerate(rows):
        center=((left+right)/2-.5)*face_width
        radius=(right-left)*face_width/2
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
    # The titanium mounts, acoustic cushions and mic rotate with the skull.
    for side in (-1,1):
        for name,x,scale,mat in [
            ('Comms ear cushion',.136,(.037,.045,.020),'dark'),
            ('Headset alloy housing',.150,(.030,.036,.014),'steel'),
            ('Headset plum insert',.159,(.025,.029,.011),'accent')]:
            cup=ball(name,pilot(side*x,.867,-.079),scale,mat)
            cup.rotation_euler.y=math.radians(-30)
        ball('Comms status lamp',pilot(side*.170,.877,-.069),(.004,.004,.004),'glow')
    boom=[(-.159,.854,-.067),(-.155,.829,-.051),(-.135,.808,-.017),
          (-.099,.795,.022),(-.067,.795,.044)]
    cable('Comms microphone boom',[pilot(*p) for p in boom],.0036,'steel')
    ball('Microphone capsule',pilot(*boom[-1]),(.009,.007,.013),'dark')
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
    tone=np.array([.61,.261,.338])[None,None,:]*(1+.65*shading[:,:,None])
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

    tail_action=None
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
                y=.99+.053*math.sin(q*math.tau+.2)*spread
                y+=.072*layers*spread+.11*math.sin(math.pi*q)+q*(.035*math.sin(phase+4*q)-.10)
                z=-.13-q*(.28+.12*t)+.050*math.cos(phase)*spread
                pt=pilot(s*x,y-(.045*q if s<0 else 0),z)
                pt.x-=q*(.23+.22*t)
                pt.z+=q*(tie.z-pt.z)*.43
                pts.append(pt)
            wispy=j%4==0
            radius=.006 if wispy else .025+.008*(1-t)
            widths=[radius*w for w in (.55,.87,1,1,.86,.66,.46,.22,.014)]
            lock=hair_lock('Ponytail flyaway' if wispy else 'Layered ponytail wave',pts,
                      widths,[w*.48 for w in widths])
            # Bend along the strand, with zero displacement at the binding.
            # Separate in/out poses let the ends overshoot on both reversals.
            lock.shape_key_add(name='Basis')
            drag=lock.shape_key_add(name='TailLag')
            rebound=lock.shape_key_add(name='TailReturn')
            for index,vertex in enumerate(lock.data.vertices):
                q=(index//16)/(len(lock.data.vertices)//16-1)
                relative=vertex.co-tie
                bend=q*q*(.80+.20*t)
                for key,angle,lift in [(drag,17,.027),(rebound,-15,-.020)]:
                    rotated=Matrix.Rotation(math.radians(angle)*bend,3,'Y')@relative
                    key.data[index].co=tie+rotated+Vector((0,lift*bend,0))
            if tail_action is None:
                key_pose(drag,[(1,0),(91,0),(103,1),(115,0),(129,0),
                               (150,0),(158,.24),(170,0),(265,0)])
                key_pose(rebound,[(1,0),(109,0),(116,.25),(126,0),(130,0),
                                  (144,1),(157,0),(265,0)])
                tail_action=lock.data.shape_keys.animation_data.action
                tail_action.name='Ponytail follow through'
            else:
                lock.data.shape_keys.animation_data_create().action=tail_action
        for j in range(5):
            t=j/4
            pts=[(.008+.014*t,1.073,-.056),(.018+.020*t,1.065,.000),
                 (.026+.027*t,1.047,.034),(.041+.035*t,1.032,.041),
                 (.061+.035*t,1.014,.041),(.086+.020*t,.998-.014*t,.031)]
            hair_lock('Parting hairline',[pilot(s*x,y,z) for x,y,z in pts],
                      [.006,.012,.014,.013,.009,.0007],[.004,.005,.005,.006,.004,.0004])
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
    bpy.context.scene.frame_end=265
    bpy.context.scene.render.fps=24
    for frame,yaw in [(1,-15),(91,-15),(108,-45),(129,-45),(150,-15),(265,-15)]:
        pivot.rotation_euler.y=math.radians(yaw)
        pivot.keyframe_insert(data_path='rotation_euler',frame=frame)
    pivot.animation_data.action.name='PilotGlance'
    bpy.context.scene.frame_set(1)
