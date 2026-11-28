// Zarechye (world: village.ts), drawn from tools/blender/village.py: log houses, fences, sheds, the
// well sweep, wrecks, and the power line with its wires strung pole to pole. One material shades
// every piece by the material its script wrote into COLOR_0.r (`sway` after models.ts): weathered
// logs and boards, trim painted a colour per house and peeling, galvanised iron gone to rust,
// window glass lit warm in the houses someone still lives in, stone and brick; snow on every top.
// Which houses are lived in is the world's (the same for everyone); their windows' places are read
// off the glass in the meshes, for the snow they light (particles.ts).
import { HOUSE, HOUSES, hash2, POLE, PROP, PROPS, WIRES, type World } from "@zimovye/world";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  attribute,
  color,
  faceDirection,
  float,
  fract,
  hash,
  mix,
  normalLocal,
  positionGeometry,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  step,
  texture,
  time,
  transformNormalToView,
  vec2,
  vec3,
} from "three/tsl";
import * as THREE from "three/webgpu";
import { type Models, model } from "./models";
import type { MoodState } from "./mood";
import { placedMesh, turn } from "./towers";

type F = ReturnType<typeof float>;

export function makeVillage(world: World, models: Models, detail: THREE.Texture, mood: MoodState) {
  const group = new THREE.Group();
  const V = world.village;

  type V4 = Parameters<Parameters<typeof placedMesh>[2]>[0];
  const material = (A: V4, S: V4) => {
    const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide });
    m.positionNode = turn(positionLocal as never, A.w).add(A.xyz);
    const nw = turn(normalLocal as never, A.w);
    m.normalNode = transformNormalToView(nw);
    const id = attribute("sway", "float"),
      ao = attribute("ao", "float"),
      flag = attribute("extra", "float");
    const is = (v: number) => smoothstep(0.1, 0.0, id.sub(v).abs());
    const wp = positionWorld;
    // one random per placed piece, for its paint and whether anyone's home
    const seed = hash(A.x.mul(0.173).add(A.z.mul(0.311)));
    // grain: the detail noise stretched along whichever horizontal axis the face runs
    const grain = vec2(0.25, 2.2);
    const n1 = texture(detail, wp.xz.mul(0.35).add(wp.y.mul(0.11))).x,
      n2 = texture(detail, wp.xy.mul(grain))
        .y.mul(nw.z.abs())
        .add(texture(detail, wp.zy.mul(grain)).y.mul(nw.x.abs())),
      big = texture(detail, wp.xz.mul(0.05).add(wp.y.mul(0.03))).x;
    // silver-grey weathered pine, the lower logs darker with damp; char where it burned
    const log = mix(color(0x2a221b), color(0x4a4239), n2.mul(0.6).add(n1.mul(0.4)))
      .mul(0.55)
      .mul(mix(float(0.7), float(1), smoothstep(0.0, 1.6, positionGeometry.y)));
    const charred = mix(log, color(0x070605), flag.mul(smoothstep(0.3, 0.7, n1.add(0.3))));
    const plank = mix(color(0x34302b), color(0x544c43), n2).mul(0.5);
    // trim: white, sky blue, green or ochre, peeling to bare wood
    const paint = mix(
      mix(color(0x9ea4a6), color(0x3f6d8c), step(0.3, seed)),
      mix(color(0x3e6a4a), color(0x9a7a3a), step(0.85, seed)),
      step(0.6, seed),
    ).mul(0.42);
    const trim = mix(paint, plank, smoothstep(0.55, 0.75, n1.add(big.mul(0.4))));
    // galvanised iron with rust coming through; a car's faded paint over it
    const rust = smoothstep(0.35, 0.75, big.mul(0.8).add(n1.mul(0.5)).add(seed.mul(0.3)));
    const carPaint = mix(color(0x6d8a92), color(0x8f8770), step(0.5, seed)).mul(0.3);
    const iron = mix(mix(color(0x4a4e52), carPaint, flag).mul(0.5), color(0x3a1a0c).mul(0.55), rust);
    // glass: dark, and warm from inside where someone lives (S.w: two houses in three)
    const home = S.w.mul(flag);
    const glass = color(0x050708);
    // field stone, and brick with its courses
    const mortar = smoothstep(0.1, 0.0, fract(wp.y.mul(13.3)));
    const brick = mix(color(0x5a2418), color(0x2a2522), mortar).mul(0.42);
    const stone = mix(color(0x2c2b29), color(0x4b4945), n1).mul(0.5);
    const masonry = mix(stone, brick, flag);
    const base = charred
      .mul(is(0))
      .add(plank.mul(is(0.2)))
      .add(trim.mul(is(0.4)))
      .add(iron.mul(is(0.6)))
      .add(glass.mul(is(0.8)))
      .add(masonry.mul(is(1)));
    // (a thin board seen from behind faces the other way: its back isn't plastered)
    const snow = mood
      .snowOn(nw.y.add(n1.sub(0.5).mul(0.3)), wp, nw.mul(faceDirection))
      .mul(float(1).sub(is(0.8)));
    m.colorNode = mix(base.mul(ao), mood.SNOW, snow);
    m.roughnessNode = mix(
      float(0.9)
        .mul(is(0).add(is(0.2)).add(is(0.4)).add(is(1)))
        .add(mix(float(0.45), float(0.85), rust).mul(is(0.6)))
        .add(float(0.08).mul(is(0.8))),
      float(0.6),
      snow,
    );
    m.metalnessNode = float(0.55).mul(is(0.6)).mul(float(1).sub(rust)).mul(float(1).sub(snow));
    // the windows of the lived-in houses: a stove's light behind curtains, breathing a little
    const flicker = sin(time.mul(1.7).add(seed.mul(30)))
      .mul(0.08)
      .add(sin(time.mul(5.3).add(seed.mul(11))).mul(0.04))
      .add(0.9);
    m.emissiveNode = vec3(1.0, 0.5, 0.2)
      .mul(is(0.8))
      .mul(home)
      .mul(flicker)
      .mul(mix(float(1.2), float(3.5), smoothstep(1.6, 0.6, mood.u.sunPower)) as F);
    return m;
  };

  const place = (rows: number[][], name: string) => {
    if (!rows.length) return;
    group.add(placedMesh(model(models, name), rows, material));
  };
  // houses by kind, two in three lived in (never the burnt one); each lit pane's centre: x, y, z
  const H = V.houses;
  const windows: number[] = [];
  for (let k = 0; k < HOUSES.length; k++) {
    const rows: number[][] = [];
    const panes = glass(model(models, HOUSES[k].name));
    for (let i = 0; i < H.length; i += HOUSE) {
      if (H[i + 4] !== k) continue;
      const lit = k !== 3 && hash2(i / HOUSE, 41, world.seed) > 0.33 ? 1 : 0;
      rows.push([H[i], H[i + 1], H[i + 2], H[i + 3], 1, 1, 1, lit]);
      if (!lit) continue;
      // (placed meshes turn local +z to (sin yaw, cos yaw): towers.ts)
      const c = Math.cos(H[i + 3]),
        s = Math.sin(H[i + 3]);
      for (const [x, y, z] of panes)
        windows.push(H[i] + c * x + s * z, H[i + 1] + y, H[i + 2] - s * x + c * z);
    }
    place(rows, HOUSES[k].name);
  }
  const P = V.props;
  for (let k = 0; k < PROPS.length; k++) {
    const rows: number[][] = [];
    for (let i = 0; i < P.length; i += PROP)
      if (P[i + 4] === k) rows.push([P[i], P[i + 1], P[i + 2], P[i + 3], 1, 1, 1]);
    place(rows, PROPS[k]);
  }
  const L = V.poles;
  const poleRows: number[][] = [];
  for (let i = 0; i < L.length; i += POLE) poleRows.push([L[i], L[i + 1], L[i + 2], L[i + 3], 1, 1, 1]);
  place(poleRows, "pole");

  // the wires: three per span, sagging; one span down, its wires hanging to the snow
  const tubes: THREE.BufferGeometry[] = [];
  const a = new THREE.Vector3(),
    b = new THREE.Vector3();
  const n = L.length / POLE;
  for (let i = 0; i + 1 < n; i++) {
    const o0 = i * POLE,
      o1 = o0 + POLE;
    const broken = i === 4;
    for (const off of WIRES.across) {
      // the crossarm's local x is (cos yaw, -sin yaw)
      a.set(L[o0] + Math.cos(L[o0 + 3]) * off, L[o0 + 1] + WIRES.up, L[o0 + 2] - Math.sin(L[o0 + 3]) * off);
      b.set(L[o1] + Math.cos(L[o1 + 3]) * off, L[o1 + 1] + WIRES.up, L[o1 + 2] - Math.sin(L[o1 + 3]) * off);
      const span = a.distanceTo(b);
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j <= 16; j++) {
        const t = j / 16;
        const p = a.clone().lerp(b, t);
        if (broken) {
          // snapped in the middle: each half hangs from its pole down to the ground
          const fromA = t < 0.5,
            u = fromA ? t * 2 : (1 - t) * 2;
          const top = fromA ? a : b;
          p.copy(top).lerp(fromA ? b : a, u * 0.18);
          p.y = top.y - u * u * (WIRES.up - 0.2);
        } else p.y -= (0.4 + span * 0.012) * 4 * t * (1 - t);
        pts.push(p);
      }
      if (broken) {
        tubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.slice(0, 9)), 10, 0.016, 3));
        tubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.slice(8)), 10, 0.016, 3));
      } else tubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.016, 3));
    }
  }
  if (tubes.length) {
    const wm = new THREE.MeshStandardNodeMaterial();
    wm.colorNode = color(0x0c0c0c);
    wm.roughnessNode = float(0.5);
    wm.metalnessNode = float(0.6);
    const wires = new THREE.Mesh(mergeGeometries(tubes), wm);
    wires.castShadow = true;
    group.add(wires);
    for (const t of tubes) t.dispose();
  }
  return { group, windows: new Float32Array(windows) };
}

/** The centres of the panes of glass that can be lit in a house's mesh (village.py: material 0.8, flagged). */
function glass(g: THREE.BufferGeometry) {
  const pos = g.attributes.position,
    id = g.attributes.sway,
    flag = g.attributes.extra;
  const isPane = (i: number) => Math.abs(id.getX(i) - 0.8) < 0.05 && flag.getX(i) > 0.5;
  // a pane is one box: its vertices joined by its triangles, and by sharing a corner (the export
  // splits each corner per face)
  const up = new Int32Array(pos.count).map((_, i) => i);
  const root = (i: number): number => {
    if (up[i] !== i) up[i] = root(up[i]);
    return up[i];
  };
  const join = (a: number, b: number) => {
    up[root(a)] = root(b);
  };
  const ix = g.index;
  if (ix)
    for (let t = 0; t < ix.count; t += 3) {
      const a = ix.getX(t),
        b = ix.getX(t + 1),
        c = ix.getX(t + 2);
      if (isPane(a) && isPane(b) && isPane(c)) {
        join(a, b);
        join(b, c);
      }
    }
  const corner = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    if (!isPane(i)) continue;
    const key = `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
    const j = corner.get(key);
    if (j === undefined) corner.set(key, i);
    else join(i, j);
  }
  const sums = new Map<number, number[]>();
  for (let i = 0; i < pos.count; i++) {
    if (!isPane(i)) continue;
    const r = root(i);
    const s = sums.get(r) ?? [0, 0, 0, 0];
    s[0] += pos.getX(i);
    s[1] += pos.getY(i);
    s[2] += pos.getZ(i);
    s[3]++;
    sums.set(r, s);
  }
  return [...sums.values()].map(([x, y, z, n]) => [x / n, y / n, z / n]);
}
