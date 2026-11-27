// The map behind Tab: drawn once from the world (a shaded relief tinted by region, water, roads,
// the keep's stones, the Spire), as an image the interface shows under the players' marks.
import { BLOCK, HALF, SIZE, SPIRE, WATER_Y, type World } from "@gloamline/world";

const PX = 512,
  STEP = SIZE / PX;

// region tints (sRGB): wood, mire, keep, highlands; rock, snow, water, road
const TINT = [
  [58, 86, 48],
  [46, 72, 70],
  [104, 88, 76],
  [142, 136, 90],
];
const ROCK = [110, 107, 102],
  SNOW = [205, 208, 214],
  WATER = [28, 46, 70],
  ROAD = [200, 180, 136];

/** World (x, z) to the map's 0..1 (x right, north up). */
export const toMap = (x: number, z: number) => [(x + HALF) / SIZE, (z + HALF) / SIZE] as const;

/** A PNG data URL of the map, PX x PX. */
export function drawMap(w: World) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = PX;
  const g = cv.getContext("2d")!;
  const img = g.createImageData(PX, PX);
  const H = w.ground.height,
    G0 = w.ground.ground0,
    G1 = w.ground.ground1;
  const h = (i: number, j: number) =>
    H[Math.min(SIZE - 1, Math.max(0, j)) * SIZE + Math.min(SIZE - 1, Math.max(0, i))];
  for (let y = 0; y < PX; y++)
    for (let x = 0; x < PX; x++) {
      const i = x * STEP + STEP / 2,
        j = y * STEP + STEP / 2,
        k = (j * SIZE + i) * 4;
      // hillshade, lit from the north-west
      const dx = (h(i + STEP, j) - h(i - STEP, j)) / (2 * STEP),
        dz = (h(i, j + STEP) - h(i, j - STEP)) / (2 * STEP);
      const shade = Math.max(0.55, Math.min(1.2, 0.9 + (dx * 0.7 + dz * 0.7) * -0.7));
      const ht = h(i, j);
      const c = [0, 0, 0];
      let sum = 0;
      for (let r = 0; r < 4; r++) {
        const wgt = G0[k + r] / 255;
        sum += wgt;
        for (let q = 0; q < 3; q++) c[q] += TINT[r][q] * wgt;
      }
      const rock = Math.max(G1[k] / 255, 1 - sum);
      for (let q = 0; q < 3; q++) c[q] = (c[q] / Math.max(sum, 0.001)) * (1 - rock) + ROCK[q] * rock;
      const snow = Math.min(1, Math.max(0, (ht - 230) / 40));
      const road = G1[k + 1] / 255;
      const water = ht < WATER_Y - 0.15 ? 1 : 0;
      const o = (y * PX + x) * 4;
      for (let q = 0; q < 3; q++) {
        let v = c[q] * (1 - snow) + SNOW[q] * snow;
        v *= shade * (0.85 + Math.min(0.3, ht / 900));
        v = v * (1 - road * 0.8) + ROAD[q] * road * 0.8;
        if (water) v = WATER[q] * (0.85 + 0.15 * shade);
        img.data[o + q] = v;
      }
      img.data[o + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  // the keep's stones
  g.fillStyle = "#2a2320";
  const B = w.ruins;
  for (let o = 0; o < B.length; o += BLOCK) {
    const [u, v] = toMap(B[o], B[o + 2]);
    g.fillRect(u * PX - 1, v * PX - 1, 2, 2);
  }
  // the Spire
  const [su, sv] = toMap(SPIRE.x, SPIRE.z);
  g.fillStyle = "#ffd180";
  g.beginPath();
  g.arc(su * PX, sv * PX, 4, 0, Math.PI * 2);
  g.fill();
  // a vignette into the night, so the edge mountains sink into the page
  const vg = g.createRadialGradient(PX / 2, PX / 2, PX * 0.3, PX / 2, PX / 2, PX * 0.72);
  vg.addColorStop(0, "rgba(17,13,36,0)");
  vg.addColorStop(1, "rgba(17,13,36,0.85)");
  g.fillStyle = vg;
  g.fillRect(0, 0, PX, PX);
  return cv.toDataURL("image/png");
}
