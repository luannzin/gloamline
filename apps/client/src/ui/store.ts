// What the interface shows, set by the game and read by React. The game never renders UI and the UI
// never touches the world: they meet here.
import { useSyncExternalStore } from "react";
import { type Video, withPreset } from "../video";

/** `entering`: the menu's camera is moving to your shoulder (stage.ts); play starts when it lands */
export type Phase = "loading" | "menu" | "entering" | "playing";
export type Person = { id: string; name: string; seed: number; you?: boolean };
/** Someone on the map: map position (0..1, north up) and heading (radians, clockwise from north). */
export type Mark = Person & { u: number; v: number; heading: number };
/** The body, 0..1 each: full health, stamina and warmth are 1; no radiation is 0. */
export type Vitals = { health: number; stamina: number; warmth: number; rad: number };
export type Note = { id: number; text: string; tone?: "warm" | "cold" };

export type UIState = {
  phase: Phase;
  stage: string;
  progress: number;
  /** the video settings asked for (video.ts) */
  video: Video;
  /** a world detail is being rebuilt (seconds: the old one keeps drawing meanwhile) */
  videoBusy: boolean;
  /** the detection test is running (the world is held still), and what it's doing or found */
  detecting: boolean;
  detect: string | null;
  /** played once already: the menu offers to continue */
  started: boolean;
  /** the place being revealed, and a counter so the same place can reveal twice */
  area: { name: string; ru: string; key: number } | null;
  party: Person[];
  invite: string | null;
  full: boolean;
  stats: string | null;
  error: string | null;
  /** the map (a data URL, drawn once from the world) and the place names on it */
  mapImage: string | null;
  mapLabels: { name: string; u: number; v: number }[];
  mapOpen: boolean;
  vitals: Vitals;
  /** the feed above the minimap, newest last */
  notes: Note[];
};

let state: UIState = {
  phase: "loading",
  stage: "Waking up…",
  progress: 0,
  // (the game sets the saved settings before anything shows them)
  video: withPreset({ dynamic: true, fps: 0 } as Video, 2),
  videoBusy: false,
  detecting: false,
  detect: null,
  started: false,
  area: null,
  party: [],
  invite: null,
  full: false,
  stats: null,
  error: null,
  mapImage: null,
  mapLabels: [],
  mapOpen: false,
  vitals: { health: 1, stamina: 1, warmth: 1, rad: 0 },
  notes: [],
};
const listeners = new Set<() => void>();
let noteId = 0;

export const ui = {
  get: () => state,
  set(patch: Partial<UIState>) {
    state = { ...state, ...patch };
    for (const l of listeners) l();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Adds a line to the feed; it leaves on its own after 4 s. */
  note(text: string, tone?: Note["tone"]) {
    const n = { id: ++noteId, text, tone };
    ui.set({ notes: [...state.notes.slice(-3), n] });
    setTimeout(() => ui.set({ notes: state.notes.filter((x) => x !== n) }), 4000);
  },
  /**
   * Written by the game every frame and read by the HUD in its own animation frame, so the minimap
   * turns at the display's rate without a React render per frame. `others` changes ten times a second.
   */
  live: {
    me: { u: 0.5, v: 0.5, heading: 0 },
    others: [] as Mark[],
    /** the Column on the map, and how far it is (m) */
    goal: { u: 0.5, v: 0, dist: 0 },
  },
  /** Filled in by the game once it can act on them. */
  actions: {
    enter: () => {},
    invite: () => {},
    video: (_v: Video) => {},
    /** times the presets here and keeps the best this machine holds */
    detect: () => {},
    /** the intro is fading: the camera arrives into the menu's shot (stage.ts) */
    arrive: () => {},
  },
};

export function useUI() {
  return useSyncExternalStore(ui.subscribe, ui.get);
}
