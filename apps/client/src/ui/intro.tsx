// The intro (DESIGN.md): a studio card, white on black, then the title in the winter air while the
// world builds. Three slanted planes of air arrive on the wind and drift, each paler than the last;
// snow blows past at three depths; the mark draws itself (the ring round from north, the hut settling
// into it, its window lit) and the name comes out of it either side, ZIMO and VYE. Along the bottom:
// what's being built, the real progress, and a tip. When the world is ready the window lights warm,
// and the planes are carried off on the wind onto it. Any key or click skips the studio card, and
// the title once the world is ready. What moves is opacity and the transforms the compositor runs,
// so it keeps moving while the main thread builds the world.
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { Emblem } from "./mark";

/** ms the title shows at least: long enough for the mark to draw and the name to come out */
const TITLE_MIN = 2800;

const TIPS = [
  "The lantern warms you, slowly. F lights it and puts it out.",
  "Deep snow slows you to a trudge. Roads and trodden trails are firm.",
  "The Column is the way home: the ember mark on the minimap, with the distance to it.",
  "Running in the cold spends your breath fast. Walk when you can.",
  "Falling snow fills old tracks back in over a few minutes.",
  "Tab opens the map. V moves the camera between your shoulder and your eyes.",
];

// snow blowing past at three depths, a fixed scatter: far flakes small, dim and slow, near ones large,
// soft and quick (most of them far)
const FLAKES = Array.from({ length: 44 }, (_, i) => {
  const h = (k: number) => Math.abs((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1);
  const z = h(2) ** 1.7;
  return {
    "--x": `${(h(1) * 135).toFixed(1)}vw`,
    "--s": `${(1.2 + z * 5).toFixed(1)}px`,
    "--o": (0.16 + z * 0.5).toFixed(2),
    "--b": `${z > 0.6 ? ((z - 0.6) * 6).toFixed(1) : 0}px`,
    "--t": `${(16 - z * 10).toFixed(1)}s`,
    "--delay": `${(-h(3) * 16).toFixed(1)}s`,
  } as CSSProperties;
});

/** One side of the name: its letters come out of the mark, the nearest first. */
function Side({ text, left }: { text: string; left: boolean }) {
  return (
    <span className={`flex ${left ? "justify-self-end" : "justify-self-start"}`}>
      {[...text].map((ch, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed word
          key={i}
          className="intro-letter mx-[0.2em]"
          style={{ "--d": left ? text.length - 1 - i : i } as CSSProperties}
        >
          {ch}
        </span>
      ))}
    </span>
  );
}

/** A tip about surviving the district, the next one every few seconds. */
function Tip() {
  const [i, setI] = useState(() => Math.floor(Math.random() * TIPS.length));
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % TIPS.length), 7000);
    return () => clearInterval(t);
  }, []);
  return (
    <p
      key={i}
      className="intro-swap m-0 hidden max-w-[44ch] text-balance text-right text-frost-soft text-sm leading-relaxed sm:block"
    >
      {TIPS[i]}
    </p>
  );
}

type Step = "studio" | "title" | "leaving";

export function Intro({
  stage,
  progress,
  error,
  done,
  onLeave,
  onGone,
}: {
  stage: string;
  progress: number;
  error: string | null;
  /** the world is built: the title may go */
  done: boolean;
  /** the cut onto the world begins (the menu and the camera's arrival start with it) */
  onLeave: () => void;
  onGone: () => void;
}) {
  const [step, setStep] = useState<Step>("studio");
  const titleAt = useRef(0);
  const go = (next: Step) => {
    if (next === "title") titleAt.current = performance.now();
    if (next === "leaving") onLeave();
    setStep(next);
  };
  // any key or click: past the studio card, and past the title once there's a world to show
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-binds with what a skip does
  useEffect(() => {
    const skip = () => {
      if (step === "studio") go("title");
      else if (step === "title" && done && !error) go("leaving");
    };
    addEventListener("keydown", skip);
    addEventListener("pointerdown", skip);
    return () => {
      removeEventListener("keydown", skip);
      removeEventListener("pointerdown", skip);
    };
  }, [step, done, error]);
  // the world is ready: the title goes once it has shown for long enough
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs as the step and the world change
  useEffect(() => {
    if (step !== "title" || !done || error) return;
    const t = setTimeout(() => go("leaving"), Math.max(0, TITLE_MIN - (performance.now() - titleAt.current)));
    return () => clearTimeout(t);
  }, [step, done, error]);
  const pct = Math.round(progress * 100);
  const ready = done && !error;
  return (
    <section
      aria-label="Zimovye"
      className={`intro fixed inset-0 grid place-items-center overflow-hidden ${step !== "studio" ? "has-title" : ""} ${ready ? "is-ready" : ""} ${step === "leaving" ? "is-leaving" : ""}`}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && step === "leaving") onGone();
      }}
    >
      <div className="intro-facets" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <b key={i} className="intro-facet">
            <i />
          </b>
        ))}
      </div>
      <div className="intro-snow" aria-hidden="true">
        {FLAKES.map((style, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed scatter
          <i key={i} style={style} />
        ))}
      </div>
      {step === "studio" ? (
        <p
          className="intro-studio relative m-0 mr-[-0.62em] font-display text-[clamp(16px,2.1vw,30px)] text-white uppercase tracking-[0.62em]"
          onAnimationEnd={(e) => e.target === e.currentTarget && go("title")}
        >
          By Luan
        </p>
      ) : (
        <div className="relative flex w-full flex-col items-center gap-10 px-6">
          <h1
            aria-label="Zimovye"
            className="intro-title m-0 grid w-full max-w-[1400px] grid-cols-[1fr_auto_1fr] items-center font-display font-normal text-[clamp(24px,4.4vw,64px)] text-frost uppercase leading-none"
          >
            <Side text="Zimo" left />
            <Emblem className="intro-emblem mx-[0.6em] size-[2.6em]" />
            <Side text="Vye" left={false} />
          </h1>
          {error && (
            <p
              className="m-0 flex max-w-[60ch] flex-wrap items-baseline justify-center gap-x-4 gap-y-1 text-center text-frost-soft text-sm"
              role="alert"
            >
              {error}
              <button
                type="button"
                className="cursor-pointer font-display font-semibold text-frost uppercase tracking-[0.14em] underline underline-offset-4"
                onClick={() => location.reload()}
              >
                Reload page
              </button>
            </p>
          )}
        </div>
      )}
      {!error && (
        <footer className="intro-foot absolute inset-x-0 bottom-0 flex flex-col gap-5">
          <div className="flex items-end justify-between gap-10 px-[clamp(24px,5vw,64px)]">
            <p className="m-0 flex min-w-0 items-baseline gap-3 whitespace-nowrap font-display text-sm uppercase tracking-[0.16em]">
              <span key={ready ? "ready" : stage} className="intro-swap truncate text-frost-soft">
                {ready ? "The zone is ready" : stage}
              </span>
              <span className="text-frost tabular-nums">{pct}%</span>
            </p>
            <Tip />
          </div>
          <div
            className="intro-bar relative h-0.5 bg-frost/10"
            role="progressbar"
            aria-label="Building the world"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={`${stage} ${pct}%`}
          >
            <i style={{ transform: `translateX(${(progress - 1) * 100}%)` }} />
          </div>
        </footer>
      )}
    </section>
  );
}
