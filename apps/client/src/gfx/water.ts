// The Mire's water: a mirror broken by small ripples, dark as tea where it's deep, fading out over
// the mud at the edge. Depth comes from the heightmap, so no depth buffer is read.
import { HALF, SIZE, WATER_Y } from "@gloamline/world";
import {
  cameraPosition,
  dot,
  Fn,
  float,
  max,
  mix,
  normalize,
  positionWorld,
  pow,
  reflector,
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
  const ripple = r1.xy.add(r2.yx).sub(1);
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
  m.colorNode = Fn(() => {
    const body = mix(murk, deep, smoothstep(0.2, 2.5, depth));
    let sky = mood.u.fogColor.mul(0.6);
    if (refl) {
      refl.uvNode = refl.uvNode!.add(ripple.mul(0.018));
      sky = refl.rgb as unknown as typeof sky;
    }
    return mix(body, sky, fres);
  })();
  m.roughnessNode = float(0.08);
  m.metalnessNode = float(0);
  m.opacityNode = smoothstep(0.0, 0.6, depth).mul(0.92).add(0.05);
  // a glint of the sun or moon on the ripples
  const n = normalize(vec3(ripple.x.mul(0.25), 1, ripple.y.mul(0.25)));
  const h = normalize(v.add(mood.u.sunDir));
  m.emissiveNode = mood.u.sunColor.mul(
    pow(max(dot(n, h), 0), 220)
      .mul(mood.u.sunPower)
      .mul(2),
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
