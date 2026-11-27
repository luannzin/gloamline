# Gloamline

A souls-like world at dusk for up to eight people, in the browser. Open the page, invite people with a link, and walk the same world together. No account, no install, no server to run.

Everything you see is made by code when the page opens: the land, the forests, the ruined keep, the caves inside the mountain and the sky. There are no model or texture files.

## The world

Two kilometres square, five regions, each with its own light. Walking from one into the next changes the sky, the air and the grade over a few hundred metres.

| Region | What's there |
|---|---|
| **Gloamwood** | Where you wake: giant oaks with hanging moss, ferns, fireflies, gold light through the canopy |
| **The Mire** | A moonlit marsh: still water that reflects the sky, reeds, dead trees, low mist |
| **Cinder Keep** | A ruined castle on a cliff under a storm at dusk: broken walls and towers, an arcade, a gallows, embers in the wind |
| **The Hollow** | A mountain with caves inside: tunnels, a great chamber lit by shafts through the rock, glowing mushrooms |
| **Pale Highlands** | Wind in tall grass, standing stones, and the Pale Spire on the horizon with its beam |

Roads link them all from a crossroads in the middle. The ramps up the keep's cliff are cut by the road itself.

## Play

```sh
bun install
bun run dev
```

Then open `http://localhost:5190`. It needs a browser with WebGPU (Chrome or Edge; it falls back to WebGL 2 elsewhere).

| | |
|---|---|
| Move | `W` `A` `S` `D` |
| Run | `Shift` |
| Jump | `Space` |
| Lantern | `F` |
| Map (everyone's position) | `Tab` |
| Viewpoints | `1` to `6` |
| Frame rate | `H` |
| Menu | `Esc` |

**Playing with friends**: press **Invite friends**, copy the link, send it. Whoever opens it joins your world and sees you as a hooded wanderer carrying a lantern, with your name over you; `Tab` shows everyone on the map. Up to eight people per link.

## Detail levels

Each level is the same world, drawn with less. The menu picks one; a first visit picks Low on a phone, Medium with 4 GB of memory or less, High otherwise.

| Level | What it is |
|---|---|
| **Low** | No grass, no ambient occlusion or shafts, light from a sky hemisphere, a 1024 shadow map, the canvas itself scaled for the frame rate |
| **Medium** | Grass to 26 m, the sky as image-based light, shafts (20 steps), ambient occlusion, temporal upscaling from as low as 45% |
| **High** | Grass to 30 m with flowers, long shadows marched over the land, 40-step shafts, upscaling from 50% |
| **Ultra** | Grass to 38 m (9 blades a clump), a 4096 shadow map over 240 m, 60-step shafts, output up to 1.5x the display's pixels, upscaling from 60% |

## How it works

- **The world is a function of one seed** (`packages/world`). The heightmap (2048 x 2048, one sample per metre), the roads, the keep's 1,464 stone blocks, the cave and about 45,000 props are built from it, so every player builds the same world and only poses travel over the network.
- **It builds on every core.** Ground rows and cave slices are split across Web Workers; one worker meshes the cave with surface nets and scatters the props.
- **Rendered with Three.js r187 on WebGPU** through TSL node materials. The ground is four instanced grids lifted from a height texture in the vertex shader; the trees, ferns, reeds, rocks and grass are instanced fields culled on the CPU each frame; grass blades bend along circular arcs like abyssal-garden's kelp.
- **Light and air**: a sun or moon per region with a cached shadow map, and past it long shadows marched along the sun over the heightmap; a sky with a thin bright horizon, a Mie glow round the sun and clouds lit from a second fetch toward it, which is also the image-based light; two layers of height fog (the region's air, and mist lying in the hollows in drifting patches) that turn into the sky behind at distance; shafts marched through the shadow map, ground-truth ambient occlusion, bloom, a filmic grade, and a dither against banding.
- **Ground**: one detail noise fetched at four scales, the middle two twice (turned and shifted) so nothing tiles; leaf litter, moss, peat, ash, meadow patches of green, straw and heather shared with the grass blades over them; two sizes of loose stone from a cell texture, each stone rounded in the normal and settled in its own shadow; rock with strata on the faces, lichen on top and snow above the line.
- **Temporal upscaling**: from Medium up the scene renders below the output with a jittered camera and a TAAU resolve rebuilds the full image from the last frames, then a contrast-adaptive sharpen. The render scale is what moves to hold the display's own refresh rate.
- **Multiplayer with no server of mine**: the link is `#<secret>`, and peers meet on public Nostr relays through [Trystero](https://github.com/dmotz/trystero), then talk over WebRTC. The secret never leaves the page.

## Thanks

- [abyssal-garden](https://github.com/Noniv/abyssal-garden) by Noniv, whose single-file WebGPU sea taught the light, the leaves and the frame budget here.
- [Three.js](https://threejs.org) and its WebGPU renderer, [Trystero](https://github.com/dmotz/trystero), [coss ui](https://coss.com/ui).
