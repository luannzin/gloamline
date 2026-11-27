// The land: five regions blended into one heightmap, roads carved through it, and the ground
// textures the client shades from. Pure functions of the seed.

import { clamp, lerp, Noise, smooth } from "./noise";

/** 2048 x 2048 samples, one per metre, centred on the origin. */
export const SIZE = 2048;
export const HALF = SIZE / 2;
export const WATER_Y = 3;

export type RegionId = "gloamwood" | "mire" | "keep" | "hollow" | "highlands";
export type Region = { id: RegionId; name: string; x: number; z: number; r: number };

// -z is north. Gloamwood is where everyone wakes up.
export const REGIONS: Region[] = [
  { id: "gloamwood", name: "Gloamwood", x: -260, z: 230, r: 430 },
  { id: "mire", name: "The Mire", x: 360, z: 360, r: 340 },
  { id: "keep", name: "Cinder Keep", x: 380, z: -250, r: 260 },
  { id: "hollow", name: "The Hollow", x: -400, z: -370, r: 270 },
  { id: "highlands", name: "Pale Highlands", x: 0, z: -430, r: 500 },
];
export const NREG = REGIONS.length;

export const KEEP = { x: 380, z: -250, plateau: 132, top: 62 };
export const HOLLOW = { x: -400, z: -370, floor: 22, radius: 175, peak: 118 };
export const SPIRE = { x: 70, z: -790 };

// Roads, as control points. Each is sampled as a Catmull-Rom curve.
export const ROADS: number[][] = [
  [-300, 330, -250, 240, -170, 150, -60, 60, 0, 0],
  [0, 0, 90, 90, 190, 170, 260, 260, 330, 330],
  [0, 0, 110, -60, 220, -140, 290, -190, 340, -225, 380, -250],
  [0, 0, 20, -120, -20, -260, 10, -420, 40, -580, 60, -700],
  [0, 0, -110, -60, -230, -110, -320, -150, -360, -190],
];

export class Land {
  readonly noise: Noise;
  readonly seed: number;

  constructor(seed: number) {
    this.seed = seed;
    this.noise = new Noise(seed);
  }

  /** Region weights at (x, z) into `out` (length NREG), summing to 1, and the edge wall weight. */
  weights(x: number, z: number, out: Float32Array) {
    const n = this.noise;
    const wx = x + 55 * n.fbm(x / 420 + 11, z / 420, 3);
    const wz = z + 55 * n.fbm(x / 420, z / 420 - 7, 3);
    let sum = 0;
    for (let i = 0; i < NREG; i++) {
      const r = REGIONS[i];
      const d = Math.hypot(wx - r.x, wz - r.z) / r.r;
      const w = smooth(1, 0.3, d) + (r.id === "highlands" ? 0.02 : 0);
      out[i] = w;
      sum += w;
    }
    for (let i = 0; i < NREG; i++) out[i] /= sum;
    const L = Math.max(Math.abs(x), Math.abs(z)) * 0.75 + Math.hypot(x, z) * 0.25;
    return smooth(800, 975, L + 50 * n.fbm(x / 160, z / 160, 3));
  }

  /** The edge weight of the last rawHeight() call (its region weights are left in `w`). */
  edge = 0;

  /** Height before roads. */
  rawHeight(x: number, z: number, w: Float32Array) {
    const n = this.noise;
    const edge = this.weights(x, z, w);
    this.edge = edge;
    let h = 0;
    for (let i = 0; i < NREG; i++) {
      if (w[i] < 0.002) continue;
      h += w[i] * this.regionHeight(i, x, z);
    }
    if (edge > 0) h = lerp(h, 150 + 250 * n.ridged(x / 240, z / 240, 5), edge);
    return h + 0.4 * n.n2(x / 7.3, z / 7.3);
  }

  regionHeight(i: number, x: number, z: number) {
    const n = this.noise;
    switch (REGIONS[i].id) {
      case "gloamwood":
        return 16 + 15 * n.fbm(x / 260, z / 260, 4) + 6 * n.ridged(x / 75, z / 75, 3);
      case "mire":
        return 1.2 + 3.4 * n.fbm(x / 115, z / 115, 4) + 1.3 * n.fbm(x / 21, z / 21, 2);
      case "keep": {
        const d = Math.hypot(x - KEEP.x, z - KEEP.z);
        const R = KEEP.plateau + 12 * n.fbm(x / 60, z / 60, 3);
        const cliff = smooth(R + 16, R - 3, d);
        return (
          lerp(20 + 6 * n.fbm(x / 90, z / 90, 3), KEEP.top + 1.6 * n.fbm(x / 35, z / 35, 3), cliff) +
          cliff * (1 - cliff) * 14 * n.ridged(x / 14, z / 14, 3)
        );
      }
      case "hollow": {
        const d = Math.hypot(x - HOLLOW.x, z - HOLLOW.z);
        return (
          HOLLOW.floor +
          1.5 * n.fbm(x / 40, z / 40, 3) +
          32 * n.ridged(x / 130, z / 130, 4) * smooth(150, 240, d)
        );
      }
      default:
        return 26 + 32 * n.ridged(x / 300, z / 300, 5) + 4 * n.fbm(x / 45, z / 45, 3);
    }
  }
}

/** A road sampled every 2 m: x, z, and a smoothed height so it climbs as a ramp. */
export type Road = { pts: Float32Array; n: number };

export function sampleRoads(land: Land): Road[] {
  const w = new Float32Array(NREG);
  return ROADS.map((c) => {
    const k = c.length / 2;
    const out: number[] = [];
    for (let s = 0; s < k - 1; s++) {
      const i0 = Math.max(s - 1, 0),
        i1 = s,
        i2 = s + 1,
        i3 = Math.min(s + 2, k - 1);
      const len = Math.hypot(c[i2 * 2] - c[i1 * 2], c[i2 * 2 + 1] - c[i1 * 2 + 1]);
      const steps = Math.max(2, Math.ceil(len / 2));
      for (let j = 0; j < steps; j++) {
        const u = j / steps,
          uu = u * u,
          uuu = uu * u;
        for (let o = 0; o < 2; o++) {
          const a = c[i0 * 2 + o],
            b = c[i1 * 2 + o],
            cc = c[i2 * 2 + o],
            d = c[i3 * 2 + o];
          out.push(
            0.5 * (2 * b + (cc - a) * u + (2 * a - 5 * b + 4 * cc - d) * uu + (3 * b - a - 3 * cc + d) * uuu),
          );
        }
        out.push(0);
      }
    }
    out.push(c[(k - 1) * 2], c[(k - 1) * 2 + 1], 0);
    const n = out.length / 3;
    const pts = new Float32Array(out);
    for (let i = 0; i < n; i++) pts[i * 3 + 2] = land.rawHeight(pts[i * 3], pts[i * 3 + 1], w);
    // two box blurs of +-24 samples (about 100 m): cliffs become ramps
    const tmp = new Float32Array(n);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        let s = 0,
          c2 = 0;
        for (let j = Math.max(0, i - 24); j <= Math.min(n - 1, i + 24); j++) {
          s += pts[j * 3 + 2];
          c2++;
        }
        tmp[i] = s / c2;
      }
      for (let i = 0; i < n; i++) pts[i * 3 + 2] = tmp[i];
    }
    return { pts, n };
  });
}

/** How far from a road its carving and its index reach, in metres. */
const ROAD_REACH = 14;

/** Nearest road point: distance, height there. Bucketed so the whole map can ask. */
export class RoadIndex {
  private cells = new Map<number, number[]>();
  constructor(readonly roads: Road[]) {
    const reach = ROAD_REACH;
    const C = 32;
    roads.forEach((r, ri) => {
      for (let i = 0; i < r.n - 1; i++) {
        const ax = r.pts[i * 3],
          az = r.pts[i * 3 + 1],
          bx = r.pts[i * 3 + 3],
          bz = r.pts[i * 3 + 4];
        const x0 = Math.floor((Math.min(ax, bx) - reach) / C),
          x1 = Math.floor((Math.max(ax, bx) + reach) / C);
        const z0 = Math.floor((Math.min(az, bz) - reach) / C),
          z1 = Math.floor((Math.max(az, bz) + reach) / C);
        for (let cz = z0; cz <= z1; cz++)
          for (let cx = x0; cx <= x1; cx++) {
            const key = cx * 65536 + cz;
            let l = this.cells.get(key);
            if (!l) {
              l = [];
              this.cells.set(key, l);
            }
            l.push(ri, i);
          }
      }
    });
  }

  /** Writes [distance, road height] into out; distance is Infinity past `reach`. */
  near(x: number, z: number, out: Float32Array) {
    out[0] = Infinity;
    out[1] = 0;
    const l = this.cells.get(Math.floor(x / 32) * 65536 + Math.floor(z / 32));
    if (!l) return;
    for (let k = 0; k < l.length; k += 2) {
      const p = this.roads[l[k]].pts,
        i = l[k + 1] * 3;
      const ax = p[i],
        az = p[i + 1],
        dx = p[i + 3] - ax,
        dz = p[i + 4] - az;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < out[0]) {
        out[0] = d;
        out[1] = lerp(p[i + 2], p[i + 5], t);
      }
    }
  }
}

export type Ground = {
  /** metres, SIZE x SIZE */
  height: Float32Array;
  /** RGBA8: gloamwood, mire, keep, highlands weights */
  ground0: Uint8Array;
  /** RGBA8: rock (hollow + edge), road, normal x, normal z */
  ground1: Uint8Array;
};

/** Rows [j0, j1) of the ground, normals left for groundNormals(). Rows are independent, so workers split them. */
export function groundRows(land: Land, roads: RoadIndex, j0: number, j1: number): Ground {
  const rows = j1 - j0;
  const height = new Float32Array(SIZE * rows);
  const ground0 = new Uint8Array(SIZE * rows * 4);
  const ground1 = new Uint8Array(SIZE * rows * 4);
  const w = new Float32Array(NREG),
    rd = new Float32Array(2);
  const n = land.noise;
  const HI = REGIONS.findIndex((r) => r.id === "hollow");
  for (let j = j0; j < j1; j++) {
    const z = j - HALF;
    for (let i = 0; i < SIZE; i++) {
      const x = i - HALF,
        k = (j - j0) * SIZE + i;
      let h = land.rawHeight(x, z, w);
      const edge = land.edge;
      roads.near(x, z, rd);
      let road = 0;
      if (rd[0] < ROAD_REACH) {
        const wob = 1.2 * n.n2(x / 9, z / 9);
        h = lerp(h, rd[1] + 0.15 * n.n2(x / 3, z / 3), smooth(10, 3.5, rd[0]));
        road = smooth(3.6 + wob, 2 + wob, rd[0]);
      }
      height[k] = h;
      const o = k * 4,
        keep = 1 - edge;
      ground0[o] = (w[0] * keep * 255) | 0;
      ground0[o + 1] = (w[1] * keep * 255) | 0;
      ground0[o + 2] = (w[2] * keep * 255) | 0;
      ground0[o + 3] = (w[4] * keep * 255) | 0;
      ground1[o] = ((w[HI] * keep + edge) * 255) | 0;
      ground1[o + 1] = (road * 255) | 0;
    }
  }
  return { height, ground0, ground1 };
}

/** Fills the normal channels of a whole ground. */
export function groundNormals({ height, ground1 }: Ground) {
  for (let j = 0; j < SIZE; j++)
    for (let i = 0; i < SIZE; i++) {
      const k = j * SIZE + i;
      const hx = height[j * SIZE + Math.min(i + 1, SIZE - 1)] - height[j * SIZE + Math.max(i - 1, 0)];
      const hz = height[Math.min(j + 1, SIZE - 1) * SIZE + i] - height[Math.max(j - 1, 0) * SIZE + i];
      const l = Math.hypot(hx, 2, hz);
      ground1[k * 4 + 2] = ((-hx / l) * 127.5 + 127.5) | 0;
      ground1[k * 4 + 3] = ((-hz / l) * 127.5 + 127.5) | 0;
    }
}

/** Joins row slices (in order) into one ground and fills its normals. */
export function joinGround(parts: Ground[]): Ground {
  const g: Ground = {
    height: new Float32Array(SIZE * SIZE),
    ground0: new Uint8Array(SIZE * SIZE * 4),
    ground1: new Uint8Array(SIZE * SIZE * 4),
  };
  let o = 0;
  for (const p of parts) {
    g.height.set(p.height, o);
    g.ground0.set(p.ground0, o * 4);
    g.ground1.set(p.ground1, o * 4);
    o += p.height.length;
  }
  groundNormals(g);
  return g;
}

/** Bilinear height at world (x, z). */
export function heightAt(height: Float32Array, x: number, z: number) {
  const fx = clamp(x + HALF, 0, SIZE - 1.001),
    fz = clamp(z + HALF, 0, SIZE - 1.001);
  const i = fx | 0,
    j = fz | 0,
    u = fx - i,
    v = fz - j,
    k = j * SIZE + i;
  const a = height[k],
    b = height[k + 1],
    c = height[k + SIZE],
    d = height[k + SIZE + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
