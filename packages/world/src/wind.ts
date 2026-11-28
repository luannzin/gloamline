// The winter's wind against the world: which way it blows (from the seed), the drifts it has laid
// round everything that stands in it, and how much a wall, a roof or a crown keeps the snow and the
// wind off a body. Deep snow holds the legs, so the drifts are part of the world every peer builds.

import { hash2 } from "./noise";
import { BLOCK } from "./ruins";
import { HALF, heightAt, SIZE } from "./terrain";
import { HOUSE, HOUSES } from "./village";

/** Downwind on the ground, unit [x, z]: the prevailing wind the season's snow was laid by. */
export function prevailing(seed: number): [number, number] {
  const a = hash2(17, 29, seed) * Math.PI * 2;
  return [Math.cos(a), Math.sin(a)];
}

/** The drift grid's scale: depth = byte / DRIFT, so 1 is the snow's own depth and 0 bare ground. */
export const DRIFT = 128;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** A ray's span inside what it's being tested against: narrowed by `slab`, reset by its caller. */
const span = new Float64Array(2);

/** Narrows the span to where p + t d lies within [lo, hi]; false when it never does. */
function slab(p: number, d: number, lo: number, hi: number) {
  if (Math.abs(d) < 1e-6) return p >= lo && p <= hi;
  const a = (lo - p) / d,
    b = (hi - p) / d;
  span[0] = Math.max(span[0], Math.min(a, b));
  span[1] = Math.min(span[1], Math.max(a, b));
  return span[0] <= span[1];
}

/** How far the 2D ray from (x, z) along (dx, dz) goes to the box of half sizes (hx, hz) about the origin, or -1. */
function rayBox(x: number, z: number, dx: number, dz: number, hx: number, hz: number) {
  span[0] = 0;
  span[1] = Infinity;
  return slab(x, dx, -hx, hx) && slab(z, dz, -hz, hz) ? span[0] : -1;
}

/**
 * The drifts, one byte a metre (DRIFT is the snow's own depth): banked up against every wall that
 * faces the wind, scoured bare in a strip behind it, and clear under the houses' eaves.
 */
export function buildDrift(height: Float32Array, solid: Float32Array, houses: Float32Array, seed: number) {
  const [wx, wz] = prevailing(seed);
  // extra snow on the windward side (in snow depths) and how much is left on the lee (0..1)
  const bank = new Float32Array(SIZE * SIZE),
    keep = new Float32Array(SIZE * SIZE).fill(1);
  const region = (cx: number, cz: number, r: number, f: (k: number, x: number, z: number) => void) => {
    const i0 = Math.max(0, Math.floor(cx - r + HALF)),
      i1 = Math.min(SIZE - 1, Math.ceil(cx + r + HALF)),
      j0 = Math.max(0, Math.floor(cz - r + HALF)),
      j1 = Math.min(SIZE - 1, Math.ceil(cz + r + HALF));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) f(j * SIZE + i, i - HALF, j - HALF);
  };
  /** A box standing in the wind: centre, half sizes, yaw (the blocks' convention), height above ground. */
  const stand = (cx: number, cz: number, hx: number, hz: number, yaw: number, h: number, eave: number) => {
    const c = Math.cos(-yaw),
      s = Math.sin(-yaw);
    // the wind and the across-wind axis in the box's frame, and how wide the box looks to the wind
    const lwx = wx * c - wz * s,
      lwz = wx * s + wz * c;
    const ax = -lwz,
      az = lwx;
    const wide = hx * Math.abs(ax) + hz * Math.abs(az);
    // a thin thing (a pole, a fence end-on) gathers and shelters less than a wall of its height
    const he = Math.min(h, 6 * wide);
    const lb = Math.min(2.2 * he, 8),
      ll = Math.min(3.5 * he, 12),
      top = Math.min(0.9, 0.35 * he);
    region(cx, cz, Math.hypot(hx, hz) + Math.max(lb, ll) + 1.5, (k, x, z) => {
      const dx = x - cx,
        dz = z - cz;
      let lx = dx * c - dz * s,
        lz = dx * s + dz * c;
      if (Math.abs(lx) < hx + eave && Math.abs(lz) < hz + eave) {
        keep[k] = 0;
        return;
      }
      // past the box's sides the drift fades over a metre and a half; the ray is cast from the edge
      // of its silhouette so the fade has a distance to read
      const a = lx * ax + lz * az,
        over = Math.abs(a) - (wide - 0.05);
      const side = clamp01(1 - over / 1.5);
      if (side <= 0) return;
      if (over > 0) {
        lx -= Math.sign(a) * over * ax;
        lz -= Math.sign(a) * over * az;
      }
      const up = rayBox(lx, lz, lwx, lwz, hx, hz);
      if (up >= 0 && up < lb) {
        const b = top * (1 - up / lb) ** 1.5 * side;
        if (b > bank[k]) bank[k] = b;
      }
      const lee = rayBox(lx, lz, -lwx, -lwz, hx, hz);
      if (lee >= 0 && lee < ll) {
        const t = clamp01((lee - 0.3) / (ll * 0.8));
        const left = 1 - (1 - (0.05 + 0.95 * t * t * (3 - 2 * t))) * side;
        if (left < keep[k]) keep[k] = left;
      }
    });
  };
  for (let o = 0; o < solid.length; o += BLOCK) {
    if (!solid[o + 8]) continue;
    const x = solid[o],
      z = solid[o + 2],
      g = heightAt(height, x, z);
    // what hangs clear of the ground (a lintel) lets the wind under it
    if (solid[o + 1] - solid[o + 4] / 2 > g + 2.5) continue;
    const h = solid[o + 1] + solid[o + 4] / 2 - g;
    if (h < 0.4) continue;
    stand(x, z, solid[o + 3] / 2, solid[o + 5] / 2, solid[o + 6], h, 0);
  }
  // the houses' eaves keep the ground beneath them clear
  for (let i = 0; i < houses.length; i += HOUSE) {
    const H = HOUSES[houses[i + 4]],
      yaw = houses[i + 3];
    const bx = houses[i] + Math.sin(yaw) * H.oz,
      bz = houses[i + 2] + Math.cos(yaw) * H.oz;
    const c = Math.cos(yaw),
      s = Math.sin(yaw);
    region(bx, bz, Math.hypot(H.w, H.d) / 2 + 1.5, (k, x, z) => {
      const dx = x - bx,
        dz = z - bz;
      if (Math.abs(dx * c - dz * s) < H.w / 2 + 0.75 && Math.abs(dx * s + dz * c) < H.d / 2 + 0.75)
        keep[k] = 0;
    });
  }
  const out = new Uint8Array(SIZE * SIZE);
  for (let k = 0; k < out.length; k++) out[k] = Math.min(255, Math.round((1 + bank[k]) * keep[k] * DRIFT));
  return out;
}

/** Floats per shelter item: kind (0 box, 1 crown), x, y0, z, y1, half x / radius, half z, yaw, how much it stops. */
const ITEM = 9;
const CELL = 16,
  NC = SIZE / CELL;

/**
 * What stands between a body and the weather: the solid blocks and the crowns of the oaks and
 * spruces, in a grid of 16 m cells, asked along the way the snow comes from and the way the wind
 * does. A pure function of the world: every peer works out everyone's shelter the same way.
 */
export class Shelter {
  private items: Float32Array;
  private cells = new Map<number, number[]>();

  constructor(world: {
    ground: { height: Float32Array };
    solid: Float32Array;
    props: { oak: Float32Array; pine: Float32Array };
  }) {
    const list: number[] = [];
    const add = (x: number, z: number, r: number) => {
      const id = list.length / ITEM - 1;
      for (let cz = Math.floor((z - r + HALF) / CELL); cz <= Math.floor((z + r + HALF) / CELL); cz++)
        for (let cx = Math.floor((x - r + HALF) / CELL); cx <= Math.floor((x + r + HALF) / CELL); cx++) {
          if (cx < 0 || cz < 0 || cx >= NC || cz >= NC) continue;
          const key = cz * NC + cx;
          const e = this.cells.get(key);
          if (e) e.push(id);
          else this.cells.set(key, [id]);
        }
    };
    const S = world.solid;
    for (let o = 0; o < S.length; o += BLOCK) {
      if (!S[o + 8]) continue;
      const hx = S[o + 3] / 2,
        hz = S[o + 5] / 2;
      list.push(0, S[o], S[o + 1] - S[o + 4] / 2, S[o + 2], S[o + 1] + S[o + 4] / 2, hx, hz, S[o + 6], 1);
      add(S[o], S[o + 2], Math.hypot(hx, hz));
    }
    // crowns as upright cylinders: a spruce's is narrow and stops most of it, an oak's dead leaves less
    const crowns = (p: Float32Array, r: number, lo: number, hi: number, stop: number) => {
      for (let i = 0; i < p.length; i += 5) {
        const s = p[i + 4];
        list.push(1, p[i], p[i + 1] + lo * s, p[i + 2], p[i + 1] + hi * s, r * s, 0, 0, stop);
        add(p[i], p[i + 2], r * s);
      }
    };
    crowns(world.props.pine, 3, 2.5, 20, 0.75);
    crowns(world.props.oak, 5, 3.5, 11, 0.5);
    this.items = new Float32Array(list);
  }

  /** How much item `i` stops a ray from (x, y, z) along (dx, dy, dz) within `far` metres (0 if it misses). */
  private hit(i: number, x: number, y: number, z: number, dx: number, dy: number, dz: number, far: number) {
    const I = this.items,
      o = i * ITEM;
    const px = x - I[o + 1],
      pz = z - I[o + 3];
    span[0] = 0;
    span[1] = far;
    // between its foot and its top
    if (!slab(y, dy, I[o + 2], I[o + 4])) return 0;
    if (I[o] === 0) {
      const c = Math.cos(-I[o + 7]),
        s = Math.sin(-I[o + 7]);
      const hx = I[o + 5],
        hz = I[o + 6];
      return slab(px * c - pz * s, dx * c - dz * s, -hx, hx) &&
        slab(px * s + pz * c, dx * s + dz * c, -hz, hz)
        ? I[o + 8]
        : 0;
    }
    // a circle in plan: where the ray's line comes within the radius
    const r = I[o + 5],
      A = dx * dx + dz * dz;
    if (A < 1e-9) return px * px + pz * pz <= r * r ? I[o + 8] : 0;
    const B = px * dx + pz * dz,
      disc = B * B - A * (px * px + pz * pz - r * r);
    if (disc < 0) return 0;
    const q = Math.sqrt(disc);
    return Math.max(span[0], (-B - q) / A) <= Math.min(span[1], (-B + q) / A) ? I[o + 8] : 0;
  }

  /** The most any item near (x, z) stops along the ray, 0..1. */
  private cast(x: number, y: number, z: number, dx: number, dy: number, dz: number, far: number) {
    let best = 0;
    for (let cz = Math.floor((z - far + HALF) / CELL); cz <= Math.floor((z + far + HALF) / CELL); cz++)
      for (let cx = Math.floor((x - far + HALF) / CELL); cx <= Math.floor((x + far + HALF) / CELL); cx++) {
        const e = this.cells.get(cz * NC + cx);
        if (!e) continue;
        for (let j = 0; j < e.length; j++) {
          const k = this.hit(e[j], x, y, z, dx, dy, dz, far);
          if (k > best) best = k;
          if (best >= 1) return 1;
        }
      }
    return best;
  }

  /**
   * For a body standing at (x, y, z), the wind blowing along (wx, wz) and the snow falling `slant`
   * metres downwind for each metre down: out[0] how much is overhead against the snow, out[1] how
   * far out of the wind it stands (in the lee of a wall), each 0..1.
   */
  at(x: number, y: number, z: number, wx: number, wz: number, slant: number, out: Float32Array) {
    // the snow comes from up and upwind: three heights on the body, averaged
    const l = Math.hypot(slant, 1);
    const dx = (-wx * slant) / l,
      dy = 1 / l,
      dz = (-wz * slant) / l;
    out[0] =
      (this.cast(x, y + 0.5, z, dx, dy, dz, 14) +
        this.cast(x, y + 1.1, z, dx, dy, dz, 14) +
        this.cast(x, y + 1.7, z, dx, dy, dz, 14)) /
      3;
    // the wind: level, from upwind, at the chest; a wall within 4 m keeps it off
    out[1] = this.cast(x, y + 1.2, z, -wx, 0, -wz, 4);
    return out;
  }
}
