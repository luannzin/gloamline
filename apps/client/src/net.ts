// The lobby: a link is `#<secret>`, the secret is the room password, a hash of it is the room
// name, and the relays never see either (Sightline's link shape, over the same public Nostr
// relays through Trystero). Up to eight people; each sends its own pose 15 times a second and
// draws everyone else's 100 ms in the past, between the two poses around that moment.
import { joinRoom } from "trystero";

const APP_ID = "luannzin/gloamline";
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const MAX_PLAYERS = 8;

export function newSecret() {
  let out = "";
  while (out.length < 22)
    for (const b of crypto.getRandomValues(new Uint8Array(32)))
      if (b < 248 && out.length < 22) out += BASE62[b % 62];
  return out;
}

export function secretFromHash(hash: string) {
  const s = hash.replace(/^#/, "");
  return /^[0-9A-Za-z]{22}$/.test(s) ? s : null;
}

async function roomName(secret: string) {
  const h = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`gloamline:${secret}`)),
  );
  return Array.from(h.subarray(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type Profile = { name: string; seed: number };
export type Remote = Profile & {
  id: string;
  /** pose history: t, x, y, z, yaw, lantern; newest last */
  poses: number[][];
};

const isProfile = (p: unknown): p is Profile =>
  !!p &&
  typeof (p as Profile).name === "string" &&
  (p as Profile).name.length <= 18 &&
  Number.isInteger((p as Profile).seed);

export async function openLobby(
  secret: string,
  me: Profile,
  onChange: (people: Map<string, Remote>) => void,
) {
  const room = joinRoom({ appId: APP_ID, password: secret }, await roomName(secret));
  const people = new Map<string, Remote>();
  const hello = room.makeAction<Profile>("hello");
  const pose = room.makeAction<ArrayBuffer>("pose");

  room.onPeerJoin(({ peerId }) => void hello.send(me, { target: peerId }));
  room.onPeerLeave(({ peerId }) => {
    people.delete(peerId);
    onChange(people);
  });
  hello.onMessage((p, { peerId }) => {
    if (!isProfile(p)) return;
    // past eight, newcomers are not drawn: the room is full for them
    if (!people.has(peerId) && people.size >= MAX_PLAYERS - 1) return;
    const r = people.get(peerId) ?? { id: peerId, name: "", seed: 0, poses: [] };
    r.name = p.name;
    r.seed = p.seed;
    people.set(peerId, r);
    onChange(people);
  });
  pose.onMessage((buf, { peerId }) => {
    const r = people.get(peerId);
    if (!r || !(buf instanceof ArrayBuffer) || buf.byteLength !== 20) return;
    const f = new Float32Array(buf);
    if (!f.every(Number.isFinite)) return;
    r.poses.push([performance.now(), f[0], f[1], f[2], f[3], f[4]]);
    if (r.poses.length > 8) r.poses.shift();
  });

  const out = new Float32Array(5);
  return {
    people,
    /** Sends this player's pose. */
    send(x: number, y: number, z: number, yaw: number, lantern: boolean) {
      if (!people.size) return;
      out[0] = x;
      out[1] = y;
      out[2] = z;
      out[3] = yaw;
      out[4] = lantern ? 1 : 0;
      void pose.send(out.slice().buffer);
    },
    rename(p: Profile) {
      me = p;
      void hello.send(me);
    },
    /** True when the room already had eight when this one arrived. */
    get crowded() {
      return Object.keys(room.getPeers()).length >= MAX_PLAYERS;
    },
    leave: () => room.leave(),
  };
}

export type Lobby = Awaited<ReturnType<typeof openLobby>>;

/** Pose of `r` at `t` (ms), interpolated; writes x, y, z, yaw, lantern into `o`. */
export function poseAt(r: Remote, t: number, o: Float32Array) {
  const p = r.poses;
  if (!p.length) return false;
  let i = p.length - 1;
  while (i > 0 && p[i - 1][0] > t) i--;
  const a = p[Math.max(0, i - 1)],
    b = p[i];
  const k = b[0] === a[0] ? 1 : Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])));
  for (let j = 0; j < 3; j++) o[j] = a[j + 1] + (b[j + 1] - a[j + 1]) * k;
  let dy = b[4] - a[4];
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  o[3] = a[4] + dy * k;
  o[4] = b[5];
  return true;
}
