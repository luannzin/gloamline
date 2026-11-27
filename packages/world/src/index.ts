// The world as data: everything a peer needs to draw it and walk in it, built from one seed.
// The two heavy parts (ground rows, cave slices) are independent, so the client splits them across
// workers and calls finishWorld() on the pieces; buildWorld() does it all in one thread.

import { CAVE_DIM, caveField, joinField, surfaceNets } from "./cave";
import { erode } from "./erosion";
import { smooth } from "./noise";
import { buildRuins } from "./ruins";
import { scatter } from "./scatter";
import {
  type Ground,
  groundNormals,
  groundRows,
  HOLLOW,
  heightAt,
  joinGround,
  KEEP,
  Land,
  RoadIndex,
  SIZE,
  sampleRoads,
} from "./terrain";
import { buildVillage } from "./village";

export * from "./cave";
export * from "./erosion";
export * from "./noise";
export * from "./ruins";
export * from "./scatter";
export * from "./terrain";
export * from "./village";

export const SEED = 20261127;

/** Splits n items into `parts` contiguous ranges. */
export function ranges(n: number, parts: number) {
  const out: [number, number][] = [];
  for (let i = 0; i < parts; i++) out.push([Math.floor((n * i) / parts), Math.floor((n * (i + 1)) / parts)]);
  return out;
}

export type Job = { kind: "ground"; from: number; to: number } | { kind: "cave"; from: number; to: number };

/** Every job of a build, sized so `workers` workers finish together. */
export function jobs(workers: number): Job[] {
  // the cave field costs about as much per slice as 4 ground rows' worth of 2048
  return [
    ...ranges(SIZE, workers).map(([from, to]) => ({ kind: "ground" as const, from, to })),
    ...ranges(CAVE_DIM[2], workers).map(([from, to]) => ({ kind: "cave" as const, from, to })),
  ];
}

export function runJob(seed: number, job: Job): Ground | Float32Array {
  const land = new Land(seed);
  if (job.kind === "cave") return caveField(land.noise, job.from, job.to);
  return groundRows(land, new RoadIndex(sampleRoads(land)), job.from, job.to);
}

export function finishWorld(
  seed: number,
  groundParts: Ground[],
  fieldParts: Float32Array[],
  log: (s: string) => void = () => {},
) {
  const land = new Land(seed);
  const roads = sampleRoads(land);
  const index = new RoadIndex(roads);
  const ground = joinGround(groundParts);
  const field = joinField(fieldParts);
  log("Rain on the hills…");
  // roads, the keep's plateau and the Hollow's floor keep their shape; the rest takes the rain
  const rd = new Float32Array(2);
  const wear = erode(ground, seed, (x, z) => {
    index.near(x, z, rd);
    return (
      smooth(5, 16, rd[0]) *
      smooth(KEEP.plateau - 22, KEEP.plateau - 6, Math.hypot(x - KEEP.x, z - KEEP.z)) *
      smooth(HOLLOW.radius - 10, HOLLOW.radius + 30, Math.hypot(x - HOLLOW.x, z - HOLLOW.z))
    );
  });
  groundNormals(ground);
  log("Hollowing the mountain…");
  const cave = surfaceNets(field);
  log("Raising the ostrog…");
  const { blocks: ruins, towers } = buildRuins(ground.height, land.noise, seed);
  log("Building Zarechye…");
  const village = buildVillage(ground.height, roads[0], seed);
  log("Growing the woods…");
  const props = scatter(ground, index, field, land.noise, seed, village.clear);
  const s = roads[0].pts;
  const spawn = [s[6], heightAt(ground.height, s[6], s[7]), s[7]];
  // what bodies collide with: the ruins' solid stones and the village's walls, in one block list
  const solid = new Float32Array(ruins.length + village.blocks.length);
  solid.set(ruins);
  solid.set(village.blocks, ruins.length);
  return {
    seed,
    ground,
    wear,
    roads: roads.map((r) => r.pts),
    field,
    cave,
    ruins,
    towers,
    village,
    solid,
    props,
    spawn,
  };
}

export function buildWorld(seed = SEED, log: (stage: string, ms: number) => void = () => {}) {
  let t = performance.now();
  const lap = (s: string) => {
    const n = performance.now();
    log(s, n - t);
    t = n;
  };
  const g = runJob(seed, { kind: "ground", from: 0, to: SIZE }) as Ground;
  lap("ground");
  const f = runJob(seed, { kind: "cave", from: 0, to: CAVE_DIM[2] }) as Float32Array;
  lap("cave field");
  const w = finishWorld(seed, [g], [f]);
  lap("finish");
  return w;
}

export type World = ReturnType<typeof finishWorld>;
