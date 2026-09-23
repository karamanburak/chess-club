import type { Database } from "./types";

/**
 * What a downloaded backup leaves out: the secrets of this installation. Import and restore keep the running
 * installation's values for exactly these (`keepInstallation`), so a file never needs them, and a file that is
 * emailed around cannot be used to forge cookies (session secret) or crack the admin, owner or member code offline.
 * Player PINs stay in, so a move to another installation keeps everyone's PIN.
 */
export function exportable(db: Database): Database {
  const copy = structuredClone(db);
  const s = copy.settings;
  delete s.sessionSecret;
  delete s.adminPasswordHash;
  delete s.ownerPasswordHash;
  delete s.memberCodeHash;
  delete s.adminLock;
  delete s.memberLock;
  delete s.ownerLock;
  return copy;
}

/** Import and restore replace the club's data, never who may get in: this installation's passwords, member code and locks stay. */
export function keepInstallation(next: Database, current: Database): Database {
  const s = next.settings;
  const c = current.settings;
  s.adminPasswordHash = c.adminPasswordHash;
  s.ownerPasswordHash = c.ownerPasswordHash;
  s.sessionSecret = c.sessionSecret;
  s.memberCodeHash = c.memberCodeHash;
  s.adminLock = c.adminLock;
  s.memberLock = c.memberLock;
  s.ownerLock = c.ownerLock;
  for (const k of ["adminPasswordHash", "ownerPasswordHash", "sessionSecret", "memberCodeHash", "adminLock", "memberLock", "ownerLock"] as const) {
    if (s[k] === undefined) delete s[k];
  }
  return next;
}
