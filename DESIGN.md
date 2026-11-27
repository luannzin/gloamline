---
name: Gloamline
description: A souls-like world at dusk, shared by a link. The world is the menu; the interface is quiet ink and pixel names over it.
colors:
  night: "#110d24"
  dusk-violet: "#3a2a6b"
  dusk-plum: "#7a3361"
  dusk-ember: "#e0703f"
  dusk-gold: "#ffd180"
  ink: "#f2ede4"
  ink-soft: "#b9b2a6"
  ink-muted: "#7f786d"
  veil: "rgba(8, 6, 16, 0.55)"
typography:
  name: "5x7 pixel face (SVG, one rect per font pixel), the lines' face"
  body: "Inter Variable, 16px / 1.5"
  control: "Inter Variable, 14px / 500"
  key: "Inter Variable, 12px / 500 (Kbd)"
---

# Gloamline: design

Gloamline is one of the lines: it needs only a link. It shares their dusk (night `#110d24`, violet,
plum, ember, gold), their 5x7 pixel face for names, Sightline's pixel critters for people, and coss
controls that stay neutral. Everything else serves the game's own experience: waking in a wood at
dusk and walking somewhere you can see on the horizon.

## The world is the menu

- The game runs behind every screen. Loading draws the world on every core while the page says what
  it's doing; the menu is that world blurred and darkened (`#veil`, 14px blur, 55% brightness), so
  shaders compile and resolution settles before anyone walks in. Entering is the blur lifting
  (600ms ease-out), not a cut.
- Nothing covers the middle of the frame while playing. The HUD lives in the corners and fades out
  when it has nothing to say.

## Art: one light per place

Each region is a mood (`apps/client/src/gfx/mood.ts`): its own sun or moon, sky, air and grade. The
camera blends them, so crossing from Gloamwood into the Mire turns afternoon into moonlight over a
few hundred metres.

| Region | Light | Air | What moves |
|---|---|---|---|
| Gloamwood | Low gold sun through the canopy | Green-gold haze, shafts between trunks | Leaves, dust, a few fireflies |
| The Mire | Cold moon, stars | Low blue mist on the water | Fireflies, reeds |
| Cinder Keep | Red sun under a storm, almost on the horizon | Warm smoke | Embers off the walls |
| The Hollow | Shafts down the chimneys, glowing caps | Dark, wet, dust in the light | Dust, caps breathing |
| Pale Highlands | Wide pale gold | Thin, far | Grass in travelling gusts |

The rules, from `luannzin-online-presence/games/CRAFT.md` and abyssal-garden:

- **The art leads, light carries it.** Ground albedos are real-world dark (0.03 to 0.15); the sun
  and sky carry the brightness, and the grade carries the mood. Colour and contrast make the mood;
  exposure and bloom only make it louder.
- **Air is part of the image.** Height fog with the sun scattered into it, shafts marched through the
  shadow map, and aerial perspective that turns far ridges into the sky's colour.
- **Nothing is perfectly still.** Wind travels across grass in gusts; leaves flutter; the camera
  breathes; particles drift.
- **The dark is a silhouette level, not a blackout.** At night and in the Hollow about a fifth of the
  scene survives as shape.
- **Bloom belongs to lights**: a soft mix, not a glow on everything. Grain is off; a triangular
  dither kills banding instead.
- **Static light is computed once.** The shadow map redraws only when its box moves or the sun turns.

## Names: the lines' pixel face

- The wordmark `GLOAMLINE` and every area name are drawn in the lines' 5x7 face
  (`apps/client/src/ui/pixel-name.tsx`), whole-pixel crisp, in `ink` with a dusk-gold glow.
- **Area reveal**: crossing into a region writes its name in the pixel face at 40% from the top,
  with a dithered dusk rule under it (violet to gold, 4x4 Bayer). It holds 3.5 s and fades over 1.4 s.
  It's the only thing that ever takes the middle of the screen.
- People are their critters (Sightline's `avatar.ts`, drawn from one 32-bit seed), never initials.

## Controls and words

- coss components (`Button`, `Input`, `Field`, `Kbd`, `ToggleGroup`), dark theme, neutral. Buttons say
  what happens ("Enter the world", "Invite friends", "Copy link"); the voice lives in the one lead
  line, not in the buttons.
- Text sits in three ink tiers (`ink`, `ink-soft`, `ink-muted`) at 16px, sentence case, Inter.
- The menu is a left column over the world, 360px wide, 40px from the left edge, vertically centred.
  The gap between groups is twice the gap inside one (24px against 12px).
- Keyboard focus gets everything hover gets. Reduced motion turns the blur lift and the reveal into
  plain fades.

## HUD

| Where | What | When |
|---|---|---|
| Top left | The party: critter (32px, 2 screen pixels per art pixel), name in `ink`; you first | In a lobby; settles to 70% 4 s after anyone joins or leaves |
| Middle, 40% down | Area name | On crossing into a region |
| Bottom left | `Esc` menu hint | First 6 s of play |
| Top right | Frame rate, render scale, position | `H` |
