---
name: Zimovye
description: Co-op survival in a Soviet backwater the winter after the flash. The world is the menu, framed on you standing in it; the HUD is a GTA-style contextual layer in the corners; the light is built like a FromSoftware landscape.
colors:
  soot: "#0b0d10"
  frost: "#e9eef2"
  frost-soft: "#aeb6bd"
  frost-muted: "#6f7880"
  ember: "#ff7a2f"
  amber: "#ffb347"
  health: "#e8506b"
  stamina: "#dfe9ee"
  warmth: "#ff9a3c"
  rad: "#b7e34a"
  glass: "rgba(12, 15, 18, 0.46)"
  rule: "rgba(255, 255, 255, 0.10)"
typography:
  display: "Oswald Variable 600, uppercase, +0.04em: area names, labels, numbers on the HUD"
  body: "Inter Variable 16px / 1.5: menu copy"
  cyrillic: "Oswald Variable 400, under every place name, the way signs are lettered here"
references: docs/REFERENCES.md
---

# Zimovye: design

The winter after the flash. A district of wooden villages, a kolkhoz, a mine and an old fort,
somewhere east of anywhere, under a sky that hasn't cleared since. The name is a trapper's winter
hut (зимовье), the kind you sit a winter out in. Up to eight survivors from one link.

The references and what each teaches are in `docs/REFERENCES.md` (images in `refs/`, gitignored).

## The mark

The zimovye in a ring: a log hut under a heavy cap of snow, its window, three logs with the middle
one set in so the corners cross, and nothing else. One colour, frost (or soot on light), no accent:
the warm colours belong to the world. The name is Oswald 400 tracked wide (0.34em): in the menu,
ZIMOVYE beside the mark with «Зимовье · зима после вспышки» under it; in the title, ZIMO and VYE
either side of it. The tab's icon is the mark in frost on a soot tile. The paths live in
`apps/client/src/ui/mark.tsx`, shared by all three.

## The world is the menu

- The game runs behind every screen. It opens the way Crimson Desert's does (refs/crimson-desert/),
  in its own colours: a studio card, BY LUAN in white Oswald tracked wide on black, out of the dark
  and back into it, under a film grain that stays for the whole intro; then the title, ZIMO, the
  mark, VYE, in frost in the winter air. Three slanted planes of air arrive on the wind from the
  right, each paler than the one before (the air in layers, as below: the further off, the paler),
  paler at the top as fog lit from the sky, their cut edges catching the light; they drift at their
  own paces, so the lines between them keep shifting, and snow blows past at three depths along the
  same slant. The mark draws itself (the ring round from north, the roof and the logs settling into
  it, the window lit like a lamp catching) and the name comes out of it letter by letter, the
  nearest first. Along the bottom, over a dark foot: what's being built ("Raising the land…") and
  the real progress, a tip about surviving the district that changes every few seconds, and the
  progress as a hairline whose head is a small breathing light. When the world is ready the window
  lights warm (the one warm thing, as in the world) and "The zone is ready"; once the mark has
  finished, the planes are carried off on the wind to the left, the nearest last, its edge the cut
  that sweeps onto the world. Any key or click skips the studio card, and the title once the world
  is ready. Reduced motion keeps only the fades.
- The menu is a shot of you standing in the world, with no panel over it: from behind and to the
  left of your survivor, the lantern lit, looking out at what they face, so they stand in the right
  third. The camera breathes and leans toward the pointer; the first time, it arrives from high and
  further back as the title fades. The words sit bottom-left in the HUD's type over the world, with
  only the cold pooling under them: Enter the zone, Invite friends, Settings.
- Starting is one camera move, never a cut (God of War's): the chosen line flicks, the words go, and
  the camera swings in to your shoulder as the lens widens (2.4 s). The controls are yours when it
  lands. `Esc` plays it backwards.
- Settings is a full-screen page over the world: its name and the tabs across the top (Video,
  Controls) on a rule, Back with `Esc` at the right; the rows down the left (the name in Oswald, what
  it does under it in small muted type, the control to the right), the world still showing through
  on the right so a change is seen as it's made. A change never reloads: a world detail is rebuilt
  beside what's drawing and swapped in.
- Nothing covers the middle of the frame while playing except the area reveal and the map.
- No name to choose and no lobby screen yet: everyone is given a name the district would know.

## Light: built like a FromSoftware landscape

What Elden Ring does, at a browser's budget:

- **One lit landmark seen from everywhere.** On the northern horizon the Column, the smoke of the
  blast that never settled, stands into the overcast, lit orange from the fires under it. It is
  the warmest, brightest thing in most frames and the way home.
- **Air in layers.** Valleys fill with fog; each ridge further off is paler and bluer, so depth reads
  in three or four flat planes. Height fog with the sun scattered into it, a mist that pools, and
  aerial perspective into exactly the sky behind.
- **Cold ambient, warm practicals.** The sky is grey-blue and the snow takes it. The only warm light
  is made by people and fire: lanterns, lit windows, braziers, the Column's glow, embers off the
  fort. Saturation is low everywhere and spent on those.
- **Silhouette first.** Pines, poles and roofs read as dark shapes against bright fog before any
  detail; detail is spent where the eye lands.
- **Albedos are real.** Soil 0.03 to 0.15, snow 0.65 to 0.8. The sun under the overcast is weak, the
  sky does most of the lighting, the grade carries the mood.
- **Nothing is still.** Snow falls and drifts on the wind, reeds bend in gusts, the camera breathes.
- **Static light is computed once.** The shadow map redraws only when its box moves or the sun turns.
- **The lens stays on the survivor.** With depth of field on, the world past the body softens a
  little, the far ridges most and never fully, as through a long lens (Crimson Desert's).

| Place | Russian | Light | Air | What moves |
|---|---|---|---|---|
| Chernolesye, the black wood | Чернолесье | Low sun slit under the overcast, shafts between pines | Blue-grey haze, snow off the branches | Snow, a little ash |
| Gniloye, the rotten marsh | Гнилое | Moonlight on ice, stars through a tear in the cloud | Low white mist on the frozen water | Snow, faint green motes over the bad water |
| The Old Ostrog, the fort | Старый острог | Red dusk under a storm, fires still burning | Warm smoke | Embers and ash |
| Shaft No. 9, the mine | Шахта № 9 | Grey mountain white-out; inside, shafts down the chimneys | Dark, wet, dust in the light | Dust |
| Kolkhoz Zarya, the fields | Колхоз «Заря» | Wide pale overcast | Thin and far | Dry reeds through the snow, blowing snow |

## Snow

- Snow lies on what faces the sky: thick on flat ground and roofs, a rim on ledges, none on cliffs.
  It thins where wind scours ridges and drifts into hollows (the same noise that moves the mist).
- Roads are trodden: grey slush with ruts and the soil showing.
- Grass is last summer's: straw, rust and reed heads standing out of the snow.
- Pines keep their dark needles with snow on the upper side; oaks keep their dead brown leaves.

## HUD: contextual, like GTA VI

The rule from GTA VI: say nothing until it matters, then say it at a glance. Everything lives in
the corners and fades out when it has nothing to say.

| Where | What | When |
|---|---|---|
| Top left | Status: four thin bars (health, stamina, warmth, radiation), each with its colour and a round icon | A bar shows while it isn't full (or isn't empty, for radiation); all show for 4 s after entering |
| Bottom left | Minimap: a rounded rectangle of frosted glass, the district turning with you, north marked, you a white arrow, others their colour, the Column in ember with its distance | Always while playing |
| Above the minimap | Notifications: someone joined, someone left, the lantern's on | Slide in, hold 4 s, leave |
| Top right | The party: colour dot and name | In a lobby; settles to 60% after 4 s |
| Middle, 40% down | Area reveal: the name in Oswald, the Russian under it, a thin rule | On crossing into a place |
| Middle, over a veil | The map: the district from above, place names, everyone's marks | `Tab` |
| Top right, under the party | Frame rate, render scale, position | `H` |

- **Glass, not boxes.** Panels are `glass` with a 1px `rule` border and 10px radius; text sits on
  them in `frost`, numbers tabular. Over the world without a panel, text gets a soft dark shadow.
- **One hot colour per meaning.** Ember is the Column and everything that leads to it; each meter
  has its own; nothing else on screen is saturated.
- **Words are signs.** Labels are short, uppercase Oswald, the Russian under place names in Oswald 400
  at 70%. Buttons say what happens ("Enter the zone", "Invite friends", "Copy invite link").
- Keyboard focus gets everything hover gets; the menu answers the arrows and Enter. Reduced motion
  turns slides into fades and the camera's moves into cuts.
- Remote players carry their name over the head (Oswald 14px, `frost`), fading out from 120 to 160 m.

## Controls

Look: mouse. Move: `W` `A` `S` `D` (a walker's pace, 1.9 m/s). Run: `Shift` (a runner's, 4.6 m/s; uses
stamina). The paces are a body's, so the motion-captured legs never slide. Jump: `Space`. Lantern: `F` (warms you,
slowly; lit to begin with). View: `V` (over the shoulder, where play starts, or first person). Map: `Tab`. Menu: `Esc`. Viewpoints: `1` to
`9`. Stats: `H`.

## Deep snow

Snow that lies thick enough slows a walk to a trudge (a third of the pace, short strides, each step
pulled out of the drift) and makes running cost more breath. The body is in it, not on it: the feet
sink to the shin or the knee, and the ground under the camera is a real surface that the body
ploughs a trench through, a print pressed at each step, the snow pushed aside heaped in a rim of
clods, the reeds in it trodden flat. Each step in the drift kicks snow up. A trodden trail is firm
going, so following someone is easier than breaking trail. Roads are firm. Falling snow fills old
tracks back in over a few minutes.

The snow in the air rides one wind (`gfx/wind.ts`): flakes streak along it, a few big ones pass
the lens, and in the gusts it lifts off the ground and blows along it knee-high. In a blizzard the
near air itself goes white in sheets the wind carries past. Breath steams in front of every face.
Over the shoulder the camera rides steady: the body does the moving. It sits close, after Crimson
Desert's framing: 3.5 m behind, a little above the head and to the right, on a longer lens (62°
against 70° through the eyes), so the survivor stands just left of centre and low, the whole body in
frame with the feet just above the bottom edge, and the world they face above them.
