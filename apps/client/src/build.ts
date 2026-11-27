// Builds the world on every core: ground rows and cave slices go to a pool of workers, then one of
// them finishes the world from the pieces.
import { type Ground, jobs, SEED, type World } from "@gloamline/world";

export async function buildWorld(say: (stage: string, share: number) => void, seed = SEED): Promise<World> {
  const n = Math.max(2, Math.min(12, (navigator.hardwareConcurrency || 4) - 1));
  const pool = Array.from(
    { length: n },
    () => new Worker(new URL("./world.worker.ts", import.meta.url), { type: "module" }),
  );
  const list = jobs(n);
  const results: (Ground | Float32Array)[] = new Array(list.length);
  let next = 0,
    done = 0;
  say("Raising the land…", 0.05);
  await new Promise<void>((resolve, reject) => {
    const feed = (w: Worker) => {
      if (next >= list.length) return;
      const id = next++;
      w.postMessage({ type: "job", seed, job: list[id], id });
    };
    for (const w of pool) {
      w.onerror = (e) => reject(new Error(e.message));
      w.onmessage = (e) => {
        results[e.data.id] = e.data.result;
        say(
          done < list.length / 2 ? "Raising the land…" : "Carving the Hollow…",
          0.05 + (++done / list.length) * 0.6,
        );
        if (done === list.length) resolve();
        else feed(w);
      };
      feed(w);
    }
  });
  const ground = results.filter((r): r is Ground => !(r instanceof Float32Array));
  const field = results.filter((r): r is Float32Array => r instanceof Float32Array);
  const lead = pool[0];
  for (const w of pool.slice(1)) w.terminate();
  const world = await new Promise<World>((resolve, reject) => {
    lead.onerror = (e) => reject(new Error(e.message));
    lead.onmessage = (e) => {
      if (e.data.type === "log") say(e.data.s, 0.7);
      else resolve(e.data.world);
    };
    const t: Transferable[] = [
      ...ground.flatMap((g) => [g.height.buffer, g.ground0.buffer, g.ground1.buffer]),
      ...field.map((f) => f.buffer),
    ];
    lead.postMessage({ type: "finish", seed, ground, field }, t);
  });
  lead.terminate();
  return world;
}
