// Small things in the air: fireflies over the mire and woods, embers off the keep, dust in the light,
// ash, and the snow. Each kind is one draw of camera-facing quads placed by the GPU in a box that
// wraps around the camera. The mood says how much of each a place has.
//
// The snow is three kinds, all carried by the wind (wind.ts): the fall around you, streaked along
// its own motion so a gust reads as lines, not dots; a few big flakes right in front of the lens,
// soft and fast; and the drift, snow lifted off the ground and blown along it in the gusts, where the
// snow lies.
//
// The snow meets the world: nothing falls under a roof or a crown (cover.ts), a flake reaching one
// flattens into a splat, it parts round the bodies standing in it and leaves their lee clear, and
// the lanterns and lit windows near it light it warm.
import { HALF } from "@zimovye/world";
import {
  cameraPosition,
  cos,
  dot,
  Fn,
  float,
  hash,
  instanceIndex,
  int,
  ivec2,
  Loop,
  mix,
  normalize,
  positionLocal,
  sin,
  smoothstep,
  textureLoad,
  time,
  uniform,
  uniformArray,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import * as THREE from "three/webgpu";
import type { Cover } from "./cover";
import type { MoodState } from "./mood";
import { additive, behindWorld } from "./overlay";
import type { Wind } from "./wind";

/** Bodies the snow parts round, and lights that warm it: at most this many of each. */
const BODIES = 8,
  LIGHTS = 16;

type F = ReturnType<typeof float>;
type V = ReturnType<typeof vec3>;
type N1 = THREE.Node<"float">;
type N3 = THREE.Node<"vec3">;
type Kind = {
  n: number;
  box: [number, number, number];
  size: [number, number];
  /** metres a second of their own (falling, rising) */
  drift: [number, number, number];
  wobble: number;
  color: (seed: F) => unknown;
  amount: (m: MoodState) => unknown;
  nearGround?: [number, number];
  blink?: boolean;
  /** lit by the mood (default: glows on its own) */
  light?: (m: MoodState) => unknown;
  /** an opaque speck over the scene, not light added to it (snow, ash) */
  solid?: boolean;
  /** how much the wind carries it (1: moves with the air) */
  carried?: number;
  /** streaked along its motion: seconds of exposure */
  streak?: number;
  /** shown only in the gusts, where snow lies (the drift) */
  gusty?: boolean;
  /** how opaque at most */
  alpha?: number;
  /** stopped by roofs and bodies, warmed by lights (the snow and the ash) */
  meets?: boolean;
};

/** `effects`: the weather setting (video.ts), 0 half the specks, 1 all of them */
export function makeParticles(
  height: THREE.DataTexture,
  mood: MoodState,
  wind: Wind,
  effects: number,
  cover: Cover,
) {
  const right = uniform(new THREE.Vector3(1, 0, 0)),
    up = uniform(new THREE.Vector3(0, 1, 0)),
    /** how wide a pixel is a metre away */
    pixel = uniform(0.001);
  // each body a capsule: (foot x, y, z, radius), (head x, y, z, 0)
  const bodyData = Array.from({ length: BODIES * 2 }, () => new THREE.Vector4());
  const bodies = uniformArray(bodyData, "vec4");
  // each light: (x, y, z, reach), (r, g, b, 0) times its strength
  const lightData = Array.from({ length: LIGHTS * 2 }, () => new THREE.Vector4());
  const lights = uniformArray(lightData, "vec4");
  const w = wind.u;

  const at = (a: typeof bodies, i: THREE.Node<"int">) => a.element(i) as unknown as ReturnType<typeof vec4>;

  /** `c` moved out of any body it's in or near, and how much of it still shows (0 inside or in its lee). */
  const part = Fn(([c]: [N3]) => {
    const p = c.toVar(),
      show = float(1).toVar();
    const down = vec3(w.dir.x, 0, w.dir.y);
    Loop(BODIES, ({ i }) => {
      const A = at(bodies, i.mul(2)),
        B = at(bodies, i.mul(2).add(1));
      const r = A.w;
      // the lee: a point downwind of the body is tested as if it stood back at the body, so the
      // shelter trails a metre and a half behind it, fading
      const along = p.xz.sub(A.xz).dot(w.dir).clamp(0, 1.5);
      const q = p.sub(down.mul(along));
      const ab = B.xyz.sub(A.xyz);
      const t = q.sub(A.xyz).dot(ab).div(ab.dot(ab).max(1e-4)).clamp(0, 1);
      const off = q.sub(A.xyz.add(ab.mul(t)));
      const d = off.length();
      show.mulAssign(float(1).sub(smoothstep(r, r.mul(0.7), d).mul(float(1).sub(along.div(1.7)))));
      // and what passes close is pushed aside, the nearer the further
      const side = normalize(vec3(off.x, 0, off.z).add(vec3(0.0001, 0, 0)));
      p.addAssign(
        side.mul(
          smoothstep(r.mul(2.2), r, d)
            .mul(r)
            .mul(0.9)
            .mul(float(1).sub(along.div(1.5))),
        ),
      );
    });
    return vec4(p, show);
  });

  /** The warm light the lanterns and windows put on a speck at `c`. */
  const warmth = Fn(([c]: [N3]) => {
    const sum = vec3(0, 0, 0).toVar();
    Loop(LIGHTS, ({ i }) => {
      const P = at(lights, i.mul(2)),
        C = at(lights, i.mul(2).add(1));
      const k = float(1).sub(c.sub(P.xyz).length().div(P.w)).max(0);
      sum.addAssign(C.xyz.mul(k.mul(k)));
    });
    return sum;
  });
  const k = effects > 0 ? 1 : 0.5;
  const kinds: Kind[] = [
    {
      n: 900 * k,
      box: [90, 10, 90],
      size: [0.05, 0.11],
      drift: [0.15, 0.05, 0.1],
      wobble: 0.9,
      nearGround: [0.4, 3.5],
      blink: true,
      color: (s) => mix(vec3(0.75, 1.0, 0.35), vec3(0.4, 1.0, 0.8), s).mul(6),
      amount: (m) => m.u.fireflies,
    },
    {
      n: 1400 * k,
      box: [70, 40, 70],
      size: [0.04, 0.09],
      drift: [0, 1.4, 0],
      wobble: 0.6,
      carried: 0.25,
      color: (s) => mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.6, 0.2), s).mul(9),
      amount: (m) => m.u.embers,
    },
    {
      n: 2200 * k,
      box: [36, 18, 36],
      size: [0.012, 0.03],
      drift: [0.05, 0.02, 0.04],
      wobble: 0.25,
      color: () => vec3(1, 1, 1).mul(1.2),
      amount: (m) => m.u.dust,
      light: (m) => m.u.sunColor.mul(m.u.sunPower).mul(0.08),
    },
    {
      // the fall: lit by the pale sky and a little by the sun, streaked by the wind
      n: 12000 * k,
      box: [36, 22, 36],
      size: [0.014, 0.05],
      drift: [0, -1.3, 0],
      wobble: 0.5,
      carried: 1,
      streak: 0.022,
      color: (s) => vec3(0.92, 0.94, 0.98).mul(s.mul(0.25).add(0.75)),
      amount: (m) => m.u.snowfall,
      // (as bright as the snow on the ground, which the sun and the whole sky light)
      light: (m) => m.u.horizon.mul(2.3).add(m.u.sunColor.mul(m.u.sunPower.mul(0.25))),
      solid: true,
      alpha: 0.85,
      meets: true,
    },
    {
      // flakes passing close to the lens: soft round blurs, few
      n: 160 * k,
      box: [7, 5, 7],
      size: [0.008, 0.016],
      drift: [0, -1.1, 0],
      wobble: 0.4,
      carried: 1.15,
      streak: 0.012,
      color: () => vec3(0.95, 0.96, 1),
      amount: (m) => m.u.snowfall.mul(m.u.snowfall),
      light: (m) => m.u.horizon.mul(2.3),
      solid: true,
      alpha: 0.22,
      meets: true,
    },
    {
      // the drift: snow lifted off the ground in the gusts and blown along it, knee-high
      n: 4500 * k,
      box: [44, 10, 44],
      size: [0.01, 0.024],
      drift: [0, 0, 0],
      wobble: 0.35,
      nearGround: [0.02, 0.9],
      carried: 1.6,
      streak: 0.018,
      gusty: true,
      color: () => vec3(0.95, 0.96, 1),
      amount: (m) => m.u.snow.mul(m.u.snowfall.mul(0.8).add(0.2)).mul(m.u.open),
      light: (m) => m.u.horizon.mul(2.3),
      solid: true,
      alpha: 0.5,
      meets: true,
    },
    {
      // ash from the fires, slower and darker than the snow
      n: 1800 * k,
      box: [50, 26, 50],
      size: [0.02, 0.05],
      drift: [0, -0.45, 0],
      wobble: 1.1,
      carried: 0.6,
      color: (s) => vec3(0.16, 0.15, 0.145).mul(s.mul(0.6).add(0.5)),
      amount: (m) => m.u.ash,
      light: (m) => m.u.horizon.mul(0.6),
      solid: true,
      meets: true,
    },
  ];
  const group = new THREE.Group();
  for (const kd of kinds) {
    // drawn over the settled image, tested against the world's depth by hand (overlay.ts)
    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      // specks take the fog like everything else; lights in the air don't
      fog: !!kd.solid,
    });
    if (!kd.solid) additive(m);
    const id = float(instanceIndex);
    const s1 = hash(id.mul(1.37)),
      s2 = hash(id.mul(7.11).add(3.1)),
      s3 = hash(id.mul(3.77).add(9.2)),
      s4 = hash(id.mul(5.3).add(1.9));
    const box = vec3(...kd.box);
    // each speck rides the air at its own share of the wind (light ones further)
    const share = s4
      .mul(0.5)
      .add(0.75)
      .mul(kd.carried ?? 0);
    const own = vec3(...kd.drift).mul(s4.mul(0.6).add(0.7));
    // how it moves now: the wind's share, its own fall, and its tumble (the wobble's rate of change),
    // so no two streaks lie quite parallel
    const vel = vec3(w.dir.x, 0, w.dir.y)
      .mul(w.speed)
      .mul(share)
      .add(own)
      .add(
        vec3(
          cos(time.mul(0.7).add(s1.mul(40))).mul(0.7),
          cos(time.mul(0.9).add(s2.mul(40))).mul(0.9),
          cos(time.mul(0.5).add(s3.mul(40))).mul(0.5),
        ).mul(kd.wobble),
      );
    const raw = Fn(() => {
      const base = vec3(s1, s2, s3).mul(box);
      const p = base
        .add(vec3(w.travel.x, 0, w.travel.y).mul(share))
        .add(own.mul(time))
        .add(
          vec3(
            sin(time.mul(0.7).add(s1.mul(40))),
            sin(time.mul(0.9).add(s2.mul(40))),
            sin(time.mul(0.5).add(s3.mul(40))),
          ).mul(kd.wobble),
        );
      // wrap into the box around the camera (fract, not mod: WGSL's float remainder keeps the sign,
      // and everything falling would wrap to below the ground)
      const c = p
        .sub(cameraPosition)
        .add(box.mul(0.5))
        .div(box)
        .fract()
        .mul(box)
        .sub(box.mul(0.5))
        .add(cameraPosition)
        .toVar();
      if (kd.nearGround) {
        const g = textureLoad(height, ivec2(int(c.x.add(HALF)), int(c.z.add(HALF)))).x;
        c.y.assign(g.add(mix(float(kd.nearGround[0]), float(kd.nearGround[1]), s2.mul(s2))));
      }
      return c;
    })();
    // the snow meets the world, worked out once a speck in the vertex stage: parted round the bodies,
    // gone under a roof, flattened where it reaches one, warmed by the lights near it
    let centre: N3 = raw,
      shows: N1 = float(1),
      splat: N1 = float(0),
      warm: N3 = vec3(0, 0, 0);
    if (kd.meets) {
      const parted = part(raw) as unknown as ReturnType<typeof vec4>;
      const p = parted.xyz;
      const below = cover.below(p);
      centre = varying(p) as never;
      shows = varying(parted.w.mul(smoothstep(0.25, 0.02, below))) as never;
      splat = varying(smoothstep(-0.3, 0, below)) as never;
      warm = varying(warmth(p)) as never;
    }
    // a speck smaller than a pixel would fall between the pixels and never be drawn: it's drawn a
    // pixel and a half wide instead, and as much fainter as it was made bigger
    // (sizes skewed small: most flakes fine, a few large)
    const real = mix(float(kd.size[0]), float(kd.size[1]), s4.mul(s4));
    const size = real.max(centre.sub(cameraPosition).length().mul(pixel).mul(1.5));
    const thin = real.div(size).pow(2);
    if (kd.streak) {
      // a quad along the motion as the eye sees it (in the screen's plane): as long as the speck
      // travels in the exposure
      const sx = dot(vel, right),
        sy = dot(vel, up);
      const speed = vec2(sx, sy).length();
      // reaching a roof it stops and spreads: a short smear lying level
      const a = normalize(mix(vec2(sx, sy).div(speed.max(0.001)), vec2(1, 0), splat));
      // (side is the axis turned clockwise, so the quad still faces the camera and isn't culled)
      const axis = right.mul(a.x).add(up.mul(a.y)),
        side = right.mul(a.y).add(up.mul(a.x.negate()));
      const len = mix(size.add(speed.mul(kd.streak)), size.mul(2.2), splat);
      m.positionNode = centre
        .add(side.mul(positionLocal.x.mul(size.mul(splat.mul(-0.4).add(1)))))
        .add(axis.mul(positionLocal.y.mul(len)));
    } else
      m.positionNode = centre
        .add(right.mul(positionLocal.x.mul(size)))
        .add(up.mul(positionLocal.y.mul(size)));
    const r = uv().sub(0.5).length();
    const disc = smoothstep(0.5, 0.0, r).pow(1.5);
    const dist = centre.sub(cameraPosition).length();
    const fade = smoothstep(float(kd.box[0] * 0.5), float(kd.box[0] * 0.3), dist).mul(
      smoothstep(0.15, 0.6, dist),
    );
    const blink = kd.blink
      ? sin(time.mul(s1.mul(2).add(1)).add(s2.mul(30)))
          .mul(0.5)
          .add(0.5)
          .pow(3)
      : float(1);
    // the drift shows in the gusts only, more of it the harder they blow
    const gusty = kd.gusty
      ? smoothstep(0.85, 1.35, wind.gust(centre.xz)).mul(smoothstep(2, 6, w.speed))
      : float(1);
    const light = (kd.light ? kd.light(mood) : vec3(1, 1, 1)) as V;
    const k2 = (disc as F)
      .mul(fade as F)
      .mul(blink as F)
      .mul(gusty as F)
      .mul(behindWorld(0.25) as F)
      .mul(thin as F)
      .mul(shows)
      .mul(kd.amount(mood) as F);
    if (kd.solid) {
      m.colorNode = (kd.color(s3 as never) as V).mul(light.add(warm));
      m.opacityNode = k2.mul(kd.alpha ?? 0.9);
    } else m.colorNode = (kd.color(s3 as never) as V).mul(light).mul(k2);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
    mesh.count = Math.round(kd.n);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    group.add(mesh);
  }
  /** Unused bodies and lights sit far below the world, a centimetre round, and touch nothing. */
  const clear = (from: number, data: THREE.Vector4[]) => {
    for (let i = from * 2; i < data.length; i++) data[i].set(0, -1e5, 0, 0.01);
  };
  clear(0, bodyData);
  clear(0, lightData);
  let nBodies = 0,
    nLights = 0;
  return {
    group,
    /** A body the snow parts round, standing at (x, y, z), `h` tall and `r` round. */
    body(x: number, y: number, z: number, h: number, r: number) {
      if (nBodies >= BODIES) return;
      bodyData[nBodies * 2].set(x, y + r, z, r);
      bodyData[nBodies * 2 + 1].set(x, y + h - r, z, 0);
      nBodies++;
    },
    /** A light warming the snow within `reach` metres: `c` times `strength`. */
    light(p: THREE.Vector3, reach: number, c: THREE.Color, strength: number) {
      if (nLights >= LIGHTS) return;
      lightData[nLights * 2].set(p.x, p.y, p.z, reach);
      lightData[nLights * 2 + 1].set(c.r * strength, c.g * strength, c.b * strength, 0);
      nLights++;
    },
    /** `height`: the drawing buffer's, in pixels. Ends the frame's bodies and lights. */
    update(camera: THREE.PerspectiveCamera, height: number) {
      right.value.setFromMatrixColumn(camera.matrixWorld, 0);
      up.value.setFromMatrixColumn(camera.matrixWorld, 1);
      pixel.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, height);
      clear(nBodies, bodyData);
      clear(nLights, lightData);
      nBodies = nLights = 0;
    },
  };
}
