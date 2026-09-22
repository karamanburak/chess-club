import { describe, expect, test } from "bun:test";
import { dayNumber, localizedQuote, QUOTES, quoteOfTheDay } from "../quotes";

describe("quote of the day", () => {
  test("every quote has text and an author, no duplicates", () => {
    expect(QUOTES.length).toBeGreaterThan(30);
    for (const q of QUOTES) {
      expect(q.text.length).toBeGreaterThan(5);
      expect(q.by.length).toBeGreaterThan(2);
      expect(q.de.length).toBeGreaterThan(5);
      expect(q.de).not.toBe(q.text);
    }
    expect(new Set(QUOTES.map((q) => q.text)).size).toBe(QUOTES.length);
    expect(new Set(QUOTES.map((q) => q.de)).size).toBe(QUOTES.length);
  });

  test("German readers get the German text and a German label for anonymous sources", () => {
    const proverb = QUOTES.find((q) => q.by === "Indian proverb")!;
    expect(localizedQuote(proverb, "de")).toEqual({ text: proverb.de, by: "Indisches Sprichwort" });
    expect(localizedQuote(QUOTES[0], "de").by).toBe(QUOTES[0].by);
    expect(localizedQuote(QUOTES[0], "en")).toEqual({ text: QUOTES[0].text, by: QUOTES[0].by });
  });

  test("stays the same all day and changes at Berlin midnight", () => {
    // Berlin is UTC+2 in September: 21:59Z is still the 14th there, 22:01Z is already the 15th
    const morning = new Date("2026-09-14T05:00:00Z");
    const night = new Date("2026-09-14T21:59:00Z");
    const tomorrow = new Date("2026-09-14T22:01:00Z");
    expect(quoteOfTheDay(morning)).toEqual(quoteOfTheDay(night));
    expect(dayNumber(tomorrow)).toBe(dayNumber(morning) + 1);
    expect(quoteOfTheDay(tomorrow)).not.toEqual(quoteOfTheDay(morning));
  });
});
