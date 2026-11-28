// The video settings: a level for each detail (what each level does is in the system that reads it),
// the resolution scale, dynamic resolution and the frame-rate cap. A preset sets every detail and a
// scale; the scale, dynamic resolution and the cap can then be moved without leaving the preset.
// Plain data: the game applies it (main.ts), the settings screen edits it (ui/app.tsx).

export type Details = {
  /** temporal upscaling (TAAU): 0 off (the canvas itself is scaled), 1 on */
  aa: number;
  /** the sun's shadow map: 1024, 2048, 2048 with long shadows over the land, 4096 over a wider box */
  shadows: number;
  /** how far trees, rocks and reeds are drawn, and how far they keep their detail */
  distance: number;
  /** 0 none, then further and thicker */
  grass: number;
  /** ambient occlusion: 0 off, 6, 12 or 16 samples */
  ao: number;
  /** sun shafts: 0 off, 20, 40 or 60 steps */
  shafts: number;
  /** contact shadows: 0 off, 1 on, 2 finer */
  contact: number;
  /** depth of field: 0 off, 1 the world past the body a little soft */
  dof: number;
  /** the water's mirror: 0 off, at a third or at half the screen's resolution */
  reflections: number;
  /** the sky as image-based light: 0 a flat hemisphere, 1 on */
  sky: number;
  /** snow, ash and embers in the air: 0 half, 1 all */
  effects: number;
  /** the foliage atlas: 0 512 px cells, 1 1024 px */
  textures: number;
};

export type Video = Details & {
  /** share of the display's own pixels the scene renders, 0.33..2 (over 1 renders more and scales down) */
  scale: number;
  /** lowers the scale (to half, never under 33%) to hold the frame rate */
  dynamic: boolean;
  /** frames per second at most, 24..240; 0 is the display's own rate */
  fps: number;
};

export const SCALE_MIN = 0.33,
  SCALE_MAX = 2,
  FPS_MIN = 24,
  FPS_MAX = 240;

export const PRESET_NAMES = ["Low", "Medium", "High", "Ultra"];
/** The resolution scale each preset starts at. */
const PRESET_SCALES = [0.6, 0.8, 1, 1];

/**
 * Each detail as the settings screen shows it: its name, its levels, what it does, and its level in
 * each preset (Low, Medium, High, Ultra).
 */
export const DETAILS: {
  key: keyof Details;
  label: string;
  levels: string[];
  hint: string;
  presets: number[];
}[] = [
  {
    key: "aa",
    label: "Upscaling",
    levels: ["Off", "Temporal"],
    hint: "Rebuilds a sharp full-resolution image from the last frames. Off scales the canvas instead.",
    presets: [0, 1, 1, 1],
  },
  {
    key: "shadows",
    label: "Shadows",
    levels: ["Low", "Medium", "High", "Ultra"],
    hint: "The sun's shadow map.",
    presets: [0, 1, 2, 3],
  },
  {
    key: "distance",
    label: "View distance",
    levels: ["Low", "Medium", "High", "Ultra"],
    hint: "How far trees and rocks are drawn, and keep their detail.",
    presets: [0, 1, 2, 3],
  },
  {
    key: "grass",
    label: "Grass",
    levels: ["Off", "Low", "Medium", "High"],
    hint: "How far it reaches, how thick.",
    presets: [0, 1, 2, 3],
  },
  {
    key: "ao",
    label: "Ambient occlusion",
    levels: ["Off", "Low", "Medium", "High"],
    hint: "Soft shade in corners and under things.",
    presets: [0, 1, 2, 3],
  },
  {
    key: "shafts",
    label: "Sun shafts",
    levels: ["Off", "Low", "Medium", "High"],
    hint: "Light marched through the air.",
    presets: [0, 1, 2, 3],
  },
  {
    key: "contact",
    label: "Contact shadows",
    levels: ["Off", "On", "Fine"],
    hint: "The short shadows under stones and at the foot of walls, close by. Grainy on snow slopes.",
    // (off in every preset: on snow their screen-space march leaves pepper and stair-steps)
    presets: [0, 0, 0, 0],
  },
  {
    key: "dof",
    label: "Depth of field",
    levels: ["Off", "On"],
    hint: "Past your survivor the world goes a little soft, as through a lens.",
    presets: [0, 1, 1, 1],
  },
  {
    key: "reflections",
    label: "Reflections",
    levels: ["Off", "Low", "High"],
    hint: "The water's mirror.",
    presets: [0, 1, 2, 2],
  },
  {
    key: "sky",
    label: "Sky lighting",
    levels: ["Flat", "Full"],
    hint: "The sky itself as the light that fills the shade.",
    presets: [0, 1, 1, 1],
  },
  {
    key: "effects",
    label: "Weather",
    levels: ["Light", "Full"],
    hint: "Snow, ash and embers in the air.",
    presets: [0, 0, 1, 1],
  },
  {
    key: "textures",
    label: "Foliage textures",
    levels: ["Low", "High"],
    hint: "The leaves' and needles' atlas.",
    presets: [0, 1, 1, 1],
  },
];

const KEYS = DETAILS.map((d) => d.key);
/** The details the lens reads (gfx/post.ts): a change rebuilds only the lens, at once. */
export const LENS: (keyof Details)[] = ["aa", "ao", "shafts", "contact", "dof"];
/** The rest: a change rebuilds what's drawn in the world, compiled beside what's showing (main.ts). */
export const DRESS = KEYS.filter((k) => !LENS.includes(k));

export const differ = (a: Details, b: Details, keys: (keyof Details)[]) => keys.some((k) => a[k] !== b[k]);

/** The preset every detail matches, or -1 (custom). */
export const presetOf = (v: Details) =>
  PRESET_NAMES.findIndex((_, p) => DETAILS.every((d) => d.presets[p] === v[d.key]));

/** `v` with every detail and the scale of preset `p`. */
export const withPreset = (v: Video, p: number): Video => ({
  ...v,
  ...Object.fromEntries(DETAILS.map((d) => [d.key, d.presets[p]])),
  scale: PRESET_SCALES[p],
});

/** Settings saved in this browser, else the preset `first` (a first visit's guess). */
export function loadVideo(first: number): Video {
  const base = withPreset({ dynamic: true, fps: 0 } as Video, first);
  try {
    // (saves from before contact shadows went off by default are read without that detail)
    const current = localStorage.getItem(KEY);
    const saved = JSON.parse(current ?? localStorage.getItem("video") ?? "null");
    if (saved && typeof saved === "object" && current === null) delete saved.contact;
    if (saved && typeof saved === "object") {
      const v = { ...base, ...saved } as Video;
      // (saves from before depth of field keep the preset they matched: on, unless that was Low)
      if (!("dof" in saved)) {
        v.dof = 1;
        if (presetOf(v) < 0) v.dof = 0;
      }
      // anything out of range (an older save, a hand edit) falls back to the preset's
      for (const d of DETAILS)
        if (!Number.isInteger(v[d.key]) || v[d.key] < 0 || v[d.key] >= d.levels.length)
          v[d.key] = base[d.key];
      if (!(v.scale >= SCALE_MIN && v.scale <= SCALE_MAX)) v.scale = base.scale;
      if (v.fps !== 0 && !(v.fps >= FPS_MIN && v.fps <= FPS_MAX)) v.fps = 0;
      v.dynamic = v.dynamic !== false;
      return v;
    }
  } catch {
    // unreadable: start from the guess
  }
  return base;
}

const KEY = "video.2";
export const saveVideo = (v: Video) => localStorage.setItem(KEY, JSON.stringify(v));
