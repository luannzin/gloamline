// Worked and living stone: the ostrog's blocks (one instanced box) and the mine's rock (the surface
// nets mesh).
import { BLOCK, type World } from "@gloamline/world";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  abs,
  cos,
  dot,
  Fn,
  float,
  floor,
  fract,
  hash,
  instancedBufferAttribute,
  max,
  min,
  mix,
  normalLocal,
  positionLocal,
  positionWorld,
  select,
  sin,
  smoothstep,
  texture,
  transformNormalToView,
  vec3,
} from "three/tsl";
import * as THREE from "three/webgpu";
import { bump } from "./bump";

type V4 = ReturnType<typeof vec3> & { w: ReturnType<typeof float> };

/** Triplanar detail value at the world position, 0..1. */
function tri(detail: THREE.Texture, scale: number, ch: "x" | "y" | "w") {
  const wp = positionWorld.mul(scale);
  return texture(detail, wp.xz)
    [ch].add(texture(detail, wp.xy.add(0.31))[ch])
    .add(texture(detail, wp.zy.add(0.67))[ch])
    .div(3);
}

export function makeRuins(world: World, detail: THREE.Texture) {
  const B = world.ruins,
    n = B.length / BLOCK;
  const a = new Float32Array(n * 4),
    b = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const o = i * BLOCK;
    a.set([B[o], B[o + 1], B[o + 2], B[o + 6]], i * 4);
    b.set([B[o + 3], B[o + 4], B[o + 5], B[o + 7]], i * 4);
  }
  const A = instancedBufferAttribute(new THREE.InstancedBufferAttribute(a, 4), "vec4") as unknown as V4;
  const S = instancedBufferAttribute(new THREE.InstancedBufferAttribute(b, 4), "vec4") as unknown as V4;
  const m = new THREE.MeshStandardNodeMaterial();
  const cy = cos(A.w),
    sy = sin(A.w),
    cr = cos(S.w),
    sr = sin(S.w);
  const rot = (v: ReturnType<typeof vec3>) => {
    const x1 = cr.mul(v.x).sub(sr.mul(v.y)),
      y1 = sr.mul(v.x).add(cr.mul(v.y));
    return vec3(cy.mul(x1).add(sy.mul(v.z)), y1, sy.negate().mul(x1).add(cy.mul(v.z)));
  };
  m.positionNode = rot(positionLocal.mul(S.xyz) as never).add(A.xyz);
  // ashlar masonry laid in world space, so the courses run on unbroken from one column of the wall
  // to the next: courses 0.58 m high, each its own stone length and offset, every stone its own
  // tone, pillowed toward its edges, mortar sunk between, corners chipped
  const lp = positionLocal,
    nl = normalLocal,
    wp = positionWorld;
  const endFace = abs(nl.x).greaterThan(0.5),
    topFace = abs(nl.y).greaterThan(0.5);
  const along = select(endFace, vec3(sy, 0, cy), vec3(cy, 0, sy.negate()));
  const across = select(endFace, vec3(cy, 0, sy.negate()), vec3(sy, 0, cy));
  const u = dot(wp, along),
    v = select(topFace, dot(wp, across), wp.y);
  const CH = 0.58;
  const ci = floor(v.div(CH)),
    fv = fract(v.div(CH));
  const rc = hash(ci.mul(1.37).add(0.11));
  const L = rc.mul(0.7).add(0.85);
  const uu = u.div(L).add(rc.mul(7.3));
  const si = floor(uu),
    fu = fract(uu);
  const rs = hash(si.mul(0.73).add(ci.mul(3.17)));
  const e = min(min(fu, float(1).sub(fu)).mul(L), min(fv, float(1).sub(fv)).mul(CH));
  const d = tri(detail, 0.45, "x"),
    d2 = tri(detail, 1.7, "y");
  const chip = smoothstep(0.62, 0.78, d2.add(rs.mul(0.25))).mul(smoothstep(0.09, 0.02, e));
  const groove = smoothstep(0.012, 0.04, e).mul(float(1).sub(chip));
  const pillow = smoothstep(0.0, 0.14, e);
  const relief = pillow.mul(0.55).add(groove.mul(0.45)).add(d2.mul(0.25));
  m.normalNode = bump(transformNormalToView(rot(nl as never)) as never, relief.mul(0.035));
  m.colorNode = Fn(() => {
    const seed = hash(A.x.mul(0.731).add(A.z.mul(1.37)).add(A.y.mul(0.11)));
    const tone = rs
      .mul(0.4)
      .add(0.8)
      .mul(select(rs.greaterThan(0.9), float(0.7), float(1)));
    const stone = mix(vec3(0.17, 0.155, 0.135), vec3(0.24, 0.22, 0.19), seed.mul(0.5).add(rs.mul(0.5)))
      .mul(tone)
      .mul(d.mul(0.6).add(0.6))
      .mul(d2.mul(0.35).add(0.82));
    const mortar = vec3(0.07, 0.065, 0.058).mul(d2.add(0.6));
    const base = mix(mortar, stone, groove);
    // soot climbing the walls, moss low, on the tops, and creeping along the mortar
    const soot = smoothstep(0.3, 0.9, wp.y.sub(64).div(16).add(d.sub(0.5)));
    const moss = max(
      max(smoothstep(0.6, 0.9, nl.y), smoothstep(1.6, 0.2, lp.y.add(0.5).mul(S.y))),
      float(1).sub(groove).mul(0.6),
    ).mul(smoothstep(0.45, 0.7, d2.add(seed.mul(0.3))));
    return mix(mix(base, base.mul(0.35), soot.mul(0.7)), vec3(0.04, 0.065, 0.025), moss.mul(0.8));
  })();
  m.roughnessNode = mix(float(0.97), float(0.86), groove);
  // worn edges catch the light; a sharp box reads as a toy
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(1, 1, 1, 2, 0.07), m);
  mesh.count = n;
  mesh.frustumCulled = false;
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

export function makeCave(world: World, detail: THREE.Texture) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(world.cave.positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(world.cave.normals, 3));
  g.setIndex(new THREE.BufferAttribute(world.cave.indices, 1));
  g.computeBoundingSphere();
  const m = new THREE.MeshStandardNodeMaterial();
  const d = tri(detail, 0.09, "x"),
    d2 = tri(detail, 0.5, "y"),
    w = tri(detail, 0.04, "w");
  const strata = smoothstep(0.35, 0.65, fract(positionWorld.y.mul(0.18).add(d.mul(1.5))));
  // grey stone in bands, darker in the cracks; moss and grass on the ledges that face the sky
  const ledge = smoothstep(0.55, 0.85, normalLocal.y.add(d2.sub(0.5).mul(0.4)));
  m.colorNode = mix(
    mix(vec3(0.055, 0.056, 0.06), vec3(0.12, 0.112, 0.1), strata.mul(0.6).add(d2.mul(0.4))).mul(
      w.mul(0.6).add(0.65),
    ),
    mix(vec3(0.035, 0.06, 0.02), vec3(0.09, 0.085, 0.04), d),
    ledge.mul(0.85),
  );
  // wet only on the ceilings, where it drips; dry and matte everywhere else
  m.roughnessNode = mix(float(0.5), float(0.93), smoothstep(-0.6, -0.1, normalLocal.y));
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
