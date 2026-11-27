// The ground: 32 x 32 chunks of 64 m, drawn as four instanced grids (1, 2, 4 and 8 m steps) that
// the vertex shader lifts from the height texture. Every grid vertex lands on a whole metre, so it
// reads one texel exactly. Skirts hide the cracks between levels. Shading reads the ground
// textures: region weights, roads, the normal, and the shared detail noise.
import { HALF, SIZE, WATER_Y } from "@gloamline/world";
import {
  Fn,
  float,
  instancedDynamicBufferAttribute,
  int,
  ivec2,
  max,
  mix,
  normalize,
  positionLocal,
  positionWorld,
  smoothstep,
  sqrt,
  texture,
  textureLoad,
  time,
  transformNormalToView,
  vec2,
  vec3,
} from "three/tsl";
import * as THREE from "three/webgpu";
import type { MoodState } from "./mood";

const CHUNK = 64,
  N = SIZE / CHUNK;
const LODS = [
  { seg: 64, far: 130 },
  { seg: 32, far: 330 },
  { seg: 16, far: 720 },
  { seg: 8, far: Infinity },
];

function grid(seg: number) {
  const s = CHUNK / seg,
    pos: number[] = [],
    idx: number[] = [];
  const v = (x: number, z: number, skirt: number) => pos.push(x, skirt, z) / 3 - 1;
  for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) v(i * s, j * s, 0);
  const at = (i: number, j: number) => j * (seg + 1) + i;
  for (let j = 0; j < seg; j++)
    for (let i = 0; i < seg; i++) {
      const a = at(i, j),
        b = at(i + 1, j),
        c = at(i, j + 1),
        d = at(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
  // skirts: each border edge drops a strip down
  const ring: number[] = [];
  for (let i = 0; i < seg; i++) ring.push(at(i, 0));
  for (let j = 0; j < seg; j++) ring.push(at(seg, j));
  for (let i = seg; i > 0; i--) ring.push(at(i, seg));
  for (let j = seg; j > 0; j--) ring.push(at(0, j));
  const low = ring.map((k) => v(pos[k * 3], pos[k * 3 + 2], 1));
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k],
      b = ring[(k + 1) % ring.length],
      c = low[k],
      d = low[(k + 1) % ring.length];
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(
      new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  g.setIndex(idx);
  return g;
}

export function makeTerrain(
  tex: { height: THREE.DataTexture; ground0: THREE.DataTexture; ground1: THREE.DataTexture },
  detail: THREE.Texture,
  mood: MoodState,
) {
  const group = new THREE.Group();
  // per chunk: min and max height, for culling
  const hmin = new Float32Array(N * N),
    hmax = new Float32Array(N * N);
  const H = tex.height.image.data as Float32Array;
  for (let cz = 0; cz < N; cz++)
    for (let cx = 0; cx < N; cx++) {
      let lo = Infinity,
        hi = -Infinity;
      for (let j = 0; j <= CHUNK; j += 2)
        for (let i = 0; i <= CHUNK; i += 2) {
          const h = H[Math.min(cz * CHUNK + j, SIZE - 1) * SIZE + Math.min(cx * CHUNK + i, SIZE - 1)];
          if (h < lo) lo = h;
          if (h > hi) hi = h;
        }
      hmin[cz * N + cx] = lo - 6;
      hmax[cz * N + cx] = hi + 1;
    }

  const levels = LODS.map((lod) => {
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(N * N * 2), 2);
    attr.setUsage(THREE.DynamicDrawUsage);
    const geo = grid(lod.seg);
    const mat = material(attr, CHUNK / lod.seg);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return { lod, attr, mesh };
  });

  function material(attr: THREE.InstancedBufferAttribute, step: number) {
    const m = new THREE.MeshStandardNodeMaterial();
    const off = instancedDynamicBufferAttribute(attr, "vec2") as unknown as ReturnType<typeof vec2>;
    m.positionNode = Fn(() => {
      const wx = off.x.add(positionLocal.x),
        wz = off.y.add(positionLocal.z);
      const ij = ivec2(int(wx.add(HALF).clamp(0, SIZE - 1)), int(wz.add(HALF).clamp(0, SIZE - 1)));
      const h = textureLoad(tex.height, ij).x;
      return vec3(wx, h.sub(positionLocal.y.mul(step * 3 + 2)), wz);
    })();
    const shade = groundShade(tex, detail, mood);
    m.colorNode = shade.color;
    m.normalNode = shade.normal;
    m.roughnessNode = shade.rough;
    m.metalnessNode = float(0);
    return m;
  }

  const frustum = new THREE.Frustum(),
    mat4 = new THREE.Matrix4(),
    box = new THREE.Box3();
  function update(camera: THREE.PerspectiveCamera) {
    mat4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(mat4);
    const counts = [0, 0, 0, 0];
    const cx0 = camera.position.x,
      cz0 = camera.position.z;
    for (let cz = 0; cz < N; cz++)
      for (let cx = 0; cx < N; cx++) {
        const x0 = cx * CHUNK - HALF,
          z0 = cz * CHUNK - HALF,
          k = cz * N + cx;
        const dx = Math.max(x0 - cx0, 0, cx0 - (x0 + CHUNK)),
          dz = Math.max(z0 - cz0, 0, cz0 - (z0 + CHUNK));
        const d = Math.hypot(dx, dz);
        box.min.set(x0, hmin[k], z0);
        box.max.set(x0 + CHUNK, hmax[k], z0 + CHUNK);
        // near chunks stay for the shadow pass even when out of view
        if (d > 110 && !frustum.intersectsBox(box)) continue;
        let l = 0;
        while (d > LODS[l].far) l++;
        const L = levels[l],
          a = L.attr.array as Float32Array,
          n = counts[l]++;
        a[n * 2] = x0;
        a[n * 2 + 1] = z0;
      }
    levels.forEach((L, i) => {
      L.mesh.count = counts[i];
      L.attr.needsUpdate = true;
    });
  }
  return { group, update };
}

/** Albedo, normal (view space) and roughness of the ground at positionWorld. */
export function groundShade(
  tex: { ground0: THREE.Texture; ground1: THREE.Texture },
  detail: THREE.Texture,
  mood: MoodState,
) {
  const wp = positionWorld;
  const uv = wp.xz.add(HALF + 0.5).div(SIZE);
  const g0 = texture(tex.ground0, uv),
    g1 = texture(tex.ground1, uv);
  const nx = g1.z.mul(2).sub(1),
    nz = g1.w.mul(2).sub(1);
  const macro = vec3(nx, sqrt(max(float(1).sub(nx.mul(nx)).sub(nz.mul(nz)), 0.01)), nz);
  const A = texture(detail, wp.xz.div(41)),
    B = texture(detail, wp.xz.div(9.3)),
    C = texture(detail, wp.xz.div(2.3));
  // steepness: rock shows through
  const steep = smoothstep(0.84, 0.66, macro.y);
  const rockW = max(g1.x, steep);
  // region albedos (linear): moss and leaf litter, mud, ash and straw, dry grass
  const forest = mix(
    mix(vec3(0.035, 0.05, 0.02), vec3(0.06, 0.072, 0.028), B.y),
    mix(vec3(0.06, 0.047, 0.032), vec3(0.085, 0.066, 0.038), C.y),
    smoothstep(0.52, 0.72, A.x.add(B.y.mul(0.35))),
  ).mul(C.x.mul(0.5).add(0.75));
  const wet = smoothstep(WATER_Y + 1.2, WATER_Y - 0.2, wp.y);
  const mire = mix(vec3(0.045, 0.043, 0.03), vec3(0.05, 0.062, 0.03), B.y).mul(
    mix(float(1), float(0.45), wet),
  );
  const keep = mix(
    vec3(0.07, 0.065, 0.06),
    vec3(0.13, 0.105, 0.065),
    smoothstep(0.5, 0.66, A.x.add(C.y.mul(0.2))),
  ).mul(C.x.mul(0.5).add(0.75));
  const high = mix(
    vec3(0.15, 0.135, 0.07),
    vec3(0.075, 0.095, 0.04),
    smoothstep(0.35, 0.7, A.y.add(B.x.mul(0.3))),
  ).mul(C.x.mul(0.5).add(0.75));
  // rock, projected three ways so cliffs aren't smeared: strata run level along the faces
  const tw = macro.abs().pow(vec3(4)).toVar();
  tw.divAssign(tw.x.add(tw.y).add(tw.z));
  const RX = texture(detail, vec2(wp.y, wp.z).div(13)),
    RZ = texture(detail, vec2(wp.y, wp.x).div(13));
  const RX2 = texture(detail, wp.zy.div(3.1)),
    RZ2 = texture(detail, wp.xy.div(3.1));
  const rn = RX.x.mul(tw.x).add(RZ.x.mul(tw.z)).add(B.x.mul(tw.y));
  const rs = RX.w.mul(tw.x).add(RZ.w.mul(tw.z)).add(A.w.mul(tw.y));
  const rf = RX2.y.mul(tw.x).add(RZ2.y.mul(tw.z)).add(C.y.mul(tw.y));
  const strata = smoothstep(0.25, 0.75, rs.add(wp.y.mul(0.11).sin().mul(0.2)));
  const snow = smoothstep(235, 275, wp.y.add(A.x.mul(40))).mul(smoothstep(0.6, 0.85, macro.y));
  const rock = mix(
    mix(vec3(0.13, 0.122, 0.11), vec3(0.045, 0.043, 0.042), strata)
      .mul(rn.mul(1.1).add(0.35))
      .mul(rf.mul(0.6).add(0.7)),
    vec3(0.75, 0.78, 0.82),
    snow,
  );
  const road = mix(vec3(0.12, 0.09, 0.06), vec3(0.17, 0.15, 0.12), smoothstep(0.72, 0.92, C.z).mul(0.5)).mul(
    B.x.mul(0.4).add(0.75),
  );
  const sum = max(g0.x.add(g0.y).add(g0.z).add(g0.w), 0.001);
  const regional = forest.mul(g0.x).add(mire.mul(g0.y)).add(keep.mul(g0.z)).add(high.mul(g0.w)).div(sum);
  // height-blend: rock wins where its detail is high, so the edge is ragged, not a smear
  const rk = smoothstep(0.35, 0.65, rockW.add(B.x.sub(0.5).mul(0.5)));
  const rd = smoothstep(0.3, 0.6, g1.y.add(C.y.sub(0.5).mul(0.3)));
  // cloud shadows sliding over the land, along the sun
  const cs = texture(
    detail,
    wp.xz
      .sub(mood.u.sunDir.xz.mul(wp.y.div(mood.u.sunDir.y.max(0.1))))
      .div(1400)
      .add(vec2(time.mul(0.0035), time.mul(0.0012))),
  );
  const shade = mix(float(1), float(0.45), smoothstep(0.5, 0.62, cs.x).mul(mood.u.clouds));
  const albedo = mix(mix(regional, rock, rk), road, rd.mul(float(1).sub(rk.mul(0.7)))).mul(shade);
  // detail normal: the ground's slope from the top projection, the rock's from the side ones
  const e = 1 / 512;
  const s1 = wp.xz.div(9.3),
    s2 = wp.xz.div(2.3);
  const dB = vec2(
    texture(detail, s1.add(vec2(e, 0))).x.sub(B.x),
    texture(detail, s1.add(vec2(0, e))).x.sub(B.x),
  );
  const dC = vec2(
    texture(detail, s2.add(vec2(e, 0))).x.sub(C.x),
    texture(detail, s2.add(vec2(0, e))).x.sub(C.x),
  );
  const bump = dB.mul(mix(float(6), float(12), rk)).add(dC.mul(mix(float(3), float(7), rk.max(rd))));
  const sx = vec2(wp.y, wp.z).div(13),
    sz = vec2(wp.y, wp.x).div(13);
  const gX = vec2(
    texture(detail, sx.add(vec2(e, 0))).x.sub(RX.x),
    texture(detail, sx.add(vec2(0, e))).x.sub(RX.x),
  ).mul(36);
  const gZ = vec2(
    texture(detail, sz.add(vec2(e, 0))).x.sub(RZ.x),
    texture(detail, sz.add(vec2(0, e))).x.sub(RZ.x),
  ).mul(36);
  const side = vec3(
    gZ.y.negate().mul(tw.z),
    gX.x.negate().mul(tw.x).sub(gZ.x.mul(tw.z)),
    gX.y.negate().mul(tw.x),
  ).mul(rk);
  const n = normalize(
    macro.add(vec3(bump.x.negate(), 0, bump.y.negate()).mul(tw.y.mul(0.7).add(0.3))).add(side),
  );
  const rough = mix(mix(float(0.93), float(0.85), rk), float(0.28), wet.mul(g0.y));
  return { color: albedo, normal: transformNormalToView(n), rough };
}
