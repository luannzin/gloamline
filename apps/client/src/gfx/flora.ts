// Everything that stands on the ground, drawn as instanced fields. Each frame a field keeps only the
// instances in view (plus everything near enough to cast a shadow into view), splits them into near
// and far detail, and uploads that list. Wind bends each shape by its `sway`.
import { HALF, type Kind, SIZE, type World } from "@gloamline/world";
import {
  attribute,
  cameraPosition,
  color,
  cos,
  dot,
  Fn,
  float,
  hash,
  instancedDynamicBufferAttribute,
  max,
  mix,
  normalize,
  normalLocal,
  positionLocal,
  positionWorld,
  pow,
  sin,
  smoothstep,
  texture,
  time,
  transformNormalToView,
  uv,
  vec2,
  vec3,
} from "three/tsl";
import * as THREE from "three/webgpu";
import type { MoodState } from "./mood";
import * as S from "./shapes";

type Node3 = ReturnType<typeof vec3>;
type Tex = { ground0: THREE.Texture; detail: THREE.Texture; atlas: THREE.Texture };

/** Instance attributes for one (variant, detail) pair, and the TSL that places a vertex with them. */
function slot(n: number) {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const b = new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage);
  const inst = instancedDynamicBufferAttribute(a, "vec4") as unknown as ReturnType<typeof vec3> & {
    w: Node3["x"];
  };
  const sc = instancedDynamicBufferAttribute(b, "float") as unknown as Node3["x"];
  return { a, b, inst, sc, count: 0 };
}
type Slot = ReturnType<typeof slot>;

function placed(s: Slot, wind: number, flutter: number) {
  const { inst, sc } = s;
  const c = cos(inst.w),
    sn = sin(inst.w);
  const position = Fn(() => {
    const lp = positionLocal.mul(sc).toVar();
    if (wind > 0) {
      const sw = attribute("sway", "float");
      const ph = inst.x.mul(0.071).add(inst.z.mul(0.053));
      const gust = sin(time.mul(0.8).add(ph))
        .mul(0.6)
        .add(sin(time.mul(2.1).add(ph.mul(1.7))).mul(0.25))
        .add(0.35);
      const bend = vec2(0.8, 0.6).mul(gust).mul(sw.mul(sw)).mul(wind);
      lp.x.addAssign(bend.x);
      lp.z.addAssign(bend.y);
      if (flutter > 0)
        lp.y.addAssign(
          sin(time.mul(6.5).add(lp.x.mul(3)).add(lp.z.mul(2.3)).add(ph))
            .mul(flutter)
            .mul(sw),
        );
    }
    return vec3(c.mul(lp.x).add(sn.mul(lp.z)), lp.y, sn.negate().mul(lp.x).add(c.mul(lp.z))).add(inst.xyz);
  })();
  const nl = normalLocal;
  const normal = transformNormalToView(
    vec3(c.mul(nl.x).add(sn.mul(nl.z)), nl.y, sn.negate().mul(nl.x).add(c.mul(nl.z))),
  );
  return { position, normal, seed: hash(inst.x.mul(0.37).add(inst.z.mul(1.71))) };
}

function barkMat(s: Slot, t: Tex, tint: number, wind: number, moss: number) {
  const m = new THREE.MeshStandardNodeMaterial();
  const P = placed(s, wind, 0);
  m.positionNode = P.position;
  m.normalNode = P.normal;
  const d = texture(t.detail, uv().mul(vec2(1, 0.35)));
  const d2 = texture(t.detail, uv().mul(vec2(2, 1.1)).add(0.3));
  const base = color(tint).mul(d.w.mul(0.7).add(0.45)).mul(d2.x.mul(0.5).add(0.75));
  const up = smoothstep(0.1, 0.8, normalLocal.y.add(d2.y.mul(0.5)));
  const low = smoothstep(4, 0.5, positionLocal.y);
  m.colorNode = mix(base, vec3(0.05, 0.085, 0.025).mul(d2.x.add(0.6)), max(up, low).mul(moss));
  m.roughnessNode = float(0.92);
  return m;
}

function leafMat(s: Slot, t: Tex, mood: MoodState, colA: number, colB: number, wind: number) {
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.42 });
  const P = placed(s, wind, 0.05);
  m.positionNode = P.position;
  m.normalNode = P.normal;
  const tx = texture(t.atlas, uv());
  const tint = mix(color(colA), color(colB), P.seed);
  const albedo = tx.rgb.mul(tint).mul(2.2);
  m.colorNode = albedo;
  m.opacityNode = tx.a;
  // light through the leaves when looking toward the sun
  const v = normalize(positionWorld.sub(cameraPosition));
  const back = pow(max(dot(v, mood.u.sunDir), 0), 3);
  m.emissiveNode = albedo.mul(mood.u.sunColor).mul(back.mul(mood.u.sunPower).mul(0.12));
  m.roughnessNode = float(0.75);
  return m;
}

/** Reeds: no texture, a green-to-straw blade; uv.x past 0.05 marks a cattail head. */
function bladeMat(s: Slot, mood: MoodState) {
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide });
  const P = placed(s, 0.25, 0.02);
  m.positionNode = P.position;
  m.normalNode = P.normal;
  const sw = attribute("sway", "float");
  const blade = mix(vec3(0.05, 0.07, 0.025), mix(vec3(0.22, 0.2, 0.09), vec3(0.16, 0.17, 0.07), P.seed), sw);
  m.colorNode = mix(blade, vec3(0.09, 0.05, 0.025), smoothstep(0.05, 0.055, uv().x));
  const v = normalize(positionWorld.sub(cameraPosition));
  m.emissiveNode = blade.mul(mood.u.sunColor).mul(
    pow(max(dot(v, mood.u.sunDir), 0), 4)
      .mul(mood.u.sunPower)
      .mul(0.1),
  );
  m.roughnessNode = float(0.7);
  return m;
}

function stoneMat(s: Slot, t: Tex, tint: number, mossy: boolean) {
  const m = new THREE.MeshStandardNodeMaterial();
  const P = placed(s, 0, 0);
  m.positionNode = P.position;
  m.normalNode = P.normal;
  const wp = positionWorld;
  const a = texture(t.detail, wp.xz.mul(0.31)),
    b = texture(t.detail, wp.xy.mul(0.47).add(0.2)),
    c = texture(t.detail, wp.zy.mul(0.47).add(0.6));
  const n = a.x.add(b.y).add(c.x).div(3);
  const base = color(tint).mul(n.mul(0.9).add(0.55)).mul(P.seed.mul(0.3).add(0.85));
  if (!mossy) {
    m.colorNode = base;
    m.roughnessNode = float(0.88);
    return m;
  }
  const g0 = texture(t.ground0, wp.xz.add(HALF + 0.5).div(SIZE));
  const wet = g0.x.add(g0.y);
  const top = smoothstep(0.35, 0.85, normalLocal.y.add(a.y.sub(0.5).mul(0.6)));
  m.colorNode = mix(base, vec3(0.045, 0.075, 0.025).mul(a.x.add(0.5)), top.mul(wet.mul(0.9).add(0.15)));
  m.roughnessNode = float(0.9);
  return m;
}

function shroomMat(s: Slot, mood: MoodState) {
  const m = new THREE.MeshStandardNodeMaterial();
  const P = placed(s, 0, 0);
  m.positionNode = P.position;
  m.normalNode = P.normal;
  const cap = uv().x;
  const hue = mix(vec3(0.15, 0.95, 0.85), vec3(0.45, 0.55, 1.0), P.seed);
  const pulse = sin(time.mul(0.7).add(P.seed.mul(40)))
    .mul(0.25)
    .add(0.85);
  m.colorNode = mix(vec3(0.5, 0.48, 0.42), hue.mul(0.3), cap);
  // brighter in the dark: the cave's mood lifts them
  m.emissiveNode = hue
    .mul(cap)
    .mul(pulse)
    .mul(
      float(1.2)
        .add(mood.u.fireflies.mul(1.5))
        .add(float(1).sub(mood.u.ambient.mul(4)).max(0).mul(3)),
    );
  m.roughnessNode = float(0.5);
  return m;
}

type Part = (s: Slot) => THREE.Material;
type Variant = { near: [THREE.BufferGeometry, Part][]; far?: [THREE.BufferGeometry, Part][] };
type Spec = {
  kind: Kind;
  variants: Variant[];
  reach: number;
  lodAt: number;
  radius: number;
  shadow: boolean;
};

export function makeFlora(world: World, t: Tex, mood: MoodState, quality: number) {
  const group = new THREE.Group();
  const q = quality;
  const bark =
    (tint: number, wind: number, moss: number): Part =>
    (s) =>
      barkMat(s, t, tint, wind, moss);
  const leaf =
    (a: number, b: number, wind: number): Part =>
    (s) =>
      leafMat(s, t, mood, a, b, wind);
  const stone =
    (tint: number, mossy: boolean): Part =>
    (s) =>
      stoneMat(s, t, tint, mossy);
  const range = (n: number) => Array.from({ length: n }, (_, i) => i);

  const specs: Spec[] = [
    {
      kind: "oak",
      reach: 1300,
      lodAt: q > 1 ? 120 : 80,
      radius: 14,
      shadow: true,
      variants: range(4).map((i) => {
        const nr = S.oak(100 + i, false),
          fr = S.oak(100 + i, true);
        return {
          near: [
            [nr.bark, bark(0x5a4a3c, 0.25, 1)],
            [nr.leaves, leaf(0x4f7a2a, 0x8a8a2a, 0.3)],
          ],
          far: [
            [fr.bark, bark(0x5a4a3c, 0.25, 1)],
            [fr.leaves, leaf(0x4f7a2a, 0x8a8a2a, 0.3)],
          ],
        };
      }),
    },
    {
      kind: "pine",
      reach: 1300,
      lodAt: q > 1 ? 120 : 80,
      radius: 10,
      shadow: true,
      variants: range(3).map((i) => {
        const nr = S.pine(200 + i, false),
          fr = S.pine(200 + i, true);
        return {
          near: [
            [nr.bark, bark(0x4a3a30, 0.15, 0.3)],
            [nr.leaves, leaf(0x3d5a3a, 0x52643a, 0.2)],
          ],
          far: [
            [fr.bark, bark(0x4a3a30, 0.15, 0.3)],
            [fr.leaves, leaf(0x3d5a3a, 0x52643a, 0.2)],
          ],
        };
      }),
    },
    {
      kind: "dead",
      reach: 900,
      lodAt: 90,
      radius: 9,
      shadow: true,
      variants: range(3).map((i) => {
        const nr = S.dead(300 + i, false),
          fr = S.dead(300 + i, true);
        return {
          near: [[nr.bark, bark(0x4c4640, 0.12, 0.35)]],
          far: [[fr.bark, bark(0x4c4640, 0.12, 0.35)]],
        };
      }),
    },
    {
      kind: "fern",
      reach: q > 1 ? 75 : 50,
      lodAt: Infinity,
      radius: 1.5,
      shadow: false,
      variants: range(2).map((i) => ({ near: [[S.fern(400 + i), leaf(0x6a8a3a, 0x8a7a2a, 0.12)]] })),
    },
    {
      kind: "reed",
      reach: q > 1 ? 90 : 60,
      lodAt: Infinity,
      radius: 1.5,
      shadow: false,
      variants: range(2).map((i) => ({ near: [[S.reeds(500 + i), (s: Slot) => bladeMat(s, mood)]] })),
    },
    {
      kind: "rock",
      reach: 600,
      lodAt: 90,
      radius: 3,
      shadow: true,
      variants: range(4).map((i) => ({
        near: [[S.rock(600 + i, 3), stone(0x6e6a64, true)]],
        far: [[S.rock(600 + i, 1), stone(0x6e6a64, true)]],
      })),
    },
    {
      kind: "stone",
      reach: 1200,
      lodAt: Infinity,
      radius: 4,
      shadow: true,
      variants: range(2).map((i) => ({ near: [[S.slab(700 + i), stone(0x8a8780, true)]] })),
    },
    {
      kind: "grave",
      reach: 220,
      lodAt: Infinity,
      radius: 1.2,
      shadow: true,
      variants: range(4).map((i) => ({ near: [[S.grave(800 + i), stone(0x6a6660, false)]] })),
    },
    {
      kind: "shroom",
      reach: 140,
      lodAt: Infinity,
      radius: 1.2,
      shadow: false,
      variants: range(3).map((i) => ({ near: [[S.shrooms(900 + i), (s) => shroomMat(s, mood)]] })),
    },
  ];
  const fields = specs.map((spec) => {
    const data = world.props[spec.kind],
      n = data.length / 5;
    const nv = spec.variants.length;
    const lists = spec.variants.map((v) => {
      const near = slot(n),
        far = v.far ? slot(n) : null;
      // only the near detail casts: the shadow box (95 m) sits inside the near range
      const mk = (parts: [THREE.BufferGeometry, Part][], sl: Slot, near: boolean) =>
        parts.map(([g, part]) => {
          const mesh = new THREE.Mesh(g, part(sl));
          mesh.frustumCulled = false;
          mesh.castShadow = spec.shadow && near;
          mesh.receiveShadow = true;
          mesh.count = 0;
          group.add(mesh);
          return mesh;
        });
      return {
        near,
        far,
        nearMeshes: mk(v.near, near, true),
        farMeshes: v.far && far ? mk(v.far, far, false) : [],
      };
    });
    return { spec, data, n, nv, lists };
  });

  const sphere = new THREE.Sphere(),
    frustum = new THREE.Frustum(),
    m4 = new THREE.Matrix4();
  function update(camera: THREE.PerspectiveCamera) {
    m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(m4);
    const cx = camera.position.x,
      cz = camera.position.z;
    for (const f of fields) {
      for (const l of f.lists) {
        l.near.count = 0;
        if (l.far) l.far.count = 0;
      }
      const { data, spec } = f,
        reach2 = spec.reach * spec.reach,
        lod2 = spec.lodAt * spec.lodAt;
      for (let i = 0; i < f.n; i++) {
        const o = i * 5,
          x = data[o],
          z = data[o + 2],
          dx = x - cx,
          dz = z - cz,
          d2 = dx * dx + dz * dz;
        if (d2 > reach2) continue;
        if (d2 > 9000) {
          sphere.center.set(x, data[o + 1] + spec.radius * 0.5 * data[o + 4], z);
          sphere.radius = spec.radius * data[o + 4];
          if (!frustum.intersectsSphere(sphere)) continue;
        }
        const l = f.lists[i % f.nv];
        const s = d2 > lod2 && l.far ? l.far : l.near;
        const k = s.count++,
          A = s.a.array as Float32Array;
        A[k * 4] = x;
        A[k * 4 + 1] = data[o + 1];
        A[k * 4 + 2] = z;
        A[k * 4 + 3] = data[o + 3];
        (s.b.array as Float32Array)[k] = data[o + 4];
      }
      for (const l of f.lists) {
        for (const m of l.nearMeshes) m.count = l.near.count;
        l.near.a.needsUpdate = l.near.b.needsUpdate = true;
        if (l.far) {
          for (const m of l.farMeshes) m.count = l.far.count;
          l.far.a.needsUpdate = l.far.b.needsUpdate = true;
        }
      }
    }
  }
  return { group, update };
}
