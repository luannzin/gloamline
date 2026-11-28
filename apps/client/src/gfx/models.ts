// Meshes made in Blender by the scripts in tools/blender, loaded as geometry only (each system
// shades them itself). Every mesh gets the `sway` attribute the instanced fields expect.
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as THREE from "three/webgpu";

export type Models = Map<string, THREE.BufferGeometry>;

/** All the meshes in `files` (under public/models), by object name. */
export async function loadModels(files: string[]): Promise<Models> {
  const loader = new GLTFLoader();
  const out: Models = new Map();
  const base = new URL("models/", document.baseURI);
  await Promise.all(
    files.map(async (f) => {
      const gltf = await loader.loadAsync(new URL(f, base).href);
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) out.set(m.name, prepare(m.geometry));
      });
    }),
  );
  return out;
}

/**
 * What the shaders read: `sway`, `ao` and `extra` from COLOR_0's r, g, b where the script wrote
 * them (each script says what its channels mean), else
 * sway grown from the height and reach of each vertex (bark: still at the root, loose at the tips),
 * and UVs turned back to three's v-up (glTF stores them flipped).
 */
function prepare(g: THREE.BufferGeometry) {
  const pos = g.attributes.position,
    n = pos.count;
  const sway = new Float32Array(n),
    ao = new Float32Array(n).fill(1),
    extra = new Float32Array(n);
  const col = g.attributes.color;
  if (col) {
    for (let i = 0; i < n; i++) {
      sway[i] = col.getX(i);
      ao[i] = col.getY(i);
      extra[i] = col.getZ(i);
    }
    g.deleteAttribute("color");
    g.setAttribute("extra", new THREE.BufferAttribute(extra, 1));
  } else {
    g.computeBoundingBox();
    const top = Math.max(1, g.boundingBox!.max.y);
    for (let i = 0; i < n; i++) {
      const h = Math.max(0, pos.getY(i)) / top,
        reach = Math.hypot(pos.getX(i), pos.getZ(i)) / 6;
      sway[i] = Math.min(1, h * h * 0.7 + reach * 0.5);
    }
  }
  g.setAttribute("sway", new THREE.BufferAttribute(sway, 1));
  g.setAttribute("ao", new THREE.BufferAttribute(ao, 1));
  const uv = g.attributes.uv;
  if (uv) for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  return g;
}

/**
 * A rigged file kept whole (its skinned meshes, skeleton and clips): the survivor. Each mesh's COLOR_0
 * becomes `sway`, `mat` and `ao` (r, g, b; survivor.py says what they hold).
 */
export async function loadRig(file: string) {
  const gltf = await new GLTFLoader().loadAsync(new URL(file, new URL("models/", document.baseURI)).href);
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry,
      col = g.attributes.color;
    if (!col) return;
    const n = col.count,
      sway = new Float32Array(n),
      mat = new Float32Array(n),
      ao = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      sway[i] = col.getX(i);
      mat[i] = col.getY(i);
      ao[i] = col.getZ(i);
    }
    g.deleteAttribute("color");
    g.setAttribute("sway", new THREE.BufferAttribute(sway, 1));
    g.setAttribute("mat", new THREE.BufferAttribute(mat, 1));
    g.setAttribute("ao", new THREE.BufferAttribute(ao, 1));
  });
  return { scene: gltf.scene, clips: gltf.animations };
}

export type Rig = Awaited<ReturnType<typeof loadRig>>;

/** The mesh named `name`, or an error that says which file to rebuild. */
export function model(models: Models, name: string) {
  const g = models.get(name);
  if (!g) throw new Error(`model ${name} missing: run the Blender scripts in tools/blender`);
  return g;
}
