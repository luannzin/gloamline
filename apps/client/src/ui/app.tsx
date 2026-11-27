// Loading, menu and HUD over the running world (DESIGN.md). The HUD says nothing until it matters,
// then says it at a glance from a corner: status top-left, the party top-right, the minimap and the
// feed bottom-left, the place you've entered in the middle for a moment.
import { Flame, Footprints, Heart, Radiation } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { partyColor } from "@/lib/party";
import { type Person, ui, useUI, type Vitals } from "./store";

const shadow = "[text-shadow:0_1px_8px_rgb(0_0_0/0.85)]";

export function App() {
  const s = useUI();
  return (
    <>
      {s.phase === "loading" && <Loading stage={s.stage} progress={s.progress} error={s.error} />}
      {s.phase === "menu" && <Menu />}
      {s.phase === "playing" && <Hud />}
      {s.phase === "playing" && s.mapOpen && <WorldMap />}
    </>
  );
}

function Wordmark({ size = "text-[56px]" }: { size?: string }) {
  return (
    <hgroup className="m-0 flex flex-col gap-1">
      <h1
        className={`m-0 font-display font-semibold text-frost uppercase leading-none tracking-[0.06em] ${size}`}
      >
        Gloamline
      </h1>
      <p className="m-0 font-display text-amber/90 text-sm uppercase tracking-[0.32em]" lang="ru">
        Зима после вспышки
      </p>
    </hgroup>
  );
}

function Loading({ stage, progress, error }: { stage: string; progress: number; error: string | null }) {
  return (
    <main className="fixed inset-0 grid place-content-center justify-items-center gap-7 px-6 text-center">
      <Wordmark />
      <p className="min-h-6 text-frost-soft" aria-live="polite">
        {error ?? stage}
      </p>
      {error ? (
        <Button variant="outline" onClick={() => location.reload()}>
          Reload page
        </Button>
      ) : (
        <div
          className="h-px w-72 overflow-hidden bg-frost/15"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          aria-label="Loading"
        >
          <i
            className="block h-full origin-left bg-amber transition-transform duration-500 ease-out"
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
      )}
    </main>
  );
}

function Menu() {
  const s = useUI();
  const [name, setName] = useState(() => localStorage.getItem("name") ?? "");
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!s.invite) return;
    try {
      await navigator.clipboard.writeText(s.invite);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // no clipboard here: the link is selected instead, ready to copy by hand
      (document.getElementById("invite") as HTMLInputElement | null)?.select();
    }
  };
  return (
    <main className="menu fixed inset-y-0 left-0 flex w-full max-w-[460px] flex-col justify-center-safe gap-7 overflow-y-auto px-10 py-10">
      <div className="flex flex-col gap-4">
        <Wordmark />
        <p className="m-0 text-frost-soft text-pretty">
          The winter after the flash. Keep each other alive. Up to eight survivors, from one link.
        </p>
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          ui.actions.enter(name.trim());
        }}
      >
        <Field>
          <FieldLabel>Your name</FieldLabel>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              localStorage.setItem("name", e.target.value.trim());
            }}
            maxLength={18}
            autoComplete="nickname"
            spellCheck={false}
            placeholder="Survivor"
            autoFocus
          />
        </Field>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" size="lg">
            Enter the zone
          </Button>
          {!s.invite && (
            <Button variant="outline" size="lg" onClick={() => ui.actions.invite()}>
              Invite friends
            </Button>
          )}
        </div>
      </form>
      {s.invite && (
        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel>Anyone with this link joins you</FieldLabel>
            <div className="flex w-full gap-2">
              <Input
                id="invite"
                value={s.invite}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono"
              />
              <Button variant="outline" onClick={copy}>
                <span className="grid *:col-start-1 *:row-start-1">
                  <span className={copied ? "invisible" : undefined}>Copy link</span>
                  <span className={copied ? undefined : "invisible"} aria-hidden={!copied}>
                    Copied
                  </span>
                </span>
              </Button>
            </div>
          </Field>
          {s.party.length > 0 && <Party people={s.party} />}
        </div>
      )}
      {s.full && (
        <p className="m-0 text-ember">
          This lobby already has eight people. Ask for a new link, or invite your own.
        </p>
      )}
      <div className="flex flex-col gap-3">
        <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-frost-soft text-sm">
          <dt>Look</dt>
          <dd className="m-0">Mouse</dd>
          <dt>Move</dt>
          <dd className="m-0">
            <KbdGroup>
              <Kbd>W</Kbd>
              <Kbd>A</Kbd>
              <Kbd>S</Kbd>
              <Kbd>D</Kbd>
            </KbdGroup>
          </dd>
          <dt>Run</dt>
          <dd className="m-0">
            <Kbd>Shift</Kbd>
          </dd>
          <dt>Jump</dt>
          <dd className="m-0">
            <Kbd>Space</Kbd>
          </dd>
          <dt>Lantern</dt>
          <dd className="m-0">
            <Kbd>F</Kbd> <span className="text-frost-muted">keeps you warm</span>
          </dd>
          <dt>Map</dt>
          <dd className="m-0">
            <Kbd>Tab</Kbd>
          </dd>
          <dt>Menu</dt>
          <dd className="m-0">
            <Kbd>Esc</Kbd>
          </dd>
        </dl>
        <div className="flex flex-col gap-1.5 text-frost-soft text-sm">
          <div className="flex items-center gap-3">
            <span id="detail">Detail</span>
            <ToggleGroup
              aria-labelledby="detail"
              aria-describedby="detail-note"
              variant="outline"
              size="sm"
              value={[String(s.quality)]}
              onValueChange={(v) => v[0] && ui.actions.quality(Number(v[0]))}
            >
              <ToggleGroupItem value="0">Low</ToggleGroupItem>
              <ToggleGroupItem value="1">Medium</ToggleGroupItem>
              <ToggleGroupItem value="2">High</ToggleGroupItem>
              <ToggleGroupItem value="3">Ultra</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <p id="detail-note" className="m-0 text-frost-muted text-xs">
            Changing detail reloads the page.
          </p>
        </div>
      </div>
    </main>
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
  const cold = Math.max(0, 1 - s.vitals.warmth / 0.5);
  return (
    <div className="pointer-events-none fixed inset-0">
      <div
        aria-hidden="true"
        className="absolute inset-0 transition-opacity duration-1000"
        style={{
          opacity: cold,
          background:
            "radial-gradient(130% 95% at 50% 50%, transparent 52%, rgb(206 226 240 / 0.22) 72%, rgb(226 238 248 / 0.62) 100%)",
        }}
      />
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
        return (
          <li
            key={m.key}
            className={`flex items-center gap-2.5 transition-opacity duration-500 ${on ? "opacity-100" : "opacity-0"}`}
            aria-hidden={!on}
          >
            <span
              className={`grid size-6 place-items-center rounded-full border border-rule bg-glass text-frost backdrop-blur-sm ${low ? "hud-alarm" : ""}`}
            >
              {m.icon}
            </span>
            <span className="sr-only">
              {m.label} {Math.round(x * 100)}%
            </span>
            <span className={`relative block h-1 w-40 overflow-hidden rounded-full ${m.track}`}>
              <i
                className={`absolute inset-y-0 left-0 block w-full origin-left rounded-full transition-transform duration-200 ease-out ${m.bar}`}
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
