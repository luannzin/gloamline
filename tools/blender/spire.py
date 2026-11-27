# The Pale Spire: the landmark on the northern horizon. An octagonal tower in five tiers, each
# narrower than the one below, with a cornice, tall lancet windows and a pinnacle at every corner;
# flying buttresses round its foot; a crown broken open where the beam comes out. Real scale:
# about 330 m tall, foot at 0, centred on the origin.
#
#   blender -b --factory-startup -t 4 --python tools/blender/spire.py -- apps/client/public/models/spire.glb
#
# COLOR_0.g = 1 on the window glass (it glows), 0 on stone. Deterministic.
import math
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

out = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bm = bmesh.new()
col = bm.verts.layers.float_color.new("Col")


def mark(verts, glass=0.0):
    for v in verts:
        v[col] = (0.0, glass, 0.0, 1.0)


def prism(cx, cy, z0, z1, r0, r1, sides=8, rot=0.0):
    res = bmesh.ops.create_cone(bm, cap_ends=True, segments=sides, radius1=r0, radius2=r1, depth=z1 - z0)
    bmesh.ops.rotate(bm, verts=res["verts"], cent=(0, 0, 0), matrix=Matrix.Rotation(rot, 3, "Z"))
    bmesh.ops.translate(bm, verts=res["verts"], vec=(cx, cy, (z0 + z1) / 2))
    mark(res["verts"])
    return res


def pinnacle(x, y, z, h, r):
    prism(x, y, z, z + h * 0.55, r, r * 0.9, 4, math.pi / 4)
    prism(x, y, z + h * 0.55, z + h, r * 1.1, 0.05, 4, math.pi / 4)


tiers = [  # z0, height, radius
    (0, 95, 21),
    (95, 75, 16.5),
    (170, 62, 13),
    (232, 50, 10),
    (282, 40, 7.5),
]
for k, (z0, h, r) in enumerate(tiers):
    shaft = prism(0, 0, z0, z0 + h, r, r * 0.93, 8, math.pi / 8)
    # lancet windows: on each of the eight faces, inset a tall panel and push it in
    faces = {f for v in shaft["verts"] for f in v.link_faces}
    for f in faces:
        f.normal_update()
    side = [f for f in faces if abs(f.normal.z) < 0.5]
    bmesh.ops.inset_individual(bm, faces=side, thickness=r * 0.28, depth=0)
    for f in side:
        # keep the window tall and narrow: pull its top and bottom in toward the middle
        c = f.calc_center_median()
        for v in f.verts:
            v.co.z = c.z + (v.co.z - c.z) * 0.62
        bmesh.ops.translate(bm, verts=f.verts, vec=-f.normal * r * 0.06)
        mark(f.verts, glass=1.0)
    # the cornice: a wider, shallow band on top
    prism(0, 0, z0 + h - 2.5, z0 + h + 1.5, r * 1.12, r * 1.08, 8, math.pi / 8)
    # a pinnacle at each corner of the cornice
    for i in range(8):
        a = (i + 0.5) / 8 * math.tau + math.pi / 8
        pinnacle(math.cos(a) * r * 1.05, math.sin(a) * r * 1.05, z0 + h + 1.5, 9 + r * 0.4, 0.9 + r * 0.05)

# flying buttresses: eight, from a pier out on the ground up to the first tier's shoulder
for i in range(8):
    a = i / 8 * math.tau + math.pi / 8
    dx, dy = math.cos(a), math.sin(a)
    px, py = dx * 46, dy * 46
    prism(px, py, -2, 38, 3.2, 2.4, 4, a + math.pi / 4)
    pinnacle(px, py, 38, 14, 2.2)
    # the arch: a chain of blocks from the pier's top to the tower
    n = 9
    for s in range(n):
        t0, t1 = s / n, (s + 1) / n
        p0 = Vector((px * (1 - t0) + dx * 21 * t0, py * (1 - t0) + dy * 21 * t0, 34 + math.sin(t0 * math.pi * 0.5) * 40))
        p1 = Vector((px * (1 - t1) + dx * 21 * t1, py * (1 - t1) + dy * 21 * t1, 34 + math.sin(t1 * math.pi * 0.5) * 40))
        mid = (p0 + p1) / 2
        d = p1 - p0
        res = bmesh.ops.create_cube(bm, size=1)
        bmesh.ops.scale(bm, verts=res["verts"], vec=(d.length + 0.4, 1.6, 2.2))
        yaw = math.atan2(d.y, d.x)
        pitch = math.atan2(d.z, math.hypot(d.x, d.y))
        bmesh.ops.rotate(bm, verts=res["verts"], cent=(0, 0, 0), matrix=Matrix.Rotation(yaw, 3, "Z") @ Matrix.Rotation(-pitch, 3, "Y"))
        bmesh.ops.translate(bm, verts=res["verts"], vec=mid)
        mark(res["verts"])

# the broken crown: a ragged ring of stumps where the top fell in
zc = 322
for i in range(16):
    a = i / 16 * math.tau
    h = 4 + 14 * (0.5 + 0.5 * noise.noise(Vector((math.cos(a) * 2, math.sin(a) * 2, 0.3))))
    prism(math.cos(a) * 6.2, math.sin(a) * 6.2, zc, zc + h, 1.6, 0.8, 4, a)

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new("spire")
bm.to_mesh(me)
bm.free()
ob = bpy.data.objects.new("spire", me)
bpy.context.collection.objects.link(ob)
bev = ob.modifiers.new("bevel", "BEVEL")
bev.width = 0.25
bev.segments = 1
bev.limit_method = "ANGLE"

bpy.ops.export_scene.gltf(
    filepath=out,
    export_format="GLB",
    export_apply=True,
    export_materials="NONE",
    export_texcoords=False,
    export_normals=True,
    export_vertex_color="ACTIVE",
    export_yup=True,
)
print("wrote", out)
