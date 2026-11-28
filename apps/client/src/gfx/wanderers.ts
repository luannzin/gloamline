// The survivors (tools/blender/survivor.py, docs/CHARACTERS.md): you over your shoulder, and everyone
// in the lobby with their name over them. Each is a copy of one skinned figure, in the gear and the
// colours their seed gives them, moved by motion capture: idle, walk, run, a trudge through deep snow,
// and cold (hunched, blowing into the hands). The clips' phase is the ground covered, so the feet keep
// pace with the body; their weights follow the speed, the snow and the cold. On top of the clips: the
// lantern hangs from the hand on its own swinging bone, the head follows where you look, the body
// shivers when it's freezing. The weather stays on them: snow builds on everything that faces up,
// cakes the legs after deep snow, frost greys the fur; the wind stirs whatever is loose.

import { clone as cloneRig } from "three/addons/utils/SkeletonUtils.js";
import {
  attribute,
  color,
  Fn,
  float,
  mix,
  normalViewGeometry,
  normalWorldGeometry,
  positionGeometry,
  positionLocal,
  sin,
  smoothstep,
  texture,
  time,
  uniform,
  vec3,
} from "three/tsl";
import * as THREE from "three/webgpu";
import { partyColor } from "@/lib/party";
import { settle } from "../body";
import { poseAt, type Remote } from "../net";
import { bump } from "./bump";
import type { Rig } from "./models";
import type { MoodState } from "./mood";
import type { Puffs } from "./puffs";
import type { Wind } from "./wind";

type Node1 = THREE.Node<"float">;
type Node3 = THREE.Node<"vec3">;

/** What a figure is doing this frame (feet at x, y, z). */
export type Doing = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** speed over the ground, m/s (remote: measured from the poses) */
  speed?: number;
  /** which way he's going in his own frame, m/s (x right, ahead): worked out from the poses if unset */
  side?: number;
  ahead?: number;
  /** off the ground (a jump) */
  air?: boolean;
  /** fresh snow the legs push through, 0..1 */
  deep: number;
  lit: boolean;
  /** how cold, 0..1 (yours; others' is guessed from the weather) */
  cold: number;
  /** where the eyes look, radians up */
  pitch: number;
  /** 0 rested .. 1 out of breath */
  spent: number;
  /** how much is overhead against the falling snow, and how far out of the wind, 0..1 (world: wind.ts) */
  cover: number;
  lee: number;
  /** snow settled on the body, 0..1 (yours, from body.ts; others' builds up here from `cover`) */
  snow?: number;
};

/** Metres covered in one cycle (two steps) of each gait clip, as the capture walked them (survivor.py). */
const CYCLE = {
  walk: 1.66,
  run: 3.12,
  trudge: 1.5,
  back: 1.27,
  left: 1.72,
  right: 1.72,
  run_left: 2.9,
  run_right: 2.9,
};
const GAITS = ["walk", "run", "trudge", "back", "left", "right", "run_left", "run_right"] as const;
/** how far into the jump clip he leaves the ground */
const TAKEOFF = 0.34;

// the gear in each slot, and the tones a seed picks from (docs/CHARACTERS.md)
const SLOTS: [string, string[], number[]][] = [
  ["hat", ["hat_ushanka", "hat_hood", "hat_tankist"], [0.5, 0.25, 0.25]],
  ["face", ["face_scarf", "face_mask", ""], [0.45, 0.3, 0.25]],
  ["back", ["back_pack", "back_sack"], [0.65, 0.35]],
  ["slung", ["slung_rifle", "slung_axe", ""], [0.55, 0.3, 0.15]],
];
const TONES = {
  // (linear albedo stays real: dyed cotton 0.05 to 0.12, never black)
  jacket: [0x46503a, 0x4a4c49, 0x323c52, 0x4f3e2a, 0x2a2a2a],
  trousers: [0x222222, 0x34372f, 0x262c3a],
  fur: [0x2a2420, 0x4a3524, 0x5a554e, 0x6e5e48],
  canvas: [0x2c2c18, 0x4a3a24, 0x0c0c0c],
  scarf: [0x3e0a0a, 0x7a5410, 0x333333, 0x1a2612],
};

function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, items: T[], weights?: number[]) {
  let x = r() * (weights ? weights.reduce((s, w) => s + w, 0) : items.length);
  for (let i = 0; i < items.length; i++) {
    x -= weights ? weights[i] : 1;
    if (x < 0) return items[i];
  }
  return items[items.length - 1];
}

/** The gear and tones of the survivor with this seed. */
function lookOf(seed: number) {
  const r = random(seed * 2654435761);
  const gear = new Set(["body", "hand_lantern"]);
  for (const [, items, w] of SLOTS) {
    const g = pick(r, items, w);
    if (g) gear.add(g);
  }
  // goggles only sit on a hat with a brim
  if (!gear.has("hat_hood") && r() < 0.45) gear.add("eyes_goggles");
  const lin = (hex: number) => new THREE.Color(hex);
  // the coat: a workwear dye (olive, field grey, faded navy, brown, black), leaning a quarter of the
  // way toward their party colour so a friend reads at a distance
  const party = new THREE.Color(partyColor(seed)).multiplyScalar(0.12);
  const jacket = lin(pick(r, TONES.jacket)).lerp(party, 0.25);
  return {
    gear,
    jacket,
    trousers: lin(pick(r, TONES.trousers)),
    fur: lin(pick(r, TONES.fur)),
    canvas: lin(pick(r, TONES.canvas)),
    scarf: lin(pick(r, TONES.scarf)),
  };
}

type Look = ReturnType<typeof lookOf>;

type Figure = {
  root: THREE.Group;
  inner: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  acts: Record<string, THREE.AnimationAction>;
  bones: Record<string, THREE.Bone>;
  /** the lantern's rest orientation relative to the figure */
  lanternRest: THREE.Quaternion;
  light: THREE.PointLight;
  u: ReturnType<typeof uniforms>;
  tag: HTMLElement;
  last: THREE.Vector3;
  speed: number;
  deep: number;
  phase: number;
  idleT: number;
  /** the lantern's swing (radians about the figure's x and z) and how fast */
  swing: THREE.Vector4;
  grip: THREE.Vector3;
  gripVel: THREE.Vector3;
  breathT: number;
  /** where it was last frame, its heading, which way it's going (eased), its lean into turns */
  prevX: number;
  prevZ: number;
  prevYaw: number;
  dirX: number;
  dirY: number;
  lean: number;
  /** each clip's weight, eased (crossfades) */
  w: Record<string, number>;
  /** the turn clip's place, the turn's rate (eased), the jump clip's place (-1 not jumping) */
  turnT: number;
  turnRate: number;
  jumpT: number;
  wasAir: boolean;
};

function uniforms() {
  return {
    lit: uniform(0),
    /** snow built up on what faces the sky, 0..1 */
    snow: uniform(0.3),
    /** snow caked on the legs, 0..1 */
    caked: uniform(0),
    frost: uniform(0),
    /** the air on the figure, in its own space, m/s */
    air: uniform(new THREE.Vector3()),
  };
}

const MAT = (name: string) =>
  [
    "jacket",
    "trousers",
    "fur",
    "canvas",
    "leather",
    "wool",
    "iron",
    "wood",
    "glass",
    "rubber",
    "brass",
    "lens",
    "stripe",
    "rope",
    "scarf",
    "skin",
    "eye",
  ].indexOf(name);

function material(look: Look, u: ReturnType<typeof uniforms>, detail: THREE.Texture, mood: MoodState) {
  // physical, for cloth's sheen: the soft bright rim fibres give a coat at a grazing angle
  const m = new THREE.MeshPhysicalNodeMaterial();
  const sway = attribute("sway", "float"),
    kind = attribute("mat", "float"),
    ao = attribute("ao", "float");
  const id = kind.mul(31).round();
  const is = (name: string) => float(1).sub(id.sub(MAT(name)).abs().min(1));
  // the wind and the walk stir what's loose (after skinning, in the figure's own space)
  m.positionNode = Fn(() => {
    const p = positionLocal.toVar();
    const flutter = sin(time.mul(7.3).add(p.y.mul(9)).add(p.x.mul(5)))
      .mul(0.25)
      .add(1);
    p.addAssign(u.air.mul(sway.mul(sway).mul(0.012)).mul(flutter));
    return p;
  })();

  // fabric and wear, laid on the bind pose (so they stay on the cloth as it moves): three projections
  // of the shared noise, blended by the normal
  const P = positionGeometry,
    N = normalViewGeometry;
  const tri = (s: number, c: "x" | "y" | "z" | "w") => {
    const w = vec3(attribute("normal", "vec3").abs().pow(vec3(4)));
    const ws = w.x.add(w.y).add(w.z);
    return texture(detail, P.yz.mul(s))
      [c].mul(w.x)
      .add(texture(detail, P.xz.mul(s).add(0.3))[c].mul(w.y))
      .add(texture(detail, P.xy.mul(s).add(0.6))[c].mul(w.z))
      .div(ws);
  };
  const weave = tri(38, "y"),
    grain = tri(9, "x"),
    blotch = tri(2.2, "x");
  const cloth = is("jacket").add(is("trousers")).add(is("canvas")).add(is("wool")).add(is("scarf"));
  const base = color(look.jacket)
    .mul(is("jacket"))
    .add(color(look.trousers).mul(is("trousers")))
    .add(color(look.fur).mul(is("fur")))
    .add(color(look.canvas).mul(is("canvas")))
    .add(vec3(0.045, 0.028, 0.018).mul(is("leather")))
    .add(vec3(0.06, 0.058, 0.055).mul(is("wool")))
    .add(vec3(0.07, 0.07, 0.072).mul(is("iron")))
    .add(vec3(0.14, 0.065, 0.028).mul(is("wood")))
    .add(vec3(0.4, 0.3, 0.2).mul(is("glass")))
    .add(vec3(0.03, 0.035, 0.03).mul(is("rubber")))
    .add(vec3(0.4, 0.28, 0.08).mul(is("brass")))
    .add(vec3(0.02, 0.025, 0.03).mul(is("lens")))
    .add(
      mix(vec3(0.6, 0.6, 0.62), vec3(0.02, 0.03, 0.09), smoothstep(0.45, 0.55, P.y.mul(55).fract())).mul(
        is("stripe"),
      ),
    )
    .add(vec3(0.16, 0.13, 0.08).mul(is("rope")))
    .add(color(look.scarf).mul(is("scarf")))
    .add(vec3(0.32, 0.2, 0.15).mul(is("skin")))
    .add(vec3(0.015, 0.012, 0.01).mul(is("eye")))
    .toVar();
  // cloth: the weave, worn paler in patches, dirtier low down where it's been through the snow and
  // the mud; leather: scuffed paler on its edges (where the grain is high)
  base.mulAssign(mix(float(1), weave.mul(0.35).add(0.82).mul(blotch.mul(0.3).add(0.85)), cloth));
  const low = smoothstep(0.75, 0.15, P.y).mul(blotch.add(0.4).min(1));
  base.assign(mix(base, base.mul(vec3(0.62, 0.56, 0.5)), low.mul(cloth.add(is("leather"))).mul(0.6)));
  base.assign(mix(base, base.mul(1.6), smoothstep(0.62, 0.8, grain).mul(is("leather")).mul(0.5)));

  // the weather: snow on what faces up, in drifting patches that grow as it builds; caked on the
  // legs after deep snow; frost greying the fur and the wool
  const up = normalWorldGeometry.y;
  const patch = tri(4.5, "x").add(weave.mul(0.15));
  // (on top above the knees: the feet kick it off, and a white toe reads as a bare foot)
  const onTop = smoothstep(0.15, 0.7, up.add(patch.sub(0.5).mul(0.7)))
    .mul(smoothstep(float(1).sub(u.snow), float(1.25).sub(u.snow), patch.add(up.mul(0.3))))
    .mul(smoothstep(0.45, 0.65, P.y))
    .toVar();
  // caked on the legs to the depth they went in: an even crust with a ragged top edge, thinner
  // on the leather that sheds it
  const crust = u.caked.mul(0.45).add(0.08).add(patch.sub(0.5).mul(0.12));
  const legs = smoothstep(crust, crust.sub(0.06), P.y)
    .mul(smoothstep(0.2, 0.5, patch.add(grain.mul(0.2)).add(0.15)))
    .mul(u.caked.min(1).mul(float(1).sub(is("leather").mul(0.5))));
  const exposed = float(1).sub(is("glass")).sub(is("lens")).sub(is("eye")).sub(is("skin"));
  const snowK = onTop.max(legs).mul(exposed).mul(mood.u.open.mul(0.7).add(0.3)).toVar();
  const fuzzy = is("fur").add(is("wool")).add(is("scarf"));
  base.assign(mix(base, vec3(0.5, 0.53, 0.58), u.frost.mul(0.35).mul(fuzzy).mul(patch)));
  m.colorNode = mix(base, mood.SNOW.mul(grain.mul(0.12).add(0.92)), snowK);

  const rough = float(0.92)
    .sub(is("leather").mul(0.3))
    .sub(is("iron").mul(0.5))
    .sub(is("brass").mul(0.55))
    .sub(is("rubber").mul(0.35))
    .sub(is("glass").mul(0.8))
    .sub(is("lens").mul(0.84))
    .sub(is("eye").mul(0.75))
    .sub(is("wood").mul(0.3));
  m.roughnessNode = mix(rough, float(0.65), snowK);
  m.metalnessNode = is("iron").mul(0.55).add(is("brass").mul(0.8)).mul(float(1).sub(snowK));
  // fibre: cloth, fur and wool catch a soft rim of light; snow on them a brighter one
  const fibre = cloth.add(is("fur")).min(1);
  m.sheenNode = mix(base.mul(1.6).add(0.06), vec3(0.4, 0.42, 0.45), snowK).mul(fibre.max(snowK));
  m.sheenRoughnessNode = mix(float(0.55), float(0.35), is("fur"));
  // relief: the weave on cloth, the grain on leather, clumps in the snow
  const h = weave
    .mul(0.0012)
    .mul(cloth)
    .add(grain.mul(0.0015).mul(is("leather")))
    .add(patch.mul(0.004).mul(snowK))
    .add(tri(16, "z").mul(0.0025).mul(is("fur")));
  m.normalNode = bump(N as Node3, h as Node1);
  m.aoNode = ao.mul(0.85).add(0.15);
  // the lantern's globe glows when it's lit
  m.emissiveNode = vec3(1.0, 0.6, 0.28).mul(is("glass")).mul(u.lit.mul(7));
  return m;
}

export function makeWanderers(
  camera: THREE.Camera,
  tags: HTMLElement,
  rig: Rig,
  detail: THREE.Texture,
  mood: MoodState,
  wind: Wind,
  puffs: Puffs,
) {
  const group = new THREE.Group();
  const figures = new Map<string, Figure>();
  const o = new Float32Array(5),
    v = new THREE.Vector3(),
    q = new THREE.Quaternion(),
    q2 = new THREE.Quaternion(),
    qRoot = new THREE.Quaternion(),
    e = new THREE.Euler(),
    axis = new THREE.Vector3(),
    fwd = new THREE.Vector3(),
    head = new THREE.Vector3(),
    s = {
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      speed: 0,
      deep: 0,
      lit: false,
      cold: 0,
      pitch: 0,
      spent: 0,
      cover: 0,
      lee: 0,
    } as Doing,
    sheltered = new Float32Array(2);
  const clipNames = [
    "idle",
    "cold",
    "walk",
    "run",
    "trudge",
    "back",
    "left",
    "right",
    "run_left",
    "run_right",
    "turn_left",
    "turn_right",
    "jump",
  ] as const;

  function figure(id: string, seed: number): Figure {
    const look = lookOf(seed);
    const u = uniforms();
    const mat = material(look, u, detail, mood);
    const inner = cloneRig(rig.scene);
    // the file faces +z; the game's figures face -z at no yaw
    inner.rotation.y = Math.PI;
    const bones: Record<string, THREE.Bone> = {};
    inner.traverse((n) => {
      const sk = n as THREE.SkinnedMesh;
      if ((n as THREE.Bone).isBone) bones[n.name] = n as THREE.Bone;
      if (!sk.isMesh) return;
      sk.material = mat;
      sk.castShadow = sk.receiveShadow = true;
      sk.frustumCulled = false;
      sk.visible = look.gear.has(sk.name);
    });
    const root = new THREE.Group();
    root.add(inner);
    const light = new THREE.PointLight(0xffb066, 0, 14, 1.6);
    root.add(light);
    group.add(root);
    const mixer = new THREE.AnimationMixer(inner);
    const acts: Record<string, THREE.AnimationAction> = {};
    for (const name of clipNames) {
      const clip = rig.clips.find((c) => c.name === name);
      if (!clip) continue;
      const a = mixer.clipAction(clip);
      a.setEffectiveWeight(0);
      a.play();
      acts[name] = a;
    }
    // the lantern's rest, relative to the figure (before any clip moves the hand)
    root.updateMatrixWorld(true);
    const lanternRest = new THREE.Quaternion();
    if (bones.lantern) {
      bones.lantern.getWorldQuaternion(lanternRest);
      root.getWorldQuaternion(q);
      lanternRest.premultiply(q.invert());
    }
    const tag = document.createElement("span");
    tag.className =
      "pointer-events-none fixed top-0 left-0 whitespace-nowrap font-display text-frost text-sm tracking-wide [text-shadow:0_1px_6px_#000]";
    tags.append(tag);
    const f: Figure = {
      root,
      inner,
      mixer,
      acts,
      bones,
      lanternRest,
      light,
      u,
      tag,
      last: new THREE.Vector3(Number.NaN, 0, 0),
      speed: 0,
      deep: 0,
      phase: 0,
      idleT: Math.random() * 6,
      swing: new THREE.Vector4(),
      grip: new THREE.Vector3(Number.NaN, 0, 0),
      gripVel: new THREE.Vector3(),
      breathT: Math.random() * 2,
      prevX: 0,
      prevZ: 0,
      prevYaw: 0,
      dirX: 0,
      dirY: 1,
      lean: 0,
      w: { idle: 1 },
      turnT: 0,
      turnRate: 0,
      jumpT: -1,
      wasAir: false,
    };
    figures.set(id, f);
    return f;
  }

  /** Turns `bone` by `turn` (a world-space rotation) about its own place. */
  function turnWorld(bone: THREE.Bone, turn: THREE.Quaternion) {
    bone.getWorldQuaternion(q2);
    q2.premultiply(turn);
    (bone.parent as THREE.Object3D).getWorldQuaternion(q);
    bone.quaternion.copy(q.invert().multiply(q2));
    bone.updateMatrixWorld(true);
  }

  function drive(f: Figure, d: Doing, dt: number, self: boolean) {
    // speed along the ground, measured, eased
    let sp = d.speed ?? 0;
    if (d.speed === undefined)
      sp = Number.isNaN(f.last.x) ? 0 : Math.hypot(d.x - f.last.x, d.z - f.last.z) / Math.max(dt, 1e-3);
    f.last.set(d.x, d.y, d.z);
    f.speed += (Math.min(sp, 8) - f.speed) * Math.min(1, dt * 8);
    f.deep += (d.deep - f.deep) * Math.min(1, dt * 3);
    const speed = f.speed;
    f.root.position.set(d.x, d.y, d.z);
    f.root.rotation.y = d.yaw;

    // which way he's going in his own frame (x right, y ahead), eased: told for you, worked out from
    // the poses for the others
    let side = d.side,
      ahead = d.ahead;
    if (side === undefined || ahead === undefined) {
      const vx = d.x - f.prevX,
        vz = d.z - f.prevZ;
      side = vx * Math.cos(d.yaw) - vz * Math.sin(d.yaw);
      ahead = -vx * Math.sin(d.yaw) - vz * Math.cos(d.yaw);
    }
    f.prevX = d.x;
    f.prevZ = d.z;
    const len = Math.hypot(side, ahead);
    if (len > 1e-4) {
      const k = Math.min(1, dt * 10);
      f.dirX += (side / len - f.dirX) * k;
      f.dirY += (ahead / len - f.dirY) * k;
    }
    const fw = Math.max(0, f.dirY),
      bk = Math.max(0, -f.dirY),
      rt = Math.max(0, f.dirX),
      lt = Math.max(0, -f.dirX),
      sum = Math.max(1e-3, fw + bk + rt + lt);
    // --- the clips' weights: idle or cold standing; moving, a blend of the ways he goes (ahead: walk,
    // trudge or run)
    const move = THREE.MathUtils.smoothstep(speed, 0.15, 0.5);
    const run = THREE.MathUtils.smoothstep(speed, 2.4, 3.8);
    const trudge = THREE.MathUtils.smoothstep(f.deep, 0.15, 0.45) * (1 - run);
    const cold = THREE.MathUtils.smoothstep(d.cold, 0.55, 0.9);
    // turning: how fast, and stepping round on the spot when standing (the feet step through the turn
    // clip a quarter turn a loop)
    const dYaw = Math.atan2(Math.sin(d.yaw - f.prevYaw), Math.cos(d.yaw - f.prevYaw));
    const turnRate = dYaw / Math.max(dt, 1e-3);
    f.prevYaw = d.yaw;
    f.turnT = (f.turnT + Math.abs(dYaw) / (Math.PI / 2)) % 1;
    f.turnRate += (turnRate - f.turnRate) * Math.min(1, dt * 8);
    const turning = (1 - move) * THREE.MathUtils.smoothstep(Math.abs(f.turnRate), 0.6, 1.6);
    // in the air: the jump, from where he leaves the ground, played on through the landing
    if (d.air && !f.wasAir) f.jumpT = TAKEOFF;
    f.wasAir = !!d.air;
    if (f.jumpT >= 0) f.jumpT += dt / (f.acts.jump?.getClip().duration ?? 2);
    if (f.jumpT >= 1 || (!d.air && f.jumpT > 0.85)) f.jumpT = -1;
    const air = f.jumpT >= 0 ? 1 : 0;
    const m = (move / sum) * (1 - air);
    const still = (1 - move) * (1 - turning) * (1 - air);
    const want: Record<(typeof clipNames)[number], number> = {
      idle: still * (1 - cold),
      cold: still * cold,
      walk: m * fw * (1 - run) * (1 - trudge),
      trudge: m * fw * trudge,
      run: m * fw * run,
      back: m * bk,
      left: m * lt * (1 - run),
      right: m * rt * (1 - run),
      run_left: m * lt * run,
      run_right: m * rt * run,
      turn_left: (1 - air) * turning * (f.turnRate > 0 ? 1 : 0),
      turn_right: (1 - air) * turning * (f.turnRate > 0 ? 0 : 1),
      jump: air,
    };
    // crossfaded: each weight eases toward what it should be (a fifth of a second), and they're kept
    // summing to one so the bind pose never shows through a change of gait
    let total = 0;
    for (const name of clipNames) {
      const cur = f.w[name] ?? 0;
      f.w[name] = cur + (want[name] - cur) * Math.min(1, dt * (name === "jump" ? 18 : 10));
      total += f.w[name];
    }
    // the gait's phase is the ground covered over the blended cycle's length (every gait starts as
    // the left foot lands, so they blend foot for foot; standing still, the phase waits)
    if (move > 1e-3) {
      let cycle = 0,
        gw = 0;
      for (const k of GAITS) {
        cycle += CYCLE[k] * f.w[k];
        gw += f.w[k];
      }
      if (gw > 1e-3) f.phase = (f.phase + (speed * dt) / Math.max(0.4, cycle / gw)) % 1;
    }
    // leaning into a turn, the more the faster he goes
    f.lean += (THREE.MathUtils.clamp(f.turnRate * speed * 0.035, -0.14, 0.14) - f.lean) * Math.min(1, dt * 6);
    f.inner.rotation.z = f.lean;
    f.idleT += dt;
    for (const name of clipNames) {
      const a = f.acts[name];
      if (!a) continue;
      a.setEffectiveWeight(f.w[name] / Math.max(total, 1e-3));
      const len = a.getClip().duration;
      a.time =
        name === "idle" || name === "cold"
          ? f.idleT % len
          : name === "turn_left" || name === "turn_right"
            ? f.turnT * len
            : name === "jump"
              ? Math.max(0, f.jumpT) * len
              : f.phase * len;
    }
    f.mixer.update(0);
    f.root.updateMatrixWorld(true);

    // --- on top of the clips
    const b = f.bones;
    f.root.getWorldQuaternion(qRoot);
    // the head follows where the eyes look (half of it; the neck does the rest)
    if (b.Head && self) {
      axis.set(1, 0, 0).applyQuaternion(qRoot);
      q.setFromAxisAngle(axis, d.pitch * 0.45);
      turnWorld(b.Head, q);
    }
    // freezing: a fine shiver through the chest, the shoulders and the head
    if (d.cold > 0.4 && b.Spine1) {
      const k = (d.cold - 0.4) * 0.06;
      const t = f.idleT * 31;
      e.set(Math.sin(t) * k, Math.sin(t * 1.3 + 1) * k * 0.6, Math.sin(t * 0.7 + 2) * k);
      q.setFromEuler(e);
      turnWorld(b.Spine1, q);
    }
    // the lantern: hangs straight from the grip whatever the hand does, swinging as the hand moves
    // and as the wind pushes it (a damped pendulum about the figure's x and z)
    if (b.lantern) {
      b.lantern.getWorldPosition(v);
      if (!Number.isNaN(f.grip.x) && dt > 0) {
        fwd.copy(v).sub(f.grip).divideScalar(dt);
        const ax = (fwd.x - f.gripVel.x) / dt,
          az = (fwd.z - f.gripVel.z) / dt;
        f.gripVel.copy(fwd);
        // the hand's acceleration and the wind, in the figure's frame
        const c = Math.cos(d.yaw),
          sn = Math.sin(d.yaw);
        const lx = ax * c - az * sn,
          lz = ax * sn + az * c;
        const wx = wind.u.dir.value.x * wind.u.speed.value * wind.at(d.x, d.z),
          wz = wind.u.dir.value.y * wind.u.speed.value * wind.at(d.x, d.z);
        const fx = wx * c - wz * sn,
          fz = wx * sn + wz * c;
        const sw = f.swing;
        // (x: swinging forward and back, z: side to side)
        sw.z += (-sw.x * 26 - sw.z * 3.2 + lz * 0.9 - fz * 0.05) * dt;
        sw.w += (-sw.y * 26 - sw.w * 3.2 - lx * 0.9 + fx * 0.05) * dt;
        sw.x = THREE.MathUtils.clamp(sw.x + sw.z * dt, -0.7, 0.7);
        sw.y = THREE.MathUtils.clamp(sw.y + sw.w * dt, -0.7, 0.7);
      }
      f.grip.copy(v);
      e.set(f.swing.x, 0, f.swing.y);
      q.setFromEuler(e);
      q2.copy(qRoot).multiply(q).multiply(f.lanternRest);
      (b.lantern.parent as THREE.Object3D).getWorldQuaternion(q);
      b.lantern.quaternion.copy(q.invert().multiply(q2));
      b.lantern.updateMatrixWorld(true);
      // its light, in the globe
      head.set(0, -0.16, 0);
      b.lantern.localToWorld(head);
      f.root.worldToLocal(head);
      f.light.position.copy(head);
    }
    const lit = d.lit;
    f.light.intensity += ((lit ? 9 : 0) - f.light.intensity) * 0.15;
    f.u.lit.value += ((lit ? 1 : 0) - f.u.lit.value) * 0.15;

    // --- the weather on them
    const open = mood.u.open.value,
      fall = mood.u.snowfall.value;
    const u = f.u;
    u.snow.value = d.snow === undefined ? settle(u.snow.value, dt, fall, open, d.cover, d.lit) : d.snow;
    u.caked.value = THREE.MathUtils.clamp(u.caked.value + dt * (f.deep * speed * 0.05 - 0.004), 0, 1);
    u.frost.value += ((self ? d.cold : fall * 0.4) - u.frost.value) * Math.min(1, dt * 0.2);
    // the air on them: the wind (less in a wall's lee), and the walk's own draught, turned into the
    // figure's space (the file's +z is the figure's front: turned by yaw and the half turn)
    const ws = wind.u.speed.value * wind.at(d.x, d.z) * open * (1 - 0.7 * d.lee);
    const wx = wind.u.dir.value.x * ws + Math.sin(d.yaw) * speed,
      wz = wind.u.dir.value.y * ws + Math.cos(d.yaw) * speed;
    const ang = -(d.yaw + Math.PI);
    u.air.value.set(wx * Math.cos(ang) - wz * Math.sin(ang), 0, wx * Math.sin(ang) + wz * Math.cos(ang));

    // --- breath, steaming from under the hat: quicker and harder out of breath
    f.breathT -= dt;
    if (f.breathT <= 0 && b.Head) {
      f.breathT = 2.9 - 1.6 * Math.max(d.spent, run * 0.6) + Math.random() * 0.6;
      head.set(0, 0.07, 0.11);
      b.Head.localToWorld(head);
      const fx = -Math.sin(d.yaw),
        fz = -Math.cos(d.yaw);
      puffs.breathe(head.x + fx * 0.08, head.y, head.z + fz * 0.08, fx, fz, d.spent);
    }
  }

  let selfT = performance.now();
  /** Your own body, drawn only when the camera is behind it (third person); no name over it. */
  function self(seed: number, d: Doing, show: boolean) {
    let f = figures.get("me");
    if (!f) {
      f = figure("me", seed);
      f.tag.remove();
    }
    f.root.visible = show;
    const t = performance.now(),
      dt = Math.min(0.1, Math.max(0.001, (t - selfT) / 1000));
    selfT = t;
    drive(f, d, dt, true);
  }

  let lastT = performance.now();
  /**
   * `sunk`: how far the feet sink into the snow at (x, z), metres; `deep`: fresh snow there, 0..1;
   * `shelter`: what's overhead and upwind of a body at (x, y, z) (cover, lee into `out`).
   */
  function update(
    people: Map<string, Remote>,
    sunk: (x: number, z: number) => number,
    deep: (x: number, z: number) => number,
    shelter: (x: number, y: number, z: number, out: Float32Array) => void,
  ) {
    const t = performance.now(),
      dt = Math.min(0.1, Math.max(0.001, (t - lastT) / 1000));
    lastT = t;
    const now = t - 100;
    for (const [id, f] of figures)
      if (id !== "me" && !people.has(id)) {
        group.remove(f.root);
        f.tag.remove();
        f.mixer.stopAllAction();
        figures.delete(id);
      }
    for (const r of people.values()) {
      if (!poseAt(r, now, o)) continue;
      const f = figures.get(r.id) ?? figure(r.id, r.seed);
      s.x = o[0];
      s.y = o[1] - sunk(o[0], o[2]);
      s.z = o[2];
      s.yaw = o[3];
      s.lit = o[4] > 0.5;
      s.speed = s.side = s.ahead = undefined;
      s.deep = deep(o[0], o[2]);
      s.cold = 0;
      s.pitch = 0;
      s.spent = 0;
      shelter(s.x, s.y, s.z, sheltered);
      s.cover = sheltered[0];
      s.lee = sheltered[1];
      drive(f, s, dt, false);
      // the name, above the hat, while in front and within 160 m (fading over the last 40)
      v.set(o[0], o[1] + 2.15, o[2]).project(camera);
      const dd = Math.hypot(o[0] - camera.position.x, o[2] - camera.position.z);
      const show = v.z < 1 && dd < 160;
      const name = r.name || "Survivor";
      if (f.tag.textContent !== name) f.tag.textContent = name;
      f.tag.style.opacity = show ? String(Math.min(1, (160 - dd) / 40)) : "0";
      f.tag.style.transform = `translate(calc(${((v.x + 1) / 2) * innerWidth}px - 50%), ${((1 - v.y) / 2) * innerHeight}px)`;
    }
  }
  /** Each body drawn, as `body(x, y, z)` (feet), and each lit lantern, as `lamp(position, strength)`. */
  function each(
    body: (x: number, y: number, z: number) => void,
    lamp: (p: THREE.Vector3, k: number) => void,
  ) {
    for (const f of figures.values()) {
      if (!f.root.visible) continue;
      f.root.getWorldPosition(v);
      body(v.x, v.y, v.z);
      if (f.light.intensity > 0.05) {
        f.light.getWorldPosition(v);
        lamp(v, f.light.intensity / 9);
      }
    }
  }
  return { group, update, self, each };
}
