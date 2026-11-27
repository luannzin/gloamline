# Gloamline: where to look

A souls-like world at dusk for up to eight players in the browser. Bun workspaces, TypeScript,
Three.js r187 (WebGPU, TSL), React + coss ui for the interface, Trystero for the lobby.

| Question | File |
|---|---|
| What is the world made of, and where? | `packages/world/src` (pure functions of the seed; no DOM, no Three.js) |
| How does a frame get drawn? | `apps/client/src/gfx/*` (one file per system), `apps/client/src/main.ts` (wiring and loop) |
| What does each region look like? | `apps/client/src/gfx/mood.ts` (`MOODS`) |
| How does it look and read? | `DESIGN.md` |
| What's planned, and why this stack? | `docs/PLAN.md` |
| How do players meet? | `apps/client/src/net.ts` |
| What does the map (`Tab`) show? | `apps/client/src/map.ts` (drawn once from the world), `ui/app.tsx` (`WorldMap`) |
| What does each detail level change? | `Quality` in `apps/client/src/gfx/post.ts`; the `q > n` checks where each system is made |

## Rules

- **The world is deterministic.** Anything a player stands on or collides with comes from
  `packages/world` and the seed. A change there changes every player's world: run `bun run check`.
- **Rendering knows nothing about the network, the network knows nothing about rendering**, and the
  world package knows about neither. The interface meets the game only in `apps/client/src/ui/store.ts`.
- **Zero per-frame allocations in the hot loop.** Preallocate; reuse vectors.
- **Everything is generated.** Textures in `gfx/textures.ts`; small geometry in `gfx/shapes.ts`; trees,
  rocks, the Spire, roofs, banners and the wanderer by the Blender scripts in `tools/blender` (headless,
  `-t 4`, outputs committed to `apps/client/public/models`, loaded by `gfx/models.ts`). Edit the
  generator and rerun it, never the output.
- **coss components are copied, not edited** (`apps/client/src/components/ui`). The critters and the
  palette are copied from Sightline (`src/lib/avatar.ts`, `palette.ts`); a change there needs copying here.
- **Checks**: `bun run check` (world contracts, prints `ok`), `bun run typecheck`, `bun run lint`.
  For visual work, the nine viewpoints (`1` to `9`) are the fixed poses to compare; `__game.post.pin(r)`
  in the dev tools holds the render scale so frames compare fairly.
- Commits follow Conventional Commits, with no `Co-Authored-By` line.
