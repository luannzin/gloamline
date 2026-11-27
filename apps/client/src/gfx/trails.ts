// Trails in the snow: a 48 m square around the camera, 512 texels a side (about 9 cm), into which
// everyone's feet are stamped: a trench where the body ploughs through, a footprint at each step,
// left and right. The ground reads it for the trench's walls, its shadowed floor and the rim of
// snow pushed aside (terrain.ts); the grass in it lies flat (grass.ts). The square follows the
// camera in whole texels, and falling snow fills the old tracks back in.

import { uniform } from "three/tsl";
import * as THREE from "three/webgpu";

const N = 512,
  SPAN = 48,
  TEXEL = SPAN / N;

type Walker = { x: number; z: number; walked: number; side: number };

export function makeTrails() {
  const data = new Uint8Array(N * N);
  const tex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  /** the square's world corner (min x, min z) */
  const origin = uniform(new THREE.Vector2(-SPAN / 2, -SPAN / 2));
  let ox = Number.NaN,
    oz = 0,
    dirty = false,
    fillT = 0,
    upT = 0;
  const walkers = new Map<string, Walker>();

  /** Presses an oval (half-sizes a across, b along `dir`) to `depth` (0..255), keeping deeper marks. */
  function press(x: number, z: number, dx: number, dz: number, a: number, b: number, depth: number) {
    const cx = (x - ox) / TEXEL,
      cz = (z - oz) / TEXEL,
      r = Math.ceil(Math.max(a, b) / TEXEL) + 1;
    for (let j = Math.max(0, Math.floor(cz - r)); j <= Math.min(N - 1, Math.ceil(cz + r)); j++)
      for (let i = Math.max(0, Math.floor(cx - r)); i <= Math.min(N - 1, Math.ceil(cx + r)); i++) {
        const px = (i - cx) * TEXEL,
          pz = (j - cz) * TEXEL;
        const along = px * dx + pz * dz,
          across = -px * dz + pz * dx;
        const q = (across / a) ** 2 + (along / b) ** 2;
        if (q >= 1) continue;
        const v = Math.round(depth * (1 - q * q));
        const k = j * N + i;
        if (v > data[k]) data[k] = v;
      }
    dirty = true;
  }

  /** Moves the square under (x, z) in whole texels, dropping what falls off its edge. */
  function follow(x: number, z: number) {
    const nx = Math.round((x - SPAN / 2) / TEXEL) * TEXEL,
      nz = Math.round((z - SPAN / 2) / TEXEL) * TEXEL;
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

  return {
    texture: tex,
    origin,
    span: SPAN,
    /**
     * Someone (`id`) is at (x, z) facing `heading` (radians, clockwise from north), `depth` 0..1 how
     * deep the snow is there. Ploughs the trench as they go and leaves a print every 0.7 m.
     */
    walk(id: string, x: number, z: number, heading: number, depth: number) {
      let w = walkers.get(id);
      if (!w) {
        w = { x, z, walked: 0, side: 1 };
        walkers.set(id, w);
      }
      const d = Math.hypot(x - w.x, z - w.z);
      // a teleport or a jump across the map leaves no line
      if (d > 4) {
        w.x = x;
        w.z = z;
        return;
      }
      if (d < 0.12 || depth < 0.15) {
        if (depth < 0.15) {
          w.x = x;
          w.z = z;
        }
        return;
      }
      const fx = Math.sin(heading),
        fz = -Math.cos(heading);
      press(x, z, fx, fz, 0.26, 0.3, 70 + 60 * depth);
      w.walked += d;
      if (w.walked > 0.7) {
        w.walked = 0;
        w.side = -w.side;
        press(x - fz * 0.14 * w.side, z + fx * 0.14 * w.side, fx, fz, 0.085, 0.16, 140 + 115 * depth);
      }
      w.x = x;
      w.z = z;
    },
    forget(id: string) {
      walkers.delete(id);
    },
    /** Follows the camera; falling snow (0..1) fills the tracks back in over a few minutes. */
    update(dt: number, x: number, z: number, snowfall: number) {
      follow(x, z);
      fillT += dt * (0.3 + snowfall);
      if (fillT > 1.2) {
        fillT = 0;
        for (let k = 0; k < data.length; k++) if (data[k]) data[k]--;
        dirty = true;
      }
      // (256 KB a time: twenty uploads a second is plenty for feet)
      upT += dt;
      if (dirty && upT > 0.05) {
        tex.needsUpdate = true;
        dirty = false;
        upT = 0;
      }
    },
  };
}

export type Trails = ReturnType<typeof makeTrails>;
