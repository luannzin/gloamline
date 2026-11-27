# Characters

Who walks the district, and what lives in the white-out. The bar is Crimson Desert's: a figure you
can look at from a metre away over the shoulder in a blizzard and believe, because every layer of
what they wear is a separate thing that has weight, moves on its own and collects the weather. The
references (gitignored, in `refs/`) are listed in `docs/REFERENCES.md`.

## The survivor

Everyone plays the same person-shaped silhouette: someone who has walked this winter for months and
dresses for it in what the district had. Inspired by the zone's survivors (Metro Exodus, Misery),
never a copy of either: no faces anyone would know, no named gear.

**Read from 50 m:** a broad, padded, slightly hunched shape; a pack humped on the back with a
bedroll over it, a long barrel up over the left shoulder, a warm dot of lantern at the right hand.
**Read from 5 m:** quilted channels on the coat, fur on the hat, straps crossing the chest, the
belt's pouches. **Read from 1 m:** stitching, worn leather, frost in the fur, snow caked on every
upward surface, breath in the air.

| Layer | What it is | Moves |
|---|---|---|
| Body | 1.80 m, broad under the padding; the face is never shown bare | Skeleton (24 bones), clips from Blender |
| Telogreika | Quilted cotton jacket to the hips, vertical channels, a stand-up collar, patched at an elbow | Skinned; the hem and the collar take the wind |
| Trousers | Quilted ватные trousers tucked into the boots | Skinned |
| Boots | Kirza boots to below the knee, the leather creased at the ankle | Skinned |
| Belt | A wide leather belt over the coat, a brass buckle, two pouches, a canteen | Skinned to the hips |
| Mittens | Leather-palmed, a cord between them | Skinned to the hands |

### Gear that comes off and goes on

Each slot holds one piece (or nothing). All pieces share one skeleton, so any combination fits. A
player's loadout is drawn from their seed until there's a screen to choose it.

| Slot | Pieces |
|---|---|
| Head | Ushanka (flaps down, the tie hanging), knit cap with the hood up, padded tankist's helmet |
| Face | Wool scarf wound to the eyes, GP-type rubber gas mask with a filter can, a balaclava alone |
| Eyes | Goggles pushed up on the hat, or none |
| Back | Canvas rucksack with a bedroll, or a plain sack on a rope |
| Slung | A bolt-action rifle on its sling, a felling axe through the pack's straps, or nothing |
| Hand | The hurricane lantern (lit with `F`) |

What moves on its own, from the wind and the walk: the ushanka's flaps and their tie, the scarf's
tail, the coat's hem, every loose strap end, the bedroll's cords, the lantern on its bail (a
pendulum on its own bone). The wind is one field (`gfx/wind.ts`): the same gust that bends the
reeds lifts the scarf.

What the weather does to them: snow builds on everything that faces the sky while it falls (the
hat, the shoulders, the pack, the tops of the boots) and melts off by the lantern, under rock or
indoors; frost greys the fur; breath steams every few seconds, quicker when out of breath.

### Colour: one survivor, eight people

The cloth is dyed, worn and dirtied, never clean. The coat takes the player's party colour (their
HUD colour), dulled to a winter dye; the rest is chosen from the seed out of tones that sit together.

| Variant | Coat | Trousers | Fur | Scarf | Pack |
|---|---|---|---|---|---|
| Party colour | the HUD colour at 15 to 20% value | — | — | — | — |
| Seed tones (any) | — | soot, field grey, faded navy | black, brown, grey wolf | oxblood, mustard, grey, moss | olive canvas, tan canvas, black rubberised |

Skin is never seen; the gas mask's glass and the goggles take the light.

### Animation

Clips authored in `tools/blender/survivor.py` and blended in the game by speed and snow depth:

| Clip | When |
|---|---|
| `idle` | Still: breathing, weight shifting foot to foot, the lantern held out, looking about |
| `walk` | 1.4 m/s on firm ground |
| `run` | 5 to 7 m/s, the lantern swinging, the free arm pumping |
| `trudge` | Deep snow: high knees, each step pulled out of the drift, the body leaning in, arms out for balance |
| `jump` | Up and land |

On top of the clips, in the game: the body leans into turns and into the wind, the head turns toward
where the camera looks, the feet sink into deep snow and the trench they plough stays behind.

## The creature: Shatun

Шатун is what Russians call a bear that woke in the middle of winter and can't go back to sleep: it
walks the snow, starving, and kills what it meets. This one was something else before the flash.

**Silhouette:** a pale giant, 3.6 m standing and twice a man's width, that moves on its knuckles
and rises to its full height to look at you. Long arms that reach the snow, a short neck sunk into
a hump of shoulder. A stag's antlers, enormous and branching wide, grown out through its own skull.

**Detail:** white-grey fur, long, matted and frozen into ropes, darker at the hands and feet; snow
caked on the back. Where the antlers broke through, the hide is torn open: raw red flesh around
their roots, strips of skin and velvet hanging from the tines, dried blood down the face. The face
itself is barely there: a skull showing through red meat, the jaw heavy, teeth too many. The chest
is bare grey-pink skin, scarred. Hands like a man's, the fingers too long, black nails.

**How it shows itself:** in the white-out, never in clear air. A shape that could be a snowbank
until it stands. Heard before seen: a low exhale, antlers knocking branches.

**References:** `refs/creature/` (Crimson Desert's White Horn: the pale mass, the antlers through
the skull, the red flesh against white fur). Take the proportions and the colour story; the design
above is our own and changes the anatomy, the face and the way it moves.

Not built yet: it comes with combat (docs/PLAN.md, phase 3).
