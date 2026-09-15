/**
 * Read-only health report for a club data folder.
 *
 *   bun .claude/skills/inspect-db/inspect.ts [dir]      (default: ./data)
 *
 * Prints a summary and every consistency problem it can find. Never writes.
 */
import fs from "node:fs";
import path from "node:path";
import { migrate } from "../../../src/lib/db";
import { recomputeRatings } from "../../../src/lib/elo";
import type { Database } from "../../../src/lib/types";

const dir = path.resolve(process.argv[2] ?? "data");
const file = path.join(dir, "db.json");
if (!fs.existsSync(file)) {
  console.error(`No db.json in ${dir}. If the club lives in Postgres (DATABASE_URL), export it from /admin first.`);
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const db: Database = migrate(structuredClone(raw));
const problems: string[] = [];
const warn = (s: string) => problems.push(s);

const playerIds = new Set(db.players.map((p) => p.id));
const gameIds = new Set(db.games.map((g) => g.id));
const name = (id: string) => db.players.find((p) => p.id === id)?.name ?? `<${id}>`;

// --- summary -------------------------------------------------------------
const completed = db.games.filter((g) => g.result !== null);
const open = db.games.length - completed.length;
console.log(`Club:        ${db.settings.club.name}`);
console.log(`File:        ${file} (${(fs.statSync(file).size / 1024).toFixed(1)} KB)`);
console.log(`Players:     ${db.players.length} (${db.players.filter((p) => p.active).length} active, ${db.players.filter((p) => p.pinHash).length} with PIN)`);
console.log(`Games:       ${db.games.length} (${completed.length} completed, ${open} open)`);
console.log(`Tournaments: ${db.tournaments.length} — ${db.tournaments.map((t) => `${t.name} [${t.pairingMode}, ${t.status}, ${t.rounds.length}/${t.plannedRounds} rounds]`).join("; ") || "none"}`);
console.log(`Club nights: ${db.sessions.length} (${db.sessions.filter((s) => !s.closedAt).length} open)`);
console.log(`Seasons:     ${db.seasons.map((s) => `${s.name} ${s.start}→${s.end ?? "open"}`).join("; ")}`);
console.log(`Security:    admin ${db.settings.adminPasswordHash ? "set" : "NOT set"}, member code ${db.settings.memberCodeHash ? "set" : "not set (open club)"}`);
const backups = fs.existsSync(path.join(dir, "backups")) ? fs.readdirSync(path.join(dir, "backups")).filter((f) => f.endsWith(".json")).sort() : [];
console.log(`Backups:     ${backups.length}${backups.length ? ` (latest ${backups[backups.length - 1]})` : ""}`);

// --- migration drift -------------------------------------------------------
if (JSON.stringify(migrate(structuredClone(raw))) !== JSON.stringify(raw)) warn("File is not in current shape: migrate() changes it (harmless, fixed on next write).");

// --- referential integrity ------------------------------------------------
for (const g of db.games) {
  if (!playerIds.has(g.whiteId)) warn(`Game ${g.id}: white player ${g.whiteId} does not exist`);
  if (!playerIds.has(g.blackId)) warn(`Game ${g.id}: black player ${g.blackId} does not exist`);
  if (g.whiteId === g.blackId) warn(`Game ${g.id}: ${name(g.whiteId)} plays themselves`);
  if (g.result && !g.completedAt) warn(`Game ${g.id}: has a result but no completedAt`);
  if (!g.result && g.completedAt) warn(`Game ${g.id}: completedAt set but no result`);
  if (g.tournamentId && !db.tournaments.some((t) => t.id === g.tournamentId)) warn(`Game ${g.id}: tournament ${g.tournamentId} missing`);
  if (g.sessionId && !db.sessions.some((s) => s.id === g.sessionId)) warn(`Game ${g.id}: session ${g.sessionId} missing`);
}
const seqs = new Set<number>();
for (const g of db.games) {
  if (seqs.has(g.seq)) warn(`Duplicate game seq ${g.seq}`);
  seqs.add(g.seq);
  if (g.seq > db.seq) warn(`Game ${g.id} has seq ${g.seq} > db.seq ${db.seq}`);
}
for (const t of db.tournaments) {
  for (const pid of [...t.participantIds, ...t.withdrawnIds]) if (!playerIds.has(pid)) warn(`Tournament ${t.name}: participant ${pid} missing`);
  for (const r of t.rounds) {
    for (const p of r.pairings) {
      if (!gameIds.has(p.gameId)) warn(`Tournament ${t.name} R${r.number} board ${p.board}: game ${p.gameId} missing`);
      const g = db.games.find((x) => x.id === p.gameId);
      if (g && (g.tournamentId !== t.id || g.round !== r.number)) warn(`Tournament ${t.name} R${r.number}: game ${p.gameId} points elsewhere (${g.tournamentId}/${g.round})`);
    }
    if (r.byePlayerId && !t.participantIds.includes(r.byePlayerId)) warn(`Tournament ${t.name} R${r.number}: bye ${name(r.byePlayerId)} is not a participant`);
  }
  if (t.knockout) {
    for (const m of t.knockout.matches) {
      for (const gid of m.gameIds) if (!gameIds.has(gid)) warn(`Knockout ${t.name} R${m.round}#${m.slot}: game ${gid} missing`);
      if (m.winnerId && m.winnerId !== m.a && m.winnerId !== m.b) warn(`Knockout ${t.name} R${m.round}#${m.slot}: winner ${name(m.winnerId)} is neither side`);
    }
  }
}
for (const s of db.sessions) {
  for (const pid of s.presentIds) if (!playerIds.has(pid)) warn(`Session ${s.id}: present player ${pid} missing`);
  for (const r of s.rounds) for (const p of r.pairings) if (!gameIds.has(p.gameId)) warn(`Session ${s.id} R${r.number}: game ${p.gameId} missing`);
}

// --- derived ratings ------------------------------------------------------
const replay = structuredClone(db);
recomputeRatings(replay);
for (const p of db.players) {
  const q = replay.players.find((x) => x.id === p.id)!;
  const diff = (["rating", "gamesPlayed", "wins", "draws", "losses"] as const).filter((k) => p[k] !== q[k]);
  if (diff.length) warn(`Player ${p.name}: stored ${diff.map((k) => `${k}=${p[k]}`).join(", ")} but replay gives ${diff.map((k) => `${k}=${q[k]}`).join(", ")} — ratings were edited by hand or a write skipped recomputeRatings()`);
}

// --- report ---------------------------------------------------------------
console.log("");
if (problems.length === 0) console.log("✔ No consistency problems found.");
else {
  console.log(`✘ ${problems.length} problem(s):`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exitCode = 2;
}
