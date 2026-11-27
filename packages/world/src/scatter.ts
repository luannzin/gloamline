// Where every prop stands. Jittered grids, one per kind, thinned by a rule that reads the ground
// (region weights, slope, roads, water, the cave). Five floats per instance: x, y, z, yaw, scale.

import { caveAt, underRock } from "./cave";
import { clamp, hash2, type Noise, smooth } from "./noise";
import { graveyard } from "./ruins";
import { type Ground, HALF, HOLLOW, heightAt, KEEP, type RoadIndex, SIZE, WATER_Y } from "./terrain";

export const KINDS = [
  "oak",
  "pine",
  "dead",
  "rock",
  "fern",
  "reed",
  "stone",
  "grave",
  "shroom",
  "crag",
] as const;
export type Kind = (typeof KINDS)[number];

/** What the rule sees at a candidate point. */
type Site = {
  h: number;
  /** gloamwood, mire, keep, highlands, rock (hollow + edge) */
  w: Float32Array;
  slope: number;
  road: number;
  covered: boolean;
  inRock: boolean;
  plateau: number;
};

type Rule = { cell: number; scale: [number, number]; p: (s: Site) => number };

const RULES: Record<Kind, Rule> = {
  oak: {
    cell: 8.5,
    scale: [0.85, 1.45],
    p: (s) => s.w[0] * smooth(0.5, 0.28, s.slope) * smooth(7, 11, s.road) * (s.h > WATER_Y + 1 ? 1 : 0),
  },
  pine: {
    cell: 12,
    scale: [0.8, 1.35],
    p: (s) =>
      (s.w[3] * 0.5 + s.w[4] * 0.45 + s.w[0] * 0.12) *
      smooth(0.45, 0.2, s.slope) *
      smooth(6, 10, s.road) *
      (s.h > WATER_Y + 1 ? 1 : 0) *
      (1 - s.plateau),
  },
  dead: {
    cell: 15,
    scale: [0.8, 1.3],
    p: (s) =>
      (s.w[1] * 0.75 + s.w[2] * 0.45 * (1 - s.plateau) + s.w[3] * 0.06) *
      smooth(5, 8, s.road) *
      (s.h > WATER_Y - 1.4 ? 1 : 0),
  },
  rock: {
    cell: 17,
    scale: [0.6, 2.2],
    p: (s) =>
      (0.18 + s.w[3] * 0.35 + s.w[4] * 0.5 + s.slope * 0.8) * smooth(4, 7, s.road) * (1 - s.plateau * 0.8),
  },
  fern: {
    cell: 3.4,
    scale: [0.7, 1.4],
    p: (s) =>
      (s.w[0] * 0.85 + s.w[1] * 0.2) *
      smooth(0.5, 0.25, s.slope) *
      smooth(2.6, 4, s.road) *
      (s.h > WATER_Y + 0.5 ? 1 : 0),
  },
  reed: {
    cell: 2.3,
    scale: [0.7, 1.3],
    p: (s) => s.w[1] * (s.h > WATER_Y - 1.1 && s.h < WATER_Y + 0.7 ? 0.9 : 0),
  },
  stone: {
    cell: 70,
    scale: [1, 1.6],
    p: (s) => s.w[3] * 0.35 * smooth(0.3, 0.15, s.slope) * smooth(8, 14, s.road),
  },
  grave: { cell: 3.6, scale: [0.85, 1.15], p: () => 0 },
  shroom: {
    cell: 3,
    scale: [0.6, 1.6],
    p: (s) => (s.covered ? 0.45 : s.w[0] * 0.035) * smooth(2.5, 4, s.road),
  },
  // outcrops: big layered rock half sunk into the steep ground, so a cliff is stone, not a
  // stretched texture
  crag: {
    cell: 10,
    scale: [1.4, 3.6],
    // (the keep's cliff takes them; only its flat top, where the walls stand, doesn't)
    p: (s) =>
      smooth(0.42, 0.7, s.slope) *
      smooth(7, 14, s.road) *
      (s.plateau < 0.9 ? 1 : 0) *
      (s.h > WATER_Y + 1 ? 1 : 0),
  },
};

export function scatter(g: Ground, roads: RoadIndex, field: Float32Array, noise: Noise, seed: number) {
  const out = {} as Record<Kind, Float32Array>;
  const w = new Float32Array(5),
    rd = new Float32Array(2);
  const site: Site = { h: 0, w, slope: 0, road: 0, covered: false, inRock: false, plateau: 0 };
  const gy = graveyard();
  KINDS.forEach((kind, ki) => {
    const rule = RULES[kind],
      list: number[] = [];
    // graves are placed by hand below, not on the grid
    const n = kind === "grave" ? 0 : Math.floor(SIZE / rule.cell);
    for (let cz = 0; cz < n; cz++)
      for (let cx = 0; cx < n; cx++) {
        const x = -HALF + (cx + 0.15 + 0.7 * hash2(cx, cz, seed + ki * 7)) * rule.cell;
        const z = -HALF + (cz + 0.15 + 0.7 * hash2(cz, cx, seed + ki * 13)) * rule.cell;
        if (!fill(x, z, kind)) continue;
        // clearings and groves: the same noise thins every kind a little differently
        const grove = smooth(-0.35, 0.3, noise.fbm(x / 140 + ki, z / 140, 3));
        const free = kind === "reed" || kind === "shroom" || kind === "crag";
        if (hash2(cx, cz, seed + ki * 31) > rule.p(site) * (free ? 1 : grove)) continue;
        const s = rule.scale[0] + (rule.scale[1] - rule.scale[0]) * hash2(cx, cz, seed + ki * 17) ** 1.6;
        list.push(x, site.h, z, hash2(cz, cx, seed + ki * 19) * Math.PI * 2, s);
      }
    if (kind === "grave") {
      for (let i = 0; i < 70; i++) {
        const a = hash2(i, 1, seed) * Math.PI * 2,
          rr = Math.sqrt(hash2(i, 2, seed)) * gy.r;
        const x = gy.x + Math.cos(a) * rr,
          z = gy.z + Math.sin(a) * rr;
        if (!fill(x, z, kind) || site.road < 3) continue;
        list.push(
          x,
          site.h,
          z,
          Math.atan2(KEEP.z - z, KEEP.x - x) + (hash2(i, 3, seed) - 0.5) * 0.5,
          0.85 + hash2(i, 4, seed) * 0.3,
        );
      }
    }
    if (kind === "stone") {
      // two old circles in the highlands
      for (const [ccx, ccz, rad, cnt] of [
        [70, -470, 15, 11],
        [-140, -320, 9, 7],
      ]) {
        for (let i = 0; i < cnt; i++) {
          const a = (i / cnt) * Math.PI * 2;
          const x = ccx + Math.cos(a) * rad,
            z = ccz + Math.sin(a) * rad;
          fill(x, z, kind);
          if (hash2(i, ccx, seed) < 0.15) continue;
          list.push(x, site.h, z, a + Math.PI / 2, 1.2 + hash2(i, ccz, seed) * 0.5);
        }
      }
    }
    out[kind] = new Float32Array(list);
  });
  return out;

  function fill(x: number, z: number, kind: Kind) {
    if (Math.abs(x) > HALF - 8 || Math.abs(z) > HALF - 8) return false;
    const i = clamp(Math.round(x + HALF), 0, SIZE - 1),
      j = clamp(Math.round(z + HALF), 0, SIZE - 1),
      o = (j * SIZE + i) * 4;
    for (let k = 0; k < 4; k++) w[k] = g.ground0[o + k] / 255;
    w[4] = g.ground1[o] / 255;
    const nx = g.ground1[o + 2] / 127.5 - 1,
      nz = g.ground1[o + 3] / 127.5 - 1;
    site.h = heightAt(g.height, x, z);
    site.slope = Math.sqrt(clamp(nx * nx + nz * nz, 0, 1));
    roads.near(x, z, rd);
    site.road = rd[0];
    site.plateau = smooth(KEEP.plateau + 20, KEEP.plateau - 5, Math.hypot(x - KEEP.x, z - KEEP.z));
    const nearHollow = Math.hypot(x - HOLLOW.x, z - HOLLOW.z) < HOLLOW.radius + 10;
    site.inRock = nearHollow && caveAt(field, x, site.h + 1.5, z) < 0.5;
    site.covered = nearHollow && !site.inRock && underRock(field, x, site.h + 0.5, z);
    // under the Hollow's roof only mushrooms and boulders grow
    return !site.inRock && (!site.covered || kind === "shroom" || kind === "rock");
  }
}
