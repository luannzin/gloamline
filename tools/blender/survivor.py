# A survivor as the others see them (and as you see yourself over the shoulder): a quilted
# telogreika over padded trousers, kirza boots, an ushanka with its flaps down, a wool scarf over the
# burnt face, a canvas rucksack with a bedroll, a rifle slung across the back, pouches on the belt,
# and a hurricane lantern held out in the right hand. About 1.82 m, facing -y here (the game's
# forward once turned), feet at 0.
#
#   blender -b --factory-startup -t 4 --python tools/blender/survivor.py -- apps/client/public/models/survivor.glb
#
# COLOR_0: r = how much the vertex moves in the wind and the walk (flaps, straps, the jacket's hem),
# g = material (0 jacket, 0.125 trousers, 0.25 fur, 0.375 canvas, 0.5 leather, 0.625 wool, 0.75
# iron, 0.875 wood, 1 the lantern's glass), b = what swings with the stride (0.25 left leg, 0.75
# right leg, 0.4 the left arm). Deterministic.
import math
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

out = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)

JACKET, TROUSERS, FUR, CANVAS, LEATHER, WOOL, IRON, WOOD, GLASS = (i / 8 for i in range(9))
L_LEG, R_LEG, L_ARM = 0.25, 0.75, 0.4

bm = bmesh.new()
col = bm.verts.layers.float_color.new("Col")


def paint(verts, mat, sway=0.0, swing=0.0):
    for v in verts:
        s = sway(v.co) if callable(sway) else sway
        v[col] = (s, mat, swing, 1.0)


def lathe(profile, segments, mat, sway=0.0, squash=(1.0, 1.0), centre=(0, 0), quilt=0.0, swing=0.0):
    """A surface of revolution about z; profile is (radius, height) top to bottom. `quilt` sinks
    every other ring, so a padded garment shows its stitched bands."""
    rings = []
    for i, (r, z) in enumerate(profile):
        rr = r - (quilt if i % 2 else 0.0)
        ring = [
            bm.verts.new(
                (
                    centre[0] + math.cos(s / segments * math.tau) * rr * squash[0],
                    centre[1] + math.sin(s / segments * math.tau) * rr * squash[1],
                    z,
                )
            )
            for s in range(segments)
        ]
        rings.append(ring)
    for i in range(len(rings) - 1):
        for s in range(segments):
            n = (s + 1) % segments
            bm.faces.new((rings[i][s], rings[i][n], rings[i + 1][n], rings[i + 1][s]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    flat = [v for r in rings for v in r]
    paint(flat, mat, sway, swing)
    return flat


def bands(top, bottom, step):
    """Heights from top to bottom every `step`, for quilted lathes."""
    n = max(2, int(round((top - bottom) / step)))
    return [top - (top - bottom) * i / n for i in range(n + 1)]


def tube(a, b, r0, r1, segments, mat, sway=0.0, swing=0.0, rings=2, quilt=0.0):
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    up = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
    x = d.cross(up).normalized()
    y = d.cross(x).normalized()
    rs = []
    for k in range(rings):
        t = k / (rings - 1)
        c = a.lerp(b, t)
        r = r0 + (r1 - r0) * t - (quilt if k % 2 else 0.0)
        rs.append([bm.verts.new(c + (x * math.cos(s / segments * math.tau) + y * math.sin(s / segments * math.tau)) * r) for s in range(segments)])
    for k in range(rings - 1):
        for s in range(segments):
            n = (s + 1) % segments
            bm.faces.new((rs[k][s], rs[k][n], rs[k + 1][n], rs[k + 1][s]))
    bm.faces.new(list(reversed(rs[0])))
    bm.faces.new(rs[-1])
    flat = [v for r in rs for v in r]
    paint(flat, mat, sway, swing)
    return flat


def box(c, s, mat, sway=0.0, swing=0.0, rot=None):
    r = bmesh.ops.create_cube(bm, size=1.0)
    vs = r["verts"]
    bmesh.ops.scale(bm, vec=s, verts=vs)
    if rot is not None:
        bmesh.ops.rotate(bm, verts=vs, cent=(0, 0, 0), matrix=rot)
    bmesh.ops.translate(bm, vec=c, verts=vs)
    paint(vs, mat, sway, swing)
    return vs


def sphere(c, r, mat, sway=0.0, scale=(1, 1, 1), segs=12, swing=0.0):
    res = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=max(6, segs // 2), radius=r)
    bmesh.ops.scale(bm, vec=scale, verts=res["verts"])
    bmesh.ops.translate(bm, vec=c, verts=res["verts"])
    paint(res["verts"], mat, sway, swing)
    return res["verts"]


hem = lambda co: max(0.0, min(1.0, (1.0 - co.z) / 0.25)) * 0.35

# --- legs: padded trousers in bands, kirza boots to below the knee, the foot forward
for sx, swing in ((-1, L_LEG), (1, R_LEG)):
    x = sx * 0.105
    tube((x, 0.0, 0.98), (x, 0.0, 0.46), 0.095, 0.078, 10, TROUSERS, 0.0, swing, rings=9, quilt=0.006)
    tube((x, 0.0, 0.5), (x, 0.0, 0.08), 0.074, 0.066, 10, LEATHER, 0.0, swing, rings=3)
    box((x, -0.06, 0.045), (0.105, 0.27, 0.09), LEATHER, 0.0, swing)
# --- the telogreika: quilted bands from the shoulders to the hips; broad at the shoulders, in at
# the belt, the hem standing out a little over the trousers
SHAPE = [(1.5, 0.17), (1.45, 0.24), (1.3, 0.238), (1.12, 0.222), (0.97, 0.212), (0.86, 0.226), (0.78, 0.236)]


def girth(z):
    for (z0, r0), (z1, r1) in zip(SHAPE, SHAPE[1:]):
        if z1 <= z <= z0:
            t = (z0 - z) / (z0 - z1)
            return r0 + (r1 - r0) * (t * t * (3 - 2 * t))
    return SHAPE[-1][1]


lathe([(girth(z), z) for z in bands(1.5, 0.78, 0.05)], 28, JACKET, hem, squash=(1.0, 0.7), quilt=0.006)
# the shoulders rounded over the top, a stand-up collar, the belt and its buckle
lathe([(0.07, 1.555), (0.13, 1.54), (0.17, 1.5)], 28, JACKET, 0.0, squash=(1.0, 0.7))
lathe([(0.1, 1.6), (0.115, 1.56), (0.12, 1.5)], 16, JACKET, 0.05, squash=(1.0, 0.95))
lathe([(0.205, 0.97), (0.207, 0.92)], 24, LEATHER, 0.0, squash=(1.0, 0.76))
box((0, -0.16, 0.945), (0.07, 0.02, 0.055), IRON)
# pouches on the belt, and a gas mask's canvas bag at the right hip
for sx in (-1, 1):
    box((sx * 0.13, -0.135, 0.9), (0.09, 0.05, 0.1), LEATHER, 0.05)
box((0.21, -0.02, 0.84), (0.07, 0.18, 0.2), CANVAS, 0.15)
tube((0.2, -0.05, 0.94), (-0.17, -0.1, 1.45), 0.012, 0.012, 5, CANVAS, 0.05)

# --- the left arm, hanging, swinging with the stride
tube((-0.25, 0.0, 1.43), (-0.29, -0.01, 1.13), 0.075, 0.066, 10, JACKET, 0.0, L_ARM, rings=6, quilt=0.005)
tube((-0.29, -0.01, 1.13), (-0.28, -0.07, 0.88), 0.064, 0.056, 10, JACKET, 0.0, L_ARM, rings=5, quilt=0.005)
sphere((-0.28, -0.08, 0.83), 0.05, LEATHER, 0.0, (1.0, 0.85, 1.25), 10, L_ARM)
# --- the right arm, held out with the lantern
tube((0.25, 0.0, 1.43), (0.3, -0.13, 1.17), 0.075, 0.066, 10, JACKET, 0.0, 0.0, rings=6, quilt=0.005)
tube((0.3, -0.13, 1.17), (0.31, -0.33, 1.07), 0.064, 0.056, 10, JACKET, 0.0, 0.0, rings=5, quilt=0.005)
sphere((0.31, -0.36, 1.06), 0.05, LEATHER, 0.0, (1.0, 1.2, 0.9), 10)
# the hurricane lantern hanging from the mitten: bail, cap, glass globe in its wire guard, tank
tube((0.31, -0.36, 1.02), (0.31, -0.36, 0.97), 0.006, 0.006, 4, IRON, 0.1)
lathe([(0.03, 0.97), (0.05, 0.95), (0.055, 0.93)], 10, IRON, 0.15, centre=(0.31, -0.36))
sphere((0.31, -0.36, 0.875), 0.05, GLASS, 0.15, (1.0, 1.0, 1.2), 10)
for k in range(4):
    a = k * math.pi / 2 + math.pi / 4
    dx, dy = math.cos(a) * 0.058, math.sin(a) * 0.058
    tube((0.31 + dx, -0.36 + dy, 0.93), (0.31 + dx, -0.36 + dy, 0.82), 0.004, 0.004, 4, IRON, 0.15)
lathe([(0.06, 0.82), (0.065, 0.8), (0.06, 0.77)], 12, IRON, 0.15, centre=(0.31, -0.36))

# --- the head: a wool balaclava and scarf over the face, the eyes a dark slit
tube((0, 0.0, 1.5), (0, 0.0, 1.62), 0.06, 0.065, 10, WOOL)
sphere((0, 0.0, 1.69), 0.1, WOOL, 0.0, (0.95, 1.0, 1.12), 14)
lathe([(0.105, 1.66), (0.112, 1.61), (0.1, 1.56)], 16, WOOL, 0.05, squash=(1.0, 1.05), centre=(0, -0.005))
box((0, -0.096, 1.705), (0.1, 0.015, 0.022), LEATHER)
# the ushanka: a fur crown and brim, the flaps down over the ears, the front flap turned up
lathe([(0.02, 1.86), (0.09, 1.85), (0.12, 1.81), (0.125, 1.76)], 16, FUR, 0.0, centre=(0, 0.005))
lathe([(0.138, 1.795), (0.142, 1.755), (0.135, 1.735)], 18, FUR, 0.02, centre=(0, 0.005))
box((0, -0.13, 1.8), (0.2, 0.03, 0.08), FUR, 0.02, 0.0, Matrix.Rotation(math.radians(-15), 3, "X"))
for sx in (-1, 1):
    box((sx * 0.128, 0.0, 1.68), (0.03, 0.12, 0.13), FUR, lambda co: max(0.0, (1.74 - co.z) / 0.15) * 0.5)

# --- the rucksack: canvas sack, its flap, the bedroll on top, straps over the shoulders
box((0, 0.2, 1.18), (0.34, 0.2, 0.42), CANVAS, 0.05)
box((0, 0.17, 1.37), (0.32, 0.18, 0.08), CANVAS, 0.08)
tube((-0.25, 0.22, 1.49), (0.25, 0.22, 1.49), 0.075, 0.075, 12, CANVAS, 0.04)
for sx in (-1, 1):
    tube((sx * 0.13, 0.12, 1.42), (sx * 0.12, -0.03, 1.52), 0.014, 0.014, 5, LEATHER)
    tube((sx * 0.12, -0.03, 1.52), (sx * 0.15, -0.15, 1.25), 0.014, 0.014, 5, LEATHER)
    tube((sx * 0.15, -0.15, 1.25), (sx * 0.15, 0.1, 1.0), 0.012, 0.012, 5, LEATHER, 0.1)
# the rifle across the back, muzzle up over the left shoulder: barrel, stock, sling
a, b = Vector((-0.24, 0.33, 1.78)), Vector((0.16, 0.31, 0.8))
tube(a, a.lerp(b, 0.55), 0.011, 0.013, 6, IRON)
tube(a.lerp(b, 0.5), a.lerp(b, 0.78), 0.022, 0.024, 6, WOOD)
stock = a.lerp(b, 0.88)
box(stock, (0.045, 0.035, 0.22), WOOD, 0.0, 0.0, Matrix.Rotation(math.atan2(b.x - a.x, a.z - b.z), 3, "Y"))
tube(a.lerp(b, 0.15) + Vector((0, -0.02, 0)), stock + Vector((0, -0.02, 0)), 0.006, 0.006, 4, LEATHER, 0.1)

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new("survivor")
bm.to_mesh(me)
bm.free()
ob = bpy.data.objects.new("survivor", me)
bpy.context.collection.objects.link(ob)
me.shade_smooth()
# (no subdivision: it would shrink the boots' soles and buckles off the body)
me.set_sharp_from_angle(angle=math.radians(50))

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
