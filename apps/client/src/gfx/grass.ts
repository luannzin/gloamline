// Grass: clumps of curved blades around the camera, after abyssal-garden's kelp. Each blade is a
// strip that bends along a circular arc (curvature from its seed plus the wind), tapers to a tip,
// twists a little, and carries a normal that follows the arc and rounds across its width. Clumps sit
// on a grid that follows the camera in whole cells, so a blade keeps its spot in the world.
import { HALF, SIZE } from "@gloamline/world";
import {
  attribute,
  cameraPosition,
  cos,
  dot,
  Fn,
  float,
  floor,
  hash,
  instanceIndex,
  int,
  ivec2,
  max,
  mix,
  normalize,
  positionWorld,
  pow,
  sin,
  smoothstep,
  texture,
  textureLoad,
  time,
  transformNormalToView,
  uniform,
  varying,
  vec2,
  vec3,
} from "three/tsl";
import * as THREE from "three/webgpu";
import type { MoodState } from "./mood";
import { fieldTint } from "./terrain";

const ROWS = 5;

/** One clump: `BLADES` strips of ROWS rows. Attributes: blade index, row (0 root .. 1 tip), side (-1, 1). */
function clump(BLADES: number) {
  const blade: number[] = [],
    row: number[] = [],
    side: number[] = [],
    idx: number[] = [];
  for (let b = 0; b < BLADES; b++) {
    const base = blade.length;
    for (let r = 0; r < ROWS; r++) {
      // rows bunch toward the root, where the arc turns least
      const v = Math.sin((r / (ROWS - 1)) * Math.PI * 0.5);
      for (const s of [-1, 1]) {
        blade.push(b);
        row.push(v);
        side.push(s);
      }
    }
    for (let r = 0; r < ROWS - 1; r++) {
      const a = base + r * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  const n = blade.length;
  g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(
      new Float32Array(n * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  g.setAttribute("blade", new THREE.Float32BufferAttribute(blade, 1));
  g.setAttribute("row", new THREE.Float32BufferAttribute(row, 1));
  g.setAttribute("side", new THREE.Float32BufferAttribute(side, 1));
  g.setIndex(idx);
  return g;
}

export function makeGrass(
  tex: { height: THREE.DataTexture; ground0: THREE.Texture; ground1: THREE.Texture },
  detail: THREE.Texture,
  mood: MoodState,
  quality: number,
) {
  const side = [0, 140, 200, 270][quality],
    step = [0, 0.38, 0.3, 0.28][quality];
  const reach = side * step * 0.5;
  const origin = uniform(new THREE.Vector2());
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide });

  // --- the clump: where it stands, how tall the ground lets it be
  const id = float(instanceIndex);
  const gx = id.mod(side),
    gz = floor(id.div(side));
  const wx = origin.x.add(gx.sub(side / 2).mul(step)),
    wz = origin.y.add(gz.sub(side / 2).mul(step));
  const cell = vec2(floor(wx.div(step).add(0.5)), floor(wz.div(step).add(0.5)));
  const c1 = hash(cell.x.mul(12.9898).add(cell.y.mul(78.233))),
    c2 = hash(cell.x.mul(39.34).add(cell.y.mul(11.13)).add(7));
  // a whole cell of jitter, so clumps never line up in rows
  const cx = wx.add(c1.sub(0.5).mul(step * 1.6)),
    cz = wz.add(
      hash(c1.mul(71.3).add(c2.mul(13.7)))
        .sub(0.5)
        .mul(step * 1.6),
    );
  const guv = vec2(cx, cz)
    .add(HALF + 0.5)
    .div(SIZE);
  const g0 = texture(tex.ground0, guv).level(float(0)),
    g1 = texture(tex.ground1, guv).level(float(0));
  const nx = g1.z.mul(2).sub(1),
    nz = g1.w.mul(2).sub(1),
    ny = max(float(1).sub(nx.mul(nx)).sub(nz.mul(nz)), 0.05).sqrt();
  const tall = g0.x.mul(0.55).add(g0.y.mul(0.85)).add(g0.z.mul(0.6)).add(g0.w.mul(0.78));
  const allowed = float(1)
    .sub(g1.x)
    .mul(float(1).sub(smoothstep(0.12, 0.45, g1.y)))
    .mul(smoothstep(0.72, 0.88, ny));
  const fx = cx.add(HALF),
    fz = cz.add(HALF),
    ix = floor(fx),
    iz = floor(fz),
    u0 = fx.sub(ix),
    v0 = fz.sub(iz);
  const L = (dx: number, dz: number) => textureLoad(tex.height, ivec2(int(ix.add(dx)), int(iz.add(dz)))).x;
  const ground = mix(mix(L(0, 0), L(1, 0), u0), mix(L(0, 1), L(1, 1), u0), v0);
  const dist = vec2(cx, cz).sub(cameraPosition.xz).length();
  const keep = smoothstep(reach, reach * 0.62, dist)
    .mul(allowed)
    .mul(smoothstep(0.2, 0.5, c2.add(allowed.mul(0.5))));

  // --- the blade
  const bi = attribute("blade", "float"),
    v = attribute("row", "float"),
    u = attribute("side", "float");
  const r1 = hash(c1.mul(91.7).add(bi.mul(1.731))),
    r2 = hash(c2.mul(53.3).add(bi.mul(4.117))),
    r3 = hash(c1.add(c2).mul(17.1).add(bi.mul(7.37)));
  // far away only the first blades of a clump stay, wider, so the field doesn't thin to noise
  const lod = smoothstep(reach * 0.35, reach * 0.7, dist);
  const shown = keep.mul(float(1).sub(lod.mul(smoothstep(1.5, 2.5, bi))));
  const a = r1.mul(6.2832),
    rr = r2.sqrt().mul(step * 0.9);
  const bx = cx.add(a.cos().mul(rr)),
    bz = cz.add(a.sin().mul(rr));
  const by = ground
    .sub(
      nx
        .mul(a.cos().mul(rr))
        .add(nz.mul(a.sin().mul(rr)))
        .div(ny),
    )
    .sub(0.04);
  // a few clumps flower: one stem each, a head at its tip (more in the highlands' meadows)
  const flowerP = g0.w.mul(0.09).add(g0.x.mul(0.035)).add(g0.z.mul(0.02));
  const flower = c2.greaterThan(float(1).sub(flowerP)).and(bi.lessThan(0.5)).select(float(1), float(0));
  const patchLen = texture(detail, vec2(cx, cz).div(23)).level(float(0)).x.mul(0.9).add(0.55);
  const len = tall
    .mul(mix(float(0.5), float(1.15), r3))
    .mul(patchLen)
    .mul(flower.mul(0.35).add(1))
    .mul(shown);
  const az = r2.mul(6.2832).add(r1.mul(2));
  const tilt = r3.mul(0.35).add(0.08);
  const d = vec3(sin(tilt).mul(cos(az)), cos(tilt), sin(tilt).mul(sin(az)));
  const pe = vec3(cos(tilt).mul(cos(az)), sin(tilt).negate(), cos(tilt).mul(sin(az)));
  const sd = vec3(sin(az).negate(), 0, cos(az));
  // wind: a slow sway plus gusts that travel across the field
  const ph = bx.mul(0.031).add(bz.mul(0.017));
  const gust = sin(bx.mul(0.08).add(bz.mul(0.05)).sub(time.mul(1.4)))
    .mul(0.5)
    .add(0.5)
    .pow(2);
  const windK = gust
    .mul(1.4)
    .add(sin(time.mul(1.7).add(r1.mul(20)).add(ph)).mul(0.25))
    .mul(mood.u.leaves.mul(0.6).add(0.5));
  const wdir = vec2(0.8, 0.6);
  const k = r3
    .mul(1.1)
    .add(0.35)
    .add(
      windK.mul(
        dot(vec2(cos(az), sin(az)), wdir)
          .mul(0.8)
          .add(0.4),
      ),
    );
  const ka = max(k.mul(flower.mul(-0.6).add(1)), 0.06),
    sK = sin(ka.mul(v)),
    cK = cos(ka.mul(v));
  const centre = vec3(bx, by, bz).add(
    d
      .mul(sK.div(ka))
      .add(pe.mul(float(1).sub(cK).div(ka)))
      .mul(len),
  );
  const N = normalize(pe.mul(cK).sub(d.mul(sK)));
  // width: tapered, wider with distance so a blade never falls under a pixel; a flower's stem is
  // thin and swells into a head at the tip
  const taper = float(1).sub(v).pow(0.75);
  const head = smoothstep(0.78, 0.9, v).mul(float(1).sub(smoothstep(0.97, 1.0, v)));
  const width = mix(
    mix(float(0.014), float(0.028), r2).max(dist.mul(0.0014)).mul(taper),
    float(0.008).add(head.mul(0.05)).max(dist.mul(0.0012)),
    flower,
  ).mul(shown);
  const tw = r1.sub(0.5).mul(1.4).mul(v);
  const S = sd.mul(cos(tw)).add(N.mul(sin(tw)));
  const sway = vec2(sin(time.mul(0.9).add(ph).add(r2)), cos(time.mul(0.7).add(ph.mul(1.3))))
    .mul(v.pow(1.25))
    .mul(len)
    .mul(0.08);
  m.positionNode = Fn(() => {
    const p = centre.add(S.mul(u.mul(width))).toVar();
    p.x.addAssign(sway.x);
    p.z.addAssign(sway.y);
    return p;
  })();
  // a rounded blade: the normal leans out toward each edge
  // mostly up, like the ground under it, so a field lights as one surface; the arc and the
  // rounding only lean it
  const n = normalize(
    N.mul(0.6)
      .add(S.mul(u.mul(0.3)))
      .add(vec3(0, 1.1, 0)),
  );
  m.normalNode = transformNormalToView(n);

  // --- colour: per region, darker at the root (the clump shades itself), lighter and drier at the tip
  const seed = varying(r3),
    vv = varying(v);
  // the field's own colour (shared with the ground under it), a little brighter in the blades
  const tint = fieldTint(vec2(cx, cz), g0, detail, true).mul(1.3);
  const dry = vec3(0.22, 0.18, 0.08);
  const tintV = varying(tint);
  // flower heads: white, butter yellow, violet, a few red
  const fh = hash(c2.mul(31.7));
  const petal = mix(
    mix(vec3(0.75, 0.72, 0.62), vec3(0.8, 0.55, 0.06), smoothstep(0.3, 0.35, fh)),
    mix(vec3(0.3, 0.16, 0.55), vec3(0.62, 0.06, 0.04), smoothstep(0.85, 0.9, fh)),
    smoothstep(0.6, 0.65, fh),
  );
  const petalV = varying(petal),
    headV = varying(head.mul(flower));
  const albedo = Fn(() => {
    const base = mix(tintV, dry, seed.mul(seed).mul(0.5)).toVar();
    base.mulAssign(mix(float(0.45), float(1.25), vv.pow(0.7)));
    return mix(base.mul(mix(float(0.85), float(1.1), seed)), petalV, headV);
  })();
  m.colorNode = albedo;
  // matte: a sky-blue sheen on every blade reads as plastic
  m.roughnessNode = float(0.82);
  // light through the blades toward the sun
  const view = normalize(positionWorld.sub(cameraPosition));
  const back = pow(max(dot(view, mood.u.sunDir), 0), 3)
    .mul(0.85)
    .add(0.08);
  m.emissiveNode = albedo.mul(mood.u.sunColor).mul(back.mul(mood.u.sunPower).mul(0.18)).mul(vv);

  const mesh = new THREE.Mesh(clump(quality > 2 ? 9 : 7), m);
  mesh.count = side * side;
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  return {
    mesh,
    update(p: THREE.Vector3) {
      origin.value.set(Math.round(p.x / step) * step, Math.round(p.z / step) * step);
    },
  };
}
