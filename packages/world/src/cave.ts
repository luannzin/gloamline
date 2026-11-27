// The Hollow: a mountain with caves inside, as a signed distance field meshed with surface nets
// (the same idea abyssal-garden uses for its seabed). The heightmap is the cave floor; the field is
// the rock above it. Positive is air, negative is rock.

import type { Noise } from "./noise";
import { HOLLOW } from "./terrain";

export const CAVE_STEP = 1.6;
const CX = HOLLOW.x,
  CZ = HOLLOW.z,
  F = HOLLOW.floor;
export const CAVE_ORIGIN = [CX - 192, F - 8, CZ - 192] as const;
export const CAVE_DIM = [240, 92, 240] as const;

/** Light falls into the big chamber along this direction (the region's sun points back up it). */
export const HOLLOW_SUN = (() => {
  const v = [0.32, 1, 0.42],
    l = Math.hypot(v[0], v[1], v[2]);
  return v.map((c) => c / l) as [number, number, number];
})();

// tunnel centre lines: x, y, z, radius
const TUNNELS: number[][] = [
  [-358, F + 6, -176, 8, -368, F + 7, -226, 9, -390, F + 9, -282, 10, -402, F + 12, -338, 12],
  [-430, F + 10, -372, 9, -470, F + 9, -392, 8, -515, F + 8, -400, 7, -560, F + 6, -405, 7],
];
const CHAMBERS: number[][] = [
  [-404, F + 14, -366, 48, 30, 44],
  [-478, F + 10, -398, 22, 16, 20],
];
const CHIMNEYS = (() => {
  const s = HOLLOW_SUN,
    out: number[][] = [];
  for (const [ox, oz, r] of [
    [-404, -366, 6],
    [-392, -350, 3.5],
    [-418, -378, 4],
    [-478, -398, 3],
  ]) {
    const y0 = F + 30;
    out.push([ox, y0, oz, ox + s[0] * 160, y0 + s[1] * 160, oz + s[2] * 160, r]);
  }
  return out;
})();

function segDist(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
) {
  const dx = bx - ax,
    dy = by - ay,
    dz = bz - az;
  let t = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / (dx * dx + dy * dy + dz * dz);
  t = t < 0 ? 0 : Math.min(t, 1);
  return [Math.hypot(px - ax - dx * t, py - ay - dy * t, pz - az - dz * t), t];
}

/**
 * Slices [z0, z1) of the field. Only values near the surface need to be exact (the mesh and the
 * collision read those), so a voxel whose sign is certain without the noise skips it and keeps a
 * bound of at least 2 m instead.
 */
export function caveField(noise: Noise, z0 = 0, z1: number = CAVE_DIM[2]) {
  const [nx, ny] = CAVE_DIM;
  const field = new Float32Array(nx * ny * (z1 - z0));
  const R = HOLLOW.radius;
  const surf = new Float32Array(nx),
    amp = new Float32Array(nx),
    rad = new Float32Array(nx);
  let i = 0;
  for (let z = z0; z < z1; z++) {
    const pz = CAVE_ORIGIN[2] + z * CAVE_STEP;
    for (let x = 0; x < nx; x++) {
      const px = CAVE_ORIGIN[0] + x * CAVE_STEP;
      const r = Math.hypot(px - CX, pz - CZ),
        prof = Math.max(0, 1 - (r / R) ** 2);
      rad[x] = r;
      amp[x] = 0.3 + 0.7 * prof;
      surf[x] =
        F - 7 + HOLLOW.peak * prof ** 1.25 + (prof > 0 ? 22 * noise.ridged(px / 90, pz / 90, 3) * prof : 0);
    }
    for (let y = 0; y < ny; y++) {
      const py = CAVE_ORIGIN[1] + y * CAVE_STEP;
      for (let x = 0; x < nx; x++, i++) {
        const px = CAVE_ORIGIN[0] + x * CAVE_STEP;
        // below the floor, or out past the mountain: air, and certainly so
        const outside = Math.max(F - 5 - py, rad[x] - 184);
        if (outside > 2) {
          field[i] = outside;
          continue;
        }
        const base = (py - surf[x]) * 0.55,
          A = amp[x] * 8;
        if (base > A + 2) {
          field[i] = Math.max(base - A, outside);
          continue;
        }
        let cave = Infinity;
        for (const t of TUNNELS) {
          for (let k = 0; k + 4 < t.length; k += 4) {
            const [sd, u] = segDist(px, py, pz, t[k], t[k + 1], t[k + 2], t[k + 4], t[k + 5], t[k + 6]);
            cave = Math.min(cave, sd - (t[k + 3] + (t[k + 7] - t[k + 3]) * u));
          }
        }
        for (const c of CHAMBERS) {
          const ex = (px - c[0]) / c[3],
            ey = (py - c[1]) / c[4],
            ez = (pz - c[2]) / c[5];
          cave = Math.min(cave, (Math.hypot(ex, ey, ez) - 1) * Math.min(c[3], c[4], c[5]));
        }
        for (const c of CHIMNEYS)
          cave = Math.min(cave, segDist(px, py, pz, c[0], c[1], c[2], c[3], c[4], c[5])[0] - c[6]);
        if (base < -(A + 2) && cave > 5.5) {
          field[i] = Math.max(base + A, 3.5 - cave, outside);
          continue;
        }
        const d =
          base +
          amp[x] * (7 * noise.fbm3(px / 24, py / 24, pz / 24, 3) + 2.2 * noise.n3(px / 6, py / 6, pz / 6));
        if (cave < 12) cave += 3.5 * noise.fbm3(px / 11 + 40, py / 11, pz / 11, 3);
        // rock is the mountain minus the caves; the heightmap is the floor
        field[i] = Math.max(d, -cave, outside);
      }
    }
  }
  return field;
}

/** Joins z-slices (in order) into one field. */
export function joinField(parts: Float32Array[]) {
  const f = new Float32Array(CAVE_DIM[0] * CAVE_DIM[1] * CAVE_DIM[2]);
  let o = 0;
  for (const p of parts) {
    f.set(p, o);
    o += p.length;
  }
  return f;
}

/** Trilinear field value at a world point; large and positive (air) outside the box. */
export function caveAt(field: Float32Array, x: number, y: number, z: number) {
  const [nx, ny, nz] = CAVE_DIM;
  const fx = (x - CAVE_ORIGIN[0]) / CAVE_STEP,
    fy = (y - CAVE_ORIGIN[1]) / CAVE_STEP,
    fz = (z - CAVE_ORIGIN[2]) / CAVE_STEP;
  if (fx < 0 || fy < 0 || fz < 0 || fx >= nx - 1 || fy >= ny - 1 || fz >= nz - 1) return 100;
  const ix = fx | 0,
    iy = fy | 0,
    iz = fz | 0,
    u = fx - ix,
    v = fy - iy,
    w = fz - iz;
  const sx = 1,
    sy = nx,
    sz = nx * ny,
    k = ix + iy * sy + iz * sz;
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c00 = l(field[k], field[k + sx], u),
    c10 = l(field[k + sy], field[k + sy + sx], u);
  const c01 = l(field[k + sz], field[k + sz + sx], u),
    c11 = l(field[k + sz + sy], field[k + sz + sy + sx], u);
  return l(l(c00, c10, v), l(c01, c11, v), w);
}

/** True when there is rock somewhere in the 100 m above a point in the open: under the Hollow's roof. */
export function underRock(field: Float32Array, x: number, y: number, z: number) {
  if (caveAt(field, x, y, z) < 0) return false;
  for (let up = 4; up < 100; up += 6) if (caveAt(field, x, y + up, z) < 0) return true;
  return false;
}

export type Mesh = { positions: Float32Array; normals: Float32Array; indices: Uint32Array };

/** Surface nets: one vertex per cell the surface crosses, one quad per crossed edge. */
export function surfaceNets(field: Float32Array): Mesh {
  const [nx, ny, nz] = CAVE_DIM;
  const sy = nx,
    sz = nx * ny;
  const vid = new Int32Array(nx * ny * nz).fill(-1);
  const pos: number[] = [],
    nor: number[] = [],
    idx: number[] = [];
  const CORN = [0, 1, sy, sy + 1, sz, sz + 1, sz + sy, sz + sy + 1];
  const EDGES = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  const CO = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
  ];
  const val = new Float32Array(8);
  for (let z = 0; z < nz - 1; z++)
    for (let y = 0; y < ny - 1; y++)
      for (let x = 0; x < nx - 1; x++) {
        const k = x + y * sy + z * sz;
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          val[c] = field[k + CORN[c]];
          if (val[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let ax = 0,
          ay = 0,
          az = 0,
          n = 0;
        for (const [a, b] of EDGES) {
          if (((mask >> a) & 1) === ((mask >> b) & 1)) continue;
          const t = val[a] / (val[a] - val[b]);
          ax += CO[a][0] + (CO[b][0] - CO[a][0]) * t;
          ay += CO[a][1] + (CO[b][1] - CO[a][1]) * t;
          az += CO[a][2] + (CO[b][2] - CO[a][2]) * t;
          n++;
        }
        vid[k] = pos.length / 3;
        const gx = x + ax / n,
          gy = y + ay / n,
          gz = z + az / n;
        pos.push(
          CAVE_ORIGIN[0] + gx * CAVE_STEP,
          CAVE_ORIGIN[1] + gy * CAVE_STEP,
          CAVE_ORIGIN[2] + gz * CAVE_STEP,
        );
        // gradient by central differences at the nearest grid point
        const g = (dx: number, dy: number, dz: number) => {
          const ix = Math.min(Math.max(Math.round(gx) + dx, 0), nx - 1);
          const iy = Math.min(Math.max(Math.round(gy) + dy, 0), ny - 1);
          const iz = Math.min(Math.max(Math.round(gz) + dz, 0), nz - 1);
          return field[ix + iy * sy + iz * sz];
        };
        let ex = g(1, 0, 0) - g(-1, 0, 0),
          ey = g(0, 1, 0) - g(0, -1, 0),
          ez = g(0, 0, 1) - g(0, 0, -1);
        const l = Math.hypot(ex, ey, ez) || 1;
        ex /= l;
        ey /= l;
        ez /= l;
        nor.push(ex, ey, ez);
        // quads: for each axis edge leaving corner 0 that the surface crosses
        const inside = mask & 1;
        if (x > 0 && y > 0 && ((mask >> 4) & 1) !== inside) quad(k, k - 1, k - sy, k - 1 - sy, inside);
        if (x > 0 && z > 0 && ((mask >> 2) & 1) !== inside) quad(k, k - sz, k - 1, k - 1 - sz, inside);
        if (y > 0 && z > 0 && ((mask >> 1) & 1) !== inside) quad(k, k - sy, k - sz, k - sy - sz, inside);
      }
  function quad(a: number, b: number, c: number, d: number, flip: number) {
    const A = vid[a],
      B = vid[b],
      C = vid[c],
      D = vid[d];
    if (A < 0 || B < 0 || C < 0 || D < 0) return;
    if (flip) idx.push(A, B, D, A, D, C);
    else idx.push(A, D, B, A, C, D);
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nor), indices: new Uint32Array(idx) };
}
