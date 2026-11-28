// The survivor's body: stamina spent running, warmth lost to the cold and won back by the lantern or
// a roof of rock, radiation taken from the bad water, and health that pays for the last two. Snow
// builds up on you in the open snowfall, stops under a roof or a crown, and comes off by the lantern
// and under cover; a coat of it chills you, and standing in a wall's lee keeps the wind off. Rates
// are per second, tuned so a full body lasts a few minutes in the open snow without a light.
import type { Vitals } from "./ui/store";

export type Exposure = {
  running: boolean;
  /** how deep the snow is underfoot (0..1): running through it costs more */
  deep: number;
  /** 1 under the open sky, 0 under rock */
  open: number;
  /** how hard the snow is blowing here (the mood's snowfall, 0..1) */
  cold: number;
  lantern: boolean;
  /** how bad the water is here (the mood's green motes, 0..1) */
  bad: number;
  /** how much is overhead against the falling snow, 0..1 (world: wind.ts) */
  cover: number;
  /** how far out of the wind, in a wall's lee, 0..1 */
  lee: number;
};

const clamp = (x: number) => Math.min(1, Math.max(0, x));

/**
 * Snow on a body after `dt` seconds: it settles in the open snowfall (a blizzard covers you in a
 * few minutes), slower with a lit lantern in the hand, and slides and melts off under cover.
 */
export function settle(snow: number, dt: number, fall: number, open: number, cover: number, lit: boolean) {
  const builds = fall * open * (1 - cover) * 0.006;
  const sheds = (lit ? 0.0025 : 0) + (1 - open) * 0.02 + cover * 0.006;
  return clamp(snow + (builds - sheds) * dt);
}

export function makeBody() {
  const v: Vitals = { health: 1, stamina: 1, warmth: 1, rad: 0 };
  let rested = 0,
    spent = false;
  const self = {
    v,
    /** snow settled on you, 0..1 */
    snow: 0,
    /** Out of breath at zero; running again once a third has come back. */
    get canRun() {
      return !spent;
    },
    /** Returns true when the body gives out. */
    update(dt: number, e: Exposure) {
      if (e.running) {
        v.stamina = clamp(v.stamina - 0.07 * (1 + 0.8 * e.deep) * dt);
        rested = 0;
        if (v.stamina === 0) spent = true;
      } else {
        rested += dt;
        if (rested > 0.9) v.stamina = clamp(v.stamina + 0.28 * dt);
      }
      if (spent && v.stamina > 0.33) spent = false;

      self.snow = settle(self.snow, dt, e.cold, e.open, e.cover, e.lantern);
      // the wind takes the heat; a wall's lee keeps most of it off, and snow on the coat chills
      const chill = e.open * (1 - 0.6 * e.lee) * (0.004 + e.cold * 0.004) + self.snow * 0.002;
      const heat = (e.lantern ? 0.012 : 0) + (1 - e.open) * 0.003 + (e.running ? 0.002 : 0);
      v.warmth = clamp(v.warmth - (chill - heat) * dt);
      v.rad = clamp(v.rad + (e.bad * 0.006 - 0.002) * dt);

      let hurt = 0;
      if (v.warmth === 0) hurt += 0.01;
      if (v.rad > 0.75) hurt += 0.008;
      v.health = clamp(v.health + (hurt ? -hurt : v.warmth > 0.4 && v.rad < 0.5 ? 0.006 : 0) * dt);
      return v.health === 0;
    },
    reset() {
      Object.assign(v, { health: 1, stamina: 1, warmth: 1, rad: 0 });
      self.snow = 0;
      spent = false;
    },
  };
  return self;
}
