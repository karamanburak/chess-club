import { describe, expect, test } from "bun:test";
import { calendarEvent, challengeGameIds, nextSessionColors, parseSession, pruneChallenges, sessionScore } from "../challenges";
import { awaitsAnswerFrom, challengeCheck, clubChallenges, clubGroup, cleanTimeControl, combineDateTime, playedSummary, TIME_CONTROL_RE, drawColors, effectiveStatus, estimateDurationMinutes, expireChallenges, googleCalendarUrl, history, openBetween, pendingFor, recordable, sentBy, toIcs, upcoming } from "../challenges";
import { db, game, player } from "./fixtures";
import type { Challenge } from "../types";

const NOW = Date.parse("2026-09-18T10:00:00Z");
const hours = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

function challenge(over: Partial<Challenge>): Challenge {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    fromId: "a",
    toId: "b",
    at: hours(48),
    place: "",
    timeControl: "",
    note: "",
    status: "pending",
    proposedBy: "a",
    whiteId: null,
    rated: true,
    gameId: null,
    createdAt: hours(-1),
    updatedAt: hours(-1),
    ...over,
  };
}

describe("effectiveStatus / expireChallenges", () => {
  test("open challenges expire a day after their time, settled ones never change", () => {
    const fresh = challenge({ at: hours(2) });
    const stale = challenge({ at: hours(-30), status: "accepted" });
    const declined = challenge({ at: hours(-300), status: "declined" });
    expect(effectiveStatus(fresh, NOW)).toBe("pending");
    expect(effectiveStatus(stale, NOW)).toBe("expired");
    expect(effectiveStatus(challenge({ at: hours(-20) }), NOW)).toBe("pending");
    expect(effectiveStatus(declined, NOW)).toBe("declined");
    const d = db([player("a"), player("b")]);
    d.challenges = [fresh, stale, declined];
    expect(expireChallenges(d, NOW)).toBe(1);
    expect(stale.status).toBe("expired");
    expect(fresh.status).toBe("pending");
  });
});

describe("recordable", () => {
  test("an agreed game stays recordable after it expired, one that was never agreed does not", () => {
    const agreed = challenge({ at: hours(-30), status: "accepted", whiteId: "a" });
    const unanswered = challenge({ at: hours(-30) });
    const d = db([player("a"), player("b")]);
    d.challenges = [agreed, unanswered];
    expect(recordable(agreed)).toBe(true);
    expireChallenges(d, NOW);
    expect(agreed.status).toBe("expired");
    expect(recordable(agreed)).toBe(true);
    expect(unanswered.status).toBe("expired");
    expect(recordable(unanswered)).toBe(false);
    expect(recordable(challenge({ status: "declined" }))).toBe(false);
    expect(recordable(challenge({ status: "played", whiteId: "a" }))).toBe(false);
  });
});

describe("who sees what", () => {
  test("pending for the answering side, sent for the proposer, upcoming once accepted", () => {
    const d = db([player("a"), player("b"), player("c")]);
    const toB = challenge({ id: "1" });
    const counter = challenge({ id: "2", fromId: "a", toId: "c", proposedBy: "c" });
    const accepted = challenge({ id: "3", fromId: "b", toId: "c", status: "accepted", at: hours(5) });
    const old = challenge({ id: "4", fromId: "a", toId: "b", status: "played", at: hours(-100), updatedAt: hours(-99) });
    d.challenges = [toB, counter, accepted, old];

    expect(pendingFor(d, "b", NOW).map((c) => c.id)).toEqual(["1"]);
    expect(pendingFor(d, "a", NOW).map((c) => c.id)).toEqual(["2"]);
    expect(sentBy(d, "a", NOW).map((c) => c.id)).toEqual(["1"]);
    expect(upcoming(d, undefined, NOW).map((c) => c.id)).toEqual(["3"]);
    expect(upcoming(d, "a", NOW)).toEqual([]);
    expect(history(d, "a", NOW).map((c) => c.id)).toEqual(["4"]);
    expect(awaitsAnswerFrom(toB, "b", NOW)).toBe(true);
    expect(awaitsAnswerFrom(toB, "a", NOW)).toBe(false);
  });
});

describe("challengeCheck", () => {
  test("refuses self, unknown, inactive, past and duplicates", () => {
    const d = db([player("a"), player("b"), player("c", 1200, { active: false })]);
    expect(challengeCheck(d, "a", "a", hours(1), NOW)).toBe("self");
    expect(challengeCheck(d, "a", "zz", hours(1), NOW)).toBe("notFound");
    expect(challengeCheck(d, "a", "c", hours(1), NOW)).toBe("inactive");
    expect(challengeCheck(d, "a", "b", hours(-1), NOW)).toBe("past");
    // "right now" is stamped a moment before the check runs and phones' clocks drift: a few minutes back is fine
    expect(challengeCheck(d, "a", "b", new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBeNull();
    expect(challengeCheck(d, "a", "b", "nonsense", NOW)).toBe("past");
    expect(challengeCheck(d, "a", "b", hours(1), NOW)).toBeNull();
    d.challenges = [challenge({ fromId: "b", toId: "a", proposedBy: "b", at: hours(1) })];
    // the very same minute again is a double send; another day, or right after, is a new game
    expect(challengeCheck(d, "a", "b", hours(1), NOW)).toBe("exists");
    expect(challengeCheck(d, "a", "b", hours(26), NOW)).toBeNull();
    expect(challengeCheck(d, "a", "b", hours(1.25), NOW)).toBeNull();
    expect(openBetween(d, "a", "b", NOW)).toHaveLength(1);
    // an expired one does not count
    d.challenges[0].at = hours(-40);
    expect(challengeCheck(d, "a", "b", hours(1), NOW)).toBeNull();
    expect(openBetween(d, "a", "b", NOW)).toHaveLength(0);
  });

  test("two players may arrange a series, up to five open at once, listed soonest first", () => {
    const d = db([player("a"), player("b")]);
    d.challenges = [5, 2, 4, 1, 3].map((h, i) => challenge({ id: `c${i}`, at: hours(h * 24) }));
    expect(openBetween(d, "a", "b", NOW).map((c) => c.at)).toEqual([1, 2, 3, 4, 5].map((h) => hours(h * 24)));
    expect(challengeCheck(d, "a", "b", hours(6 * 24), NOW)).toBe("tooMany");
    d.challenges[0].status = "declined";
    expect(challengeCheck(d, "a", "b", hours(6 * 24), NOW)).toBeNull();
  });
});

describe("drawColors", () => {
  test("is a coin flip between the two players, never anyone else", () => {
    const c = challenge({});
    expect(drawColors(c, () => 0.2)).toEqual({ whiteId: "a", blackId: "b" });
    expect(drawColors(c, () => 0.8)).toEqual({ whiteId: "b", blackId: "a" });
    const seen = new Set(Array.from({ length: 50 }, () => drawColors(c).whiteId));
    expect([...seen].every((id) => id === "a" || id === "b")).toBe(true);
  });
});

describe("estimateDurationMinutes", () => {
  test("follows the time control, rounds up to quarter hours, never under 30", () => {
    expect(estimateDurationMinutes("")).toBe(30);
    expect(estimateDurationMinutes("nonsense")).toBe(30);
    expect(estimateDurationMinutes("5+3")).toBe(30);
    expect(estimateDurationMinutes("10+0")).toBe(30);
    expect(estimateDurationMinutes("15+10")).toBe(45);
    expect(estimateDurationMinutes("25+10")).toBe(75);
    expect(estimateDurationMinutes("90+30")).toBe(225);
    expect(estimateDurationMinutes("90 min")).toBe(180);
    expect(estimateDurationMinutes("0+0")).toBe(30);
  });
});

describe("googleCalendarUrl", () => {
  test("prefills title, time span, place and notes", () => {
    const url = new URL(googleCalendarUrl(challenge({ at: "2026-09-20T16:30:00.000Z", place: "Room 3.14", timeControl: "15+10", note: "Bring a clock", whiteId: "b" }), { from: "Anna", to: "Berk", club: "Test Club" }));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("♟ Board Time · Test Club");
    // 15+10 → 2 × (15 + 40×10/60) ≈ 43 min → 45 min slot
    expect(url.searchParams.get("dates")).toBe("20260920T163000Z/20260920T171500Z");
    expect(url.searchParams.get("location")).toBe("Room 3.14");
    expect(url.searchParams.get("details")).toBe("Anna – Berk\nBerk has white\nTime control 15+10\nBring a clock");
  });
});

describe("combineDateTime / toIcs", () => {
  test("form fields combine into an ISO stamp and reject garbage", () => {
    // 18:30 Berlin summer time is 16:30 UTC, whatever zone the server runs in
    expect(combineDateTime("2026-09-20", "18:30")).toBe("2026-09-20T16:30:00.000Z");
    expect(combineDateTime("20.09.2026", "18:30")).toBeNull();
    expect(combineDateTime("2026-09-20", "6pm")).toBeNull();
  });

  test("the calendar file is titled after the club and carries the pairing, place and time", () => {
    const ics = toIcs(challenge({ id: "x", at: "2026-09-20T16:30:00.000Z", place: "Room 3.14", timeControl: "15+10", note: "Bring a clock" }), { from: "Anna", to: "Berk", club: "Test Club" }, { title: "♟ Brettzeit", hasWhite: "{name} hat Weiß", timeControl: "Bedenkzeit {tc}" });
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:♟ Brettzeit · Test Club");
    expect(ics).toContain("DTSTART:20260920T163000Z");
    expect(ics).toContain("DTEND:20260920T171500Z");
    expect(ics).toContain("LOCATION:Room 3.14");
    expect(ics).toContain("DESCRIPTION:Anna – Berk\\nBedenkzeit 15+10\\nBring a clock");
    expect(ics.split("\r\n").every((l) => !l.includes("\n"))).toBe(true);
  });
});

describe("playedSummary", () => {
  const g = game("a", "b", "1-0", { whiteRatingBefore: 1500, whiteRatingAfter: 1507, blackRatingBefore: 1400, blackRatingAfter: 1393 });

  test("tells each side how it went and how many points moved", () => {
    expect(playedSummary(g, "a")).toEqual({ outcome: "won", delta: 7 });
    expect(playedSummary(g, "b")).toEqual({ outcome: "lost", delta: -7 });
  });

  test("a draw is a draw, a forfeit counts as won or lost, an unrated game moves nothing", () => {
    expect(playedSummary(game("a", "b", "1/2-1/2", { whiteRatingBefore: 1500, whiteRatingAfter: 1500 }), "a")).toEqual({ outcome: "draw", delta: 0 });
    expect(playedSummary(game("a", "b", "-/+", { rated: false }), "a")).toEqual({ outcome: "lost", delta: null });
    expect(playedSummary(game("a", "b", "1-0", { rated: false }), "b")).toEqual({ outcome: "lost", delta: null });
  });

  test("an onlooker or a guest gets no verdict", () => {
    expect(playedSummary(g, "c")).toEqual({ outcome: null, delta: null });
    expect(playedSummary(g, null)).toEqual({ outcome: null, delta: null });
    expect(playedSummary(game("a", "b", null), "a")).toEqual({ outcome: null, delta: null });
  });
});

describe("time control field", () => {
  test("accepts minutes with an optional +increment and nothing else", () => {
    for (const ok of ["15+10", "5+3", "10", "90+30"]) expect(TIME_CONTROL_RE.test(ok)).toBe(true);
    for (const bad of ["", "+10", "15+", "15 + 10", "15+10+5", "blitz", "15min", "5-3"]) expect(TIME_CONTROL_RE.test(bad)).toBe(false);
  });

  test("while typing, letters vanish, a leading + is dropped and only the first + survives", () => {
    expect(cleanTimeControl("15+10")).toBe("15+10");
    expect(cleanTimeControl("+15")).toBe("15");
    expect(cleanTimeControl("1a5+b10")).toBe("15+10");
    expect(cleanTimeControl("15++10")).toBe("15+10");
    expect(cleanTimeControl("15+10+5")).toBe("15+105");
    expect(cleanTimeControl("blitz")).toBe("");
  });
});

describe("pruneChallenges and merge", () => {
  test("drops challenges of missing players and played ones whose game went", async () => {
    const { pruneChallenges } = await import("../challenges");
    const g = game("a", "b", "1-0");
    const d = db([player("a"), player("b")], [g]);
    d.challenges = [
      challenge({ id: "keep" }),
      challenge({ id: "ghost", toId: "zed" }),
      challenge({ id: "played", status: "played", gameId: g.id }),
      challenge({ id: "lost", status: "played", gameId: "gone" }),
    ];
    expect(pruneChallenges(d)).toBe(2);
    expect(d.challenges.map((c) => c.id)).toEqual(["keep", "played"]);
  });

  test("a merge rewrites challenges and drops one the two records had with each other", async () => {
    const { mergePlayers } = await import("../merge");
    const d = db([player("a"), player("b"), player("dup")]);
    d.challenges = [challenge({ id: "moved", fromId: "dup", toId: "b", proposedBy: "dup", whiteId: "dup" }), challenge({ id: "self", fromId: "dup", toId: "a" })];
    mergePlayers(d, "dup", "a");
    expect(d.challenges.map((c) => [c.id, c.fromId, c.toId, c.proposedBy, c.whiteId])).toEqual([["moved", "a", "b", "a", "a"]]);
  });
});

describe("clubChallenges (admin overview)", () => {
  test("groups every challenge, filters by group and player, open ones first by date", () => {
    const d = db([player("a"), player("b"), player("c")]);
    d.challenges = [
      challenge({ id: "later", at: hours(50) }),
      challenge({ id: "soon", at: hours(5), fromId: "b", toId: "c", status: "accepted", whiteId: "b" }),
      challenge({ id: "old", status: "played", gameId: "g", updatedAt: hours(-5) }),
      challenge({ id: "newer", status: "declined", updatedAt: hours(-2) }),
      challenge({ id: "lapsed", at: hours(-30), updatedAt: hours(-40) }),
    ];
    expect(clubChallenges(d, {}, NOW).map((c) => c.id)).toEqual(["soon", "later", "newer", "old", "lapsed"]);
    expect(clubGroup(d.challenges[4], NOW)).toBe("settled");
    expect(clubChallenges(d, { status: "settled" }, NOW).map((c) => c.id)).toEqual(["newer", "lapsed"]);
    expect(clubChallenges(d, { status: "accepted" }, NOW).map((c) => c.id)).toEqual(["soon"]);
    expect(clubChallenges(d, { playerId: "c" }, NOW).map((c) => c.id)).toEqual(["soon"]);
  });
});

describe("sessions", () => {
  test("parseSession: a single game, a valid session, or invalid values", () => {
    expect(parseSession("game", "60", "each")).toBeNull();
    expect(parseSession("session", "120", "each")).toEqual({ minutes: 120, scoring: "each" });
    expect(parseSession("session", "90", "single")).toEqual({ minutes: 90, scoring: "single" });
    expect(parseSession("session", "45", "each")).toBe("invalid");
    expect(parseSession("session", "60", "best-of")).toBe("invalid");
  });

  test("colours start from the draw and swap game by game; the score adds up per side", () => {
    const c = challenge({ status: "accepted", whiteId: "b", session: { minutes: 60, scoring: "each" }, gameIds: [] });
    expect(nextSessionColors(c)).toEqual({ whiteId: "b", blackId: "a" });
    const g1 = game("b", "a", "1-0");
    c.gameIds = [g1.id];
    expect(nextSessionColors(c)).toEqual({ whiteId: "a", blackId: "b" });
    const g2 = game("a", "b", "1/2-1/2");
    const g3 = game("b", "a", "0-1");
    c.gameIds = [g1.id, g2.id, g3.id];
    const games = new Map([g1, g2, g3].map((g) => [g.id, g]));
    // a (fromId): lost, drew, won → 1.5; b: 1.5
    expect(sessionScore(c, games)).toEqual({ from: 1.5, to: 1.5, games: 3 });
    expect(challengeGameIds(c)).toEqual([g1.id, g2.id, g3.id]);
    expect(challengeGameIds(challenge({ gameId: "x" }))).toEqual(["x"]);
  });

  test("the calendar blocks the booked length of a session", () => {
    const c = challenge({ status: "accepted", timeControl: "3+2", session: { minutes: 120, scoring: "each" } });
    const ev = calendarEvent(c, { from: "A", to: "B", club: "C" });
    expect((ev.end.getTime() - ev.start.getTime()) / 60_000).toBe(120);
  });

  test("pruning keeps a session with games left and drops a finished one whose games all went", () => {
    const g = game("a", "b", "1-0");
    const d = db([player("a"), player("b")], [g]);
    d.challenges = [
      challenge({ id: "kept", status: "played", session: { minutes: 60, scoring: "each" }, gameIds: [g.id, "gone"] }),
      challenge({ id: "empty", status: "played", session: { minutes: 60, scoring: "each" }, gameIds: ["gone"] }),
    ];
    pruneChallenges(d);
    expect(d.challenges.map((c) => [c.id, c.gameIds])).toEqual([["kept", [g.id]]]);
  });
});
