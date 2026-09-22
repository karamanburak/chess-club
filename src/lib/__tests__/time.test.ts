import { describe, expect, test } from "bun:test";
import { clubTimeZone, dayOf, daysFromToday, localDay, localMonth, localTime, sameLocalDay, zonedToUtc } from "../time";

const BERLIN = "Europe/Berlin";

describe("clubTimeZone", () => {
  test("defaults to Berlin, honours a valid override and ignores a broken one", () => {
    expect(clubTimeZone({})).toBe(BERLIN);
    expect(clubTimeZone({ CLUB_TIME_ZONE: " Europe/Istanbul " })).toBe("Europe/Istanbul");
    expect(clubTimeZone({ CLUB_TIME_ZONE: "Mars/Olympus" })).toBe(BERLIN);
  });
});

describe("localDay / localTime / localMonth", () => {
  test("a game finished at 12:41Z in September shows as 14:41 on the 22nd in Berlin", () => {
    const d = new Date("2026-09-22T12:41:00Z");
    expect(localDay(d, BERLIN)).toBe("2026-09-22");
    expect(localTime(d, BERLIN)).toBe("14:41");
  });

  test("late evening UTC is already the next day, and the next month, in Berlin", () => {
    const d = new Date("2026-09-30T22:30:00Z");
    expect(localDay(d, BERLIN)).toBe("2026-10-01");
    expect(localMonth(d, BERLIN)).toBe("2026-10");
    expect(localDay(d, "UTC")).toBe("2026-09-30");
  });

  test("midnight in Berlin reads 00:xx, not 24:xx", () => {
    expect(localTime(new Date("2026-01-14T23:05:00Z"), BERLIN)).toBe("00:05");
  });
});

describe("zonedToUtc", () => {
  test("18:00 club time is 16:00Z in summer and 17:00Z in winter", () => {
    expect(zonedToUtc("2026-07-10", "18:00", BERLIN)).toBe("2026-07-10T16:00:00.000Z");
    expect(zonedToUtc("2026-01-10", "18:00", BERLIN)).toBe("2026-01-10T17:00:00.000Z");
  });

  test("round-trips with localDay/localTime on both sides of the DST switch", () => {
    for (const [day, time] of [
      ["2026-03-28", "18:00"],
      ["2026-03-29", "18:00"], // clocks went forward this morning
      ["2026-10-24", "18:00"],
      ["2026-10-25", "18:00"], // clocks went back this morning
      ["2026-12-31", "23:59"],
    ]) {
      const iso = zonedToUtc(day, time, BERLIN)!;
      expect(localDay(new Date(iso), BERLIN)).toBe(day);
      expect(localTime(new Date(iso), BERLIN)).toBe(time);
    }
  });

  test("a wall time skipped by the spring jump lands an hour later, like a real clock", () => {
    // 02:30 on 2026-03-29 does not exist in Berlin; 03:30 CEST = 01:30Z
    expect(zonedToUtc("2026-03-29", "02:30", BERLIN)).toBe("2026-03-29T01:30:00.000Z");
  });

  test("rejects malformed and out-of-range input", () => {
    expect(zonedToUtc("20.09.2026", "18:30", BERLIN)).toBeNull();
    expect(zonedToUtc("2026-09-20", "6pm", BERLIN)).toBeNull();
    expect(zonedToUtc("2026-13-20", "18:30", BERLIN)).toBeNull();
    expect(zonedToUtc("2026-09-20", "25:00", BERLIN)).toBeNull();
  });
});

describe("dayOf / sameLocalDay / daysFromToday", () => {
  test("a plain date stays, an instant is converted, garbage passes through", () => {
    expect(dayOf("2026-09-22", BERLIN)).toBe("2026-09-22");
    expect(dayOf("2026-09-22T22:30:00Z", BERLIN)).toBe("2026-09-23");
    expect(dayOf("?", BERLIN)).toBe("?");
  });

  test("a challenge at 23:30Z tonight is tomorrow's game in Berlin", () => {
    const now = new Date("2026-09-22T20:00:00Z");
    expect(sameLocalDay("2026-09-22T21:00:00Z", now, BERLIN)).toBe(true);
    expect(sameLocalDay("2026-09-22T23:30:00Z", now, BERLIN)).toBe(false);
    expect(sameLocalDay("nope", now, BERLIN)).toBe(false);
  });

  test("days until the next club night count club days, so 23:00Z on the eve is still one day away", () => {
    const eve = new Date("2026-09-23T23:00:00Z"); // already the 24th in Berlin
    expect(daysFromToday("2026-09-25", eve, BERLIN)).toBe(1);
    expect(daysFromToday("2026-09-24", eve, BERLIN)).toBe(0);
    expect(daysFromToday("2026-09-20", eve, BERLIN)).toBe(-4);
    expect(daysFromToday("soon", eve, BERLIN)).toBeNull();
  });
});
