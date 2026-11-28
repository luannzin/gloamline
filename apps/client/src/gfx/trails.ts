// Trails in the snow: a 51.2 m square around the camera, 1024 texels a side (5 cm), holding how far
// the snow has been pressed down there, in metres (0.6 m at 255). Everyone's body ploughs a trench
// through it, each foot presses a print into the trench's floor, the edges break up in clods. The
// ground under the camera is a real surface displaced by it (terrain.ts: the snow layer), with the
// snow pushed aside heaped in a rim along the trench (read from the mipmaps: a blur for free); the
// grass in it lies flat (grass.ts); feet sink to its floor (main.ts). A trodden trail is firm going.
// The square follows the camera in steps of 8 texels, and falling snow fills old tracks back in.
import { uniform } from "three/tsl";
import * as THREE from "three/webgpu";

const N = 1024,
  SPAN = 51.2,
  TEXEL = SPAN / N,
  /** the square moves in whole steps of this many texels (the snow layer's grid lands on itself) */
  SNAP = 8,
  /** metres of pressed snow at 255 */
  DEEPEST = 0.6;

type Walker = { x: number; z: number; walked: number; side: number };

const hash = (i: number, j: number) => ((Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0) / 4294967296;
/** Value noise over world texels (i, j), 0..1, in lumps about 20 cm across. */
function lumps(i: number, j: number) {
  const x = i / 4,
    y = j / 4,
    x0 = Math.floor(x),
    y0 = Math.floor(y),
    u = x - x0,
    v = y - y0,
    su = u * u * (3 - 2 * u),
    sv = v * v * (3 - 2 * v);
  const a = hash(x0, y0) + (hash(x0 + 1, y0) - hash(x0, y0)) * su,
    b = hash(x0, y0 + 1) + (hash(x0 + 1, y0 + 1) - hash(x0, y0 + 1)) * su;
  return a + (b - a) * sv;
}

export function makeTrails() {
  const data = new Uint8Array(N * N);
  const tex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  /** the square's world corner (min x, min z) */
  const origin = uniform(new THREE.Vector2(-SPAN / 2, -SPAN / 2));
  let ox = Number.NaN,
    oz = 0,
    dirty = false,
    filled = false,
    fillRow = 0,
    fillAcc = 0,
    upT = 0;
  const walkers = new Map<string, Walker>();
  /** where the last print was pressed (x, z), for the snow kicked up by it */
  const print = new Float32Array(2);

  /**
   * Presses an oval (half-sizes a across, b along `dir`) to `metres`, keeping deeper marks. `rough`
   * breaks the edge into clods (0 a clean edge).
   */
  function press(
    x: number,
    z: number,
    dx: number,
    dz: number,
    a: number,
    b: number,
    metres: number,
    rough: number,
  ) {
    const depth = (metres / DEEPEST) * 255,
      cx = (x - ox) / TEXEL,
      cz = (z - oz) / TEXEL,
      r = Math.ceil((Math.max(a, b) * (1 + rough)) / TEXEL) + 1;
    for (let j = Math.max(0, Math.floor(cz - r)); j <= Math.min(N - 1, Math.ceil(cz + r)); j++)
      for (let i = Math.max(0, Math.floor(cx - r)); i <= Math.min(N - 1, Math.ceil(cx + r)); i++) {
        const px = (i - cx) * TEXEL,
          pz = (j - cz) * TEXEL;
        const along = px * dx + pz * dz,
          across = -px * dz + pz * dx;
        // clods: the edge pushed in and out by a smooth noise of the texel's place in the world
        // (stable as the square moves)
        const h = lumps(i + Math.round(ox / TEXEL), j + Math.round(oz / TEXEL));
        const q = ((across / a) ** 2 + (along / b) ** 2) * (1 + (h - 0.5) * rough);
        if (q >= 1) continue;
        // a rounded floor with soft walls
        const v = Math.round(depth * (1 - q * q));
        const k = j * N + i;
        if (v > data[k]) data[k] = v;
      }
    dirty = true;
  }

  /** Moves the square under (x, z) in whole steps, dropping what falls off its edge. */
  function follow(x: number, z: number) {
    const step = TEXEL * SNAP;
    const nx = Math.round((x - SPAN / 2) / step) * step,
      nz = Math.round((z - SPAN / 2) / step) * step;
    if (Number.isNaN(ox)) {
      ox = nx;
      oz = nz;
      origin.value.set(ox, oz);
    }
    // re-centre only once it's 8 m off, so the copy is rare
    if (Math.abs(x - (ox + SPAN / 2)) < 8 && Math.abs(z - (oz + SPAN / 2)) < 8) return;
    const si = Math.round((nx - ox) / TEXEL),
      sj = Math.round((nz - oz) / TEXEL);
    const old = data.slice();
    data.fill(0);
    for (let j = 0; j < N; j++) {
      const oj = j + sj;
      if (oj < 0 || oj >= N) continue;
      const i0 = Math.max(0, -si),
        i1 = Math.min(N, N - si);
      if (i1 > i0) data.set(old.subarray(oj * N + i0 + si, oj * N + i1 + si), j * N + i0);
    }
    ox = nx;
    oz = nz;
    origin.value.set(ox, oz);
    dirty = true;
  }

  /** Pressed depth at (x, z) in metres, bilinear; 0 off the square. */
  function depthAt(x: number, z: number) {
    const fx = (x - ox) / TEXEL - 0.5,
      fz = (z - oz) / TEXEL - 0.5;
    const i = Math.floor(fx),
      j = Math.floor(fz);
    if (!(i >= 0 && j >= 0 && i < N - 1 && j < N - 1)) return 0;
    const u = fx - i,
      v = fz - j,
      k = j * N + i;
    const a = data[k] + (data[k + 1] - data[k]) * u,
      b = data[k + N] + (data[k + N + 1] - data[k + N]) * u;
    return ((a + (b - a) * v) / 255) * DEEPEST;
  }

  return {
    texture: tex,
    origin,
    span: SPAN,
    deepest: DEEPEST,
    print,
    depthAt,
    /**
     * Someone (`id`) is at (x, z) facing `heading` (radians, clockwise from north) in snow `depth`
     * deep (0..1, main.ts). Ploughs the trench as they go and presses a print every stride, left
     * and right. Returns true when a print was pressed (at `print`).
     */
    walk(id: string, x: number, z: number, heading: number, depth: number) {
      let w = walkers.get(id);
      if (!w) {
        w = { x, z, walked: 0, side: 1 };
        walkers.set(id, w);
      }
      const d = Math.hypot(x - w.x, z - w.z);
      // a teleport or a jump across the map leaves no line
      if (d > 4 || depth < 0.12) {
        w.x = x;
        w.z = z;
        return false;
      }
      if (d < 0.06) return false;
      const fx = Math.sin(heading),
        fz = -Math.cos(heading);
      // the trench: as deep as the snow takes a body (to the knee at the deepest), as wide as two legs
      press(x, z, fx, fz, 0.36, 0.4, depth * 0.42, 0.35 * depth);
      w.walked += d;
      // a stride in deep snow is short
      const stride = 0.75 - 0.25 * depth;
      let pressed = false;
      if (w.walked > stride) {
        w.walked = 0;
        w.side = -w.side;
        const px = x - fz * 0.13 * w.side + fx * 0.1,
          pz = z + fx * 0.13 * w.side + fz * 0.1;
        // the ball of the foot and the heel, a little deeper than the trench's floor
        press(px + fx * 0.06, pz + fz * 0.06, fx, fz, 0.07, 0.1, depth * 0.52, 0.2);
        press(px - fx * 0.09, pz - fz * 0.09, fx, fz, 0.06, 0.07, depth * 0.5, 0.2);
        print[0] = px;
        print[1] = pz;
        pressed = true;
      }
      w.x = x;
      w.z = z;
      return pressed;
    },
    forget(id: string) {
      walkers.delete(id);
    },
    /** Follows the camera; falling snow (0..1) fills the tracks back in over a few minutes. */
    update(dt: number, x: number, z: number, snowfall: number) {
      follow(x, z);
      // a row at a time, so the whole square loses one step every 1.2 s of snowfall without a hitch
      fillAcc += dt * N * ((0.3 + snowfall) / 1.2);
      let rows = Math.floor(fillAcc);
      fillAcc -= rows;
      rows = Math.min(rows, N);
      for (let r = 0; r < rows; r++) {
        const o = fillRow * N;
        for (let k = o; k < o + N; k++) if (data[k]) data[k]--;
        fillRow = (fillRow + 1) % N;
      }
      if (rows) filled = true;
      // (1 MB a time: twenty uploads a second is plenty for feet, two for the snow filling in)
      upT += dt;
      if ((dirty && upT > 0.05) || (filled && upT > 0.5)) {
        tex.needsUpdate = true;
        dirty = filled = false;
        upT = 0;
      }
    },
  };
}

export type Trails = ReturnType<typeof makeTrails>;
