import { describe, expect, test } from "bun:test";
import { DEFAULT_NTFY_URL, ntfyLabel, ntfyRequest, ntfyServer, ntfyTopic, PLAYER_TOPIC_RE, sendNotifications, type Notification } from "../notify";

const note: Notification = { text: "Ali challenged Veli", title: "Türkischer Schachclub", admin: false, url: "https://club.example/admin#activity" };

describe("ntfyTopic", () => {
  test("an empty or missing NTFY_TOPIC means notifications are off", () => {
    expect(ntfyTopic({})).toBeNull();
    expect(ntfyTopic({ NTFY_TOPIC: "   " })).toBeNull();
    expect(ntfyTopic({ NTFY_TOPIC: " club-7f3k " })).toBe("club-7f3k");
  });
});

describe("ntfyServer / ntfyLabel", () => {
  test("defaults to ntfy.sh and strips a trailing slash from a self-hosted address", () => {
    expect(ntfyServer({})).toBe(DEFAULT_NTFY_URL);
    expect(ntfyServer({ NTFY_URL: "https://push.example.org/" })).toBe("https://push.example.org");
  });

  test("the label shown on Admin is host/topic without the scheme, or null when off", () => {
    expect(ntfyLabel({ NTFY_TOPIC: "club-7f3k" })).toBe("ntfy.sh/club-7f3k");
    expect(ntfyLabel({ NTFY_TOPIC: "x", NTFY_URL: "https://push.example.org/" })).toBe("push.example.org/x");
    expect(ntfyLabel({})).toBeNull();
  });
});

describe("ntfyRequest", () => {
  test("publishes as JSON to the server root so umlauts in the club name survive", () => {
    const { url, init } = ntfyRequest(note, { NTFY_TOPIC: "club-7f3k" });
    expect(url).toBe("https://ntfy.sh");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      topic: "club-7f3k",
      message: "Ali challenged Veli",
      title: "Türkischer Schachclub",
      tags: ["member"],
      click: "https://club.example/admin#activity",
    });
  });

  test("admin actions are tagged so the phone can tell them apart, and no origin means no click link", () => {
    const body = JSON.parse(ntfyRequest({ ...note, admin: true, url: "" }, { NTFY_TOPIC: "t" }).init.body as string);
    expect(body.tags).toEqual(["admin"]);
    expect("click" in body).toBe(false);
  });
});

describe("sendNotifications", () => {
  test("does not touch the network when no topic is set", async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;
    try {
      await sendNotifications([note], {});
      expect(calls).toBe(0);
      await sendNotifications([note, { ...note, text: "second" }], { NTFY_TOPIC: "t" });
      expect(calls).toBe(2);
    } finally {
      globalThis.fetch = original;
    }
  });

  test("a failing ntfy never throws into the action", async () => {
    const original = globalThis.fetch;
    const warn = console.warn;
    const warned: string[] = [];
    console.warn = (m: string) => void warned.push(m);
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    try {
      await expect(sendNotifications([note], { NTFY_TOPIC: "t" })).resolves.toBeUndefined();
      expect(warned.join(" ")).toContain("offline");
    } finally {
      globalThis.fetch = original;
      console.warn = warn;
    }
  });
});

describe("personal topics", () => {
  test("a player's line goes to their own topic, even when the club has none", async () => {
    expect(JSON.parse(ntfyRequest({ ...note, topic: "burak-7f3k9q2m" }, { NTFY_TOPIC: "club" }).init.body as string).topic).toBe("burak-7f3k9q2m");
    const original = globalThis.fetch;
    const sent: string[] = [];
    globalThis.fetch = (async (_u: string, init: RequestInit) => {
      sent.push(JSON.parse(init.body as string).topic);
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;
    try {
      // no club topic: the club line is skipped, the personal one still goes out
      await sendNotifications([note, { ...note, text: "for you", topic: "burak-7f3k9q2m" }], {});
      expect(sent).toEqual(["burak-7f3k9q2m"]);
    } finally {
      globalThis.fetch = original;
    }
  });

  test("topics are ntfy's alphabet, 8 to 64 long", () => {
    for (const ok of ["burak-7f3k9q2m", "a_b-C_d1", "x".repeat(64)]) expect(PLAYER_TOPIC_RE.test(ok)).toBe(true);
    for (const bad of ["short", "has space here", "ntfy.sh/topic", "x".repeat(65), ""]) expect(PLAYER_TOPIC_RE.test(bad)).toBe(false);
  });
});
