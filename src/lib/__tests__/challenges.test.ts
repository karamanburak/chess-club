import { describe, expect, test } from "bun:test";
import { awaitsAnswerFrom, challengeCheck, combineDateTime, drawColors, effectiveStatus, estimateDurationMinutes, expireChallenges, googleCalendarUrl, history, openBetween, pendingFor, sentBy, toIcs, upcoming } from "../challenges";
import { db, player } from "./fixtures";
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
    expect(challengeCheck(d, "a", "b", "nonsense", NOW)).toBe("past");
    expect(challengeCheck(d, "a", "b", hours(1), NOW)).toBeNull();
    d.challenges = [challenge({ fromId: "b", toId: "a", proposedBy: "b" })];
    expect(challengeCheck(d, "a", "b", hours(1), NOW)).toBe("exists");
    expect(openBetween(d, "a", "b", NOW)).toBeDefined();
    // an expired one does not block a new challenge
    d.challenges[0].at = hours(-40);
    expect(challengeCheck(d, "a", "b", hours(1), NOW)).toBeNull();
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
    expect(combineDateTime("2026-09-20", "18:30")).toMatch(/^2026-09-2\dT\d{2}:\d{2}:00\.000Z$/);
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
