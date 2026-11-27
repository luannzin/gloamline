// Seeded simplex noise (2D and 3D) and the few fractal sums built on it.
// Everything in the world is a function of the seed, so every peer builds the same world.

/** Mulberry32: small, fast, good enough for placement. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash to [0, 1). Stable per cell, used for jittered scatter. */
export function hash2(x: number, z: number, seed: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const G3 = new Int8Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1,
  0, -1, -1,
]);

export class Noise {
  private p = new Uint8Array(512);
  private m = new Uint8Array(512);

  constructor(seed: number) {
    const r = rng(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) {
      this.p[i] = p[i & 255];
      this.m[i] = this.p[i] % 12;
    }
  }

  /** 2D simplex, about [-1, 1]. */
  n2(x: number, y: number) {
    const F2 = 0.3660254037844386,
      G2 = 0.21132486540518713;
    const s = (x + y) * F2;
    const i = Math.floor(x + s),
      j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - i + t,
      y0 = y - j + t;
    const i1 = x0 > y0 ? 1 : 0,
      j1 = 1 - i1;
    const x1 = x0 - i1 + G2,
      y1 = y0 - j1 + G2,
      x2 = x0 - 1 + 2 * G2,
      y2 = y0 - 1 + 2 * G2;
    const ii = i & 255,
      jj = j & 255,
      p = this.p,
      m = this.m;
    let n = 0;
    let q = 0.5 - x0 * x0 - y0 * y0;
    if (q > 0) {
      const g = m[ii + p[jj]] * 3;
      q *= q;
      n += q * q * (G3[g] * x0 + G3[g + 1] * y0);
    }
    q = 0.5 - x1 * x1 - y1 * y1;
    if (q > 0) {
      const g = m[ii + i1 + p[jj + j1]] * 3;
      q *= q;
      n += q * q * (G3[g] * x1 + G3[g + 1] * y1);
    }
    q = 0.5 - x2 * x2 - y2 * y2;
    if (q > 0) {
      const g = m[ii + 1 + p[jj + 1]] * 3;
      q *= q;
      n += q * q * (G3[g] * x2 + G3[g + 1] * y2);
    }
    return 70 * n;
  }

  /** 3D simplex, about [-1, 1]. */
  n3(x: number, y: number, z: number) {
    const F3 = 1 / 3,
      G3_ = 1 / 6;
    const s = (x + y + z) * F3;
    const i = Math.floor(x + s),
      j = Math.floor(y + s),
      k = Math.floor(z + s);
    const t = (i + j + k) * G3_;
    const x0 = x - i + t,
      y0 = y - j + t,
      z0 = z - k + t;
    let i1: number, j1: number, k1: number, i2: number, j2: number, k2: number;
    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1;
        j1 = 0;
        k1 = 0;
        i2 = 1;
        j2 = 1;
        k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1;
        j1 = 0;
        k1 = 0;
        i2 = 1;
        j2 = 0;
        k2 = 1;
      } else {
        i1 = 0;
        j1 = 0;
        k1 = 1;
        i2 = 1;
        j2 = 0;
        k2 = 1;
      }
    } else if (y0 < z0) {
      i1 = 0;
      j1 = 0;
      k1 = 1;
      i2 = 0;
      j2 = 1;
      k2 = 1;
    } else if (x0 < z0) {
      i1 = 0;
      j1 = 1;
      k1 = 0;
      i2 = 0;
      j2 = 1;
      k2 = 1;
    } else {
      i1 = 0;
      j1 = 1;
      k1 = 0;
      i2 = 1;
      j2 = 1;
      k2 = 0;
    }
    const x1 = x0 - i1 + G3_,
      y1 = y0 - j1 + G3_,
      z1 = z0 - k1 + G3_;
    const x2 = x0 - i2 + 2 * G3_,
      y2 = y0 - j2 + 2 * G3_,
      z2 = z0 - k2 + 2 * G3_;
    const x3 = x0 - 1 + 0.5,
      y3 = y0 - 1 + 0.5,
      z3 = z0 - 1 + 0.5;
    const ii = i & 255,
      jj = j & 255,
      kk = k & 255,
      p = this.p,
      m = this.m;
    let n = 0;
    const c = (q: number, g: number, a: number, b: number, d: number) => {
      if (q <= 0) return;
      q *= q;
      n += q * q * (G3[g] * a + G3[g + 1] * b + G3[g + 2] * d);
    };
    c(0.6 - x0 * x0 - y0 * y0 - z0 * z0, m[ii + p[jj + p[kk]]] * 3, x0, y0, z0);
    c(0.6 - x1 * x1 - y1 * y1 - z1 * z1, m[ii + i1 + p[jj + j1 + p[kk + k1]]] * 3, x1, y1, z1);
    c(0.6 - x2 * x2 - y2 * y2 - z2 * z2, m[ii + i2 + p[jj + j2 + p[kk + k2]]] * 3, x2, y2, z2);
    c(0.6 - x3 * x3 - y3 * y3 - z3 * z3, m[ii + 1 + p[jj + 1 + p[kk + 1]]] * 3, x3, y3, z3);
    return 32 * n;
  }

  /** Fractal sum, about [-1, 1]. */
  fbm(x: number, y: number, oct = 5) {
    let a = 0.5,
      f = 1,
      s = 0,
      w = 0;
    for (let i = 0; i < oct; i++) {
      s += a * this.n2(x * f, y * f);
      w += a;
      f *= 2.03;
      a *= 0.5;
    }
    return s / w;
  }

  /** Ridged fractal, [0, 1]: sharp crests, the shape of eroded ridges. */
  ridged(x: number, y: number, oct = 5) {
    let a = 0.5,
      f = 1,
      s = 0,
      w = 0,
      prev = 1;
    for (let i = 0; i < oct; i++) {
      let r = 1 - Math.abs(this.n2(x * f, y * f));
      r *= r;
      s += a * r * prev;
      prev = r;
      w += a;
      f *= 2.1;
      a *= 0.5;
    }
    return s / w;
  }

  fbm3(x: number, y: number, z: number, oct = 4) {
    let a = 0.5,
      f = 1,
      s = 0,
      w = 0;
    for (let i = 0; i < oct; i++) {
      s += a * this.n3(x * f, y * f, z * f);
      w += a;
      f *= 2.03;
      a *= 0.5;
    }
    return s / w;
  }
}

export const clamp = (x: number, a: number, b: number) => (x < a ? a : Math.min(x, b));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
