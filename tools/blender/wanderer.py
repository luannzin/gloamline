# The wanderer other players see: a hooded figure in a long layered cloak over a leather coat,
# shoulder plates, boots, a sword across the back and a lantern on a short pole in the right hand.
# About 1.85 m tall, facing -z (the game's forward), feet at 0.
#
#   blender -b --factory-startup -t 4 --python tools/blender/wanderer.py -- apps/client/public/models/wanderer.glb
#
# COLOR_0: r = how much the vertex moves in the wind and the walk (0 at the shoulders, 1 at the
# cloak's hem), g = material (0 cloth, 0.33 leather, 0.66 iron, 1 the lantern's glass), b = 1 on
# the legs (they swing). Deterministic.
import math
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

out = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)

bm = bmesh.new()
col = bm.verts.layers.float_color.new("Col")


def paint(verts, sway, mat, leg=0.0):
    for v in verts:
        s = sway(v.co) if callable(sway) else sway
        v[col] = (s, mat, leg, 1.0)


def lathe(profile, segments, mat, sway, squash=(1.0, 1.0), open_front=0.0, jag=0.0):
    """A surface of revolution about z; profile is (radius, height) top to bottom."""
    rings = []
    for i, (r, z) in enumerate(profile):
        ring = []
        for s in range(segments):
            a = s / segments * math.tau
            # the cloak hangs open a little at the front (-y in Blender, the game's forward)
            gap = open_front * max(0.0, -math.sin(a)) ** 6
            rr = r * (1 - gap)
            hem = 0.0
            if jag and i == len(profile) - 1:
                hem = jag * (0.5 + 0.5 * noise.noise(Vector((math.cos(a) * 3, math.sin(a) * 3, 1.7))))
            fold = 0.025 * math.sin(a * 9) * (i / max(1, len(profile) - 1))
            ring.append(bm.verts.new((math.cos(a) * (rr + fold) * squash[0], math.sin(a) * (rr + fold) * squash[1], z + hem)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for s in range(segments):
            n = (s + 1) % segments
            bm.faces.new((rings[i][s], rings[i][n], rings[i + 1][n], rings[i + 1][s]))
    flat = [v for r in rings for v in r]
    paint(flat, sway, mat)
    return flat


def tube(a, b, r0, r1, segments, mat, sway, leg=0.0):
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    up = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
    x = d.cross(up).normalized()
    y = d.cross(x).normalized()
    rings = []
    for t, r in ((0, r0), (1, r1)):
        c = a.lerp(b, t)
        rings.append([bm.verts.new(c + (x * math.cos(s / segments * math.tau) + y * math.sin(s / segments * math.tau)) * r) for s in range(segments)])
    for s in range(segments):
        n = (s + 1) % segments
        bm.faces.new((rings[0][s], rings[0][n], rings[1][n], rings[1][s]))
    for ring in rings:
        bm.faces.new(list(reversed(ring)) if ring is rings[0] else ring)
    paint(rings[0] + rings[1], sway, mat, leg)


def sphere(c, r, mat, sway, scale=(1, 1, 1), segs=12):
    res = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=max(6, segs // 2), radius=r)
    bmesh.ops.scale(bm, vec=scale, verts=res["verts"])
    bmesh.ops.translate(bm, vec=c, verts=res["verts"])
    paint(res["verts"], sway, mat)


hem = lambda co: max(0.0, min(1.0, (1.45 - co.z) / 1.3))

# the cloak: shoulders to just above the ankles, flaring, open at the front, a ragged hem
lathe(
    [(0.12, 1.62), (0.27, 1.5), (0.31, 1.38), (0.31, 1.15), (0.33, 0.85), (0.38, 0.5), (0.43, 0.2)],
    28, 0.0, hem, squash=(1.0, 0.82), open_front=0.55, jag=0.09,
)
# a short capelet over the shoulders
lathe([(0.14, 1.6), (0.3, 1.5), (0.36, 1.36), (0.37, 1.22)], 24, 0.0, lambda co: 0.15, squash=(1.0, 0.85), jag=0.04)
# the hood: a cowl rising to a point at the back
res = bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=0.16)
for v in res["verts"]:
    # an opening at the face (-y) and a peak behind
    if v.co.y < -0.06 and v.co.z > -0.08:
        v.co.y = -0.06 + (v.co.y + 0.06) * 0.2
    if v.co.y > 0.05 and v.co.z > 0.05:
        v.co.z += 0.08 * (v.co.y / 0.16)
bmesh.ops.scale(bm, vec=(1.0, 1.15, 1.2), verts=res["verts"])
bmesh.ops.translate(bm, vec=(0, 0.02, 1.72), verts=res["verts"])
paint(res["verts"], 0.05, 0.0)
# the face in shadow: a dark sphere inside the hood
sphere((0, -0.015, 1.7), 0.1, 0.33, 0.0, scale=(0.9, 1.0, 1.15))
# shoulder plates
for sx in (-1, 1):
    sphere((sx * 0.25, 0.0, 1.47), 0.11, 0.66, 0.05, scale=(1.3, 1.1, 0.6))
# boots and legs (the cloak covers the thighs)
for sx in (-1, 1):
    tube((sx * 0.1, 0, 0.9), (sx * 0.1, 0.0, 0.12), 0.075, 0.06, 8, 0.33, 0.2, leg=0.25 if sx < 0 else 0.75)
    tube((sx * 0.1, -0.02, 0.14), (sx * 0.1, -0.14, 0.03), 0.06, 0.05, 8, 0.33, 0.2, leg=0.25 if sx < 0 else 0.75)
# the right arm, forward, holding the lantern pole
tube((0.27, -0.02, 1.4), (0.33, -0.2, 1.05), 0.06, 0.05, 8, 0.0, 0.1)
tube((0.33, -0.2, 1.05), (0.33, -0.35, 1.08), 0.045, 0.04, 8, 0.33, 0.1)
# the lantern: a short pole, an iron cage and the glass
tube((0.33, -0.38, 1.12), (0.33, -0.38, 0.92), 0.012, 0.012, 6, 0.66, 0.1)
tube((0.33, -0.38, 0.92), (0.33, -0.38, 0.78), 0.06, 0.06, 6, 0.66, 0.15)
sphere((0.33, -0.38, 0.85), 0.05, 1.0, 0.15, segs=10)
# the sword across the back: grip, guard, blade
blade_a, blade_b = Vector((-0.22, 0.2, 1.62)), Vector((0.2, 0.2, 0.62))
tube(blade_a + Vector((-0.06, 0, 0.14)), blade_a, 0.018, 0.018, 6, 0.33, 0.05)
tube(blade_a + Vector((-0.08, 0, -0.03)), blade_a + Vector((0.08, 0, 0.03)), 0.018, 0.018, 6, 0.66, 0.05)
tube(blade_a, blade_b, 0.03, 0.012, 4, 0.66, 0.05)

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new("wanderer")
bm.to_mesh(me)
bm.free()
ob = bpy.data.objects.new("wanderer", me)
bpy.context.collection.objects.link(ob)
ob.data.shade_smooth()
sub = ob.modifiers.new("subdiv", "SUBSURF")
sub.levels = 1

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
