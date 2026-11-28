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
| Body | A broad man of about 1.82 m (MPFB's human, CC0), never seen bare: every garment is cut from his own surface | MPFB's `cmu_mb` skeleton (31 bones and the lantern's), its weights |
| Telogreika | Quilted cotton coat cut at the waist, its skirt hanging to mid-thigh, vertical channels on the body and rings round the sleeves, turned-back cuffs, a stand-up collar, a patch on the left elbow | Skinned; the hem and the collar take the wind |
| Trousers | Quilted ватные trousers tucked into the boots | Skinned |
| Boots | Kirza boots to below the knee, wide at the shaft, creased at the ankle, rubber soles | Skinned |
| Belt | A leather belt laid round the coat, a brass buckle, two cartridge pouches, a canteen, the gas-mask bag on its strap across the chest | Skinned with the coat |
| Gloves | Leather palms, knitted backs | Skinned to the hands |
| Balaclava | Wool over the head and face, the eyes showing in its slit | Skinned to the head |

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

The cloth is dyed, worn and dirtied, never clean: a weave in it, paler where it's worn, dirtier low
down where it's been through the snow and mud. The coat is a workwear dye leaning a quarter of the way
toward the player's party colour (their HUD colour), so a friend reads at a distance; the rest is
chosen from the seed out of tones that sit together.

| Part | Tones a seed picks from |
|---|---|
| Coat | olive, field grey, faded navy, brown, black (each leaning toward the party colour) |
| Trousers | soot, field grey, faded navy |
| Fur | black, brown, grey wolf |
| Scarf | oxblood, mustard, grey, moss |
| Pack | olive canvas, tan canvas, black rubberised |

Skin shows only round the eyes in the balaclava's slit; the gas mask's glass and the goggles take
the light.

### Animation

Motion capture from the CMU database (free for any use), retargeted onto the skeleton by
`tools/blender/mocap.py`, each clip one looped cycle, on the spot:

| Clip | Capture | When |
|---|---|---|
| `idle` | 77_02, standing | Still |
| `cold` | 79_68, "cold" | Still and freezing: hunched, shivering, blowing into the hands |
| `walk` | 16_15, walk | Firm ground, 1.9 m/s |
| `run` | 16_45, run | 4.6 m/s, the free arm pumping |
| `trudge` | 08_04, slow walk, made a trudge: each knee pulled high out of the drift, leaning in, the hips sunk | Deep snow, about 1 m/s |

The right arm holds the lantern out in each. In the game the clips' phase is the ground covered (so
the feet keep pace with the body), and their weights follow the speed, the snow and the cold. On top
of them: the lantern swings on its own bone as a damped pendulum (the hand's movement and the wind),
the head follows where you look, the body shivers when freezing, the feet sink into deep snow and the
trench they plough stays behind.

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
