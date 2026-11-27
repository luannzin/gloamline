# Trees for Zimovye: broadleaf oaks and dead trees, grown by space colonization (Runions 2007)
# into a crown envelope, thickened by the pipe model (a parent's area is its children's), skinned
# into one merged trunk-and-branch mesh, and crowned with twig cards. Two levels of detail each.
#
#   blender -b --factory-startup -t 4 --python tools/blender/trees.py -- apps/client/public/models/trees.glb
#
# Every leaf vertex carries COLOR_0 = (sway, ao, 0, 1): how far it moves in the wind and how much sky
# it sees from inside the crown. Leaf UVs use the game's atlas (cell 0, 0: broadleaf; 1, 1: moss),
# with v up as in three.js; models.ts flips them back after glTF's flip. Deterministic.
import math
import random
import sys

import bmesh
import bpy
from mathutils import Vector, kdtree, noise

out = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)


def grow(rng, trunk_h, lean, center, radii, attractors, step=0.42, influence=2.4, kill=0.85, iters=90):
    """Space colonization: returns nodes (positions) and their parents (-1 for the root)."""
    pts = []
    while len(pts) < attractors:
        p = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1)))
        if p.length > 1:
            continue
        # lumpy envelope: some lobes reach further than others
        lump = 1 + 0.25 * noise.noise(p * 2.2 + Vector((rng.random() * 0, 3.1, 7.7)))
        q = Vector((p.x * radii.x, p.y * radii.y, p.z * radii.z)) * lump + center
        pts.append(q)
    nodes = [Vector((0, 0, -0.6))]
    parents = [-1]
    # the trunk, straight-ish up to where the crown starts
    d = Vector((lean.x, lean.y, 1)).normalized()
    while nodes[-1].z < trunk_h:
        nodes.append(nodes[-1] + d * step)
        parents.append(len(nodes) - 2)
        d = (d + Vector((rng.uniform(-0.06, 0.06), rng.uniform(-0.06, 0.06), 0))).normalized()
    alive = pts
    for _ in range(iters):
        if not alive:
            break
        tree = kdtree.KDTree(len(nodes))
        for i, n in enumerate(nodes):
            tree.insert(n, i)
        tree.balance()
        pull = {}
        for a in alive:
            co, i, dist = tree.find(a)
            if dist < influence:
                pull.setdefault(i, Vector()).__iadd__((a - co).normalized())
        if not pull:
            break
        for i, v in pull.items():
            v = (v.normalized() + Vector((0, 0, 0.12))).normalized()
            nodes.append(nodes[i] + v * step)
            parents.append(i)
        tree = kdtree.KDTree(len(nodes))
        for i, n in enumerate(nodes):
            tree.insert(n, i)
        tree.balance()
        alive = [a for a in alive if tree.find(a)[2] > kill]
    return nodes, parents


def radii_of(nodes, parents, tip=0.022, flare=1.25):
    """Pipe model: a node's radius squared is the sum of its children's."""
    n = len(nodes)
    kids = [[] for _ in range(n)]
    for i, p in enumerate(parents):
        if p >= 0:
            kids[p].append(i)
    r = [0.0] * n
    for i in range(n - 1, -1, -1):
        r[i] = tip if not kids[i] else math.sqrt(sum(r[k] ** 2 for k in kids[i]))
    r[0] *= flare
    if n > 1:
        r[1] *= (1 + flare) / 2
    return r


def bark(name, nodes, parents, r, min_r, subdiv, ratio, seed):
    keep = [i for i in range(len(nodes)) if r[i] >= min_r]
    index = {i: k for k, i in enumerate(keep)}
    me = bpy.data.meshes.new(name)
    verts = [nodes[i] for i in keep]
    edges = [(index[parents[i]], index[i]) for i in keep if parents[i] >= 0 and parents[i] in index]
    me.from_pydata(verts, edges, [])
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    skin = ob.modifiers.new("skin", "SKIN")
    skin.use_smooth_shade = True
    sv = me.skin_vertices[""].data
    for k, i in enumerate(keep):
        sv[k].radius = (r[i], r[i])
        sv[k].use_root = k == 0
    if subdiv:
        s = ob.modifiers.new("subdiv", "SUBSURF")
        s.levels = subdiv
        s.render_levels = subdiv
    tex = bpy.data.textures.new(f"{name}_bark", "CLOUDS")
    tex.noise_scale = 0.35
    disp = ob.modifiers.new("bark", "DISPLACE")
    disp.texture = tex
    disp.strength = 0.05
    disp.mid_level = 0.5
    if ratio < 1:
        dec = ob.modifiers.new("decimate", "DECIMATE")
        dec.ratio = ratio
    return ob


def leaves(name, cards, center, radius):
    """Cards: (position, size, facing, cell, hang). Normals point out of the crown."""
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    col = bm.verts.layers.float_color.new("Col")
    normals = []
    for p, size, face, cell, hang in cards:
        out_v = Vector(((p.x - center.x), (p.y - center.y), (p.z - center.z) * 1.3))
        depth = min(1.0, out_v.length / radius)
        out_v.normalize()
        ao = max(0.3, min(1.0, 0.25 + depth * 0.85)) * (0.8 if p.z < center.z - 1 else 1.0)
        f = face.normalized()
        side = Vector((0, 0, 1)).cross(f)
        if side.length < 1e-3:
            side = Vector((1, 0, 0))
        side.normalize()
        up = f.cross(side).normalized()
        if hang:
            up = Vector((0, 0, 1))
        roll = random.random() * 6.283 if not hang else 0
        X = side * math.cos(roll) + up * math.sin(roll)
        Y = up * math.cos(roll) - side * math.sin(roll)
        w = size / 2
        oy = -size / 2 if hang else 0
        u0, v0 = cell[0] * 0.5, (1 - cell[1]) * 0.5
        quad = []
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            v = bm.verts.new(p + X * (sx * w) + Y * (sy * w + oy))
            v[col] = (1.0 if not hang else 0.9, ao, 0.0, 1.0)
            quad.append((v, (u0 + (sx + 1) * 0.25, v0 + (sy + 1) * 0.25)))
            normals.append(Vector((out_v.x, out_v.y, 0.2 if hang else out_v.z)).normalized())
        face_ = bm.faces.new([q[0] for q in quad])
        for loop, (_, uv) in zip(face_.loops, quad):
            loop[uv_layer].uv = uv
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.normals_split_custom_set_from_vertices(normals)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def oak(seed):
    rng = random.Random(seed)
    random.seed(seed)
    H = 3.6 + rng.random() * 1.4
    lean = Vector((rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12), 0))
    radii = Vector((5.2 + rng.random() * 1.6, 5.2 + rng.random() * 1.6, 3.6 + rng.random() * 1.2))
    center = Vector((lean.x * 6, lean.y * 6, H + radii.z * 0.85))
    nodes, parents = grow(rng, H, lean, center, radii, 1400)
    r = radii_of(nodes, parents)
    bark(f"oak{seed}_bark_lod0", nodes, parents, r, 0.045, 1, 0.18, seed)
    bark(f"oak{seed}_bark_lod1", nodes, parents, r, 0.07, 0, 0.35, seed)
    twigs = [i for i in range(len(nodes)) if r[i] < 0.05 and nodes[i].z > H * 0.8]
    near = []
    for i in rng.sample(twigs, min(len(twigs), 720)):
        o = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.6, 1))) * 0.45
        p = nodes[i] + o
        out_v = (p - center).normalized()
        face = Vector((rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), rng.uniform(-0.3, 0.5))) + out_v * 0.9
        near.append((p, 1.05 + rng.random() * 0.6, face, (0, 0), False))
    # moss hanging from the lower limbs
    lows = [i for i in range(len(nodes)) if 0.06 < r[i] < 0.2 and nodes[i].z < center.z]
    for i in rng.sample(lows, min(len(lows), 4)):
        near.append((nodes[i], 0.9 + rng.random() * 1.2, Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), 0)), (1, 1), True))
    R = (radii.x + radii.y + radii.z) / 3
    leaves(f"oak{seed}_leaves_lod0", near, center, R)
    # far: one big card per 1.8 m cell of twigs
    cells = {}
    for i in twigs:
        k = tuple(math.floor(c / 1.8) for c in nodes[i])
        cells.setdefault(k, []).append(nodes[i])
    far = []
    for pts in cells.values():
        p = sum(pts, Vector()) / len(pts)
        far.append((p, 3.0 + rng.random() * 1.0, (p - center).normalized() + Vector((rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), 0.2)), (0, 0), False))
    leaves(f"oak{seed}_leaves_lod1", far, center, R)


def dead(seed):
    rng = random.Random(seed)
    H = 2.8 + rng.random() * 2
    lean = Vector((rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), 0))
    radii = Vector((3.2 + rng.random(), 3.2 + rng.random(), 3 + rng.random()))
    center = Vector((lean.x * 5, lean.y * 5, H + radii.z * 0.9))
    nodes, parents = grow(rng, H, lean, center, radii, 260, step=0.4, influence=2.8, kill=1.1)
    r = radii_of(nodes, parents, tip=0.03, flare=1.4)
    bark(f"dead{seed}_bark_lod0", nodes, parents, r, 0.032, 1, 0.35, seed)
    bark(f"dead{seed}_bark_lod1", nodes, parents, r, 0.055, 0, 0.4, seed)


for s in range(4):
    oak(s)
for s in range(3):
    dead(s)

bpy.ops.export_scene.gltf(
    filepath=out,
    export_format="GLB",
    export_apply=True,
    export_materials="NONE",
    export_texcoords=True,
    export_normals=True,
    export_vertex_color="ACTIVE",
    export_yup=True,
)
print("wrote", out)
