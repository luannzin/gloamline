// What the interface shows, set by the game and read by React. The game never renders UI and the UI
// never touches the world: they meet here.
import { useSyncExternalStore } from "react";

export type Phase = "loading" | "menu" | "playing";
export type Person = { id: string; name: string; seed: number; you?: boolean };

export type UIState = {
  phase: Phase;
  stage: string;
  progress: number;
  quality: number;
  /** the area name being revealed, and a counter so the same area can reveal twice */
  area: { name: string; key: number } | null;
  party: Person[];
  invite: string | null;
  full: boolean;
  stats: string | null;
  error: string | null;
};

let state: UIState = {
  phase: "loading",
  stage: "Waking up…",
  progress: 0,
  quality: 2,
  area: null,
  party: [],
  invite: null,
  full: false,
  stats: null,
  error: null,
};
const listeners = new Set<() => void>();

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
  /** Filled in by the game once it can act on them. */
  actions: {
    enter: (_name: string) => {},
    invite: () => {},
    quality: (_q: number) => {},
  },
};

export function useUI() {
  return useSyncExternalStore(ui.subscribe, ui.get);
}
