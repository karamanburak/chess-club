import { describe, expect, test } from "bun:test";
import { eventIcs } from "../challenges";
import { carrySchedules, cleanDay, deadlineState, gameCalendarEvent, schedulableIn, scheduledGames, SCHEDULE_KEEP_MS } from "../schedule";
import { db, game, player, tournament } from "./fixtures";

const NOW = new Date("2026-12-01T10:00:00.000Z");
const at = (iso: string) => ({ tournamentId: "t1", round: 1, board: 1, scheduledAt: iso });

function club(games: ReturnType<typeof game>[], extra: Parameters<typeof tournament>[1] = {}) {
  return db([player("a"), player("b"), player("c"), player("d")], games, [tournament(["a", "b", "c", "d"], extra)]);
}

describe("schedulableIn", () => {
  test("an unplayed board of a running tournament can get a time", () => {
    const g = game("a", "b", null, { tournamentId: "t1", round: 1, board: 1 });
    expect(schedulableIn(club([g]), g)?.id).toBe("t1");
  });

  test("played games, friendlies, forfeit entries and finished tournaments cannot", () => {
    const played = game("a", "b", "1-0", { tournamentId: "t1", round: 1, board: 1 });
    const friendly = game("a", "b", null);
    const forfeit = game("a", "b", null, { tournamentId: "t1", round: 1, board: 0 });
    const d = club([played, friendly, forfeit]);
    expect(schedulableIn(d, played)).toBeNull();
    expect(schedulableIn(d, friendly)).toBeNull();
    expect(schedulableIn(d, forfeit)).toBeNull();
    const open = game("c", "d", null, { tournamentId: "t1", round: 1, board: 2 });
    expect(schedulableIn(club([open], { status: "finished" }), open)).toBeNull();
  });
});

describe("scheduledGames", () => {
  test("lists agreed, unplayed games soonest first and only a player's own when asked", () => {
    const later = game("a", "b", null, at("2026-12-05T17:00:00.000Z"));
    const sooner = game("c", "d", null, { ...at("2026-12-03T17:00:00.000Z"), board: 2, place: "Club room" });
    const open = game("a", "c", null, { tournamentId: "t1", round: 2, board: 1 });
    const d = club([later, sooner, open]);
    expect(scheduledGames(d, undefined, NOW.getTime()).map((s) => s.game.id)).toEqual([sooner.id, later.id]);
    expect(scheduledGames(d, "a", NOW.getTime()).map((s) => s.game.id)).toEqual([later.id]);
    expect(scheduledGames(d, undefined, NOW.getTime())[0].place).toBe("Club room");
  });

  test("a game with a result or in a finished tournament drops out", () => {
    const played = game("a", "b", "1-0", at("2026-12-05T17:00:00.000Z"));
    expect(scheduledGames(club([played]), undefined, NOW.getTime())).toEqual([]);
    const open = game("a", "b", null, at("2026-12-05T17:00:00.000Z"));
    expect(scheduledGames(club([open], { status: "finished" }), undefined, NOW.getTime())).toEqual([]);
  });

  test("a slot that passed stays for a day, then goes", () => {
    const g = game("a", "b", null, at("2026-12-01T08:00:00.000Z"));
    const d = club([g]);
    expect(scheduledGames(d, undefined, NOW.getTime())).toHaveLength(1);
    expect(scheduledGames(d, undefined, new Date(g.scheduledAt!).getTime() + SCHEDULE_KEEP_MS + 1)).toEqual([]);
  });
});

describe("deadlineState", () => {
  test("counts club days, not server days", () => {
    // 23:30 UTC on 30 Nov is already 1 Dec in Berlin.
    const lateEvening = new Date("2026-11-30T23:30:00.000Z");
    expect(deadlineState({ deadline: "2026-12-01" }, lateEvening)).toEqual({ state: "today", days: 0 });
    expect(deadlineState({ deadline: "2026-11-30" }, lateEvening)).toEqual({ state: "overdue", days: -1 });
  });

  test("soon within three days, open beyond, nothing without a deadline", () => {
    expect(deadlineState({ deadline: "2026-12-04" }, NOW)?.state).toBe("soon");
    expect(deadlineState({ deadline: "2026-12-05" }, NOW)?.state).toBe("open");
    expect(deadlineState({}, NOW)).toBeNull();
    expect(deadlineState({ deadline: "soon" }, NOW)).toBeNull();
  });
});

describe("cleanDay", () => {
  test("keeps a real day and refuses anything else", () => {
    expect(cleanDay("2026-12-07")).toBe("2026-12-07");
    expect(cleanDay("2026-13-07")).toBeNull();
    expect(cleanDay("07.12.2026")).toBeNull();
    expect(cleanDay("")).toBeNull();
  });
});

describe("carrySchedules", () => {
  test("a pair that stays together keeps its time even with colours flipped; a new pair starts empty", () => {
    const old = [game("a", "b", null, { ...at("2026-12-05T17:00:00.000Z"), place: "Café" }), game("c", "d", null, at("2026-12-06T17:00:00.000Z"))];
    const fresh = [game("b", "a", null), game("c", "a", null)];
    carrySchedules(old, fresh);
    expect(fresh[0].scheduledAt).toBe("2026-12-05T17:00:00.000Z");
    expect(fresh[0].place).toBe("Café");
    expect(fresh[1].scheduledAt).toBeUndefined();
  });
});

describe("gameCalendarEvent", () => {
  const facts = { white: "Ada", black: "Bo", club: "Test Club", where: "Winter Open · Round 3", timeControl: "15+10" };

  test("names the pairing, the round and the colours and blocks the time the control needs", () => {
    const ev = gameCalendarEvent({ scheduledAt: "2026-12-05T17:00:00.000Z", place: "Club room" }, facts)!;
    expect(ev.title).toBe("♟ Board Time · Test Club");
    expect(ev.description.split("\n")).toEqual(["Ada – Bo", "Winter Open · Round 3", "Ada has white", "Time control 15+10"]);
    expect(ev.location).toBe("Club room");
    // 2 × (15 + 40 × 10 s) = 43.3 min → next quarter hour.
    expect(ev.end.getTime() - ev.start.getTime()).toBe(45 * 60_000);
  });

  test("no time, no entry; the file carries a stable id of its own", () => {
    expect(gameCalendarEvent({ scheduledAt: null }, facts)).toBeNull();
    const ev = gameCalendarEvent({ scheduledAt: "2026-12-05T17:00:00.000Z" }, facts)!;
    const ics = eventIcs(ev, "game-g1", new Date("2026-12-01T10:00:00.000Z"));
    expect(ics).toContain("UID:game-g1@chess-club");
    expect(ics).toContain("DTSTART:20261205T170000Z");
    expect(ics).not.toContain("LOCATION");
  });
});
