// The ground: 32 x 32 chunks of 64 m, drawn as four instanced grids (1, 2, 4 and 8 m steps) that
// the vertex shader lifts from the height texture. Every grid vertex lands on a whole metre, so it
// reads one texel exactly. Skirts hide the cracks between levels. Shading reads the ground
// textures: region weights, roads, the normal, and the shared detail noise.
import { HALF, SIZE, WATER_Y } from "@gloamline/world";
import {
  cameraPosition,
  Fn,
  float,
  fract,
  instancedDynamicBufferAttribute,
  int,
  ivec2,
  Loop,
  max,
  min,
  mix,
  normalize,
  positionLocal,
  positionWorld,
  select,
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
import type { GroundTex } from "./textures";
import type { Trails } from "./trails";

type Node1 = THREE.Node<"float">;
type Node2 = THREE.Node<"vec2">;
type Node4 = THREE.Node<"vec4">;

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
  tex: GroundTex,
  detail: THREE.Texture,
  mood: MoodState,
  quality: number,
  trails: Trails,
) {
  const group = new THREE.Group();
  // a march along the sun over the height texture, with a penumbra that widens with distance
  const far = Fn(() => {
    const L = mood.u.sunDir;
    const o = positionWorld.add(vec3(0, 0.4, 0));
    const s = float(1).toVar(),
      t = float(3).toVar();
    Loop(15, () => {
      const p = o.add(L.mul(t));
      const h = textureLoad(
        tex.height,
        ivec2(int(p.x.add(HALF).clamp(0, SIZE - 1)), int(p.z.add(HALF).clamp(0, SIZE - 1))),
      ).x;
      s.assign(min(s, p.y.sub(h).mul(7).div(t)));
      t.mulAssign(1.4);
    });
    return smoothstep(0, 1, s);
  })();
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
    const shade = groundShade(tex, detail, mood, trails);
    m.colorNode = shade.color;
    m.normalNode = shade.normal;
    m.roughnessNode = shade.rough;
    // under the trees the ground sees less sky; past the shadow map's box, the canopy stands in for
    // the leaves' own shadows
    const canopy = texture(tex.canopy, positionWorld.xz.add(HALF).div(SIZE)).x;
    m.aoNode = shade.ao.mul(float(1).sub(canopy.mul(0.65)));
    m.metalnessNode = float(0);
    const beyond = smoothstep(75, 105, positionWorld.sub(cameraPosition).length());
    const dapple = float(1).sub(canopy.mul(beyond).mul(0.8));
    // long shadows past the shadow map's box: hills and ridges shading the land beyond them
    // (inside the box the shadow map has it, and a 1 m heightmap would only add stair-steps)
    const longShadow = quality > 1 ? mix(float(1), far, beyond) : float(1);
    m.receivedShadowNode = Fn(([s]: [THREE.Node<"float">]) => s.mul(dapple).mul(longShadow)) as never;
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
export function groundShade(tex: GroundTex, detail: THREE.Texture, mood: MoodState, trails?: Trails) {
  const wp = positionWorld;
  const uv = wp.xz.add(HALF + 0.5).div(SIZE);
  const g0 = texture(tex.ground0, uv),
    g1 = texture(tex.ground1, uv),
    W = texture(tex.wear, uv);
  // the rain's marks: stream beds where water gathered, fans of silt where it slowed, bare
  // ground where it carried the soil off (world: erosion.ts)
  const channel = smoothstep(0.45, 0.85, W.x).toVar(),
    silt = smoothstep(0.04, 0.35, W.y),
    carved = smoothstep(0.08, 0.5, W.z);
  const nx = g1.z.mul(2).sub(1),
    nz = g1.w.mul(2).sub(1);
  const macro = vec3(nx, sqrt(max(float(1).sub(nx.mul(nx)).sub(nz.mul(nz)), 0.01)), nz);
  // the shared detail noise at four scales; the two middle ones are fetched twice, the second turned
  // and shifted, and blended by a slower noise, so no tile ever repeats on the ground
  const rot = (v: Node2) => vec2(v.x.mul(0.825).sub(v.y.mul(0.565)), v.x.mul(0.565).add(v.y.mul(0.825)));
  const A = texture(detail, wp.xz.div(41));
  const s1 = wp.xz.div(9.3),
    s2 = wp.xz.div(2.3);
  const B0 = texture(detail, s1),
    C0 = texture(detail, s2);
  const B = mix(B0, texture(detail, rot(wp.xz).div(9.3).add(0.37)), smoothstep(0.42, 0.58, A.y));
  const C = mix(C0, texture(detail, rot(wp.xz).div(2.3).add(0.61)), smoothstep(0.4, 0.6, B.y));
  // grain and gravel, about 7 cm: fades with its own mips
  const s3 = rot(rot(wp.xz)).div(0.83);
  const D = texture(detail, s3);
  const grain = C.y.mul(0.5).add(0.75).mul(D.y.mul(0.45).add(0.78));
  // steepness: rock shows through
  const steep = smoothstep(0.84, 0.66, macro.y);
  const rockW = max(g1.x, steep).add(carved.mul(smoothstep(0.95, 0.8, macro.y)).mul(0.45));
  const field = fieldTint(wp.xz, g0, detail, false);
  // region albedos (linear). Gloamwood: moss, and leaf litter speckled brown, rust and old gold
  const hue = fract(C.y.mul(7.3).add(D.x.mul(2.1)));
  const litter = mix(
    mix(vec3(0.065, 0.042, 0.026), vec3(0.12, 0.058, 0.022), smoothstep(0.25, 0.5, hue)),
    vec3(0.13, 0.1, 0.038),
    smoothstep(0.62, 0.9, hue),
  );
  const forest = mix(
    mix(vec3(0.03, 0.048, 0.017), field.mul(0.8), B.y),
    litter,
    smoothstep(0.48, 0.68, A.x.add(B.y.mul(0.35)).add(D.x.sub(0.5).mul(0.2))),
  ).mul(grain);
  // the mire: peat and algae, black where it's wet
  const wet = smoothstep(WATER_Y + 1.2, WATER_Y - 0.2, wp.y);
  const mire = mix(
    mix(vec3(0.045, 0.039, 0.027), vec3(0.034, 0.05, 0.021), smoothstep(0.45, 0.65, B.y)),
    vec3(0.018, 0.02, 0.014),
    wet,
  ).mul(grain);
  // the keep: ash, straw and soot
  const keep = mix(
    mix(vec3(0.07, 0.065, 0.06), vec3(0.13, 0.105, 0.065), smoothstep(0.5, 0.66, A.x.add(C.y.mul(0.2)))),
    vec3(0.03, 0.028, 0.027),
    smoothstep(0.62, 0.75, B.w)
      .mul(0.6)
      .mul(smoothstep(0.85, 0.95, macro.y)),
  ).mul(grain);
  // the highlands: the meadow's own patches of green, straw and heather, thin soil between
  const high = mix(field, vec3(0.1, 0.085, 0.06), smoothstep(0.55, 0.8, C.x.add(D.y.mul(0.3)).sub(0.15))).mul(
    grain,
  );
  // rock, projected three ways so cliffs aren't smeared: strata run level along the faces
  const tw0 = macro.abs().pow(vec3(4));
  const tw = tw0.div(tw0.x.add(tw0.y).add(tw0.z));
  const RX = texture(detail, vec2(wp.y, wp.z).div(13)),
    RZ = texture(detail, vec2(wp.y, wp.x).div(13));
  const RX2 = texture(detail, wp.zy.div(3.1)),
    RZ2 = texture(detail, wp.xy.div(3.1));
  const rn = RX.x.mul(tw.x).add(RZ.x.mul(tw.z)).add(B.x.mul(tw.y));
  const rs = RX.w.mul(tw.x).add(RZ.w.mul(tw.z)).add(A.w.mul(tw.y));
  const rf = RX2.y.mul(tw.x).add(RZ2.y.mul(tw.z)).add(C.y.mul(tw.y));
  // strata only on faces: flat rock is scree, not stripes
  const strata = smoothstep(0.25, 0.75, rs.add(wp.y.mul(0.11).sin().mul(0.2))).mul(
    smoothstep(0.8, 0.4, tw.y),
  );
  // lichen in pale green and rust on the faces that see the sky
  const rcell = RX2.z.mul(tw.x).add(RZ2.z.mul(tw.z)).add(D.z.mul(tw.y));
  const lichen = smoothstep(0.55, 0.8, rcell.mul(0.6).add(rf.mul(0.6)).sub(0.1))
    .mul(smoothstep(-0.2, 0.6, macro.y))
    .mul(smoothstep(0.45, 0.6, A.y));
  // the winter's snow on everything that faces the sky (mood.ts), and the peaks' own above 225 m
  const snow = smoothstep(225, 265, wp.y.add(A.x.mul(45)).add(B.x.mul(10)))
    .mul(smoothstep(0.55, 0.8, macro.y.add(B.y.mul(0.15))))
    .max(mood.snowOn(macro.y.add(B.y.sub(0.5).mul(0.12)), wp))
    .toVar();
  const rock = mix(
    mix(
      mix(vec3(0.14, 0.13, 0.115), vec3(0.05, 0.047, 0.045), strata)
        .mul(rn.mul(0.8).add(0.55))
        .mul(rf.mul(0.6).add(0.7)),
      mix(vec3(0.15, 0.16, 0.09), vec3(0.2, 0.1, 0.04), smoothstep(0.4, 0.7, A.x)),
      lichen.mul(0.55),
    ),
    vec3(0.62, 0.66, 0.72).mul(C.x.mul(0.2).add(0.85)),
    snow,
  );
  // packed dirt with gravel and the odd larger stone pressed in
  const road = mix(
    vec3(0.11, 0.084, 0.058),
    vec3(0.165, 0.145, 0.115),
    smoothstep(0.72, 0.92, C.z).mul(0.6),
  ).mul(B.x.mul(0.4).add(0.75).mul(grain));
  const sum = max(g0.x.add(g0.y).add(g0.z).add(g0.w), 0.001);
  const regional = forest.mul(g0.x).add(mire.mul(g0.y)).add(keep.mul(g0.z)).add(high.mul(g0.w)).div(sum);
  // height-blend: rock wins where its detail is high, so the edge is ragged, not a smear
  const rk = smoothstep(0.35, 0.65, rockW.add(B.x.sub(0.5).mul(0.5)));
  const rd = smoothstep(0.3, 0.6, g1.y.add(C.y.sub(0.5).mul(0.3)));
  // loose stones: gravel on the roads, a scatter on dry ground, none in the mire
  // (stream beds are cobbled: the water took the soil and left the stones)
  const pebDens = mix(
    g0.x.mul(0.12).add(g0.z.mul(0.4)).add(g0.w.mul(0.18)).div(sum),
    float(0.75),
    rd.max(rk.mul(0.5)).max(channel.mul(0.85)).max(silt.mul(0.35)),
  ).mul(float(1).sub(wet));
  // two sizes of stone from the stone texture, each kept where its own random is under the density,
  // which drifts with a slow noise so they gather in drifts rather than spread evenly
  // (stones lie on ground that's near level: on a cliff they'd be smears)
  const pebArea = pebDens
    .mul(smoothstep(0.3, 0.7, C.x.mul(0.6).add(B.w.mul(0.4))))
    .mul(smoothstep(0.88, 0.96, macro.y))
    .toVar();
  const t1 = rot(wp.xz).div(1.6),
    t2 = wp.xz.div(4.3).add(0.5);
  const S1 = texture(tex.stones, t1),
    S2 = texture(tex.stones, t2);
  const k1 = smoothstep(pebArea.add(0.03), pebArea.sub(0.03), S1.y),
    k2 = smoothstep(pebArea.mul(0.4).add(0.03), pebArea.mul(0.4).sub(0.03), S2.y);
  const ph = max(S1.x.mul(k1), S2.x.mul(k2).mul(1.4)).toVar();
  const peb = smoothstep(0.02, 0.25, ph).toVar();
  const pebble = mix(
    vec3(0.16, 0.15, 0.135),
    vec3(0.11, 0.1, 0.09),
    select(S2.x.mul(k2).greaterThan(S1.x.mul(k1)), S2.z, S1.z),
  )
    .mul(ph.mul(0.4).add(0.7))
    .mul(D.y.mul(0.3).add(0.85));
  // cloud shadows sliding over the land, along the sun
  const cs = texture(
    detail,
    wp.xz
      .sub(mood.u.sunDir.xz.mul(wp.y.div(mood.u.sunDir.y.max(0.1))))
      .div(1400)
      .add(vec2(time.mul(0.0035), time.mul(0.0012))),
  );
  const shade = mix(float(1), float(0.45), smoothstep(0.5, 0.62, cs.x).mul(mood.u.clouds));
  // silt is pale and fine, a stream bed dark and damp
  const ground = mix(
    mix(regional, vec3(0.13, 0.115, 0.088).mul(grain), silt.mul(float(1).sub(rk)).mul(0.7)),
    regional.mul(0.55),
    channel.mul(0.6),
  );
  // snow: wind-packed, a little darker in the drifts' lee; on the roads it's trodden to grey slush
  // with the soil showing in the ruts; stones and the odd tussock break through where it's thin
  const drift = A.y.mul(0.5).add(C.x.mul(0.3)).add(0.55);
  const fresh = mood.SNOW.mul(drift.mul(0.12).add(0.9));
  const slush = mix(
    vec3(0.3, 0.31, 0.32),
    vec3(0.075, 0.064, 0.05),
    smoothstep(0.45, 0.7, C.z.add(B.y.mul(0.4))),
  );
  // (a stone under the snow is a white bump, not a hole: only the biggest show their tops)
  const cover = snow
    .mul(float(1).sub(peb.mul(0.3).mul(float(1).sub(rd))))
    .mul(float(1).sub(channel.mul(0.5)))
    .toVar();
  // trails (trails.ts): a trench about 25 cm deep at its deepest, its floor packed and in shadow, its
  // walls lit by the slope, a rim of snow pushed up beside it. Only where the snow lies.
  let trail: Node1 = float(0),
    rim: Node1 = float(0),
    trailN: THREE.Node<"vec3"> = vec3(0, 0, 0);
  if (trails) {
    const tuv = wp.xz.sub(trails.origin).div(trails.span);
    const edge = smoothstep(0, 0.05, tuv.x)
      .mul(smoothstep(1, 0.95, tuv.x))
      .mul(smoothstep(0, 0.05, tuv.y))
      .mul(smoothstep(1, 0.95, tuv.y));
    const te = 1 / 512;
    const T = (dx: number, dz: number) => texture(trails.texture, tuv.add(vec2(dx * te, dz * te))).r;
    const d0 = T(0, 0);
    const k = cover.mul(edge).toVar();
    trail = d0.mul(k);
    rim = T(3, 0).add(T(-3, 0)).add(T(0, 3)).add(T(0, -3)).mul(0.25).sub(d0).max(0).mul(k);
    // depth 0.3 m over two texels (2 x 9.4 cm): the slope of the trench's walls, a little steeper
    // than true so it reads from a standing eye
    trailN = vec3(T(1, 0).sub(T(-1, 0)), 0, T(0, 1).sub(T(0, -1))).mul(k.mul(2.6));
  }
  const albedo = mix(
    mix(
      mix(mix(ground, rock, rk), road, rd.mul(float(1).sub(rk.mul(0.7)))),
      pebble.mul(channel.mul(-0.35).add(1)),
      peb,
    ),
    mix(fresh, slush, rd.mul(float(1).sub(rk)))
      .mul(mix(vec3(1, 1, 1), vec3(0.48, 0.53, 0.64), trail))
      .mul(rim.mul(0.4).add(1)),
    cover,
  ).mul(shade);
  // detail normal: the ground's slope from the top projection, the rock's from the side ones
  const e = 1 / 512;
  // (gradients of the plain fetches: the blended ones would differ by the blend, not the slope)
  const dB = vec2(
    texture(detail, s1.add(vec2(e, 0))).x.sub(B0.x),
    texture(detail, s1.add(vec2(0, e))).x.sub(B0.x),
  );
  const dC = vec2(
    texture(detail, s2.add(vec2(e, 0))).x.sub(C0.x),
    texture(detail, s2.add(vec2(0, e))).x.sub(C0.x),
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
  // each stone rounded up out of the soil
  // (the stone texture is laid turned: turn its slope back into world x and z)
  const dS = vec2(
    texture(tex.stones, t1.add(vec2(e, 0))).x.sub(S1.x),
    texture(tex.stones, t1.add(vec2(0, e))).x.sub(S1.x),
  ).mul(k1.mul(14));
  const dD = vec2(dS.x.mul(0.825).add(dS.y.mul(0.565)), dS.y.mul(0.825).sub(dS.x.mul(0.565)));
  // under snow the grain is buried: only the drifts' long ripples remain
  const n = normalize(
    macro
      .add(
        vec3(bump.x.add(dD.x).negate(), 0, bump.y.add(dD.y).negate())
          .mul(tw.y.mul(0.7).add(0.3))
          .mul(float(1).sub(cover.mul(0.8))),
      )
      .add(side.mul(float(1).sub(cover)))
      .add(vec3(dB.x.negate(), 0, dB.y.negate()).mul(cover.mul(2.5)))
      .add(trailN),
  );
  const rough = mix(
    mix(
      mix(mix(float(0.95), float(0.85), rk), float(0.78), peb),
      float(0.25),
      wet.mul(g0.y).max(channel.mul(0.45)),
    ),
    // packed snow in the trails has a little sheen
    mix(float(0.62), float(0.4), rd.max(trail)),
    cover,
  );
  // soil settles dark in the gaps between stones and under the litter
  const ao = float(1)
    .sub(
      float(1)
        .sub(smoothstep(0.0, 0.3, ph))
        .mul(pebArea)
        .mul(0.5)
        .mul(float(1).sub(cover)),
    )
    .mul(mix(C.y.mul(0.3).add(0.75), float(1), cover.mul(0.7)))
    .mul(float(1).sub(trail.mul(0.35)));
  return { color: albedo, normal: transformNormalToView(n), rough, ao };
}

/**
 * The colour a field takes at `xz`: lush green, straw and heather in drifting patches in the
 * highlands, gold-green under the oaks. The ground under the grass and the blades both read it, so
 * the field doesn't change colour where the blades end. `level`: sample mip 0 (vertex stage).
 */
export function fieldTint(xz: Node2, g0: Node4, detail: THREE.Texture, level: boolean) {
  const at = (uv: Node2) => (level ? texture(detail, uv).level(float(0)) : texture(detail, uv));
  const P = at(xz.div(173).add(0.21)),
    Q = at(xz.div(37).add(0.63));
  const dry = smoothstep(0.38, 0.66, P.x.add(Q.y.mul(0.35)).sub(0.12));
  const heather = smoothstep(0.6, 0.74, P.y.add(Q.x.mul(0.1))).mul(0.55);
  // last summer's grass, dead: pale straw, rust and grey-brown in drifting patches
  const high = mix(
    mix(vec3(0.15, 0.118, 0.062), vec3(0.135, 0.07, 0.035), dry),
    vec3(0.085, 0.07, 0.058),
    heather,
  );
  const wood = mix(vec3(0.075, 0.055, 0.032), vec3(0.125, 0.092, 0.045), dry.mul(0.7));
  const mire = mix(vec3(0.12, 0.1, 0.058), vec3(0.16, 0.128, 0.068), dry);
  const keep = mix(vec3(0.1, 0.085, 0.06), vec3(0.14, 0.11, 0.06), dry);
  const sum = max(g0.x.add(g0.y).add(g0.z).add(g0.w), 0.001);
  return wood.mul(g0.x).add(mire.mul(g0.y)).add(keep.mul(g0.z)).add(high.mul(g0.w)).div(sum);
}
