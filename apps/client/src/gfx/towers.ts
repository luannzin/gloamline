// What crowns the keep's whole towers: slate roofs with an iron finial, and on every other one a
// banner on a pole, moving in the wind. Meshes from tools/blender/architecture.py, placed from the
// world's tower list; their COLOR_0.g (`ao` after models.ts) marks iron.
import { KEEP, TOWER, type World } from "@gloamline/world";
import {
  atan,
  attribute,
  color,
  cos,
  Fn,
  float,
  floor,
  fract,
  hash,
  instancedBufferAttribute,
  mix,
  normalLocal,
  positionLocal,
  positionWorld,
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
import { type Models, model } from "./models";

type V4 = ReturnType<typeof vec3> & { w: ReturnType<typeof float> };

/** One instanced mesh: position + yaw in one vec4, scale in another. */
export function placedMesh(
  geo: THREE.BufferGeometry,
  rows: number[][],
  make: (A: V4, S: V4) => THREE.MeshStandardNodeMaterial,
) {
  const a = new Float32Array(rows.length * 4),
    b = new Float32Array(rows.length * 4);
  rows.forEach((r, i) => {
    a.set([r[0], r[1], r[2], r[3]], i * 4);
    b.set([r[4], r[5], r[6], 0], i * 4);
  });
  const A = instancedBufferAttribute(new THREE.InstancedBufferAttribute(a, 4), "vec4") as unknown as V4;
  const S = instancedBufferAttribute(new THREE.InstancedBufferAttribute(b, 4), "vec4") as unknown as V4;
  const m = make(A, S);
  const mesh = new THREE.Mesh(geo, m);
  mesh.count = rows.length;
  mesh.frustumCulled = false;
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** `v` turned by `yaw` about y, the way every placed mesh is (local +z goes to (sin, cos)). */
export function turn(v: ReturnType<typeof vec3>, yaw: ReturnType<typeof float>) {
  const c = cos(yaw),
    s = sin(yaw);
  return vec3(c.mul(v.x).add(s.mul(v.z)), v.y, s.negate().mul(v.x).add(c.mul(v.z)));
}

export function makeTowers(world: World, models: Models, detail: THREE.Texture) {
  const group = new THREE.Group();
  const T = world.towers;
  const roofs: number[][] = [],
    banners: number[][] = [];
  for (let i = 0; i < T.length; i += TOWER) {
    const [x, y0, z, rad, h, ruin] = T.subarray(i, i + TOWER);
    if (ruin > 0.32) continue;
    const s = rad + 0.25;
    roofs.push([x, y0 + h - 0.4, z, i * 0.37, s, rad * 0.95, s]);
    // a banner on every other tower, on the side that faces out from the keep
    if ((i / TOWER) % 2 === 0) {
      const a = Math.atan2(z - KEEP.z, x - KEEP.x);
      const ox = Math.cos(a),
        oz = Math.sin(a);
      banners.push([
        x + ox * (rad + 0.25),
        y0 + h - 1.2,
        z + oz * (rad + 0.25),
        -a + Math.PI / 2,
        1.35,
        1.35,
        1.35,
      ]);
    }
  }
  if (roofs.length) {
    const near = placedMesh(model(models, "roof_lod0"), roofs, (A, S) => {
      const m = new THREE.MeshStandardNodeMaterial();
      m.positionNode = turn(positionLocal.mul(S.xyz) as never, A.w).add(A.xyz);
      m.normalNode = transformNormalToView(turn(normalLocal as never, A.w));
      const iron = attribute("ao", "float");
      // slates: courses up the cone, each slate its own shade, a few gone green with lichen
      const lp = positionLocal;
      const row = floor(lp.y.div(2.6 / 14)),
        ang = atan(lp.z, lp.x)
          .div(Math.PI * 2)
          .add(0.5);
      const ring = lp.xz.length().max(0.05);
      const k = fract(ang.mul(floor(ring.mul(46)).max(6)).add(hash(row).mul(0.5)));
      const id = hash(row.mul(13.1).add(floor(ang.mul(floor(ring.mul(46)).max(6)))));
      const d = texture(detail, positionWorld.xz.mul(0.7)).x;
      const edge = smoothstep(0.0, 0.08, k.min(float(1).sub(k)));
      const slate = mix(color(0x1c2027), color(0x2d323a), id)
        .mul(edge.mul(0.35).add(0.65))
        .mul(d.mul(0.4).add(0.8));
      const lichen = smoothstep(0.78, 0.95, id.add(d.mul(0.3))).mul(0.6);
      m.colorNode = mix(mix(slate, color(0x4a5230), lichen), color(0x15130f), iron);
      m.roughnessNode = mix(float(0.62), float(0.45), iron);
      m.metalnessNode = iron.mul(0.7);
      return m;
    });
    group.add(near);
  }
  if (banners.length) {
    const mesh = placedMesh(model(models, "banner_lod0"), banners, (A, S) => {
      const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide });
      const sway = attribute("sway", "float"),
        iron = attribute("ao", "float");
      // cloth in the wind: a slow swing from the pole, ripples running down to the hem
      const ph = A.x.mul(0.13).add(A.z.mul(0.07));
      m.positionNode = Fn(() => {
        const lp = positionLocal.toVar();
        const wave = sin(time.mul(2.2).sub(lp.y.mul(1.7)).add(ph))
          .mul(0.18)
          .add(sin(time.mul(0.7).add(ph)).mul(0.25));
        lp.z.addAssign(wave.mul(sway));
        lp.x.addAssign(sin(time.mul(1.3).add(lp.y).add(ph)).mul(0.05).mul(sway));
        return turn(lp.mul(S.xyz) as never, A.w).add(A.xyz);
      })();
      m.normalNode = transformNormalToView(turn(normalLocal as never, A.w));
      // deep crimson, a gold band at the edges and a gold ring with a dark eye in the field
      const p = uv();
      const band = smoothstep(0.1, 0.07, p.x.min(float(1).sub(p.x))).max(smoothstep(0.96, 0.98, p.y));
      const r = p.sub(vec2(0.5, 0.66)).mul(vec2(1, 3.2)).length();
      const emblem = smoothstep(0.24, 0.22, r).mul(smoothstep(0.15, 0.17, r));
      const cloth = mix(color(0x3a0807), color(0x7a5a1c), band.max(emblem));
      const weave = texture(detail, p.mul(vec2(3, 9)))
        .y.mul(0.3)
        .add(0.85);
      m.colorNode = mix(cloth.mul(weave), color(0x15130f), iron);
      m.roughnessNode = float(0.9);
      return m;
    });
    group.add(mesh);
  }
  return group;
}
