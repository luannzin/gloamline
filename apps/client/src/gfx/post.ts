// The lens, after abyssal-garden's composite: the scene, sun shafts marched through the shadow map
// and blurred, a soft bloom mixed in (a haze around light, not a glow on everything), exposure, a
// gentle vignette, a filmic curve, an S-curve on luminance, highlights that lose a little colour, and
// a triangular dither that kills banding in the fog.
//
// With upscaling on (video.ts) the scene renders below the output resolution with a jittered camera,
// and a temporal upscaler (TAAU: Karis 2014, FSR 2's resolve) rebuilds a full-resolution image from
// the last frames, so a frame rendered at 60% of the pixels reads sharper than native-plus-SMAA.
// The input scale is the resolution setting, which dynamic resolution may lower to hold the rate.

import { bilateralBlur } from "three/addons/tsl/display/BilateralBlurNode.js";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { godrays } from "three/addons/tsl/display/GodraysNode.js";
import { ao } from "three/addons/tsl/display/GTAONode.js";
import { sharpen } from "three/addons/tsl/display/SharpenNode.js";
import { sss } from "three/addons/tsl/display/SSSNode.js";
import { taau } from "three/addons/tsl/display/TAAUNode.js";
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
  perspectiveDepthToViewZ,
  pow,
  screenCoordinate,
  screenUV,
  smoothstep,
  uniform,
  vec2,
  vec3,
  vec4,
  velocity,
} from "three/tsl";
import * as THREE from "three/webgpu";
import { SCALE_MIN, type Video } from "../video";
import type { MoodState } from "./mood";

type V3 = ReturnType<typeof vec3>;

/** The lens for the video settings `v` (video.ts): upscaling, occlusion, shafts, contact shadows, scale. */
export function makePost(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  mood: MoodState,
  v: Video,
) {
  const pipe = new THREE.RenderPipeline(renderer);
  pipe.outputColorTransform = false;
  const scenePass = pass(scene, camera);
  // every stage that holds render targets, freed together when the settings change (main.ts)
  const owned: { dispose(): void }[] = [scenePass];
  const temporal = v.aa > 0;
  // what the later stages read besides the colour: normals for the occlusion, motion for the upscaler
  if (temporal || v.ao > 0)
    scenePass.setMRT(
      mrt({ output, ...(v.ao > 0 ? { normal: normalView } : {}), ...(temporal ? { velocity } : {}) }),
    );
  const raw = scenePass.getTextureNode("output");
  const depth = scenePass.getTextureNode("depth");
  // the image every later stage reads: upscaled and settled over frames, or the raw pass on Low
  let col: THREE.TextureNode = raw;
  if (temporal) {
    const t = taau(raw, depth, scenePass.getTextureNode("velocity"), camera);
    // grass and leaves move in the vertex shader, which the velocity can't see: trust the
    // current frame a little more than the default so they don't smear
    t.currentFrameWeight = 0.06;
    owned.push(t);
    col = t.getTextureNode();
  }
  const u = mood.u;
  // where the sun is on screen (x, y in uv; z: 1 in front of the camera, 0 behind)
  const sunUV = uniform(new THREE.Vector3());
  const aspect = uniform(1);
  const camNear = uniform(camera.near),
    camFar = uniform(camera.far);

  let aoTex: THREE.TextureNode | null = null;
  if (v.ao > 0) {
    const a = ao(depth, scenePass.getTextureNode("normal"), camera);
    a.resolutionScale = 0.5;
    a.radius.value = v.ao > 2 ? 0.7 : 0.5;
    a.thickness.value = 1.5;
    a.samples.value = [0, 6, 12, 16][v.ao];
    owned.push(a);
    aoTex = a.getTextureNode();
  }
  let rays: THREE.TextureNode | null = null;
  if (v.shafts > 0) {
    const g = godrays(depth, camera, mood.sun);
    g.raymarchSteps.value = [0, 20, 40, 60][v.shafts];
    g.density.value = 0.9;
    g.maxDensity.value = 0.85;
    g.distanceAttenuation.value = 1.5;
    const b = bilateralBlur(g.getTextureNode());
    owned.push(g, b);
    rays = b.getTextureNode();
  }
  // contact shadows: the short shadows the shadow map's texels are too coarse for, under stones, at
  // the foot of walls, between blades
  let contact: THREE.TextureNode | null = null;
  if (v.contact > 0) {
    const s = sss(depth, camera, mood.sun);
    s.maxDistance.value = 0.6;
    s.thickness.value = 0.06;
    s.quality.value = v.contact > 1 ? 0.6 : 0.4;
    s.resolutionScale = 0.5;
    s.useTemporalFiltering = temporal;
    owned.push(s);
    contact = s.getTextureNode();
  }
  const bl = bloom(col, 1, 0.65, 0.25);
  owned.push(bl);

  const graded = Fn(() => {
    const c = col.rgb.toVar();
    if (aoTex) c.mulAssign(mix(float(1), aoTex.sample(screenUV).r, 0.8));
    if (contact) {
      // near only: far off, the march is noise at the scale of a pixel
      const z = perspectiveDepthToViewZ(depth.sample(screenUV).r, camNear, camFar).negate();
      c.mulAssign(mix(float(1), contact.sample(screenUV).r, smoothstep(45, 20, z).mul(0.5)));
    }
    if (rays) {
      // forward scattering: the shafts are strongest looking toward the sun
      const d = screenUV.sub(sunUV.xy).mul(vec2(aspect, 1)).length();
      const phase = exp(d.mul(-2.6)).mul(2.4).mul(sunUV.z).add(0.3);
      const tint = mix(u.sunColor, u.fogColor.mul(2), 0.25);
      // the sky already carries its own scattering: shafts are air between here and the ground
      // (none on the sky itself: there the march ends at the shadow box and draws its edge)
      const ground = smoothstep(1, 0.9995, depth.sample(screenUV).r);
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
    t.assign(mix(vec3(l), t, u.saturation.mul(0.93)).add(vec3(0, 0.002, 0.007).add(u.lift)));
    // split tone: shadows lean cold steel, highlights a little warm, so a fire or a lit window is
    // the warmest thing in a cold frame
    t.mulAssign(mix(vec3(0.93, 0.98, 1.06), vec3(1.03, 1.0, 0.96), smoothstep(0.06, 0.6, l)));
    const s = pow(t.max(0), vec3(1 / 2.2)) as unknown as V3;
    const n = interleavedGradientNoise(screenCoordinate.xy)
      .add(interleavedGradientNoise(screenCoordinate.xy.add(37)))
      .sub(1);
    return vec4(s.add(n.div(255)), 1);
  })();
  // the upscaler's resolve is soft: a contrast-adaptive sharpen gives the detail back (more of it
  // the further the image was scaled up)
  const sharpness = uniform(0.6);
  if (temporal) {
    const sh = sharpen(graded, sharpness);
    owned.push(sh);
    pipe.outputNode = sh;
  } else pipe.outputNode = graded;

  // Resolution: `ratio` is the share of the display's own pixels the scene renders. With the
  // upscaler the canvas keeps the display's pixels (more, over 100%, which the page scales down) and
  // only the scene pass shrinks; without it the canvas itself is scaled. Dynamic resolution moves the
  // ratio between half the setting (never under 33%) and the setting to hold the frame time.
  const dpr = window.devicePixelRatio;
  let ceil = 1,
    lo = 1,
    out = 1,
    ratio = 1,
    dynamic = true,
    acc = 0,
    frames = 0,
    target = 1000 / 60,
    pinned = false;
  const apply = () => {
    if (temporal) scenePass.setResolutionScale(ratio / out);
    else renderer.setPixelRatio(dpr * ratio);
  };
  /** The resolution scale (share of the display's pixels, 0.33..2) and whether it may drop. */
  function setScale(scale: number, dyn: boolean) {
    // the canvas can't pass the GPU's 8192 px texture limit
    ceil = Math.min(scale, 8192 / (Math.max(innerWidth, innerHeight) * dpr));
    lo = Math.min(ceil, Math.max(SCALE_MIN, ceil * 0.5));
    out = temporal ? Math.max(1, ceil) : 1;
    if (temporal) renderer.setPixelRatio(dpr * out);
    sharpness.value = ceil >= 1 ? 0.45 : 0.6;
    dynamic = dyn;
    ratio = ceil;
    acc = frames = 0;
    apply();
  }
  setScale(v.scale, v.dynamic);
  function adapt(dt: number) {
    if (pinned || !dynamic) return;
    acc += dt;
    frames++;
    if (acc < 0.75) return;
    const ms = (acc / frames) * 1000;
    acc = frames = 0;
    let next = ratio;
    if (ms > target * 1.12) next = Math.max(lo, ratio * Math.sqrt(target / ms));
    else if (ms < target * 0.85) next = Math.min(ceil, ratio * 1.06);
    if (Math.abs(next - ratio) > 0.02) {
      ratio = next;
      apply();
    }
  }
  const sp = new THREE.Vector3();
  function frame() {
    sp.copy(camera.position).addScaledVector(u.sunDir.value, 1000).project(camera);
    const front = sp.z < 1 ? 1 : 0;
    sunUV.value.set(sp.x * 0.5 + 0.5, 0.5 - sp.y * 0.5, front);
    aspect.value = camera.aspect;
  }
  return {
    pipe,
    adapt,
    frame,
    setScale,
    /** Share of the display's pixels the scene renders now. */
    get ratio() {
      return ratio;
    },
    /** Holds the resolution at `r` (for comparing frames at fixed poses), or frees it with null. */
    pin(r: number | null) {
      pinned = r !== null;
      if (r !== null) {
        ratio = r;
        apply();
      }
    },
    /** Frame time to hold: the display's refresh or the frame-rate cap, whichever is slower (main.ts). */
    set target(ms: number) {
      target = ms;
    },
    dispose() {
      for (const o of owned) o.dispose();
      pipe.dispose();
    },
  };
}
