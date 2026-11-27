# Zimovye: where to look

Co-op survival in a Soviet backwater the winter after the flash, for up to eight players in the
browser. Bun workspaces, TypeScript,
Three.js r187 (WebGPU, TSL), React + coss ui for the interface, Trystero for the lobby.

| Question | File |
|---|---|
| What is the world made of, and where? | `packages/world/src` (pure functions of the seed; no DOM, no Three.js) |
| How does a frame get drawn? | `apps/client/src/gfx/*` (one file per system), `apps/client/src/main.ts` (wiring and loop) |
| What does each region look like? | `apps/client/src/gfx/mood.ts` (`MOODS`) |
| How does it look and read? | `DESIGN.md` (and `docs/REFERENCES.md` for the board behind it) |
| What's planned, and why this stack? | `docs/PLAN.md` |
| Who is the survivor, what gear and colours, what is the creature? | `docs/CHARACTERS.md` |
| How do players meet? | `apps/client/src/net.ts` |
| What does the map (`Tab`) show? | `apps/client/src/map.ts` (drawn once from the world), `ui/app.tsx` (`WorldMap`) |
| What does each video setting change? | `apps/client/src/video.ts` (the settings, presets; plain data shared by the game and the settings screen); each system reads its own level where it's made; `dress`, `apply` and the detection test in `main.ts` |
| How does the menu frame the world, and how does play start? | `apps/client/src/stage.ts` (the menu's camera and the move to the shoulder), `ui/app.tsx` (`Splash`, `Menu`) |

## Rules

- **The world is deterministic.** Anything a player stands on or collides with comes from
  `packages/world` and the seed. A change there changes every player's world: run `bun run check`.
- **Rendering knows nothing about the network, the network knows nothing about rendering**, and the
  world package knows about neither. The interface meets the game only in `apps/client/src/ui/store.ts`.
- **Zero per-frame allocations in the hot loop.** Preallocate; reuse vectors.
- **Everything is generated.** Textures in `gfx/textures.ts`; small geometry in `gfx/shapes.ts`; trees,
  rocks, the ostrog's roofs and banners, the village (`village.py`) and the survivor (`survivor.py`) by
  the Blender scripts in `tools/blender` (headless, `-t 4`, outputs committed to
  `apps/client/public/models`, loaded by `gfx/models.ts`). Edit the generator and rerun it, never the
  output. The Column is a shader (`gfx/column.ts`), the trails a stamped texture (`gfx/trails.ts`).
- **coss components are copied, not edited** (`apps/client/src/components/ui`).
- **Checks**: `bun run check` (world contracts, prints `ok`), `bun run typecheck`, `bun run lint`.
  For visual work, the nine viewpoints (`1` to `9`) are the fixed poses to compare; `__game.post.pin(r)`
  in the dev tools holds the render scale so frames compare fairly.
- Commits follow Conventional Commits, with no `Co-Authored-By` line.
