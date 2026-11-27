// The map: drawn once from the world as an image the interface shows under everyone's marks, both
// behind Tab and turning in the minimap. A winter survey sheet: snow-pale relief, the woods as dark
// stipple, roads as dark lines, the ice, the fort's stones, and the Column in ember.
import { BLOCK, HALF, SIZE, SPIRE, WATER_Y, type World } from "@gloamline/world";

const PX = 1024,
  STEP = SIZE / PX;

// region tints (sRGB) under snow: wood, marsh, fort, fields; rock, road, ice, trees
const TINT = [
  [150, 158, 162],
  [176, 186, 194],
  [138, 128, 122],
  [196, 200, 204],
];
const ROCK = [104, 106, 110],
  ROAD = [70, 74, 80],
  ICE = [96, 118, 138],
  TREE = "rgba(38, 48, 46, 0.55)";

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
      const i = Math.floor(x * STEP + STEP / 2),
        j = Math.floor(y * STEP + STEP / 2),
        k = (j * SIZE + i) * 4;
      // hillshade, lit from the north-west
      const dx = (h(i + 2, j) - h(i - 2, j)) / 4,
        dz = (h(i, j + 2) - h(i, j - 2)) / 4;
      const shade = Math.max(0.6, Math.min(1.15, 0.92 + (dx * 0.7 + dz * 0.7) * -0.8));
      const ht = h(i, j);
      const c = [0, 0, 0];
      let sum = 0;
      for (let r = 0; r < 4; r++) {
        const wgt = G0[k + r] / 255;
        sum += wgt;
        for (let q = 0; q < 3; q++) c[q] += TINT[r][q] * wgt;
      }
      const rock = Math.max(G1[k] / 255, 1 - sum);
      const road = G1[k + 1] / 255;
      const ice = ht < WATER_Y - 0.15;
      const o = (y * PX + x) * 4;
      for (let q = 0; q < 3; q++) {
        let v = (c[q] / Math.max(sum, 0.001)) * (1 - rock) + ROCK[q] * rock;
        v *= shade * (0.9 + Math.min(0.2, ht / 900));
        v = v * (1 - road * 0.85) + ROAD[q] * road * 0.85;
        if (ice) v = ICE[q] * (0.9 + 0.1 * shade);
        img.data[o + q] = v;
      }
      img.data[o + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  // the woods, one stipple per tree
  g.fillStyle = TREE;
  const s = PX / SIZE;
  for (const kind of ["oak", "pine", "dead"] as const) {
    const p = w.props[kind];
    for (let o = 0; o < p.length; o += 5)
      g.fillRect((p[o] + HALF) * s - 0.75, (p[o + 2] + HALF) * s - 0.75, 1.5, 1.5);
  }
  // the fort's stones
  g.fillStyle = "#2b2a2a";
  const B = w.ruins;
  for (let o = 0; o < B.length; o += BLOCK) {
    const [u, v] = toMap(B[o], B[o + 2]);
    g.fillRect(u * PX - 1.5, v * PX - 1.5, 3, 3);
  }
  // the Column
  const [su, sv] = toMap(SPIRE.x, SPIRE.z);
  g.fillStyle = "#ff7a2f";
  g.beginPath();
  g.arc(su * PX, sv * PX, 7, 0, Math.PI * 2);
  g.fill();
  // the edge sinks into the dark, so the mountains at the rim fall off the sheet
  const vg = g.createRadialGradient(PX / 2, PX / 2, PX * 0.32, PX / 2, PX / 2, PX * 0.72);
  vg.addColorStop(0, "rgba(11,13,16,0)");
  vg.addColorStop(1, "rgba(11,13,16,0.85)");
  g.fillStyle = vg;
  g.fillRect(0, 0, PX, PX);
  return cv.toDataURL("image/png");
}
