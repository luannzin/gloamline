// The lens, after abyssal-garden's composite: the scene, sun shafts marched through the shadow map
// and blurred, a soft bloom mixed in (a haze around light, not a glow on everything), exposure, a
// gentle vignette, a filmic curve, an S-curve on luminance, highlights that lose a little colour, and
// a triangular dither that kills banding in the fog. Resolution scales itself to hold the frame rate.

import { bilateralBlur } from "three/addons/tsl/display/BilateralBlurNode.js";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { godrays } from "three/addons/tsl/display/GodraysNode.js";
import { ao } from "three/addons/tsl/display/GTAONode.js";
import { smaa } from "three/addons/tsl/display/SMAANode.js";
import {
  dot,
  exp,
  Fn,
  float,
  interleavedGradientNoise,
  max,
  mix,
  mrt,
  normalView,
  output,
  pass,
  pow,
  screenCoordinate,
  screenUV,
  smoothstep,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import * as THREE from "three/webgpu";
import type { MoodState } from "./mood";

export type Quality = 0 | 1 | 2; // low, medium, high

type V3 = ReturnType<typeof vec3>;

export function makePost(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  mood: MoodState,
  q: Quality,
) {
  const pipe = new THREE.RenderPipeline(renderer);
  pipe.outputColorTransform = false;
  const scenePass = pass(scene, camera);
  if (q > 0) scenePass.setMRT(mrt({ output, normal: normalView }));
  const col = scenePass.getTextureNode("output");
  const depth = scenePass.getTextureNode("depth");
  const u = mood.u;
  // where the sun is on screen (x, y in uv; z: 1 in front of the camera, 0 behind)
  const sunUV = uniform(new THREE.Vector3());
  const aspect = uniform(1);

  let aoTex: THREE.TextureNode | null = null;
  if (q > 0) {
    const a = ao(depth, scenePass.getTextureNode("normal"), camera);
    a.resolutionScale = 0.5;
    a.radius.value = 0.5;
    a.thickness.value = 1.5;
    a.samples.value = q > 1 ? 12 : 8;
    aoTex = a.getTextureNode();
  }
  let rays: THREE.TextureNode | null = null;
  if (q > 0) {
    const g = godrays(depth, camera, mood.sun);
    g.raymarchSteps.value = q > 1 ? 40 : 24;
    g.density.value = 0.9;
    g.maxDensity.value = 0.85;
    g.distanceAttenuation.value = 1.5;
    rays = bilateralBlur(g.getTextureNode()).getTextureNode();
  }
  const bl = bloom(col, 1, 0.65, 0.25);

  const graded = Fn(() => {
    const c = col.rgb.toVar();
    if (aoTex) c.mulAssign(mix(float(1), aoTex.sample(screenUV).r, 0.8));
    if (rays) {
      // forward scattering: the shafts are strongest looking toward the sun
      const d = screenUV.sub(sunUV.xy).mul(vec2(aspect, 1)).length();
      const phase = exp(d.mul(-2.6)).mul(2.4).mul(sunUV.z).add(0.3);
      const tint = mix(u.sunColor, u.fogColor.mul(2), 0.25);
      // the sky already carries its own scattering: shafts are air between here and the ground
      const ground = smoothstep(1, 0.9995, depth.sample(screenUV).r).mul(0.8).add(0.2);
      c.addAssign(
        tint.mul(rays.sample(screenUV).r).mul(phase).mul(ground).mul(u.rays).mul(u.sunPower).mul(0.16),
      );
    }
    const b = bl.rgb;
    c.assign(mix(c, b, u.bloom.mul(0.3)).add(b.mul(u.bloom.mul(0.2))));
    c.mulAssign(u.exposure);
    const q2 = screenUV.sub(0.5);
    c.mulAssign(float(1).sub(dot(q2, q2).mul(0.55)));
    // filmic curve (Narkowicz's ACES fit)
    const t = c
      .mul(c.mul(2.51).add(0.03))
      .div(c.mul(c.mul(2.43).add(0.59)).add(0.14))
      .clamp(0, 1)
      .toVar();
    const l0 = dot(t, vec3(0.2126, 0.7152, 0.0722));
    const l = mix(l0, l0.mul(l0).mul(float(3).sub(l0.mul(2))), u.contrast.sub(1).mul(4).add(0.3).clamp(0, 1));
    t.mulAssign(l.div(max(l0, 0.0001)));
    t.assign(mix(t, vec3(l), smoothstep(0.55, 1, l).mul(0.12)));
    t.assign(mix(vec3(l), t, u.saturation.mul(0.93)).add(vec3(0.008, 0.002, 0).add(u.lift)));
    const s = pow(t.max(0), vec3(1 / 2.2)) as unknown as V3;
    const n = interleavedGradientNoise(screenCoordinate.xy)
      .add(interleavedGradientNoise(screenCoordinate.xy.add(37)))
      .sub(1);
    return vec4(s.add(n.div(255)), 1);
  })();
  pipe.outputNode = q > 0 ? smaa(graded) : graded;

  // dynamic resolution: the pixel ratio follows the frame time toward the display's own rate
  const maxRatio = Math.min(window.devicePixelRatio, 1);
  let ratio = q > 1 ? 1 : 0.8,
    acc = 0,
    frames = 0,
    target = 1000 / 60;
  renderer.setPixelRatio(ratio);
  function adapt(dt: number) {
    acc += dt;
    frames++;
    if (acc < 0.75) return;
    const ms = (acc / frames) * 1000;
    acc = frames = 0;
    let next = ratio;
    if (ms > target * 1.12) next = Math.max(0.5, ratio * Math.sqrt(target / ms));
    else if (ms < target * 0.85) next = Math.min(maxRatio, ratio * 1.06);
    if (Math.abs(next - ratio) > 0.02) {
      ratio = next;
      renderer.setPixelRatio(ratio);
    }
  }
  const v = new THREE.Vector3();
  function frame() {
    v.copy(camera.position).addScaledVector(u.sunDir.value, 1000).project(camera);
    const front = v.z < 1 ? 1 : 0;
    sunUV.value.set(v.x * 0.5 + 0.5, 0.5 - v.y * 0.5, front);
    aspect.value = camera.aspect;
  }
  return {
    pipe,
    adapt,
    frame,
    get ratio() {
      return ratio;
    },
    /** Frame time to hold, from the display's refresh (measured by the caller). */
    set target(ms: number) {
      target = ms;
    },
  };
}
