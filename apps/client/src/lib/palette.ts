// The lines' world (copied from Sightline's `src/lib/palette.ts`): luannzin.com's dusk, sky to
// horizon, over the night, in a 4x4 Bayer ordered dither.

export const NIGHT = "#110d24";
export const DUSK = ["#3a2a6b", "#7a3361", "#e0703f", "#ffd180"] as const;
/** Outlines, as in the mark. */
export const LINE = "#1a1424";
export const WHITE = "#e8e4f0";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** The Bayer threshold of cell (col, row), 0 to 15/16. */
export function bayer(col: number, row: number) {
  return BAYER[(row % 4) * 4 + (col % 4)] / 16;
}

/** Which of `n` colours along a ramp cell (col, row) takes at position t (0..1), dithered. */
export function dither(n: number, t: number, col: number, row: number) {
  return Math.max(0, Math.min(n - 1, Math.round(t * (n - 1) + bayer(col, row) - 0.5)));
}
