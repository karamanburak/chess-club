import { describe, expect, test } from "bun:test";
import { recomputeRatings } from "../elo";
import { achievements, currentSeason, daysUntil, highlights, monthChampions, nextTitle, seasonOverdue, seasonTable, titleFor, TITLE_GAMES, tournamentWinners } from "../club";
import { db, game, player, tournament } from "./fixtures";
import type { Season } from "../types";

describe("titles", () => {
  test("need TITLE_GAMES games and follow rating bands", () => {
    expect(titleFor({ rating: 1600, gamesPlayed: TITLE_GAMES - 1 })).toBeNull();
    expect(titleFor({ rating: 1000, gamesPlayed: 20 })?.key).toBe("novice");
    expect(titleFor({ rating: 1100, gamesPlayed: 20 })?.key).toBe("club");
    expect(titleFor({ rating: 1499, gamesPlayed: 20 })?.key).toBe("expert");
    expect(titleFor({ rating: 1500, gamesPlayed: 20 })?.key).toBe("master");
    expect(titleFor({ rating: 1900, gamesPlayed: 20 })?.key).toBe("grandmaster");
  });

  test("nextTitle says what is missing", () => {
    expect(nextTitle({ rating: 1450, gamesPlayed: 20 })).toMatchObject({ title: { key: "master" }, missing: 50 });
    expect(nextTitle({ rating: 1450, gamesPlayed: 4 })).toMatchObject({ games: TITLE_GAMES - 4 });
    expect(nextTitle({ rating: 2000, gamesPlayed: 50 })).toBeNull();
  });
});

describe("achievements", () => {
  test("first win, hat-trick, giant slayer and comeback are dated by the game that earned them", () => {
    const a = player("a", 1200);
    const b = player("b", 1500);
    const games = [
      game("b", "a", "1-0"), // a loses
      game("a", "b", "0-1"), // a loses
      game("b", "a", "1-0"), // a loses (3 in a row)
      game("a", "b", "1-0"), // a wins: first win, comeback, giant slayer (b ~1500 vs a ~1150)
      game("a", "b", "1-0"),
      game("a", "b", "1-0"), // hat-trick
    ];
    const d = db([a, b], games);
    recomputeRatings(d);
    const got = Object.fromEntries(achievements(d, "a").map((x) => [x.key, x.earnedAt]));
    expect(got["first-win"]).toBe(games[3].completedAt);
    expect(got["comeback"]).toBe(games[3].completedAt);
    expect(got["giant-slayer"]).toBe(games[3].completedAt);
    expect(got["streak-3"]).toBe(games[5].completedAt);
    expect(got["streak-5"]).toBeNull();
    expect(got["games-10"]).toBeNull();
    // b never lost three in a row and never beat a stronger player.
    const gotB = Object.fromEntries(achievements(d, "b").map((x) => [x.key, x.earnedAt]));
    expect(gotB["first-win"]).toBe(games[0].completedAt);
    expect(gotB["giant-slayer"]).toBeNull();
  });

  test("club night badges come from sessions", () => {
    const a = player("a");
    const b = player("b");
    const g = [game("a", "b", "1-0"), game("b", "a", "0-1"), game("a", "b", "1-0")].map((x) => ({ ...x, sessionId: "s1" }));
    const d = db([a, b], g);
    d.sessions.push({ id: "s1", createdAt: "2026-01-01T18:00:00.000Z", closedAt: "2026-01-01T21:00:00.000Z", presentIds: ["a", "b"], rated: true, avoidRematches: true, rounds: [] });
    recomputeRatings(d);
    const got = Object.fromEntries(achievements(d, "a").map((x) => [x.key, x.earnedAt]));
    expect(got["perfect-night"]).toBe("2026-01-01T21:00:00.000Z");
    expect(got["night-owl"]).toBeNull();
    expect(Object.fromEntries(achievements(d, "b").map((x) => [x.key, x.earnedAt]))["perfect-night"]).toBeNull();
  });

  test("tournament winner badge follows the final standings", () => {
    const a = player("a");
    const b = player("b");
    const g = game("a", "b", "1-0", { tournamentId: "t1", round: 1, board: 1 });
    const t = tournament(["a", "b"], {
      status: "finished",
      rounds: [{ number: 1, pairings: [{ board: 1, whiteId: "a", blackId: "b", gameId: g.id }], byePlayerId: null, createdAt: "x" }],
    });
    const d = db([a, b], [g], [t]);
    recomputeRatings(d);
    expect(tournamentWinners(d)[0]).toMatchObject({ playerId: "a", runnerUpId: "b" });
    expect(achievements(d, "a").find((x) => x.key === "tournament-winner")?.earnedAt).toBe("2026-01-10T23:59:59.000Z");
    // Not finished → no winner yet.
    expect(tournamentWinners(db([a, b], [g], [{ ...t, status: "running" }]))).toEqual([]);
  });
});

describe("seasons", () => {
  const season: Season = { id: "s", name: "S", start: "2026-01-03", end: "2026-01-05", championId: null };

  test("only games inside the window count; points are 1 / ½ / 0", () => {
    const d = db([player("a"), player("b"), player("c")], [
      game("a", "b", "1-0", { completedAt: "2026-01-02T12:00:00.000Z" }), // before
      game("a", "b", "1-0", { completedAt: "2026-01-03T12:00:00.000Z" }),
      game("b", "c", "1/2-1/2", { completedAt: "2026-01-05T21:00:00.000Z" }), // 22:00 Berlin on the last day counts
      game("b", "c", "1-0", { completedAt: "2026-01-05T23:30:00.000Z" }), // 00:30 Berlin on the 6th: after
      game("c", "a", "1-0", { completedAt: "2026-01-06T12:00:00.000Z" }), // after
      game("a", "c", "+/-", { completedAt: "2026-01-04T12:00:00.000Z" }), // forfeit never counts
    ]);
    recomputeRatings(d);
    const rows = seasonTable(d, season);
    const by = Object.fromEntries(rows.map((r) => [r.playerId, r]));
    expect(rows[0].playerId).toBe("a");
    expect([by.a.points, by.a.games]).toEqual([1, 1]);
    expect([by.b.points, by.b.games]).toEqual([0.5, 2]);
    expect([by.c.points, by.c.games]).toEqual([0.5, 1]);
    expect(by.a.ratingChange).toBeGreaterThan(0);
    // b and c tie on points and wins; the one who lost fewer rating points ranks higher.
    expect(rows[1].ratingChange).toBeGreaterThanOrEqual(rows[2].ratingChange);
  });

  test("an open season runs until now", () => {
    const d = db([player("a"), player("b")], [game("a", "b", "1-0", { completedAt: new Date().toISOString() })]);
    d.seasons.push({ id: "open", name: "Open", start: "2020-01-01", end: null, championId: null });
    recomputeRatings(d);
    expect(currentSeason(d)?.id).toBe("open");
    expect(seasonTable(d, d.seasons[0])[0]).toMatchObject({ playerId: "a", points: 1 });
  });
});

describe("month champions and highlights", () => {
  test("player of the month needs a minimum number of games", () => {
    const d = db([player("a"), player("b")], [game("a", "b", "1-0"), game("a", "b", "1-0"), game("b", "a", "0-1")]);
    recomputeRatings(d);
    expect(monthChampions(d, 3)[0]).toMatchObject({ month: "2026-01", playerId: "a", points: 3, games: 3 });
    expect(monthChampions(d, 4)).toEqual([]);
  });

  test("highlights pick up a hot streak from recent games", () => {
    const now = Date.now();
    const at = (daysAgo: number) => new Date(now - daysAgo * 86400_000).toISOString();
    const d = db([player("a"), player("b")], [game("a", "b", "1-0", { completedAt: at(3) }), game("b", "a", "0-1", { completedAt: at(2) }), game("a", "b", "1-0", { completedAt: at(1) })]);
    recomputeRatings(d);
    const hl = highlights(d, 14);
    expect(hl.find((h) => h.key === "hot")).toMatchObject({ playerId: "a" });
    expect(hl.find((h) => h.key === "busiest")).toMatchObject({ playerId: "a" });
  });

  test("daysUntil", () => {
    const today = new Date();
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(daysUntil(iso(today))).toBe(0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    expect(daysUntil(iso(tomorrow))).toBe(1);
    expect(daysUntil("")).toBeNull();
  });
});

describe("seasonOverdue", () => {
  const season = (start: string, end: string | null = null) => ({ id: "s", name: "S", start, end, championId: null });
  test("a season within its own year is fine", () => {
    expect(seasonOverdue(season("2026-01-10"), "2026-11-30")).toBeNull();
  });
  test("a season that spilled well into the next year is overdue", () => {
    expect(seasonOverdue(season("2025-03-01"), "2026-03-15")).toBe(12);
    expect(seasonOverdue(season("2025-01-01"), "2026-02-20")).toBe(13);
  });
  test("a December start may run into January without nagging", () => {
    expect(seasonOverdue(season("2025-12-15"), "2026-01-20")).toBeNull();
    expect(seasonOverdue(season("2025-12-15"), "2026-03-01")).toBe(3);
  });
  test("closed seasons are never overdue", () => {
    expect(seasonOverdue(season("2020-01-01", "2020-12-31"), "2026-01-01")).toBeNull();
  });
});
