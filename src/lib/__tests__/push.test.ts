import { describe, expect, test } from "bun:test";
import { addSubscription, cleanSubscription, MAX_PUSH_SUBS, pushKeys, pushPayload, sendPush } from "../push";
import { exportable, keepInstallation } from "../export";
import { db, player } from "./fixtures";

const sub = (n: number) => ({ endpoint: `https://push.example/ep${n}`, keys: { p256dh: "BPk3o7m_key", auth: "authA_1" } });

describe("web push", () => {
  test("no keys, no push: both VAPID keys must be set and base64url", () => {
    expect(pushKeys({})).toBeNull();
    expect(pushKeys({ VAPID_PUBLIC_KEY: "abc" })).toBeNull();
    expect(pushKeys({ VAPID_PUBLIC_KEY: "a b", VAPID_PRIVATE_KEY: "c" })).toBeNull();
    expect(pushKeys({ VAPID_PUBLIC_KEY: "Pub_1", VAPID_PRIVATE_KEY: "Priv-2", VAPID_SUBJECT: "mailto:club@example.org" })).toEqual({
      publicKey: "Pub_1",
      privateKey: "Priv-2",
      subject: "mailto:club@example.org",
    });
    expect(pushKeys({ VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b", VAPID_SUBJECT: "javascript:x" })?.subject).toStartWith("mailto:");
  });

  test("only an https endpoint with two short base64url keys is stored", () => {
    expect(cleanSubscription(sub(1))).toEqual(sub(1));
    expect(cleanSubscription({ ...sub(1), endpoint: "http://push.example/x" })).toBeNull();
    expect(cleanSubscription({ ...sub(1), endpoint: "not a url" })).toBeNull();
    expect(cleanSubscription({ ...sub(1), endpoint: `https://x/${"a".repeat(1001)}` })).toBeNull();
    expect(cleanSubscription({ endpoint: "https://x/1", keys: { p256dh: "a b", auth: "c" } })).toBeNull();
    expect(cleanSubscription({ endpoint: "https://x/1" })).toBeNull();
    expect(cleanSubscription(null)).toBeNull();
    expect(cleanSubscription("https://x/1")).toBeNull();
  });

  test("a phone that subscribes again replaces its entry; only the newest few stay", () => {
    let list = addSubscription(undefined, sub(1), "t1");
    list = addSubscription(list, sub(1), "t2");
    expect(list).toHaveLength(1);
    expect(list[0].at).toBe("t2");
    for (let i = 2; i <= MAX_PUSH_SUBS + 2; i++) list = addSubscription(list, sub(i), `t${i}`);
    expect(list).toHaveLength(MAX_PUSH_SUBS);
    expect(list.map((s) => s.endpoint)).not.toContain(sub(1).endpoint);
  });

  test("the payload is small and opens a page on this site only", () => {
    const p = JSON.parse(pushPayload({ title: "T".repeat(300), body: "B".repeat(900), url: "https://evil.example" }));
    expect(p.title).toHaveLength(100);
    expect(p.body).toHaveLength(300);
    expect(p.url).toBe("/");
    expect(JSON.parse(pushPayload({ title: "a", body: "b", url: "/challenges" })).url).toBe("/challenges");
  });

  test("without keys nothing is sent and nothing reported gone", async () => {
    expect(await sendPush([{ subs: [{ ...sub(1), at: "t" }], message: { title: "a", body: "b", url: "/" } }], null)).toEqual([]);
  });

  test("subscriptions never leave in a backup, and a restore keeps this installation's", () => {
    const here = db([{ ...player("a"), pushSubs: [{ ...sub(1), at: "t" }] }]);
    const out = exportable(here, { pins: true });
    expect(out.players[0]).not.toHaveProperty("pushSubs");
    const incoming = db([{ ...player("a"), pushSubs: [{ ...sub(9), at: "old" }] }, player("b")]);
    const next = keepInstallation(incoming, here);
    expect(next.players[0].pushSubs?.map((s) => s.endpoint)).toEqual([sub(1).endpoint]);
    expect(next.players[1]).not.toHaveProperty("pushSubs");
  });
});
