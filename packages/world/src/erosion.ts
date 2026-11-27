// Rain on the land: droplets run downhill over a 4 m copy of the heightmap, picking up soil where
// they speed up and dropping it where they slow (Beyer 2015, after Lague). What they carve, the
// gullies and sharp ridges and the fans of sediment at the foot of slopes, goes back into the
// full heightmap; where they ran and what they left is kept as the `wear` map the ground shades
// from. Deterministic: seeded droplets, and only + - * / and sqrt.

import { rng } from "./noise";
import { type Ground, HALF, SIZE } from "./terrain";

/** The wear map's side: one texel per 4 m. */
export const WEAR = 512;
const S = SIZE / WEAR;
/** heights are divided by this while droplets run, so a slope of 1 is about 45 degrees */
const UNIT = S;

const DROPS = 220_000,
  LIFE = 34,
  INERTIA = 0.06,
  CAPACITY = 4,
  MIN_CAPACITY = 0.01,
  ERODE = 0.3,
  DEPOSIT = 0.3,
  EVAPORATE = 0.015,
  GRAVITY = 4,
  RADIUS = 2;

/**
 * Erodes `g.height` in place. `keep(x, z)` (world metres) says how much of the change a place
 * takes, 0 to 1: roads, the keep's plateau and the Hollow's floor stay as they were laid.
 * Returns the wear map, WEAR x WEAR RGBA8: R where water ran, G sediment left, B soil carried off.
 */
export function erode(g: Ground, seed: number, keep: (x: number, z: number) => number) {
  const E = WEAR,
    H = g.height;
  // a box-filtered 4 m copy, in slope units
  const h = new Float32Array(E * E);
  for (let j = 0; j < E; j++)
    for (let i = 0; i < E; i++) {
      let s = 0;
      for (let b = 0; b < S; b++) for (let a = 0; a < S; a++) s += H[(j * S + b) * SIZE + i * S + a];
      h[j * E + i] = s / (S * S) / UNIT;
    }
  const h0 = h.slice();
  const flow = new Float32Array(E * E),
    dep = new Float32Array(E * E);

  // the erosion brush: cells within RADIUS, weighted by closeness, summing to 1
  const bi: number[] = [],
    bw: number[] = [];
  let bs = 0;
  for (let y = -RADIUS; y <= RADIUS; y++)
    for (let x = -RADIUS; x <= RADIUS; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d >= RADIUS) continue;
      bi.push(x, y);
      bw.push(RADIUS - d);
      bs += RADIUS - d;
    }
  for (let k = 0; k < bw.length; k++) bw[k] /= bs;

  const r = rng(seed ^ 0x2a9e5);
  for (let n = 0; n < DROPS; n++) {
    let px = 2 + r() * (E - 5),
      py = 2 + r() * (E - 5),
      dx = 0,
      dy = 0,
      speed = 1,
      water = 1,
      sed = 0;
    for (let life = 0; life < LIFE; life++) {
      const ix = px | 0,
        iy = py | 0,
        u = px - ix,
        v = py - iy,
        k = iy * E + ix;
      const a = h[k],
        b = h[k + 1],
        c = h[k + E],
        d = h[k + E + 1];
      const gx = (b - a) * (1 - v) + (d - c) * v,
        gy = (c - a) * (1 - u) + (d - b) * u,
        here = a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
      dx = dx * INERTIA - gx * (1 - INERTIA);
      dy = dy * INERTIA - gy * (1 - INERTIA);
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1e-6) break;
      dx /= len;
      dy /= len;
      px += dx;
      py += dy;
      if (px < 1 || py < 1 || px >= E - 2 || py >= E - 2) break;
      flow[k] += water;
      const jx = px | 0,
        jy = py | 0,
        u2 = px - jx,
        v2 = py - jy,
        k2 = jy * E + jx;
      const next =
        h[k2] * (1 - u2) * (1 - v2) +
        h[k2 + 1] * u2 * (1 - v2) +
        h[k2 + E] * (1 - u2) * v2 +
        h[k2 + E + 1] * u2 * v2;
      const dh = next - here;
      const cap = Math.max(-dh * speed * water * CAPACITY, MIN_CAPACITY);
      if (sed > cap || dh > 0) {
        // uphill: fill the pit behind; downhill but full: drop the excess
        const drop = dh > 0 ? Math.min(dh, sed) : (sed - cap) * DEPOSIT;
        sed -= drop;
        h[k] += drop * (1 - u) * (1 - v);
        h[k + 1] += drop * u * (1 - v);
        h[k + E] += drop * (1 - u) * v;
        h[k + E + 1] += drop * u * v;
        dep[k] += drop;
      } else {
        const take = Math.min((cap - sed) * ERODE, -dh);
        for (let q = 0; q < bw.length; q++) {
          const cx = ix + bi[q * 2],
            cy = iy + bi[q * 2 + 1];
          if (cx < 0 || cy < 0 || cx >= E || cy >= E) continue;
          const cell = cy * E + cx,
            w = take * bw[q],
            got = Math.min(h[cell], w);
          h[cell] -= got;
          sed += got;
        }
      }
      const s2 = speed * speed + dh * GRAVITY;
      speed = s2 > 0 ? Math.sqrt(s2) : 0;
      water *= 1 - EVAPORATE;
    }
  }

  // the change, back into the full map: bilinear from the 4 m grid, as much as each place takes
  const half = S / 2;
  for (let j = 0; j < SIZE; j++) {
    const fy = Math.min(E - 1.001, Math.max(0, (j - half + 0.5) / S)),
      y0 = fy | 0,
      ty = fy - y0;
    for (let i = 0; i < SIZE; i++) {
      const fx = Math.min(E - 1.001, Math.max(0, (i - half + 0.5) / S)),
        x0 = fx | 0,
        tx = fx - x0,
        k = y0 * E + x0;
      const d00 = h[k] - h0[k],
        d10 = h[k + 1] - h0[k + 1],
        d01 = h[k + E] - h0[k + E],
        d11 = h[k + E + 1] - h0[k + E + 1];
      const d = d00 * (1 - tx) * (1 - ty) + d10 * tx * (1 - ty) + d01 * (1 - tx) * ty + d11 * tx * ty;
      if (d === 0) continue;
      H[j * SIZE + i] += d * UNIT * keep(i - HALF, j - HALF);
    }
  }

  // the wear map: flow on a soft log scale, sediment and soil lost in metres
  const wear = new Uint8Array(E * E * 4);
  for (let k = 0; k < E * E; k++) {
    const f = flow[k];
    wear[k * 4] = Math.min(255, (f / (f + 6)) * 300);
    wear[k * 4 + 1] = Math.min(255, dep[k] * UNIT * 60);
    wear[k * 4 + 2] = Math.min(255, Math.max(0, (h0[k] - h[k]) * UNIT * 40));
    wear[k * 4 + 3] = 255;
  }
  return wear;
}
