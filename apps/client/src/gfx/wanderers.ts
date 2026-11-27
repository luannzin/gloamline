// The survivors in the lobby (tools/blender/survivor.py), and you over your own shoulder: a quilted
// telogreika dyed their HUD colour, an ushanka, a rucksack and rifle, and a hurricane lantern that
// lights when theirs is on, with their name above them. Their walk is drawn from how fast their pose
// moves: legs swing, the free arm swings against them, the body bobs, flaps and straps trail.
import {
  attribute,
  color,
  Fn,
  float,
  mix,
  positionLocal,
  sin,
  smoothstep,
  time,
  uniform,
  vec3,
} from "three/tsl";
import * as THREE from "three/webgpu";
import { partyColor } from "@/lib/party";
import { poseAt, type Remote } from "../net";
import { type Models, model } from "./models";

type Figure = {
  root: THREE.Group;
  light: THREE.PointLight;
  /** walking speed (0 still .. ~1.7 running), stride phase, lantern glow (0..1) */
  u: { speed: { value: number }; phase: { value: number }; lit: { value: number } };
  tag: HTMLElement;
  last: THREE.Vector3;
};

export function makeWanderers(camera: THREE.Camera, tags: HTMLElement, models: Models) {
  const group = new THREE.Group();
  const body = model(models, "survivor").clone().rotateY(Math.PI);
  const figures = new Map<string, Figure>();
  const o = new Float32Array(5),
    v = new THREE.Vector3();

  function material(cloth: THREE.Color) {
    const m = new THREE.MeshStandardNodeMaterial();
    // COLOR_0 from the script: r sway, g material (in eighths: jacket, trousers, fur, canvas,
    // leather, wool, iron, wood, glass), b what swings (0.25 left leg, 0.75 right leg, 0.4 left arm)
    const sway = attribute("sway", "float"),
      kind = attribute("ao", "float"),
      limb = attribute("extra", "float");
    const s = uniform(0),
      ph = uniform(0),
      l = uniform(0);
    m.positionNode = Fn(() => {
      const p = positionLocal.toVar();
      const walk = s.min(1);
      const on = limb.greaterThan(0.1).select(float(1), float(0));
      const arm = limb.sub(0.5).abs().lessThan(0.15).select(float(1), float(0));
      // legs: left and right swing opposite, about the hip; the free arm swings against its leg,
      // about the shoulder
      const side = limb.sub(0.5).sign();
      const swing = sin(ph).mul(side).mul(walk).mul(on);
      p.z.addAssign(swing.mul(0.35).mul(float(0.95).sub(p.y).max(0)).mul(float(1).sub(arm)));
      p.z.addAssign(swing.mul(-0.4).mul(float(1.43).sub(p.y).max(0)).mul(arm));
      // the body bobs twice a stride; flaps, straps and the hem trail behind and stir
      p.y.addAssign(sin(ph.mul(2)).abs().mul(0.035).mul(walk));
      p.z.addAssign(sway.mul(walk.mul(0.12).add(sin(time.mul(1.6).add(p.x.mul(3))).mul(0.02))));
      p.x.addAssign(sway.mul(sin(time.mul(1.1).add(p.y.mul(2))).mul(0.02)));
      return p;
    })();
    const is = (v: number) => smoothstep(0.06, 0.03, kind.sub(v).abs());
    const glass = is(1);
    const ironK = is(0.75);
    m.colorNode = color(cloth)
      .mul(is(0))
      .add(color(0x33352f).mul(is(0.125)))
      .add(color(0x4a4036).mul(is(0.25)))
      .add(color(0x5a5438).mul(is(0.375)))
      .add(color(0x2a1e16).mul(is(0.5)))
      .add(color(0x2b2a2a).mul(is(0.625)))
      .add(color(0x3c3b3a).mul(ironK))
      .add(color(0x4a2e1a).mul(is(0.875)))
      .add(color(0x40302a).mul(glass));
    m.roughnessNode = mix(mix(float(0.95), float(0.42), ironK), float(0.1), glass);
    m.metalnessNode = ironK.mul(0.8);
    m.emissiveNode = vec3(1.0, 0.62, 0.3).mul(glass).mul(l.mul(6));
    return { m, u: { speed: s, phase: ph, lit: l } };
  }

  function figure(r: Remote) {
    // the coat dyed their HUD colour, dulled by the winter
    const { m, u } = material(new THREE.Color(partyColor(r.seed)).multiplyScalar(0.15));
    const mesh = new THREE.Mesh(body, m);
    mesh.castShadow = mesh.receiveShadow = true;
    const root = new THREE.Group();
    const light = new THREE.PointLight(0xffb066, 0, 14, 1.6);
    // the lantern hangs from the right hand, held forward (the figure faces -z once turned)
    light.position.set(-0.31, 0.88, -0.36);
    root.add(mesh, light);
    group.add(root);
    const tag = document.createElement("span");
    tag.className =
      "pointer-events-none fixed top-0 left-0 whitespace-nowrap font-display text-frost text-sm tracking-wide [text-shadow:0_1px_6px_#000]";
    tags.append(tag);
    const f: Figure = { root, light, u, tag, last: new THREE.Vector3(Number.NaN, 0, 0) };
    figures.set(r.id, f);
    return f;
  }

  /** Puts `f` at `o` (x, y, z, yaw, lantern) and walks it at the speed it moved there. */
  function drive(f: Figure, dt: number) {
    // speed along the ground, eased, drives the stride
    const sp = Number.isNaN(f.last.x) ? 0 : Math.hypot(o[0] - f.last.x, o[2] - f.last.z) / dt;
    f.last.set(o[0], o[1], o[2]);
    const s = f.u.speed;
    s.value += (Math.min(sp / 4.2, 1.7) - s.value) * Math.min(1, dt * 8);
    f.u.phase.value += dt * (2.2 + s.value * 5.5) * Math.min(1, s.value * 3);
    f.root.position.set(o[0], o[1], o[2]);
    f.root.rotation.y = o[3];
    const lit = o[4] > 0.5;
    f.light.intensity += ((lit ? 9 : 0) - f.light.intensity) * 0.15;
    f.u.lit.value += ((lit ? 1 : 0) - f.u.lit.value) * 0.15;
  }

  let selfT = performance.now();
  /** Your own body, drawn only when the camera is behind it (third person); no name over it. */
  function self(seed: number, x: number, y: number, z: number, yaw: number, lit: boolean, show: boolean) {
    let f = figures.get("me");
    if (!f) {
      f = figure({ id: "me", name: "", seed, poses: [] });
      f.tag.remove();
    }
    f.root.visible = show;
    if (!show) {
      f.last.x = Number.NaN;
      return;
    }
    const t = performance.now(),
      dt = Math.max(0.001, (t - selfT) / 1000);
    selfT = t;
    o[0] = x;
    o[1] = y;
    o[2] = z;
    o[3] = yaw;
    o[4] = lit ? 1 : 0;
    drive(f, dt);
  }

  let lastT = performance.now();
  function update(people: Map<string, Remote>) {
    const t = performance.now(),
      dt = Math.max(0.001, (t - lastT) / 1000);
    lastT = t;
    const now = t - 100;
    for (const [id, f] of figures)
      if (id !== "me" && !people.has(id)) {
        group.remove(f.root);
        f.tag.remove();
        figures.delete(id);
      }
    for (const r of people.values()) {
      if (!poseAt(r, now, o)) continue;
      const f = figures.get(r.id) ?? figure(r);
      drive(f, dt);
      // the name, above the hood, while in front and within 160 m (fading over the last 40)
      v.set(o[0], o[1] + 2.15, o[2]).project(camera);
      const d = Math.hypot(o[0] - camera.position.x, o[2] - camera.position.z);
      const show = v.z < 1 && d < 160;
      const name = r.name || "Survivor";
      if (f.tag.textContent !== name) f.tag.textContent = name;
      f.tag.style.opacity = show ? String(Math.min(1, (160 - d) / 40)) : "0";
      f.tag.style.transform = `translate(calc(${((v.x + 1) / 2) * innerWidth}px - 50%), ${((1 - v.y) / 2) * innerHeight}px)`;
    }
  }
  return { group, update, self };
}
