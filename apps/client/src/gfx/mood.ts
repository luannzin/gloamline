// Each region has a mood: its sun (or moon), sky, air and grade. The camera's position blends them,
// so walking from the woods into the mire turns afternoon into a moonlit night over a few hundred
// metres. Everything that reads the mood reads these uniforms.
import { HOLLOW_SUN, type Land, NREG, underRock, type World } from "@gloamline/world";
import {
  abs,
  cameraPosition,
  dot,
  exp,
  Fn,
  float,
  fog,
  hash,
  max,
  mix,
  mx_fractal_noise_float,
  normalize,
  positionWorld,
  pow,
  select,
  smoothstep,
  time,
  uniform,
  vec2,
  vec3,
} from "three/tsl";
import * as THREE from "three/webgpu";

type Mood = {
  sun: [number, number, number];
  sunColor: number;
  sunPower: number;
  zenith: number;
  horizon: number;
  ground: number;
  ambient: number;
  fogColor: number;
  fogDensity: number;
  fogFalloff: number;
  fogBase: number;
  scatter: number;
  clouds: number;
  cloudColor: number;
  stars: number;
  exposure: number;
  saturation: number;
  contrast: number;
  lift: number;
  rays: number;
  bloom: number;
  fireflies: number;
  embers: number;
  dust: number;
  leaves: number;
};

const dir = (az: number, el: number): [number, number, number] => {
  const a = (az * Math.PI) / 180,
    e = (el * Math.PI) / 180;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a)];
};

// region order: gloamwood, mire, keep, hollow, highlands
const MOODS: Mood[] = [
  {
    // Gloamwood: late afternoon gold through the canopy, green-teal haze
    sun: dir(248, 17),
    sunColor: 0xffc27a,
    sunPower: 3.4,
    zenith: 0x40709f,
    horizon: 0xe2b880,
    ground: 0x2a3320,
    ambient: 0.55,
    fogColor: 0x8a9676,
    fogDensity: 0.005,
    fogFalloff: 0.04,
    fogBase: 6,
    scatter: 1.6,
    clouds: 0.3,
    cloudColor: 0xf0dcc0,
    stars: 0,
    exposure: 1.0,
    saturation: 1.05,
    contrast: 1.08,
    lift: 0.0,
    rays: 1.0,
    bloom: 0.22,
    fireflies: 0.35,
    embers: 0,
    dust: 0.8,
    leaves: 1,
  },
  {
    // The Mire: moonlit night, cold and wet
    sun: dir(135, 32),
    sunColor: 0x9fb8ff,
    sunPower: 0.75,
    zenith: 0x0a1226,
    horizon: 0x24324f,
    ground: 0x0b1210,
    ambient: 0.32,
    fogColor: 0x1c2a3c,
    fogDensity: 0.009,
    fogFalloff: 0.09,
    fogBase: 4,
    scatter: 0.8,
    clouds: 0.3,
    cloudColor: 0x3a4a6a,
    stars: 1,
    exposure: 1.45,
    saturation: 0.8,
    contrast: 1.12,
    lift: 0.012,
    rays: 0.6,
    bloom: 0.38,
    fireflies: 1,
    embers: 0,
    dust: 0.1,
    leaves: 0,
  },
  {
    // Cinder Keep: storm at dusk, a red sun under the clouds, embers in the wind
    sun: dir(300, 7),
    sunColor: 0xff7a3a,
    sunPower: 3.0,
    zenith: 0x2e2a38,
    horizon: 0xb0644a,
    ground: 0x221a18,
    ambient: 0.4,
    fogColor: 0x6a4b45,
    fogDensity: 0.0045,
    fogFalloff: 0.03,
    fogBase: 20,
    scatter: 1.8,
    clouds: 0.78,
    cloudColor: 0x5a4a55,
    stars: 0,
    exposure: 1.05,
    saturation: 0.92,
    contrast: 1.15,
    lift: 0.004,
    rays: 0.9,
    bloom: 0.3,
    fireflies: 0,
    embers: 1,
    dust: 0.3,
    leaves: 0,
  },
  {
    // The Hollow outside: grey mountain light
    sun: HOLLOW_SUN,
    sunColor: 0xfff0d8,
    sunPower: 3.2,
    zenith: 0x5d7690,
    horizon: 0xaab4b8,
    ground: 0x2a2a2a,
    ambient: 0.5,
    fogColor: 0x8a949a,
    fogDensity: 0.004,
    fogFalloff: 0.03,
    fogBase: 30,
    scatter: 0.9,
    clouds: 0.55,
    cloudColor: 0xd8dde0,
    stars: 0,
    exposure: 1.0,
    saturation: 0.85,
    contrast: 1.08,
    lift: 0,
    rays: 1.0,
    bloom: 0.2,
    fireflies: 0,
    embers: 0,
    dust: 0.5,
    leaves: 0,
  },
  {
    // Pale Highlands: wide pale gold light, wind in the grass
    sun: dir(200, 28),
    sunColor: 0xfff1d2,
    sunPower: 3.6,
    zenith: 0x4f7fb5,
    horizon: 0xd9dccf,
    ground: 0x3a3a28,
    ambient: 0.6,
    fogColor: 0xb7c2c4,
    fogDensity: 0.0025,
    fogFalloff: 0.02,
    fogBase: 40,
    scatter: 1.0,
    clouds: 0.45,
    cloudColor: 0xffffff,
    stars: 0,
    exposure: 1.0,
    saturation: 1.0,
    contrast: 1.05,
    lift: 0,
    rays: 0.7,
    bloom: 0.16,
    fireflies: 0,
    embers: 0,
    dust: 0.3,
    leaves: 0.2,
  },
];
// under the Hollow's rock: dark, the shafts and the glowing caps do the lighting
const CAVE: Mood = {
  ...MOODS[3],
  sunPower: 4.2,
  ambient: 0.025,
  fogColor: 0x10161a,
  fogDensity: 0.012,
  fogFalloff: 0.0,
  fogBase: 0,
  scatter: 3.2,
  exposure: 1.6,
  saturation: 0.9,
  contrast: 1.1,
  lift: 0.004,
  rays: 1.0,
  bloom: 0.45,
  dust: 0.45,
  leaves: 0,
};

const NUMS = [
  "sunPower",
  "ambient",
  "fogDensity",
  "fogFalloff",
  "fogBase",
  "scatter",
  "clouds",
  "stars",
  "exposure",
  "saturation",
  "contrast",
  "lift",
  "rays",
  "bloom",
  "fireflies",
  "embers",
  "dust",
  "leaves",
] as const;
const COLS = ["sunColor", "zenith", "horizon", "ground", "fogColor", "cloudColor"] as const;

export function makeMood(land: Land, world: World) {
  const cu = () => uniform(new THREE.Color()),
    fu = () => uniform(0);
  const u = {
    sunDir: uniform(new THREE.Vector3(0, 1, 0)),
    ...(Object.fromEntries(COLS.map((k) => [k, cu()])) as Record<
      (typeof COLS)[number],
      ReturnType<typeof cu>
    >),
    ...(Object.fromEntries(NUMS.map((k) => [k, fu()])) as Record<
      (typeof NUMS)[number],
      ReturnType<typeof fu>
    >),
  };
  const cur = { ...MOODS[0], sun: [...MOODS[0].sun] as [number, number, number] };
  const tmp = new Float32Array(NREG),
    c = new THREE.Color(),
    acc = new THREE.Color();
  const right = new THREE.Vector3(),
    up2 = new THREE.Vector3();
  let cover = 0,
    first = true;

  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const S = 95;
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 900 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  // the shadow map is redrawn only when the box moves a few metres or the sun turns (abyssal-garden
  // draws its once); swaying leaves keep the shadow of where they were, which nobody can see
  sun.shadow.autoUpdate = false;
  const lastBox = new THREE.Vector3(1e9, 0, 0),
    lastSun = new THREE.Vector3();
  const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0.5);

  // sky dome: gradient, sun, clouds lit from the sun's side, stars
  const sky = Fn(() => {
    const d = normalize(positionWorld.sub(cameraPosition)).toVar();
    const up = d.y;
    const base = mix(u.horizon, u.zenith, pow(max(up, 0), 0.45)).toVar();
    base.assign(mix(base, u.ground.mul(0.6), smoothstep(0.0, -0.25, up)));
    const mu = max(dot(d, u.sunDir), 0);
    const glow = u.sunColor.mul(pow(mu, 6).mul(0.35).add(pow(mu, 64).mul(0.9))).mul(u.sunPower.mul(0.25));
    const disc = u.sunColor.mul(smoothstep(0.9993, 0.9997, mu).mul(u.sunPower).mul(8));
    // clouds on a dome: planar uv that bunches toward the horizon
    const cuv = d.xz
      .div(up.add(0.16))
      .mul(0.55)
      .add(vec2(time.mul(0.004), time.mul(0.0015)));
    const n = mx_fractal_noise_float(vec3(cuv, time.mul(0.003)), 5, 2.1, 0.5, 1)
      .mul(0.5)
      .add(0.5);
    const cov = smoothstep(float(1).sub(u.clouds), float(1.25).sub(u.clouds), n).mul(
      smoothstep(0.0, 0.18, up),
    );
    const lit = mix(u.cloudColor.mul(0.35), u.cloudColor, smoothstep(0.35, 0.75, n)).add(
      u.sunColor.mul(pow(mu, 5).mul(u.sunPower).mul(0.3)),
    );
    const st = hash(d.mul(380).floor().xz.add(d.mul(380).floor().y.mul(97)));
    const stars = smoothstep(0.9965, 1.0, st)
      .mul(u.stars)
      .mul(smoothstep(0.05, 0.3, up))
      .mul(float(1).sub(cov))
      .mul(2.5);
    const col = mix(base.add(glow).add(disc), lit, cov.mul(0.92)).add(stars);
    return col;
  });
  const skyMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  skyMat.colorNode = sky();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2600, 48, 24), skyMat);
  dome.frustumCulled = false;
  dome.renderOrder = -1;

  // height fog with the sun scattered into it (Quilez's analytic integral of exp(-b y))
  const fogNode = Fn(() => {
    const v = positionWorld.sub(cameraPosition);
    const d = v.length();
    const rd = v.div(d);
    const b = max(u.fogFalloff, 0.0001);
    const ry = select(abs(rd.y).lessThan(0.0005), float(0.0005), rd.y);
    const amount = u.fogDensity
      .mul(exp(cameraPosition.y.sub(u.fogBase).mul(b).negate()))
      .mul(float(1).sub(exp(d.mul(ry).mul(b).negate())))
      .div(ry.mul(b));
    const k = float(1).sub(exp(amount.add(d.mul(0.00035)).negate()));
    const mu = max(dot(rd, u.sunDir), 0);
    const col = mix(u.fogColor, u.sunColor.mul(u.scatter).mul(0.35).add(u.fogColor), pow(mu, 7));
    return fog(col, k);
  })();

  /** Blends the moods for a camera at `p` and eases the uniforms toward them. */
  function update(p: THREE.Vector3, dt: number) {
    const edge = land.weights(p.x, p.z, tmp);
    tmp[4] += edge;
    const covered = underRock(world.field, p.x, p.y, p.z) ? 1 : 0;
    cover += (covered - cover) * Math.min(1, dt * 1.5);
    const k = first ? 1 : Math.min(1, dt * 2);
    first = false;
    const blend = (get: (m: Mood) => number) => {
      let s = 0;
      for (let i = 0; i < NREG; i++) s += tmp[i] * get(MOODS[i]);
      return s * (1 - cover) + get(CAVE) * cover;
    };
    for (const key of NUMS) cur[key] += (blend((m) => m[key]) - cur[key]) * k;
    for (let a = 0; a < 3; a++) cur.sun[a] += (blend((m) => m.sun[a]) - cur.sun[a]) * k;
    u.sunDir.value.set(cur.sun[0], cur.sun[1], cur.sun[2]).normalize();
    for (const key of COLS) {
      acc.setRGB(0, 0, 0);
      for (let i = 0; i < NREG; i++) acc.add(c.setHex(MOODS[i][key]).multiplyScalar(tmp[i] * (1 - cover)));
      acc.add(c.setHex(CAVE[key]).multiplyScalar(cover));
      u[key].value.lerp(acc, k);
    }
    for (const key of NUMS) u[key].value = cur[key];
    sun.color.copy(u.sunColor.value);
    // ground albedos are real-world dark (0.03 to 0.15), so the lights carry the brightness
    sun.intensity = cur.sunPower * 2.3;
    hemi.color.copy(u.zenith.value).lerp(u.horizon.value, 0.4);
    hemi.groundColor.copy(u.ground.value);
    hemi.intensity = cur.ambient * 3.2;
    // shadow box follows the camera, snapped to its texels so edges don't crawl
    const L = u.sunDir.value,
      texel = (S * 2) / sun.shadow.mapSize.x;
    right.set(L.z, 0, -L.x).normalize();
    up2.crossVectors(L, right);
    const a = Math.round(p.dot(right) / texel) * texel,
      b2 = Math.round(p.dot(up2) / texel) * texel,
      c2 = p.dot(L);
    sun.target.position.copy(right).multiplyScalar(a).addScaledVector(up2, b2).addScaledVector(L, c2);
    sun.position.copy(sun.target.position).addScaledVector(L, 450);
    sun.target.updateMatrixWorld();
    if (sun.target.position.distanceToSquared(lastBox) > 9 || L.dot(lastSun) < 0.99995) {
      lastBox.copy(sun.target.position);
      lastSun.copy(L);
      sun.shadow.needsUpdate = true;
    } else {
      // hold the box where the map was drawn
      sun.target.position.copy(lastBox);
      sun.position.copy(lastBox).addScaledVector(lastSun, 450);
      sun.target.updateMatrixWorld();
    }
    dome.position.copy(p);
  }

  return {
    u,
    sun,
    hemi,
    dome,
    fogNode,
    update,
  };
}

export type MoodState = ReturnType<typeof makeMood>;
