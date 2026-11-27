// Zarechye, the village everyone wakes up by: log houses along the first road with their gables to
// the street, a picket fence before each yard with a gap for the gate, a power line on wooden poles
// down the verge, sheds behind, a well sweep, and cars left where they stopped. Laid out from the
// road and the seed; the client draws it from tools/blender/village.py.

import { hash2 } from "./noise";
import { heightAt, type Road } from "./terrain";

/** Floats per house: x, foot y, z, yaw (its street side faces +z turned by yaw), kind. */
export const HOUSE = 5;
/**
 * House kinds, as the meshes are named; their footprints (across the gable, deep) in metres, and
 * how far the footprint's centre sits behind the mesh's origin (the lean-to at the back).
 */
export const HOUSES = [
  { name: "izba_a", w: 6.2, d: 7.6, oz: 0 },
  { name: "izba_b", w: 6.8, d: 11.2, oz: -1.3 },
  { name: "izba_c", w: 5.6, d: 6.6, oz: 0 },
  { name: "izba_burnt", w: 6.2, d: 7.6, oz: 0 },
] as const;
/** Floats per prop: x, y, z, yaw, kind. */
export const PROP = 5;
export const PROPS = ["fence_a", "fence_b", "shed", "well", "wreck"] as const;
/** Floats per pole: x, foot y, z, yaw (the crossarm runs along its local x, across the road). */
export const POLE = 4;
/** Where on a pole the wires sit: across the crossarm, and up. */
export const WIRES = { across: [-0.7, 0, 0.7], up: 8.05 };

/** Along the first road: where the village starts and ends (m from the road's start). */
const FROM = 34,
  TO = 300;

export function buildVillage(height: Float32Array, road: Road, seed: number) {
  const houses: number[] = [],
    props: number[] = [],
    poles: number[] = [],
    // collision, in the ruins' block layout (BLOCK): centre, size, yaw, roll, solid
    blocks: number[] = [],
    // circles the woods keep out of: x, z, radius
    clear: number[] = [];
  const g = (x: number, z: number) => heightAt(height, x, z);
  const block = (x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number) =>
    blocks.push(x, y, z, sx, sy, sz, yaw, 0, 1);

  // the road as arc length: s -> position and tangent
  const P = road.pts,
    acc = new Float32Array(road.n);
  for (let i = 1; i < road.n; i++)
    acc[i] = acc[i - 1] + Math.hypot(P[i * 3] - P[i * 3 - 3], P[i * 3 + 1] - P[i * 3 - 2]);
  const at = (s: number) => {
    let i = 1;
    while (i < road.n - 1 && acc[i] < s) i++;
    const t = (s - acc[i - 1]) / Math.max(acc[i] - acc[i - 1], 1e-6);
    const x = P[i * 3 - 3] + (P[i * 3] - P[i * 3 - 3]) * t,
      z = P[i * 3 - 2] + (P[i * 3 + 1] - P[i * 3 - 2]) * t;
    const tx = P[i * 3] - P[i * 3 - 3],
      tz = P[i * 3 + 1] - P[i * 3 - 2],
      l = Math.hypot(tx, tz) || 1;
    return { x, z, tx: tx / l, tz: tz / l, nx: -tz / l, nz: tx / l };
  };
  /** A mesh's yaw that turns its +x along (ax, az). */
  const along = (ax: number, az: number) => Math.atan2(-az, ax);

  // houses: both sides, every 24 m, set back 14 m, now and then an empty plot
  let k = 0;
  for (let s = FROM + 8; s < TO - 10; s += 24) {
    for (const side of [1, -1]) {
      k++;
      const h = hash2(k, 7, seed);
      if (h < 0.14) continue;
      const r = at(s + (hash2(k, 9, seed) - 0.5) * 6);
      const back = 14 + hash2(k, 11, seed) * 3;
      const x = r.x + r.nx * side * back,
        z = r.z + r.nz * side * back;
      // the street side looks back at the road
      const yaw = Math.atan2(-r.nx * side, -r.nz * side) + (hash2(k, 13, seed) - 0.5) * 0.12;
      const kind = h > 0.86 ? 3 : h < 0.36 ? 1 : h < 0.6 ? 2 : 0;
      const H = HOUSES[kind];
      // on a slope the plinth takes up the difference; too steep and the plot stays empty
      const c = Math.cos(yaw),
        sn = Math.sin(yaw);
      let lo = Infinity,
        hi = -Infinity;
      for (const [u, v] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        const lx = (u * H.w) / 2,
          lz = (v * H.d) / 2 + H.oz;
        const y = g(x + c * lx + sn * lz, z - sn * lx + c * lz);
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      }
      if (hi - lo > 1.5) continue;
      const y = hi - 0.3;
      houses.push(x, y, z, yaw, kind);
      // (the mesh turns local +x to (cos yaw, -sin yaw): the block's x axis is at -yaw)
      const bx = x + sn * H.oz,
        bz = z + c * H.oz;
      block(bx, y + (kind === 3 ? 0.9 : 2.2), bz, H.w + 0.5, kind === 3 ? 1.8 : 4.4, H.d + 0.5, -yaw);
      clear.push(bx, bz, Math.hypot(H.w, H.d) / 2 + 3);
      // its fence along the street, 7 m out, with the gate left open
      for (let f = -2; f <= 2; f++) {
        if (f === 0 && hash2(k, 17, seed) < 0.8) continue;
        if (hash2(k * 5 + f, 19, seed) < 0.1) continue;
        const q = at(s + f * 3);
        const fx = q.x + q.nx * side * 7.5,
          fz = q.z + q.nz * side * 7.5;
        const fy = g(fx, fz);
        const fyaw = along(q.tx, q.tz) + (hash2(k, f + 21, seed) - 0.5) * 0.1;
        props.push(fx, fy, fz, fyaw, hash2(k, f + 23, seed) < 0.5 ? 0 : 1);
        block(fx, fy + 0.65, fz, 3.0, 1.3, 0.2, -fyaw);
      }
      // a shed behind every other yard
      if (hash2(k, 29, seed) < 0.5 && kind !== 3) {
        const sx = x + r.nx * side * 9 + r.tx * 4,
          sz = z + r.nz * side * 9 + r.tz * 4;
        const sy = g(sx, sz) - 0.1;
        props.push(sx, sy, sz, yaw + 0.3, 2);
        block(sx, sy + 1.2, sz, 3.4, 2.4, 4.0, -(yaw + 0.3));
        clear.push(sx, sz, 4);
      }
    }
  }
  // the power line down the left verge, a pole every 34 m, leaning a little
  for (let s = FROM - 20, i = 0; s < TO + 60; s += 34, i++) {
    const r = at(s);
    const x = r.x - r.nx * 5.5,
      z = r.z - r.nz * 5.5;
    poles.push(x, g(x, z), z, along(r.nx, r.nz) + (hash2(i, 31, seed) - 0.5) * 0.08);
    block(x, g(x, z) + 4, z, 0.35, 8, 0.35, 0);
    clear.push(x, z, 2);
  }
  // the well, across from the middle of the street
  {
    const r = at((FROM + TO) / 2 + 12);
    const x = r.x + r.nx * 9,
      z = r.z + r.nz * 9;
    props.push(x, g(x, z) - 0.1, z, along(r.tx, r.tz), 3);
    block(x, g(x, z) + 0.6, z, 1.7, 1.2, 1.7, -along(r.tx, r.tz));
    clear.push(x, z, 5);
  }
  // two cars where they stopped: one on the verge, one across the road out of the village
  for (const [s, off, turn] of [
    [FROM + 70, 4.2, 0.2],
    [TO + 18, 0.5, 1.2],
  ]) {
    const r = at(s);
    const x = r.x + r.nx * off,
      z = r.z + r.nz * off;
    const yaw = Math.atan2(r.tx, r.tz) + turn;
    props.push(x, g(x, z), z, yaw, 4);
    block(x, g(x, z) + 0.75, z, 1.7, 1.5, 4.1, -yaw);
    clear.push(x, z, 4);
  }
  return {
    houses: new Float32Array(houses),
    props: new Float32Array(props),
    poles: new Float32Array(poles),
    blocks: new Float32Array(blocks),
    clear: new Float32Array(clear),
  };
}
