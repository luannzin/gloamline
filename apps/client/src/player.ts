// First person on foot. The body is a vertical capsule that walks on the heightmap, stands on rocks,
// rubble and wall tops, slides around trunks and stone, and is pushed out of the Hollow's rock by its
// distance field. Movement runs in short substeps so nothing thin can be walked through.
import { BLOCK, caveAt, HALF, heightAt, WATER_Y, type World } from "@zimovye/world";
import * as THREE from "three/webgpu";

const R = 0.38,
  EYE = 1.62,
  STEP = 0.5,
  CELL = 8,
  NC = (HALF * 2) / CELL;

type Obstacles = {
  /** circles: x, z, radius, top (Infinity: a trunk) */
  circles: Float32Array;
  /** cell index -> circle ids and block ids */
  cells: Map<number, { c: number[]; b: number[] }>;
};

function index(w: World): Obstacles {
  const list: number[] = [];
  const add = (k: keyof World["props"], r: number, top: (y: number, s: number) => number) => {
    const p = w.props[k];
    for (let i = 0; i < p.length; i += 5) list.push(p[i], p[i + 2], r * p[i + 4], top(p[i + 1], p[i + 4]));
  };
  add("oak", 0.75, () => Infinity);
  add("pine", 0.35, () => Infinity);
  add("dead", 0.4, () => Infinity);
  add("rock", 1.05, (y, s) => y + 0.7 * s);
  add("crag", 1.7, (y, s) => y + 0.75 * s);
  add("stone", 0.55, () => Infinity);
  const circles = new Float32Array(list);
  const cells = new Map<number, { c: number[]; b: number[] }>();
  const cell = (cx: number, cz: number) => {
    const k = cz * NC + cx;
    let e = cells.get(k);
    if (!e) {
      e = { c: [], b: [] };
      cells.set(k, e);
    }
    return e;
  };
  const span = (x: number, z: number, r: number, f: (e: { c: number[]; b: number[] }) => void) => {
    for (let cz = Math.floor((z - r + HALF) / CELL); cz <= Math.floor((z + r + HALF) / CELL); cz++)
      for (let cx = Math.floor((x - r + HALF) / CELL); cx <= Math.floor((x + r + HALF) / CELL); cx++)
        f(cell(cx, cz));
  };
  for (let i = 0; i < circles.length / 4; i++)
    span(circles[i * 4], circles[i * 4 + 1], circles[i * 4 + 2], (e) => e.c.push(i));
  const B = w.solid;
  for (let i = 0; i < B.length / BLOCK; i++) {
    if (!B[i * BLOCK + 8]) continue;
    const o = i * BLOCK,
      r = Math.hypot(B[o + 3], B[o + 5]) / 2;
    span(B[o], B[o + 2], r, (e) => e.b.push(i));
  }
  return { circles, cells };
}

/**
 * `canRun`: whether the body has the breath for it (body.ts); `footing`: how much fresh snow is in
 * the way of the next step, 0..1 (it slows the walk to a trudge); `pressed`: how far the snow under
 * the feet is pressed down, metres (the feet stand on the trench's floor: trails.ts).
 */
export function makePlayer(
  world: World,
  camera: THREE.PerspectiveCamera,
  dom: HTMLElement,
  canRun: () => boolean,
  footing: (dx: number, dz: number) => number,
  pressed: () => number,
) {
  const obs = index(world);
  const pos = new THREE.Vector3(world.spawn[0], world.spawn[1], world.spawn[2]);
  const vel = new THREE.Vector3();
  let yaw = 0,
    pitch = 0,
    onGround = false,
    fly = false,
    running = false,
    bob = 0,
    breath = 0,
    // the view: 0 through your own eyes, 1 over your shoulder (V), eased between. Over the shoulder
    // first: it's where the menu's camera lands (stage.ts)
    behind = 1,
    wantBehind = true;
  const keys = new Set<string>();
  // the ruins' solid stones and the village's walls (world: index.ts)
  const B = world.solid;

  addEventListener("keydown", (e) => {
    keys.add(e.code);
    if (e.code === "KeyV" && e.shiftKey) fly = !fly;
    else if (e.code === "KeyV" && !e.repeat) wantBehind = !wantBehind;
  });
  addEventListener("keyup", (e) => keys.delete(e.code));
  addEventListener("blur", () => keys.clear());
  let drag = false;
  dom.addEventListener("mousedown", () => (drag = true));
  addEventListener("mouseup", () => (drag = false));
  dom.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== dom && !drag) return;
    yaw -= e.movementX * 0.0022;
    pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * 0.0022));
  });

  /** Highest thing to stand on under (x, z) that the feet at y can step onto. */
  function ground(x: number, z: number, y: number) {
    let g = heightAt(world.ground.height, x, z);
    if (g < WATER_Y - 1.3) g = WATER_Y - 1.3; // wade, don't sink
    const e = obs.cells.get(Math.floor((z + HALF) / CELL) * NC + Math.floor((x + HALF) / CELL));
    if (!e) return g;
    for (const i of e.c) {
      const top = obs.circles[i * 4 + 3];
      if (top === Infinity || top > y + STEP || top <= g) continue;
      if (Math.hypot(x - obs.circles[i * 4], z - obs.circles[i * 4 + 1]) < obs.circles[i * 4 + 2] * 0.85)
        g = top;
    }
    for (const i of e.b) {
      const o = i * BLOCK,
        top = B[o + 1] + B[o + 4] / 2;
      if (top > y + STEP || top <= g) continue;
      const c = Math.cos(-B[o + 6]),
        s = Math.sin(-B[o + 6]),
        dx = x - B[o],
        dz = z - B[o + 2];
      const lx = dx * c - dz * s,
        lz = dx * s + dz * c;
      if (Math.abs(lx) < B[o + 3] / 2 + 0.1 && Math.abs(lz) < B[o + 5] / 2 + 0.1) g = top;
    }
    return g;
  }

  /** Pushes the body out of trunks, stones and walls it can't step onto. */
  function push() {
    const e = obs.cells.get(Math.floor((pos.z + HALF) / CELL) * NC + Math.floor((pos.x + HALF) / CELL));
    if (!e) return;
    for (const i of e.c) {
      const top = obs.circles[i * 4 + 3];
      if (top <= pos.y + STEP) continue;
      const dx = pos.x - obs.circles[i * 4],
        dz = pos.z - obs.circles[i * 4 + 1],
        d = Math.hypot(dx, dz),
        m = obs.circles[i * 4 + 2] + R;
      if (d < m && d > 1e-4) {
        pos.x += (dx / d) * (m - d);
        pos.z += (dz / d) * (m - d);
      }
    }
    for (const i of e.b) {
      const o = i * BLOCK,
        top = B[o + 1] + B[o + 4] / 2,
        bottom = B[o + 1] - B[o + 4] / 2;
      if (top <= pos.y + STEP || bottom > pos.y + 1.8) continue;
      const yawB = B[o + 6],
        c = Math.cos(-yawB),
        s = Math.sin(-yawB),
        dx = pos.x - B[o],
        dz = pos.z - B[o + 2];
      const lx = dx * c - dz * s,
        lz = dx * s + dz * c,
        hx = B[o + 3] / 2,
        hz = B[o + 5] / 2;
      const qx = Math.max(-hx, Math.min(hx, lx)),
        qz = Math.max(-hz, Math.min(hz, lz));
      let ox = lx - qx,
        oz = lz - qz;
      const d = Math.hypot(ox, oz);
      if (d >= R) continue;
      if (d < 1e-4) {
        // inside: leave by the nearest face
        const ex = hx - Math.abs(lx),
          ez = hz - Math.abs(lz);
        if (ex < ez) {
          ox = Math.sign(lx) * (ex + R);
          oz = 0;
        } else {
          oz = Math.sign(lz) * (ez + R);
          ox = 0;
        }
      } else {
        ox = (ox / d) * (R - d);
        oz = (oz / d) * (R - d);
      }
      const cr = Math.cos(yawB),
        sr = Math.sin(yawB);
      pos.x += ox * cr - oz * sr;
      pos.z += ox * sr + oz * cr;
    }
  }

  /** Out of the Hollow's rock, along the field's gradient. Returns true when standing on it. */
  function rock() {
    let standing = false;
    for (const up of [0.45, 1.0, 1.45]) {
      const x = pos.x,
        y = pos.y + up,
        z = pos.z;
      const d = caveAt(world.field, x, y, z);
      if (d >= R + 0.1) continue;
      const e = 0.4;
      let gx = caveAt(world.field, x + e, y, z) - caveAt(world.field, x - e, y, z);
      let gy = caveAt(world.field, x, y + e, z) - caveAt(world.field, x, y - e, z);
      let gz = caveAt(world.field, x, y, z + e) - caveAt(world.field, x, y, z - e);
      const l = Math.hypot(gx, gy, gz);
      if (l < 1e-5) continue;
      gx /= l;
      gy /= l;
      gz /= l;
      const m = R + 0.1 - d;
      pos.x += gx * m;
      pos.y += gy * m;
      pos.z += gz * m;
      const vn = vel.x * gx + vel.y * gy + vel.z * gz;
      if (vn < 0) {
        vel.x -= gx * vn;
        vel.y -= gy * vn;
        vel.z -= gz * vn;
      }
      if (gy > 0.55 && up < 0.5) standing = true;
    }
    return standing;
  }

  const fwd = new THREE.Vector3(),
    right = new THREE.Vector3(),
    head = new THREE.Vector3(),
    look = new THREE.Vector3(),
    eye = new THREE.Vector3();
  let deep = 0,
    sunk = 0,
    moving = 0,
    camReach = 3.4;

  /** Whether a point (the camera) is inside a trunk, a stone or a wall, with a margin. */
  function inside(p: THREE.Vector3) {
    const e = obs.cells.get(Math.floor((p.z + HALF) / CELL) * NC + Math.floor((p.x + HALF) / CELL));
    if (!e) return false;
    for (const i of e.c) {
      if (obs.circles[i * 4 + 3] < p.y) continue;
      if (Math.hypot(p.x - obs.circles[i * 4], p.z - obs.circles[i * 4 + 1]) < obs.circles[i * 4 + 2] + 0.3)
        return true;
    }
    for (const i of e.b) {
      const o = i * BLOCK;
      if (Math.abs(p.y - B[o + 1]) > B[o + 4] / 2 + 0.2) continue;
      const c = Math.cos(-B[o + 6]),
        s = Math.sin(-B[o + 6]),
        dx = p.x - B[o],
        dz = p.z - B[o + 2];
      if (Math.abs(dx * c - dz * s) < B[o + 3] / 2 + 0.2 && Math.abs(dx * s + dz * c) < B[o + 5] / 2 + 0.2)
        return true;
    }
    return false;
  }
  function update(dt: number, active: boolean) {
    const k = (c: string) => (active && keys.has(c) ? 1 : 0);
    fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const mx = k("KeyD") - k("KeyA"),
      mz = k("KeyW") - k("KeyS");
    const run = (k("ShiftLeft") || k("ShiftRight")) && (fly || canRun());
    if (fly) {
      const sp = run ? 60 : 18;
      pos.addScaledVector(fwd, mz * sp * dt).addScaledVector(right, mx * sp * dt);
      pos.y += (k("Space") - k("KeyC")) * sp * dt + mz * Math.sin(pitch) * sp * dt;
      vel.set(0, 0, 0);
    } else {
      const wet = pos.y < WATER_Y - 0.4;
      const len = Math.hypot(mx, mz) || 1;
      const dx = (fwd.x * mz + right.x * mx) / len,
        dz = (fwd.z * mz + right.z * mx) / len;
      // a walk at a walker's pace and a run at a runner's (the body's clips are motion capture: these
      // keep its feet from sliding). Deep snow takes half of either; a trodden trail or a road gives
      // it back (footing reads the snow a stride ahead, where the next step goes)
      deep +=
        ((onGround ? footing(mx || mz ? dx : 0, mx || mz ? dz : 0) : deep) - deep) * Math.min(1, dt * 3);
      // and each step is pulled out of the drift: the pace surges as a foot lands and sags as the
      // other drags through
      const surge = 1 - 0.25 * deep * (0.5 + 0.5 * Math.cos(bob * 2));
      // each way at the pace its clip was captured at, so the feet keep to the ground: forward 1.6 m/s
      // (4.3 running), back 1.05 (no running back), a sidestep 1.65 (4.3 running)
      const ahead = mz > 0 ? (run ? 4.3 : 1.6) : mz < 0 ? 1.05 : 0;
      const aside = run && mz >= 0 ? 4.3 : 1.65;
      const pace = mz && mx ? (ahead + aside) / 2 : mz ? ahead : aside;
      const speed = pace * (1 - 0.5 * deep) * (wet ? 0.6 : 1) * surge;
      const wx = dx * speed,
        wz = dz * speed;
      // starting, stopping and turning are slow in a drift: the snow holds the legs
      const acc = onGround ? 14 * (1 - 0.65 * deep) : 2.5;
      vel.x += (wx - vel.x) * Math.min(1, acc * dt);
      vel.z += (wz - vel.z) * Math.min(1, acc * dt);
      vel.y -= 22 * dt;
      if (onGround && k("Space")) {
        vel.y = 6.4;
        onGround = false;
      }
      const n = Math.ceil((Math.hypot(vel.x, vel.y, vel.z) * dt) / 0.25) || 1;
      const was = onGround;
      onGround = false;
      for (let i = 0; i < n; i++) {
        pos.addScaledVector(vel, dt / n);
        push();
        if (rock()) onGround = true;
        const g = ground(pos.x, pos.z, pos.y);
        if (pos.y <= g + 0.02 || (was && vel.y <= 0 && pos.y - g < 0.4)) {
          pos.y = g;
          if (vel.y < 0) vel.y = 0;
          onGround = true;
        }
      }
      pos.x = Math.max(-HALF + 40, Math.min(HALF - 40, pos.x));
      pos.z = Math.max(-HALF + 40, Math.min(HALF - 40, pos.z));
      moving = Math.hypot(vel.x, vel.z);
      // a step every half turn of `bob`; in deep snow the stride is short (trails.ts) and each step a
      // high, slow one
      if (onGround && moving > 0.3) bob += (dt * moving * Math.PI) / (0.75 - 0.25 * deep);
      running = !!run && moving > 2.4 * (1 - 0.5 * deep);
      // the feet stand on the trench's floor
      sunk += ((onGround ? pressed() : 0) - sunk) * Math.min(1, dt * 2.5);
    }
    breath += dt;
    // a body breathing and walking: two slow sines and a small step bob, a little more trudging.
    // Over the shoulder the camera rides steady (a follow camera, not a head): the body does the
    // moving, the bob is mostly gone
    behind += ((wantBehind ? 1 : 0) - behind) * Math.min(1, dt * 7);
    const e = behind * behind * (3 - 2 * behind);
    const calm = 1 - 0.8 * e;
    const by = Math.abs(Math.sin(bob)) * 0.02 * (1 + 0.3 * deep) * calm + Math.sin(breath * 1.3) * 0.006;
    const bx = Math.cos(bob) * 0.01 * (1 + 0.3 * deep) * calm;
    // (the sinking is eased too: steps in and out of a trench don't jolt the view)
    head.set(pos.x + right.x * bx, pos.y - sunk + EYE + by, pos.z + right.z * bx);
    if (e > 0.001) {
      look.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      // pulled in where the ground, a trunk, a stone or a wall would come between (fast in, slowly
      // back out, so passing a tree doesn't snap the view)
      let reach = 3.4;
      for (let s = 1; s <= 12; s++) {
        const d = (3.4 * s) / 12;
        eye
          .copy(head)
          .addScaledVector(look, -d)
          .addScaledVector(right, 0.55 * (s / 12));
        if (eye.y < heightAt(world.ground.height, eye.x, eye.z) + 0.35 || inside(eye)) {
          reach = Math.max(0.5, d - 0.45);
          break;
        }
      }
      camReach += (reach - camReach) * Math.min(1, dt * (reach < camReach ? 18 : 2.5));
      eye
        .copy(head)
        .addScaledVector(look, -camReach)
        .addScaledVector(right, 0.55 * Math.min(1, camReach / 3.4));
      eye.y += 0.15;
      camera.position.lerpVectors(head, eye, e);
    } else camera.position.copy(head);
    camera.rotation.set(
      pitch + Math.sin(breath * 0.9) * 0.002,
      yaw + Math.sin(breath * 0.63) * 0.002,
      Math.cos(bob) * 0.004 * (1 - e),
      "YXZ",
    );
  }

  function teleport(x: number, z: number, tx: number, ty: number, tz: number, y?: number) {
    pos.set(x, y ?? ground(x, z, 1e4), z);
    vel.set(0, 0, 0);
    yaw = Math.atan2(-(tx - x), -(tz - z));
    pitch = Math.atan2(ty - (pos.y + EYE), Math.hypot(tx - x, tz - z));
  }

  return {
    pos,
    update,
    teleport,
    get yaw() {
      return yaw;
    },
    get running() {
      return running && !fly;
    },
    /** how far the feet have sunk into the snow, metres */
    get sunk() {
      return sunk;
    },
    /** how much fresh snow the legs push through, 0..1 */
    get deep() {
      return deep;
    },
    /** speed over the ground, m/s */
    get speed() {
      return moving;
    },
    /** which way the body is going, in its own frame: x to the right, y ahead (m/s) */
    get side() {
      return vel.x * right.x + vel.z * right.z;
    },
    get ahead() {
      return vel.x * fwd.x + vel.z * fwd.z;
    },
    /** where the eyes look, radians up */
    get pitch() {
      return pitch;
    },
    /** the stride's phase: a step lands every half turn */
    get stride() {
      return bob;
    },
    get grounded() {
      return onGround && !fly;
    },
    /** 0 first person .. 1 over the shoulder */
    get behind() {
      return behind;
    },
  };
}
