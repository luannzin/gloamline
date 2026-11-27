// The Mire's water: a mirror broken by small ripples, dark as tea where it's deep, fading out over
// the mud at the edge. Depth comes from the heightmap, so no depth buffer is read.
import { HALF, SIZE, WATER_Y } from "@gloamline/world";
import {
  cameraPosition,
  dot,
  Fn,
  float,
  floor,
  fract,
  hash,
  max,
  mix,
  normalize,
  positionWorld,
  pow,
  reflector,
  sin,
  smoothstep,
  texture,
  time,
  vec2,
  vec3,
} from "three/tsl";
import * as THREE from "three/webgpu";
import type { MoodState } from "./mood";

export function makeWater(
  height: THREE.DataTexture,
  detail: THREE.Texture,
  mood: MoodState,
  quality: number,
) {
  const g = new THREE.PlaneGeometry(760, 760, 1, 1).rotateX(-Math.PI / 2);
  const m = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false });
  const wp = positionWorld;
  const r1 = texture(detail, wp.xz.mul(0.045).add(vec2(time.mul(0.006), time.mul(0.004))));
  const r2 = texture(detail, wp.xz.mul(0.11).sub(vec2(time.mul(0.009), time.mul(-0.005))));
  const r3 = texture(detail, wp.xz.mul(0.43).add(vec2(time.mul(0.02), time.mul(0.013))));
  // rings: now and then something touches the surface, and a ring runs out from it (one chance per
  // 3 m cell, each on its own clock)
  const cell = floor(wp.xz.div(3)),
    f = fract(wp.xz.div(3)).sub(0.5);
  const seed = hash(cell.x.mul(17.3).add(cell.y.mul(3.1)));
  const age = fract(time.mul(0.23).add(seed.mul(7)));
  const rr = f.length().mul(3);
  const ring = sin(rr.sub(age.mul(2.6)).mul(18))
    .mul(smoothstep(0.35, 0.0, rr.sub(age.mul(2.6)).abs()))
    .mul(float(1).sub(age))
    .mul(seed.greaterThan(0.6).select(float(1), float(0)));
  const ripple = r1.xy
    .add(r2.yx)
    .sub(1)
    .add(r3.xy.sub(0.5).mul(0.35))
    .add(f.normalize().mul(ring.mul(0.5)));
  const refl = quality > 0 ? reflector({ resolutionScale: quality > 1 ? 0.5 : 0.3 }) : null;
  const v = normalize(cameraPosition.sub(wp));
  const fres = pow(float(1).sub(max(v.y, 0)), 4)
    .mul(0.85)
    .add(0.12);
  // water depth from the ground under it
  const uvh = wp.xz.add(HALF + 0.5).div(SIZE);
  const depth = float(WATER_Y).sub(texture(height, uvh).x);
  const deep = vec3(0.012, 0.018, 0.014),
    murk = vec3(0.04, 0.045, 0.025);
  // duckweed and algae drifting in mats on the still water, thickest near the banks
  const mat = smoothstep(
    0.55,
    0.7,
    texture(detail, wp.xz.mul(0.02).add(time.mul(0.0007))).x.add(smoothstep(1.2, 0.2, depth).mul(0.25)),
  );
  const weed = vec3(0.03, 0.06, 0.02).mul(texture(detail, wp.xz.mul(0.9)).y.add(0.5));
  m.colorNode = Fn(() => {
    const body = mix(murk, deep, smoothstep(0.2, 2.5, depth));
    let sky = mood.u.fogColor.mul(0.6);
    if (refl) {
      refl.uvNode = refl.uvNode!.add(ripple.mul(0.018).mul(float(1).sub(mat)));
      sky = refl.rgb as unknown as typeof sky;
    }
    return mix(mix(body, sky, fres), weed, mat.mul(0.9));
  })();
  m.roughnessNode = mix(float(0.06), float(0.85), mat);
  m.metalnessNode = float(0);
  m.opacityNode = smoothstep(0.0, 0.6, depth).mul(0.92).add(0.05).max(mat);
  // a glint of the sun or moon on the ripples
  const n = normalize(vec3(ripple.x.mul(0.25), 1, ripple.y.mul(0.25)));
  const h = normalize(v.add(mood.u.sunDir));
  m.emissiveNode = mood.u.sunColor.mul(
    pow(max(dot(n, h), 0), 220)
      .mul(mood.u.sunPower)
      .mul(2)
      .mul(float(1).sub(mat)),
  );
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(360, WATER_Y, 360);
  mesh.receiveShadow = true;
  if (refl) {
    // the mirror plane faces the target's +z: turn it to face up
    refl.target.rotateX(-Math.PI / 2);
    mesh.add(refl.target);
  }
  return mesh;
}
