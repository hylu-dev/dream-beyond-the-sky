"""Blender background build. Rebuilds only this asset scene, never a user's file.
Blender --background --factory-startup --python tools/build-flight-cliffs.py
"""
import bpy
import bmesh
import json
import math
import random
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/flight/cliffs'
SOURCE = ROOT / 'art/flight-cliffs'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
image = bpy.data.images.load(str(OUT / 'painted-stone.png'))
image.pack()

mat = bpy.data.materials.new('Painted stone — soft baked light')
mat.use_nodes = True
nodes = mat.node_tree.nodes
nodes.clear()
output = nodes.new('ShaderNodeOutputMaterial')
texture = nodes.new('ShaderNodeTexImage')
texture.image = image
color = nodes.new('ShaderNodeVertexColor')
color.layer_name = 'PaintedLight'
multiply = nodes.new('ShaderNodeMixRGB')
multiply.blend_type = 'MULTIPLY'
multiply.inputs[0].default_value = 1
links = mat.node_tree.links
links.new(texture.outputs['Color'], multiply.inputs[1])
links.new(color.outputs['Color'], multiply.inputs[2])
# Direct colour output is Blender's unlit surface and exports as
# KHR_materials_unlit, retaining the painted vertex colour multiplication.
links.new(multiply.outputs[0], output.inputs['Surface'])

green_mat = bpy.data.materials.new('Quiet olive summit growth')
green_mat.use_nodes = True
green_mat.node_tree.nodes.clear()
green_output = green_mat.node_tree.nodes.new('ShaderNodeOutputMaterial')
green_color = green_mat.node_tree.nodes.new('ShaderNodeVertexColor')
green_color.layer_name = 'PaintedLight'
green_mat.node_tree.links.new(green_color.outputs['Color'], green_output.inputs['Surface'])

# Overlapping broad blocks, not scattered rocks or pointed island silhouettes.
# x, depth, width, depth-size, bottom, top (metres).
LAYOUTS = [
    ('crown-wall', 'Crown wall', [
        (-9, 1, 7, 7, -16, 14), (-3, 2, 7.5, 8, -18, 17),
        (3, 2, 7, 8, -16, 16), (9, 1, 7, 7, -13, 12),
        (-7, -3, 7, 6, -15, 6), (0, -3, 8, 6, -17, 9), (7, -3, 7, 5.5, -12, 3),
    ]),
    ('stepped-ledge', 'Stepped ledge', [
        (-8, 1, 7.5, 8, -14, 11), (-2, 2, 7.5, 9, -16, 14),
        (4, 2, 7.5, 8, -15, 12), (9, 1, 5.5, 7, -11, 8),
        (-6, -4, 9, 6.5, -14, 3), (2, -4, 9, 6, -13, 1),
    ]),
    ('high-buttress', 'High buttress', [
        (-5, 2, 7.5, 8, -19, 16), (1, 2, 8, 9, -18, 19),
        (7, 1, 6.5, 8, -16, 13), (-5, -3, 7, 6, -18, 7),
        (1, -4, 7.5, 6.5, -19, 4), (6, -3, 5.5, 6, -13, 0),
    ]),
]

def block(name, spec, rng, collection):
    x, y, w, d, low, high = spec
    # Chamfered corners keep broad faces while avoiding perfect boxes.
    ring = [(-.44,-.5),(.43,-.5),(.5,-.42),(.5,.43),(.42,.5),(-.44,.5),(-.5,.42),(-.5,-.43)]
    points = []
    ridge = [rng.uniform(-.035, .035) for _ in ring]
    for level, scale in [(low,.87),(low+(high-low)*.44,.98),(high-.45,1),(high,.97)]:
        for i,(u,v) in enumerate(ring):
            points.append((x+(u+ridge[i])*w*scale, y+(v+ridge[(i+3)%8])*d*scale, level+rng.uniform(-.22,.22)))
    faces = []
    for j in range(3):
        for i in range(8):
            faces.append((j*8+i,j*8+(i+1)%8,(j+1)*8+(i+1)%8,(j+1)*8+i))
    faces.append(tuple(reversed(range(8))))
    faces.append(tuple(range(24,32)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj

def paint_stone(obj):
    # One continuous projection over the united surface. Per-block UV offsets
    # previously made each column read like a separately wrapped object.
    mesh = obj.data
    mesh.materials.clear()
    mesh.materials.append(mat)
    uv = mesh.uv_layers.new(name='Painted stone UV')
    colors = mesh.color_attributes.new(name='PaintedLight', type='FLOAT_COLOR', domain='CORNER')
    for face in mesh.polygons:
        normal = face.normal
        sun = max(0, normal.dot(Vector((.62,-.65,.44)).normalized()))
        tint = (.78+sun*.2, .8+sun*.15, .9+sun*.06)
        if normal.z > .8:
            tint = (.54,.61,.42)
        for index in face.loop_indices:
            p = mesh.vertices[mesh.loops[index].vertex_index].co
            if abs(normal.z) > .8:
                u,v = p.x/17, p.y/17
            elif abs(normal.y) >= abs(normal.x):
                u,v = p.x/22, p.z/30
            else:
                u,v = p.y/22, p.z/30
            uv.data[index].uv = (u+.15, v+.5)
            colors.data[index].color = (*tint,1)
    return obj

def connect_blocks(slug, layout, rng, collection):
    # Broader shared shoulders and a continuous spine fill the narrow vertical
    # channels. The union removes buried walls and gives one connected shell.
    joined = [(x,y,w*1.16,d*1.08,low,high) for x,y,w,d,low,high in layout]
    min_x = min(x-w*.5 for x,y,w,d,low,high in joined)
    max_x = max(x+w*.5 for x,y,w,d,low,high in joined)
    low = min(s[4] for s in joined)+.8
    high = min(s[5] for s in joined[:4])-.6
    spine = ((min_x+max_x)*.5, .6, (max_x-min_x)*.96, 8.4, low, high)
    objects = [block(f'{slug}-shared-spine',spine,rng,collection)]
    objects += [block(f'{slug}-block-{i+1}',s,rng,collection) for i,s in enumerate(joined)]
    for obj in objects:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(obj.data)
        bm.free()
    rock = objects[0]
    bpy.context.view_layer.objects.active = rock
    for obj in objects[1:]:
        modifier = rock.modifiers.new('Join adjoining stone', 'BOOLEAN')
        modifier.operation = 'UNION'
        modifier.solver = 'EXACT'
        modifier.object = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        bpy.data.objects.remove(obj,do_unlink=True)
    rock.name = f'{slug}-continuous-cliff'
    bm = bmesh.new()
    bm.from_mesh(rock.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.0001)
    bmesh.ops.dissolve_limit(bm,angle_limit=.035,verts=list(bm.verts),edges=list(bm.edges))
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(rock.data)
    bm.free()
    rock.data.update()
    paint_stone(rock)
    return rock

def summit_growth(rock, slug, rng, collection):
    # Small irregular moss mats, low shrubs and occasional trailing leaves.
    # Ray-cast each root onto the actual ledges; nothing floats over a seam.
    vertices, faces, shades = [], [], []
    bounds = [v.co for v in rock.data.vertices]
    top = max(p.z for p in bounds)
    min_x,max_x = min(p.x for p in bounds),max(p.x for p in bounds)
    min_y,max_y = min(p.y for p in bounds),max(p.y for p in bounds)
    def surface(x,y):
        hit,point,normal,_ = rock.ray_cast(Vector((x,y,top+5)),Vector((0,0,-1)))
        return point if hit and normal.z>.65 else None
    def triangle(a,b,c,tint):
        start=len(vertices)
        vertices.extend([a,b,c])
        faces.append((start,start+1,start+2))
        shades.extend([tint]*3)
    patches = 0
    attempts = 0
    while patches<34 and attempts<450:
        attempts+=1
        x,y=rng.uniform(min_x+.5,max_x-.5),rng.uniform(min_y+.3,max_y-.3)
        root=surface(x,y)
        if root is None or root.z<top-12: continue
        # Keep growth sparse and low against the roughly 35 m rock face.
        radius=rng.uniform(.55,1.45)
        center=Vector((x,y,root.z+.1))
        tint=(rng.uniform(.09,.14),rng.uniform(.14,.20),rng.uniform(.055,.095),1)
        ring=[]
        for i in range(9):
            angle=i/9*math.tau
            distance=radius*rng.uniform(.7,1.1)
            p=surface(x+math.cos(angle)*distance,y+math.sin(angle)*distance*.7)
            if p is None or abs(p.z-root.z)>.5:
                p=root.lerp(center,.5)
            else: p.z+=.055
            ring.append(p)
        for i in range(9):
            shade=rng.uniform(.85,1.1)
            triangle(center,ring[i],ring[(i+1)%9],tuple(c*shade for c in tint[:3])+(1,))
        if patches%3==0:
            # Three overlapping, wind-flattened shrub lobes, not conical trees.
            for j in range(3):
                bx=x+(j-1)*.35; by=y+rng.uniform(-.15,.15)
                base=surface(bx,by)
                if base is None or abs(base.z-root.z)>.4: continue
                height=rng.uniform(.45,.85)
                peak=(bx-.16,by,base.z+height)
                for i in range(7):
                    a=i/7*math.tau; b=(i+1)/7*math.tau
                    triangle((bx+math.cos(a)*.65,by+math.sin(a)*.42,base.z+.04),
                             (bx+math.cos(b)*.65,by+math.sin(b)*.42,base.z+.04),peak,
                             (tint[0]*.85,tint[1]*.9,tint[2]*.85,1))
        patches+=1
    mesh=bpy.data.meshes.new(f'{slug}-summit-growth')
    mesh.from_pydata(vertices,[],faces)
    mesh.update()
    obj=bpy.data.objects.new(mesh.name,mesh)
    collection.objects.link(obj)
    mesh.materials.append(green_mat)
    uv=mesh.uv_layers.new(name='Growth UV')
    colors=mesh.color_attributes.new(name='PaintedLight',type='FLOAT_COLOR',domain='CORNER')
    for face in mesh.polygons:
        for index in face.loop_indices:
            colors.data[index].color=shades[mesh.loops[index].vertex_index]
    return obj,patches

def export_mesh(objects):
    positions, normals, uvs, colors = [], [], [], []
    for obj in objects:
        mesh = obj.data
        mesh.calc_loop_triangles()
        for tri in mesh.loop_triangles:
            for loop_index in tri.loops:
                loop = mesh.loops[loop_index]
                p = mesh.vertices[loop.vertex_index].co
                n = mesh.polygons[tri.polygon_index].normal
                positions.extend([round(p.x,5), round(p.z,5), round(-p.y,5)])
                normals.extend([round(n.x,5), round(n.z,5), round(-n.y,5)])
                uvs.extend(round(v,6) for v in mesh.uv_layers.active.data[loop_index].uv)
                colors.extend(round(v,6) for v in mesh.color_attributes['PaintedLight'].data[loop_index].color)
    bounds = [[min(positions[k::3]) for k in range(3)], [max(positions[k::3]) for k in range(3)]]
    return dict(positions=positions,normals=normals,uvs=uvs,colors=colors,bounds=bounds,triangles=len(positions)//9)

variants = []
for index,(slug,title,layout) in enumerate(LAYOUTS):
    collection = bpy.data.collections.new(title)
    bpy.context.scene.collection.children.link(collection)
    rng = random.Random(731+index)
    rock = connect_blocks(slug,layout,rng,collection)
    growth,patches = summit_growth(rock,slug,rng,collection)
    objects = [rock,growth]
    # Export the evaluated Blender geometry, UVs and authored colours to a
    # small direct runtime mesh. PlayCanvas: X right, Y up, Z depth.
    variants.append(dict(id=slug,name=title,blocks=len(layout),**export_mesh([rock]),
                         greenery=export_mesh([growth]),greeneryPatches=patches))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'{slug}.glb'), export_format='GLB', use_selection=True)
    # Put variants side by side in the editable source, after individual export.
    for obj in objects: obj.location.x += (index-1)*40

with open(OUT/'cliffs.mesh.json','w') as f:
    json.dump(dict(version=1, source='Blender', texture='painted-stone.png', variants=variants), f, separators=(',',':'))

scene = bpy.context.scene
scene.world.color = (.35,.39,.48)
camera_data = bpy.data.cameras.new('Asset review camera')
camera = bpy.data.objects.new('Asset review camera', camera_data)
scene.collection.objects.link(camera)
camera.location = (40,-125,50)
camera.rotation_euler = (Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 120
scene.camera = camera
scene.render.resolution_x = 1600
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.render.engine = 'CYCLES'
scene.cycles.samples = 16
scene.cycles.device = 'CPU'
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(SOURCE/'blender-assets-preview.png')
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'painted-cliffs.blend'))
bpy.ops.render.render(write_still=True)
print('FLIGHT_CLIFFS', json.dumps([dict(id=v['id'],blocks=v['blocks'],triangles=v['triangles'],bounds=v['bounds']) for v in variants]))
