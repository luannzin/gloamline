# Zarechye, the village: log izbas with their gable ends to the street (round logs interlocked at the
# corners with the ends standing out, carved and painted window frames with shutters, plank gables, a
# corrugated iron roof over barge boards and a hanging "towel" at the apex, a brick chimney, a porch),
# one burnt to its stove, a plank shed, a stretch of picket fence, a power pole, a well sweep and a
# wrecked car. Metres; feet at 0; each faces -y here, which is the game's +z (the street side).
#
#   blender -b --factory-startup -t 4 --python tools/blender/village.py -- apps/client/public/models/village.glb
#
# COLOR_0: r = material (0 log, 0.2 plank, 0.4 painted trim, 0.6 iron, 0.8 glass, 1 stone or brick),
# g = baked occlusion (1 open .. 0 shut in), b = a flag per material (brick against stone; glass
# that can be lit from inside; paint on a car body; char on burnt wood). Deterministic.
import math
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

out = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)

LOG, PLANK, TRIM, IRON, GLASS, STONE = 0.0, 0.2, 0.4, 0.6, 0.8, 1.0


class Kit:
    """One mesh being built, with its colour layer."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.col = self.bm.verts.layers.float_color.new("Col")

    def paint(self, verts, mat, ao=1.0, flag=0.0, ground=True):
        for v in verts:
            # the ground's own occlusion: the bottom metre is darker
            a = ao * (0.55 + 0.45 * min(1.0, max(0.0, v.co.z) / 1.2)) if ground else ao
            v[self.col] = (mat, a, flag, 1.0)

    def box(self, c, s, mat, ao=1.0, flag=0.0, yaw=0.0, tilt=None):
        r = bmesh.ops.create_cube(self.bm, size=1.0)
        vs = r["verts"]
        bmesh.ops.scale(self.bm, vec=s, verts=vs)
        if tilt is not None:
            bmesh.ops.rotate(self.bm, verts=vs, cent=(0, 0, 0), matrix=tilt)
        if yaw:
            bmesh.ops.rotate(self.bm, verts=vs, cent=(0, 0, 0), matrix=Matrix.Rotation(yaw, 3, "Z"))
        bmesh.ops.translate(self.bm, vec=c, verts=vs)
        self.paint(vs, mat, ao, flag)
        return vs

    def cyl(self, a, b, r0, r1, seg, mat, ao=1.0, flag=0.0):
        a, b = Vector(a), Vector(b)
        d = b - a
        r = bmesh.ops.create_cone(
            self.bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r0, radius2=r1, depth=d.length
        )
        vs = r["verts"]
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        bmesh.ops.rotate(self.bm, verts=vs, cent=(0, 0, 0), matrix=q.to_matrix())
        bmesh.ops.translate(self.bm, vec=(a + b) / 2, verts=vs)
        self.paint(vs, mat, ao, flag)
        return vs

    def finish(self):
        me = bpy.data.meshes.new(self.name)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.collection.objects.link(ob)
        me.shade_smooth()
        # round logs and poles stay smooth, boxes keep their edges
        me.set_sharp_from_angle(angle=math.radians(38))
        return ob


def spans(lo, hi, holes):
    """[lo, hi] with the (a, b) holes cut out."""
    out_, cur = [], lo
    for a, b in sorted(holes):
        if a > cur:
            out_.append((cur, a))
        cur = max(cur, b)
    if cur < hi:
        out_.append((cur, hi))
    return [s for s in out_ if s[1] - s[0] > 0.08]


def window(k, c, yaw, w, h, paint=True, lit=1.0):
    """A window on a wall whose outward normal is turned `yaw` from -y: c is the opening's centre on
    the wall's face. Glass, a painted frame, a sill, shutters and a carved crest over it."""
    R = Matrix.Rotation(yaw, 3, "Z")
    n = R @ Vector((0, -1, 0))
    t = R @ Vector((1, 0, 0))
    c = Vector(c)

    def at(u, out_, z):
        return c + t * u + n * out_ + Vector((0, 0, z))

    k.box(at(0, -0.02, 0), (w, 0.03, h), GLASS, 0.9, lit, yaw)
    # the frame and the cross
    for z in (h / 2 + 0.05, -h / 2 - 0.05):
        k.box(at(0, 0.03, z), (w + 0.2, 0.06, 0.1), TRIM, 1, 0, yaw)
    for u in (w / 2 + 0.05, -w / 2 - 0.05):
        k.box(at(u, 0.03, 0), (0.1, 0.06, h + 0.2), TRIM, 1, 0, yaw)
    k.box(at(0, 0.0, h * 0.18), (w, 0.04, 0.05), TRIM, 1, 0, yaw)
    k.box(at(0, 0.0, 0), (0.05, 0.04, h), TRIM, 1, 0, yaw)
    # the sill, its drip board under it
    k.box(at(0, 0.09, -h / 2 - 0.12), (w + 0.34, 0.16, 0.05), TRIM, 1, 0, yaw)
    k.box(at(0, 0.05, -h / 2 - 0.22), (w + 0.1, 0.04, 0.16), TRIM, 0.8, 0, yaw)
    if not paint:
        return
    # the crest: a lintel board and a pediment of two boards meeting over it
    k.box(at(0, 0.06, h / 2 + 0.22), (w + 0.36, 0.05, 0.2), TRIM, 1, 0, yaw)
    for s in (-1, 1):
        tilt = Matrix.Rotation(s * math.radians(24), 3, "Y")
        k.box(at(s * (w / 4 + 0.04), 0.07, h / 2 + 0.42), (w / 2 + 0.22, 0.05, 0.08), TRIM, 1, 0, yaw, tilt)
    k.box(at(0, 0.08, h / 2 + 0.56), (0.1, 0.05, 0.12), TRIM, 1, 0, yaw)
    # shutters, folded back against the logs
    for s in (-1, 1):
        k.box(at(s * (w / 2 + 0.36), 0.05, 0), (w / 2 - 0.02, 0.04, h + 0.04), TRIM, 0.9, 0, yaw)


def izba(name, W, D, courses, front, sides, seed, burnt=0.0, annex=False):
    """A log house: W across the street gable, D deep. `front`: windows across the gable; `sides`:
    (n on +x, n on -x). `burnt` (0..1) eats the walls from the top and takes the roof."""
    rnd = random.Random(seed)
    k = Kit(name)
    R, STEP, base = 0.13, 0.235, 0.45
    zt = base + courses * STEP
    # the plinth: field stone, a little wider than the logs
    k.box((0, 0, (base - 1.4) / 2), (W + 0.32, D + 0.32, base + 1.4), STONE, 0.9)
    wl, wh = base + 0.85, base + 2.0
    fx = [(-1 + 2 * (i + 0.5) / front) * (W / 2 - 0.9) for i in range(front)] if front else []
    side_y = {
        1: [(-1 + 2 * (i + 0.5) / max(1, sides[0])) * (D / 2 - 1.6) - 0.6 for i in range(sides[0])],
        -1: [(-1 + 2 * (i + 0.5) / max(1, sides[1])) * (D / 2 - 1.2) for i in range(sides[1])],
    }
    door_y = (D / 2 - 2.1, D / 2 - 1.15)
    ww = 0.82

    def keep(z, u):
        if burnt <= 0:
            return True
        # burnt down from the top, more on the street side, ragged
        top = zt - burnt * (zt - base) * (0.55 + 0.45 * (noise.noise(Vector((u * 0.7, seed, 0.3))) + 0.5))
        return z < top

    def char(z):
        return min(1.0, burnt * (0.6 + z / zt)) if burnt > 0 else 0.0

    for c in range(courses):
        z = base + R + c * STEP
        # street and back walls: logs along x, ends standing out past the corners
        for y, holes in ((-D / 2, [(x - ww / 2 - 0.02, x + ww / 2 + 0.02) for x in fx] if wl < z < wh else []), (D / 2, [])):
            e0, e1 = -W / 2 - 0.26 - rnd.random() * 0.06, W / 2 + 0.26 + rnd.random() * 0.06
            for a, b in spans(e0, e1, holes):
                if not keep(z, a + b):
                    continue
                r = R * (0.92 + rnd.random() * 0.16)
                k.cyl((a, y, z), (b, y, z), r, r * 0.97, 8, LOG, 1.0, char(z))
        # side walls: half a log higher, so the corners lock
        z2 = z + STEP / 2
        for s in (1, -1):
            x = s * W / 2
            holes = [(y - ww / 2 - 0.02, y + ww / 2 + 0.02) for y in side_y[s]] if wl < z2 < wh else []
            if s == 1 and z2 < base + 2.05:
                holes.append(door_y)
            e0, e1 = -D / 2 - 0.26 - rnd.random() * 0.06, D / 2 + 0.26 + rnd.random() * 0.06
            for a, b in spans(e0, e1, holes):
                if not keep(z2, a + b + s * 9):
                    continue
                r = R * (0.92 + rnd.random() * 0.16)
                k.cyl((x, a, z2), (x, b, z2), r, r * 0.97, 8, LOG, 1.0, char(z2))
    wz = (wl + wh) / 2
    if burnt <= 0.2:
        for x in fx:
            window(k, (x, -D / 2 - R, wz), 0.0, ww, wh - wl, True, 1.0)
        for s in (1, -1):
            for y in side_y[s]:
                window(k, (s * (W / 2 + R), y, wz), -s * math.pi / 2, ww, wh - wl, True, 1.0)
        # the door and its frame
        k.box((W / 2 + 0.04, sum(door_y) / 2, base + 1.0), (0.06, door_y[1] - door_y[0], 2.0), PLANK, 0.6)
        for y in door_y:
            k.box((W / 2 + R + 0.02, y, base + 1.02), (0.08, 0.1, 2.08), TRIM, 1)
    if burnt > 0:
        # the stove and its chimney outlast the house
        k.box((W * 0.12, D * 0.08, base + 1.1), (1.3, 1.6, 2.2), STONE, 0.7, 1.0)
        k.box((W * 0.12, D * 0.08, base + 3.2), (0.5, 0.5, 2.4), STONE, 0.85, 1.0)
        k.box((W * 0.12, D * 0.08, base + 4.45), (0.62, 0.62, 0.12), STONE, 0.9, 1.0)
        # a few rafters, fallen in
        for i in range(4):
            a = Vector((rnd.uniform(-W / 2, W / 2), rnd.uniform(-D / 2, D / 2), base + 0.2))
            b = a + Vector((rnd.uniform(-2, 2), rnd.uniform(-2, 2), rnd.uniform(1.2, 2.4)))
            k.cyl(a, b, 0.07, 0.06, 6, LOG, 0.8, 1.0)
        return k.finish()

    # gables of horizontal boards, an attic window in the street one
    pitch = math.radians(40)
    Hr = (W / 2) * math.tan(pitch)
    for y, front_side in ((-D / 2 - 0.02, True), (D / 2 + 0.02, False)):
        n = int(Hr / 0.17)
        for i in range(n):
            z = zt + 0.085 + i * 0.17
            half = (W / 2 + 0.2) * (1 - (z - zt) / Hr)
            if half < 0.1:
                break
            k.box((0, y, z), (half * 2, 0.04, 0.16), PLANK, 0.85)
        if front_side:
            window(k, (0, y - 0.03, zt + Hr * 0.4), 0.0, 0.46, 0.56, False, 0.6)
    # the roof: corrugated iron on both slopes, a ridge cap, barge boards and the towel at the apex
    ov, oe = 0.62, 0.55
    ez = zt - oe * math.tan(pitch)
    for s in (-1, 1):
        # the sheet runs along y; its ribs ride out along the slope's normal
        sheet_y0, sheet_y1 = -D / 2 - ov, D / 2 + ov
        n = max(4, int((sheet_y1 - sheet_y0) / 0.14) * 4)
        rows = []
        for (x, z) in ((s * (W / 2 + oe), ez), (0.0, zt + Hr + 0.02)):
            row = []
            for i in range(n + 1):
                y = sheet_y0 + (sheet_y1 - sheet_y0) * i / n
                off = math.sin(i * math.pi / 2) * 0.022
                row.append(k.bm.verts.new((x + s * off * math.sin(pitch), y, z + off * math.cos(pitch))))
            rows.append(row)
        for i in range(n):
            q = (rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i])
            k.bm.faces.new(q if s > 0 else q[::-1])
        k.paint(rows[0] + rows[1], IRON, 1.0, ground=False)
        # the soffit under it: boards, in shade
        mid = Vector((s * (W / 4 + oe / 2), 0, (ez + zt + Hr) / 2 - 0.08))
        # (a box along x turned by +a about y runs down toward +x: the -x slope rises toward +x)
        k.box(mid, ((W / 2 + oe) / math.cos(pitch), D + 2 * ov, 0.03), PLANK, 0.45, 0, 0.0, Matrix.Rotation(s * pitch, 3, "Y"))
        for y in (-D / 2 - ov - 0.03, D / 2 + ov + 0.03):
            mid2 = Vector((s * (W / 4 + oe / 2), y, (ez + zt + Hr) / 2 - 0.06))
            k.box(mid2, ((W / 2 + oe) / math.cos(pitch) + 0.1, 0.05, 0.24), TRIM, 1.0, 0, 0.0, Matrix.Rotation(s * pitch, 3, "Y"))
    k.box((0, 0, zt + Hr + 0.05), (0.22, D + 2 * ov, 0.08), IRON, 1.0)
    k.box((0, -D / 2 - ov - 0.05, zt + Hr - 0.45), (0.24, 0.05, 0.9), TRIM, 1.0)
    # the chimney through the slope near the ridge
    k.box((W * 0.14, D * 0.08, zt + Hr * 0.55), (0.52, 0.52, Hr * 1.1 + 1.4), STONE, 0.9, 1.0)
    k.box((W * 0.14, D * 0.08, zt + Hr + 0.75), (0.64, 0.64, 0.12), STONE, 0.9, 1.0)
    # the porch by the door: a deck, two steps, two posts and a little roof
    px = W / 2 + 0.95
    py = sum(door_y) / 2
    k.box((px, py, base - 0.05), (1.5, 1.6, 0.1), PLANK, 0.8)
    for i, h in enumerate((0.3, 0.15)):
        k.box((px + 0.95 + i * 0.3, py, h / 2), (0.3, 1.4, h), PLANK, 0.8)
    for dy in (-0.7, 0.7):
        k.cyl((px + 0.65, py + dy, base), (px + 0.65, py + dy, base + 2.3), 0.06, 0.06, 6, PLANK, 0.9)
    k.box((px + 0.1, py, base + 2.35), (1.9, 1.9, 0.05), IRON, 0.9, 0, 0.0, Matrix.Rotation(math.radians(14), 3, "Y"))
    if annex:
        # the seni: a plank lean-to across the back, its own iron roof
        ay = D / 2 + 1.35
        k.box((0, ay, base + 1.2), (W - 0.6, 2.5, 2.4), PLANK, 0.8)
        k.box((0, ay + 0.1, base + 2.55), (W, 3.0, 0.05), IRON, 0.9, 0, 0.0, Matrix.Rotation(math.radians(-16), 3, "X"))
    return k.finish()


def shed(name):
    k = Kit(name)
    W, D, H = 3.0, 3.6, 2.2
    for i in range(int(W / 0.2)):
        x = -W / 2 + 0.1 + i * 0.2
        for y in (-D / 2, D / 2):
            k.box((x, y, H / 2), (0.19, 0.04, H + (0.3 if y > 0 else 0)), PLANK, 0.85)
    for i in range(int(D / 0.2)):
        y = -D / 2 + 0.1 + i * 0.2
        for x in (-W / 2, W / 2):
            k.box((x, y, H / 2 + 0.15 * (y / D)), (0.04, 0.19, H + 0.3 * (y / D + 0.5)), PLANK, 0.85)
    k.box((0.3, -D / 2 - 0.03, 0.95), (0.9, 0.04, 1.8), PLANK, 0.6)
    k.box((0, 0, H + 0.25), (W + 0.5, D + 0.6, 0.04), IRON, 1.0, 0, 0.0, Matrix.Rotation(math.radians(-8), 3, "X"))
    return k.finish()


def fence(name, seed):
    """3 m of picket fence along x: two posts, two rails, pointed pickets, a few gone, a few leaning."""
    rnd = random.Random(seed)
    k = Kit(name)
    for x in (-1.5, 1.5):
        k.box((x, 0, 0.6), (0.1, 0.1, 1.5), PLANK, 0.9)
    for z in (0.35, 1.0):
        k.box((0, 0.06, z), (3.0, 0.05, 0.08), PLANK, 0.85)
    x = -1.42
    while x < 1.45:
        if rnd.random() > 0.14:
            h = 1.15 + rnd.random() * 0.15
            lean = Matrix.Rotation(rnd.uniform(-0.06, 0.06) + (0.25 if rnd.random() < 0.05 else 0), 3, "Y")
            k.box((x, 0.1, h / 2), (0.09, 0.022, h), PLANK, 0.9, 0, 0.0, lean)
            tip = k.cyl((x, 0.1, h), (x, 0.1, h + 0.09), 0.065, 0.001, 4, PLANK, 0.9)
            bmesh.ops.rotate(k.bm, verts=tip, cent=(x, 0.1, h), matrix=lean)
        x += 0.15
    return k.finish()


def pole(name):
    """A wooden power pole: crossarm at 7.9 m with three glass insulators (the game strings the wires
    from x = -0.7, 0, 0.7 at 8.05 m), a brace, and a tarred foot."""
    k = Kit(name)
    k.cyl((0, 0, -0.6), (0, 0, 8.6), 0.15, 0.1, 10, PLANK, 1.0)
    k.box((0, 0, 7.9), (1.75, 0.11, 0.11), PLANK, 1.0)
    k.box((0.3, 0, 7.55), (0.06, 0.05, 0.75), IRON, 1.0, 0, 0.0, Matrix.Rotation(math.radians(48), 3, "Y"))
    for x in (-0.7, 0, 0.7):
        k.cyl((x, 0, 7.95), (x, 0, 8.06), 0.035, 0.05, 8, GLASS, 1.0, 0.0)
    k.cyl((0, 0, -0.6), (0, 0, 1.1), 0.16, 0.155, 10, IRON, 0.7, 0.0)
    return k.finish()


def well(name):
    """A well sweep: a log well, a forked post, the long pole on its pivot, a weight and a bucket."""
    k = Kit(name)
    for c in range(4):
        z = 0.12 + c * 0.22
        for s in (-1, 1):
            k.cyl((-0.75, s * 0.6, z), (0.75, s * 0.6, z), 0.11, 0.105, 7, LOG, 0.9)
            k.cyl((s * 0.6, -0.75, z + 0.11), (s * 0.6, 0.75, z + 0.11), 0.11, 0.105, 7, LOG, 0.9)
    k.box((0, 0, 1.0), (1.5, 1.5, 0.06), PLANK, 0.8)
    k.cyl((0, 2.6, -0.4), (0, 2.6, 3.4), 0.13, 0.1, 8, LOG, 0.9)
    a = Vector((0, 2.6 + 2.2, 3.4 - 1.3)) + Vector((0, 0, 0))
    b = Vector((0, 2.6 - 4.4, 3.4 + 2.2))
    k.cyl(a, b, 0.07, 0.05, 6, LOG, 0.95)
    k.box(a + Vector((0, 0.15, -0.25)), (0.4, 0.5, 0.5), STONE, 0.8)
    k.cyl(b, Vector((0, b.y, 1.6)), 0.012, 0.012, 4, IRON, 0.9)
    k.cyl((0, b.y, 1.6), (0, b.y, 1.25), 0.14, 0.17, 10, IRON, 0.9)
    return k.finish()


def wreck(name):
    """A small boxy sedan of the seventies, stripped, rusted through and down on one side."""
    k = Kit(name)
    L, Wd = 4.1, 1.62
    body = 1.0
    k.box((0, 0, 0.62), (Wd, L, 0.62), IRON, 0.9, body)
    k.box((0, -1.55, 0.98), (Wd - 0.04, 1.0, 0.12), IRON, 1.0, body, 0.0, Matrix.Rotation(math.radians(-4), 3, "X"))
    k.box((0, 1.6, 0.98), (Wd - 0.04, 0.85, 0.12), IRON, 1.0, body)
    # the cabin: a box whose roof is pulled in
    vs = k.box((0, 0.1, 1.27), (Wd - 0.1, 2.0, 0.62), GLASS, 0.6, 0.0)
    for v in vs:
        if v.co.z > 1.4:
            v.co.x *= 0.86
            v.co.y = v.co.y * 0.72 + 0.05
    k.box((0, 0.12, 1.59), (Wd * 0.84, 1.5, 0.05), IRON, 1.0, body)
    for x, y, down in ((-0.72, -1.25, False), (0.72, -1.25, True), (-0.72, 1.3, False), (0.72, 1.3, False)):
        if down:
            continue
        k.cyl((x - 0.11, y, 0.3), (x + 0.11, y, 0.3), 0.3, 0.3, 12, IRON, 0.5, 0.0)
    return k.finish()


izba("izba_a", 6.2, 7.6, 13, 3, (2, 1), 11)
izba("izba_b", 6.8, 8.6, 14, 3, (3, 2), 23, annex=True)
izba("izba_c", 5.6, 6.6, 12, 2, (1, 1), 37)
izba("izba_burnt", 6.2, 7.6, 13, 3, (2, 1), 51, burnt=0.75)
shed("shed")
fence("fence_a", 3)
fence("fence_b", 7)
pole("pole")
well("well")
wreck("wreck")

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
