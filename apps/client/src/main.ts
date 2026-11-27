// Boot, lobby and the frame loop. The world builds on every core while the page says what it's
// doing, then runs blurred behind the menu so shaders compile and resolution settles before anyone
// walks in (DESIGN.md: the world is the menu).
import "./style.css";
import { HOLLOW, Land, NREG, REGIONS } from "@gloamline/world";
import * as THREE from "three/webgpu";
import { randomSeed } from "@/lib/avatar";
import { buildWorld } from "./build";
import { makeFlora } from "./gfx/flora";
import { makeGrass } from "./gfx/grass";
import { makeMood } from "./gfx/mood";
import { makeParticles } from "./gfx/particles";
import { makePost, type Quality } from "./gfx/post";
import { makeCave, makeRuins, makeSpire } from "./gfx/stone";
import { makeTerrain } from "./gfx/terrain";
import { detailTexture, foliageAtlas, groundTextures } from "./gfx/textures";
import { makeWanderers } from "./gfx/wanderers";
import { makeWater } from "./gfx/water";
import { type Lobby, newSecret, openLobby, secretFromHash } from "./net";
import { makePlayer } from "./player";
import { mountUI } from "./ui/mount";
import { type Person, ui } from "./ui/store";

const canvas = document.getElementById("c") as HTMLCanvasElement;
mountUI(document.getElementById("ui")!);
const say = (stage: string, progress: number) => ui.set({ stage, progress });

function pickQuality(): Quality {
  const saved = localStorage.getItem("quality");
  if (saved !== null) return Number(saved) as Quality;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (matchMedia("(pointer: coarse)").matches) return 0;
  return mem <= 4 ? 1 : 2;
}

// fixed viewpoints, keys 1-6 (and the screenshot script): x, z, look-at x, y, z, optional y
const VIEWS: number[][] = [
  [-262, 262, -170, 30, 150],
  [292, 292, 430, 2, 430],
  [272, -170, 370, 75, -245],
  [-392, -332, -404, HOLLOW.floor + 30, -380, HOLLOW.floor + 0.2],
  [52, -456, 70, 120, -790],
  [-352, -148, -364, HOLLOW.floor + 6, -205],
];

async function boot() {
  const q = pickQuality();
  ui.set({ quality: q });
  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
  });
  await renderer.init();
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
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
  const world = await buildWorld(say);
  const refresh = intervals.length > 20 ? intervals.sort((a, b) => a - b)[intervals.length >> 1] : 1000 / 60;
  say("Lighting the world…", 0.85);

  const land = new Land(world.seed);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 3200);
  const tex = groundTextures(world);
  const detail = detailTexture();
  const atlas = foliageAtlas();
  const mood = makeMood(land, world);
  scene.add(mood.sun, mood.sun.target, mood.hemi, mood.dome);
  scene.fogNode = mood.fogNode;
  const terrain = makeTerrain(tex, detail, mood);
  const flora = makeFlora(world, { ground0: tex.ground0, detail, atlas }, mood, q);
  const grass = q > 0 ? makeGrass(tex, mood, q) : null;
  const particles = makeParticles(tex.height, mood, q);
  const wanderers = makeWanderers(camera, document.getElementById("tags")!);
  scene.add(
    terrain.group,
    flora.group,
    particles.group,
    makeRuins(world, detail),
    makeCave(world, detail),
    makeSpire(world, detail, mood),
    makeWater(tex.height, detail, mood, q),
    wanderers.group,
  );
  if (grass) scene.add(grass.mesh);

  // the lantern: warm, short, on F
  const lantern = new THREE.PointLight(0xffb066, 0, 16, 1.6);
  scene.add(lantern);
  let lanternOn = false;

  const player = makePlayer(world, camera, canvas);
  const post = makePost(renderer, scene, camera, mood, q);
  post.target = Math.max(1000 / 240, refresh);

  const v = VIEWS[0];
  player.teleport(v[0], v[1], v[2], v[3], v[4]);
  const tick = (dt: number, active: boolean) => {
    player.update(dt, active);
    mood.update(camera.position, dt);
    terrain.update(camera);
    camera.updateMatrixWorld();
    flora.update(camera);
    grass?.update(camera.position);
    particles.update(camera);
    post.frame();
    lantern.position.set(
      camera.position.x + Math.sin(-player.yaw) * 0.4,
      camera.position.y - 0.35,
      camera.position.z - Math.cos(player.yaw) * 0.4,
    );
    lantern.intensity += ((lanternOn ? 9 : 0) - lantern.intensity) * Math.min(1, dt * 6);
  };
  tick(0, false);
  await renderer.compileAsync(scene, camera);

  // --- the lobby: open when the page came from a link, or when someone asks for one ---
  const me = {
    name: localStorage.getItem("name") ?? "",
    seed: Number(localStorage.getItem("seed")) || randomSeed(),
  };
  localStorage.setItem("seed", String(me.seed));
  let lobby: Lobby | null = null;
  const party = () => {
    const list: Person[] = [{ id: "me", name: me.name, seed: me.seed, you: true }];
    for (const r of lobby?.people.values() ?? []) list.push({ id: r.id, name: r.name, seed: r.seed });
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

  // --- menu and play ---
  let playing = false;
  const setPlaying = (on: boolean) => {
    playing = on;
    document.body.classList.toggle("playing", on);
    ui.set({ phase: on ? "playing" : "menu" });
  };
  ui.actions.enter = (name) => {
    me.name = name;
    localStorage.setItem("name", name);
    lobby?.rename(me);
    party();
    // where pointer lock is refused (an embedded page), play anyway: drag to look, Esc for the menu
    Promise.resolve(canvas.requestPointerLock()).catch(() => setPlaying(true));
  };
  ui.actions.invite = () => void join(newSecret());
  ui.actions.quality = (n) => {
    localStorage.setItem("quality", String(n));
    location.reload();
  };
  document.addEventListener("pointerlockchange", () => setPlaying(document.pointerLockElement === canvas));
  addEventListener("keydown", (e) => {
    if (e.code === "Escape" && playing && !document.pointerLockElement) setPlaying(false);
    const i = Number(e.key) - 1;
    if (playing && i >= 0 && i < VIEWS.length) {
      const p = VIEWS[i];
      player.teleport(p[0], p[1], p[2], p[3], p[4], p[5]);
    }
    if (e.code === "KeyH") showStats = !showStats;
    if (e.code === "KeyF" && playing) lanternOn = !lanternOn;
  });
  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
  });
  ui.set({ phase: "menu", progress: 1 });

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
      ui.set({ area: { name: REGIONS[best].name, key: ++areaKey } });
    }
  }

  let last = performance.now(),
    statT = 0,
    frames = 0,
    sendT = 0,
    showStats = false;
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    tick(dt, playing);
    if (playing) areaCheck();
    if (lobby) {
      wanderers.update(lobby.people);
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
    Object.assign(window, { __game: { player, camera, mood, VIEWS, scene, post, renderer } });
}

boot().catch((e) => {
  console.error(e);
  ui.set({
    error: `Couldn't start the world: ${e instanceof Error ? e.message : e}. Reload the page to try again.`,
  });
});
