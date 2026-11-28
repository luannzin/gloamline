// Puffs: snow kicked up by each step in the drift (clods that fly and fall, and a cloud of powder
// that hangs and blows off), and breath steaming in the cold. A ring of quads: when one is made the
// CPU writes where, when, how fast and what it is; the GPU moves, grows and fades it from that alone,
// so nothing is uploaded between puffs.
import {
  attribute,
  exp,
  Fn,
  float,
  hash,
  instanceIndex,
  mix,
  positionLocal,
  select,
  smoothstep,
  uniform,
  uv,
  vec3,
} from "three/tsl";
import * as THREE from "three/webgpu";
import type { MoodState } from "./mood";
import { behindWorld } from "./overlay";
import type { Wind } from "./wind";

const N = 640;
/** kinds: a clod of snow, a cloud of powder, a breath */
const CLOD = 0,
  POWDER = 1,
  BREATH = 2;

export function makePuffs(mood: MoodState, wind: Wind) {
  // x, y, z, start time; vx, vy, vz, kind
  const a = new THREE.InstancedBufferAttribute(new Float32Array(N * 4).fill(-1e4), 4).setUsage(
    THREE.DynamicDrawUsage,
  );
  const b = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const g = new THREE.PlaneGeometry(1, 1);
  g.setAttribute("puffA", a);
  g.setAttribute("puffB", b);
  const now = uniform(0),
    right = uniform(new THREE.Vector3(1, 0, 0)),
    up = uniform(new THREE.Vector3(0, 1, 0));
  const A = attribute("puffA", "vec4"),
    B = attribute("puffB", "vec4");
  const kind = B.w;
  const isClod = kind.lessThan(0.5),
    isBreath = kind.greaterThan(1.5);
  const life = select(isClod, float(0.75), select(isBreath, float(2.2), float(1.6)));
  const age = now.sub(A.w);
  const t = age.div(life);
  const alive = t.greaterThanEqual(0).and(t.lessThan(1));
  const s = hash(float(instanceIndex).mul(3.71));
  const w = wind.u;
  const air = vec3(w.dir.x, 0, w.dir.y).mul(w.speed);
  const centre = Fn(() => {
    const p = A.xyz.toVar();
    const v = B.xyz;
    // clods fly and fall; powder and breath slow in the air (drag) and drift off on the wind,
    // breath rising a little, warm
    const drag = select(isBreath, float(2.2), float(3.2));
    const coast = float(1)
      .sub(exp(age.mul(drag).negate()))
      .div(drag);
    p.assign(
      select(
        isClod,
        p.add(v.mul(age)).add(vec3(0, age.mul(age).mul(-4.2), 0)),
        p
          .add(v.mul(coast))
          .add(air.mul(age).mul(select(isBreath, float(0.45), float(0.3))))
          .add(vec3(0, select(isBreath, age.mul(0.12), age.mul(-0.08)), 0)),
      ),
    );
    return p;
  })();
  const size = select(
    isClod,
    mix(float(0.025), float(0.055), s),
    select(isBreath, mix(float(0.07), float(0.5), t.sqrt()), mix(float(0.18), float(0.7), t.sqrt())),
  ).mul(select(alive, float(1), float(0)));
  // drawn over the settled image, tested against the world's depth by hand (overlay.ts)
  const m = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    fog: true,
  });
  m.positionNode = centre.add(right.mul(positionLocal.x.mul(size))).add(up.mul(positionLocal.y.mul(size)));
  const r = uv().sub(0.5).length();
  const shape = select(isClod, smoothstep(0.5, 0.3, r), smoothstep(0.5, 0.0, r).pow(1.6));
  const fadeIn = smoothstep(0, 0.08, t);
  const opacity = select(
    isClod,
    float(1).sub(t.mul(t)).mul(0.95),
    select(isBreath, float(1).sub(t).pow(1.5).mul(0.28), float(1).sub(t).pow(1.2).mul(0.38)),
  ).mul(fadeIn);
  m.opacityNode = shape.mul(opacity).mul(behindWorld(select(isClod, float(0.05), float(0.35))));
  // lit as the snow on the ground is: the sky and a little sun; breath a shade greyer
  m.colorNode = mood.u.horizon
    .mul(2.3)
    .add(mood.u.sunColor.mul(mood.u.sunPower.mul(0.25)))
    .mul(select(isBreath, float(0.85), float(1)))
    .mul(mood.u.open.mul(0.75).add(0.25));
  const mesh = new THREE.Mesh(g, m);
  mesh.count = N;
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;

  let next = 0,
    clock = 0;
  const rnd = () => Math.random() * 2 - 1;
  function emit(k: number, x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    const i = next;
    next = (next + 1) % N;
    a.array[i * 4] = x;
    a.array[i * 4 + 1] = y;
    a.array[i * 4 + 2] = z;
    a.array[i * 4 + 3] = clock;
    b.array[i * 4] = vx;
    b.array[i * 4 + 1] = vy;
    b.array[i * 4 + 2] = vz;
    b.array[i * 4 + 3] = k;
    a.needsUpdate = b.needsUpdate = true;
  }

  return {
    mesh,
    /**
     * A foot pulled out of the drift at (x, y, z), walking along (fx, fz): clods thrown forward and
     * up, a cloud of powder. `depth` the snow's (0..1), `hard` 1 running.
     */
    kick(x: number, y: number, z: number, fx: number, fz: number, depth: number, hard: number) {
      const n = Math.round((3 + 5 * hard) * depth);
      for (let i = 0; i < n; i++) {
        const sp = 0.8 + Math.random() * (1 + 1.6 * hard);
        emit(
          CLOD,
          x + rnd() * 0.08,
          y + 0.05,
          z + rnd() * 0.08,
          fx * sp + rnd() * 0.5,
          1.1 + Math.random() * (1 + hard),
          fz * sp + rnd() * 0.5,
        );
      }
      if (depth > 0.3)
        emit(
          POWDER,
          x,
          y + 0.12,
          z,
          fx * (0.6 + hard) + rnd() * 0.2,
          0.35 + hard * 0.3,
          fz * (0.6 + hard) + rnd() * 0.2,
        );
    },
    /** A breath out of a mouth at (x, y, z) facing (fx, fz); `heavy` 1 out of breath. */
    breathe(x: number, y: number, z: number, fx: number, fz: number, heavy: number) {
      const sp = 0.5 + heavy * 0.5;
      emit(BREATH, x, y, z, fx * sp, -0.05, fz * sp);
      emit(BREATH, x, y, z, fx * sp * 0.7 + rnd() * 0.1, 0, fz * sp * 0.7 + rnd() * 0.1);
    },
    update(dt: number, camera: THREE.Camera) {
      clock += dt;
      now.value = clock;
      right.value.setFromMatrixColumn(camera.matrixWorld, 0);
      up.value.setFromMatrixColumn(camera.matrixWorld, 1);
    },
  };
}

export type Puffs = ReturnType<typeof makePuffs>;
