// Relief without normal maps or UVs: a view-space normal bent by the screen-space slope of a
// height (metres), Mikkelsen's surface gradient ("Bump Mapping Unparametrized Surfaces on the GPU",
// 2010). Works on any mesh, whatever moved its vertices.
import { abs, cross, dFdx, dFdy, dot, normalize, positionView, sign } from "three/tsl";
import type * as THREE from "three/webgpu";

export function bump(n: THREE.Node<"vec3">, h: THREE.Node<"float">) {
  const dpx = dFdx(positionView),
    dpy = dFdy(positionView);
  const r1 = cross(dpy, n),
    r2 = cross(n, dpx);
  const det = dot(dpx, r1);
  const grad = r1
    .mul(dFdx(h))
    .add(r2.mul(dFdy(h)))
    .mul(sign(det));
  return normalize(n.mul(abs(det)).sub(grad));
}
