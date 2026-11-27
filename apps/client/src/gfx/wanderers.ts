// The other people in the lobby: hooded wanderers (tools/blender/wanderer.py) in a cloak dyed from
// their critter's dusk colour, carrying a lantern that lights when theirs is on, with their name
// above them. Their walk is drawn from how fast their pose moves: legs swing, the body bobs, the
// cloak's hem trails.
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
import { DUSK } from "@/lib/palette";
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
  const body = model(models, "wanderer").clone().rotateY(Math.PI);
  const figures = new Map<string, Figure>();
  const o = new Float32Array(5),
    v = new THREE.Vector3();

  function material(cloth: THREE.Color) {
    const m = new THREE.MeshStandardNodeMaterial();
    // COLOR_0 from the script: r sway, g material (cloth, leather, iron, glass), b legs
    const sway = attribute("sway", "float"),
      kind = attribute("ao", "float"),
      leg = attribute("extra", "float");
    const s = uniform(0),
      ph = uniform(0),
      l = uniform(0);
    m.positionNode = Fn(() => {
      const p = positionLocal.toVar();
      const walk = s.min(1);
      // legs: left (0.25) and right (0.75) swing opposite, about the hip
      const side = leg.sub(0.5).sign();
      const swing = sin(ph)
        .mul(side)
        .mul(walk)
        .mul(0.35)
        .mul(leg.greaterThan(0.1).select(float(1), float(0)));
      p.z.addAssign(swing.mul(float(0.95).sub(p.y).max(0)));
      // the body bobs twice a stride; the cloak's hem trails behind and ripples
      p.y.addAssign(sin(ph.mul(2)).abs().mul(0.035).mul(walk));
      p.z.addAssign(sway.mul(walk.mul(0.22).add(sin(time.mul(1.6).add(p.x.mul(3))).mul(0.03))));
      p.x.addAssign(sway.mul(sin(time.mul(1.1).add(p.y.mul(2))).mul(0.03)));
      return p;
    })();
    const leather = color(0x2a1e16),
      iron = color(0x3c3b3a);
    const cl = color(cloth);
    m.colorNode = mix(
      mix(mix(cl, leather, smoothstep(0.2, 0.4, kind)), iron, smoothstep(0.55, 0.75, kind)),
      color(0x40302a),
      smoothstep(0.85, 0.95, kind),
    );
    m.roughnessNode = mix(float(0.95), float(0.42), smoothstep(0.55, 0.75, kind));
    m.metalnessNode = smoothstep(0.55, 0.75, kind)
      .mul(float(1).sub(smoothstep(0.85, 0.95, kind)))
      .mul(0.8);
    m.emissiveNode = vec3(1.0, 0.62, 0.3)
      .mul(smoothstep(0.85, 0.95, kind))
      .mul(l.mul(6));
    return { m, u: { speed: s, phase: ph, lit: l } };
  }

  function figure(r: Remote) {
    const { m, u } = material(new THREE.Color(DUSK[r.seed % 4]).multiplyScalar(0.28));
    const mesh = new THREE.Mesh(body, m);
    mesh.castShadow = mesh.receiveShadow = true;
    const root = new THREE.Group();
    const light = new THREE.PointLight(0xffb066, 0, 14, 1.6);
    // the lantern hangs at the right hand, forward (the figure faces -z)
    light.position.set(0.33, 0.85, -0.38);
    root.add(mesh, light);
    group.add(root);
    const tag = document.createElement("span");
    tag.className =
      "pointer-events-none fixed top-0 left-0 whitespace-nowrap text-ink text-sm [text-shadow:0_1px_6px_#000]";
    tags.append(tag);
    const f: Figure = { root, light, u, tag, last: new THREE.Vector3(Number.NaN, 0, 0) };
    figures.set(r.id, f);
    return f;
  }

  let lastT = performance.now();
  function update(people: Map<string, Remote>) {
    const t = performance.now(),
      dt = Math.max(0.001, (t - lastT) / 1000);
    lastT = t;
    const now = t - 100;
    for (const [id, f] of figures)
      if (!people.has(id)) {
        group.remove(f.root);
        f.tag.remove();
        figures.delete(id);
      }
    for (const r of people.values()) {
      if (!poseAt(r, now, o)) continue;
      const f = figures.get(r.id) ?? figure(r);
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
      // the name, above the hood, while in front and within 160 m (fading over the last 40)
      v.set(o[0], o[1] + 2.15, o[2]).project(camera);
      const d = Math.hypot(o[0] - camera.position.x, o[2] - camera.position.z);
      const show = v.z < 1 && d < 160;
      const name = r.name || "Wanderer";
      if (f.tag.textContent !== name) f.tag.textContent = name;
      f.tag.style.opacity = show ? String(Math.min(1, (160 - d) / 40)) : "0";
      f.tag.style.transform = `translate(calc(${((v.x + 1) / 2) * innerWidth}px - 50%), ${((1 - v.y) / 2) * innerHeight}px)`;
    }
  }
  return { group, update };
}
