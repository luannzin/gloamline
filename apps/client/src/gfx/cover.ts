// What the snow can't fall through: a depth map looking down the way the snow falls, tilted by the
// wind, 48 m round the camera, of everything that roofs the ground (the village, the keep, the
// mine's rock, the crowns). A flake below the first surface along its fall is under cover and isn't
// drawn; one reaching a surface flattens into a splat (particles.ts). The tilt leaves the lee of
// every wall clear for nothing. Redrawn, like the shadow map, only after the camera has moved 4 m
// or the wind has turned; placed meshes keep their positionNode in the pass (the renderer copies it
// onto the override, as it does for the shadow pass).
import { Fn, float, int, ivec2, select, textureLoad, uniform, vec2 } from "three/tsl";
import * as THREE from "three/webgpu";
import type { Wind } from "./wind";

/** The layer the cover's camera sees: whatever stops snow enables it (`roofs`). */
export const COVER = 3;
const N = 512,
  SPAN = 48,
  /** the camera stands this far back up the fall from the map's centre, and sees twice as deep */
  BACK = 60;

/** Marks everything under `o` as stopping snow. */
export function roofs<T extends THREE.Object3D>(o: T) {
  o.traverse((c) => c.layers.enable(COVER));
  return o;
}

type V3 = THREE.Node<"vec3">;

export function makeCover(renderer: THREE.WebGPURenderer, scene: THREE.Scene, wind: Wind) {
  const depthTexture = new THREE.DepthTexture(N, N);
  depthTexture.type = THREE.FloatType;
  const target = new THREE.RenderTarget(N, N, { depthBuffer: true, depthTexture });
  const cam = new THREE.OrthographicCamera(-SPAN / 2, SPAN / 2, SPAN / 2, -SPAN / 2, 0, BACK * 2);
  cam.layers.set(COVER);
  const depthOnly = new THREE.MeshBasicNodeMaterial({
    side: THREE.DoubleSide,
    colorWrite: false,
    fog: false,
  });
  const u = {
    /** the map's centre, and its axes in the world: across, up the map, and down the fall */
    origin: uniform(new THREE.Vector3()),
    right: uniform(new THREE.Vector3(1, 0, 0)),
    up: uniform(new THREE.Vector3(0, 0, 1)),
    fall: uniform(new THREE.Vector3(0, -1, 0)),
  };

  /**
   * How far below the first surface along the fall `p` lies, metres: negative above it (and far
   * negative off the map or under the open sky). Reads one texel: use it in the vertex stage.
   */
  const below = Fn(([p]: [V3]) => {
    const rel = p.sub(u.origin);
    const uv = vec2(rel.dot(u.right).div(SPAN).add(0.5), float(0.5).sub(rel.dot(u.up).div(SPAN)));
    const on = uv.x.greaterThan(0).and(uv.x.lessThan(1)).and(uv.y.greaterThan(0)).and(uv.y.lessThan(1));
    const d = textureLoad(
      depthTexture,
      ivec2(int(uv.x.clamp(0, 0.999).mul(N)), int(uv.y.clamp(0, 0.999).mul(N))),
    ).x;
    const depth = rel
      .dot(u.fall)
      .add(BACK)
      .sub(d.mul(BACK * 2));
    return select(on, depth, float(-100));
  });

  const last = new THREE.Vector3(Infinity, 0, 0),
    lastFall = new THREE.Vector3(),
    fall = new THREE.Vector3();
  let dirty = true;

  /** Redraws the map round `at` when it has moved 4 m, the snow's slant has turned, or `dirty`. */
  function update(at: THREE.Vector3) {
    const d = wind.u.dir.value,
      s = wind.slant();
    fall.set(d.x * s, -1, d.y * s).normalize();
    if (!dirty && at.distanceToSquared(last) < 16 && fall.dot(lastFall) > 0.9995) return;
    dirty = false;
    last.copy(at);
    lastFall.copy(fall);
    // the map's up is downwind on the ground, so its texels don't turn as the slant changes
    cam.up.set(d.x, 0, d.y);
    cam.position.copy(at).addScaledVector(fall, -BACK);
    cam.lookAt(at);
    cam.updateMatrixWorld();
    u.origin.value.copy(at);
    u.right.value.setFromMatrixColumn(cam.matrixWorld, 0);
    u.up.value.setFromMatrixColumn(cam.matrixWorld, 1);
    u.fall.value.copy(fall);
    const prev = renderer.getRenderTarget();
    scene.overrideMaterial = depthOnly;
    renderer.setRenderTarget(target);
    renderer.render(scene, cam);
    renderer.setRenderTarget(prev);
    scene.overrideMaterial = null;
  }

  return {
    below,
    update,
    /** The roofs changed (a new dressing): draw the map again next frame. */
    invalidate() {
      dirty = true;
    },
  };
}

export type Cover = ReturnType<typeof makeCover>;
