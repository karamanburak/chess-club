import { describe, expect, test } from "bun:test";
import { sendSlack, slackEscape, slackRequest, slackWebhook, type SlackMessage } from "../slack";

const HOOK = "https://hooks.slack.com/services/T000/B000/abcDEF123";
const msg: SlackMessage = { text: "Ali challenged Veli", url: "https://club.example/challenges", linkLabel: "Challenges" };

describe("slackWebhook", () => {
  test("only a Slack webhook address turns it on", () => {
    expect(slackWebhook({})).toBeNull();
    expect(slackWebhook({ SLACK_WEBHOOK_URL: "  " })).toBeNull();
    expect(slackWebhook({ SLACK_WEBHOOK_URL: ` ${HOOK} ` })).toBe(HOOK);
    for (const bad of ["http://hooks.slack.com/services/T/B/x", "https://evil.example/services/T/B/x", "https://hooks.slack.com.evil.example/services/x"]) {
      expect(slackWebhook({ SLACK_WEBHOOK_URL: bad })).toBeNull();
    }
  });
});

describe("slackRequest", () => {
  test("escapes user text and appends the link", () => {
    expect(slackEscape("<!channel> & co")).toBe("&lt;!channel&gt; &amp; co");
    const { url, init } = slackRequest(msg, HOOK);
    expect(url).toBe(HOOK);
    expect(JSON.parse(init.body as string)).toEqual({ text: "Ali challenged Veli <https://club.example/challenges|Challenges>" });
    expect(JSON.parse(slackRequest({ ...msg, url: "" }, HOOK).init.body as string).text).toBe("Ali challenged Veli");
  });
});

describe("sendSlack", () => {
  test("no webhook, no network; a failing Slack never throws", async () => {
    const original = globalThis.fetch;
    const warn = console.warn;
    let calls = 0;
    console.warn = () => {};
    globalThis.fetch = (async () => {
      calls++;
      throw new Error("offline");
    }) as unknown as typeof fetch;
    try {
      await sendSlack([msg], {});
      expect(calls).toBe(0);
      await expect(sendSlack([msg, msg], { SLACK_WEBHOOK_URL: HOOK })).resolves.toBeUndefined();
      expect(calls).toBe(2);
    } finally {
      globalThis.fetch = original;
      console.warn = warn;
    }
  });
});

describe("slackLine", () => {
  test("names, time, place and format only, escaped; a session shows its length", async () => {
    const { slackLine } = await import("../slack-lines");
    const { db, player } = await import("./fixtures");
    const d = db([player("a", 1200, { name: "Ali <3" }), player("b", 1200, { name: "Veli & Co" })]);
    const base = {
      id: "c", fromId: "a", toId: "b", at: "2026-09-24T16:00:00.000Z", place: "Club room", timeControl: "10+0", note: "private note",
      status: "pending" as const, proposedBy: "a", whiteId: null, rated: true, gameId: null, createdAt: "x", updatedAt: "x",
    };
    const line = slackLine(d, base, "en", (m, f) => m.created.replace("{from}", f.from).replace("{to}", f.to).replace("{details}", f.details));
    expect(line).toContain("Ali &lt;3 challenged Veli &amp; Co");
    expect(line).toContain("Club room · 10+0");
    expect(line).not.toContain("private note");
    const session = slackLine(d, { ...base, timeControl: "", session: { minutes: 60, scoring: "each" } }, "de", (m, f) => `${f.details}`);
    expect(session).toContain("Session · 1 Std.");
  });
});
