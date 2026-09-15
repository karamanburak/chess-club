/**
 * Writes a realistic demo club into an isolated data folder, for manual testing
 * without touching the real data/db.json.
 *
 *   bun .claude/skills/seed-demo/seed.ts [dir] [--players N] [--friendlies N] [--seed N]
 *
 * Default dir: .demo-data (git-ignored via /.demo-data in .gitignore if present; never data/).
 * Refuses to write into ./data.
 */
import fs from "node:fs";
import path from "node:path";
import { migrate } from "../../../src/lib/db";
import { recomputeRatings } from "../../../src/lib/elo";
import { generatePairings, pairKey, type ColorStats } from "../../../src/lib/pairing";
import type { Database, Game, GameResult, Player, Tournament } from "../../../src/lib/types";

const args = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback;
};
const dirArg = args.find((a, i) => !a.startsWith("--") && (i === 0 || !args[i - 1].startsWith("--"))) ?? ".demo-data";
const dir = path.resolve(dirArg);
if (dir === path.resolve("data")) {
  console.error("Refusing to seed into ./data (the real club). Pass another folder.");
  process.exit(1);
}
const N_PLAYERS = flag("players", 12);
const N_FRIENDLIES = flag("friendlies", 60);
let rnd = flag("seed", 42);
const random = () => {
  // mulberry32: deterministic, so the same --seed gives the same club
  rnd |= 0;
  rnd = (rnd + 0x6d2b79f5) | 0;
  let t = Math.imul(rnd ^ (rnd >>> 15), 1 | rnd);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(xs: T[]): T => xs[Math.floor(random() * xs.length)];

const NAMES = ["Ada", "Bora", "Cem", "Defne", "Emre", "Feride", "Gökhan", "Hale", "Ilgaz", "Jale", "Kaan", "Leyla", "Mert", "Nil", "Ozan", "Pelin", "Rüzgar", "Selin", "Tuna", "Umut"];

let seq = 0;
let clock = Date.parse("2026-03-05T18:00:00.000Z");
const tick = (ms = 45 * 60 * 1000) => new Date((clock += ms)).toISOString();

const players: Player[] = Array.from({ length: Math.min(N_PLAYERS, NAMES.length) }, (_, i) => {
  const rating = 1000 + Math.round(random() * 600);
  return {
    id: `demo-p${i + 1}`,
    name: NAMES[i],
    initialRating: rating,
    rating,
    gamesPlayed: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    active: i !== 3, // one inactive player, to see how the UI handles them
    createdAt: "2026-03-01T10:00:00.000Z",
    avatar: `demo-p${i + 1}`,
  };
});

/** Result skewed by rating difference, with ~25 % draws and the occasional forfeit. */
function play(white: Player, black: Player): GameResult {
  if (random() < 0.03) return random() < 0.5 ? "+/-" : "-/+";
  const exp = 1 / (1 + 10 ** ((black.rating - white.rating) / 400));
  const r = random();
  if (r < 0.25) return "1/2-1/2";
  return random() < exp ? "1-0" : "0-1";
}

function game(white: Player, black: Player, fields: Partial<Game> = {}): Game {
  seq += 1;
  const at = tick();
  return {
    id: `demo-g${seq}`,
    seq,
    tournamentId: null,
    round: null,
    board: null,
    sessionId: null,
    whiteId: white.id,
    blackId: black.id,
    result: play(white, black),
    rated: true,
    createdAt: at,
    completedAt: at,
    whiteRatingBefore: null,
    blackRatingBefore: null,
    whiteRatingAfter: null,
    blackRatingAfter: null,
    ...fields,
  };
}

const games: Game[] = [];
const active = players.filter((p) => p.active);

// Friendlies spread over ~6 months.
for (let i = 0; i < N_FRIENDLIES; i++) {
  const a = pick(active);
  let b = pick(active);
  while (b.id === a.id) b = pick(active);
  games.push(game(a, b));
  if (i % 4 === 3) clock += 3 * 24 * 60 * 60 * 1000;
}

// One finished Swiss tournament, 3 rounds, colours balanced by the real pairing code.
function swiss(id: string, name: string, field: Player[], rounds: number, status: Tournament["status"]): Tournament {
  const t: Tournament = {
    id,
    name,
    date: new Date(clock).toISOString().slice(0, 10),
    status,
    pairingMode: "swiss",
    plannedRounds: rounds,
    rated: true,
    timeControl: "15+10",
    tiebreaks: ["buchholz", "sonneborn", "direct", "wins"],
    byePoints: 1,
    participantIds: field.map((p) => p.id),
    withdrawnIds: [],
    rounds: [],
    createdAt: new Date(clock).toISOString(),
  };
  const score = new Map(field.map((p) => [p.id, 0]));
  const previous = new Set<string>();
  const colors = new Map<string, ColorStats>();
  const byes = new Set<string>();
  const played = status === "finished" ? rounds : Math.max(1, rounds - 1);
  for (let r = 1; r <= played; r++) {
    const out = generatePairings({
      players: field.map((p) => ({ id: p.id, score: score.get(p.id)!, rating: p.rating })),
      previousPairs: previous,
      colorStats: colors,
      byeHistory: byes,
      mode: "swiss",
    });
    const pairings = out.pairs.map((pair, i) => {
      const w = field.find((p) => p.id === pair.whiteId)!;
      const b = field.find((p) => p.id === pair.blackId)!;
      const g = game(w, b, { tournamentId: id, round: r, board: i + 1 });
      // Leave the last round of a running tournament open.
      if (status === "running" && r === played) {
        g.result = null;
        g.completedAt = null;
      }
      games.push(g);
      previous.add(pairKey(w.id, b.id));
      const sw = g.result === "1-0" || g.result === "+/-" ? 1 : g.result === "1/2-1/2" ? 0.5 : g.result ? 0 : 0;
      score.set(w.id, score.get(w.id)! + sw);
      score.set(b.id, score.get(b.id)! + (g.result ? 1 - sw : 0));
      const bump = (pid: string, c: "white" | "black") => {
        const cs = colors.get(pid) ?? { white: 0, black: 0, last: null, streak: 0 };
        cs[c] += 1;
        cs.streak = cs.last === c ? cs.streak + 1 : 1;
        cs.last = c;
        colors.set(pid, cs);
      };
      bump(w.id, "white");
      bump(b.id, "black");
      return { board: i + 1, whiteId: w.id, blackId: b.id, gameId: g.id };
    });
    if (out.byeId) {
      byes.add(out.byeId);
      score.set(out.byeId, score.get(out.byeId)! + 1);
    }
    t.rounds.push({ number: r, pairings, byePlayerId: out.byeId, createdAt: new Date(clock).toISOString() });
    clock += 7 * 24 * 60 * 60 * 1000;
  }
  return t;
}

const tournaments: Tournament[] = [
  swiss("demo-t1", "Spring Open", active.slice(0, 9), 3, "finished"),
  swiss("demo-t2", "Autumn Rapid", active.slice(2, 10), 4, "running"),
];

// One club night with two rounds.
const night = active.slice(0, 7);
const sessionId = "demo-s1";
const sessionRounds = [1, 2].map((n) => {
  const shuffled = [...night].sort(() => random() - 0.5);
  const pairings = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    const g = game(shuffled[i], shuffled[i + 1], { sessionId, round: n, board: i / 2 + 1 });
    games.push(g);
    pairings.push({ board: i / 2 + 1, whiteId: shuffled[i].id, blackId: shuffled[i + 1].id, gameId: g.id });
  }
  return { number: n, pairings, byePlayerId: shuffled.length % 2 ? shuffled[shuffled.length - 1].id : null, createdAt: new Date(clock).toISOString() };
});

const raw: Partial<Database> = {
  version: 2,
  seq,
  players,
  games,
  tournaments,
  sessions: [{ id: sessionId, createdAt: sessionRounds[0].createdAt, closedAt: new Date(clock).toISOString(), presentIds: night.map((p) => p.id), rated: true, avoidRematches: true, rounds: sessionRounds }],
  seasons: [],
  activity: [{ id: "demo-a1", at: new Date().toISOString(), admin: true, text: "Demo club seeded" }],
  settings: {
    startRating: 1200,
    byePoints: 1,
    defaultTiebreaks: ["buchholz", "sonneborn", "direct", "wins"],
    club: { name: "Demo Chess Club", meets: "Thursdays 18:00", nextNight: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), announcement: "This is seeded demo data." },
  },
};

const db = migrate(raw);
recomputeRatings(db);
fs.mkdirSync(path.join(dir, "backups"), { recursive: true });
fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify(db, null, 2));
console.log(`Seeded ${db.players.length} players, ${db.games.length} games, ${db.tournaments.length} tournaments, ${db.sessions.length} club night → ${path.join(dir, "db.json")}`);
console.log(`Run it:  CHESS_DATA_DIR=${dirArg} NEXT_DIST_DIR=.next-e2e bun run dev -- -p 3001`);
