// Meshes made from code: trees, ferns, reeds, rocks, mushrooms, standing stones, graves. Each shape
// carries `sway` (0 at the root, 1 at the tips) for the wind, and leaf cards carry normals pointing
// out of their crown, so a canopy shades as one soft mass instead of a pile of flat cards.
import { Noise, rng } from "@zimovye/world";
import * as THREE from "three/webgpu";

export class Builder {
  p: number[] = [];
  n: number[] = [];
  uv: number[] = [];
  sway: number[] = [];
  /** how much sky a point sees from inside its crown, 0..1 (1 for everything that isn't a leaf) */
  ao: number[] = [];
  idx: number[] = [];

  vert(
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    u: number,
    v: number,
    s: number,
    ao = 1,
  ) {
    this.p.push(x, y, z);
    this.n.push(nx, ny, nz);
    this.uv.push(u, v);
    this.sway.push(s);
    this.ao.push(ao);
    return this.p.length / 3 - 1;
  }

  /** A tube along `pts` (x, y, z, radius, sway per point), `sides` around, optional root flare. */
  tube(pts: number[][], sides: number, flare = 0, seed = 0) {
    const base = this.p.length / 3;
    const up = new THREE.Vector3(),
      t = new THREE.Vector3(),
      a = new THREE.Vector3(),
      b = new THREE.Vector3();
    let len = 0;
    for (let i = 0; i < pts.length; i++) {
      const P = pts[i],
        Q = pts[Math.min(i + 1, pts.length - 1)],
        O = pts[Math.max(i - 1, 0)];
      t.set(Q[0] - O[0], Q[1] - O[1], Q[2] - O[2]).normalize();
      up.set(0, 1, 0);
      if (Math.abs(t.y) > 0.95) up.set(1, 0, 0);
      a.crossVectors(t, up).normalize();
      b.crossVectors(a, t).normalize();
      if (i > 0) len += Math.hypot(P[0] - O[0], P[1] - O[1], P[2] - O[2]);
      for (let s = 0; s <= sides; s++) {
        const th = (s / sides) * Math.PI * 2,
          c = Math.cos(th),
          sn = Math.sin(th);
        let r = P[3];
        if (flare && i < 3) r *= 1 + flare * (1 - i / 3) ** 2 * (0.55 + 0.45 * Math.cos(th * 5 + seed));
        const nx = a.x * c + b.x * sn,
          ny = a.y * c + b.y * sn,
          nz = a.z * c + b.z * sn;
        this.vert(
          P[0] + nx * r,
          P[1] + ny * r,
          P[2] + nz * r,
          nx,
          ny,
          nz,
          (s / sides) * Math.max(1, Math.round(P[3] * 6)),
          len / 2,
          P[4],
        );
      }
    }
    for (let i = 0; i < pts.length - 1; i++)
      for (let s = 0; s < sides; s++) {
        const k = base + i * (sides + 1) + s,
          k2 = k + sides + 1;
        this.idx.push(k, k2, k + 1, k + 1, k2, k2 + 1);
      }
  }

  /** A leaf card centred at c, facing roughly `face`, in atlas cell (cx, cy) of a 2 x 2 atlas. */
  card(
    c: number[],
    face: THREE.Vector3,
    w: number,
    h: number,
    roll: number,
    cell: [number, number],
    n: number[],
    sway: number,
    hang = false,
    ao = 1,
  ) {
    const f = face.clone().normalize();
    const side = new THREE.Vector3(0, 1, 0).cross(f);
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    side.normalize();
    const upv = new THREE.Vector3().crossVectors(f, side).normalize();
    const cr = Math.cos(roll),
      sr = Math.sin(roll);
    const X = side.clone().multiplyScalar(cr).addScaledVector(upv, sr),
      Y = upv.clone().multiplyScalar(cr).addScaledVector(side, -sr);
    if (hang) {
      X.copy(side);
      Y.set(0, 1, 0);
    }
    // cells count from the canvas's top-left; v runs up
    const u0 = cell[0] * 0.5,
      v0 = (1 - cell[1]) * 0.5,
      base = this.p.length / 3;
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const oy = hang ? -h / 2 : 0;
      this.vert(
        c[0] + (X.x * sx * w) / 2 + Y.x * ((sy * h) / 2 + oy),
        c[1] + (X.y * sx * w) / 2 + Y.y * ((sy * h) / 2 + oy),
        c[2] + (X.z * sx * w) / 2 + Y.z * ((sy * h) / 2 + oy),
        n[0],
        n[1],
        n[2],
        u0 + (sx + 1) * 0.25,
        v0 + (sy + 1) * 0.25,
        sway,
        ao,
      );
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("sway", new THREE.Float32BufferAttribute(this.sway, 1));
    g.setAttribute("ao", new THREE.Float32BufferAttribute(this.ao, 1));
    g.setIndex(this.idx);
    return g;
  }
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A bent line from `from` heading `dir`, `n` points, radius r0 to r1. */
function limb(
  r: () => number,
  from: number[],
  dir: THREE.Vector3,
  len: number,
  r0: number,
  r1: number,
  n: number,
  s0: number,
  s1: number,
  curl = 0.25,
) {
  const out: number[][] = [];
  const d = dir.clone().normalize(),
    p = v3(from[0], from[1], from[2]);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([p.x, p.y, p.z, r0 + (r1 - r0) * t, s0 + (s1 - s0) * t]);
    d.x += (r() - 0.5) * curl;
    d.z += (r() - 0.5) * curl;
    d.y += (r() - 0.45) * curl * 0.6;
    d.normalize();
    p.addScaledVector(d, len / n);
  }
  return out;
}

/** A tall pine: one trunk and whorls of needle sprays that shrink toward the top. */
export function pine(seed: number, far: boolean) {
  const r = rng(seed),
    B = new Builder(),
    L = new Builder();
  const H = 17 + r() * 7;
  B.tube(limb(r, [0, -0.5, 0], v3(0, 1, 0), H, 0.5, 0.06, far ? 4 : 8, 0, 0.6, 0.04), far ? 5 : 9, 0.4, seed);
  const step = far ? 2.2 : 1.1;
  for (let y = 3.5; y < H - 0.5; y += step * (0.8 + r() * 0.4)) {
    const t = (y - 3.5) / (H - 3.5),
      reach = (1 - t) * 4.2 + 0.7,
      k = far ? 4 : 6 + Math.floor((1 - t) * 3);
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + r() * 0.6;
      const dx = Math.cos(a),
        dz = Math.sin(a);
      const p = [dx * reach * 0.5, y - reach * 0.12, dz * reach * 0.5];
      const nn = v3(dx, 0.5, dz).normalize();
      // the card lies along the branch, tipped down at the end
      const face = v3(-dz, 0.9, dx).normalize();
      // the lower whorls sit in the shade of the ones above
      L.card(
        p,
        face,
        reach * 1.15,
        reach * 0.75,
        0,
        [1, 0],
        [nn.x, nn.y, nn.z],
        0.3 + t * 0.7,
        false,
        0.5 + 0.5 * t,
      );
    }
  }
  return { bark: B.geometry(), leaves: L.geometry() };
}

export function reeds(seed: number) {
  const r = rng(seed),
    L = new Builder();
  for (let i = 0; i < 14; i++) {
    const x = (r() - 0.5) * 0.9,
      z = (r() - 0.5) * 0.9,
      h = 1.3 + r() * 1.0,
      a = r() * 6.28,
      w = 0.035 + r() * 0.03;
    const bx = Math.cos(a) * 0.25,
      bz = Math.sin(a) * 0.25,
      b = L.p.length / 3;
    const nx = Math.cos(a + 1.57),
      nz = Math.sin(a + 1.57);
    L.vert(x - nx * w, 0, z - nz * w, nx, 0.3, nz, 0.02, 0.02, 0);
    L.vert(x + nx * w, 0, z + nz * w, nx, 0.3, nz, 0.04, 0.02, 0);
    L.vert(x + bx * 0.4, h * 0.6, z + bz * 0.4, nx, 0.3, nz, 0.03, 0.02, 0.5);
    L.vert(x + bx, h, z + bz, nx, 0.3, nz, 0.03, 0.02, 1);
    L.idx.push(b, b + 1, b + 2, b, b + 2, b + 2, b + 2, b + 1, b + 3, b, b + 2, b + 3);
    if (i % 4 === 0) {
      // a cattail head: a short dark cylinder near the top
      const tb = L.p.length / 3,
        cx = x + bx * 0.85,
        cz = z + bz * 0.85,
        y0 = h * 0.78;
      for (let s = 0; s <= 6; s++) {
        const t = (s / 6) * 6.28,
          ox = Math.cos(t) * 0.045,
          oz = Math.sin(t) * 0.045;
        L.vert(cx + ox, y0, cz + oz, ox * 20, 0, oz * 20, 0.06, 0.02, 0.85);
        L.vert(cx + ox, y0 + 0.2, cz + oz, ox * 20, 0, oz * 20, 0.06, 0.02, 0.9);
      }
      for (let s = 0; s < 6; s++)
        L.idx.push(
          tb + s * 2,
          tb + s * 2 + 1,
          tb + s * 2 + 2,
          tb + s * 2 + 2,
          tb + s * 2 + 1,
          tb + s * 2 + 3,
        );
    }
  }
  return L.geometry();
}

/** A cluster of mushrooms: pale stems, wide caps; the caps glow. uv.x marks the cap (1). */
export function shrooms(seed: number) {
  const r = rng(seed),
    B = new Builder();
  const k = 3 + Math.floor(r() * 5);
  for (let i = 0; i < k; i++) {
    const x = (r() - 0.5) * 0.8,
      z = (r() - 0.5) * 0.8,
      h = 0.12 + r() * 0.45,
      cr = 0.06 + h * 0.4;
    const lean = v3((r() - 0.5) * 0.3, 1, (r() - 0.5) * 0.3);
    const stem = limb(r, [x, -0.05, z], lean, h, 0.025 + h * 0.06, 0.02 + h * 0.04, 3, 0, 0.3, 0.1);
    const b0 = B.p.length / 3;
    B.tube(stem, 6);
    for (let q = b0; q < B.p.length / 3; q++) B.uv[q * 2] = 0;
    const top = stem[stem.length - 1],
      cb = B.p.length / 3;
    for (let ring = 0; ring <= 4; ring++) {
      const phi = (ring / 4) * Math.PI * 0.5;
      for (let s = 0; s <= 8; s++) {
        const th = (s / 8) * Math.PI * 2,
          c = Math.cos(th),
          sn = Math.sin(th);
        const rr = Math.sin(phi) * cr,
          yy = Math.cos(phi) * cr * 0.55;
        B.vert(
          top[0] + c * rr,
          top[1] + yy - cr * 0.15,
          top[2] + sn * rr,
          c * Math.sin(phi),
          Math.cos(phi),
          sn * Math.sin(phi),
          1,
          ring / 4,
          0.5,
        );
      }
    }
    for (let ring = 0; ring < 4; ring++)
      for (let s = 0; s < 8; s++) {
        const a = cb + ring * 9 + s,
          b = a + 9;
        B.idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
  }
  return B.geometry();
}

/** A standing stone: a tall slab, worn. */
export function slab(seed: number) {
  const g = new THREE.BoxGeometry(1.1, 3.4, 0.55, 3, 8, 2);
  const n = new Noise(seed),
    p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const taper = 1 - Math.max(0, y) * 0.12;
    const d = 0.08 * n.fbm3(x * 2, y * 2, z * 2, 3);
    p.setXYZ(i, x * taper + d, y + 1.4 + (y > 1.6 ? n.n2(x * 3, z * 3) * 0.3 : 0), z * taper + d);
  }
  g.computeVertexNormals();
  g.setAttribute("sway", new THREE.Float32BufferAttribute(new Float32Array(p.count), 1));
  return g;
}

/** A grave: a rounded headstone or a cross, leaning a little. */
export function grave(seed: number) {
  const r = rng(seed);
  let g: THREE.BufferGeometry;
  if (r() < 0.35) {
    const a = new THREE.BoxGeometry(0.16, 1.25, 0.14).translate(0, 0.5, 0);
    const b = new THREE.BoxGeometry(0.7, 0.15, 0.14).translate(0, 0.78, 0);
    g = merge([a, b]);
  } else {
    const a = new THREE.BoxGeometry(0.62, 0.75, 0.14, 2, 2, 1).translate(0, 0.25, 0);
    const b = new THREE.CylinderGeometry(0.31, 0.31, 0.14, 12, 1, false, 0, Math.PI)
      .rotateX(Math.PI / 2)
      .rotateZ(Math.PI / 2)
      .translate(0, 0.62, 0);
    g = merge([a, b]);
  }
  g.rotateZ((r() - 0.5) * 0.25).rotateX((r() - 0.5) * 0.2);
  g.setAttribute("sway", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count), 1));
  return g;
}

function merge(list: THREE.BufferGeometry[]) {
  const B = new Builder();
  for (let gi = 0; gi < list.length; gi++) {
    const g = list[gi].index ? list[gi].toNonIndexed() : list[gi];
    const p = g.attributes.position,
      n = g.attributes.normal,
      uv = g.attributes.uv;
    const base = B.p.length / 3;
    for (let i = 0; i < p.count; i++)
      B.vert(
        p.getX(i),
        p.getY(i),
        p.getZ(i),
        n.getX(i),
        n.getY(i),
        n.getZ(i),
        uv ? uv.getX(i) : 0,
        uv ? uv.getY(i) : 0,
        0,
      );
    for (let i = 0; i < p.count; i++) B.idx.push(base + i);
  }
  return B.geometry();
}
