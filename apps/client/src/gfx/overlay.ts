// What's drawn over the settled image rather than in it: the specks in the air (particles.ts) and
// the puffs (puffs.ts). Tiny, fast and see-through, they have no place in the temporal upscaler's
// history (it would erase them as noise) or in the normals the occlusion reads (it would shade a
// square behind each). So they go in a scene of their own, drawn after the upscale at the output's
// resolution (post.ts), each fading where the world in front of it is near: soft against the ground,
// hidden behind a wall.
import {
  cameraFar,
  cameraNear,
  float,
  perspectiveDepthToViewZ,
  positionView,
  screenUV,
  smoothstep,
  texture,
} from "three/tsl";
import * as THREE from "three/webgpu";

export const overlay = new THREE.Scene();

/**
 * The world's depth under this pixel, from the scene's pass (post.ts sets its texture when the lens
 * is built). One node shared by every material, read as is: a `.sample()` would copy it, and the
 * copy would keep the texture it had then.
 */
export const sceneDepth = texture(new THREE.DepthTexture(1, 1), screenUV);

/** 1 where the world is more than `soft` metres behind this fragment, 0 where it's in front. */
export function behindWorld(soft: number | THREE.Node<"float">) {
  const world = perspectiveDepthToViewZ(sceneDepth.r, cameraNear, cameraFar);
  // (view z is negative ahead: the fragment's minus the world's is how far behind it the world lies)
  return smoothstep(float(0), typeof soft === "number" ? float(soft) : soft, positionView.z.sub(world));
}

/** Blending for light added to the image (embers, fireflies): adds colour, never covers it. */
export function additive(m: THREE.Material) {
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneFactor;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
}
