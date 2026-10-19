"""Build the reference-led cliff study. Runs in a separate factory Blender process.
Stone is a continuous sculpted shell; summit, ruin, trees and ivy are real meshes.
No clouds are painted or modelled here: the demo uses the game's cloud system.
"""
import bpy
import bmesh
import json
import math
import random
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/flight/cliffs'
SOURCE = ROOT / 'art/flight-cliffs'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
SUN = Vector((.65,-.55,.8)).normalized()

def material(name, texture_name=None, alpha=False):
    m=bpy.data.materials.new(name); m.use_nodes=True
    n=m.node_tree.nodes; n.clear(); links=m.node_tree.links
    out=n.new('ShaderNodeOutputMaterial')
    col=n.new('ShaderNodeVertexColor'); col.layer_name='PaintedLight'
    if texture_name:
        tex=n.new('ShaderNodeTexImage')
        tex.image=bpy.data.images.load(str(OUT/texture_name)); tex.image.pack()
        mix=n.new('ShaderNodeMixRGB'); mix.blend_type='MULTIPLY'; mix.inputs[0].default_value=1
        links.new(tex.outputs['Color'],mix.inputs[1]); links.new(col.outputs['Color'],mix.inputs[2])
        # Direct color exports KHR_materials_unlit. Alpha is also retained.
        surface=mix.outputs[0]
        if alpha:
            transparent=n.new('ShaderNodeBsdfTransparent')
            blend=n.new('ShaderNodeMixShader')
            links.new(tex.outputs['Alpha'],blend.inputs[0])
            links.new(transparent.outputs[0],blend.inputs[1])
            links.new(mix.outputs[0],blend.inputs[2]); surface=blend.outputs[0]
            m.surface_render_method='DITHERED'
        links.new(surface,out.inputs['Surface'])
    else:
        links.new(col.outputs[0],out.inputs['Surface'])
    return m

STONE=material('Painted limestone / warm planes, cool fissures','painted-stone.png')
COLOR=material('Painted summit and weathered bark')
FOLIAGE=material('Hand painted pine, ivy, scrub and moss','painted-foliage.png',True)

class MeshBuilder:
    def __init__(self,name,mat,collection):
        self.name=name; self.mat=mat; self.collection=collection
        self.vertices=[]; self.faces=[]; self.colors=[]; self.uvs=[]
    def face(self,points,color=(1,1,1,1),uvs=None):
        start=len(self.vertices)
        self.vertices.extend(tuple(p) for p in points)
        self.faces.append(tuple(range(start,start+len(points))))
        self.colors.extend([color]*len(points))
        self.uvs.extend(uvs or [(0,0)]*len(points))
    def finish(self):
        mesh=bpy.data.meshes.new(self.name); mesh.from_pydata(self.vertices,[],self.faces); mesh.update()
        mesh.materials.append(self.mat)
        uv=mesh.uv_layers.new(name='Painted UV')
        color=mesh.color_attributes.new(name='PaintedLight',type='FLOAT_COLOR',domain='CORNER')
        for loop in mesh.loops:
            uv.data[loop.index].uv=self.uvs[loop.vertex_index]
            color.data[loop.index].color=self.colors[loop.vertex_index]
        obj=bpy.data.objects.new(self.name,mesh); self.collection.objects.link(obj)
        return obj

def stone_color(normal,p,variation=1):
    sun=max(0,normal.dot(SUN))
    shade=.56+sun*.39
    # Deep fissures and taper have cool ambient occlusion painted into vertices.
    foot=.86+.14*max(0,min(1,(p.z+23)/30))
    return (shade*foot*variation, (shade*.99+.025)*foot*variation,
            (shade*.93+.08)*foot*variation,1)

def paint_stone(obj):
    mesh=obj.data; mesh.materials.clear(); mesh.materials.append(STONE)
    uv=mesh.uv_layers.new(name='Continuous geological projection')
    cols=mesh.color_attributes.new(name='PaintedLight',type='FLOAT_COLOR',domain='CORNER')
    for face in mesh.polygons:
        n=face.normal
        for i in face.loop_indices:
            p=mesh.vertices[mesh.loops[i].vertex_index].co
            if abs(n.z)>.7: u,v=p.x/20+.18,p.y/20+.32
            elif abs(n.y)>=abs(n.x): u,v=p.x/24+.18,p.z/39+.56
            else: u,v=p.y/24+.18,p.z/39+.56
            uv.data[i].uv=(u,v)
            cols.data[i].color=stone_color(n,p)

# Stable IDs preserve the existing demo links. Shape names reflect the new assets.
VARIANTS=[('crown-wall','Sanctuary',13.0,10.0,1.0,811),
          ('stepped-ledge','Garden ledge',14.1,9.4,.90,922),
          ('high-buttress','Watchtower',10.8,10.5,1.10,1033)]

def cliff_shell(slug,rx,ry,height,rng,collection):
    count=32
    # Alternating projecting ribs / eroded clefts continue through the shell.
    angles=[math.tau*i/count+rng.uniform(-.025,.025) for i in range(count)]
    outline=[1+rng.uniform(-.10,.10)-(.16 if i%4==1 else 0) for i in range(count)]
    levels=[(-25,.045),(-19,.25),(-11,.53),(-3,.84),(5,.98),(11.6,1),(13,1)]
    def plan(a):
        # Squared, broken shoulders, like joined weathered stone strata.
        return (math.copysign(abs(math.cos(a))**.68,math.cos(a)),
                math.copysign(abs(math.sin(a))**.72,math.sin(a)))
    def summit(x,y):
        # Broad rear terrace and a lower front shelf, rather than a flat disk.
        return 13+.12*x+.35*y+(1.65 if y>2.5 else 0)-(.8 if x>rx*.45 else 0)
    points=[]
    for j,(z,scale) in enumerate(levels):
        for i,a in enumerate(angles):
            radius=outline[i]*scale*(1+rng.uniform(-.035,.035))
            px,py=plan(a)
            x=px*rx*radius+(1-scale)*3.4
            y=py*ry*radius-(1-scale)*1.4
            top_relief=summit(x,y)-13
            zz=(z+(top_relief if j>=5 else rng.uniform(-2.2,2.2)))*height
            points.append((x,y,zz))
    faces=[]
    for j in range(len(levels)-1):
        for i in range(count):
            a=j*count+i; b=j*count+(i+1)%count; c=b+count; d=a+count
            # Broad coherent plates with sparse chipped diagonal fractures.
            faces.append((a,b,c,d))
    faces.append(tuple(reversed(range(count))))
    outer=(len(levels)-1)*count
    # Terraced summit: inner rings remain welded to the rim and share its slope.
    for ratio in [.70,.36]:
        inner=len(points)
        for i,a in enumerate(angles):
            px,py=plan(a)
            x=px*rx*outline[i]*ratio
            y=py*ry*outline[i]*ratio
            z=summit(x,y)*height
            points.append((x,y,z))
        for i in range(count):
            faces.append((outer+i,outer+(i+1)%count,inner+(i+1)%count,inner+i))
        outer=inner
    center=len(points); points.append((0,0,13*height))
    for i in range(count): faces.append((outer+i,outer+(i+1)%count,center))
    mesh=bpy.data.meshes.new(slug+'-continuous-fractured-stone')
    mesh.from_pydata(points,[],faces); mesh.update()
    bm=bmesh.new(); bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces)); bm.to_mesh(mesh); bm.free()
    obj=bpy.data.objects.new(mesh.name,mesh); collection.objects.link(obj); paint_stone(obj)
    return obj,angles,outline

# Geometric stone detail uses exactly the same projected texture and shading.
def stone_poly(builder,pts):
    n=(Vector(pts[1])-Vector(pts[0])).cross(Vector(pts[2])-Vector(pts[0])).normalized()
    center=sum((Vector(p) for p in pts),Vector())/len(pts)
    uv=[]
    for p in pts:
        p=Vector(p)
        uv.append((p.x/20+.18,p.y/20+.32) if abs(n.z)>.7 else
                  ((p.x/24+.18,p.z/39+.56) if abs(n.y)>=abs(n.x) else (p.y/24+.18,p.z/39+.56)))
    builder.face(pts,stone_color(n,center),uv)

def ashlar(builder,center,size,rng,rotation=0):
    x,y,z=center; w,d,h=size
    ring=[(-.42,-.5),(.36,-.5),(.5,-.36),(.5,.37),(.36,.5),(-.36,.5),(-.5,.32),(-.5,-.34)]
    points=[]
    for dz,scale in [(-.5,.94),(.5,1)]:
        for u,v in ring:
            u=(u+rng.uniform(-.035,.035))*w*scale; v=(v+rng.uniform(-.035,.035))*d*scale
            points.append((x+u*math.cos(rotation)-v*math.sin(rotation),y+u*math.sin(rotation)+v*math.cos(rotation),z+dz*h+rng.uniform(-.035,.035)))
    for i in range(8): stone_poly(builder,[points[i],points[(i+1)%8],points[(i+1)%8+8],points[i+8]])
    stone_poly(builder,[points[i] for i in range(8,16)])
    stone_poly(builder,[points[i] for i in reversed(range(8))])

def limb(builder,points,radii,rng):
    for j in range(len(points)-1):
        a,b=Vector(points[j]),Vector(points[j+1]); direction=(b-a).normalized()
        side=direction.cross(Vector((0,1,0))).normalized(); other=direction.cross(side)
        for k in range(7):
            aa=k/7*math.tau; bb=(k+1)/7*math.tau
            p=[a+(side*math.cos(aa)+other*math.sin(aa))*radii[j],
               a+(side*math.cos(bb)+other*math.sin(bb))*radii[j],
               b+(side*math.cos(bb)+other*math.sin(bb))*radii[j+1],
               b+(side*math.cos(aa)+other*math.sin(aa))*radii[j+1]]
            light=.6+.4*max(0,(side*math.cos(aa)+other*math.sin(aa)).dot(SUN))
            builder.face(p,(.23*light,.18*light,.125*light,1))

# Atlas quadrants: pine / scrub / hanging ivy / moss. UVs keep an inset so
# bilinear filtering and mipmaps cannot pick up neighboring atlas assets.
UV_RECTS=[(.005,.505,.495,.995),(.505,.505,.995,.995),(.005,.005,.495,.495),(.505,.005,.995,.495)]
def foliage_card(builder,center,right,up,width,height,kind,tint=(1,1,1,1),curve=.0):
    c=Vector(center); r=Vector(right).normalized()*width*.5; u=Vector(up).normalized()*height*.5
    uv=UV_RECTS[kind]; u0,v0,u1,v1=uv
    corners=[c-r-u,c+r-u,c+r+u,c-r+u]
    if curve:
        mid=c+r.cross(u).normalized()*curve
        tex=[(u0,v0),(u1,v0),(u1,v1),(u0,v1)]
        for i in range(4): builder.face([corners[i],corners[(i+1)%4],mid],tint,[tex[i],tex[(i+1)%4],((u0+u1)/2,(v0+v1)/2)])
    else: builder.face(corners,tint,[(u0,v0),(u1,v0),(u1,v1),(u0,v1)])

def dress_cliff(rock,slug,rx,ry,h,rng,collection,angles,outline):
    stone=MeshBuilder(slug+'-ruins-path-and-splintered-ledges',STONE,collection)
    growth=MeshBuilder(slug+'-summit-soil-and-bent-trunks',COLOR,collection)
    leaves=MeshBuilder(slug+'-painted-pine-ivy-and-moss',FOLIAGE,collection)
    def surface(x,y):
        hit,p,n,_=rock.ray_cast(Vector((x,y,25)),Vector((0,0,-1)))
        return p if hit and n.z>.45 else None
    # Face plates conform to the shell: create overlapping chips and projecting
    # flanges so the silhouette has irregular shoulders, not smooth cones.
    for i,a in enumerate(angles):
        if i%3==1: continue
        for zfrac in ([.82,.52] if i%2==0 else [.70]):
            z=(-25+38*zfrac)*h
            radial=.045+zfrac*.96
            x=math.cos(a)*rx*outline[i]*radial; y=math.sin(a)*ry*outline[i]*radial
            start=Vector((math.cos(a)*rx*1.5,math.sin(a)*ry*1.5,z))
            direction=Vector((-math.cos(a),-math.sin(a),0))
            hit,p,n,_=rock.ray_cast(start,direction)
            if not hit: continue
            tangent=Vector((-math.sin(a),math.cos(a),0)); out=Vector((math.cos(a),math.sin(a),0))
            w=rng.uniform(.6,1.3); length=rng.uniform(2,5)
            top=p+Vector((0,0,length*.45)); bottom=p-Vector((0,0,length*.55))
            pts=[top-tangent*w,top+tangent*w,top+tangent*.7*w+out*.5,
                 bottom+tangent*.3*w+out*.20,bottom-tangent*.2*w+out*.15,top-tangent*.75*w+out*.45]
            stone_poly(stone,[pts[0],pts[1],pts[2],pts[5]])
            stone_poly(stone,[pts[5],pts[2],pts[3],pts[4]])
            stone_poly(stone,[pts[0],pts[5],pts[4],bottom-tangent*.3*w])
    # Low grassy plates, with rock left exposed along the pathway and rim.
    for _ in range(190):
        x,y=rng.uniform(-rx*.91,rx*.91),rng.uniform(-ry*.91,ry*.91)
        root=surface(x,y)
        if root is None: continue
        # The lightly winding stone path remains legible across the summit.
        path_x=1.5*math.sin(y*.19)-1
        if abs(x-path_x)<1.1: continue
        size=rng.uniform(1.0,2.3)
        tint=rng.uniform(.62,.83)
        # Project each corner onto its actual terrace so mats do not float or
        # slice through the sloping summit.
        corners=[]
        for dx,dy in [(-1,-1),(1,-1),(1,1),(-1,1)]:
            p=surface(x+dx*size,y+dy*size*.8)
            if p is None: break
            corners.append(p+Vector((0,0,.065)))
        if len(corners)==4:
            leaves.face(corners,(tint*.86,tint,tint*.76,1),[(.505,.005),(.995,.005),(.995,.495),(.505,.495)])
    # A connected, irregular grassy underlay; small triangles follow the surface.
    for _ in range(230):
        x,y=rng.uniform(-rx*.90,rx*.90),rng.uniform(-ry*.90,ry*.90)
        root=surface(x,y)
        if root is None or abs(x-(1.5*math.sin(y*.19)-1))<1.1: continue
        rad=rng.uniform(.7,1.6); pts=[]
        for j in range(7):
            a=j/7*math.tau; p=surface(x+math.cos(a)*rad,y+math.sin(a)*rad)
            if p is None: break
            pts.append(p+Vector((0,0,.025)))
        if len(pts)==7:
            tint=rng.uniform(.8,1.2)
            stone.face(pts,(.29*tint,.34*tint,.14*tint,1),[(p.x/20+.18,p.y/20+.32) for p in pts])
    # Broken pale flagstones lead to the ruined arch at the rear of the summit.
    for j in range(12):
        y=-ry*.65+j*(ry*1.10/12); x=1.5*math.sin(y*.19)-1
        root=surface(x,y)
        if root:
            ashlar(stone,root+Vector((0,0,.10)),(rng.uniform(1.55,2.5),rng.uniform(.9,1.5),.20),rng,rng.uniform(-.15,.15))
    # Ruined narrow sanctuary arch, based on the reference's tall stone doorway.
    ax,ay=-1,ry*.40; root=surface(ax,ay); az=root.z if root else 14*h
    for side in [-1,1]:
        px=ax+side*1.14
        ashlar(stone,(px,ay,az+.18),(1.55,1.65,.48),rng)
        ashlar(stone,(px,ay,az+.53),(1.12,1.22,.30),rng)
        for k in range(6):
            ashlar(stone,(px,ay,az+.85+k*.74),(.77,.91,.72),rng)
        ashlar(stone,(px,ay,az+5.1),(1.04,1.2,.35),rng)
        # Slender outer molding catches small painted highlights.
        ashlar(stone,(px+side*.31,ay-.36,az+2.85),(.20,.22,4.15),rng)
    # Polygonal voussoirs frame an actual open archway, visible from both sides.
    for k in range(9):
        a=k/9*math.pi; b=(k+1)/9*math.pi
        inner=.78; outer=1.52; z=az+4.45
        ring=[(math.cos(a)*inner,math.sin(a)*inner),(math.cos(b)*inner,math.sin(b)*inner),
              (math.cos(b)*outer,math.sin(b)*outer),(math.cos(a)*outer,math.sin(a)*outer)]
        front=[(ax+x,ay-.50,z+zz) for x,zz in ring]; back=[(ax+x,ay+.50,z+zz) for x,zz in ring]
        stone_poly(stone,list(reversed(front))); stone_poly(stone,back)
        for j in range(4): stone_poly(stone,[front[j],back[j],back[(j+1)%4],front[(j+1)%4]])
    for i in range(3):
        ashlar(stone,(ax+(i-1)*1.05,ay,az+6.05+(.14 if i==1 else 0)),(1.03,1.25,.55),rng)
    # Short broken companion pillar, fallen masonry and rim boulders.
    for k in range(3):
        p=surface(rx*.43,-ry*.1)
        if p: ashlar(stone,(p.x,p.y,p.z+.4+k*.67),(.78,.85,.65),rng,.07)
    for i in range(24):
        a=rng.uniform(0,math.tau); rad=rng.uniform(.72,.94)
        p=surface(math.cos(a)*rx*rad,math.sin(a)*ry*rad)
        if p: ashlar(stone,p+Vector((0,0,.25)),(rng.uniform(.5,1.8),rng.uniform(.55,1.5),rng.uniform(.3,.9)),rng,a)
    # Asymmetric old pines. Bent trunks, exposed roots and distinct flat boughs.
    tree_specs=[(-.58,.24,1.0),(.50,.34,.72),(.64,-.33,.49),(-.58,-.48,.42)]
    for tx,ty,scale in tree_specs:
        base=surface(tx*rx,ty*ry)
        if base is None: continue
        def point(x,y,z): return base+Vector((x,y,z))*scale
        trunk=[point(0,0,0),point(-.5,.1,1.3),point(-.2,.12,2.7),point(-1.2,.2,4.0),point(-2,.4,5.3)]
        limb(growth,trunk,[r*scale for r in [.48,.38,.28,.18,.06]],rng)
        for j in range(5):
            a=j/5*math.tau
            limb(growth,[point(math.cos(a)*1.6,math.sin(a)*1.3,.10),point(math.cos(a)*.8,math.sin(a)*.6,.28),point(0,0,.65)],
                 [.04*scale,.13*scale,.22*scale],rng)
        branches=[(2,(-3.1,-.4,3.6)),(2,(1.7,.2,3.65)),(3,(-3.6,.6,4.9)),(3,(.8,-.2,4.65)),(4,(-2.7,.5,5.65)),(2,(.1,1.7,3.9))]
        for j,(origin,end) in enumerate(branches):
            end=point(*end); start=trunk[origin]
            limb(growth,[start,start.lerp(end,.55)+Vector((0,0,-.25*scale)),end],
                 [.15*scale,.10*scale,.025*scale],rng)
            # Flat layered cards seen from top, side and below. The texture's
            # fine painted leaves break the silhouette instead of polygon balls.
            for k in range(3):
                center=end+Vector((rng.uniform(-.45,.45),rng.uniform(-.35,.35),k*.16))*scale
                yaw=rng.uniform(-.7,.7)
                right=Vector((math.cos(yaw),math.sin(yaw),.02))
                up=Vector((-math.sin(yaw)*.72,math.cos(yaw)*.72,.70 if k%2==0 else -.4))
                shade=rng.uniform(.82,1.04)
                foliage_card(leaves,center,right,up,4.6*scale,3.0*scale,0,(shade*.96,shade,shade*.94,1),.24*scale)
    # Ivy hugs the cliff from roots on its real perimeter, with varied lengths.
    vines=0
    for i,a in enumerate(angles):
        if i%3==0: continue
        # Query the true cliff edge at each angle, including the squared ribs.
        px=math.copysign(abs(math.cos(a))**.68,math.cos(a))
        py=math.copysign(abs(math.sin(a))**.72,math.sin(a))
        x=px*rx*outline[i]*.97; y=py*ry*outline[i]*.97
        p=surface(x,y)
        if p is None: continue
        length=rng.uniform(5.2,17.0); width=rng.uniform(1.4,2.6)
        tangent=Vector((-math.sin(a),math.cos(a),0)); outward=Vector((math.cos(a),math.sin(a),0))
        # Follow the narrowing body with a curved segmented strip. Its top is
        # embedded in the shelf; tips peel gently away from the stone.
        top=p+outward*.25+Vector((0,0,.12))
        u0,v0,u1,v1=UV_RECTS[2]
        for segment in range(5):
            coords=[]; uvs=[]
            for s,side in [(segment+1,-1),(segment+1,1),(segment,1),(segment,-1)]:
                t=s/5; z=top.z-t*length
                start=Vector((math.cos(a)*rx*1.7,math.sin(a)*ry*1.7,z))
                hit,surf,_,_=rock.ray_cast(start,-outward)
                center=surf+outward*(.20+.15*t) if hit else top-Vector((0,0,t*length))
                coords.append(center+tangent*(side*width*.5))
                uvs.append((u0 if side<0 else u1,v1-(v1-v0)*t))
            leaves.face(coords,(.75,.82,.68,1),uvs)
        vines+=1
        foliage_card(leaves,p+Vector((0,0,.27)),tangent,(0,0,1),width*1.6,1.4,1,(.85,.89,.80,1))
    # Small shrubs break the summit edge without obscuring the stone face.
    for i in range(30):
        a=rng.uniform(0,math.tau); p=surface(math.cos(a)*rx*.83,math.sin(a)*ry*.83)
        if p:
            foliage_card(leaves,p+Vector((0,0,.40)),(math.cos(a),math.sin(a),0),(0,0,1),rng.uniform(1,2),rng.uniform(.8,1.5),1,(.9,.94,.85,1))
    return stone.finish(),growth.finish(),leaves.finish(),vines

def export_mesh(obj):
    positions=[]; normals=[]; uvs=[]; colors=[]
    mesh=obj.data; mesh.calc_loop_triangles()
    for tri in mesh.loop_triangles:
        for i in tri.loops:
            loop=mesh.loops[i]; p=mesh.vertices[loop.vertex_index].co; n=mesh.polygons[tri.polygon_index].normal
            positions.extend(round(v,5) for v in (p.x,p.z,-p.y))
            normals.extend(round(v,5) for v in (n.x,n.z,-n.y))
            uvs.extend(round(v,6) for v in mesh.uv_layers.active.data[i].uv)
            colors.extend(round(v,6) for v in mesh.color_attributes['PaintedLight'].data[i].color)
    bounds=[[min(positions[k::3]) for k in range(3)],[max(positions[k::3]) for k in range(3)]]
    return dict(positions=positions,normals=normals,uvs=uvs,colors=colors,bounds=bounds,triangles=len(positions)//9)

def bake_contact_shading(objects):
    """Bake soft contact occlusion and broken foliage shadows into vertex paint.
    The browser remains unlit; shadow rays respect the foliage atlas alpha.
    """
    vertices=[]; triangles=[]; texture_uv=[]
    for obj in objects:
        mesh=obj.data; mesh.calc_loop_triangles(); offset=len(vertices)
        vertices.extend(v.co.copy() for v in mesh.vertices)
        cutout=obj.data.materials[0]==FOLIAGE
        for tri in mesh.loop_triangles:
            triangles.append(tuple(offset+i for i in tri.vertices))
            texture_uv.append([Vector((*mesh.uv_layers.active.data[i].uv,0)) for i in tri.loops] if cutout else None)
    bvh=BVHTree.FromPolygons(vertices,triangles,all_triangles=True)
    atlas=next(n.image for n in FOLIAGE.node_tree.nodes if n.type=='TEX_IMAGE')
    pixels=atlas.pixels[:]; width,height=atlas.size
    def occluded(origin,direction,distance):
        for _ in range(12):
            point,normal,index,length=bvh.ray_cast(origin,direction,distance)
            if point is None: return False
            uv=texture_uv[index]
            if uv is None: return True
            a,b,c=(vertices[i] for i in triangles[index])
            sample=barycentric_transform(point,a,b,c,*uv)
            x=min(width-1,max(0,int(sample.x*width)))
            y=min(height-1,max(0,int(sample.y*height)))
            if pixels[(y*width+x)*4+3]>.35: return True
            distance-=length+.04
            if distance<=0: return False
            origin=point+direction*.04
        return False
    for obj in objects:
        mesh=obj.data; colors=mesh.color_attributes['PaintedLight']
        is_leaf=mesh.materials[0]==FOLIAGE
        for face in mesh.polygons:
            n=face.normal
            tangent=n.cross(Vector((0,0,1)))
            if tangent.length<.1: tangent=n.cross(Vector((0,1,0)))
            tangent.normalize(); other=n.cross(tangent)
            for i in face.loop_indices:
                p=mesh.vertices[mesh.loops[i].vertex_index].co
                # Bias towards the face interior avoids self intersections at
                # welded sharp corners while retaining crevice occlusion.
                origin=p.lerp(face.center,.025)+n*.065
                blocked=0
                for j in range(6):
                    angle=j/6*math.tau+.4
                    ray=(n*.65+tangent*math.cos(angle)*.72+other*math.sin(angle)*.72).normalized()
                    blocked+=occluded(origin,ray,3.4)
                shade=1-.32*blocked/6
                if n.dot(SUN)>.0 and occluded(origin,SUN,30): shade*=.72
                if is_leaf: shade=max(.70,shade)
                old=colors.data[i].color
                colors.data[i].color=(*[v*shade for v in old[:3]],old[3])

variants=[]
for index,(slug,title,rx,ry,h,seed) in enumerate(VARIANTS):
    collection=bpy.data.collections.new(title); bpy.context.scene.collection.children.link(collection)
    rng=random.Random(seed)
    rock,angles,outline=cliff_shell(slug,rx,ry,h,rng,collection)
    details,greenery,foliage,vines=dress_cliff(rock,slug,rx,ry,h,rng,collection,angles,outline)
    objects=[rock,details,greenery,foliage]
    bake_contact_shading(objects)
    variants.append(dict(id=slug,name=title,**export_mesh(rock),details=export_mesh(details),greenery=export_mesh(greenery),foliage=export_mesh(foliage),trees=4,vines=vines))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.select_set(True)
    bpy.context.view_layer.objects.active=rock
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'{slug}.glb'),export_format='GLB',use_selection=True,
                              export_vertex_color='NAME',export_vertex_color_name='PaintedLight')
    for obj in objects: obj.location.x+=(index-1)*38

with open(OUT/'cliffs.mesh.json','w') as f:
    json.dump(dict(version=2,source='Blender',texture='painted-stone.png',foliageTexture='painted-foliage.png',variants=variants),f,separators=(',',':'))
scene=bpy.context.scene
scene.world.color=(.25,.27,.30)
camera_data=bpy.data.cameras.new('Asset review camera'); camera=bpy.data.objects.new('Asset review camera',camera_data)
scene.collection.objects.link(camera); camera.location=(35,-145,74)
camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type='ORTHO'; camera_data.ortho_scale=118; scene.camera=camera
scene.view_settings.view_transform='Standard'
scene.render.resolution_x=1920; scene.render.resolution_y=1100; scene.render.resolution_percentage=100
scene.render.engine='CYCLES'; scene.cycles.samples=24; scene.cycles.device='CPU'
scene.render.image_settings.file_format='PNG'; scene.render.filepath=str(SOURCE/'blender-assets-preview.png')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'painted-cliffs.blend'))
bpy.ops.render.render(write_still=True)
# Large hero render to inspect how the actual materials, cutouts and silhouette
# work together. No concept painting is substituted for this model render.
for collection in list(bpy.data.collections):
    if collection.name in ['Garden ledge','Watchtower']: collection.hide_render=True
camera.location=(-1,-69,40)
camera.rotation_euler=(Vector((-38,0,-1))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.ortho_scale=55
scene.render.resolution_x=1200; scene.render.resolution_y=1400
scene.render.filepath=str(SOURCE/'sanctuary-model-preview.png')
bpy.ops.render.render(write_still=True)
print('FLIGHT_CLIFFS',json.dumps([dict(name=v['name'],rock=v['triangles'],details=v['details']['triangles'],greenery=v['greenery']['triangles'],foliage=v['foliage']['triangles'],vines=v['vines']) for v in variants]))
