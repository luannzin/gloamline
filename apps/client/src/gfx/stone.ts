// Worked and living stone: the keep's blocks (one instanced box), the Hollow's rock (the surface
// nets mesh), and the Pale Spire on the northern horizon with its beam.
import { BLOCK, heightAt, SPIRE, type World } from "@gloamline/world";
import {
  abs,
  cos,
  Fn,
  float,
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
  time,
  transformNormalToView,
  uv,
  vec3,
} from "three/tsl";
import * as THREE from "three/webgpu";
import type { MoodState } from "./mood";

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
  m.normalNode = transformNormalToView(rot(normalLocal as never));
  m.colorNode = Fn(() => {
    const seed = hash(A.x.mul(0.731).add(A.z.mul(1.37)).add(A.y.mul(0.11)));
    const lp = positionLocal,
      nl = normalLocal;
    // distance to the block's edges on this face, in metres: the joints between stones
    const big = float(9);
    const ex = select(abs(nl.x).greaterThan(0.5), big, float(0.5).sub(abs(lp.x)).mul(S.x));
    const ey = select(abs(nl.y).greaterThan(0.5), big, float(0.5).sub(abs(lp.y)).mul(S.y));
    const ez = select(abs(nl.z).greaterThan(0.5), big, float(0.5).sub(abs(lp.z)).mul(S.z));
    const edge = smoothstep(0.0, 0.07, min(ex, min(ey, ez)));
    // courses inside tall columns
    const f = fract(positionWorld.y.div(0.62).add(seed));
    const course = smoothstep(0.0, 0.05, min(f, float(1).sub(f)));
    const d = tri(detail, 0.45, "x"),
      d2 = tri(detail, 1.7, "y");
    const base = mix(vec3(0.16, 0.145, 0.13), vec3(0.24, 0.22, 0.19), seed)
      .mul(d.mul(0.7).add(0.55))
      .mul(d2.mul(0.4).add(0.8));
    const joints = mix(float(0.35), float(1), edge.mul(mix(float(1), course, smoothstep(1.2, 2.5, S.y))));
    // soot climbing the walls, moss low and on top
    const soot = smoothstep(0.3, 0.9, positionWorld.y.sub(64).div(16).add(d.sub(0.5)));
    const moss = max(smoothstep(0.6, 0.9, nl.y), smoothstep(1.6, 0.2, lp.y.add(0.5).mul(S.y))).mul(
      smoothstep(0.45, 0.7, d2.add(seed.mul(0.3))),
    );
    return mix(mix(base, base.mul(0.35), soot.mul(0.7)), vec3(0.05, 0.07, 0.03), moss.mul(0.8)).mul(joints);
  })();
  m.roughnessNode = float(0.9);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m);
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
  m.colorNode = mix(vec3(0.07, 0.072, 0.078), vec3(0.15, 0.14, 0.13), strata.mul(0.6).add(d2.mul(0.4)))
    .mul(w.mul(0.5).add(0.75))
    .add(
      vec3(0.03, 0.05, 0.02)
        .mul(smoothstep(0.7, 0.95, normalLocal.y))
        .mul(d2),
    );
  // wet where the rock faces down or sideways inside
  m.roughnessNode = mix(float(0.45), float(0.9), smoothstep(-0.2, 0.6, normalLocal.y.add(d2.sub(0.5))));
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** The Pale Spire: a broken tower taller than anything, and the beam it still throws. */
export function makeSpire(world: World, detail: THREE.Texture, mood: MoodState) {
  const group = new THREE.Group();
  const pts: THREE.Vector2[] = [];
  const H = 330;
  for (let i = 0; i <= 60; i++) {
    const t = i / 60,
      y = t * H;
    let r = 16 * (1 - t) ** 0.8 + 4.5;
    if (i % 6 === 0) r += 2.2; // rings
    if (i % 6 === 1) r += 1.0;
    pts.push(new THREE.Vector2(r, y));
  }
  const g = new THREE.LatheGeometry(pts, 40);
  // break the top: drop vertices near the crown by an angle-dependent amount
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    if (y > H - 50) {
      const a = Math.atan2(z, x);
      const cut = H - 50 + 50 * (0.5 + 0.5 * Math.sin(a * 3 + 1)) * (0.6 + 0.4 * Math.sin(a * 7));
      if (y > cut) p.setY(i, cut);
    }
  }
  g.computeVertexNormals();
  const m = new THREE.MeshStandardNodeMaterial();
  const d = tri(detail, 0.05, "x");
  m.colorNode = mix(vec3(0.42, 0.42, 0.4), vec3(0.62, 0.6, 0.55), d).mul(
    smoothstep(0.0, 40.0, positionLocal.y).mul(0.3).add(0.7),
  );
  m.roughnessNode = float(0.85);
  const tower = new THREE.Mesh(g, m);
  const base = heightAt(world.ground.height, SPIRE.x, SPIRE.z) - 8;
  tower.position.set(SPIRE.x, base, SPIRE.z);
  tower.castShadow = true;
  group.add(tower);
  // the beam: additive, brightest at the crown, fading into the sky
  const beamG = new THREE.CylinderGeometry(5, 3, 1800, 24, 1, true).translate(0, 900, 0);
  const bm = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  const v = uv().y;
  const flick = sin(time.mul(0.6)).mul(0.08).add(0.92);
  bm.colorNode = vec3(1.0, 0.86, 0.6)
    .mul(float(1).sub(v).pow(3))
    .mul(flick)
    .mul(mix(float(0.9), float(2.2), mood.u.stars));
  const beam = new THREE.Mesh(beamG, bm);
  beam.position.set(SPIRE.x, base + H - 30, SPIRE.z);
  beam.frustumCulled = false;
  group.add(beam);
  return group;
}
