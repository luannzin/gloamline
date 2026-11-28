# The survivor (docs/CHARACTERS.md): one body that every player wears, the gear that comes off and
# goes on, all on one skeleton, and the clips the game blends by speed, snow and cold.
#
#   tools/blender/setup.sh            (once: MPFB and the motion capture, into tools/blender/out)
#   BLENDER_USER_RESOURCES=tools/blender/out/blender-user \
#     blender -b -t 4 --python tools/blender/survivor.py -- apps/client/public/models/survivor.glb
#
# The body is a real one: MPFB's human (MakeHuman's base mesh, CC0), a broad man of 1.82 m, rigged
# with its `cmu_mb` skeleton and weights. Nothing of him shows: every garment is cut from his own
# surface (the jacket from the torso and arms, the trousers from the hips and legs, the boots from the
# shins and feet, the mittens from the hands, the balaclava from the head), smoothed so the anatomy
# goes soft under padding, pushed out by the garment's thickness, extended where cloth hangs free (the
# jacket's hem and collar, the boots' rims), subdivided, quilted and creased. Cut from him, each piece
# keeps his skinning. The gear is built in code and fitted to him: the hats to his head, the pack to
# his back, its straps and the belt laid on the jacket's surface.
#
# The clips are motion capture from the CMU database (mocap.py): idle, walk, run, a trudge through
# deep snow (a slow walk, knees pulled high, leaning in) and cold (hunched, blowing into the hands);
# the right arm holds the lantern out in each.
#
# What's in the file, every mesh skinned to `rig` (facing -y here, the game's forward once turned):
#   body          jacket, trousers, boots, mittens, balaclava and eyes, belt and kit, the undershirt
#   hat_ushanka, hat_hood, hat_tankist     face_scarf, face_mask     eyes_goggles
#   back_pack, back_sack     slung_rifle, slung_axe     hand_lantern (on its own bone, a pendulum)
#
# COLOR_0: r = how loose it is (the wind and the walk stir it), g = material / 31 (MATS below),
# b = ambient occlusion baked with Cycles (1 open, 0 shut in).
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mocap  # noqa: E402

try:
    from bl_ext.blender_org.mpfb.services.humanservice import HumanService
    from bl_ext.blender_org.mpfb.services.targetservice import TargetService
except ImportError:
    sys.exit("MPFB is missing: run tools/blender/setup.sh, then set BLENDER_USER_RESOURCES as it says")

out = sys.argv[sys.argv.index("--") + 1]
CMU = os.path.join(HERE, "out", "cmu")
scene = bpy.context.scene
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)

MATS = [
    "jacket",  # 0 the coat, dyed the player's colour
    "trousers",  # 1 quilted cotton, a seed tone
    "fur",  # 2 the ushanka, a seed tone
    "canvas",  # 3 packs and bags, a seed tone
    "leather",  # 4 boots, belt, straps, the mittens' palms
    "wool",  # 5 the balaclava, the mittens
    "iron",  # 6 barrel, lantern, buckles' steel
    "wood",  # 7 the rifle's stock, the axe's helve
    "glass",  # 8 the lantern's globe (it glows)
    "rubber",  # 9 the gas mask, the boots' soles
    "brass",  # 10 buckles, the lantern's fittings
    "lens",  # 11 the mask's and goggles' eyepieces
    "stripe",  # 12 the telnyashka at the neck
    "rope",  # 13 cord and ties
    "scarf",  # 14 knitted, a seed tone
    "skin",  # 15 round the eyes, in the balaclava's slit
    "eye",  # 16 the eyes
]
M = {n: i / 31 for i, n in enumerate(MATS)}


# --- helpers ---------------------------------------------------------------------------------------
def link(name, me):
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


def smooth_band(x, w):
    t = max(0.0, 1.0 - abs(x) / w)
    return t * t * (3 - 2 * t)


def noise(p, s):
    """Cheap smooth noise: a few sines at angles (deterministic)."""
    x, y, z = p.x * s, p.y * s, p.z * s
    return (
        math.sin(x * 1.7 + y * 0.9 + 0.3)
        + math.sin(y * 2.3 - z * 1.3 + 1.1)
        + math.sin(z * 1.9 + x * 1.1 + 2.7)
        + 0.5 * math.sin(x * 4.1 - y * 3.7 + z * 2.9)
    ) / 3.5


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length, t


def evaluated(ob):
    """`ob` with its modifiers applied, as a new mesh (vertex groups kept)."""
    dg = bpy.context.evaluated_depsgraph_get()
    return bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)


def apply_mods(ob):
    me = evaluated(ob)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    bpy.data.meshes.remove(old)


def paint_obj(ob, fn):
    """Writes Col: fn(co, normal) -> (sway, material name)."""
    me = ob.data
    attr = me.color_attributes.get("Col") or me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    for i, v in enumerate(me.vertices):
        s, m = fn(v.co, v.normal)
        attr.data[i].color = (s, M[m], 1.0, 1.0)


def displace(ob, fn):
    me = ob.data
    moved = [(v.co + v.normal * fn(v.co, v.normal)) for v in me.vertices]
    for v, p in zip(me.vertices, moved):
        v.co = p
    me.update()


class Build:
    """A bmesh being built, painted as it goes: each vertex (sway, material)."""

    def __init__(self):
        self.bm = bmesh.new()
        self.col = self.bm.verts.layers.float_color.new("Col")

    def paint(self, verts, mat, sway=0.0):
        for v in verts:
            s = sway(v.co) if callable(sway) else sway
            m = mat(v.co) if callable(mat) else mat
            v[self.col] = (s, M[m], 1.0, 1.0)
        return verts

    def lathe(self, profile, segs, mat, sway=0.0, centre=(0, 0), squash=(1, 1), axis=None, caps=True):
        rings = []
        for r, z in profile:
            rings.append(
                [
                    self.bm.verts.new(
                        (
                            centre[0] + math.cos(s / segs * math.tau) * r * squash[0],
                            centre[1] + math.sin(s / segs * math.tau) * r * squash[1],
                            z,
                        )
                    )
                    for s in range(segs)
                ]
            )
        for i in range(len(rings) - 1):
            for s in range(segs):
                n = (s + 1) % segs
                self.bm.faces.new((rings[i][s], rings[i][n], rings[i + 1][n], rings[i + 1][s]))
        if caps:
            self.bm.faces.new(rings[0])
            self.bm.faces.new(list(reversed(rings[-1])))
        flat = [v for r in rings for v in r]
        if axis is not None:
            bmesh.ops.transform(self.bm, matrix=axis, verts=flat, space=Matrix.Identity(4))
        return self.paint(flat, mat, sway)

    def tube(self, pts, radius, segs, mat, sway=0.0, flat=1.0, caps=True, twist=None):
        pts = [Vector(p) for p in pts]
        rad = radius if isinstance(radius, list) else [radius] * len(pts)
        rings = []
        prev_x = None
        for i, p in enumerate(pts):
            d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            if twist is not None:
                tw = twist[i] if isinstance(twist, list) else twist
                x = (tw - d * tw.dot(d)).normalized()
            else:
                up = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
                x = d.cross(up).normalized() if prev_x is None else (prev_x - d * prev_x.dot(d)).normalized()
            prev_x = x
            y = d.cross(x).normalized()
            rings.append(
                [
                    self.bm.verts.new(
                        p
                        + x * math.cos(s / segs * math.tau) * rad[i]
                        + y * math.sin(s / segs * math.tau) * rad[i] * flat
                    )
                    for s in range(segs)
                ]
            )
        for i in range(len(rings) - 1):
            for s in range(segs):
                n = (s + 1) % segs
                self.bm.faces.new((rings[i][s], rings[i][n], rings[i + 1][n], rings[i + 1][s]))
        if caps:
            self.bm.faces.new(list(reversed(rings[0])))
            self.bm.faces.new(rings[-1])
        return self.paint([v for r in rings for v in r], mat, sway)

    def box(self, c, s, mat, sway=0.0, rot=None):
        vs = bmesh.ops.create_cube(self.bm, size=1.0)["verts"]
        bmesh.ops.scale(self.bm, vec=s, verts=vs)
        if rot is not None:
            bmesh.ops.rotate(self.bm, verts=vs, cent=(0, 0, 0), matrix=rot)
        bmesh.ops.translate(self.bm, vec=c, verts=vs)
        return self.paint(vs, mat, sway)

    def sphere(self, c, r, mat, sway=0.0, scale=(1, 1, 1), segs=16):
        res = bmesh.ops.create_uvsphere(self.bm, u_segments=segs, v_segments=max(8, segs // 2), radius=r)
        bmesh.ops.scale(self.bm, vec=scale, verts=res["verts"])
        bmesh.ops.translate(self.bm, vec=c, verts=res["verts"])
        return self.paint(res["verts"], mat, sway)

    def done(self, name, sharp=40, fit=None):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        if fit is not None:
            bmesh.ops.transform(self.bm, matrix=fit, verts=self.bm.verts, space=Matrix.Identity(4))
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        me.shade_smooth()
        if sharp:
            me.set_sharp_from_angle(angle=math.radians(sharp))
        return link(name, me)


def rounded_box(b, c, s, mat, sway=0.0, rot=None, cuts=3):
    """A soft box (padded bags, flaps): a cube subdivided and pulled toward a rounded shape."""
    n0 = len(b.bm.verts)
    vs = bmesh.ops.create_cube(b.bm, size=1.0)["verts"]
    bmesh.ops.subdivide_edges(b.bm, edges=list({e for v in vs for e in v.link_edges}), cuts=cuts, use_grid_fill=True)
    b.bm.verts.ensure_lookup_table()
    vs = list(b.bm.verts[n0:])
    for v in vs:
        q = v.co.copy()
        n = (abs(q.x) ** 4 + abs(q.y) ** 4 + abs(q.z) ** 4) ** 0.25
        v.co = q / max(n, 1e-6) * 0.5
    bmesh.ops.scale(b.bm, vec=s, verts=vs)
    if rot is not None:
        bmesh.ops.rotate(b.bm, verts=vs, cent=(0, 0, 0), matrix=rot)
    bmesh.ops.translate(b.bm, vec=c, verts=vs)
    return b.paint(vs, mat, sway)


# --- the man under it all ----------------------------------------------------------------------------
macro = TargetService.get_default_macro_info_dict()
macro.update({"gender": 1.0, "age": 0.55, "muscle": 0.62, "weight": 0.62, "height": 0.52, "proportions": 0.6})
human = HumanService.create_human(macro_detail_dict=macro)
rig = HumanService.add_builtin_rig(human, "cmu_mb", import_weights=True)
rig.name = rig.data.name = "rig"
BONES = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in rig.data.bones}
GROUPS = [g.name for g in human.vertex_groups]
for m in human.modifiers:
    m.show_viewport = False
body_me = evaluated(human)
human.hide_render = True
body_bm = bmesh.new()
body_bm.from_mesh(body_me)
DEFORM = body_bm.verts.layers.deform.active
BONE_SET = set(BONES)
BONE_IDX = {GROUPS.index(n): n for n in BONES if n in GROUPS}
BODY_IDX = GROUPS.index("body")


def dominant(v):
    d = v[DEFORM]
    best, bw = None, 0.0
    for gi, w in d.items():
        n = BONE_IDX.get(gi)
        if n and w > bw:
            best, bw = n, w
    return best


def head_of(n):
    return BONES[n][0]


def tail_of(n):
    return BONES[n][1]


def snap(bm, near, to):
    """The boundary's vertices within `near(co)` moved onto `to(co)`: a cut made clean."""
    for v in bm.verts:
        if v.is_boundary and near(v.co):
            v.co = to(v.co)


def shell(name, keep, smooth, thick, extra=None, subdiv=1, edges=None):
    """A garment cut from the body where `keep(co, bone)`: its edges made clean by `edges(bm)`,
    smoothed `smooth` times so the anatomy goes soft, pushed out by `thick(co)` metres, `extra(bm)`
    adding what hangs free, subdivided. The cut keeps the body's skinning."""
    bm = body_bm.copy()
    dl = bm.verts.layers.deform.active
    gone = []
    for v in bm.verts:
        w = v[dl]
        if BODY_IDX not in w:
            gone.append(v)
            continue
        if not keep(v.co, dominant_in(v, dl)):
            gone.append(v)
    bmesh.ops.delete(bm, geom=gone, context="VERTS")
    # drop slivers: faces left hanging by a vertex
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    if edges:
        edges(bm)
    inner = [v for v in bm.verts if not v.is_boundary]
    for _ in range(smooth if isinstance(smooth, int) else smooth[0]):
        bmesh.ops.smooth_vert(bm, verts=inner, factor=0.6, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    if not isinstance(smooth, int):
        # and more where the padding hides more (the chest under a quilted coat)
        heavy = [v for v in inner if smooth[2](v.co)]
        for _ in range(smooth[1]):
            bmesh.ops.smooth_vert(bm, verts=heavy, factor=0.6, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * thick(v.co)
    if extra:
        extra(bm)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(name, me)
    for g in GROUPS:
        ob.vertex_groups.new(name=g)
    me.shade_smooth()
    if subdiv:
        sd = ob.modifiers.new("subdiv", "SUBSURF")
        sd.levels = sd.render_levels = subdiv
        apply_mods(ob)
    return ob


def dominant_in(v, dl):
    best, bw = None, 0.0
    for gi, w in v[dl].items():
        n = BONE_IDX.get(gi)
        if n and w > bw:
            best, bw = n, w
    return best


def loops(bm):
    """The boundary loops of `bm`: lists of vertices, each with its centre."""
    edges = [e for e in bm.edges if e.is_boundary]
    seen, out = set(), []
    for e0 in edges:
        if e0 in seen:
            continue
        loop, stack = set(), [e0]
        while stack:
            e = stack.pop()
            if e in seen:
                continue
            seen.add(e)
            for v in e.verts:
                loop.add(v)
                for e2 in v.link_edges:
                    if e2.is_boundary and e2 not in seen:
                        stack.append(e2)
        vs = list(loop)
        c = sum((v.co for v in vs), Vector()) / len(vs)
        out.append((vs, c))
    return out


def hang(bm, verts, centre, steps, fn):
    """Extrudes the boundary through `verts` `steps` times; fn(co, centre, k) moves each new ring."""
    edges = [e for e in bm.edges if e.is_boundary and all(v in verts for v in e.verts)]
    for k in range(steps):
        res = bmesh.ops.extrude_edge_only(bm, edges=edges)
        new_v = [g for g in res["geom"] if isinstance(g, bmesh.types.BMVert)]
        for v in new_v:
            v.co = fn(v.co, centre, k)
        edges = [g for g in res["geom"] if isinstance(g, bmesh.types.BMEdge) and g.is_boundary]


ARM_L = [head_of("LeftArm"), head_of("LeftForeArm"), head_of("LeftHand")]
ARM_R = [head_of("RightArm"), head_of("RightForeArm"), head_of("RightHand")]


def along_arm(co):
    """(distance along the arm from the shoulder, distance from its line) for the nearer arm."""
    best = (9.0, 9.0)
    for a, e, w in (ARM_L, ARM_R):
        d1, t1 = seg_dist(co, a, e)
        d2, t2 = seg_dist(co, e, w)
        l1 = (e - a).length
        cand = (t1 * l1, d1) if d1 < d2 else (l1 + t2 * (w - e).length, d2)
        if cand[1] < best[1]:
            best = cand
    return best


TORSO = {"LowerBack", "Spine", "Spine1", "LeftShoulder", "RightShoulder", "Neck"}
ARMS = {"LeftArm", "RightArm", "LeftForeArm", "RightForeArm"}
HANDS = {"LeftHand", "RightHand", "LThumb", "RThumb", "LeftFingerBase", "RightFingerBase", "LeftHandFinger1", "RightHandFinger1"}
LEGS = {"LHipJoint", "RHipJoint", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"}
FEET = {"LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"}
WAIST = head_of("LowerBack").z
NECK_Z = head_of("Neck").z
SHOULDER_Z = head_of("LeftArm").z


HEM0 = WAIST - 0.02
COLLAR0 = NECK_Z + 0.025


def wrist_t(co):
    """How far past the cuff line `co` is, along the nearer forearm (negative: short of it)."""
    best = None
    for e, w in ((head_of("LeftForeArm"), head_of("LeftHand")), (head_of("RightForeArm"), head_of("RightHand"))):
        d = (w - e).normalized()
        t = (co - w).dot(d) + 0.03
        dist = (co - (e + d * max(0.0, min((w - e).length, (co - e).dot(d))))).length
        if best is None or dist < best[1]:
            best = (t, dist, d, w)
    return best


def jacket():
    def keep(co, b):
        if b in ARMS:
            return wrist_t(co)[0] < 0
        if co.z < HEM0:
            return False
        if b in TORSO:
            return co.z < COLLAR0
        return b == "Hips"

    def edges(bm):
        # the cut made clean: the hem level, the collar level, the cuffs square to the forearm
        snap(bm, lambda co: abs(co.z - HEM0) < 0.06, lambda co: Vector((co.x, co.y, HEM0)))
        snap(bm, lambda co: abs(co.z - COLLAR0) < 0.04 and abs(co.x) < 0.12, lambda co: Vector((co.x, co.y, COLLAR0)))

        def to_cuff(co):
            t, _, d, w = wrist_t(co)
            return co - d * t

        snap(bm, lambda co: abs(wrist_t(co)[0]) < 0.05 and abs(co.x) > 0.3, to_cuff)

    def thick(co):
        t, near = along_arm(co)
        on_arm = near < 0.1 and abs(co.x) > head_of("LeftArm").x * 0.9
        return 0.026 if on_arm else 0.034

    def extra(bm):
        for vs, c in loops(bm):
            if c.z < WAIST:
                # the skirt of the coat, cut at the waist and hanging free to mid-thigh: out over
                # the hips first, then straight, a little flared at the hem
                grow = (1.16, 1.06, 1.02, 1.02)
                hang(bm, vs, c, 4, lambda co, c, k: Vector((c.x + (co.x - c.x) * grow[k], c.y + (co.y - c.y) * grow[k], co.z - 0.07)))
            elif c.z > NECK_Z - 0.06 and abs(c.x) < 0.1:
                # the stand-up collar
                hang(bm, vs, c, 1, lambda co, c, k: Vector((c.x + (co.x - c.x) * 1.05, c.y + (co.y - c.y) * 1.05, co.z + 0.04)))
            else:
                # the cuffs: turned back, thick
                d = (c - Vector((math.copysign(head_of("LeftForeArm").x, c.x), head_of("LeftForeArm").y, head_of("LeftForeArm").z))).normalized()
                hang(bm, vs, c, 1, lambda co, c, k, d=d: c + (co - c) * 1.12 + d * 0.012)

    chest = lambda co: abs(co.x) < head_of("LeftArm").x * 0.85 and HEM0 < co.z < SHOULDER_Z
    ob = shell("jacket", keep, smooth=(10, 45, chest), thick=thick, extra=extra, subdiv=1, edges=edges)

    def quilt(co, n):
        t, near = along_arm(co)
        if near < 0.13 and abs(co.x) > head_of("LeftArm").x * 0.95:
            ring = abs(((t / 0.05) % 1.0) - 0.5) * 2
            elbow = smooth_band(t - (ARM_L[1] - ARM_L[0]).length, 0.07)
            fold = elbow * 0.007 * math.sin(math.atan2(co.y, co.z) * 7 + t * 40)
            return -0.008 * smooth_band(ring, 0.2) + fold + noise(co, 11) * 0.0018
        ang = math.atan2(co.y, co.x)
        chan = abs(((ang / math.tau * 22) % 1.0) - 0.5) * 2
        d = -0.0085 * smooth_band(chan, 0.18) if co.z < NECK_Z - 0.02 else 0.0
        if co.y < 0 and abs(co.x) < 0.02 and co.z < NECK_Z:
            d -= 0.006 * smooth_band(co.x, 0.02)
        # gathered under the belt, and dragged down by the pockets' weight
        d += smooth_band(co.z - (WAIST - 0.02), 0.05) * 0.008 * math.sin(ang * 13)
        return d + noise(co, 9) * 0.0025

    displace(ob, quilt)
    paint_obj(ob, lambda co, n: (max(0.0, min(1.0, (WAIST - 0.05 - co.z) / 0.15)) * 0.35 + (0.08 if co.z > NECK_Z else 0.0), "jacket"))
    return ob


def trousers():
    def keep(co, b):
        if b in LEGS:
            return co.z > 0.34
        return b == "Hips" and co.z < WAIST + 0.04

    def edges(bm):
        snap(bm, lambda co: co.z < 0.4, lambda co: Vector((co.x, co.y, 0.34)))

    # (slimmer up under the coat, where they'd only push through its hem)
    ob = shell("trousers", keep, smooth=10, thick=lambda co: 0.032 if co.z < 0.72 else 0.008, subdiv=1, edges=edges)

    def quilt(co, n):
        ring = abs(((co.z / 0.055) % 1.0) - 0.5) * 2
        knee = smooth_band(co.z - head_of("LeftLeg").z, 0.07)
        return -0.0045 * smooth_band(ring, 0.17) + knee * 0.006 * math.sin(co.x * 90 + co.y * 70) + noise(co, 11) * 0.0018

    displace(ob, quilt)
    paint_obj(ob, lambda co, n: (0.0, "trousers"))
    return ob


def boots():
    top = 0.44

    def keep(co, b):
        return (b in {"LeftLeg", "RightLeg"} and co.z < top) or b in FEET

    def edges(bm):
        snap(bm, lambda co: co.z > top - 0.06, lambda co: Vector((co.x, co.y, top)))

    def extra(bm):
        for vs, c in loops(bm):
            if c.z > top - 0.05:
                # the shaft's rim, a little loose round the trousers
                hang(bm, vs, c, 1, lambda co, c, k: Vector((c.x + (co.x - c.x) * 1.12, c.y + (co.y - c.y) * 1.12, co.z + 0.01)))
        for v in bm.verts:
            # the sole flat on the ground, a heel
            if v.co.z < 0.018:
                v.co.z = 0.0

    # (the shaft wide enough to take the quilted trousers tucked in)
    ob = shell("boots", keep, smooth=14, thick=lambda co: 0.016 + 0.018 * smooth_band(co.z - top, 0.3), extra=extra, subdiv=1, edges=edges)
    displace(ob, lambda co, n: smooth_band(co.z - 0.16, 0.05) * 0.004 * math.sin(co.y * 160 + co.x * 90) + noise(co, 14) * 0.0012)
    paint_obj(ob, lambda co, n: (0.0, "rubber" if co.z < 0.02 else "leather"))
    return ob


def mittens():
    wrists = (head_of("LeftHand"), head_of("RightHand"))

    def keep(co, b):
        return b in HANDS or (b in {"LeftForeArm", "RightForeArm"} and min((co - w).length for w in wrists) < 0.05)

    ob = shell("mittens", keep, smooth=30, thick=lambda co: 0.011, subdiv=1)

    def mat(co, n):
        # the palm in leather, the back knitted
        side = 1 if co.x > 0 else -1
        palm = Vector((-side * 0.4, 0.1, 0.9)).normalized()
        return (0.0, "leather" if n.dot(palm) < -0.2 else "wool")

    paint_obj(ob, mat)
    return ob


EYE_L = sum((v.co for v in body_bm.verts if GROUPS.index("helper-l-eye") in v[DEFORM]), Vector())
EYE_L /= max(1, sum(1 for v in body_bm.verts if GROUPS.index("helper-l-eye") in v[DEFORM]))
EYE_R = Vector((-EYE_L.x, EYE_L.y, EYE_L.z))


def balaclava():
    def keep(co, b):
        return b in {"Head", "Neck1"} or (b == "Neck" and co.z > NECK_Z + 0.0)

    def in_slit(co):
        # a band across the eyes, the knit pulled back off the skin there
        return co.y < EYE_L.y + 0.02 and abs(co.z - EYE_L.z) < 0.018 and abs(co.x) < EYE_L.x + 0.035

    ob = shell("balaclava", keep, smooth=2, thick=lambda co: 0.0 if in_slit(co) else 0.0055, subdiv=1)
    displace(ob, lambda co, n: 0.0 if in_slit(co) else noise(co, 30) * 0.0008)
    paint_obj(ob, lambda co, n: (0.0, "skin" if in_slit(co) else "wool"))
    return ob


def eyes():
    gi = [GROUPS.index("helper-l-eye"), GROUPS.index("helper-r-eye")]
    bm = body_bm.copy()
    dl = bm.verts.layers.deform.active
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not any(g in v[dl] for g in gi)], context="VERTS")
    me = bpy.data.meshes.new("eyes")
    bm.to_mesh(me)
    bm.free()
    ob = link("eyes", me)
    for g in GROUPS:
        ob.vertex_groups.new(name=g)
    me.shade_smooth()
    paint_obj(ob, lambda co, n: (0.0, "eye"))
    return ob


# --- fitting gear to him ----------------------------------------------------------------------------
HEAD = [v.co for v in body_bm.verts if dominant(v) == "Head" and BODY_IDX in v[DEFORM]]
HEAD_TOP = max(p.z for p in HEAD)
HEAD_HALF = max(abs(p.x) for p in HEAD)
HEAD_C = Vector((0, sum(p.y for p in HEAD) / len(HEAD), HEAD_TOP - HEAD_HALF * 1.15))
# the gear below was drawn round a head centred at (0, 0, 1.715) of half-width 0.1: fitted to his
FIT_HEAD = Matrix.Translation(HEAD_C) @ Matrix.Scale((HEAD_HALF + 0.007) / 0.1, 4) @ Matrix.Translation((0, 0, -1.715))


def ushanka():
    b = Build()
    fur_sway = lambda co: max(0.0, (1.74 - co.z) / 0.16) * 0.55
    b.lathe([(0.02, 1.885), (0.075, 1.875), (0.112, 1.84), (0.126, 1.795), (0.128, 1.765)], 24, "fur", centre=(0, 0.004))
    b.lathe([(0.134, 1.8), (0.146, 1.785), (0.148, 1.76), (0.142, 1.74)], 28, "fur", 0.02, centre=(0, 0.004))
    rounded_box(b, (0, -0.128, 1.808), (0.21, 0.035, 0.085), "fur", 0.02, Matrix.Rotation(math.radians(-12), 3, "X"))
    for sx in (-1, 1):
        rounded_box(b, (sx * 0.133, 0.005, 1.68), (0.034, 0.125, 0.14), "fur", fur_sway)
        b.tube([(sx * 0.14, -0.02, 1.615), (sx * 0.143, -0.03, 1.55), (sx * 0.14, -0.025, 1.49)], 0.004, 4, "rope", lambda co: 0.5 + (1.6 - co.z) * 4)
    rounded_box(b, (0, 0.11, 1.705), (0.2, 0.034, 0.1), "fur", fur_sway)
    # (a size up on the head: a fur hat is big, and its fur stands off it)
    ob = b.done("hat_ushanka", fit=Matrix.Translation(HEAD_C) @ Matrix.Scale(1.12, 4) @ Matrix.Translation(-HEAD_C) @ FIT_HEAD)
    displace(ob, lambda co, n: noise(co, 60) * 0.006 + noise(co, 23) * 0.004 + noise(co, 140) * 0.0025)
    return ob


def hood():
    b = Build()
    prof = [(0.03, 1.875), (0.1, 1.86), (0.135, 1.8), (0.142, 1.72), (0.135, 1.64), (0.125, 1.58), (0.16, 1.52), (0.21, 1.47)]
    b.lathe(prof, 28, "jacket", lambda co: max(0.0, (1.6 - co.z) / 0.15) * 0.3, centre=(0, 0.02), caps=False)
    kill = [f for f in b.bm.faces if all(v.co.y < -0.06 for v in f.verts) and all(1.585 < v.co.z < 1.82 for v in f.verts)]
    bmesh.ops.delete(b.bm, geom=kill, context="FACES")
    pts = [(math.cos(a) * 0.11, -0.075 - math.sin(a) * 0.01, 1.7 + math.sin(a) * 0.115) for a in [i / 12 * math.pi for i in range(13)]]
    b.tube(pts, 0.006, 5, "rope", 0.1, caps=True)
    ob = b.done("hat_hood", fit=FIT_HEAD)
    sol = ob.modifiers.new("solid", "SOLIDIFY")
    sol.thickness = 0.012
    apply_mods(ob)
    displace(ob, lambda co, n: noise(co, 16) * 0.004)
    return ob


def tankist():
    b = Build()
    b.lathe([(0.02, 1.86), (0.08, 1.85), (0.116, 1.81), (0.124, 1.75), (0.122, 1.7)], 24, "leather", centre=(0, 0.004))
    for x in (-0.055, 0.0, 0.055):
        pts = [(x, math.sin(a) * 0.12, 1.74 + math.cos(a) * 0.12) for a in [(-1.25 + i * 0.25) for i in range(11)]]
        b.tube(pts, 0.019, 8, "leather", flat=0.7)
    for sx in (-1, 1):
        rounded_box(b, (sx * 0.12, 0.0, 1.67), (0.04, 0.12, 0.13), "leather")
        b.lathe([(0.035, 0.0), (0.04, -0.012), (0.03, -0.02)], 14, "leather", axis=Matrix.Translation((sx * 0.142, 0, 1.67)) @ Matrix.Rotation(sx * math.pi / 2, 4, "Y"))
        b.tube([(sx * 0.12, -0.03, 1.61), (sx * 0.07, -0.08, 1.565), (0, -0.095, 1.55)], 0.009, 5, "leather", 0.2, flat=0.3)
    return b.done("hat_tankist", fit=FIT_HEAD)


def scarf():
    b = Build()
    b.lathe(
        [(0.098, 1.69), (0.108, 1.67), (0.112, 1.635), (0.104, 1.6), (0.098, 1.575), (0.11, 1.545), (0.118, 1.52)],
        28,
        "scarf",
        0.04,
        centre=(0, -0.008),
        squash=(1, 1.02),
    )
    ob = b.done("face_scarf_wrap", fit=FIT_HEAD)
    displace(ob, lambda co, n: noise(co, 40) * 0.002 + math.sin(co.z * 260) * 0.0012)
    return ob


def gasmask():
    b = Build()
    vs = b.sphere((0, -0.03, 1.665), 0.105, "rubber", 0.0, (1.0, 0.95, 1.13), segs=24)
    bmesh.ops.delete(b.bm, geom=[v for v in vs if v.co.y > -0.005], context="VERTS")
    for sx in (-1, 1):
        ax = Matrix.Translation((sx * 0.042, -0.118, 1.702)) @ Matrix.Rotation(math.radians(80), 4, "X") @ Matrix.Rotation(sx * 0.25, 4, "Z")
        b.lathe([(0.03, 0.014), (0.032, 0.006), (0.031, -0.004)], 16, "iron", axis=ax)
        b.lathe([(0.024, 0.012), (0.024, 0.008)], 16, "lens", axis=ax)
    can = Matrix.Translation((0, -0.135, 1.585)) @ Matrix.Rotation(math.radians(-55), 4, "X")
    b.lathe([(0.025, 0.03), (0.03, 0.0)], 14, "rubber", axis=can)
    b.lathe([(0.044, 0.0), (0.048, -0.01), (0.048, -0.075), (0.042, -0.085), (0.02, -0.088)], 18, "iron", axis=can)
    for z, r in ((1.74, 0.11), (1.66, 0.105)):
        pts = [(math.cos(a) * r, math.sin(a) * r * 1.05 + 0.005, z) for a in [math.radians(200 - i * 14) for i in range(11)]]
        b.tube(pts, 0.008, 5, "rubber", flat=0.35)
    return b.done("face_mask", fit=FIT_HEAD)


def goggles():
    b = Build()
    pts = [(math.cos(a) * 0.153, math.sin(a) * 0.153 + 0.004, 1.775) for a in [i / 24 * math.tau for i in range(25)]]
    b.tube(pts, 0.012, 5, "rubber", flat=0.3)
    for sx in (-1, 1):
        ax = Matrix.Translation((sx * 0.048, -0.152, 1.79)) @ Matrix.Rotation(math.radians(70), 4, "X")
        b.lathe([(0.028, 0.02), (0.03, 0.0), (0.026, -0.008)], 14, "iron", axis=ax)
        b.lathe([(0.023, 0.021), (0.023, 0.017)], 14, "lens", axis=ax)
    return b.done("eyes_goggles", fit=FIT_HEAD)


def surface_of(ob):
    me = ob.data
    return BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])


def on(surface, pts, lift):
    """Points laid on a surface, `lift` metres off it."""
    out = []
    for p in pts:
        loc, nrm, _, _ = surface.find_nearest(Vector(p))
        out.append(loc + nrm * lift if loc is not None else Vector(p))
    return out


def ring_on(surface, z, lift, n=48):
    """A ring round the body at height z, `lift` off the surface (rays out from the middle)."""
    pts, nrms = [], []
    for i in range(n):
        a = i / n * math.tau
        d = Vector((math.cos(a), math.sin(a), 0))
        hit = surface.ray_cast(Vector((0, 0.0, z)) + d * 0.6, -d)
        loc = hit[0] if hit[0] is not None else Vector((0, 0, z)) + d * 0.2
        pts.append(loc + d * lift)
        nrms.append(d)
    return pts, nrms


def belt_and_kit(js):
    b = Build()
    z = WAIST - 0.035
    pts, nrms = ring_on(js, z, 0.006)
    # the belt: a strap laid round the jacket, its width up and down
    b.tube(pts + [pts[0]], 0.026, 4, "leather", flat=0.2, caps=False, twist=Vector((0, 0, 1)))
    front = pts[int(len(pts) * 0.75)]
    b.box(front + Vector((0, -0.008, 0)), (0.07, 0.016, 0.056), "brass")
    for sx, k in ((-1, 0.69), (1, 0.81)):
        p = pts[int(len(pts) * k)]
        rot = Matrix.Rotation(math.atan2(p.x, -p.y) * -1, 3, "Z")
        rounded_box(b, p + Vector((0, 0, -0.035)) + (p - Vector((0, 0, p.z))).normalized() * 0.02, (0.085, 0.05, 0.1), "leather", 0.02, rot)
        rounded_box(b, p + Vector((0, 0, 0.0)) + (p - Vector((0, 0, p.z))).normalized() * 0.04, (0.088, 0.028, 0.04), "leather", 0.05, rot)
    # the canteen at the back right, in its felt cover
    cp = pts[int(len(pts) * 0.375)]
    b.lathe([(0.012, 0.07), (0.03, 0.055), (0.06, 0.02), (0.065, -0.05), (0.058, -0.09), (0.03, -0.1)], 16, "canvas", 0.04, centre=(cp.x * 1.25, cp.y * 1.25), squash=(1, 0.6), axis=Matrix.Translation((0, 0, z - 0.05)))
    # the gas-mask bag at the left hip on its strap across the chest
    hp = pts[0] + Vector((0.035, -0.02, -0.12))
    rounded_box(b, hp, (0.075, 0.16, 0.19), "canvas", 0.12)
    rounded_box(b, hp + Vector((0.006, 0, 0.09)), (0.082, 0.165, 0.05), "canvas", 0.18)
    path = on(js, [hp + Vector((-0.01, -0.05, 0.1)), (0.17, -0.16, 1.15), (0.07, -0.19, 1.33), (-0.1, -0.15, 1.46), (-0.16, 0.0, SHOULDER_Z + 0.02), (-0.1, 0.15, 1.4), (0.08, 0.17, 1.2), hp + Vector((-0.01, 0.06, 0.1))], 0.007)
    b.tube(path, 0.017, 6, "canvas", 0.03, flat=0.25)
    # the undershirt at the collar's opening, and buttons down the front
    for k in range(5):
        zz = NECK_Z - 0.1 - k * 0.11
        hit = js.ray_cast(Vector((0, -0.6, zz)), Vector((0, 1, 0)))
        if hit[0] is not None:
            p = hit[0] + Vector((0, -0.004, 0))
            b.lathe([(0.009, 0.003), (0.009, -0.003)], 8, "iron", axis=Matrix.Translation(p) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    b.lathe([(0.062, NECK_Z + 0.03), (0.07, NECK_Z - 0.01), (0.078, NECK_Z - 0.04)], 20, "stripe", centre=(0, head_of("Neck").y))
    return b.done("belt")


def patch(js):
    """A patch sewn on the left elbow."""
    b = Build()
    e = head_of("LeftForeArm")
    loc, nrm, _, _ = js.find_nearest(e + Vector((0, 0.08, 0)))
    rounded_box(b, loc + nrm * 0.004, (0.07, 0.018, 0.085), "canvas", rot=nrm.to_track_quat("Y", "Z").to_matrix())
    return b.done("patch")


def back_point(js):
    hit = js.ray_cast(Vector((0, 0.6, 1.33)), Vector((0, -1, 0)))
    return hit[0] if hit[0] is not None else Vector((0, 0.17, 1.33))


def back_fit(js):
    """The back gear was drawn against a back at (0, 0.16, 1.3) under shoulders at 1.44: fitted."""
    bp = back_point(js)
    return Matrix.Translation((0, bp.y + 0.012 - 0.16, bp.z - 1.3 + (SHOULDER_Z - 1.44) * 0.5))


def pack(js):
    b = Build()
    rounded_box(b, (0, 0.215, 1.19), (0.34, 0.2, 0.44), "canvas", 0.03)
    rounded_box(b, (0, 0.2, 1.375), (0.33, 0.215, 0.12), "canvas", 0.06, Matrix.Rotation(math.radians(-6), 3, "X"))
    for sx in (-1, 1):
        rounded_box(b, (sx * 0.185, 0.22, 1.1), (0.07, 0.13, 0.2), "canvas", 0.03)
        b.tube([(sx * 0.08, 0.06, 1.41), (sx * 0.08, 0.1, 1.33), (sx * 0.08, 0.115, 1.25)], 0.014, 4, "leather", 0.08, flat=0.2)
        b.box((sx * 0.08, 0.114, 1.255), (0.032, 0.008, 0.026), "brass")
    ax = Matrix.Translation((0, 0.225, 1.5)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
    b.lathe([(0.0, 0.28), (0.06, 0.275), (0.075, 0.25), (0.078, -0.25), (0.06, -0.275), (0.0, -0.28)], 16, "canvas", 0.03, axis=ax)
    for x in (-0.16, 0.16):
        b.lathe([(0.083, 0.015), (0.083, -0.015)], 16, "leather", axis=Matrix.Translation((x, 0.225, 1.5)) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
    fit = back_fit(js)
    bmesh.ops.transform(b.bm, matrix=fit, verts=b.bm.verts, space=Matrix.Identity(4))
    # the shoulder straps, laid on the jacket: over the shoulders, down the chest, under the arms
    for sx in (-1, 1):
        sh = head_of("LeftArm")
        path = [
            fit @ Vector((sx * 0.1, 0.12, 1.43)),
            Vector((sx * sh.x * 0.62, 0.02, SHOULDER_Z + 0.06)),
            Vector((sx * sh.x * 0.66, -0.12, SHOULDER_Z - 0.06)),
            Vector((sx * sh.x * 0.72, -0.17, SHOULDER_Z - 0.2)),
            Vector((sx * sh.x * 0.88, -0.12, SHOULDER_Z - 0.38)),
            Vector((sx * sh.x * 0.95, 0.0, SHOULDER_Z - 0.47)),
            fit @ Vector((sx * 0.15, 0.1, 1.0)),
        ]
        path = on(js, path[1:-1], 0.009)
        path = [fit @ Vector((sx * 0.1, 0.12, 1.43))] + path + [fit @ Vector((sx * 0.15, 0.1, 1.0))]
        b.tube(path, 0.022, 6, "leather", 0.0, flat=0.2)
        b.box(path[3] + Vector((0, -0.006, 0)), (0.042, 0.01, 0.03), "iron")
    return b.done("back_pack")


def sack(js):
    b = Build()
    prof =[(0.03, 1.4), (0.06, 1.385), (0.1, 1.34), (0.14, 1.26), (0.155, 1.17), (0.14, 1.08), (0.1, 1.035), (0.02, 1.02)]
    b.lathe(prof, 24, "canvas", 0.04, centre=(0, 0.225), squash=(1, 0.72))
    b.lathe([(0.064, 1.385), (0.064, 1.37)], 12, "rope", centre=(0, 0.225))
    fit = back_fit(js)
    bmesh.ops.transform(b.bm, matrix=fit, verts=b.bm.verts, space=Matrix.Identity(4))
    for sx in (-1, 1):
        sh = head_of("LeftArm")
        path = on(js, [Vector((sx * sh.x * 0.55, 0.04, SHOULDER_Z + 0.06)), Vector((sx * sh.x * 0.68, -0.13, SHOULDER_Z - 0.08)), Vector((sx * sh.x * 0.9, -0.12, SHOULDER_Z - 0.35)), Vector((sx * sh.x * 0.9, 0.05, SHOULDER_Z - 0.48))], 0.006)
        b.tube([fit @ Vector((sx * 0.02, 0.2, 1.38))] + path + [fit @ Vector((sx * 0.06, 0.2, 1.06))], 0.008, 5, "rope", 0.0)
    ob = b.done("back_sack")
    displace(ob, lambda co, n: noise(co, 18) * 0.006)
    return ob


def rifle(js):
    b = Build()
    a, z = Vector((-0.25, 0.34, 1.86)), Vector((0.17, 0.31, 0.8))
    d = (z - a).normalized()
    at = lambda t: a.lerp(z, t)
    b.tube([at(0.0), at(0.42)], 0.0095, 8, "iron")
    b.box(at(0.006) + Vector((0, -0.012, 0)), (0.006, 0.01, 0.014), "iron", rot=Matrix.Rotation(math.atan2(d.x, -d.z), 3, "Y"))
    b.tube([at(0.12), at(0.42)], [0.017, 0.019], 8, "wood", flat=0.85)
    for t in (0.15, 0.3):
        b.tube([at(t - 0.006), at(t + 0.006)], 0.0195, 8, "iron")
    b.tube([at(0.42), at(0.56)], 0.02, 8, "iron", flat=0.8)
    knob = at(0.5) + Vector((0.0, -0.045, 0.0))
    b.tube([at(0.5), knob], 0.004, 5, "iron")
    b.sphere(knob, 0.009, "iron", segs=8)
    b.tube([at(0.56), at(0.66), at(0.76), at(1.0)], [0.02, 0.019, 0.028, 0.034], 8, "wood", flat=0.55)
    b.box(at(1.0), (0.034, 0.024, 0.012), "iron", rot=Matrix.Rotation(math.atan2(d.x, -d.z), 3, "Y"))
    sl = Vector((0, -0.025, 0))
    b.tube([at(0.17) + sl, at(0.45) + sl * 1.6, at(0.7) + sl * 1.4, at(0.92) + sl], 0.016, 5, "leather", 0.06, flat=0.18)
    return b.done("slung_rifle", fit=back_fit(js) @ Matrix.Translation((0, 0.03, 0)))


def axe(js):
    b = Build()
    top, bot = Vector((-0.2, 0.33, 1.52)), Vector((0.05, 0.35, 0.95))
    mid = top.lerp(bot, 0.5) + Vector((0.02, 0.01, 0))
    b.tube([top, mid, bot], [0.017, 0.015, 0.019], 8, "wood")
    d = (bot - top).normalized()
    side = d.cross(Vector((0, 1, 0))).normalized()
    up = -d
    o = top + d * 0.035
    vs = []
    for x, half_t, half_h in ((-0.035, 0.018, 0.03), (0.02, 0.013, 0.028), (0.07, 0.006, 0.045), (0.12, 0.0015, 0.065)):
        for zz in (-half_h, half_h):
            for yy in (-half_t, half_t):
                vs.append(b.bm.verts.new(o + side * x + up * zz + Vector((0, yy, 0))))
    for i in range(3):
        a0, a1 = i * 4, (i + 1) * 4
        b.bm.faces.new((vs[a0 + 0], vs[a1 + 0], vs[a1 + 1], vs[a0 + 1]))
        b.bm.faces.new((vs[a0 + 2], vs[a0 + 3], vs[a1 + 3], vs[a1 + 2]))
        b.bm.faces.new((vs[a0 + 0], vs[a0 + 2], vs[a1 + 2], vs[a1 + 0]))
        b.bm.faces.new((vs[a0 + 1], vs[a1 + 1], vs[a1 + 3], vs[a0 + 3]))
    b.bm.faces.new((vs[0], vs[1], vs[3], vs[2]))
    b.bm.faces.new((vs[12], vs[14], vs[15], vs[13]))
    b.paint(vs, "iron")
    return b.done("slung_axe", sharp=30, fit=back_fit(js) @ Matrix.Translation((0, 0.03, 0)))


# the lantern's grip: in the right mitten, below the hand's bone
GRIP = head_of("RightHand").lerp(tail_of("RightHandFinger1") if "RightHandFinger1" in BONES else tail_of("RightHand"), 0.45) + Vector((0, 0, -0.035))


def lantern():
    b = Build()
    g = GRIP
    c = (g.x, g.y)
    top = g.z - 0.02
    pts = [(g.x + math.sin(a) * 0.07, g.y, top - (1 - math.cos(a)) * 0.07) for a in [(-1.2 + i * 0.2) for i in range(13)]]
    b.tube(pts, 0.0028, 5, "iron")
    z0 = top - 0.07
    b.lathe([(0.012, z0 + 0.012), (0.03, z0 + 0.008), (0.052, z0 - 0.01), (0.056, z0 - 0.022)], 16, "iron", centre=c)
    b.lathe([(0.02, z0 + 0.03), (0.02, z0 + 0.012)], 12, "iron", centre=c)
    gz = z0 - 0.03
    b.lathe([(0.036, gz), (0.05, gz - 0.025), (0.054, gz - 0.06), (0.048, gz - 0.095), (0.036, gz - 0.112)], 18, "glass", centre=c)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        dx, dy = math.cos(a) * 0.06, math.sin(a) * 0.06
        b.tube([(g.x + dx * 0.75, g.y + dy * 0.75, gz), (g.x + dx, g.y + dy, gz - 0.056), (g.x + dx * 0.78, g.y + dy * 0.78, gz - 0.112)], 0.0022, 4, "iron")
    for zz, rr in ((gz - 0.056, 0.061), (gz - 0.008, 0.045)):
        b.lathe([(rr, zz + 0.002), (rr, zz - 0.002)], 18, "iron", centre=c)
    for sx in (-1, 1):
        b.tube([(g.x + sx * 0.058, g.y, z0 - 0.012), (g.x + sx * 0.068, g.y, gz - 0.06), (g.x + sx * 0.062, g.y, gz - 0.12)], 0.006, 6, "iron")
    tz = gz - 0.112
    b.lathe([(0.04, tz), (0.064, tz - 0.012), (0.068, tz - 0.035), (0.06, tz - 0.05), (0.0, tz - 0.052)], 20, "brass", centre=c)
    return b.done("hand_lantern")


# --- skinning ----------------------------------------------------------------------------------------
def skin_like(ob, *sources):
    """Weights copied from the nearest vertex of the `sources` (the garments it lies on)."""
    verts = [(s, v) for s in sources for v in s.data.vertices]
    kd = KDTree(len(verts))
    for i, (_, v) in enumerate(verts):
        kd.insert(v.co, i)
    kd.balance()
    names = {s.name: {g.index: g.name for g in s.vertex_groups} for s in sources}
    groups = {}
    for v in ob.data.vertices:
        _, i, _ = kd.find(v.co)
        src, sv = verts[i]
        for ge in sv.groups:
            n = names[src.name][ge.group]
            if n not in BONE_SET:
                continue
            g = groups.get(n) or ob.vertex_groups.get(n) or ob.vertex_groups.new(name=n)
            groups[n] = g
            g.add([v.index], ge.weight, "REPLACE")


def rigid(ob, bone):
    g = ob.vertex_groups.new(name=bone)
    g.add([v.index for v in ob.data.vertices], 1.0, "REPLACE")


def attach(ob):
    ob.parent = rig
    mod = ob.modifiers.new("rig", "ARMATURE")
    mod.object = rig


# --- build everything ----------------------------------------------------------------------------
J = jacket()
js = surface_of(J)
parts = {
    "body": [J, trousers(), boots(), mittens(), balaclava(), eyes(), belt_and_kit(js), patch(js)],
    "hat_ushanka": [ushanka()],
    "hat_hood": [hood()],
    "hat_tankist": [tankist()],
    "face_scarf": [scarf()],
    "face_mask": [gasmask()],
    "eyes_goggles": [goggles()],
    "back_pack": [pack(js)],
    "back_sack": [sack(js)],
    "slung_rifle": [rifle(js)],
    "slung_axe": [axe(js)],
    "hand_lantern": [lantern()],
}
# skins: garments cut from him keep his; what lies on the jacket takes the jacket's; the rest rides
# one bone
bala = parts["body"][4]
for o in parts["body"][6:]:
    skin_like(o, J)
for n in ("hat_ushanka", "hat_tankist", "face_mask", "eyes_goggles"):
    rigid(parts[n][0], "Head")
for n in ("hat_hood", "face_scarf"):
    skin_like(parts[n][0], J, bala)
for n in ("back_pack", "back_sack"):
    skin_like(parts[n][0], J)
# (the guns ride the chest, not the arms they hang near)
for n in ("slung_rifle", "slung_axe"):
    rigid(parts[n][0], "Spine1")

# the lantern on its own bone, hanging from the grip
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
eb = rig.data.edit_bones.new("lantern")
eb.head, eb.tail = GRIP, GRIP + Vector((0, 0, -0.3))
eb.parent = rig.data.edit_bones["RightHand"]
bpy.ops.object.mode_set(mode="OBJECT")
rig.select_set(False)
BONES["lantern"] = (GRIP.copy(), GRIP + Vector((0, 0, -0.3)))
BONE_SET.add("lantern")
rigid(parts["hand_lantern"][0], "lantern")

# --- ambient occlusion, cast from each vertex (b), each piece with the body round it ---------------
# (rays from each vertex over the hemisphere its normal faces, out to a hand's breadth: how much of
# them the clothes stop. Cast here rather than baked: deterministic, and blind to what's inside)
RAYS = []
for i in range(24):
    # a cosine-weighted spiral over the hemisphere about +z
    r = math.sqrt((i + 0.5) / 24)
    a = i * 2.39996
    RAYS.append(Vector((math.cos(a) * r, math.sin(a) * r, math.sqrt(max(0.0, 1 - r * r)))))


def occluders(obs):
    verts, polys = [], []
    for o in obs:
        base = len(verts)
        verts += [v.co.copy() for v in o.data.vertices]
        polys += [tuple(base + i for i in p.vertices) for p in o.data.polygons]
    return BVHTree.FromPolygons(verts, polys)


def cast_ao(ob, tree, reach=0.09):
    me = ob.data
    col = me.color_attributes["Col"]
    ao = []
    for v in me.vertices:
        n = v.normal
        t = n.orthogonal().normalized()
        bt = n.cross(t)
        o = v.co + n * 0.004
        hit = 0
        for d in RAYS:
            w = t * d.x + bt * d.y + n * d.z
            if tree.ray_cast(o, w, reach)[0] is not None:
                hit += 1
        ao.append(1 - hit / len(RAYS))
    # softened once over the mesh's edges
    nb = [[] for _ in me.vertices]
    for e in me.edges:
        a, b = e.vertices
        nb[a].append(b)
        nb[b].append(a)
    for i in range(len(me.vertices)):
        s = (ao[i] * 2 + sum(ao[j] for j in nb[i])) / (2 + len(nb[i]))
        c = col.data[i].color
        col.data[i].color = (c[0], c[1], max(0.2, min(1.0, s)), 1.0)


body = parts["body"]
body_tree = occluders(body)
for name, ps in parts.items():
    for o in ps:
        # (the body alone for the body: gear that comes off mustn't leave its shadow behind)
        cast_ao(o, body_tree if name == "body" else occluders(body + [o]))

# --- join each slot into one mesh, skinned to the rig ----------------------------------------------
for name, ps in parts.items():
    for o in ps:
        # only the bones' groups go into the file
        for g in list(o.vertex_groups):
            if g.name not in BONE_SET:
                o.vertex_groups.remove(g)
        attach(o)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in ps:
        o.select_set(True)
    bpy.context.view_layer.objects.active = ps[0]
    if len(ps) > 1:
        bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = joined.data.name = name
    joined.data.materials.clear()
    for o in bpy.context.selected_objects:
        o.select_set(False)
bpy.data.objects.remove(human)


# --- the clips ------------------------------------------------------------------------------------
LEFT_ARM = ["LeftArm", "LeftForeArm", "LeftHand", "LThumb", "LeftFingerBase", "LeftHandFinger1"]
UPPER = ["LowerBack", "Spine", "Spine1", "Neck", "Neck1", "Head", "LeftShoulder", "RightShoulder", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "LeftHand", "RightHand", "LThumb", "RThumb", "LeftFingerBase", "RightFingerBase", "LeftHandFinger1", "RightHandFinger1"]


def bearing(world, out, lean=0.0):
    """How he carries himself: the free arm held `out` degrees off the body (a padded coat won't let
    it hang close, and a big man's arms don't), the body leaning `lean` degrees into the way he goes
    under the pack, the head lifted back level."""
    mocap.turn(world, LEFT_ARM, "Y", -out)
    if lean:
        mocap.turn(world, UPPER, "X", lean)
        mocap.turn(world, ["Neck1", "Head"], "X", -lean * 0.7)


def lantern_arm(amount, out=7, lean=0.0):
    """The right arm holding the lantern out, a little ahead and to the side, letting `1 - amount` of
    the capture's swing through; the left held `out` degrees off the body; leaning `lean` degrees."""

    def edit(world, hips, t):
        bearing(world, out, lean)
        # the upper arm hanging off the side, the elbow bent: the lantern carried at the hip, a
        # little ahead, as a weight is carried, not held out
        mocap.aim(rig, world, "RightArm", (-0.26, -0.08, -0.96), amount)
        mocap.aim(rig, world, "RightForeArm", (-0.1, -0.7, -0.71), amount)
        mocap.aim(rig, world, "RightHand", (-0.06, -0.55, -0.83), amount)

    return edit


def trudge_edit():
    """A slow walk made a trudge through snow: each knee pulled high out of the drift as it swings,
    the body leaning in, the hips sunk a little."""
    state = {"L": None, "R": None, "sL": 0.0, "sR": 0.0}
    arm = lantern_arm(0.85)

    def edit(world, hips, t):
        for s, side in (("L", "Left"), ("R", "Right")):
            d = world[f"{side}UpLeg"] @ Vector((0, 1, 0))
            fwd = -d.y
            prev = state[s]
            state[s] = fwd
            swing = 0.0 if prev is None else max(0.0, min(1.0, (fwd - prev) * 40))
            state["s" + s] += (swing - state["s" + s]) * 0.35
            k = state["s" + s]
            mocap.turn(world, [f"{side}UpLeg", f"{side}Leg", f"{side}Foot", f"{side}ToeBase"], "X", -26 * k)
            mocap.turn(world, [f"{side}Leg", f"{side}Foot", f"{side}ToeBase"], "X", 40 * k)
            mocap.turn(world, [f"{side}Foot", f"{side}ToeBase"], "X", -16 * k)
        mocap.turn(world, UPPER, "X", 9)
        mocap.turn(world, ["Neck", "Neck1", "Head"], "X", -6)
        hips.z -= 0.035
        arm(world, hips, t)

    return edit


SPEEDS = {}
# The locomotion is Mixamo's (one animator, a man's gait: its Male Locomotion Pack, Walking Backwards),
# placed by hand in tools/blender/out/mixamo (setup.sh says how); the trudge and the cold are CMU's.
# (each foot a couple of centimetres further out than the capture's: a heavy man in boots walks wide)
MX = os.path.join(HERE, "out", "mixamo")
SPEEDS["walk"] = mocap.bake_clip(rig, os.path.join(MX, "pack_walking.fbx"), "walk", edit=lantern_arm(0.85, 7, 3), wide=0.02)
SPEEDS["back"] = mocap.bake_clip(rig, os.path.join(MX, "walking_backwards.fbx"), "back", cycle=(0.8, 1.6), edit=lantern_arm(0.85, 7, 0), wide=0.02, along=(0, 1))
SPEEDS["left"] = mocap.bake_clip(rig, os.path.join(MX, "pack_left_strafe_walking.fbx"), "left", edit=lantern_arm(0.85, 7, 0), along=(1, 0))
SPEEDS["right"] = mocap.bake_clip(rig, os.path.join(MX, "pack_right_strafe_walking.fbx"), "right", edit=lantern_arm(0.85, 7, 0), along=(-1, 0))
SPEEDS["run"] = mocap.bake_clip(rig, os.path.join(MX, "pack_standard_run.fbx"), "run", cycle=(0.5, 0.9), edit=lantern_arm(0.75, 10, 11), wide=0.015, ground="lowest")
SPEEDS["run_left"] = mocap.bake_clip(rig, os.path.join(MX, "pack_left_strafe.fbx"), "run_left", cycle=(0.5, 0.9), edit=lantern_arm(0.75, 10, 6), ground="lowest", along=(1, 0))
SPEEDS["run_right"] = mocap.bake_clip(rig, os.path.join(MX, "pack_right_strafe.fbx"), "run_right", cycle=(0.5, 0.9), edit=lantern_arm(0.75, 10, 6), ground="lowest", along=(-1, 0))
# turning on the spot: the feet stepping round (the game turns the body), stepped through as he turns
SPEEDS["turn_left"] = mocap.bake_clip(rig, os.path.join(MX, "pack_left_turn_90.fbx"), "turn_left", edit=lantern_arm(0.9, 7, 0), mode="turn")
SPEEDS["turn_right"] = mocap.bake_clip(rig, os.path.join(MX, "pack_right_turn_90.fbx"), "turn_right", edit=lantern_arm(0.9, 7, 0), mode="turn")


def no_rise(world, hips, t):
    """A jump's crouch and landing, not its height: the game lifts the body."""
    lantern_arm(0.6, 10, 0)(world, hips, t)
    hips.z = min(hips.z, 0.0)


SPEEDS["jump"] = mocap.bake_clip(rig, os.path.join(MX, "pack_jump.fbx"), "jump", edit=no_rise, mode="once", ground="none")
SPEEDS["trudge"] = mocap.bake_clip(rig, os.path.join(CMU, "08_04.bvh"), "trudge", cycle=(1.2, 2.0), edit=trudge_edit(), wide=0.03)
def standing(arm_amount, keep):
    """A still clip: the lantern arm, and the head kept looking where the body faces, `keep` of the
    capture's own turning let through (its actor looked about the room; the game turns the head
    toward where you look)."""
    arm = lantern_arm(arm_amount)

    def edit(world, hips, t):
        mocap.steady(rig, world, ["Neck", "Neck1", "Head"], "Spine1", keep)
        arm(world, hips, t)

    return edit


SPEEDS["idle"] = mocap.bake_clip(rig, os.path.join(MX, "pack_idle.fbx"), "idle", still=True, edit=standing(0.9, 0.6), wide=0.03)
SPEEDS["cold"] = mocap.bake_clip(rig, os.path.join(CMU, "79_68.bvh"), "cold", cycle=(4, 8), still=True, seconds=6, start=0.4, edit=standing(0.5, 0.6), wide=0.02)
scene.render.fps = 30

for o in bpy.context.selected_objects:
    o.select_set(False)
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format="GLB",
    export_apply=False,
    export_materials="NONE",
    export_texcoords=False,
    export_normals=True,
    export_vertex_color="ACTIVE",
    export_active_vertex_color_when_no_material=True,
    export_yup=True,
    export_skins=True,
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_force_sampling=True,
    export_optimize_animation_size=False,
    export_def_bones=False,
)
print("wrote", out, {n: len(bpy.data.objects[n].data.vertices) for n in parts}, "speeds and metres a cycle", {k: (round(v[0], 2), round(v[1], 2)) for k, v in SPEEDS.items()})
