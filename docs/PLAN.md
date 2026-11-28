# Plan

## Decisions

| Decision | Chosen | Instead of | Why |
|---|---|---|---|
| Platform | Browser | Native Rust + GPUI | GPUI is a 2D UI framework with no 3D pipeline; a native game means wgpu or Bevy plus an install, signing and SmartScreen for every player. A page needs only the link, like the other lines. |
| Renderer | Three.js r187 `WebGPURenderer` + TSL | Raw WebGPU (abyssal-garden) | TSL gives node materials, shadows, GTAO, god rays and bloom with a WebGL 2 fallback; abyssal-garden's techniques (instanced fields, cached shadows, dynamic resolution, dithered grade) carry over. |
| World | Procedural from one seed, built on every core | Authored assets | Every peer builds the same world locally, so only poses travel. |
| Caves | Signed distance field meshed with surface nets | Heightmap only | A heightmap can't have a roof. The heightmap is the cave floor; the field is the rock above it. |
| Netcode | Trystero over public Nostr relays, WebRTC data channels, `#<secret>` links | A game server | No server to run, the same link shape as Sightline and Hostline. |
| Authority (now) | Each player owns its pose | Host-authoritative | Exploration has nothing to cheat. |
| Authority (combat) | The link's creator hosts a shared simulation in a Web Worker | Dedicated server | FACETA's pattern: one TypeScript simulation for prediction and the host. |
| UI | React + coss ui (Base UI + Tailwind v4) | Plain DOM | The lines' stack and controls; the game never renders UI and meets it in one store. |

## Phases

1. **Explorable world (this MVP).** Five regions, roads, the keep, the Hollow, water, grass, trees,
   particles, moods, first-person walking with collision, lobby of eight with poses and lanterns.
2. **A body.** Done (November 2026): the survivor on MPFB's body, motion-captured clips, gear by
   seed, snow and cold on the body (docs/CHARACTERS.md). What's left is in *The AAA pass* below.
3. **Combat.** Host-authoritative simulation in a Web Worker (shared with prediction), stamina,
   rolls, a first enemy in Gloamwood, a boss in the keep.
4. **Places to rest and return.** Lanterns as checkpoints, death and return, the Spire as the goal.
5. **Sound.** Generated: wind per region, footsteps per ground, the cave's drips, the keep's fire.

## The AAA pass

The bar is Crimson Desert's (and RDR2's and God of War's snow): docs/REFERENCES.md says what each
reference teaches. Done so far: deep snow you sink into with a real trench, one wind for everything,
streaked snowfall, ground drift, a blizzard veil, kicked snow and breath, the cold seen as rime at the
edges and on the warmth meter, the survivor on a real body with motion capture.

How it's checked (abyssal-garden's gate): frames at the nine viewpoints and the survivor up close
(`__game.shot`, `__game.look`, `__game.post.pin(1)` at 1280x720), reviewed by a critic that sees only
the images and the references; iterate until nothing above minor is left.

What the last review left, most damaging first:

1. **Trees.** Spruces read as stacked horizontal tiers with a stepped outline, and their snowy upper
   faces show as a white "ghost twin" beside the dark tree from the side. Trunks are plain; oak crowns
   are blobs with no limbs showing. Want: drooping layered boughs with gaps, snow sitting on the
   boughs, round barked trunks flaring into the snow, limbs visible under the clumps
   (`tools/blender/trees.py`, `gfx/flora.ts`).
2. **The survivor up close.** The coat reads smooth: no stitching, seams or folds at a metre. Next:
   give the meshes UVs, bake normal and occlusion maps from a finer, sculpted version (quilting
   stitches, seams, creases at the elbows and knees, worn leather) with Cycles, sample them in
   `gfx/wanderers.ts`. Then cloth weight: the coat's skirt and the ushanka's flaps on bones of their
   own, swinging like the lantern. Hands are still generic gloves.
3. **The Column.** A hard-edged cylinder with scrolling noise; it lights nothing. Want a turbulent
   column with a soft frayed edge, an anvil spreading at altitude, and orange light on the snow and the
   clouds beneath (`gfx/column.ts`).
4. **Mountains and cliffs.** Backdrops facet like crumpled foil; cliffs smear. Want eroded ridgelines
   with strata, snow on the ledges, and plumes blown off the crests.
5. **Buildings.** Cabins are boxes: want eaves, sagging snow loads, icicles, window light pooling on the
   snow; the ostrog's bricks are oversized and its gate beam floats (`tools/blender/village.py`,
   `architecture.py`).
6. **Ground cover.** Grass and reeds still sit on a visible lattice in places; want sparse clumps of
   bent dry sedge, mostly buried, thinning on ridges (`gfx/grass.ts`).
7. **Colour.** The Ostrog's dusk turns everything maroon and some night views go sepia; snow should
   stay the brightest surface, warm only in small accents (`gfx/mood.ts`).
8. **The creature.** The Shatun (docs/CHARACTERS.md) comes with combat (phase 3); its references are
   in `refs/creature/`.

What the player asked to keep: the camera steady over the shoulder (no head bob there), the HUD soft
in the snow (the frost only at the edges, only when freezing), the snow slowing and holding the body.

## Frame budget

Target: the display's own rate (165 Hz on the dev machine: RX 7600, 1440p), held by dynamic
resolution: the render scale under the temporal upscaler (45 to 100% by level), or the canvas on Low.
What costs the most, measured by hiding each in the thick of Gloamwood on an integrated GPU: leaf
cards (~5 ms), rocks and crags (~4 ms before the far ones got a cheap shader), bark (~2 ms); grass
and the ground cost less than they look. Then the shadow map (redrawn only when its box moves 3 m or
the sun turns), god rays and GTAO (half resolution), contact shadows (High and up, half resolution).
The sky is drawn last so its clouds are paid only where it shows; its image-based light is redrawn
only when the blend of moods has moved.

On a Ryzen 5700U's integrated GPU at 1280x720: Low holds 60; Medium runs 41 to 60 fps across the
nine viewpoints at its lowest render scale; High 28 to 51. Next for the forest: a third, impostor
level for far oaks and pines.
