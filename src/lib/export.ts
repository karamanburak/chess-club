import type { Database } from "./types";

/**
 * What a downloaded backup leaves out: the secrets of this installation. Import and restore keep the running
 * installation's values for exactly these (`keepInstallation`), so a file never needs them, and a file that is
 * emailed around cannot be used to forge cookies (session secret) or crack the admin password or member code offline.
 * Player PINs are left out too unless `pins` is asked for: a four-digit PIN behind any hash falls to 10,000 guesses
 * offline, so a file that travels must not carry them. Import and restore keep the running installation's PIN of
 * every player the file has without one, so a normal backup round trip keeps everyone's PIN anyway; only a move to
 * a new installation needs the file with PINs (Admin → Data offers both).
 */
export function exportable(db: Database, { pins = false }: { pins?: boolean } = {}): Database {
  const copy = structuredClone(db);
  for (const p of copy.players) {
    if (!pins) delete p.pinHash;
    delete p.pinFails;
    delete p.pinLockedUntil;
    delete p.pinLocks;
    delete p.pinDevices;
    // Push subscriptions belong to this installation's keys and say where a phone can be reached.
    delete p.pushSubs;
  }
  delete copy.settings.signupTimes;
  const s = copy.settings;
  delete s.sessionSecret;
  delete s.adminPasswordHash;
  delete s.memberCodeHash;
  delete s.adminLock;
  delete s.memberLock;
  return copy;
}

/**
 * Import and restore replace the club's data, never who may get in: this installation's passwords, member code and
 * locks stay, and a player the file has without a PIN (a download without PINs) keeps the PIN they have here.
 */
export function keepInstallation(next: Database, current: Database): Database {
  const here = new Map(current.players.map((p) => [p.id, p]));
  for (const p of next.players) {
    const mine = here.get(p.id);
    if (!p.pinHash && mine?.pinHash) {
      p.pinHash = mine.pinHash;
      if (mine.pinDevices) p.pinDevices = mine.pinDevices;
    }
    // Subscriptions only work with this installation's keys: keep the phones that subscribed here.
    if (mine?.pushSubs) p.pushSubs = mine.pushSubs;
    else delete p.pushSubs;
  }
  const s = next.settings;
  const c = current.settings;
  s.adminPasswordHash = c.adminPasswordHash;
  s.sessionSecret = c.sessionSecret;
  s.memberCodeHash = c.memberCodeHash;
  s.adminLock = c.adminLock;
  s.memberLock = c.memberLock;
  for (const k of ["adminPasswordHash", "sessionSecret", "memberCodeHash", "adminLock", "memberLock"] as const) {
    if (s[k] === undefined) delete s[k];
  }
  return next;
}
