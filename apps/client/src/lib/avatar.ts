// A person is a little pixel-art critter drawn from one 32-bit seed (copied from Sightline's
// `src/lib/avatar.ts`), so the seed is all that goes over the wire and every browser draws the same
// one. A change there needs copying here.

import { DUSK, dither, LINE, NIGHT, WHITE } from "./palette";

export const SIZE = 16;

// Half a body, outer column first, mirrored at the centre: 0 never, 1 maybe, 2 always.
const HALF = [
  "000011",
  "000112",
  "001122",
  "011222",
  "012222",
  "112222",
  "112222",
  "012222",
  "011222",
  "011122",
  "010011",
  "010010",
];
const AT = 2;

const RAMPS = [
  [1, 2],
  [2, 3],
  [0, 1, 2],
  [1, 2, 3],
].map((r) => r.map((i) => DUSK[i]));

function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The critter for `seed`: SIZE x SIZE colours, row by row. */
export function drawAvatar(seed: number): string[] {
  const rand = random(seed);
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
  const W = HALF[0].length * 2;
  const H = HALF.length;
  const body = HALF.map((row) => {
    const half = [...row].map((c) => c === "2" || (c === "1" && rand() < 0.5));
    return [...half, ...half.toReversed()];
  });
  const cyclops = rand() < 0.25;
  const ey = pick([4, 5]);
  const ex = cyclops ? 4 : pick([2, 3]);
  const ew = cyclops ? 4 : 2;
  const eh = cyclops ? 3 : 2;
  const look = { x: pick([0, 1]), y: pick([0, 1]) };
  const closed = !cyclops && rand() < 0.12;
  const mouth = rand() < 0.4;
  for (let y = ey - 1; y <= ey + eh + (mouth ? 2 : 0); y++)
    for (let x = ex - 1; x < W / 2; x++) {
      body[y][x] = true;
      body[y][W - 1 - x] = true;
    }
  const keep = body.map((row) => row.map(() => false));
  const queue = [[ey, W / 2]];
  while (queue.length) {
    const [y, x] = queue.pop() as number[];
    if (y < 0 || y >= H || x < 0 || x >= W || keep[y][x] || !body[y][x]) continue;
    keep[y][x] = true;
    queue.push([y + 1, x], [y - 1, x], [y, x + 1], [y, x - 1]);
  }
  const filled = keep.map((row) => row.includes(true));
  const top = filled.indexOf(true);
  const bottom = filled.lastIndexOf(true);
  const ramp = [...pick(RAMPS)];
  if (rand() < 0.5) ramp.reverse();
  const out: string[] = [];
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) out.push(dither(2, (y / (SIZE - 1)) ** 3 * 0.3, x, y) ? DUSK[0] : NIGHT);
  const set = (x: number, y: number, color: string) => {
    out[(y + AT) * SIZE + x + AT] = color;
  };
  const isBody = (x: number, y: number) => keep[y]?.[x] ?? false;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (isBody(x, y)) {
        const t = bottom > top ? (y - top) / (bottom - top) : 0;
        set(x, y, ramp[dither(ramp.length, t, x + AT, y + AT)]);
      }
  for (let y = -1; y <= H; y++)
    for (let x = -1; x <= W; x++)
      if (!isBody(x, y) && (isBody(x + 1, y) || isBody(x - 1, y) || isBody(x, y + 1) || isBody(x, y - 1)))
        set(x, y, LINE);
  const eyes = cyclops ? [W / 2 - 2] : [ex, W - ex - ew];
  for (const left of eyes) {
    if (closed) {
      for (let x = left; x < left + ew; x++) set(x, ey + 1, LINE);
      continue;
    }
    for (let y = ey; y < ey + eh; y++) for (let x = left; x < left + ew; x++) set(x, y, WHITE);
    const p = cyclops ? 2 : 1;
    const px = left + look.x * (ew - p);
    const py = ey + look.y * (eh - p);
    for (let y = py; y < py + p; y++) for (let x = px; x < px + p; x++) set(x, y, NIGHT);
  }
  if (mouth) for (const x of [W / 2 - 1, W / 2]) set(x, ey + eh + 1, LINE);
  return out;
}

/** One SVG path per colour, so an avatar is a handful of nodes rather than 256. */
export function avatarPaths(seed: number): [color: string, d: string][] {
  const byColor = new Map<string, string>();
  drawAvatar(seed).forEach((color, i) => {
    const d = `M${i % SIZE} ${Math.floor(i / SIZE)}h1v1h-1z`;
    byColor.set(color, (byColor.get(color) ?? "") + d);
  });
  return [...byColor];
}

export function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}
