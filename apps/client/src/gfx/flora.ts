// Everything that stands on the ground, drawn as instanced fields. Each frame a field keeps only the
// instances in view (plus everything near enough to cast a shadow into view), splits them into near
// and far detail, and uploads that list. Wind bends each shape by its `sway`.
import { HALF, type Kind, SIZE, type World } from "@zimovye/world";
import {
  attribute,
  cameraPosition,
  color,
  cos,
  dFdx,
  dFdy,
  dot,
  Fn,
  faceDirection,
  float,
  fract,
  hash,
  instancedDynamicBufferAttribute,
  log2,
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
import { bump } from "./bump";
import { COVER } from "./cover";
import { type Models, model } from "./models";
import type { MoodState } from "./mood";
import * as S from "./shapes";

type Node3 = ReturnType<typeof vec3>;
type Node2 = THREE.Node<"vec2">;
type Node4 = THREE.Node<"vec4">;
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
  const world = vec3(c.mul(nl.x).add(sn.mul(nl.z)), nl.y, sn.negate().mul(nl.x).add(c.mul(nl.z)));
  const normal = transformNormalToView(world);
  return { position, normal, world, seed: hash(inst.x.mul(0.37).add(inst.z.mul(1.71))) };
}

function barkMat(s: Slot, t: Tex, mood: MoodState, tint: number, wind: number, moss: number) {
  const m = new THREE.MeshStandardNodeMaterial();
  const P = placed(s, wind, 0);
  m.positionNode = P.position;
  m.normalNode = P.normal;
  // bark projected from the sides in the tree's own space (Blender's skinned trunks have no UVs):
  // the ridge channel stretched up the trunk is the furrows
  const pl = positionLocal,
    nl = normalLocal;
  const wx = nl.x.abs().pow(3),
    wz = nl.z.abs().pow(3),
    ws = wx.add(wz).add(0.0001);
  const side = (k: Node2) =>
    texture(t.detail, vec2(pl.z, pl.y).mul(k))
      .mul(wx)
      .add(texture(t.detail, vec2(pl.x, pl.y).mul(k).add(0.5)).mul(wz))
      .div(ws);
  const d = side(vec2(1.4, 0.3));
  const d2 = side(vec2(3.1, 1.6));
  // furrows dark and deep, the plates between them lighter
  const furrow = smoothstep(0.15, 0.65, d.w);
  const base = color(tint).mul(furrow.mul(0.8).add(0.3)).mul(d2.x.mul(0.5).add(0.75));
  const up = smoothstep(0.1, 0.8, normalLocal.y.add(d2.y.mul(0.5)));
  const low = smoothstep(4, 0.5, positionLocal.y);
  // moss on the roots and what faces up; over it, snow along the tops of the boughs
  m.colorNode = mix(
    mix(base, vec3(0.05, 0.085, 0.025).mul(d2.x.add(0.6)), max(up, low).mul(moss)),
    mood.SNOW,
    mood.snowOn(P.world.y.add(d2.y.sub(0.5).mul(0.3)), positionWorld).mul(0.9),
  );
  m.normalNode = bump(P.normal as never, furrow.mul(0.035).add(d2.y.mul(0.008)));
  m.roughnessNode = float(0.92);
  return m;
}

function leafMat(s: Slot, t: Tex, mood: MoodState, colA: number, colB: number, wind: number) {
  // (an alpha test, not a hashed alpha: the hash's dither freezes into the cached shadow map)
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.42 });
  const P = placed(s, wind, 0.05);
  m.positionNode = P.position;
  m.normalNode = P.normal;
  const tx = texture(t.atlas, uv());
  const tint = mix(color(colA), color(colB), P.seed.mul(1.2).min(1));
  // deep in the crown the leaves see less sky
  const ao = attribute("ao", "float");
  const albedo = tx.rgb.mul(tint).mul(2.2);
  // snow on the side of each card that faces up, mostly on the outer leaves (the crown shelters
  // the inner ones)
  const snow = mood
    .snowOn(P.world.y.mul(faceDirection).add(0.25), positionWorld)
    .mul(ao.mul(0.7).add(0.3))
    .toVar();
  m.colorNode = mix(albedo.mul(ao), mood.SNOW.mul(0.85), snow);
  // the small mips average the gaps into the leaves and an alpha test eats them: lift alpha by the
  // mip level (Golus), so a far crown stays as full as a near one
  const tuv = uv().mul((t.atlas.image as HTMLCanvasElement).width);
  const lod = max(log2(max(dot(dFdx(tuv), dFdx(tuv)), dot(dFdy(tuv), dFdy(tuv)))).mul(0.5), 0);
  // and cards right at the eye are cut away: a card that passes the camera (standing under a crown)
  // would fill half the frame with one flat magnified leaf
  const nearEye = smoothstep(1.2, 2.6, positionWorld.sub(cameraPosition).length());
  m.opacityNode = tx.a.mul(lod.mul(0.25).add(1)).mul(nearEye);
  // light through the leaves when looking toward the sun, mostly through the outer ones
  const v = normalize(positionWorld.sub(cameraPosition));
  const back = pow(max(dot(v, mood.u.sunDir), 0), 3);
  m.emissiveNode = albedo
    .mul(mood.u.sunColor)
    .mul(back.mul(mood.u.sunPower).mul(0.14))
    .mul(ao.mul(ao))
    .mul(float(1).sub(snow));
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

/**
 * Stone, projected three ways in world space so big rocks and their neighbours share one grain:
 * a coarse and a fine fetch per face for colour, a relief from the coarse one's slope for the normal,
 * beds on the faces, lichen and (where it's damp) moss on what faces the sky.
 */
/** `near`: the full shader; far off, one projection's worth of fetches and no relief. */
function stoneMat(s: Slot, t: Tex, mood: MoodState, tint: number, mossy: boolean, near: boolean) {
  const m = new THREE.MeshStandardNodeMaterial();
  const P = placed(s, 0, 0);
  m.positionNode = P.position;
  const wp = positionWorld;
  const nw = P.world;
  const tw0 = nw.abs().pow(vec3(4)),
    tw = tw0.div(tw0.x.add(tw0.y).add(tw0.z));
  const tri = (k: number, o: number) => {
    const X = texture(t.detail, wp.zy.mul(k).add(o)),
      Y = texture(t.detail, wp.xz.mul(k).add(o + 0.3)),
      Z = texture(t.detail, wp.xy.mul(k).add(o + 0.6));
    return {
      X,
      Y,
      Z,
      mix: (f: (v: typeof X) => Node3["x"]) => f(X).mul(tw.x).add(f(Y).mul(tw.y)).add(f(Z).mul(tw.z)),
    };
  };
  const big = tri(0.3, 0),
    fine = near ? tri(1.4, 0.17) : big;
  const n = big.mix((v) => v.x),
    g = fine.mix((v) => v.y),
    cell = fine.mix((v) => v.z);
  // beds on the faces, broken by the noise
  const beds = smoothstep(0.35, 0.65, fract(wp.y.mul(1.2).add(n.mul(1.6)))).mul(float(1).sub(tw.y));
  const base = color(tint)
    .mul(0.75)
    .mul(n.mul(0.9).add(0.5))
    .mul(g.mul(0.5).add(0.75))
    .mul(mix(float(1), float(0.72), beds))
    .mul(P.seed.mul(0.25).add(0.85));
  // relief: the slope of the coarse noise on each face, bent back into world space
  const e = 1 / 512;
  const grad = (uvf: Node2, v: Node4) =>
    vec2(
      texture(t.detail, uvf.add(vec2(e, 0))).x.sub(v.x),
      texture(t.detail, uvf.add(vec2(0, e))).x.sub(v.x),
    ).mul(22);
  const gX = grad(wp.zy.mul(0.3), big.X),
    gY = grad(wp.xz.mul(0.3).add(0.3), big.Y),
    gZ = grad(wp.xy.mul(0.3).add(0.6), big.Z);
  const bump = vec3(
    gY.x.mul(tw.y).add(gZ.x.mul(tw.z)),
    gX.y.mul(tw.x).add(gZ.y.mul(tw.z)),
    gX.x.mul(tw.x).add(gY.y.mul(tw.y)),
  );
  m.normalNode = near ? transformNormalToView(normalize(nw.sub(bump.mul(0.6)))) : P.normal;
  const up = smoothstep(0.45, 0.85, nw.y.add(g.sub(0.5).mul(0.5)));
  const lichen = smoothstep(0.62, 0.8, cell.add(n.mul(0.3))).mul(up.add(0.25).min(1));
  const stone = mix(base, mix(vec3(0.16, 0.16, 0.1), vec3(0.2, 0.11, 0.05), P.seed), lichen.mul(0.4));
  m.roughnessNode = float(0.88);
  // snow caps on every top, a rim on the ledges
  const snow = mood.snowOn(nw.y.add(g.sub(0.5).mul(0.4)), wp);
  if (!mossy) {
    m.colorNode = mix(stone, mood.SNOW, snow);
    return m;
  }
  const g0 = texture(t.ground0, wp.xz.add(HALF + 0.5).div(SIZE));
  const wet = g0.x.add(g0.y);
  m.colorNode = mix(
    mix(stone, vec3(0.04, 0.07, 0.022).mul(g.add(0.5)), up.mul(wet.mul(0.85).add(0.1))),
    mood.SNOW,
    snow,
  );
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
  /** its crown keeps the snow off what's under it (cover.ts) */
  roof?: boolean;
};

/** `distance`: the view distance setting (video.ts), 0..3: how far each kind reaches and keeps detail */
export function makeFlora(world: World, t: Tex, mood: MoodState, distance: number, models: Models) {
  const group = new THREE.Group();
  const q = distance;
  const bark =
    (tint: number, wind: number, moss: number): Part =>
    (s) =>
      barkMat(s, t, mood, tint, wind, moss);
  const leaf =
    (a: number, b: number, wind: number): Part =>
    (s) =>
      leafMat(s, t, mood, a, b, wind);
  const stone =
    (tint: number, mossy: boolean, near = true): Part =>
    (s) =>
      stoneMat(s, t, mood, tint, mossy, near && q > 0);
  const range = (n: number) => Array.from({ length: n }, (_, i) => i);

  const specs: Spec[] = [
    {
      kind: "oak",
      reach: [700, 900, 1100, 1300][q],
      lodAt: [35, 45, 70, 110][q],
      radius: 14,
      shadow: true,
      roof: true,
      // grown in Blender (tools/blender/trees.py)
      variants: range(4).map((i) => {
        const g = (part: string, lod: number) => model(models, `oak${i}_${part}_lod${lod}`);
        return {
          near: [
            // oaks keep their dead leaves through the winter
            [g("bark", 0), bark(0x5a4a3c, 0.25, 1)],
            [g("leaves", 0), leaf(0x5e4026, 0x7a5a36, 0.3)],
          ],
          far: [
            [g("bark", 1), bark(0x5a4a3c, 0.25, 1)],
            [g("leaves", 1), leaf(0x5e4026, 0x7a5a36, 0.3)],
          ],
        };
      }),
    },
    {
      kind: "pine",
      reach: [700, 900, 1100, 1300][q],
      lodAt: [50, 60, 100, 130][q],
      radius: 10,
      shadow: true,
      roof: true,
      variants: range(3).map((i) => {
        const nr = S.pine(200 + i, false),
          fr = S.pine(200 + i, true);
        return {
          near: [
            [nr.bark, bark(0x4a3a30, 0.15, 0.3)],
            [nr.leaves, leaf(0x2a3d30, 0x384834, 0.2)],
          ],
          far: [
            [fr.bark, bark(0x4a3a30, 0.15, 0.3)],
            [fr.leaves, leaf(0x2a3d30, 0x384834, 0.2)],
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
      variants: range(3).map((i) => ({
        near: [[model(models, `dead${i}_bark_lod0`), bark(0x4c4640, 0.12, 0.35)]],
        far: [[model(models, `dead${i}_bark_lod1`), bark(0x4c4640, 0.12, 0.35)]],
      })),
    },
    // (no ferns: the winter has laid them flat under the snow; the world still places them)
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
      reach: [200, 300, 450, 600][q],
      lodAt: [40, 50, 70, 90][q],
      radius: 3,
      shadow: true,
      variants: range(4).map((i) => ({
        near: [[model(models, `boulder${i}_lod0`), stone(0x6e6a64, true)]],
        far: [[model(models, `boulder${i}_lod1`), stone(0x6e6a64, true, false)]],
      })),
    },
    {
      kind: "crag",
      reach: [450, 650, 900, 1200][q],
      lodAt: [60, 80, 120, 150][q],
      radius: 9,
      shadow: true,
      variants: range(4).map((i) => ({
        near: [[model(models, `crag${i}_lod0`), stone(0x72695e, true)]],
        far: [[model(models, `crag${i}_lod1`), stone(0x72695e, true, false)]],
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
          // (the cover map's 24 m reach sits inside every near range)
          if (spec.roof && near) mesh.layers.enable(COVER);
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
