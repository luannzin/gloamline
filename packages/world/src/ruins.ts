// Cinder Keep, laid out as stone blocks: curtain walls with a gate and two breaches, towers,
// the inner keep, a broken arcade, a gallows and rubble. Each block is drawn as one instance of a
// box, and the solid ones are what the player collides with.

import { hash2, type Noise, rng } from "./noise";
import { heightAt, KEEP, ROADS } from "./terrain";

/** Floats per block: centre xyz, size xyz, yaw, roll, solid (1) or not (0). */
export const BLOCK = 9;

export function buildRuins(height: Float32Array, noise: Noise, seed: number) {
  const out: number[] = [];
  const r = rng(seed ^ 0x6b6565);
  const g = (x: number, z: number) => heightAt(height, x, z);
  const block = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    yaw = 0,
    roll = 0,
    solid = 1,
  ) => out.push(x, y, z, sx, sy, sz, yaw, roll, solid);

  /** A wall from a to b as 1.25 m columns; `ruin` (0..1) eats its top, `gaps` are [t0, t1] openings. */
  function wall(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    h: number,
    th: number,
    ruin: number,
    gaps: number[][] = [],
    merlons = true,
  ) {
    const len = Math.hypot(bx - ax, bz - az),
      n = Math.max(1, Math.round(len / 1.25)),
      w = len / n;
    const yaw = Math.atan2(bz - az, bx - ax);
    const nx = -Math.sin(yaw),
      nz = Math.cos(yaw);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      if (gaps.some(([a, b]) => t > a && t < b)) continue;
      const x = ax + (bx - ax) * t,
        z = az + (bz - az) * t;
      // breakage: low-frequency bites plus per-column jitter, worse near the gap edges
      let edge = 1;
      for (const [a, b] of gaps)
        edge = Math.min(edge, (Math.abs(t - a) * len) / 6, (Math.abs(t - b) * len) / 6);
      const bite =
        Math.max(0, noise.fbm(x / 13, z / 13, 3) * 1.6 + ruin - 0.35) + (1 - Math.min(1, edge)) * 0.7;
      const hh = Math.max(0.6, h * (1 - Math.min(0.95, bite)) - hash2(i, n, seed) * 1.2);
      const y0 = g(x, z) - 2;
      block(x, y0 + (hh + 2) / 2, z, w + 0.02, hh + 2, th, yaw);
      if (merlons && hh > h * 0.92 && i % 2 === 0)
        block(x + nx * th * 0.3, y0 + hh + 2 + 0.6, z + nz * th * 0.3, w * 0.9, 1.2, th * 0.4, yaw);
    }
  }

  function tower(x: number, z: number, rad: number, h: number, ruin: number) {
    const n = Math.max(8, Math.round((Math.PI * 2 * rad) / 1.25));
    const y0 = g(x, z) - 2;
    const tilt = noise.n2(x / 7, z / 7);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const cx = x + Math.cos(a) * rad,
        cz = z + Math.sin(a) * rad;
      const brk = Math.max(0, Math.sin(a + tilt * 3) * 0.5 + 0.5) * ruin;
      const hh = h * (1 - brk * 0.6) - hash2(i, 7, seed) * 2;
      const w = ((Math.PI * 2 * rad) / n) * 1.05;
      block(cx, y0 + hh / 2, cz, w, hh, 2.2, a + Math.PI / 2);
      if (brk < 0.15 && i % 2 === 0)
        block(
          cx + Math.cos(a) * 0.6,
          y0 + hh + 0.6,
          cz + Math.sin(a) * 0.6,
          w * 0.85,
          1.2,
          0.9,
          a + Math.PI / 2,
        );
    }
    // a floor ring inside, so it reads as hollow
    block(x, y0 + h * 0.45, z, rad * 1.4, 0.6, rad * 1.4, tilt, 0, 0);
  }

  /** A row of arches: pillars, voussoirs, a broken deck. */
  function arcade(x0: number, z0: number, yaw: number, count: number, span: number, ph: number) {
    const dx = Math.cos(yaw),
      dz = Math.sin(yaw);
    const base = g(x0, z0) - 1;
    for (let i = 0; i <= count; i++) {
      const px = x0 + dx * span * i,
        pz = z0 + dz * span * i;
      const fallen = hash2(i, 3, seed) < 0.18;
      const hh = fallen ? ph * (0.25 + hash2(i, 4, seed) * 0.4) : ph;
      block(px, base + hh / 2, pz, 1.8, hh, 1.8, yaw);
      if (i === count || fallen) continue;
      const broken = hash2(i, 5, seed);
      const R = span / 2,
        cx = px + dx * R,
        cz = pz + dz * R,
        wedges = 11;
      for (let k = 0; k < wedges; k++) {
        if (broken < 0.25 && k > 3 && k < 8) continue;
        const a = Math.PI * (1 - (k + 0.5) / wedges);
        const ox = Math.cos(a) * R,
          oy = Math.sin(a) * R;
        block(
          cx + dx * ox,
          base + ph + oy,
          cz + dz * ox,
          (Math.PI * R) / wedges + 0.05,
          1.1,
          1.6,
          yaw,
          a - Math.PI / 2,
          0,
        );
      }
      if (broken > 0.5) block(cx, base + ph + R + 1.4, cz, span, 1.2, 1.7, yaw, 0, 0);
    }
  }

  // the gate faces where the road arrives from
  const road = ROADS[2],
    L = road.length;
  const gx = road[L - 4] - KEEP.x,
    gz = road[L - 3] - KEEP.z;
  const ga = Math.atan2(gz, gx);
  const R = 104,
    N = 9,
    verts: number[][] = [];
  for (let k = 0; k < N; k++) {
    const a = ga - Math.PI / N + (k * Math.PI * 2) / N;
    const rr = R + 7 * noise.n2(k * 1.7, 3.1);
    verts.push([KEEP.x + Math.cos(a) * rr, KEEP.z + Math.sin(a) * rr]);
  }
  for (let k = 0; k < N; k++) {
    const [ax, az] = verts[k],
      [bx, bz] = verts[(k + 1) % N];
    const gaps = k === 0 ? [[0.43, 0.57]] : k === 4 ? [[0.3, 0.62]] : k === 6 ? [[0.55, 0.8]] : [];
    wall(ax, az, bx, bz, 11 + 2 * noise.n2(k, 9), 2.6, k === 4 || k === 6 ? 0.5 : 0.15, gaps);
    tower(ax, az, 5.5, 20 + 6 * r(), k % 3 === 1 ? 0.8 : 0.3);
  }
  // gatehouse: two short towers and an arch over the road
  {
    const [ax, az] = verts[0],
      [bx, bz] = verts[1];
    const yaw = Math.atan2(bz - az, bx - ax),
      dx = Math.cos(yaw),
      dz = Math.sin(yaw);
    const mx = (ax + bx) / 2,
      mz = (az + bz) / 2,
      half = Math.hypot(bx - ax, bz - az) * 0.07;
    tower(mx - dx * (half + 3), mz - dz * (half + 3), 3.6, 16, 0.2);
    tower(mx + dx * (half + 3), mz + dz * (half + 3), 3.6, 16, 0.2);
    arcade(mx - dx * half, mz - dz * half, yaw, 1, half * 2, 8);
  }
  // inner keep, set back from the gate, one corner fallen
  {
    const kx = KEEP.x - Math.cos(ga) * 28,
      kz = KEEP.z - Math.sin(ga) * 28,
      s = 14,
      a = ga + Math.PI / 4;
    const c = [0, 1, 2, 3].map((i) => [
      kx + Math.cos(a + (i * Math.PI) / 2) * s * Math.SQRT2,
      kz + Math.sin(a + (i * Math.PI) / 2) * s * Math.SQRT2,
    ]);
    for (let i = 0; i < 4; i++) {
      const [ax, az] = c[i],
        [bx, bz] = c[(i + 1) % 4];
      // the side facing the gate gets a door
      const door =
        Math.abs(Math.atan2((az + bz) / 2 - kz, (ax + bx) / 2 - kx) - ga) < 0.8 ? [[0.42, 0.58]] : [];
      wall(ax, az, bx, bz, 24, 3, i === 2 ? 0.75 : 0.1, door);
    }
    for (let i = 0; i < 4; i++) if (i !== 2) tower(c[i][0], c[i][1], 3.2, 29, 0.25);
  }
  // the arcade crossing the courtyard
  arcade(KEEP.x + Math.cos(ga + 1.9) * 70, KEEP.z + Math.sin(ga + 1.9) * 70, ga - 1.25, 7, 8, 9);
  // gallows by the gate
  {
    const x = KEEP.x + Math.cos(ga + 0.45) * 72,
      z = KEEP.z + Math.sin(ga + 0.45) * 72,
      y = g(x, z),
      yaw = ga;
    const dx = Math.cos(yaw + Math.PI / 2),
      dz = Math.sin(yaw + Math.PI / 2);
    block(x, y + 1.5, z, 4.2, 0.5, 4.2, yaw);
    block(x, y + 4.5, z, 0.35, 6, 0.35, yaw);
    block(x + dx * 1.3, y + 7.3, z + dz * 1.3, 0.3, 0.3, 3, yaw + Math.PI / 2, 0, 0);
    block(x + dx * 0.6, y + 6.6, z + dz * 0.6, 0.18, 1.6, 0.18, yaw + Math.PI / 4, 0.8, 0);
  }
  // rubble from the breaches and below the broken towers
  for (let i = 0; i < 260; i++) {
    const k = [4, 6, 2, 5][i % 4],
      [ax, az] = verts[k],
      [bx, bz] = verts[(k + 1) % N];
    const t = 0.25 + r() * 0.6,
      off = (r() - 0.35) * 14;
    const yaw = Math.atan2(bz - az, bx - ax);
    const x = ax + (bx - ax) * t - Math.sin(yaw) * off,
      z = az + (bz - az) * t + Math.cos(yaw) * off;
    const s = 0.5 + r() * 1.1;
    block(x, g(x, z) + s * 0.25, z, s * 1.6, s * 0.8, s, r() * 6.28, (r() - 0.5) * 0.6, s > 1 ? 1 : 0);
  }
  return new Float32Array(out);
}

/** Where the graves go: inside the walls, beside the gate. */
export function graveyard() {
  const road = ROADS[2],
    L = road.length;
  const ga = Math.atan2(road[L - 3] - KEEP.z, road[L - 4] - KEEP.x);
  return { x: KEEP.x + Math.cos(ga - 0.55) * 66, z: KEEP.z + Math.sin(ga - 0.55) * 66, r: 20 };
}
