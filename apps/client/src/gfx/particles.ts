// Small lights in the air: fireflies over the mire and woods, embers off the keep, dust in the
// light, falling leaves. Each kind is one draw of camera-facing quads placed by the GPU in a box
// that wraps around the camera. The mood says how much of each a place has.
import { HALF } from "@zimovye/world";
import {
  cameraPosition,
  Fn,
  float,
  hash,
  instanceIndex,
  int,
  ivec2,
  mix,
  positionLocal,
  sin,
  smoothstep,
  textureLoad,
  time,
  uniform,
  uv,
  vec3,
} from "three/tsl";
import * as THREE from "three/webgpu";
import type { MoodState } from "./mood";

type F = ReturnType<typeof float>;
type V = ReturnType<typeof vec3>;
type Kind = {
  n: number;
  box: [number, number, number];
  size: [number, number];
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
};

/** `effects`: the weather setting (video.ts), 0 half the specks, 1 all of them */
export function makeParticles(height: THREE.DataTexture, mood: MoodState, effects: number) {
  const right = uniform(new THREE.Vector3(1, 0, 0)),
    up = uniform(new THREE.Vector3(0, 1, 0));
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
      drift: [1.2, 1.4, 0.6],
      wobble: 0.6,
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
      // snow, on the wind: lit by the pale sky and a little by the sun
      n: 6000 * k,
      box: [40, 24, 40],
      size: [0.025, 0.06],
      drift: [0.85, -1.5, 0.35],
      wobble: 0.55,
      color: (s) => vec3(0.9, 0.93, 0.97).mul(s.mul(0.3).add(0.7)),
      amount: (m) => m.u.snowfall,
      light: (m) => m.u.horizon.mul(0.85).add(m.u.sunColor.mul(m.u.sunPower.mul(0.06))),
      solid: true,
    },
    {
      // ash from the fires, slower and darker than the snow
      n: 1800 * k,
      box: [50, 26, 50],
      size: [0.02, 0.05],
      drift: [0.5, -0.45, 0.25],
      wobble: 1.1,
      color: (s) => vec3(0.16, 0.15, 0.145).mul(s.mul(0.6).add(0.5)),
      amount: (m) => m.u.ash,
      light: (m) => m.u.horizon.mul(0.6),
      solid: true,
    },
  ];
  const group = new THREE.Group();
  for (const kd of kinds) {
    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: kd.solid ? THREE.NormalBlending : THREE.AdditiveBlending,
      // specks take the fog like everything else; lights in the air don't
      fog: !!kd.solid,
    });
    const id = float(instanceIndex);
    const s1 = hash(id.mul(1.37)),
      s2 = hash(id.mul(7.11).add(3.1)),
      s3 = hash(id.mul(3.77).add(9.2)),
      s4 = hash(id.mul(5.3).add(1.9));
    const box = vec3(...kd.box);
    const centre = Fn(() => {
      const base = vec3(s1, s2, s3).mul(box);
      const p = base
        .add(
          vec3(...kd.drift)
            .mul(time)
            .mul(s4.mul(0.6).add(0.7)),
        )
        .add(
          vec3(
            sin(time.mul(0.7).add(s1.mul(40))),
            sin(time.mul(0.9).add(s2.mul(40))),
            sin(time.mul(0.5).add(s3.mul(40))),
          ).mul(kd.wobble),
        );
      // wrap into the box around the camera
      const w = p
        .sub(cameraPosition)
        .add(box.mul(0.5))
        .mod(box)
        .sub(box.mul(0.5))
        .add(cameraPosition)
        .toVar();
      if (kd.nearGround) {
        const g = textureLoad(height, ivec2(int(w.x.add(HALF)), int(w.z.add(HALF)))).x;
        w.y.assign(g.add(mix(float(kd.nearGround[0]), float(kd.nearGround[1]), s2)));
      }
      return w;
    })();
    const size = mix(float(kd.size[0]), float(kd.size[1]), s4);
    m.positionNode = centre.add(right.mul(positionLocal.x.mul(size))).add(up.mul(positionLocal.y.mul(size)));
    const r = uv().sub(0.5).length();
    const disc = smoothstep(0.5, 0.0, r).pow(1.5);
    const dist = centre.sub(cameraPosition).length();
    const fade = smoothstep(float(kd.box[0] * 0.5), float(kd.box[0] * 0.3), dist).mul(
      smoothstep(0.3, 1.2, dist),
    );
    const blink = kd.blink
      ? sin(time.mul(s1.mul(2).add(1)).add(s2.mul(30)))
          .mul(0.5)
          .add(0.5)
          .pow(3)
      : float(1);
    const light = kd.light ? kd.light(mood) : vec3(1, 1, 1);
    const k2 = (disc as F)
      .mul(fade as F)
      .mul(blink as F)
      .mul(kd.amount(mood) as F);
    if (kd.solid) {
      m.colorNode = (kd.color(s3 as never) as V).mul(light as V);
      m.opacityNode = k2.mul(0.9);
    } else m.colorNode = (kd.color(s3 as never) as V).mul(light as V).mul(k2);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
    mesh.count = Math.round(kd.n);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    group.add(mesh);
  }
  return {
    group,
    update(camera: THREE.Camera) {
      right.value.setFromMatrixColumn(camera.matrixWorld, 0);
      up.value.setFromMatrixColumn(camera.matrixWorld, 1);
    },
  };
}
