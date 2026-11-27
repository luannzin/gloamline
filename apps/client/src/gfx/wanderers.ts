// The other people in the lobby: hooded wanderers in a cloak dyed from their critter's dusk colour,
// carrying a lantern that lights when theirs is on, with their name above them.
import * as THREE from "three/webgpu";
import { DUSK } from "@/lib/palette";
import { poseAt, type Remote } from "../net";

const cloakGeo = new THREE.LatheGeometry(
  [
    [0.0, 0],
    [0.34, 0.02],
    [0.37, 0.4],
    [0.31, 1.0],
    [0.24, 1.32],
    [0.14, 1.48],
    [0.0, 1.5],
  ].map(([r, y]) => new THREE.Vector2(r, y)),
  14,
);
const hoodGeo = new THREE.SphereGeometry(0.19, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62).scale(
  1,
  1.15,
  1.05,
);
const bulbGeo = new THREE.SphereGeometry(0.06, 10, 8);

export function makeWanderers(camera: THREE.Camera, tags: HTMLElement) {
  const group = new THREE.Group();
  const figures = new Map<
    string,
    { root: THREE.Group; light: THREE.PointLight; bulb: THREE.MeshBasicNodeMaterial; tag: HTMLElement }
  >();
  const o = new Float32Array(5),
    v = new THREE.Vector3();

  function figure(r: Remote) {
    const c = new THREE.Color(DUSK[r.seed % 4]).multiplyScalar(0.28);
    const cloth = new THREE.MeshStandardNodeMaterial({ color: c, roughness: 0.95 });
    const root = new THREE.Group();
    const cloak = new THREE.Mesh(cloakGeo, cloth);
    const hood = new THREE.Mesh(hoodGeo, cloth);
    hood.position.set(0, 1.5, 0.02);
    const bulb = new THREE.MeshBasicNodeMaterial({ color: 0x40302a });
    const lamp = new THREE.Mesh(bulbGeo, bulb);
    lamp.position.set(0.32, 0.95, -0.18);
    const light = new THREE.PointLight(0xffb066, 0, 14, 1.6);
    light.position.copy(lamp.position);
    for (const m of [cloak, hood]) m.castShadow = m.receiveShadow = true;
    root.add(cloak, hood, lamp, light);
    group.add(root);
    const tag = document.createElement("span");
    tag.className =
      "pointer-events-none fixed top-0 left-0 whitespace-nowrap text-ink text-sm [text-shadow:0_1px_6px_#000]";
    tags.append(tag);
    const f = { root, light, bulb, tag };
    figures.set(r.id, f);
    return f;
  }

  function update(people: Map<string, Remote>) {
    const now = performance.now() - 100;
    for (const [id, f] of figures)
      if (!people.has(id)) {
        group.remove(f.root);
        f.tag.remove();
        figures.delete(id);
      }
    for (const r of people.values()) {
      if (!poseAt(r, now, o)) continue;
      const f = figures.get(r.id) ?? figure(r);
      f.root.position.set(o[0], o[1], o[2]);
      f.root.rotation.y = o[3];
      const lit = o[4] > 0.5;
      f.light.intensity += ((lit ? 9 : 0) - f.light.intensity) * 0.15;
      f.bulb.color.setHex(lit ? 0xffc27a : 0x40302a);
      // the name, above the hood, while in front and near
      v.set(o[0], o[1] + 2.05, o[2]).project(camera);
      const d = Math.hypot(o[0] - camera.position.x, o[2] - camera.position.z);
      const show = v.z < 1 && d < 70;
      f.tag.textContent = r.name || "Wanderer";
      f.tag.style.opacity = show ? String(Math.min(1, (70 - d) / 20)) : "0";
      f.tag.style.transform = `translate(calc(${((v.x + 1) / 2) * innerWidth}px - 50%), ${((1 - v.y) / 2) * innerHeight}px)`;
    }
  }
  return { group, update };
}
