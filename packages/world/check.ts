// One run, one "ok": the world builds, is deterministic, and its parts hold their contracts.
import {
  BLOCK,
  buildWorld,
  caveAt,
  HALF,
  HOLLOW,
  HOUSE,
  heightAt,
  KEEP,
  KINDS,
  Land,
  NREG,
  POLE,
  PROP,
  SEED,
  SIZE,
  WATER_Y,
} from "./src";

const assert = (c: unknown, m: string) => {
  if (!c) throw new Error(`check failed: ${m}`);
};

const w = buildWorld(SEED, (s, ms) => console.log(`${s.padEnd(11)} ${ms.toFixed(0).padStart(6)} ms`));
const { height } = w.ground;

let lo = Infinity,
  hi = -Infinity;
for (const h of height) {
  assert(Number.isFinite(h), "finite heights");
  lo = Math.min(lo, h);
  hi = Math.max(hi, h);
}
console.log(`height      ${lo.toFixed(1)} .. ${hi.toFixed(1)} m`);

// same seed, same land
const a = new Land(SEED),
  b = new Land(SEED),
  t = new Float32Array(NREG);
for (let i = 0; i < 200; i++) {
  const x = Math.sin(i * 12.9) * HALF,
    z = Math.cos(i * 78.2) * HALF;
  assert(a.rawHeight(x, z, t) === b.rawHeight(x, z, t), "deterministic heights");
}

assert(heightAt(height, KEEP.x, KEEP.z) > KEEP.top - 8, "keep stands on its plateau");
let wet = 0;
for (let j = 0; j < 200; j++)
  for (let i = 0; i < 200; i++) if (heightAt(height, 260 + i, 260 + j) < WATER_Y) wet++;
assert(wet > 2000, `the mire has water (${wet})`);
assert(w.spawn[1] > WATER_Y + 1, "spawn is dry");
assert(caveAt(w.field, HOLLOW.x, HOLLOW.floor + 6, HOLLOW.z) > 0, "the big chamber is open");
assert(caveAt(w.field, HOLLOW.x + 60, HOLLOW.floor + 40, HOLLOW.z + 60) < 0, "the mountain is solid");
assert(caveAt(w.field, -358, HOLLOW.floor + 4, -180) > 0, "the cave mouth is open");

// surface nets winding: faces point the way the field's gradient does (out of the rock)
const { positions: P, normals: N, indices: I } = w.cave;
let agree = 0;
for (let k = 0; k < I.length; k += 3) {
  const [i0, i1, i2] = [I[k] * 3, I[k + 1] * 3, I[k + 2] * 3];
  const ux = P[i1] - P[i0],
    uy = P[i1 + 1] - P[i0 + 1],
    uz = P[i1 + 2] - P[i0 + 2];
  const vx = P[i2] - P[i0],
    vy = P[i2 + 1] - P[i0 + 1],
    vz = P[i2 + 2] - P[i0 + 2];
  const fx = uy * vz - uz * vy,
    fy = uz * vx - ux * vz,
    fz = ux * vy - uy * vx;
  if (
    fx * (N[i0] + N[i1] + N[i2]) +
      fy * (N[i0 + 1] + N[i1 + 1] + N[i2 + 1]) +
      fz * (N[i0 + 2] + N[i1 + 2] + N[i2 + 2]) >
    0
  )
    agree++;
}
const ratio = agree / (I.length / 3);
console.log(
  `cave        ${P.length / 3} vertices, ${I.length / 3} triangles, winding ${(ratio * 100).toFixed(1)}%`,
);
assert(ratio > 0.97, "cave faces wind outward");

console.log(`ruins       ${w.ruins.length / BLOCK} blocks`);
for (const k of KINDS) console.log(`${k.padEnd(11)} ${w.props[k].length / 5}`);
assert(w.props.oak.length / 5 > 2000, "a forest");
assert(w.props.shroom.length > 0 && w.props.grave.length > 0 && w.props.reed.length > 0, "every kind placed");
assert(SIZE === 2048, "size");

// the village: houses standing back from the road, no tree inside a plot, nobody walled in at spawn
const V = w.village;
console.log(
  `village     ${V.houses.length / HOUSE} houses, ${V.poles.length / POLE} poles, ${V.props.length / PROP} props`,
);
assert(V.houses.length / HOUSE >= 10, "a village");
const r0 = w.roads[0];
for (let i = 0; i < V.houses.length; i += HOUSE) {
  let d = Infinity;
  for (let j = 0; j < r0.length; j += 3)
    d = Math.min(d, Math.hypot(V.houses[i] - r0[j], V.houses[i + 2] - r0[j + 1]));
  assert(d > 9, `house ${i / HOUSE} stands back from the road (${d.toFixed(1)} m)`);
}
for (const k of ["oak", "pine", "dead", "rock"] as const) {
  const p = w.props[k];
  for (let i = 0; i < p.length; i += 5)
    for (let c = 0; c < V.clear.length; c += 3)
      assert(
        Math.hypot(p[i] - V.clear[c], p[i + 2] - V.clear[c + 1]) >= V.clear[c + 2],
        `no ${k} inside a plot`,
      );
}
const S = w.solid;
for (let o = 0; o < S.length; o += BLOCK) {
  const c = Math.cos(-S[o + 6]),
    s = Math.sin(-S[o + 6]);
  const dx = w.spawn[0] - S[o],
    dz = w.spawn[2] - S[o + 2];
  const inside = Math.abs(dx * c - dz * s) < S[o + 3] / 2 && Math.abs(dx * s + dz * c) < S[o + 5] / 2;
  assert(!inside, "spawn is clear of walls");
}
console.log("ok");
