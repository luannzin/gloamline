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
2. **A body.** Third-person option, a character from Blender Python scripts (`tools/blender`,
   headless), animation blended from the shared pose.
3. **Combat.** Host-authoritative simulation in a Web Worker (shared with prediction), stamina,
   rolls, a first enemy in Gloamwood, a boss in the keep.
4. **Places to rest and return.** Lanterns as checkpoints, death and return, the Spire as the goal.
5. **Sound.** Generated: wind per region, footsteps per ground, the cave's drips, the keep's fire.

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
