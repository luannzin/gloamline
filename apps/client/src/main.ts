// Boot, menu and the frame loop. The world builds on every core while the splash says what it's
// doing, then runs behind the menu, framed on you standing in it, so shaders compile and resolution
// settles before anyone walks in (DESIGN.md: the world is the menu).
import "./style.css";
import { COLUMN, HALF, HOLLOW, heightAt, Land, NREG, REGIONS, SIZE } from "@zimovye/world";
import * as THREE from "three/webgpu";
import { randomName, randomSeed } from "@/lib/party";
import { makeBody } from "./body";
import { buildWorld } from "./build";
import { makeColumn } from "./gfx/column";
import { makeFlora } from "./gfx/flora";
import { makeGrass } from "./gfx/grass";
import { loadModels } from "./gfx/models";
import { makeMood } from "./gfx/mood";
import { overlay } from "./gfx/overlay";
import { makeParticles } from "./gfx/particles";
import { makePost } from "./gfx/post";
import { makePuffs } from "./gfx/puffs";
import { makeCave, makeRuins } from "./gfx/stone";
import { makeTerrain } from "./gfx/terrain";
import { detailTexture, foliageAtlas, groundTextures } from "./gfx/textures";
import { makeTowers } from "./gfx/towers";
import { makeTrails } from "./gfx/trails";
import { makeVillage } from "./gfx/village";
import { makeWanderers } from "./gfx/wanderers";
import { makeWater } from "./gfx/water";
import { makeWind } from "./gfx/wind";
import { drawMap, toMap } from "./map";
import { type Lobby, newSecret, openLobby, poseAt, secretFromHash } from "./net";
import { makePlayer } from "./player";
import { makeStage } from "./stage";
import { mountUI } from "./ui/mount";
import { type Mark, type Person, ui } from "./ui/store";
import {
  type Details,
  DRESS,
  differ,
  LENS,
  loadVideo,
  PRESET_NAMES,
  SCALE_MAX,
  SCALE_MIN,
  saveVideo,
  type Video,
  withPreset,
} from "./video";

const canvas = document.getElementById("c") as HTMLCanvasElement;
mountUI(document.getElementById("ui")!);
const say = (stage: string, progress: number) => ui.set({ stage, progress });

/** A first visit's preset: Low on a phone, Medium with 4 GB of memory or less, High otherwise. */
function firstPreset() {
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (matchMedia("(pointer: coarse)").matches) return 0;
  return mem <= 4 ? 1 : 2;
}

// fixed viewpoints, keys 1-9 (and the screenshot script): x, z, look-at x, y, z, optional y
const VIEWS: number[][] = [
  [-262, 262, -170, 30, 150],
  [292, 292, 430, 2, 430],
  [272, -170, 370, 75, -245],
  [-392, -332, -404, HOLLOW.floor + 30, -380, HOLLOW.floor + 0.2],
  [40, -446, 70, 120, -790],
  [-352, -148, -364, HOLLOW.floor + 6, -205],
  // 7: into the low sun through Chernolesye (shafts, leaves lit from behind)
  [-250, 190, -350, 40, 230],
  // 8: the keep's courtyard, toward the inner keep
  [405, -222, 362, 76, -266],
  // 9: Cinder Keep on its cliff, from the road below
  [205, -118, 380, 82, -250],
];

async function boot() {
  // the settings asked for; what's built from them catches up (`dressed`, `lensed` below)
  let want = loadVideo(firstPreset());
  ui.set({ video: want });
  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
  });
  await renderer.init();
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // cleared to nothing: the overlay's pass (gfx/overlay.ts) is composited by how much it covers
  renderer.setClearColor(0x000000, 0);
  const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? "WebGPU" : "WebGL 2";

  // the display's refresh, measured while the workers build: dynamic resolution holds this rate
  const intervals: number[] = [];
  let probeLast = 0;
  const probe = (t: number) => {
    if (probeLast) intervals.push(t - probeLast);
    probeLast = t;
    if (intervals.length < 120) requestAnimationFrame(probe);
  };
  requestAnimationFrame(probe);
  const [world, models] = await Promise.all([
    buildWorld(say),
    loadModels(["rocks.glb", "trees.glb", "architecture.glb", "survivor.glb", "village.glb"]),
  ]);
  const refresh = intervals.length > 20 ? intervals.sort((a, b) => a - b)[intervals.length >> 1] : 1000 / 60;
  say("Lighting the world…", 0.85);

  const land = new Land(world.seed);
  const label = (name: string, x: number, z: number) => {
    const [u, v] = toMap(x, z);
    return { name, u, v };
  };
  ui.set({
    mapImage: drawMap(world),
    mapLabels: [...REGIONS.map((r) => label(r.name, r.x, r.z)), label("The Column", COLUMN.x, COLUMN.z + 40)],
  });
  {
    const [u, v] = toMap(COLUMN.x, COLUMN.z);
    Object.assign(ui.live.goal, { u, v });
  }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 3200);
  const tex = groundTextures(world);
  const detail = detailTexture();
  const wind = makeWind();
  const mood = makeMood(land, world, detail, want.shadows, want.sky > 0, wind);
  scene.add(mood.sun, mood.sun.target, mood.hemi, mood.dome);
  scene.fogNode = mood.fogNode;
  const trails = makeTrails();
  const puffs = makePuffs(mood, wind);
  overlay.add(puffs.mesh);
  overlay.fogNode = mood.fogNode;
  const wanderers = makeWanderers(camera, document.getElementById("tags")!, models);
  scene.add(
    makeRuins(world, detail),
    makeCave(world, detail),
    makeColumn(world, detail, mood),
    makeTowers(world, models, detail),
    makeVillage(world, models, detail, mood),
    wanderers.group,
  );

  // What the video details change (video.ts), built apart so a change rebuilds only this, in place,
  // the world and the models kept: the ground's shading, the props' reach, the grass, the weather,
  // the water's mirror and the light from the sky (the dressing); and the lens.
  const shared = new Set<THREE.BufferGeometry>(models.values());
  function dress(v: Details) {
    const atlas = foliageAtlas(v.textures > 0 ? 1024 : 512);
    const terrain = makeTerrain(tex, detail, mood, v.shadows, trails, v.distance);
    const flora = makeFlora(world, { ground0: tex.ground0, detail, atlas }, mood, v.distance, models);
    const grass = v.grass > 0 ? makeGrass(tex, detail, mood, v.grass, trails) : null;
    const particles = makeParticles(tex.height, mood, wind, v.effects);
    const group = new THREE.Group().add(
      terrain.group,
      flora.group,
      makeWater(tex.height, detail, mood, v.reflections),
    );
    if (grass) group.add(grass.mesh);
    // image-based light from the sky itself, redrawn when the sky has changed enough (mood.ts)
    const pmrem = v.sky > 0 ? new THREE.PMREMGenerator(renderer) : null;
    let envRT: THREE.RenderTarget | null = null;
    return {
      group,
      /** the specks, drawn over the settled image (overlay.ts) */
      fx: particles.group,
      sky() {
        if (pmrem && mood.envDue()) {
          envRT = pmrem.fromScene(mood.skyScene, 0, 1, 3000, { size: 256, renderTarget: envRT as never });
          scene.environment = envRT.texture;
        }
        scene.environmentIntensity = mood.envIntensity;
      },
      /** Lays out what's around the camera. */
      update() {
        terrain.update(camera);
        camera.updateMatrixWorld();
        flora.update(camera);
        grass?.update(camera.position);
        particles.update(camera, canvas.height);
      },
      dispose() {
        scene.remove(group);
        overlay.remove(particles.group);
        for (const g of [group, particles.group])
          g.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            if (!shared.has(m.geometry)) m.geometry.dispose();
            (m.material as THREE.Material).dispose();
          });
        atlas.dispose();
        envRT?.dispose();
        pmrem?.dispose();
        scene.environment = null;
      },
    };
  }
  /** The frame time dynamic resolution holds: the display's refresh, or the cap when it's slower. */
  const budget = (fps: number) => Math.max(1000 / 240, refresh, fps ? 1000 / fps : 0);
  const lens = (v: Video) => {
    const p = makePost(renderer, scene, camera, mood, v);
    p.target = budget(v.fps);
    return p;
  };
  // what's built, and from which settings
  let d = dress(want),
    dressed = want,
    post = lens(want),
    lensed = want;
  scene.add(d.group);
  overlay.add(d.fx);

  // the lantern: warm, short, on F; lit to begin with, the warmest thing in the menu's shot
  const lantern = new THREE.PointLight(0xffb066, 0, 16, 1.6);
  scene.add(lantern);
  let lanternOn = true;

  // how deep the snow is under (x, z), 0..1: the mood's snow on ground that's near level, none on
  // the roads (trodden) or under the mine's rock. The shader's patches aren't counted: close enough.
  const G1 = world.ground.ground1;
  function snowDepth(x: number, z: number) {
    const i = Math.min(SIZE - 1, Math.max(0, Math.round(x + HALF))),
      j = Math.min(SIZE - 1, Math.max(0, Math.round(z + HALF))),
      o = (j * SIZE + i) * 4;
    const nx = G1[o + 2] / 127.5 - 1,
      nz = G1[o + 3] / 127.5 - 1;
    const ny = Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz));
    const flat = Math.min(1, Math.max(0, (ny - 0.75) / 0.17));
    return mood.u.snow.value * mood.u.open.value * flat * (1 - G1[o + 1] / 255);
  }
  /**
   * How much fresh snow is in the way at (x, z), 0..1: the depth, less what's already pressed there
   * (a trench someone ploughed is firm going: trails.ts).
   */
  function fresh(x: number, z: number) {
    const d = snowDepth(x, z);
    if (d < 0.01) return 0;
    return d * (1 - 0.85 * Math.min(1, trails.depthAt(x, z) / (d * 0.36)));
  }
  const body = makeBody();
  const player = makePlayer(
    world,
    camera,
    canvas,
    () => body.canRun,
    // a stride ahead, where the next step goes
    (dx, dz) => fresh(player.pos.x + dx * 0.6, player.pos.z + dz * 0.6),
    () => trails.depthAt(player.pos.x, player.pos.z),
  );
  const stage = makeStage(camera, (x, z) => heightAt(world.ground.height, x, z));

  const v = VIEWS[0];
  player.teleport(v[0], v[1], v[2], v[3], v[4]);
  const tick = (dt: number, active: boolean) => {
    player.update(dt, active);
    stage.update(dt, player.pos.x, player.pos.y, player.pos.z, player.yaw);
    mood.update(camera.position, dt);
    wind.update(dt, mood.u.snowfall.value);
    d.sky();
    d.update();
    post.frame();
    lantern.position.set(
      camera.position.x + Math.sin(-player.yaw) * 0.4,
      camera.position.y - 0.35,
      camera.position.z - Math.cos(player.yaw) * 0.4,
    );
    // (over the shoulder, the lantern in the body's hand lights the way instead: wanderers.ts)
    lantern.intensity +=
      ((lanternOn ? 9 * (1 - player.behind) : 0) - lantern.intensity) * Math.min(1, dt * 6);
  };
  tick(0, false);
  await renderer.compileAsync(scene, camera);
  await renderer.compileAsync(overlay, camera);

  // --- the settings take effect as they change. The scale, dynamic resolution and the cap apply at
  // once; a lens detail rebuilds the lens at once; a world detail builds a new dressing and compiles
  // it beside the old one, which keeps the world moving meanwhile (seconds), then swaps it in ---
  let settling: Promise<void> | null = null;
  async function settle() {
    ui.set({ videoBusy: true });
    try {
      while (differ(want, dressed, DRESS)) {
        const v = want;
        const next = dress(v);
        next.update();
        await renderer.compileAsync(next.group, camera, scene);
        await renderer.compileAsync(next.fx, camera, overlay);
        d.dispose();
        mood.configure(v.shadows, v.sky > 0);
        d = next;
        dressed = v;
        scene.add(d.group);
        overlay.add(d.fx);
      }
    } finally {
      settling = null;
      ui.set({ videoBusy: false });
    }
  }
  function apply(next: Video) {
    want = next;
    saveVideo(next);
    ui.set({ video: next });
    if (differ(next, lensed, LENS)) {
      post.dispose();
      // the upscaler's jitter stays on the camera otherwise
      camera.clearViewOffset();
      post = lens(next);
      lensed = next;
    } else {
      post.setScale(next.scale, next.dynamic);
      post.target = budget(next.fps);
    }
    // (a change asked for while one compiles is picked up by the same settle's loop)
    if (!settling && differ(next, dressed, DRESS)) settling = settle();
    return settling ?? Promise.resolve();
  }
  ui.actions.video = (next) => void apply(next);

  // --- finding what this machine holds: each preset in turn at 100%, every frame timed to the GPU's
  // finish (so the display's rate doesn't hide the headroom), until one costs more than the budget
  // (60 fps or the display's rate, whichever is slower, less a fifth for heavier places). The best
  // that fit is kept, its scale raised while it still would (Ultra, to 200%), or Low's lowered. ---
  let benching = false;
  const gpu = renderer.backend as { device?: { queue: { onSubmittedWorkDone(): Promise<void> } } } & {
    gl?: { finish(): void };
  };
  async function timeFrame() {
    const t = performance.now();
    tick(1 / 60, false);
    post.pipe.render();
    if (gpu.device) await gpu.device.queue.onSubmittedWorkDone();
    else gpu.gl?.finish();
    return performance.now() - t;
  }
  ui.actions.detect = async () => {
    if (benching || settling) return;
    benching = true;
    ui.set({ detecting: true });
    const keep = want,
      goal = Math.max(refresh, 1000 / 60) * 0.8;
    let best = -1,
      bestMs = 0,
      lowMs = 0;
    try {
      for (let p = 0; p < PRESET_NAMES.length; p++) {
        ui.set({ detect: `Testing ${PRESET_NAMES[p]}…` });
        await apply({ ...withPreset(keep, p), scale: 1, dynamic: false, fps: 0 });
        // the first frames compile the lens and draw the shadow map: not counted
        for (let i = 0; i < 12; i++) await timeFrame();
        const ms: number[] = [];
        for (let i = 0; i < 40; i++) ms.push(await timeFrame());
        const m = ms.sort((a, b) => a - b)[ms.length >> 1];
        if (p === 0) lowMs = m;
        if (m > goal) break;
        best = p;
        bestMs = m;
      }
      // pixels go with the square of the scale; snapped down to 5%
      const fit = (ms: number) => Math.floor(Math.sqrt(goal / ms) * 20) / 20;
      const p = Math.max(0, best);
      const scale =
        best < 0
          ? Math.max(SCALE_MIN, fit(lowMs))
          : p === PRESET_NAMES.length - 1
            ? Math.min(SCALE_MAX, Math.max(1, fit(bestMs)))
            : 1;
      await apply({ ...withPreset(keep, p), scale, dynamic: true, fps: keep.fps });
      ui.set({
        detect: `${PRESET_NAMES[p]} at ${Math.round(scale * 100)}%: ${(best < 0 ? lowMs : bestMs).toFixed(1)} ms a frame at 100%`,
      });
    } catch (e) {
      console.error(e);
      await apply(keep);
      ui.set({ detect: "The test didn't finish: your settings are as they were." });
    } finally {
      benching = false;
      ui.set({ detecting: false });
    }
  };

  // --- the lobby: open when the page came from a link, or when someone asks for one. No name to
  // choose yet: everyone is given one ---
  const me = {
    name: localStorage.getItem("name") || randomName(),
    seed: Number(localStorage.getItem("seed")) || randomSeed(),
  };
  localStorage.setItem("name", me.name);
  localStorage.setItem("seed", String(me.seed));
  let lobby: Lobby | null = null;
  // who was here last time, to say in the feed who came and who went
  let known = new Map<string, string>();
  const party = () => {
    const list: Person[] = [{ id: "me", name: me.name, seed: me.seed, you: true }];
    const now = new Map<string, string>();
    for (const r of lobby?.people.values() ?? []) {
      list.push({ id: r.id, name: r.name, seed: r.seed });
      now.set(r.id, r.name || "A survivor");
      if (!known.has(r.id)) ui.note(`${r.name || "A survivor"} found you`, "warm");
    }
    for (const [id, name] of known)
      if (!now.has(id)) {
        ui.note(`${name} is gone`, "cold");
        trails.forget(id);
      }
    known = now;
    ui.set({ party: list });
  };
  async function join(secret: string) {
    if (lobby) return;
    history.replaceState(null, "", `#${secret}`);
    ui.set({ invite: location.href, full: false });
    lobby = await openLobby(secret, me, party);
    party();
    // arrived to a room already at eight: say so and leave
    setTimeout(() => {
      if (lobby?.crowded) {
        void lobby.leave();
        lobby = null;
        ui.set({ full: true, invite: null, party: [] });
        history.replaceState(null, "", location.pathname);
      }
    }, 3000);
  }
  const linked = secretFromHash(location.hash);
  if (linked) void join(linked);
  ui.actions.invite = () => void join(newSecret());

  // --- menu and play: the camera moves to your shoulder, then the controls are yours ---
  const phase = () => ui.get().phase;
  const toMenu = () => {
    stage.go(false);
    document.body.classList.remove("playing");
    ui.set({ phase: "menu", mapOpen: false });
  };
  ui.actions.enter = () => {
    if (phase() !== "menu") return;
    // where pointer lock is refused (an embedded page), play anyway: drag to look, Esc for the menu
    Promise.resolve(canvas.requestPointerLock()).catch(() => {});
    stage.go(true);
    document.body.classList.add("playing");
    ui.set({ phase: "entering", started: true });
  };
  document.addEventListener("pointerlockchange", () => {
    if (!document.pointerLockElement && phase() !== "menu") toMenu();
  });
  addEventListener("keydown", (e) => {
    const playing = phase() === "playing";
    if (e.code === "Escape" && phase() !== "menu" && !document.pointerLockElement) toMenu();
    const i = Number(e.key) - 1;
    if (playing && i >= 0 && i < VIEWS.length) {
      const p = VIEWS[i];
      player.teleport(p[0], p[1], p[2], p[3], p[4], p[5]);
    }
    if (e.code === "KeyH") showStats = !showStats;
    if (e.code === "KeyF" && playing) {
      lanternOn = !lanternOn;
      ui.note(lanternOn ? "Lantern lit" : "Lantern out", lanternOn ? "warm" : undefined);
    }
    // in play, Tab would walk the focus through the page: there it opens the map
    if (e.code === "Tab" && playing) {
      e.preventDefault();
      if (!e.repeat) {
        ui.set({ mapOpen: !ui.get().mapOpen });
        marksT = 1;
      }
    }
  });
  addEventListener("resize", () => {
    // a window hidden to nothing keeps its last size (a 0 px canvas is an invalid GPU texture)
    if (!innerWidth || !innerHeight) return;
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
    // the scale's ceiling depends on the window's size (post.ts)
    post.setScale(want.scale, want.dynamic);
  });
  ui.set({ phase: "menu", progress: 1 });
  stage.arrive();

  // --- area names, the way they appear when you cross into one ---
  const w = new Float32Array(NREG);
  let area = -1,
    areaKey = 0;
  function areaCheck() {
    const edge = land.weights(camera.position.x, camera.position.z, w);
    let best = 0;
    for (let i = 1; i < NREG; i++) if (w[i] > w[best]) best = i;
    if (edge > 0.6) best = 4;
    if (w[best] > 0.62 && best !== area) {
      area = best;
      ui.set({ area: { name: REGIONS[best].name, ru: REGIONS[best].ru, key: ++areaKey } });
    }
  }

  // --- the HUD's live channel: you every frame, everyone else ten times a second ---
  const pose = new Float32Array(5);
  function others() {
    const list: Mark[] = [];
    const t = performance.now() - 100;
    for (const r of lobby?.people.values() ?? []) {
      if (!poseAt(r, t, pose)) continue;
      const [ru, rv] = toMap(pose[0], pose[2]);
      list.push({ id: r.id, name: r.name, seed: r.seed, u: ru, v: rv, heading: -pose[3] });
    }
    ui.live.others = list;
  }
  function live() {
    const m = ui.live.me;
    m.u = (player.pos.x + HALF) / SIZE;
    m.v = (player.pos.z + HALF) / SIZE;
    m.heading = -player.yaw;
    ui.live.goal.dist = Math.hypot(player.pos.x - COLUMN.x, player.pos.z - COLUMN.z);
  }

  // --- the body: the cold, the bad water, the lantern; when it gives out, you come to at the road ---
  const shown = { ...body.v };
  let vitalsT = 0;
  function vitals(dt: number) {
    const down = body.update(dt, {
      running: player.running,
      deep: player.deep,
      open: mood.u.open.value,
      cold: mood.u.snowfall.value,
      lantern: lanternOn,
      bad: mood.u.fireflies.value,
    });
    if (down) {
      body.reset();
      player.teleport(world.spawn[0], world.spawn[2], v[2], v[3], v[4]);
      ui.note("You came to by the road", "cold");
    }
    const b = body.v;
    // the HUD hears about it at most ten times a second, and only when something moved
    vitalsT += dt;
    if (vitalsT < 0.1) return;
    vitalsT = 0;
    if (
      Math.abs(b.health - shown.health) +
        Math.abs(b.stamina - shown.stamina) +
        Math.abs(b.warmth - shown.warmth) +
        Math.abs(b.rad - shown.rad) >
      0.004
    ) {
      Object.assign(shown, b);
      ui.set({ vitals: { ...b } });
    }
  }

  /** Someone's feet at (x, z) facing `heading`: the trail, and snow kicked up at each print. */
  function step(id: string, x: number, z: number, heading: number, hard: number) {
    const depth = snowDepth(x, z);
    if (!trails.walk(id, x, z, heading, depth) || depth < 0.25) return;
    const px = trails.print[0],
      pz = trails.print[1];
    const y = heightAt(world.ground.height, px, pz) - trails.depthAt(px, pz) * 0.6;
    puffs.kick(px, y, pz, Math.sin(heading), -Math.cos(heading), depth, hard);
  }
  let breathT = 1;

  let last = performance.now(),
    due = 0,
    statT = 0,
    frames = 0,
    sendT = 0,
    marksT = 0,
    showStats = false;
  renderer.setAnimationLoop(() => {
    // the detection test draws its own frames
    if (benching) return;
    const now = performance.now();
    // the frame-rate cap: display frames are skipped until the next is due (a little early, so a cap
    // at the display's own rate keeps every frame); `due` keeps the average on the cap
    if (want.fps) {
      const gap = 1000 / want.fps;
      if (now < due - 1.5) return;
      due = Math.max(due, now - gap) + gap;
    }
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    // the move into play has landed: the controls are yours
    if (phase() === "entering" && stage.k >= 1) ui.set({ phase: "playing" });
    const playing = phase() === "playing";
    tick(dt, playing);
    if (playing) {
      areaCheck();
      vitals(dt);
    }
    // everyone's feet in the snow (trails.ts), remote ones where they're drawn: 100 ms ago; each step
    // in the drift kicks snow up
    if (player.grounded) step("me", player.pos.x, player.pos.z, -player.yaw, player.running ? 1 : 0);
    if (lobby) {
      const t = performance.now() - 100;
      for (const r of lobby.people.values())
        if (poseAt(r, t, pose)) step(r.id, pose[0], pose[2], -pose[3], 0);
    }
    puffs.update(dt, camera);
    // breath, steaming in front of the face: quicker and harder out of breath
    breathT -= dt;
    if (breathT <= 0) {
      const spent = 1 - body.v.stamina;
      breathT = 2.9 - 1.6 * Math.max(spent, player.running ? 0.6 : 0) + Math.random() * 0.6;
      const fx = -Math.sin(player.yaw),
        fz = -Math.cos(player.yaw);
      puffs.breathe(
        player.pos.x + fx * 0.22,
        player.pos.y - player.sunk + 1.58,
        player.pos.z + fz * 0.22,
        fx,
        fz,
        spent,
      );
    }
    trails.update(dt, camera.position.x, camera.position.z, mood.u.snowfall.value);
    // your body: in the menu's shot and over the shoulder, gone once the camera is behind your eyes
    wanderers.self(
      me.seed,
      player.pos.x,
      player.pos.y - player.sunk,
      player.pos.z,
      player.yaw,
      lanternOn,
      player.behind > 0.3 || stage.k < 0.75,
    );
    live();
    marksT += dt;
    if (marksT > 0.1) {
      marksT = 0;
      others();
    }
    if (lobby) {
      wanderers.update(lobby.people, trails.depthAt);
      sendT += dt;
      if (sendT > 1 / 15) {
        sendT = 0;
        lobby.send(player.pos.x, player.pos.y, player.pos.z, player.yaw, lanternOn);
      }
    }
    post.adapt(dt);
    post.pipe.render();
    frames++;
    statT += dt;
    if (statT > 0.5) {
      const p = camera.position;
      ui.set({
        stats: showStats
          ? `${backend}  ${(frames / statT).toFixed(0)} fps  ${(post.ratio * 100).toFixed(0)}%\n${p.x.toFixed(0)} ${p.y.toFixed(0)} ${p.z.toFixed(0)}`
          : null,
      });
      statT = frames = 0;
    }
  });
  // a handle for poking at the running game from the dev tools (fixed poses, timings)
  if (import.meta.env.DEV)
    Object.assign(window, {
      __game: {
        player,
        camera,
        mood,
        VIEWS,
        scene,
        get post() {
          return post;
        },
        renderer,
        wanderers,
        body,
        ui,
        trails,
        stage,
        snowDepth,
        overlay,
        wind,
        /** Draws a frame and saves it at full resolution as shots/<name>.png (vite.config.ts). */
        async shot(name: string) {
          post.pipe.render();
          const png = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
          if (png) await fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: "POST", body: png });
          return png?.size ?? 0;
        },
      },
    });
}

boot().catch((e) => {
  console.error(e);
  ui.set({
    error: `Couldn't start the world: ${e instanceof Error ? e.message : e}. Reload the page to try again.`,
  });
});
