// Names in the lines' 5x7 pixel face, one rect per font pixel. The ten glyphs the lines use are
// copied from `lines/src/components/line/pixel-name.tsx`; the rest of the alphabet is drawn here in
// the same grid so area names can use it.
const FONT: Record<string, string> = {
  A: ".###.#...##...#######...##...##...#",
  B: "####.#...##...#####.#...##...#####.",
  C: ".###.#...##....#....#....#...#.###.",
  D: "####.#...##...##...##...##...#####.",
  E: "######....#....####.#....#....#####",
  F: "######....#....####.#....#....#....",
  G: ".###.#...##....#.####...##...#.####",
  H: "#...##...##...#######...##...##...#",
  I: ".###...#....#....#....#....#...###.",
  J: "..###...#....#....#....##..#..##...",
  K: "#...##..#.#.#..##...#.#..#..#.#...#",
  L: "#....#....#....#....#....#....#####",
  M: "#...###.###.#.##.#.##...##...##...#",
  N: "#...###..##.#.##..###...##...##...#",
  O: ".###.#...##...##...##...##...#.###.",
  P: "####.#...##...#####.#....#....#....",
  R: "####.#...##...#####.#.#..#..#.#...#",
  S: ".#####....#.....###.....#....#####.",
  T: "#####..#....#....#....#....#....#..",
  U: "#...##...##...##...##...##...#.###.",
  V: "#...##...##...##...##...#.#.#...#..",
  W: "#...##...##...##.#.##.#.##.#.#.#.#.",
  Y: "#...##...#.#.#...#....#....#....#..",
  " ": "...................................",
};

/** Draws `name`; its width follows the font size (7 rows = the cap height). */
export function PixelName({ name, className }: { name: string; className?: string }) {
  const letters = name
    .toUpperCase()
    .split("")
    .filter((c) => FONT[c]);
  const width = letters.length * 6 - 1;
  return (
    <svg
      viewBox={`0 0 ${width} 7`}
      shapeRendering="crispEdges"
      fill="currentColor"
      role="img"
      aria-label={name}
      className={className}
      style={{ width: `${width / 7}em`, maxWidth: "100%", height: "auto", aspectRatio: `${width} / 7` }}
    >
      {letters.flatMap((ch, i) =>
        [...FONT[ch]].map((cell, j) =>
          cell === "#" ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed glyph grid
            <rect key={`${i}-${j}`} x={i * 6 + (j % 5)} y={Math.floor(j / 5)} width="1" height="1" />
          ) : null,
        ),
      )}
    </svg>
  );
}
