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

A log hut's gable with smoke standing from the ridge: someone is wintering there, and the smoke is
the Column. Soot or frost for the hut, ember for the smoke, always; next to it ZIMOVYE in Oswald 600,
and under it «Зимовье · зима после вспышки» tracked wide.

## The world is the menu

- The game runs behind every screen. The splash (faceta's, in this winter) is a field of snow with
  the mark and the name cut in, snow blowing across on the wind, what's being built and how far in
  the corner, a tip opposite, the real progress as a line along the bottom. When the world is ready
  the field is cut away along a slant, showing it.
- The menu is a shot of you standing in the world, kept sharp: from behind and to the left of your
  survivor, the lantern lit, looking out at what they face, so they stand in the right third. The
  camera breathes and leans toward the pointer; the first time, it arrives from high and further
  back. The words sit bottom-left in the HUD's type over the world, no panel, with only the cold
  pooling under them: Enter the zone, Invite friends, Settings.
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

Look: mouse. Move: `W` `A` `S` `D`. Run: `Shift` (uses stamina). Jump: `Space`. Lantern: `F` (warms you,
slowly; lit to begin with). View: `V` (over the shoulder, where play starts, or first person). Map: `Tab`. Menu: `Esc`. Viewpoints: `1` to
`9`. Stats: `H`.

## Deep snow

Snow that lies thick enough slows a walk to a trudge (a third of the pace, a higher, slower step) and
makes running cost more breath. Everyone's feet leave a trail in it: a trench ploughed where the body
went, a print at each step, a rim of snow pushed aside, the reeds in it trodden flat. Roads and
trodden trails are firm. Falling snow fills old tracks back in over a few minutes.
