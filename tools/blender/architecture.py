# Pieces for the keep's whole towers: a slate roof (rows of overlapping slates stepped out from a
# cone, an iron finial with an orb) and a tattered banner on its pole. Unit size: the roof's base
# radius is 1 and its height 2.6 (the game scales it to each tower); the banner is 1 x 3.2.
#
#   blender -b --factory-startup -t 4 --python tools/blender/architecture.py -- apps/client/public/models/architecture.glb
#
# COLOR_0.r marks the parts that move in the wind (the banner's cloth, 0 at the pole, 1 at the hem);
# COLOR_0.g marks iron (1) against slate or cloth (0). Deterministic.
import math
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

out = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)


def finish(name, bm, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    if smooth:
        ob.data.shade_smooth()
    return ob


def roof(name, rows, sides, slates):
    """A cone of `rows` slate courses, each course stepped out past the one above it."""
    bm = bmesh.new()
    col = bm.verts.layers.float_color.new("Col")
    H = 2.6
    rings = []
    for i in range(rows + 1):
        t = i / rows
        # a slight bell: steep at the top, flaring at the eaves
        r = (t ** 0.85) * 1.0 + (0.06 if i == rows else 0)
        y = H * (1 - t)
        lip = []
        for s in range(sides):
            a = s / sides * math.tau
            jit = 0.012 * noise.noise(Vector((math.cos(a) * 3, math.sin(a) * 3, i * 0.7))) if slates else 0
            lip.append((r + jit, y, a))
        rings.append(lip)
    prev_low = None
    for i in range(rows):
        top, bot = rings[i], rings[i + 1]
        # each course: from under the course above, down and out past it
        up = [bm.verts.new((math.cos(a) * r * 0.97, -math.sin(a) * r * 0.97, y - 0.05)) for r, y, a in top]
        lo = [bm.verts.new((math.cos(a) * (r + 0.035), -math.sin(a) * (r + 0.035), y)) for r, y, a in bot]
        under = [bm.verts.new((math.cos(a) * (r - 0.01), -math.sin(a) * (r - 0.01), y + 0.06)) for r, y, a in bot]
        for v in up + lo + under:
            v[col] = (0, 0, 0, 1)
        for s in range(sides):
            n = (s + 1) % sides
            bm.faces.new((up[s], up[n], lo[n], lo[s]))
            bm.faces.new((lo[s], lo[n], under[n], under[s]))
        prev_low = lo
    # close the eaves underneath
    if prev_low:
        c = bm.verts.new((0, 0, 0.02))
        c[col] = (0, 0, 0, 1)
        for s in range(sides):
            bm.faces.new((prev_low[(s + 1) % sides], prev_low[s], c))
    # the finial: an iron spike with an orb and a collar
    spike = bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.05, radius2=0.004, depth=1.1)
    bmesh.ops.translate(bm, verts=spike["verts"], vec=(0, 0, H + 0.5))
    orb = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.09)
    bmesh.ops.translate(bm, verts=orb["verts"], vec=(0, 0, H + 0.32))
    for v in spike["verts"] + orb["verts"]:
        v[col] = (0, 1, 0, 1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(name, bm)


def banner(name, cols, rows):
    """A cloth hanging from a crossbar: folds, a swallowtail hem, torn holes near the bottom."""
    bm = bmesh.new()
    col = bm.verts.layers.float_color.new("Col")
    uv = bm.loops.layers.uv.new("UVMap")
    W, Hh = 1.0, 3.2
    grid = []
    for j in range(rows + 1):
        t = j / rows
        row = []
        for i in range(cols + 1):
            u = i / cols
            x = (u - 0.5) * W
            # folds: deeper toward the hem
            fold = 0.05 * math.sin(u * math.tau * 2.5 + t * 2) * (0.3 + t)
            # the swallowtail: the middle of the hem cut up into a V
            cut = max(0.0, 0.35 - abs(u - 0.5)) * 1.3 * max(0.0, t - 0.75) / 0.25
            y = -t * Hh + cut * Hh * 0.25
            v = bm.verts.new((x, fold, y))
            v[col] = (t, 0, 0, 1)
            row.append((v, (u, 1 - t)))
        grid.append(row)
    for j in range(rows):
        for i in range(cols):
            # tears: skip a few cells near the hem
            if j > rows * 0.7 and noise.noise(Vector((i * 0.9, j * 0.9, 3.3))) > 0.38:
                continue
            q = (grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i])
            f = bm.faces.new([p[0] for p in q])
            for loop, p in zip(f.loops, q):
                loop[uv].uv = p[1]
    # the crossbar and the pole above it
    bar = bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.035, radius2=0.035, depth=W + 0.2)
    bmesh.ops.rotate(bm, verts=bar["verts"], cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Y"))
    pole = bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.04, radius2=0.03, depth=2.0)
    bmesh.ops.translate(bm, verts=pole["verts"], vec=(0, 0, 0.9))
    for v in bar["verts"] + pole["verts"]:
        v[col] = (0, 1, 0, 1)
    return finish(name, bm)


roof("roof_lod0", 14, 40, True)
roof("roof_lod1", 5, 14, False)
banner("banner_lod0", 10, 24)

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
