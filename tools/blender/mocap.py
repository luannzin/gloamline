# Motion capture onto the survivor's skeleton (MPFB's `cmu_mb` rig, whose bones are named as the CMU
# database's joints). Imported by survivor.py; Blender's own BVH importer reads the clips.
#
# Retargeting: each bone's turn away from its rest pose in the capture, in world space, is applied to
# the same bone of ours. The two rest poses differ (the capture's is a T, ours an A), so ours is first
# turned, bone by bone, until each points the way the capture's rest points; the capture's movement is
# then laid on top. The hips carry the capture's bob and sway, scaled to our height; their travel over
# the ground is taken out, so each clip walks on the spot and the game moves the body.
#
# Each gait clip is one cycle cut from where the capture is steady: the whole take is searched for the
# stretch whose pose repeats best one cycle on, whose speed holds over the next half cycle (not a
# runner still taking off), whose heading holds (not a turn), and which goes the way asked (forward,
# back, to a side). It's turned to face ours, its ends are blended so it loops, it starts as the left
# foot lands, and it's resampled to 30 frames a second.
import math

import bpy
from mathutils import Matrix, Quaternion, Vector

# capture joint -> our bone (where the names differ)
RENAME = {"LeftHandIndex": "LeftHandFinger1", "RightHandIndex": "RightHandFinger1"}
RIGID = {"LHipJoint", "RHipJoint"}


# Mixamo's skeleton (an FBX from mixamo.com) -> the CMU names our rig uses; the rest of its names are
# the CMU ones once the `mixamorig:` prefix is off
MIXAMO = {
    "Spine": "LowerBack",
    "Spine1": "Spine",
    "Spine2": "Spine1",
    "LeftHandThumb1": "LThumb",
    "RightHandThumb1": "RThumb",
    "LeftHandIndex1": "LeftHandFinger1",
    "RightHandIndex1": "RightHandFinger1",
}


def load(path):
    """The take at `path` (a CMU BVH, or a Mixamo FBX with its bones renamed to CMU's): the armature,
    its first and last frame, its frames a second, and whether it's one loop (Mixamo's are)."""
    before = set(bpy.data.objects)
    if path.lower().endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=path, use_anim=True)
        fps = bpy.context.scene.render.fps / bpy.context.scene.render.fps_base
        ob = next(o for o in bpy.data.objects if o not in before and o.type == "ARMATURE")
        for o in [o for o in bpy.data.objects if o not in before and o is not ob]:
            bpy.data.objects.remove(o)
        # (renamed through the data, which carries the action's curves along)
        for b in list(ob.data.bones):
            short = b.name.split(":")[-1]
            b.name = MIXAMO.get(short, short)
    else:
        bpy.ops.import_anim.bvh(
            filepath=path,
            axis_forward="-Z",
            axis_up="Y",
            rotate_mode="NATIVE",
            update_scene_fps=False,
            update_scene_duration=False,
            use_fps_scale=False,
        )
        fps = 120
        ob = next(o for o in bpy.data.objects if o not in before)
    act = ob.animation_data.action
    lo, hi = act.frame_range
    return ob, int(lo), int(hi), fps, path.lower().endswith(".fbx")


def rot3(m):
    return m.to_3x3().normalized()


class Retarget:
    def __init__(self, src, tgt):
        self.src, self.tgt = src, tgt
        sb, tb = src.data.bones, tgt.data.bones
        self.pairs = []
        for b in sb:
            name = RENAME.get(b.name, b.name)
            # (the pelvis's bones out to the hip joints stay ours: turned to the capture's they'd
            # pull our hip joints in toward the middle, and the feet would cross it as they walk)
            if name in tb and name not in RIGID:
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
        # the capture's hip joints sit wider apart than ours (markers on the skin against joints in
        # the pelvis): turned rotation for rotation, our feet would land that much nearer the middle
        # and cross it, a catwalk's step. Each foot is set back out by half the difference
        hw = lambda bones, m: ((m @ bones["LeftUpLeg"].head_local) - (m @ bones["RightUpLeg"].head_local)).length
        self.spread = max(0.0, (hw(sb, mw) * self.scale - hw(tb, Matrix.Identity(4))) / 2)

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


def fk(tgt, world, hips):
    """Where each bone's head is (armature space) for world rotations `world` and the hips' offset:
    a bone without a rotation of its own keeps its rest turn relative to its parent."""
    posed, heads = {}, {}
    for b in tgt.data.bones:
        if b.parent is None:
            posed[b.name] = world.get(b.name) or rot3(b.matrix_local)
            heads[b.name] = b.head_local + hips
            continue
        p = b.parent
        pr = rot3(p.matrix_local)
        posed[b.name] = world.get(b.name) or posed[p.name] @ (pr.inverted() @ rot3(b.matrix_local))
        heads[b.name] = heads[p.name] + posed[p.name] @ (pr.inverted() @ (b.head_local - p.head_local))
    return heads


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


def feature(world):
    """What a frame's pose is, for comparing frames: the legs' and arms' directions, in the hips' own
    frame (so the same step taken facing another way still matches)."""
    H = world["Hips"].inverted()
    v = []
    for n in ("LeftUpLeg", "LeftLeg", "RightUpLeg", "RightLeg", "LeftFoot", "RightFoot", "LeftArm", "RightArm", "Spine1"):
        if n in world:
            d = H @ (world[n] @ Vector((0, 1, 0)))
            v += [d.x, d.y, d.z]
    return v


def wrap(a):
    return math.atan2(math.sin(a), math.cos(a))


def find_cycle(feats, heading, hips, lo_p, hi_p, along, blend, fps):
    """The best cycle (start index, length in frames) in a take: its pose repeats one cycle on (checked
    at four points through it), its speed holds into the next half cycle, its heading holds, and it
    travels `along` (a direction in the body's own frame: (0, -1) forward, (0, 1) back, (1, 0) to
    his left, (-1, 0) to his right), at walking pace at least. `blend` of a cycle is kept clear before it (the loop's seam
    blends into it)."""
    n = len(feats)
    best, pick = 1e18, None
    step = max(1, round(fps / 60))
    for p in range(lo_p, hi_p + 1, step):
        q = p // 4
        first = int(p * blend) + 1
        for a in range(first, n - p - p * 3 // 4 - 1, step):
            e = 0.0
            for k in range(4):
                fa, fb = feats[a + k * q], feats[a + p + k * q]
                e += sum((x - y) ** 2 for x, y in zip(fa, fb))
            e /= 4
            turn_ = wrap(heading[a + p] - heading[a])
            T = hips[a + p] - hips[a]
            T.z = 0
            T2 = hips[a + p + p // 2] - hips[a + p // 2]
            T2.z = 0
            if T.length < 0.35 * p / fps:
                continue
            steady_ = (T2 - T).length / T.length
            # the travel in the body's own frame (it faces -y at heading 0)
            h = heading[a] + wrap(heading[a + p] - heading[a]) / 2
            c, s = math.cos(-h), math.sin(-h)
            rel = Vector((T.x * c - T.y * s, T.x * s + T.y * c, 0)).normalized()
            off = math.acos(max(-1.0, min(1.0, rel.x * along[0] + rel.y * along[1])))
            # (loose: a sidestep turns the pelvis well toward the step)
            if off > math.radians(70):
                continue
            score = e + 6 * turn_ * turn_ + 3 * steady_ * steady_ + 1.5 * off * off
            if score < best:
                best, pick = score, (a, p)
    if pick is None:
        raise RuntimeError("no steady cycle going that way in this take")
    return pick


LEGS = {"Left": ["LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase"], "Right": ["RightUpLeg", "RightLeg", "RightFoot", "RightToeBase"]}


def spread(tgt, world, out):
    """Each leg turned out at the hip so its foot lands `out` metres further from the middle, the foot
    kept flat."""
    bs = tgt.data.bones
    leg = (bs["LeftUpLeg"].head_local - bs["LeftFoot"].head_local).length
    deg = math.degrees(math.atan2(out, leg))
    # (the figure faces -y: turning about +y swings a hanging leg toward -x)
    turn(world, LEGS["Left"], "Y", -deg)
    turn(world, LEGS["Left"][2:], "Y", deg)
    turn(world, LEGS["Right"], "Y", deg)
    turn(world, LEGS["Right"][2:], "Y", -deg)


def ground_gap(tgt, world, hips):
    """How far the lowest of the feet (ankle or ball, each against its height at rest) is off the
    ground: negative when it's in it."""
    bs = tgt.data.bones
    h = fk(tgt, world, hips)
    gap = 9.0
    for n in ("LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"):
        gap = min(gap, h[n].z - bs[n].head_local.z)
    return gap


def rooted(tgt, worlds, loop):
    """A take that is one `loop` of the cycle (Mixamo's) looped four times over, so a cycle can be cut
    from it with room for its seam; walked on the spot ("in place": the hips never leave it), the hips
    carried forward by however far the planted foot slides back under them each frame. A take of
    its own (CMU's) is left as it is."""
    first, last = worlds[0][1], worlds[-1][1]
    if not loop:
        return worlds
    step = Vector((last.x - first.x, last.y - first.y, 0))
    if step.length > 0.25:
        one = worlds[:-1]
        return [(w, hp + step * k) for k in range(4) for w, hp in one]
    loop = worlds[:-1] * 4
    out = []
    carried = Vector()
    prev = None
    for w, hp in loop:
        h = fk(tgt, w, hp)
        feet = {s: h[f"{s}Foot"] for s in ("Left", "Right")}
        if prev is not None:
            # the foot lowest now and a moment ago is the one on the ground: it shouldn't move
            s = min(("Left", "Right"), key=lambda k: feet[k].z + prev[k].z)
            d = feet[s] - prev[s]
            carried -= Vector((d.x, d.y, 0))
        prev = feet
        out.append((w, hp + carried))
    return out


def bake_clip(tgt, path, name, *, cycle=(0.8, 1.4), start=0.25, edit=None, fps=30, seconds=None, still=False, wide=0.0, ground="plant", along=(0, -1), mode="cycle"):
    """Retargets the capture at `path` onto `tgt` as action `name`: the steadiest cycle of `cycle`
    (min, max) seconds going `along` (a direction in the body's frame, (0, -1) forward), or for a still
    clip `seconds` from `start` of the way in; looped, at `fps`. `edit(world, hips, phase)` may change
    each frame's pose. A gait's cycle starts as the left foot lands, so every gait's phase means the
    same step and they blend foot for foot. The feet are set `wide` metres further apart than the
    capture's (besides what our narrower hips need), and stood on the ground: `plant` keeps the lowest
    foot on it every frame (a walk, standing), `lowest` lifts the whole clip so its lowest moment
    touches it (a run, which leaves the ground). Returns (metres a second the capture went, metres a
    cycle) for the game to match the stride."""
    src, lo, hi, src_fps, loop = load(path)
    rt = Retarget(src, tgt)
    frames = list(range(lo, hi + 1))
    worlds = [rt.world(f) for f in frames]
    # `once`: a take played through once (a jump) or stepped through as he turns (a turn on the spot):
    # neither loops nor travels
    once = mode in ("once", "turn")
    blend = 0.0 if once else 0.18
    if not still and not once:
        worlds = rooted(tgt, worlds, loop)
    hr = tgt.data.bones["Hips"].matrix_local.to_3x3().normalized()

    def heading(w):
        f = w["Hips"] @ hr.inverted() @ Vector((0, -1, 0))
        return math.atan2(f.x, -f.y)

    heads = [heading(w) for w, _ in worlds]
    if mode == "turn":
        # the turn taken out of the hips, frame by frame: what's left is the feet stepping round under
        # a body that faces ahead (the game turns the body)
        worlds = [
            ({k: Matrix.Rotation(-wrap(h - heads[0]), 3, "Z") @ m for k, m in w.items()}, worlds[0][1].copy())
            for (w, _), h in zip(worlds, heads)
        ]
    if once:
        a, p = 0, len(worlds) - 1
    elif still and loop:
        # a loop of its own, whole, with copies before and after it for its seam
        one = worlds[:-1]
        worlds = one * 3
        heads = heads[:-1] * 3
        a, p = len(one), len(one)
    elif still:
        a = int((hi - lo) * start)
        p = int((seconds or 6) * src_fps)
        p = min(p, len(worlds) - 1 - a)
    else:
        feats = [feature(w) for w, _ in worlds]
        a, p = find_cycle(feats, heads, [hp for _, hp in worlds], int(cycle[0] * src_fps), int(cycle[1] * src_fps), along, blend, src_fps)
    # turned to face ours: by the hips' mean heading over the cycle (their sway kept); a turn by where
    # it starts
    s_, c_ = 0.0, 0.0
    for h in heads[a : a + p] if mode != "turn" else heads[:1]:
        s_ += math.sin(h)
        c_ += math.cos(h)
    R = Matrix.Rotation(-math.atan2(s_, c_), 3, "Z")
    if not still and not once:
        # a gait is turned so it goes exactly the way asked (a sidestep's pelvis is turned toward the
        # step: by the hips, it would go off at a slant)
        T = worlds[a + p][1] - worlds[a][1]
        R = Vector((T.x, T.y, 0)).normalized().rotation_difference(Vector((along[0], along[1], 0))).to_matrix()
    worlds = [({k: R @ m for k, m in w.items()}, R @ hp) for w, hp in worlds]
    out = rt.spread + wide
    for w, _ in worlds:
        spread(tgt, w, out)
    # the ground covered over the cycle: taken out, kept as the clip's speed
    h0, h1 = worlds[a][1], worlds[a + p][1]
    travel = Vector((h1.x - h0.x, h1.y - h0.y, 0)) if not once else Vector()
    speed = travel.length / (p / src_fps)
    # start as the left foot lands: where it reaches furthest the way he's going (for a still clip,
    # where the take was asked to start)
    shift = 0
    if not still and not once:
        d = travel.normalized()
        reach = [(fk(tgt, w, hp)["LeftFoot"] - fk(tgt, w, hp)["Hips"]).dot(d) for w, hp in worlds[a : a + p]]
        shift = max(range(len(reach)), key=reach.__getitem__)

    def sample(s):
        """The pose `s` frames into the cycle (0 <= s < p), its last part blended into the frames
        before the cycle so it loops; the hips relative to where the cycle starts, on the spot."""
        f = a + s
        i0 = int(f)
        frac = f - i0
        w0, hp0 = worlds[i0]
        w1, hp1 = worlds[min(i0 + 1, len(worlds) - 1)]
        world = {key: w0[key].to_quaternion().slerp(w1[key].to_quaternion(), frac).to_matrix() for key in w0}
        hips = hp0.lerp(hp1, frac)
        u = s / p
        if u > 1 - blend:
            k = (u - (1 - blend)) / blend
            k = k * k * (3 - 2 * k)
            g = f - p
            j = int(g)
            gf = g - j
            wa, ha = worlds[j]
            wb, hb = worlds[min(j + 1, len(worlds) - 1)]
            wj = {key: wa[key].to_quaternion().slerp(wb[key].to_quaternion(), gf) for key in wa}
            world = {key: world[key].to_quaternion().slerp(wj[key], k).to_matrix() for key in world}
            hips = hips.lerp(ha.lerp(hb, gf) + travel, k)
        return world, hips - h0 - travel * u

    n = max(2, round(p / src_fps * fps))
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    tgt.animation_data_create()
    tgt.animation_data.action = act
    poses = []
    for k in range(n + 1):
        t = k / n
        world, hips = sample(min(t * p, p - 1e-4) if once else (shift + t * p) % p)
        if not once:
            hips.x *= 0.6 if abs(travel.normalized().x) < 0.5 else 1.0
        if edit:
            edit(world, hips, t)
        poses.append((world, hips))
    # stood on the ground (the clip's last frame is its first again: it takes the first's gap); a jump
    # keeps its own heights (`none`)
    gaps = [ground_gap(tgt, w, hp) for w, hp in poses[:-1]]
    if ground == "plant":
        m = len(gaps)
        # (eased over a few frames: the lowest foot changing over mustn't jolt)
        gaps = [sum(gaps[(i + j) % m] * c for j, c in ((-2, 1), (-1, 2), (0, 3), (1, 2), (2, 1))) / 9 for i in range(m)]
    elif ground == "lowest":
        gaps = [min(gaps)] * len(gaps)
    else:
        gaps = [gaps[0]] * len(gaps)
    gaps.append(gaps[-1] if once else gaps[0])
    for k, ((world, hips), g) in enumerate(zip(poses, gaps)):
        hips = hips - Vector((0, 0, g))
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
    print(
        "clip", name, "from", a, "frames", n, "speed", round(speed, 2), "m/s", "cycle", round(p / src_fps, 2), "s",
        round(travel.length, 2), "m", "dir", tuple(round(c, 2) for c in travel.normalized()[:2]) if travel.length > 0.05 else "-",
    )
    return speed, travel.length


def aim(tgt, world, bone, direction, amount=1.0):
    """Turns `bone` (world rotation in `world`) so it points along `direction`, by `amount`."""
    W = world.get(bone)
    if W is None:
        return
    cur = W @ Vector((0, 1, 0))
    q = cur.rotation_difference(Vector(direction).normalized())
    q = Quaternion().slerp(q, amount)
    world[bone] = q.to_matrix() @ W


def steady(tgt, world, bones, anchor, keep):
    """Holds `bones` (a chain above `anchor`) in their rest pose relative to the anchor, letting `keep`
    of the capture's own movement through: a head that looks where the body faces."""
    bs = tgt.data.bones
    A = world.get(anchor)
    if A is None:
        return
    ra = bs[anchor].matrix_local.to_3x3().normalized()
    for b in bones:
        if b not in world:
            continue
        rb = bs[b].matrix_local.to_3x3().normalized()
        follow = (A @ ra.inverted() @ rb).to_quaternion()
        world[b] = follow.slerp(world[b].to_quaternion(), keep).to_matrix()


def turn(world, bones, axis, deg):
    """Turns `bones` about a world axis (each keeps its own place in the chain)."""
    R = Matrix.Rotation(math.radians(deg), 3, axis)
    for b in bones:
        if b in world:
            world[b] = R @ world[b]
