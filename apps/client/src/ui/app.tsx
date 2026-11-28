// Splash, menu and HUD over the running world (DESIGN.md). The splash is a field of snow with the
// wordmark cut into it, cut away along a slant when the world is built; the menu is a few words in
// the bottom-left over the live shot of you standing in the world; the HUD says nothing until it
// matters, then says it at a glance from a corner: status top-left, the party top-right, the
// minimap and the feed bottom-left, the place you've entered in the middle for a moment.
import { Flame, Footprints, Heart, Radiation, Snowflake } from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { partyColor } from "@/lib/party";
import {
  DETAILS,
  FPS_MAX,
  FPS_MIN,
  PRESET_NAMES,
  presetOf,
  SCALE_MAX,
  SCALE_MIN,
  type Video,
  withPreset,
} from "../video";
import { type Person, ui, useUI, type Vitals } from "./store";

const shadow = "[text-shadow:0_1px_8px_rgb(0_0_0/0.85)]";

export function App() {
  const s = useUI();
  // the splash stays over everything until its cut has played
  const [splash, setSplash] = useState(true);
  return (
    <>
      {(s.phase === "menu" || s.phase === "entering") && <Menu leaving={s.phase === "entering"} />}
      {s.phase === "playing" && <Hud />}
      {s.phase === "playing" && s.mapOpen && <WorldMap />}
      {splash && (
        <Splash
          stage={s.stage}
          progress={s.progress}
          error={s.error}
          done={s.phase !== "loading"}
          onGone={() => setSplash(false)}
        />
      )}
    </>
  );
}

/** The mark: a log hut's gable with smoke standing from the ridge (the zimovye, and the Column). */
function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <path className="mark-smoke" d="M29 21 L35 21 L39 0 L25 0 Z" fill="var(--color-ember)" />
      <path
        className="mark-roof"
        d="M6 42 L32 21 L58 42"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinejoin="miter"
        pathLength={1}
      />
      <path
        className="mark-logs"
        d="M14 50.5 H50 M19 59 H45"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        pathLength={1}
      />
    </svg>
  );
}

/** The mark and the name, sized by the font size it's given; `intro` plays the cut-in. */
function Wordmark({
  className = "",
  sub = "",
  intro = false,
}: {
  className?: string;
  sub?: string;
  intro?: boolean;
}) {
  return (
    <hgroup className={`m-0 flex items-center gap-[0.28em] ${intro ? "wordmark-intro" : ""} ${className}`}>
      <Mark className="size-[1.15em] shrink-0" />
      <div className="flex flex-col gap-[0.14em]">
        <h1 className="wordmark-word m-0 font-display font-semibold text-[1em] uppercase leading-[0.86] tracking-[0.06em]">
          Zimovye
        </h1>
        <p
          className={`wordmark-sub m-0 font-display text-[max(12px,0.2em)] uppercase tracking-[0.32em] ${sub}`}
          lang="ru"
        >
          Зимовье · зима после вспышки
        </p>
      </div>
    </hgroup>
  );
}

const TIPS = [
  "The lantern warms you, slowly. F lights it and puts it out.",
  "Deep snow slows you to a trudge. Roads and trodden trails are firm.",
  "The Column is the way home: the ember mark on the minimap, with the distance to it.",
  "Running in the cold spends your breath fast. Walk when you can.",
  "Falling snow fills old tracks back in over a few minutes.",
  "Tab opens the map. V moves the camera between your shoulder and your eyes.",
];

/**
 * The splash (faceta's, in this winter): a field of snow, the wordmark cut into it, snow blowing
 * across, the real progress as a line along the bottom. When the world is built the field is cut
 * away along a slant, showing it.
 */
function Splash({
  stage,
  progress,
  error,
  done,
  onGone,
}: {
  stage: string;
  progress: number;
  error: string | null;
  done: boolean;
  onGone: () => void;
}) {
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  const pct = Math.round(progress * 100);
  return (
    <section
      aria-label="Zimovye"
      className={`splash fixed inset-0 grid place-items-center overflow-hidden text-soot ${done ? "is-leaving" : ""}`}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && done) onGone();
      }}
    >
      <div className="splash-snow absolute inset-0" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed set of streaks
          <i key={i} style={{ "--i": i } as CSSProperties} />
        ))}
      </div>
      <Wordmark intro className="relative text-[clamp(52px,9vw,128px)]" sub="opacity-70" />
      <footer className="absolute inset-x-8 bottom-8 flex items-end justify-between gap-10 sm:inset-x-12">
        {error ? (
          <p className="m-0 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm" role="alert">
            {error}
            <button
              type="button"
              className="cursor-pointer font-display font-semibold uppercase tracking-[0.14em] underline underline-offset-4"
              onClick={() => location.reload()}
            >
              Reload page
            </button>
          </p>
        ) : (
          <>
            <p className="m-0 font-display font-semibold text-sm uppercase tabular-nums tracking-[0.14em]">
              {stage} · {pct}%
            </p>
            <p className="m-0 hidden max-w-[46ch] text-balance text-right text-sm opacity-75 sm:block">
              {tip}
            </p>
          </>
        )}
      </footer>
      {!error && (
        <div
          className="absolute inset-x-0 bottom-0 h-1 bg-soot/15"
          role="progressbar"
          aria-label="Building the world"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={`${stage} ${pct}%`}
        >
          <i
            className="block h-full origin-left bg-soot transition-transform duration-300 ease-out"
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
      )}
    </section>
  );
}

const CONTROLS: [string[], string][] = [
  [["Mouse"], "Look"],
  [["W", "A", "S", "D"], "Move"],
  [["Shift"], "Run (spends stamina)"],
  [["Space"], "Jump"],
  [["F"], "Lantern (warms you, slowly)"],
  [["V"], "View: over the shoulder or first person"],
  [["Tab"], "Map"],
  [["Esc"], "Menu"],
  [["1", "9"], "Viewpoints"],
  [["H"], "Frame rate and render scale"],
];

/**
 * The menu: a few words bottom-left over the live shot, in the HUD's type, no panel. Arrows and
 * the pointer choose, Enter takes; the chosen line flicks before the menu leaves and the camera
 * moves to your shoulder (stage.ts). Settings opens over everything.
 */
function Menu({ leaving }: { leaving: boolean }) {
  const s = useUI();
  const [sel, setSel] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  // the first time, the words wait for the splash's cut and the camera's arrival
  const [first] = useState(() => !ui.get().started);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const invite = async () => {
    if (!ui.get().invite) ui.actions.invite();
    const link = ui.get().invite;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setNote("Link copied");
    } catch {
      setNote("The link is in the address bar");
    }
    setTimeout(() => setNote(null), 2200);
  };
  const items: { label: string; run: () => void }[] = [
    { label: s.started ? "Continue" : "Enter the zone", run: () => ui.actions.enter() },
    { label: note ?? (s.invite ? "Copy invite link" : "Invite friends"), run: () => void invite() },
    { label: "Settings", run: () => setSettings(true) },
  ];

  // focus the first line, and the settings line again on coming back from them
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when settings open or close
  useEffect(() => {
    if (!settings) refs.current[sel]?.focus({ preventScroll: true });
  }, [settings]);
  // the keyboard works with nothing focused too (after a click on the world); in the settings, Esc
  // comes back here
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-binds with what the keys act on
  useEffect(() => {
    if (leaving) return;
    const onKey = (e: KeyboardEvent) => {
      if (settings) {
        if (e.key === "Escape" && !ui.get().detecting) setSettings(false);
        return;
      }
      const focused = refs.current.indexOf(document.activeElement as HTMLButtonElement);
      const at = focused < 0 ? sel : focused;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        refs.current[(at + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
      } else if (e.key === "Enter" && focused < 0) {
        e.preventDefault();
        items[at].run();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [leaving, sel, settings, s.started, s.invite, note]);

  if (settings) return <Settings onClose={() => setSettings(false)} />;

  const edge = "clamp(28px, 5vw, 72px)",
    foot = "clamp(28px, 8vh, 80px)";
  return (
    <main className={`menu-shell fixed inset-0 ${leaving ? "is-leaving pointer-events-none" : ""}`}>
      <div
        className={`menu absolute flex flex-col gap-[clamp(24px,5vh,44px)] ${first ? "menu-first" : ""}`}
        style={{ left: edge, bottom: foot }}
      >
        <Wordmark className={`text-[clamp(44px,5.2vw,76px)] text-frost ${shadow}`} sub="text-amber" />
        <nav aria-label="Menu" className="flex flex-col items-start">
          {items.map((it, i) => (
            <button
              key={i === 1 ? "invite" : it.label}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              onMouseEnter={() => setSel(i)}
              onFocus={() => setSel(i)}
              onClick={it.run}
              className={`menu-item flex cursor-pointer items-center gap-3 py-1.5 font-display text-[clamp(19px,1.7vw,24px)] uppercase tracking-[0.14em] outline-none transition-colors duration-150 ${shadow} ${i === sel ? "text-frost" : "text-frost-soft/70"} ${leaving && i === 0 ? "is-chosen" : ""}`}
            >
              <i
                aria-hidden="true"
                className={`block h-0.5 rounded-full bg-current transition-[width,opacity] duration-200 ease-out ${i === sel ? "w-6 opacity-100" : "w-0 opacity-0"}`}
              />
              {it.label}
            </button>
          ))}
        </nav>
        {s.full && (
          <p className={`m-0 max-w-sm text-ember text-sm ${shadow}`}>
            This lobby already has eight people. Invite your own instead.
          </p>
        )}
      </div>
    </main>
  );
}

const TABS = ["Video", "Controls"];
const EDGE = "clamp(24px, 5vw, 72px)";

/**
 * Settings, full screen: the tabs across the top, the rows down the left, the world still showing
 * through on the right so a change can be seen as it's made. Esc or Back returns to the menu.
 */
function Settings({ onClose }: { onClose: () => void }) {
  const s = useUI();
  const [tab, setTab] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    tabs.current[0]?.focus({ preventScroll: true });
  }, []);
  // arrows move between the tabs (the tab pattern: one tab stop, arrows inside)
  const onTabKey = (e: ReactKeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = (tab + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
    setTab(next);
    tabs.current[next]?.focus();
  };
  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      className="settings fixed inset-0 flex flex-col bg-[linear-gradient(90deg,rgb(11_13_16/0.95),rgb(11_13_16/0.88)_52%,rgb(11_13_16/0.4))]"
    >
      <header
        className="flex flex-wrap items-end gap-x-12 gap-y-4 border-rule border-b pt-[clamp(20px,5vh,48px)]"
        style={{ paddingInline: EDGE }}
      >
        <h2 className="m-0 pb-4 font-display font-semibold text-2xl text-frost uppercase tracking-[0.12em]">
          Settings
        </h2>
        <div role="tablist" aria-label="Settings" className="flex gap-8" onKeyDown={onTabKey}>
          {TABS.map((t, i) => (
            <button
              key={t}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${t}`}
              aria-selected={tab === i}
              aria-controls={`panel-${t}`}
              tabIndex={tab === i ? 0 : -1}
              onClick={() => setTab(i)}
              className={`relative cursor-pointer pb-4 font-display text-lg uppercase tracking-[0.14em] outline-none transition-colors focus-visible:text-frost ${tab === i ? "text-frost" : "text-frost-soft/60 hover:text-frost-soft"}`}
            >
              {t}
              <i
                aria-hidden="true"
                className={`absolute inset-x-0 -bottom-px block h-0.5 origin-left bg-frost transition-transform duration-200 ease-out ${tab === i ? "scale-x-100" : "scale-x-0"}`}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={s.detecting}
          className="ml-auto flex cursor-pointer items-center gap-2 pb-4 font-display text-frost-soft text-sm uppercase tracking-[0.14em] outline-none hover:text-frost focus-visible:text-frost disabled:cursor-default disabled:opacity-40"
        >
          <Kbd>Esc</Kbd> Back
        </button>
      </header>
      <div
        role="tabpanel"
        id={`panel-${TABS[tab]}`}
        aria-labelledby={`tab-${TABS[tab]}`}
        className="flex-1 overflow-y-auto py-6"
        style={{ paddingInline: EDGE }}
      >
        {tab === 0 ? <VideoSettings /> : <ControlsList />}
      </div>
    </section>
  );
}

/** One setting: its name and what it does on the left, the control on the right. */
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-2 border-rule border-b py-3.5 sm:grid-cols-[minmax(180px,260px)_1fr] sm:items-center">
      <div className="flex flex-col gap-0.5">
        <span className="font-display text-frost text-sm uppercase tracking-[0.12em]">{label}</span>
        {hint && <span className="text-frost-muted text-xs text-pretty">{hint}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function Choice({
  label,
  levels,
  value,
  onChange,
}: {
  label: string;
  levels: string[];
  value: number;
  onChange: (i: number) => void;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      variant="outline"
      size="sm"
      value={[String(value)]}
      onValueChange={(v) => v[0] !== undefined && onChange(Number(v[0]))}
    >
      {levels.map((l, i) => (
        <ToggleGroupItem key={l} value={String(i)}>
          {l}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
/** The frame-rate slider's last stop: no cap. */
const UNCAPPED = FPS_MAX + 1;

function VideoSettings() {
  const s = useUI();
  const v = s.video;
  const set = (patch: Partial<Video>) => ui.actions.video({ ...v, ...patch });
  const preset = presetOf(v);
  const dpr = devicePixelRatio;
  const w = Math.round(innerWidth * dpr * v.scale),
    h = Math.round(innerHeight * dpr * v.scale);
  return (
    <fieldset disabled={s.detecting} className="m-0 flex max-w-[820px] flex-col border-0 p-0">
      <legend className="sr-only">Video</legend>
      <Row label="Preset" hint="Sets every detail below and a resolution scale to start from.">
        <Choice
          label="Preset"
          levels={PRESET_NAMES}
          value={preset}
          onChange={(p) => ui.actions.video(withPreset(v, p))}
        />
        {preset < 0 && (
          <span className="font-display text-amber text-sm uppercase tracking-[0.12em]">Custom</span>
        )}
      </Row>
      <Row
        label="Resolution scale"
        hint="Share of your display's pixels the world is drawn at. Over 100% draws more and scales down."
      >
        <input
          type="range"
          aria-label="Resolution scale"
          aria-valuetext={`${pct(v.scale)}, ${w} by ${h}`}
          min={Math.round(SCALE_MIN * 100)}
          max={SCALE_MAX * 100}
          step={1}
          value={Math.round(v.scale * 100)}
          onChange={(e) => set({ scale: Number(e.target.value) / 100 })}
          className="w-[min(320px,60vw)] cursor-pointer accent-amber"
        />
        <span className="min-w-36 font-display text-frost text-sm tabular-nums">
          {pct(v.scale)} <span className="text-frost-muted">{`${w} × ${h}`}</span>
        </span>
      </Row>
      <Row label="Dynamic resolution" hint="Lowers the scale, to half at most, when a frame runs late.">
        <Choice
          label="Dynamic resolution"
          levels={["Off", "On"]}
          value={v.dynamic ? 1 : 0}
          onChange={(i) => set({ dynamic: i > 0 })}
        />
      </Row>
      <Row label="Frame rate limit" hint="Unlimited runs at your display's own rate.">
        <input
          type="range"
          aria-label="Frame rate limit"
          aria-valuetext={v.fps ? `${v.fps} frames per second` : "Unlimited"}
          min={FPS_MIN}
          max={UNCAPPED}
          step={1}
          value={v.fps || UNCAPPED}
          onChange={(e) => {
            const n = Number(e.target.value);
            set({ fps: n >= UNCAPPED ? 0 : n });
          }}
          className="w-[min(320px,60vw)] cursor-pointer accent-amber"
        />
        <span className="min-w-36 font-display text-frost text-sm tabular-nums">
          {v.fps ? `${v.fps} fps` : "Unlimited"}
        </span>
      </Row>
      <h3 className="m-0 mt-8 mb-1 font-display text-frost-soft text-xs uppercase tracking-[0.2em]">
        Detail
      </h3>
      {DETAILS.map((d) => (
        <Row key={d.key} label={d.label} hint={d.hint}>
          <Choice label={d.label} levels={d.levels} value={v[d.key]} onChange={(i) => set({ [d.key]: i })} />
        </Row>
      ))}
      <div className="mt-8 flex flex-wrap items-center gap-4 pb-6">
        <Button variant="outline" onClick={() => ui.actions.detect()} disabled={s.detecting || s.videoBusy}>
          {s.detecting ? "Testing…" : "Detect best settings"}
        </Button>
        <p className="m-0 text-frost-soft text-sm" aria-live="polite">
          {s.detect ??
            (s.videoBusy
              ? "Applying… the world keeps the old detail until the new one is ready."
              : "Times each preset here and keeps the best one this machine holds at 60 fps.")}
        </p>
      </div>
    </fieldset>
  );
}

function ControlsList() {
  return (
    <ul className="m-0 flex max-w-[820px] list-none flex-col p-0" aria-label="Controls">
      {CONTROLS.map(([keys, what]) => (
        <li
          key={what}
          className="grid grid-cols-[minmax(180px,260px)_1fr] items-center gap-10 border-rule border-b py-3.5"
        >
          <KbdGroup>
            {keys.map((k) => (
              <Kbd key={k}>{k}</Kbd>
            ))}
          </KbdGroup>
          <span className="text-frost text-sm">{what}</span>
        </li>
      ))}
    </ul>
  );
}

function Dot({ seed, size = 8 }: { seed: number; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full ring-1 ring-black/40"
      style={{ width: size, height: size, background: partyColor(seed) }}
    />
  );
}

function Party({ people, align = "start" }: { people: Person[]; align?: "start" | "end" }) {
  return (
    <ul
      className={`m-0 flex list-none flex-col gap-1.5 p-0 ${align === "end" ? "items-end" : ""}`}
      aria-label="Who's here"
    >
      {people.map((p) => (
        <li
          key={p.id}
          className={`flex items-center gap-2 font-display text-frost text-sm tracking-wide ${shadow}`}
        >
          <Dot seed={p.seed} />
          <span>{p.name || "Survivor"}</span>
          {p.you && <span className="text-frost-muted text-xs uppercase tracking-[0.18em]">you</span>}
        </li>
      ))}
    </ul>
  );
}

/** Re-renders every `ms`, for views of `ui.live` that don't need the display's full rate. */
function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

/** Runs `f` every animation frame while mounted. */
function useFrame(f: () => void) {
  const ref = useRef(f);
  ref.current = f;
  useEffect(() => {
    let id = 0;
    const loop = () => {
      ref.current();
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
}

function Hud() {
  const s = useUI();
  // everything speaks up for a few seconds on entering, then only what has something to say
  const [peek, setPeek] = useState(true);
  const [hint, setHint] = useState(true);
  const [quiet, setQuiet] = useState(false);
  const count = s.party.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-runs on purpose when the party changes size
  useEffect(() => {
    setQuiet(false);
    const a = setTimeout(() => setQuiet(true), 4000);
    return () => clearTimeout(a);
  }, [count]);
  useEffect(() => {
    const a = setTimeout(() => setPeek(false), 4000),
      b = setTimeout(() => setHint(false), 7000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  // (the cold's frost over the view is drawn by the lens: gfx/post.ts)
  return (
    <div className="pointer-events-none fixed inset-0">
      <Status v={s.vitals} peek={peek} />
      <div className="absolute top-5 right-6 flex flex-col items-end gap-3">
        {count > 1 && (
          <div className={`transition-opacity duration-700 ${quiet ? "opacity-60" : "opacity-100"}`}>
            <Party people={s.party} align="end" />
          </div>
        )}
        {s.stats && (
          <p
            className={`m-0 whitespace-pre text-right font-mono text-frost-soft text-xs tabular-nums ${shadow}`}
          >
            {s.stats}
          </p>
        )}
      </div>
      <p className="sr-only" role="status">
        {s.area ? `${s.area.name}, ${s.area.ru}` : ""}
      </p>
      {s.area && <AreaName key={s.area.key} name={s.area.name} ru={s.area.ru} />}
      <div className="absolute bottom-6 left-6 flex flex-col items-start gap-2.5">
        <Feed />
        <Minimap />
      </div>
      <p
        className={`absolute right-6 bottom-6 m-0 flex items-center gap-3 text-frost-soft text-sm transition-opacity duration-700 ${shadow} ${hint ? "opacity-100" : "opacity-0"}`}
      >
        <span className="flex items-center gap-1.5">
          <Kbd>Tab</Kbd> map
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>Esc</Kbd> menu
        </span>
      </p>
    </div>
  );
}

const METERS: {
  key: keyof Vitals;
  label: string;
  icon: ReactNode;
  bar: string;
  track: string;
  shows: (x: number) => boolean;
}[] = [
  {
    key: "health",
    label: "Health",
    icon: <Heart className="size-3" />,
    bar: "bg-health",
    track: "bg-health/20",
    shows: (x) => x < 0.995,
  },
  {
    key: "stamina",
    label: "Stamina",
    icon: <Footprints className="size-3" />,
    bar: "bg-stamina",
    track: "bg-stamina/15",
    shows: (x) => x < 0.995,
  },
  {
    key: "warmth",
    label: "Warmth",
    icon: <Flame className="size-3" />,
    bar: "bg-warmth",
    track: "bg-warmth/20",
    shows: (x) => x < 0.995,
  },
  {
    key: "rad",
    label: "Radiation",
    icon: <Radiation className="size-3" />,
    bar: "bg-rad",
    track: "bg-rad/15",
    shows: (x) => x > 0.005,
  },
];

/** Four thin bars top-left, each shown while it isn't at rest (GTA VI's status meters). */
function Status({ v, peek }: { v: Vitals; peek: boolean }) {
  return (
    <ul className="absolute top-5 left-6 m-0 flex list-none flex-col gap-2 p-0" aria-label="Status">
      {METERS.map((m) => {
        const x = v[m.key];
        const on = peek || m.shows(x);
        const low = m.key === "rad" ? x > 0.7 : x < 0.25;
        // losing the warmth: the flame goes out to a snowflake and the bar frosts over
        const freezing = m.key === "warmth" && x < 0.35;
        return (
          <li
            key={m.key}
            className={`flex items-center gap-2.5 transition-opacity duration-500 ${on ? "opacity-100" : "opacity-0"}`}
            aria-hidden={!on}
          >
            <span
              className={`grid size-6 place-items-center rounded-full border border-rule bg-glass text-frost backdrop-blur-sm ${low ? "hud-alarm" : ""}`}
            >
              {freezing ? <Snowflake className="size-3" /> : m.icon}
            </span>
            <span className="sr-only">
              {m.label} {Math.round(x * 100)}%{freezing ? ", freezing" : ""}
            </span>
            <span className={`relative block h-1 w-40 overflow-hidden rounded-full ${m.track}`}>
              <i
                className={`absolute inset-y-0 left-0 block w-full origin-left rounded-full transition-[transform,background-color] duration-700 ease-out ${freezing ? "bg-frost" : m.bar}`}
                style={{ transform: `scaleX(${x})` }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Lines that slide in above the minimap and leave on their own. */
function Feed() {
  const { notes } = useUI();
  return (
    <ul className="m-0 flex list-none flex-col items-start gap-1.5 p-0" aria-live="polite">
      {notes.map((n) => (
        <li
          key={n.id}
          className="hud-note flex items-center gap-2.5 rounded-md border border-rule bg-glass py-1.5 pr-3.5 pl-2.5 font-display text-frost text-sm tracking-wide backdrop-blur-sm"
        >
          <i
            className={`block h-3.5 w-0.5 rounded-full ${n.tone === "warm" ? "bg-ember" : n.tone === "cold" ? "bg-frost-soft" : "bg-frost"}`}
          />
          {n.text}
        </li>
      ))}
    </ul>
  );
}

const MW = 264,
  MH = 172,
  // the map's pixels per metre on screen, and where you stand in the frame (a little low, to see ahead)
  SCALE = 0.62,
  CX = MW / 2,
  CY = MH * 0.6,
  WORLD = 2048 * SCALE;

/** Where a map point lands in the minimap's frame, turned with you; clamped to the edge when outside. */
function place(u: number, v: number, inset: number) {
  const { me } = ui.live;
  const dx = (u - me.u) * WORLD,
    dy = (v - me.v) * WORLD;
  const c = Math.cos(-me.heading),
    s = Math.sin(-me.heading);
  let x = dx * c - dy * s,
    y = dx * s + dy * c;
  const hx = (x < 0 ? CX : MW - CX) - inset,
    hy = (y < 0 ? CY : MH - CY) - inset;
  const k = Math.min(1, hx / Math.max(Math.abs(x), 1e-3), hy / Math.max(Math.abs(y), 1e-3));
  x *= k;
  y *= k;
  return [CX + x, CY + y, k < 1] as const;
}

/**
 * The minimap: frosted glass, the district turning with you, north on the rim, the others as their
 * colours, the Column in ember with the distance to it.
 */
function Minimap() {
  const { mapImage, party } = useUI();
  useTick(100);
  const sheet = useRef<HTMLDivElement>(null),
    north = useRef<HTMLSpanElement>(null),
    goal = useRef<HTMLSpanElement>(null),
    dist = useRef<HTMLSpanElement>(null),
    dots = useRef(new Map<string, HTMLSpanElement>());
  useFrame(() => {
    const { me, others, goal: g } = ui.live;
    if (sheet.current)
      sheet.current.style.transform = `translate(${CX}px, ${CY}px) rotate(${-me.heading}rad) translate(${-me.u * WORLD}px, ${-me.v * WORLD}px)`;
    if (north.current) {
      // north rides an ellipse inside the frame, so it never sits on the distance in the corner
      const dx = Math.sin(-me.heading),
        dy = -Math.cos(-me.heading);
      const rx = CX - 14,
        ry = dy < 0 ? CY - 14 : MH - CY - 14;
      const t = 1 / Math.hypot(dx / rx, dy / ry);
      north.current.style.transform = `translate(${CX + dx * t}px, ${CY + dy * t}px)`;
    }
    if (goal.current) {
      const [x, y] = place(g.u, g.v, 10);
      goal.current.style.transform = `translate(${x}px, ${y}px)`;
    }
    if (dist.current) {
      const t = g.dist < 1000 ? `${Math.round(g.dist / 10) * 10} m` : `${(g.dist / 1000).toFixed(1)} km`;
      if (dist.current.textContent !== t) dist.current.textContent = t;
    }
    for (const o of others) {
      const el = dots.current.get(o.id);
      if (!el) continue;
      const [x, y] = place(o.u, o.v, 8);
      el.style.transform = `translate(${x}px, ${y}px)`;
    }
  });
  const seeds = new Map(party.map((p) => [p.id, p.seed]));
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-rule bg-glass shadow-[0_6px_30px_rgb(0_0_0/0.35)] backdrop-blur-sm"
      style={{ width: MW, height: MH }}
      aria-hidden="true"
    >
      {mapImage && (
        <div
          ref={sheet}
          className="absolute top-0 left-0 origin-top-left opacity-80"
          style={{ width: WORLD, height: WORLD }}
        >
          <img src={mapImage} alt="" className="block size-full" />
        </div>
      )}
      {ui.live.others.map((o) => (
        <span
          key={o.id}
          ref={(el) => {
            if (el) dots.current.set(o.id, el);
            else dots.current.delete(o.id);
          }}
          className="absolute top-0 left-0 -mt-1.5 -ml-1.5 block size-3 rounded-full ring-2 ring-black/50"
          style={{ background: partyColor(seeds.get(o.id) ?? o.seed) }}
        />
      ))}
      <span
        ref={goal}
        className="absolute top-0 left-0 -mt-1.5 -ml-1.5 block size-3 rotate-45 bg-ember shadow-[0_0_10px_rgb(255_122_47/0.9)] ring-1 ring-black/40"
      />
      <span
        ref={north}
        className="absolute top-0 left-0 -mt-2.5 -ml-2.5 grid size-5 place-items-center rounded-full bg-soot/80 font-display font-semibold text-[10px] text-frost"
      >
        N
      </span>
      {/* you: a white arrow, always pointing up the screen */}
      <svg
        viewBox="-8 -8 16 16"
        aria-hidden="true"
        className="absolute size-4 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_1px_3px_rgb(0_0_0/0.8)]"
        style={{ left: CX, top: CY }}
      >
        <path d="M0 -7 L6 6 L0 3 L-6 6 Z" fill="#e9eef2" stroke="#0b0d10" strokeWidth="1.2" />
      </svg>
      <span className="absolute top-2 left-2.5 flex items-center gap-1.5 rounded-sm bg-soot/55 px-1.5 py-0.5 font-display text-[11px] text-frost tabular-nums tracking-wide">
        <i className="block size-1.5 rotate-45 bg-ember" />
        <span ref={dist} />
      </span>
    </div>
  );
}

/** The map, on Tab: the district from above, place names, everyone's marks. */
function WorldMap() {
  const s = useUI();
  useTick(66);
  const { me, others } = ui.live;
  const seeds = new Map(s.party.map((p) => [p.id, p.seed]));
  return (
    <section
      aria-label="Map"
      className="pointer-events-none fixed inset-0 grid place-items-center bg-soot/65 backdrop-blur-sm transition-opacity duration-200 starting:opacity-0"
    >
      <div className="relative aspect-square w-[min(84vh,84vw)] overflow-hidden rounded-xl border border-rule shadow-[0_8px_48px_rgb(0_0_0/0.6)]">
        {s.mapImage && <img src={s.mapImage} alt="" className="absolute inset-0 size-full" />}
        {s.mapLabels.map((l) => (
          <span
            key={l.name}
            className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-display font-semibold text-[11px] text-soot/80 uppercase tracking-[0.16em] sm:text-sm"
            style={{ left: `${l.u * 100}%`, top: `${l.v * 100}%` }}
          >
            {l.name}
          </span>
        ))}
        {others.map((m) => (
          <span
            key={m.id}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
            style={{ left: `${m.u * 100}%`, top: `${m.v * 100}%` }}
          >
            <Dot seed={seeds.get(m.id) ?? m.seed} size={12} />
            <span className={`whitespace-nowrap font-display text-frost text-xs ${shadow}`}>
              {m.name || "Survivor"}
            </span>
          </span>
        ))}
        <svg
          viewBox="-8 -8 16 16"
          aria-hidden="true"
          className="absolute size-5 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_1px_4px_rgb(0_0_0/0.8)]"
          style={{ left: `${me.u * 100}%`, top: `${me.v * 100}%`, rotate: `${me.heading}rad` }}
        >
          <path d="M0 -7 L5 6 L0 3 L-5 6 Z" fill="#e9eef2" stroke="#0b0d10" strokeWidth="1.2" />
        </svg>
      </div>
      <ul className="sr-only">
        <li>You</li>
        {others.map((m) => (
          <li key={m.id}>{m.name || "Survivor"}</li>
        ))}
      </ul>
      <p
        className={`absolute right-6 bottom-6 m-0 flex items-center gap-2 text-frost-soft text-sm ${shadow}`}
      >
        <Kbd>Tab</Kbd> close map
      </p>
    </section>
  );
}

/** The place you've entered: fades in over 1.2 s, holds, fades out over 1.4 s. */
function AreaName({ name, ru }: { name: string; ru: string }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const b = setTimeout(() => setOn(false), 4700);
    return () => clearTimeout(b);
  }, []);
  return (
    <div
      aria-hidden="true"
      className={`absolute inset-x-0 top-[36%] flex flex-col items-center gap-3 px-6 text-center transition-opacity duration-[1400ms] ease-out starting:opacity-0 ${on ? "opacity-100" : "opacity-0"}`}
    >
      <p
        className={`m-0 font-display font-semibold text-[40px] text-frost uppercase leading-none tracking-[0.1em] sm:text-[52px] ${shadow}`}
      >
        {name}
      </p>
      <i className="block h-px w-[min(320px,70vw)] bg-[linear-gradient(90deg,transparent,rgb(233_238_242/0.7),transparent)]" />
      <p
        className={`m-0 font-display text-base text-frost-soft uppercase tracking-[0.3em] ${shadow}`}
        lang="ru"
      >
        {ru}
      </p>
    </div>
  );
}
