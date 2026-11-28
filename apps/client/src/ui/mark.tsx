// The mark (DESIGN.md): the zimovye in a ring. A log hut under a heavy cap of snow, its window, three
// logs; nothing else. One colour (the current text's), one set of paths, 100 x 100, for the menu, the
// intro and the tab's icon.

/** A log: a bar with round ends from x0 to x1, centred on y, h thick. */
const log = (x0: number, x1: number, y: number, h: number) => {
  const r = h / 2;
  return `M${x0 + r} ${y - r}H${x1 - r}A${r} ${r} 0 0 1 ${x1 - r} ${y + r}H${x0 + r}A${r} ${r} 0 0 1 ${x0 + r} ${y - r}Z`;
};

type Part = {
  /** its class is `emblem-<name>` (the intro animates them one by one) */
  name: string;
  d: string;
  /** drawn as a line this wide, not filled */
  stroke?: number;
};

export const PARTS: Part[] = [
  // the ring, from north round to north again
  { name: "ring", d: "M50 10A40 40 0 1 1 50 90A40 40 0 1 1 50 10", stroke: 3.4 },
  // the roof under its snow: a rounded cap over the ridge, the eaves reaching past the walls
  {
    name: "roof",
    d: "M27 53.4C33.5 45.4 42 35.9 47.5 31Q50 29.2 52.5 31C58 35.9 66.5 45.4 73 53.4H66.5L50 37.4L33.5 53.4Z",
  },
  { name: "window", d: "M46.8 43.2H53.2V49.6H46.8Z" },
  // three logs, the middle one set in: the corners cross
  { name: "logs", d: log(30.5, 69.5, 58, 4.2) + log(32.5, 67.5, 63.4, 4.2) + log(30.5, 69.5, 68.8, 4.2) },
];

/** The mark, in the current text colour; the ring can be drawn on (pathLength 1). */
export function Emblem({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={className}>
      {PARTS.map((p) =>
        p.stroke ? (
          <path
            key={p.name}
            className={`emblem-${p.name}`}
            d={p.d}
            fill="none"
            stroke="currentColor"
            strokeWidth={p.stroke}
            pathLength={1}
          />
        ) : (
          <path key={p.name} className={`emblem-${p.name}`} d={p.d} fill="currentColor" />
        ),
      )}
    </svg>
  );
}

/** Puts the mark on the browser tab, frost on a soot tile (so it reads on a light tab bar too). */
export function setIcon() {
  const body = PARTS.map((p) =>
    p.stroke
      ? `<path d="${p.d}" fill="none" stroke="#e9eef2" stroke-width="${p.stroke}"/>`
      : `<path d="${p.d}" fill="#e9eef2"/>`,
  ).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#0b0d10"/>${body}</svg>`;
  const link =
    document.querySelector<HTMLLinkElement>("link[rel=icon]") ??
    document.head.appendChild(Object.assign(document.createElement("link"), { rel: "icon" }));
  link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
