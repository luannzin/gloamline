// Builds pieces of the world off the main thread. The main thread hands out jobs, then sends every
// piece to one worker to finish (mesh the cave, lay the ruins, scatter the props).
import { finishWorld, type Ground, type Job, runJob } from "@gloamline/world";

type In =
  | { type: "job"; seed: number; job: Job; id: number }
  | { type: "finish"; seed: number; ground: Ground[]; field: Float32Array[] };

const post = (m: unknown, t: Transferable[] = []) => (self as unknown as Worker).postMessage(m, t);

self.onmessage = (e: MessageEvent<In>) => {
  const m = e.data;
  if (m.type === "job") {
    const r = runJob(m.seed, m.job);
    const t = r instanceof Float32Array ? [r.buffer] : [r.height.buffer, r.ground0.buffer, r.ground1.buffer];
    post({ type: "done", id: m.id, result: r }, t);
    return;
  }
  const w = finishWorld(m.seed, m.ground, m.field, (s) => post({ type: "log", s }));
  const t: Transferable[] = [
    w.ground.height.buffer,
    w.ground.ground0.buffer,
    w.ground.ground1.buffer,
    w.wear.buffer,
    w.field.buffer,
    w.cave.positions.buffer,
    w.cave.normals.buffer,
    w.cave.indices.buffer,
    w.ruins.buffer,
    ...Object.values(w.props).map((p) => p.buffer),
    ...w.roads.map((r) => r.buffer),
  ];
  post({ type: "world", world: w }, t);
};
