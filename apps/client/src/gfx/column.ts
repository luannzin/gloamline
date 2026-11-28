// The Column (DESIGN.md): the smoke of the blast, still standing over the fires beyond the northern
// ridge, spreading into the overcast at the top. The one landmark seen from everywhere, and the
// warmest thing in most frames. A tall open shell whose radius and billows come from the shared
// noise, rising slowly; soft at its silhouette, lit orange from beneath, and a glow over the fires
// that shows above the ridge. Drawn without fog: it's meant to be found.
import { COLUMN, heightAt, type World } from "@zimovye/world";
import {
  abs,
  atan,
  cameraPosition,
  dot,
  exp,
  Fn,
  float,
  mix,
  normalize,
  positionGeometry,
  positionWorld,
  sin,
  smoothstep,
  texture,
  time,
  vec2,
  vec3,
} from "three/tsl";
import * as THREE from "three/webgpu";
import type { MoodState } from "./mood";

const H = 1500;

export function makeColumn(world: World, detail: THREE.Texture, mood: MoodState) {
  const group = new THREE.Group();
  const base = heightAt(world.ground.height, COLUMN.x, COLUMN.z) - 40;

  // the shell: a unit cylinder (y -0.5..0.5) shaped in the vertex stage
  const geo = new THREE.CylinderGeometry(1, 1, 1, 72, 60, true);
  const m = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  // (the cylinder as built: once positionNode is set, positionLocal is the shaped position)
  const g = positionGeometry;
  const t = g.y.add(0.5);
  const ang = atan(g.z, g.x).div(Math.PI * 2);
  // billows rising: two scales of the noise scrolling up the column at different speeds
  const rise = (k: number, s: number, ch: "x" | "y", lvl: boolean) => {
    const tx = texture(detail, vec2(ang.mul(k), t.mul(H / s).sub(time.mul(0.012 * (k / 3)))));
    return (lvl ? tx.level(float(0)) : tx)[ch];
  };
  m.positionNode = Fn(() => {
    // narrow over the fires, a trunk, then the anvil spreading into the cloud deck
    const r = mix(float(70), float(115), t)
      .add(smoothstep(0.72, 1.0, t).mul(420))
      .mul(rise(3, 260, "x", true).sub(0.5).mul(0.45).add(1));
    // the wind leans it a little, more the higher it goes
    const lean = t
      .mul(t)
      .mul(160)
      .add(
        sin(time.mul(0.03).add(t.mul(4)))
          .mul(18)
          .mul(t),
      );
    return vec3(g.x.mul(r).add(lean), t.mul(H), g.z.mul(r).add(lean.mul(0.4)));
  })();
  const n = rise(3, 260, "x", false).add(rise(8, 90, "y", false).mul(0.55));
  // soft at the silhouette: how squarely this bit of shell faces the eye
  const radial = normalize(vec3(g.x, 0, g.z));
  const view = normalize(cameraPosition.sub(positionWorld));
  const facing = abs(dot(radial, normalize(vec3(view.x, 0, view.z))));
  const dens = smoothstep(0.35, 0.9, n.add(facing.mul(0.45)).sub(0.15))
    .mul(smoothstep(0.02, 0.35, facing))
    .mul(float(1).sub(smoothstep(0.86, 1.0, t)))
    .mul(smoothstep(0.0, 0.03, t));
  // smoke: soot below, taking the sky's colour as it rises; the fires light it from beneath
  // (dark against the pale overcast: a silhouette first, like the references' landmarks)
  const smoke = mix(vec3(0.018, 0.016, 0.015), mood.u.horizon.mul(0.26), smoothstep(0.25, 1.0, t)).mul(
    n.mul(0.6).add(0.55),
  );
  const flick = sin(time.mul(1.3))
    .mul(0.06)
    .add(sin(time.mul(3.7).add(n.mul(6))).mul(0.05))
    .add(0.9);
  // the fire in tongues where the billows part, and its light on the smoke's underside above it
  const tongues = smoothstep(0.55, 1.2, n.add(exp(t.mul(-14)).mul(0.6)));
  const fire = vec3(1.0, 0.36, 0.09)
    .mul(
      exp(t.mul(-10))
        .mul(4.0)
        .mul(tongues)
        .add(exp(t.mul(-3.2)).mul(0.22).mul(n)),
    )
    .mul(flick);
  m.colorNode = smoke.add(fire);
  m.opacityNode = dens.mul(0.92);
  const shell = new THREE.Mesh(geo, m);
  shell.position.set(COLUMN.x, base, COLUMN.z);
  shell.frustumCulled = false;
  // after the clouds, so it stands in front of the sky dome
  shell.renderOrder = 11;
  group.add(shell);

  // the glow of the fires on the air above them, showing over the ridge: drawn by the sky (mood.ts),
  // where it has no edges (a sprite this size showed its rectangle through the bloom and the
  // upscaler's history)
  mood.u.glowAt.value.set(COLUMN.x, base + 160, COLUMN.z);
  return group;
}
