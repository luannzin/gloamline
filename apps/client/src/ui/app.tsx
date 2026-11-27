// Loading, menu and HUD over the running world (DESIGN.md). coss controls, the lines' pixel face for
// names, Sightline's critters for people.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { avatarPaths } from "@/lib/avatar";
import { DUSK, dither } from "@/lib/palette";
import { PixelName } from "./pixel-name";
import { type Person, ui, useUI } from "./store";

export function App() {
  const s = useUI();
  return (
    <>
      {s.phase === "loading" && <Loading stage={s.stage} progress={s.progress} error={s.error} />}
      {s.phase === "menu" && <Menu />}
      {s.phase === "playing" && <Hud />}
      {s.stats && (
        <p className="pointer-events-none fixed top-3 right-4 whitespace-pre text-right font-mono text-ink-soft text-xs tabular-nums [text-shadow:0_1px_4px_#000]">
          {s.stats}
        </p>
      )}
    </>
  );
}

function Wordmark({ className }: { className?: string }) {
  return (
    <h1 className="m-0 max-w-full leading-none">
      <PixelName
        name="Gloamline"
        className={`max-w-full text-ink drop-shadow-[0_0_18px_rgba(255,209,128,0.35)] ${className ?? ""}`}
      />
    </h1>
  );
}

function Loading({ stage, progress, error }: { stage: string; progress: number; error: string | null }) {
  return (
    <main className="fixed inset-0 grid place-content-center justify-items-center gap-6 px-6 text-center">
      <Wordmark className="text-[42px] sm:text-[56px]" />
      <p className="min-h-6 text-ink-soft" aria-live="polite">
        {error ?? stage}
      </p>
      {error ? (
        <Button variant="outline" onClick={() => location.reload()}>
          Reload page
        </Button>
      ) : (
        <div
          className="h-0.5 w-72 overflow-hidden bg-ink/10"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          aria-label="Loading"
        >
          <i
            className="block h-full origin-left bg-dusk-gold transition-transform duration-500 ease-out"
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
    <main className="menu fixed inset-y-0 left-0 flex w-full max-w-[440px] flex-col justify-center-safe gap-6 overflow-y-auto px-10 py-10">
      <div className="flex flex-col gap-3">
        <Wordmark className="text-[42px]" />
        <p className="text-ink-soft text-pretty">
          A souls-like world at dusk. Up to eight of you, from one link.
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
            placeholder="Wanderer"
            autoFocus
          />
        </Field>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" size="lg">
            Enter the world
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
        <p className="text-dusk-ember">
          This lobby already has eight people. Ask for a new link, or invite your own.
        </p>
      )}
      <div className="flex flex-col gap-3">
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-ink-soft text-sm">
          <dt>Look</dt>
          <dd>Mouse</dd>
          <dt>Move</dt>
          <dd>
            <KbdGroup>
              <Kbd>W</Kbd>
              <Kbd>A</Kbd>
              <Kbd>S</Kbd>
              <Kbd>D</Kbd>
            </KbdGroup>
          </dd>
          <dt>Run</dt>
          <dd>
            <Kbd>Shift</Kbd>
          </dd>
          <dt>Jump</dt>
          <dd>
            <Kbd>Space</Kbd>
          </dd>
          <dt>Lantern</dt>
          <dd>
            <Kbd>F</Kbd>
          </dd>
          <dt>Menu</dt>
          <dd>
            <Kbd>Esc</Kbd>
          </dd>
        </dl>
        <div className="flex flex-col gap-1.5 text-ink-soft text-sm">
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
            </ToggleGroup>
          </div>
          <p id="detail-note" className="m-0 text-ink-muted text-xs">
            Changing detail reloads the page.
          </p>
        </div>
      </div>
    </main>
  );
}

/** A critter at 2 screen pixels per art pixel. */
function Critter({ seed }: { seed: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={32}
      height={32}
      shapeRendering="crispEdges"
      aria-hidden="true"
      className="size-8 shrink-0 rounded-[3px]"
    >
      {avatarPaths(seed).map(([c, d]) => (
        <path key={c} fill={c} d={d} />
      ))}
    </svg>
  );
}

function Party({ people }: { people: Person[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Who's here">
      {people.map((p) => (
        <li key={p.id} className="flex items-center gap-2 text-ink text-sm">
          <Critter seed={p.seed} />
          <span>{p.name || "Wanderer"}</span>
          {p.you && <span className="text-ink-soft">you</span>}
        </li>
      ))}
    </ul>
  );
}

// A dithered dusk rule: violet at the ends, gold in the middle, 4x4 Bayer, crisp pixels. Static.
const RULE_W = 96;
const RULE = Array.from({ length: RULE_W * 2 }, (_, k) => {
  const x = k % RULE_W,
    y = Math.floor(k / RULE_W);
  const t = 1 - Math.abs(x / (RULE_W - 1) - 0.5) * 2;
  // biome-ignore lint/suspicious/noArrayIndexKey: a fixed pixel grid that never reorders
  return <rect key={k} x={x} y={y} width="1" height="1" fill={DUSK[dither(4, t, x, y)]} />;
});

function Hud() {
  const s = useUI();
  const [quiet, setQuiet] = useState(false);
  const [hint, setHint] = useState(true);
  // the party speaks up when someone arrives or leaves, then quiets again
  const count = s.party.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-runs on purpose when the party changes size
  useEffect(() => {
    setQuiet(false);
    const a = setTimeout(() => setQuiet(true), 4000);
    return () => clearTimeout(a);
  }, [count]);
  useEffect(() => {
    const b = setTimeout(() => setHint(false), 6000);
    return () => clearTimeout(b);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-0">
      {count > 1 && (
        <div
          className={`absolute top-4 left-5 transition-opacity duration-700 [text-shadow:0_1px_6px_#000] ${quiet ? "opacity-70" : "opacity-100"}`}
        >
          <Party people={s.party} />
        </div>
      )}
      <p className="sr-only" role="status">
        {s.area?.name ?? ""}
      </p>
      {s.area && <AreaName key={s.area.key} name={s.area.name} />}
      <p
        className={`absolute bottom-4 left-5 flex items-center gap-2 text-ink-soft text-sm transition-opacity duration-700 [text-shadow:0_1px_6px_#000] ${hint ? "opacity-100" : "opacity-0"}`}
      >
        <Kbd>Esc</Kbd> menu
      </p>
    </div>
  );
}

/** Fades in over 1.4 s, holds 3.5 s, fades out over 1.4 s. */
function AreaName({ name }: { name: string }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const b = setTimeout(() => setOn(false), 4900);
    return () => clearTimeout(b);
  }, []);
  return (
    <div
      aria-hidden="true"
      className={`absolute inset-x-0 top-[40%] flex flex-col items-center gap-4 px-6 transition-opacity duration-[1400ms] ease-out starting:opacity-0 ${on ? "opacity-100" : "opacity-0"}`}
    >
      <PixelName
        name={name}
        className="max-w-full text-[35px] text-ink drop-shadow-[0_2px_16px_rgba(0,0,0,0.9)]"
      />
      <svg
        viewBox={`0 0 ${RULE_W} 2`}
        shapeRendering="crispEdges"
        className="h-1 w-[min(384px,80vw)]"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {RULE}
      </svg>
    </div>
  );
}
