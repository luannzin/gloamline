// The menu's camera (DESIGN.md: the world is the menu). A shot of you standing in the world: behind
// and to the left of the survivor, low, looking out past them at what they're facing, so they stand
// in the right third and the menu reads in the clear bottom-left. The camera breathes and leans
// toward the pointer. Starting is one move, never a cut: the camera swings in to the shoulder, the
// lens widens, and the game is already running when it lands. Back to the menu is the move reversed.
import * as THREE from "three/webgpu";

const MENU_FOV = 50,
  PLAY_FOV = 70,
  /** seconds: menu to play, play back to the menu, and the first arrival after loading */
  IN = 2.4,
  OUT = 1.3,
  ARRIVE = 3.4;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOutQuint = (t: number) => 1 - (1 - t) ** 5;

/** `groundAt`: the ground's height under (x, z), so the shot never dips under a slope. */
export function makeStage(camera: THREE.PerspectiveCamera, groundAt: (x: number, z: number) => number) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let k = 0,
    to = 0,
    t = 0,
    arriveT = ARRIVE;
  const pos = new THREE.Vector3(),
    look = new THREE.Vector3(),
    playPos = new THREE.Vector3(),
    menuQ = new THREE.Quaternion(),
    playQ = new THREE.Quaternion(),
    m4 = new THREE.Matrix4(),
    mouse = new THREE.Vector2(),
    lean = new THREE.Vector2();
  addEventListener("pointermove", (e) =>
    mouse.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1),
  );

  /**
   * Blends the camera the player has just placed (at the body at x, y, z, facing `yaw`) with the menu
   * shot, by how far into play the move is. Call right after the player's update, before anything
   * reads the camera.
   */
  function update(dt: number, x: number, y: number, z: number, yaw: number) {
    t += dt;
    const still = reduced.matches;
    if (still) k = to;
    else k = to > k ? Math.min(to, k + dt / IN) : Math.max(to, k - dt / OUT);
    let fov = PLAY_FOV;
    if (k < 1) {
      const fx = -Math.sin(yaw),
        fz = -Math.cos(yaw),
        rx = Math.cos(yaw),
        rz = -Math.sin(yaw);
      lean.lerp(mouse, still ? 1 : 1 - Math.exp(-3 * dt));
      const b = still ? 0 : 1;
      pos.set(
        x - fx * 4.6 - rx * (1.9 - lean.x * 0.3),
        y + 1.15 + Math.sin(t * 0.47) * 0.03 * b - lean.y * 0.12,
        z - fz * 4.6 - rz * (1.9 - lean.x * 0.3),
      );
      look.set(x + fx * 40 + Math.sin(t * 0.21) * 0.25 * b, y + 2.2 - lean.y * 0.6, z + fz * 40);
      // the arrival after loading: from high and further back, settling into the shot
      arriveT += dt;
      if (arriveT < ARRIVE && !still) {
        const a = 1 - easeOutQuint(arriveT / ARRIVE);
        pos.x -= fx * 7 * a;
        pos.z -= fz * 7 * a;
        pos.y += 5 * a;
      }
      pos.y = Math.max(pos.y, groundAt(pos.x, pos.z) + 0.5);
      m4.lookAt(pos, look, THREE.Object3D.DEFAULT_UP);
      menuQ.setFromRotationMatrix(m4);
      const e = easeInOutCubic(k);
      playPos.copy(camera.position);
      playQ.copy(camera.quaternion);
      camera.position.lerpVectors(pos, playPos, e);
      camera.quaternion.slerpQuaternions(menuQ, playQ, e);
      fov = MENU_FOV + (PLAY_FOV - MENU_FOV) * e;
    }
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  return {
    update,
    /** Into play (true) or back to the menu (false). */
    go(play: boolean) {
      to = play ? 1 : 0;
    },
    /** Plays the arrival into the menu shot (once loading is done). */
    arrive() {
      arriveT = 0;
    },
    /** 0 the menu shot .. 1 in play */
    get k() {
      return k;
    },
  };
}
