// Every texture is made here at load: the ground data from the world build, one tileable detail
// noise that every material samples at several scales, and a foliage atlas drawn on a canvas.
import { rng, SIZE, WEAR, type World } from "@gloamline/world";
import * as THREE from "three/webgpu";

export function groundTextures(w: World) {
  const height = new THREE.DataTexture(w.ground.height, SIZE, SIZE, THREE.RedFormat, THREE.FloatType);
  height.magFilter = height.minFilter = THREE.NearestFilter;
  height.needsUpdate = true;
  const rgba = (data: Uint8Array) => {
    const t = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  };
  // where the rain ran, what it left and what it carried off (world: erosion.ts)
  const wear = new THREE.DataTexture(w.wear, WEAR, WEAR, THREE.RGBAFormat, THREE.UnsignedByteType);
  wear.magFilter = THREE.LinearFilter;
  wear.minFilter = THREE.LinearMipmapLinearFilter;
  wear.generateMipmaps = true;
  wear.needsUpdate = true;
  return {
    height,
    ground0: rgba(w.ground.ground0),
    ground1: rgba(w.ground.ground1),
    wear,
    stones: stoneTexture(),
  };
}

export type GroundTex = ReturnType<typeof groundTextures>;

/**
 * 512 x 512, tiles in both directions. R: soft fbm, G: fine fbm, B: cells (pebbles, cracks),
 * A: stretched ridges (bark, strata). Linear data, not colour.
 */
export function detailTexture() {
  const N = 512,
    out = new Uint8Array(N * N * 4);
  const r = rng(7);
  const lat = new Float32Array(64 * 64).map(() => r());
  // periodic value noise: lattice of `p` cells wrapping across the texture
  const vn = (x: number, y: number, p: number) => {
    const xi = Math.floor(x),
      yi = Math.floor(y),
      fx = x - xi,
      fy = y - yi;
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10),
      v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const L = (a: number, b: number) => lat[(((b % p) + p) % p) * 64 + (((a % p) + p) % p)];
    const a = L(xi, yi),
      b = L(xi + 1, yi),
      c = L(xi, yi + 1),
      d = L(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x: number, y: number, p: number, oct: number) => {
    let s = 0,
      a = 0.5,
      w = 0;
    for (let o = 0; o < oct; o++, p *= 2, a *= 0.5) {
      s += a * vn((x * p) / N, (y * p) / N, Math.min(p, 64));
      w += a;
    }
    return s / w;
  };
  // cell points for B, 12 x 12 jittered, wrapping
  const C = 12,
    pts = new Float32Array(C * C * 2).map(() => r());
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const o = (y * N + x) * 4;
      out[o] = fbm(x, y, 4, 5) * 255;
      out[o + 1] = fbm(x + 97, y + 31, 16, 3) * 255;
      const cx = (x / N) * C,
        cy = (y / N) * C;
      let d1 = 9,
        d2 = 9;
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++) {
          const gx = Math.floor(cx) + i,
            gy = Math.floor(cy) + j;
          const k = (((gy % C) + C) % C) * C + (((gx % C) + C) % C);
          const d = Math.hypot(gx + pts[k * 2] - cx, gy + pts[k * 2 + 1] - cy);
          if (d < d1) {
            d2 = d1;
            d1 = d;
          } else if (d < d2) d2 = d;
        }
      out[o + 2] = Math.min(255, (d2 - d1) * 400);
      out[o + 3] = (1 - Math.abs(fbm(x, y * 0.25, 8, 4) * 2 - 1)) ** 2 * 255;
    }
  const t = new THREE.DataTexture(out, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/**
 * Loose stones, 512 x 512, tiling: 20 x 20 jittered cells, each with its own random. R: the stone's
 * rounded height (0 between stones), G: the cell's random (a material keeps stones whose G is under
 * its density), B: a second random (tone), A: distance to the cell's edge. Linear data.
 */
export function stoneTexture() {
  const N = 512,
    C = 20,
    out = new Uint8Array(N * N * 4);
  const r = rng(29);
  const cell = new Float32Array(C * C * 6).map(() => r());
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const cx = (x / N) * C,
        cy = (y / N) * C;
      let d1 = 9,
        d2 = 9,
        k1 = 0;
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++) {
          const gx = Math.floor(cx) + i,
            gy = Math.floor(cy) + j;
          const k = ((((gy % C) + C) % C) * C + (((gx % C) + C) % C)) * 6;
          // stones are a little oval, turned their own way
          const dx = gx + 0.2 + cell[k] * 0.6 - cx,
            dy = gy + 0.2 + cell[k + 1] * 0.6 - cy;
          const a = cell[k + 4] * Math.PI,
            u = dx * Math.cos(a) + dy * Math.sin(a),
            v = (-dx * Math.sin(a) + dy * Math.cos(a)) * 1.35;
          const d = Math.hypot(u, v);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            k1 = k;
          } else if (d < d2) d2 = d;
        }
      const rad = 0.28 + cell[k1 + 2] * 0.3;
      const h = d1 < rad ? Math.sqrt(1 - (d1 / rad) ** 2) : 0;
      const o = (y * N + x) * 4;
      out[o] = h * 255;
      out[o + 1] = cell[k1 + 5] * 255;
      out[o + 2] = cell[k1 + 3] * 255;
      out[o + 3] = Math.min(255, (d2 - d1) * 300);
    }
  const t = new THREE.DataTexture(out, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/**
 * 2 x 2 atlas: broadleaf twigs, pine spray, fern frond, hanging moss. Drawn in 512-unit cells and
 * scaled to `cell` pixels (1024 on Medium and up, so a leaf near the eye is still a leaf).
 */
export function foliageAtlas(cell = 1024) {
  const S = 512,
    cv = document.createElement("canvas");
  cv.width = cv.height = cell * 2;
  const g = cv.getContext("2d")!;
  g.scale(cell / S, cell / S);
  const r = rng(11);
  const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
  /** A leaf from its stalk at (x, y): lit on one side, a pale midrib, a darker edge. */
  const leaf = (
    x: number,
    y: number,
    len: number,
    wid: number,
    ang: number,
    h: number,
    s: number,
    l: number,
  ) => {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    const grd = g.createLinearGradient(0, -wid, 0, wid);
    grd.addColorStop(0, hsl(h, s, l + 9));
    grd.addColorStop(0.55, hsl(h, s, l));
    grd.addColorStop(1, hsl(h + 4, s + 6, l - 8));
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(len * 0.22, -wid * 1.15, len * 0.72, -wid * 0.95, len, 0);
    g.bezierCurveTo(len * 0.7, wid * 0.95, len * 0.28, wid * 1.1, 0, 0);
    g.fill();
    g.strokeStyle = "rgba(0,0,0,0.22)";
    g.lineWidth = 0.8;
    g.stroke();
    g.strokeStyle = hsl(h - 10, s - 10, l + 16, 0.5);
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(len * 0.88, 0);
    for (let v = 0.2; v < 0.8; v += 0.15) {
      g.moveTo(len * v, 0);
      g.lineTo(len * (v + 0.12), -wid * 0.6);
      g.moveTo(len * v, 0);
      g.lineTo(len * (v + 0.12), wid * 0.6);
    }
    g.stroke();
    g.restore();
  };
  // broadleaf: seven twigs fanning up from the card's foot, leaves alternating along them, drawn
  // back to front so the nearer leaves are lighter (the card reads as a little volume)
  for (const depth of [0, 1, 2])
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.33 + (r() - 0.5) * 0.25,
        L = 300 + r() * 150;
      const x0 = S / 2 + (r() - 0.5) * 60,
        y0 = S - 20;
      const cx = x0 + Math.cos(a) * L * 0.5 + (r() - 0.5) * 60,
        cy = y0 + Math.sin(a) * L * 0.5,
        ex = x0 + Math.cos(a) * L,
        ey = y0 + Math.sin(a) * L;
      if (depth === 0) {
        g.strokeStyle = hsl(28, 22, 16);
        g.lineWidth = 3.2;
        g.beginPath();
        g.moveTo(x0, y0);
        g.quadraticCurveTo(cx, cy, ex, ey);
        g.stroke();
      }
      for (let k = 0; k < 10; k++) {
        if ((k + i) % 3 !== depth) continue;
        const t = 0.18 + k * 0.085,
          u = 1 - t;
        const x = u * u * x0 + 2 * u * t * cx + t * t * ex,
          y = u * u * y0 + 2 * u * t * cy + t * t * ey;
        const side = k % 2 ? 1 : -1;
        leaf(
          x,
          y,
          50 + r() * 28 - k * 1.5,
          15 + r() * 6,
          a + side * (0.55 + r() * 0.55),
          84 + r() * 26,
          34 + r() * 22,
          20 + depth * 6 + r() * 12,
        );
      }
    }
  // pine spray: a branch with needle tufts
  g.save();
  g.translate(S, 0);
  for (let b = 0; b < 5; b++) {
    const y0 = 60 + b * 95,
      a0 = -0.15 + r() * 0.3;
    g.strokeStyle = hsl(25, 30, 16);
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(20, y0);
    g.lineTo(20 + Math.cos(a0) * 470, y0 + Math.sin(a0) * 470);
    g.stroke();
    // a dark core under the needles keeps the spray solid in the small mips, so far pines don't
    // dissolve into dots
    g.fillStyle = hsl(150, 30, 10, 0.85);
    g.beginPath();
    g.ellipse(20 + Math.cos(a0) * 235, y0 + Math.sin(a0) * 235, 220, 26, a0, 0, Math.PI * 2);
    g.fill();
    for (let k = 0; k < 280; k++) {
      const t = r(),
        x = 20 + Math.cos(a0) * 470 * t,
        y = y0 + Math.sin(a0) * 470 * t;
      const ang = a0 + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.9);
      g.strokeStyle = hsl(140 + r() * 30, 30 + r() * 20, 14 + r() * 16);
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(
        x + Math.cos(ang) * (30 + r() * 26) * (1.1 - t * 0.5),
        y + Math.sin(ang) * (30 + r() * 26) * (1.1 - t * 0.5),
      );
      g.stroke();
    }
  }
  g.restore();
  // fern frond: a curved rachis with paired pinnae
  g.save();
  g.translate(0, S);
  g.strokeStyle = hsl(90, 35, 20);
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(S / 2, S - 10);
  g.quadraticCurveTo(S / 2 + 30, S / 2, S / 2, 14);
  g.stroke();
  for (let k = 0; k < 30; k++) {
    const t = k / 30,
      y = S - 10 - t * (S - 24),
      x = S / 2 + 30 * 2 * t * (1 - t) * 1.2;
    const len = 150 * Math.sin(Math.PI * (0.12 + t * 0.85)) + 12;
    for (const side of [-1, 1]) {
      g.save();
      g.translate(x, y);
      g.rotate(side > 0 ? -0.35 : Math.PI + 0.35);
      for (let q = 0; q < 9; q++)
        leaf((q * len) / 9, 0, len / 6, 6, side * 0.9, 95 + r() * 20, 40, 22 + r() * 14);
      g.restore();
    }
  }
  g.restore();
  // hanging moss: grey-green strands
  g.save();
  g.translate(S, S);
  for (let k = 0; k < 90; k++) {
    let x = 30 + r() * (S - 60),
      y = 0;
    g.strokeStyle = hsl(70 + r() * 30, 12 + r() * 12, 30 + r() * 25, 0.9);
    g.lineWidth = 1.5 + r() * 2;
    g.beginPath();
    g.moveTo(x, y);
    const L = 180 + r() * 320;
    while (y < L) {
      y += 12;
      x += (r() - 0.5) * 7;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.restore();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
