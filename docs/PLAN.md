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

The order (November 2026), each step with its gameplay:

0. **Snow that hits the world.** Done (November 2026): a cover map (`gfx/cover.ts`, a 512² depth
   map down the wind-tilted snowfall, 48 m round the camera, of the village, keep, mine and crowns,
   redrawn after a 4 m move or a wind turn) hides flakes under cover and splats them on roofs; eight
   body capsules part the snow and leave a wake; lanterns and the nearest lit windows warm the flakes
   (`gfx/particles.ts`). Drifts and shelter are the world's (`packages/world/src/wind.ts`): the
   prevailing wind from the seed, banks on windward walls, a scoured lee, clear eaves, read by
   `snowDepth` and the terrain; snow on the body builds in the open, stops under cover, and
   chills; a wall's lee cuts the wind (`body.ts`). Left for later: fires to melt it off (none exist
   yet; braziers come with the buildings).
   **0.5. The hit leaves a mark.** Done (November 2026): `mood.snowOn` takes the whole normal where a
   surface has one and plasters the face turned into the wind, in streaks down it, on the village,
   bark and rocks (not the leaf cards, which step 1 replaces, nor the terrain, step 5). On the
   survivor the snow is driven onto the side held to the wind, gathered in the figure's own space
   over half a minute of snowfall so a turn doesn't move it (`gfx/wanderers.ts`). The white side of
   a pole is the compass in a white-out; the dark side is the shelter.
1. **Trees and ground cover.** Spruces read as stacked tiers, and each pine card's one normal turns
   the whole up-tilted card white: a "ghost twin" beside the tree (`gfx/flora.ts`, `gfx/shapes.ts`).
   Want drooping layered boughs with gaps, snow as its own geometry on the boughs, a barked trunk
   flaring into the snow, LODs and an impostor (`tools/blender/trees.py`); oaks with limbs under the
   clumps, holding dead brown leaves. Brushing a spruce or a gust drops snow off a bough, which springs
   up bare. Grass and sedge in random clumps, mostly buried: how much shows tells how deep the snow
   ahead is (`gfx/grass.ts`). Tree wells (world, `snowDepth`): shallow snow under a big spruce's
   crown, a deep pit at the trunk; shelter from the fall, and a trap.
2. **Survivor cloth.** The coat's skirt and the ushanka's flaps on bones of their own, swung by
   `wind.at` like the lantern. The flaps tie down when the cold bites: a friend's hat says how cold
   they are, with nothing sent.
3. **Buildings.** Eaves, heavy roof snow with a cornice curling over, icicles, chimney smoke, window
   light pooling on the snow; the ostrog's bricks at the right size, its gate beam seated
   (`tools/blender/village.py`, `architecture.py`). A lit window marks shelter at night; smoke only
   from the lived-in houses, leaning with the wind; a gust now and then slides snow off a roof into
   the clear strip under the eave, onto whoever stands there.
4. **The Column.** A soft, frayed volume, a top spreading into the cloud layer, orange light beneath
   on the clouds and the snow facing it, a slow flicker (`gfx/column.ts`, `gfx/mood.ts`). At night it
   is the way home.
5. **Mountains and cliffs.** Strata in the cliff shader, snow on the ledges, plumes off the crests from
   ridge points found in the heightmap, showing the wind; cornices on the lee of the ridges; the
   windward plaster (0.5) on the cliff faces.
6. **The survivor up close.** UVs, normal and occlusion maps baked in Cycles (quilting, seams,
   creases, worn leather), sampled in `gfx/wanderers.ts`; real mittens and hands.
7. **Colour**, after the Column's light. Snow stays the brightest surface, warm only in small accents;
   fixes the Ostrog's maroon dusk and the sepia nights (`gfx/mood.ts`).
8. **The creature.** The Shatun (docs/CHARACTERS.md) comes with combat (phase 3); its references are
   in `refs/creature/`.

After each step: the nine viewpoints and a close-up, a critic pass, and the frame budget held on
Medium (5700U).

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
