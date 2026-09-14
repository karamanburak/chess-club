import { describe, expect, test } from "bun:test";
import { dayNumber, QUOTES, quoteOfTheDay } from "../quotes";

describe("quote of the day", () => {
  test("every quote has text and an author, no duplicates", () => {
    expect(QUOTES.length).toBeGreaterThan(30);
    for (const q of QUOTES) {
      expect(q.text.length).toBeGreaterThan(5);
      expect(q.by.length).toBeGreaterThan(2);
    }
    expect(new Set(QUOTES.map((q) => q.text)).size).toBe(QUOTES.length);
  });

  test("stays the same all day and changes at midnight", () => {
    const morning = new Date(2026, 8, 14, 7, 0);
    const night = new Date(2026, 8, 14, 23, 59);
    const tomorrow = new Date(2026, 8, 15, 0, 1);
    expect(quoteOfTheDay(morning)).toEqual(quoteOfTheDay(night));
    expect(dayNumber(tomorrow)).toBe(dayNumber(morning) + 1);
    expect(quoteOfTheDay(tomorrow)).not.toEqual(quoteOfTheDay(morning));
  });
});
