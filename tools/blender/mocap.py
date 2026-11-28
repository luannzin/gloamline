# Motion capture onto the survivor's skeleton (MPFB's `cmu_mb` rig, whose bones are named as the CMU
# database's joints). Imported by survivor.py; Blender's own BVH importer reads the clips.
#
# Retargeting: each bone's turn away from its rest pose in the capture, in world space, is applied to
# the same bone of ours. The two rest poses differ (the capture's is a T, ours an A), so ours is first
# turned, bone by bone, until each points the way the capture's rest points; the capture's movement is
# then laid on top. The hips carry the capture's bob and sway, scaled to our height; their travel over
# the ground is taken out, so each clip walks on the spot and the game moves the body.
#
# Each clip is cut to one cycle where the motion repeats (found by comparing poses), its ends blended
# so it loops, and resampled to 30 frames a second.
import math

import bpy
from mathutils import Matrix, Quaternion, Vector

# capture joint -> our bone (where the names differ)
RENAME = {"LeftHandIndex": "LeftHandFinger1", "RightHandIndex": "RightHandFinger1"}


def load(path):
    before = set(bpy.data.objects)
    bpy.ops.import_anim.bvh(
        filepath=path,
        axis_forward="-Z",
        axis_up="Y",
        rotate_mode="NATIVE",
        update_scene_fps=False,
        update_scene_duration=False,
        use_fps_scale=False,
    )
    ob = next(o for o in bpy.data.objects if o not in before)
    act = ob.animation_data.action
    lo, hi = act.frame_range
    return ob, int(lo), int(hi)


def rot3(m):
    return m.to_3x3().normalized()


class Retarget:
    def __init__(self, src, tgt):
        self.src, self.tgt = src, tgt
        sb, tb = src.data.bones, tgt.data.bones
        self.pairs = []
        for b in sb:
            name = RENAME.get(b.name, b.name)
            if name in tb:
                self.pairs.append((b.name, name))
        mw = src.matrix_world
        self.src_rest = {b.name: rot3(mw @ b.matrix_local) for b in sb}
        # the capture faces some way: turn it to face ours (-y), from its feet at rest
        toe = mw @ sb["LeftToeBase"].head_local
        ankle = mw @ sb["LeftFoot"].head_local
        fwd = Vector((toe.x - ankle.x, toe.y - ankle.y, 0)).normalized()
        self.G = fwd.rotation_difference(Vector((0, -1, 0))).to_matrix()
        Gi = self.G.inverted()
        # ours turned to the capture's rest, bone by bone (directions only: the twist stays ours)
        self.tgt_ref = {}
        for s, t in self.pairs:
            bs, bt = sb[s], tb[t]
            ds = self.G @ (mw.to_3x3() @ (bs.tail_local - bs.head_local))
            dt = bt.tail_local - bt.head_local
            if ds.length < 1e-6 or dt.length < 1e-6:
                fix = Matrix.Identity(3)
            else:
                fix = dt.normalized().rotation_difference(ds.normalized()).to_matrix()
            self.tgt_ref[t] = fix @ rot3(bt.matrix_local)
        self.Gi = Gi
        hips = sb["Hips"]
        self.src_hips_rest = mw @ hips.head_local
        # the capture's units to ours: by the length of a leg, hip to ankle
        leg = lambda bones, m: ((m @ bones["LeftUpLeg"].head_local) - (m @ bones["LeftFoot"].head_local)).length
        self.scale = leg(tb, Matrix.Identity(4)) / max(1e-6, leg(sb, mw))

    def world(self, frame):
        """Our bones' world rotations and the hips' position at the capture's `frame`."""
        bpy.context.scene.frame_set(frame)
        mw = self.src.matrix_world
        out = {}
        for s, t in self.pairs:
            pb = self.src.pose.bones[s]
            d = rot3(mw @ pb.matrix) @ self.src_rest[s].inverted()
            out[t] = (self.G @ d @ self.Gi) @ self.tgt_ref[t]
        hp = mw @ self.src.pose.bones["Hips"].head
        hips = self.G @ (hp - self.src_hips_rest) * self.scale
        return out, hips


def local_pose(tgt, world, hips):
    """World rotations (armature space) to each bone's local quaternion, parents first; the hips'
    offset (armature space) to its location."""
    posed = {}
    out = {}
    for b in tgt.data.bones:
        W = world.get(b.name)
        rest = b.matrix_local
        if b.parent is None:
            parent_rot = Matrix.Identity(3)
            rest_local = rot3(rest)
        else:
            parent_rot = posed[b.parent.name]
            rest_local = rot3(b.parent.matrix_local.inverted() @ rest)
        base = parent_rot @ rest_local
        if W is None:
            L = Matrix.Identity(3)
        else:
            L = base.inverted() @ W
        posed[b.name] = base @ L
        q = L.to_quaternion()
        loc = Vector()
        if b.parent is None:
            loc = rot3(rest).inverted() @ hips
        out[b.name] = (q, loc)
    return out


def period(samples, lo, hi):
    """The frame count, in [lo, hi], after which `samples` (one vector a frame) best repeats."""
    best, best_p = 1e18, lo
    n = len(samples)
    for p in range(lo, min(hi, n // 2) + 1):
        e = 0.0
        c = 0
        for i in range(0, n - p, 2):
            a, b = samples[i], samples[i + p]
            e += sum((x - y) ** 2 for x, y in zip(a, b))
            c += 1
        e /= max(1, c)
        if e < best:
            best, best_p = e, p
    return best_p


def feature(world):
    """What a frame's pose is, for comparing frames: the legs' and arms' directions."""
    v = []
    for n in ("LeftUpLeg", "LeftLeg", "RightUpLeg", "RightLeg", "LeftArm", "RightArm", "Spine1"):
        if n in world:
            d = world[n] @ Vector((0, 1, 0))
            v += [d.x, d.y, d.z]
    return v


def bake_clip(tgt, path, name, *, cycle, start=0.25, edit=None, fps=30, seconds=None, still=False):
    """Retargets the capture at `path` onto `tgt` as action `name`: one cycle of `cycle` (min, max)
    seconds from `start` of the way in (or `seconds` long for a still clip), looped, at `fps`.
    `edit(world, hips, phase)` may change each frame's pose. Returns metres a second the capture
    walked (for the game to match the stride)."""
    src, lo, hi = load(path)
    rt = Retarget(src, tgt)
    src_fps = 120
    frames = list(range(lo, hi + 1))
    worlds = [rt.world(f) for f in frames]
    a = lo + int((hi - lo) * start)
    if still:
        p = int((seconds or 6) * src_fps)
    else:
        feats = [feature(w) for w, _ in worlds[a - lo :]]
        p = period(feats, int(cycle[0] * src_fps), int(cycle[1] * src_fps))
    b = min(hi, a + p)
    p = b - a
    if still:
        # a clip on the spot faces where the actor happened to: turned to face ours, by the hips'
        # mean heading over the cycle (their sway kept)
        hr = tgt.data.bones["Hips"].matrix_local.to_3x3().normalized()
        ang = 0.0
        for w, _ in worlds[a - lo : b - lo]:
            f = w["Hips"] @ hr.inverted() @ Vector((0, -1, 0))
            ang += math.atan2(f.x, -f.y)
        ang /= max(1, b - a)
        R = Matrix.Rotation(-ang, 3, "Z")
        for i, (w, hp) in enumerate(worlds):
            worlds[i] = ({k: R @ m for k, m in w.items()}, R @ hp)
    # the ground covered over the cycle: taken out, kept as the clip's speed
    h0, h1 = worlds[a - lo][1], worlds[b - lo][1]
    travel = Vector((h1.x - h0.x, h1.y - h0.y, 0))
    speed = travel.length / (p / src_fps)
    n = max(2, round(p / src_fps * fps))
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    tgt.animation_data_create()
    tgt.animation_data.action = act
    blend = 0.18
    for k in range(n + 1):
        t = k / n
        f = a + t * p
        i0 = int(f) - lo
        frac = f - int(f)
        w0, hp0 = worlds[min(i0, len(worlds) - 1)]
        w1, hp1 = worlds[min(i0 + 1, len(worlds) - 1)]
        world = {key: w0[key].to_quaternion().slerp(w1[key].to_quaternion(), frac).to_matrix() for key in w0}
        hips = hp0.lerp(hp1, frac)
        # the loop's seam: the last part blended into the frames before the start
        if t > 1 - blend:
            u = (t - (1 - blend)) / blend
            u = u * u * (3 - 2 * u)
            g = f - p
            j = max(0, int(g) - lo)
            wj, hj = worlds[j]
            world = {key: world[key].to_quaternion().slerp(wj[key].to_quaternion(), u).to_matrix() for key in world}
            hips = hips.lerp(hj + travel, u)
        # on the spot: the travel taken out
        hips = hips - h0 - travel * t
        hips.x *= 0.6
        if edit:
            edit(world, hips, t)
        pose = local_pose(tgt, world, hips)
        for pb in tgt.pose.bones:
            q, loc = pose[pb.name]
            pb.rotation_mode = "QUATERNION"
            pb.rotation_quaternion = q
            pb.location = loc
            pb.keyframe_insert("rotation_quaternion", frame=k)
            if pb.parent is None:
                pb.keyframe_insert("location", frame=k)
    tgt.animation_data.action = None
    for pb in tgt.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()
    act_src = src.animation_data.action
    bpy.data.objects.remove(src)
    if act_src:
        bpy.data.actions.remove(act_src)
    print("clip", name, "frames", n, "speed", round(speed, 2), "m/s", "cycle", round(p / src_fps, 2), "s")
    return speed


def aim(tgt, world, bone, direction, amount=1.0):
    """Turns `bone` (world rotation in `world`) so it points along `direction`, by `amount`."""
    W = world.get(bone)
    if W is None:
        return
    cur = W @ Vector((0, 1, 0))
    q = cur.rotation_difference(Vector(direction).normalized())
    q = Quaternion().slerp(q, amount)
    world[bone] = q.to_matrix() @ W


def turn(world, bones, axis, deg):
    """Turns `bones` about a world axis (each keeps its own place in the chain)."""
    R = Matrix.Rotation(math.radians(deg), 3, axis)
    for b in bones:
        if b in world:
            world[b] = R @ world[b]
