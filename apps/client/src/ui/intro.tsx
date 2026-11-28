// The intro (DESIGN.md): a studio card, white on black, then the title the same way while the world
// builds: the mark draws itself (the ring round from north, the hut settling into it, its window lit)
// and the name comes out of it either side, ZIMO and VYE; along the very bottom, a white hairline of
// the real progress. Nothing else. When the world is ready the window lights warm and the black fades
// onto the world. Any key or click skips the studio card, and the title once the world is ready. What
// moves is opacity and the transforms the compositor runs, so it keeps moving while the main thread
// builds the world.
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { Emblem } from "./mark";

/** ms the title shows at least: long enough for the mark to draw and the name to come out */
const TITLE_MIN = 2800;

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
            className="intro-title m-0 grid w-full max-w-[1400px] grid-cols-[1fr_auto_1fr] items-center font-display font-normal text-[clamp(24px,4.4vw,64px)] text-white uppercase leading-none"
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
                className="cursor-pointer font-display font-semibold text-white uppercase tracking-[0.14em] underline underline-offset-4"
                onClick={() => location.reload()}
              >
                Reload page
              </button>
            </p>
          )}
        </div>
      )}
      {!error && (
        <div
          className="intro-bar absolute inset-x-0 bottom-0 h-0.5 bg-white/10"
          role="progressbar"
          aria-label="Building the world"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={`${ready ? "The zone is ready" : stage} ${pct}%`}
        >
          <i style={{ transform: `translateX(${(progress - 1) * 100}%)` }} />
        </div>
      )}
    </section>
  );
}
