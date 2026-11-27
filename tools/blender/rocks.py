# Rocks for Zimovye: four outcrops (layered, jointed, flat-topped) and four boulders, each at two
# levels of detail, into one GLB. Geometry only: the game shades them itself (gfx/flora.ts).
#
#   blender -b --factory-startup -t 4 --python tools/blender/rocks.py -- apps/client/public/models/rocks.glb
#
# Deterministic: every shape comes from mathutils.noise at fixed offsets.
import math
import sys

import bmesh
import bpy
from mathutils import Vector, noise

out = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)


def shape(seed, kind):
    """A displaced icosphere. `kind`: 'crag' (bedded outcrop) or 'boulder' (rounded, cracked)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=6, radius=1.0)
    o = Vector((seed * 7.31, seed * 3.17, seed * 5.53))
    if kind == "crag":
        sx, sy, sz = 2.3 + 0.3 * math.sin(seed), 1.6, 1.5 + 0.2 * math.cos(seed * 2)
    else:
        sx, sy, sz = 1.15 + 0.15 * math.sin(seed), 0.8, 1.0
    tilt = 0.22 * math.sin(seed * 3.7)
    for v in bm.verts:
        p = v.co.copy()
        # broad lumps, then sharp ridged detail
        f = noise.fractal(p * 1.2 + o, 0.9, 2.1, 5, noise_basis="PERLIN_ORIGINAL")
        r = noise.ridged_multi_fractal(p * 3.1 + o, 1.0, 2.0, 4, 1.0, 2.0, noise_basis="PERLIN_ORIGINAL")
        d = 1 + 0.2 * f + 0.05 * r
        x, y, z = p.x * d * sx, p.z * d * sy, p.y * d * sz  # Blender z-up -> y is height here
        # joints: vertical cracks along voronoi cell edges
        dist, _ = noise.voronoi(Vector((x * 0.9, z * 0.9, 0)) + o, distance_metric="DISTANCE")
        crack = max(0.0, 0.18 - (dist[1] - dist[0])) / 0.18
        x *= 1 - 0.06 * crack
        z *= 1 - 0.06 * crack
        if kind == "crag":
            y += x * tilt
            bed = round(y / 0.42) * 0.42
            y += (bed - y) * 0.6
            if y > 1.15:
                y = 1.15 + (y - 1.15) * 0.2
            y -= 0.35
        else:
            if y < -0.25:
                y = -0.25 + (y + 0.25) * 0.3
        # back to Blender's axes (glTF export turns z-up into y-up)
        v.co = Vector((x, -z, y))
    return bm


def lods(name, bm, ratios):
    for i, ratio in enumerate(ratios):
        me = bpy.data.meshes.new(f"{name}_lod{i}")
        bm.to_mesh(me)
        ob = bpy.data.objects.new(f"{name}_lod{i}", me)
        bpy.context.collection.objects.link(ob)
        if ratio < 1:
            m = ob.modifiers.new("decimate", "DECIMATE")
            m.ratio = ratio
        ob.data.shade_smooth()


for s in range(4):
    # 20480 faces before decimating: about 3000 and 400 for a crag, 1600 and 300 for a boulder
    lods(f"crag{s}", shape(s + 1, "crag"), [0.15, 0.02])
    lods(f"boulder{s}", shape(s + 11, "boulder"), [0.08, 0.015])

bpy.ops.export_scene.gltf(
    filepath=out,
    export_format="GLB",
    export_apply=True,
    export_materials="NONE",
    export_texcoords=False,
    export_normals=True,
    export_yup=True,
)
print("wrote", out)
