// The wind: one field that everything loose reads, so the gust that bends the reeds is the one that
// lifts a scarf and drives the snow. A prevailing direction that wanders slowly, a strength that
// follows the snowfall (a blizzard blows), and gusts: bands of stronger air travelling downwind.
// The snow needs to know how far the air has carried it, not only how fast it moves now, so the
// distance blown is integrated here (`travel`) and a change of strength never makes a flake jump.
// It wanders round the season's prevailing wind (world: wind.ts), the one the drifts were laid by.
import { prevailing } from "@zimovye/world";
import { Fn, sin, uniform, vec2 } from "three/tsl";
import * as THREE from "three/webgpu";

type Node2 = THREE.Node<"vec2">;

export function makeWind(seed: number) {
  const [px, pz] = prevailing(seed);
  const u = {
    /** downwind, on the ground (unit) */
    dir: uniform(new THREE.Vector2(px, pz)),
    /** metres a second, gusts not counted */
    speed: uniform(2),
    /** how far the air has moved since the start, metres (x, z) */
    travel: uniform(new THREE.Vector2()),
    /** seconds, for the gusts (the renderer's `time` stops while hidden; this doesn't drift from travel) */
    t: uniform(0),
  };
  let angle = Math.atan2(pz, px),
    speed = 2;

  /**
   * How strong the air is at `xz` now, 0..~1.6 (1 the prevailing wind): long gust fronts moving
   * downwind with a shorter flutter on top.
   */
  const gust = Fn(([xz]: [Node2]) => {
    const along = xz.dot(u.dir);
    const across = xz.dot(vec2(u.dir.y.negate(), u.dir.x));
    const front = sin(
      along
        .mul(0.045)
        .sub(u.t.mul(0.9))
        .add(sin(across.mul(0.03)).mul(1.5)),
    )
      .mul(0.5)
      .add(0.5);
    const flutter = sin(along.mul(0.31).sub(u.t.mul(3.1)).add(across.mul(0.17)))
      .mul(0.5)
      .add(0.5);
    return front.mul(front).mul(0.9).add(flutter.mul(0.25)).add(0.45);
  });

  /** The same gust on the CPU (for things that swing on a bone: the lantern). */
  function at(x: number, z: number) {
    const dx = u.dir.value.x,
      dz = u.dir.value.y,
      t = u.t.value;
    const along = x * dx + z * dz,
      across = -x * dz + z * dx;
    const front = Math.sin(along * 0.045 - t * 0.9 + Math.sin(across * 0.03) * 1.5) * 0.5 + 0.5;
    const flutter = Math.sin(along * 0.31 - t * 3.1 + across * 0.17) * 0.5 + 0.5;
    return front * front * 0.9 + flutter * 0.25 + 0.45;
  }

  return {
    u,
    gust,
    at,
    /**
     * How far downwind the snow drifts for each metre it falls, as the roofs and walls see it: the
     * flakes' own slant, held under 50° so a porch roof still keeps the snow off what's under it.
     */
    slant() {
      return Math.min(1.2, (speed / 1.3) * 0.5);
    },
    /** Eases toward the weather: `snowfall` 0..1 (the mood's), a blizzard at 1. */
    update(dt: number, snowfall: number) {
      u.t.value += dt;
      // the prevailing direction wanders a few degrees over minutes
      angle += Math.sin(u.t.value * 0.013) * 0.004 * dt;
      u.dir.value.set(Math.cos(angle), Math.sin(angle));
      speed += (1.2 + snowfall * 7.5 - speed) * Math.min(1, dt * 0.5);
      u.speed.value = speed;
      u.travel.value.addScaledVector(u.dir.value, speed * dt);
    },
  };
}

export type Wind = ReturnType<typeof makeWind>;
