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
  min,
  mix,
  normalize,
  positionWorld,
  pow,
  select,
  sin,
  smoothstep,
  texture,
  time,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import * as THREE from "three/webgpu";

type Node3 = THREE.Node<"vec3">;
type Node1 = THREE.Node<"float">;
type Node2 = THREE.Node<"vec2">;

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
  /** a second, thin layer that lies in hollows and drifts in patches */
  mist: number;
  mistBase: number;
  mistFalloff: number;
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
    // Gloamwood: late afternoon gold through the canopy, a golden-green haze
    sun: dir(248, 14),
    sunColor: 0xffb868,
    sunPower: 3.5,
    zenith: 0x5482a6,
    horizon: 0xf0c486,
    ground: 0x2a3320,
    ambient: 0.55,
    fogColor: 0xa09a6c,
    fogDensity: 0.005,
    fogFalloff: 0.04,
    fogBase: 6,
    mist: 0.02,
    mistBase: 14,
    mistFalloff: 0.18,
    scatter: 1.6,
    clouds: 0.3,
    cloudColor: 0xf0dcc0,
    stars: 0,
    exposure: 1.0,
    saturation: 1.05,
    contrast: 1.08,
    lift: 0.0,
    rays: 1.8,
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
    mist: 0.06,
    mistBase: 3.5,
    mistFalloff: 0.45,
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
    mist: 0.02,
    mistBase: 24,
    mistFalloff: 0.12,
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
    mist: 0.01,
    mistBase: 26,
    mistFalloff: 0.2,
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
    mist: 0.03,
    mistBase: 22,
    mistFalloff: 0.14,
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
  mist: 0,
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
  "mist",
  "mistBase",
  "mistFalloff",
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

export function makeMood(land: Land, world: World, detail: THREE.Texture, quality: number) {
  const cu = () => uniform(new THREE.Color()),
    fu = () => uniform(0);
  const u = {
    sunDir: uniform(new THREE.Vector3(0, 1, 0)),
    /** 1 under the open sky, 0 under the Hollow's rock */
    open: uniform(1),
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
  // the image-based light (Medium and up)
  const useEnv = quality > 0;
  let envIntensity = 0,
    envAge = 0;
  // sun power, clouds, cover and sun direction when the map was last drawn (NaN: never)
  const lastEnv = new Float32Array(6).fill(Number.NaN),
    nowEnv = new Float32Array(6);

  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  const map = [1024, 2048, 2048, 4096][quality];
  sun.shadow.mapSize.set(map, map);
  const S = quality > 2 ? 120 : 95;
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 900 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  // the shadow map is redrawn only when the box moves a few metres or the sun turns (abyssal-garden
  // draws its once); swaying leaves keep the shadow of where they were, which nobody can see
  sun.shadow.autoUpdate = false;
  const lastBox = new THREE.Vector3(1e9, 0, 0),
    lastSun = new THREE.Vector3();
  const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0.5);

  // the air seen along `d`, without clouds or the disc: a thin bright band at the horizon (the
  // exponential falloff of a real atmosphere, not a linear gradient), the horizon on the sun's
  // side warmed by it, and the forward (Mie) glow around the sun. The fog reads the same function,
  // so a far ridge fades into exactly the sky behind it.
  const air = Fn(([d]: [Node3]) => {
    const up = d.y;
    const h = max(up, 0);
    // the horizon takes the region's colour on the sun's side; away from the sun it's the zenith,
    // paled, so a blue sky and a gold horizon never meet in grey
    const flat = normalize(vec3(d.x, 0.0001, d.z)),
      sflat = normalize(vec3(u.sunDir.x, 0.0001, u.sunDir.z));
    const side = pow(dot(flat, sflat).mul(0.5).add(0.5), 1.6).mul(0.7).add(0.3);
    const pale = u.zenith
      .mul(1.35)
      .add(vec3(0.05, 0.055, 0.06))
      .add(u.horizon.mul(0.25));
    const hor = mix(pale, u.horizon, side);
    const base = mix(hor, u.zenith, float(1).sub(exp(h.mul(-3.4)))).toVar();
    // below the horizon the haze thickens toward the ground's colour
    base.assign(mix(base, mix(hor, u.ground, 0.55), smoothstep(0.0, -0.4, up)));
    const mu = dot(d, u.sunDir);
    const m = max(mu, 0);
    const band = exp(h.mul(-5));
    const warm = pow(mu.mul(0.5).add(0.5), 5).mul(band).mul(0.22);
    const mie = pow(m, 10).mul(0.16).add(pow(m, 90).mul(0.55)).add(pow(m, 900).mul(1.4));
    return base.add(u.sunColor.mul(u.sunPower.mul(0.25)).mul(warm.add(mie)));
  });

  // clouds on a plane overhead, from the shared detail texture (a few fetches, not procedural
  // noise: the sky covers half the screen on a phone too): a domain-warped fbm for the shapes,
  // lit by a second fetch offset toward the sun (dark bellies, bright tops, a silver edge where
  // they're thin against the sun), streaks of high cirrus, and both fading into the horizon's haze
  const cloudsAt = Fn(([d]: [Node3]) => {
    const up = d.y;
    const p = d.xz.div(up.add(0.11)).mul(0.5).toVar();
    const wind = vec2(time.mul(0.0016), time.mul(0.0006));
    const q = p.mul(0.16).add(wind).toVar();
    const w = texture(detail, q.mul(0.45).sub(wind.mul(0.5))).y.sub(0.5);
    q.addAssign(vec2(w, w.negate()).mul(0.12));
    const shape = Fn(([o]: [Node2]) =>
      texture(detail, q.add(o))
        .x.sub(0.5)
        .mul(2.4)
        .add(texture(detail, q.add(o).mul(3.3)).y.sub(0.5).mul(0.55))
        .add(0.5),
    );
    const n = shape(vec2(0));
    const lo = float(1).sub(u.clouds),
      dens = smoothstep(lo, lo.add(0.3), n).toVar();
    const ns = shape(u.sunDir.xz.normalize().mul(0.012));
    const lightK = exp(smoothstep(lo, lo.add(0.4), ns).mul(-2.4));
    const mu = max(dot(d, u.sunDir), 0);
    const amb = mix(u.zenith, u.horizon, 0.45).mul(0.8).add(u.ground.mul(0.15));
    const sunLit = u.sunColor.mul(u.sunPower.mul(0.32)).mul(lightK.mul(pow(mu, 3).mul(1.6).add(0.55)));
    const silver = u.sunColor
      .mul(u.sunPower.mul(0.5))
      .mul(pow(mu, 10))
      .mul(float(1).sub(dens).mul(dens).mul(4));
    const col = amb.add(sunLit).mul(u.cloudColor).add(silver).toVar();
    // cirrus: the stretched-ridge channel, long and thin, coloured by a low sun
    const ci = texture(detail, vec2(p.x.mul(0.035), p.y.mul(0.22)).add(wind.mul(2))).w;
    const cir = smoothstep(0.35, 0.9, ci).mul(0.3).mul(u.clouds.add(0.3));
    col.assign(
      mix(
        col,
        amb.mul(0.8).add(u.sunColor.mul(u.sunPower.mul(0.25)).mul(pow(mu, 2).add(0.3))),
        cir.mul(float(1).sub(dens)),
      ),
    );
    const a = dens
      .mul(0.95)
      .max(cir)
      .mul(smoothstep(0.0, 0.14, up));
    // far clouds sink into the haze
    col.assign(mix(col, air(d), smoothstep(0.3, 0.02, up).mul(0.65)));
    return vec4(col, a);
  });

  const sky = Fn(() => {
    const d = normalize(positionWorld.sub(cameraPosition)).toVar();
    const mu = max(dot(d, u.sunDir), 0);
    // the disc; at night it's the moon, mottled
    const mot = texture(detail, d.xy.mul(60)).x.sub(0.5).mul(0.5).mul(u.stars).add(1);
    const disc = u.sunColor.mul(smoothstep(0.99935, 0.99965, mu).mul(u.sunPower).mul(10)).mul(mot);
    const cl = cloudsAt(d);
    const st = hash(d.mul(380).floor().xz.add(d.mul(380).floor().y.mul(97)));
    const tw = sin(time.mul(st.mul(6).add(1)).add(st.mul(90)))
      .mul(0.3)
      .add(0.7);
    const stars = smoothstep(0.9965, 1.0, st)
      .mul(u.stars)
      .mul(tw)
      .mul(smoothstep(0.05, 0.3, d.y))
      .mul(float(1).sub(cl.w))
      .mul(2.5);
    return mix(air(d).add(disc), cl.rgb, cl.w).add(stars);
  });
  const skyMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  skyMat.colorNode = sky();
  const domeGeo = new THREE.SphereGeometry(2600, 48, 24);
  const dome = new THREE.Mesh(domeGeo, skyMat);
  dome.frustumCulled = false;
  // drawn after everything opaque, so its noise is paid only where the sky shows
  dome.renderOrder = 10;
  // the same sky in a scene of its own, for the image-based light (see main.ts)
  const skyScene = new THREE.Scene();
  skyScene.add(new THREE.Mesh(domeGeo, skyMat));

  // height fog in two layers (Quilez's analytic integral of exp(-b y)): the region's air, and a
  // thin mist that lies in the hollows in drifting patches. Near, it's the fog's own colour with
  // the sun scattered into it; far, it becomes the sky behind (aerial perspective).
  const fogNode = Fn(() => {
    const wp = positionWorld;
    const v = wp.sub(cameraPosition);
    const d = v.length();
    const rd = v.div(d);
    const ry = select(abs(rd.y).lessThan(0.0005), float(0.0005), rd.y);
    const layer = (dens: Node1, base: Node1, fall: Node1) => {
      const b = max(fall, 0.0001);
      return dens
        .mul(exp(min(base.sub(cameraPosition.y).mul(b), 2.5)))
        .mul(float(1).sub(exp(d.mul(ry).mul(b).negate())))
        .div(ry.mul(b));
    };
    const drift = vec2(time.mul(0.0045), time.mul(0.002));
    const p1 = texture(detail, wp.xz.div(310).add(drift)).x,
      p2 = texture(detail, wp.xz.div(83).sub(drift.mul(1.7))).y;
    const patch = smoothstep(0.3, 0.75, p1.add(p2.mul(0.45)).sub(0.12));
    const amount = layer(u.fogDensity, u.fogBase, u.fogFalloff)
      .mul(p1.mul(0.5).add(0.75))
      .add(layer(u.mist, u.mistBase, u.mistFalloff).mul(patch.mul(1.6).add(0.15)));
    // (plus a thin uniform haze, so a ridge a kilometre off is softened, not erased)
    const k = float(1).sub(exp(amount.add(d.mul(0.00012)).negate()));
    const mu = max(dot(rd, u.sunDir), 0);
    const near = mix(u.fogColor, u.sunColor.mul(u.scatter).mul(0.35).add(u.fogColor), pow(mu, 7));
    const col = mix(near, air(rd), smoothstep(70, 900, d).mul(u.open).mul(0.7));
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
    u.open.value = 1 - cover;
    // the sky's own light comes from the environment map (main.ts); the hemisphere keeps only the
    // bounce off the ground, and all of the ambient where there's no environment (Low)
    hemi.color.copy(u.zenith.value).lerp(u.horizon.value, 0.4);
    hemi.groundColor.copy(u.ground.value);
    hemi.intensity = cur.ambient * (useEnv ? 0.9 : 3.2);
    envIntensity = cur.ambient * 2.6 * (0.15 + 0.85 * (1 - cover));
    envAge += dt;
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

  /** True when the sky has changed enough since the environment map was drawn to draw it again. */
  function envDue() {
    if (envAge < 0.5) return false;
    // colours drift with the blend: redraw while walking between regions, and now and then for clouds
    const now = nowEnv;
    now[0] = cur.sunPower * 0.3;
    now[1] = cur.clouds;
    now[2] = cover;
    for (let i = 0; i < 3; i++) now[3 + i] = cur.sun[i] * 4;
    let drift = 0;
    for (let i = 0; i < 6; i++) drift += Math.abs(now[i] - lastEnv[i]);
    if (drift < 0.04 && envAge < 20) return false;
    envAge = 0;
    lastEnv.set(now);
    return true;
  }

  return {
    u,
    sun,
    hemi,
    dome,
    fogNode,
    update,
    /** The sky alone, for the image-based light. */
    skyScene,
    envDue,
    get envIntensity() {
      return envIntensity;
    },
  };
}

export type MoodState = ReturnType<typeof makeMood>;
