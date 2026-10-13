import webpush from "web-push";
import type { PushSub } from "./types";

/**
 * Web Push for members: a phone that subscribed on its player's profile gets a notification when something about
 * that player's challenges happens (actions.ts `tellPlayers`). The admin's feed of every activity line stays on
 * ntfy (notify.ts). Needs a VAPID key pair in the environment (`bunx web-push generate-vapid-keys`); without one
 * the profile shows no switch and nothing is ever sent. Pure helpers plus `sendPush`, which never throws.
 */

/** A subscription as the browser hands it over: endpoint plus the two keys of the message encryption. */
export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** Phones per player that may subscribe; the oldest drops out when a further one subscribes. */
export const MAX_PUSH_SUBS = 5;

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/** The VAPID keys from the environment, or null when push is not set up. */
export function pushKeys(env: Record<string, string | undefined> = process.env): PushKeys | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey || !B64URL.test(publicKey) || !B64URL.test(privateKey)) return null;
  // The push services want a way to reach whoever runs the server; a mailto: or https: address.
  const raw = env.VAPID_SUBJECT?.trim() ?? "";
  const subject = /^(mailto:|https:\/\/)/.test(raw) ? raw : "mailto:admin@example.invalid";
  return { publicKey, privateKey, subject };
}

/**
 * Checks what a browser sent before it is stored: an https endpoint of a sane length and two base64url keys.
 * Returns the clean subscription or null. Anything else could make the server post to an arbitrary address.
 */
export function cleanSubscription(input: unknown): PushSubscriptionInput | null {
  if (!input || typeof input !== "object") return null;
  const { endpoint, keys } = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== "string" || endpoint.length > 1000) return null;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  if (typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) return null;
  if (!B64URL.test(p256dh) || !B64URL.test(auth)) return null;
  return { endpoint: url.toString(), keys: { p256dh, auth } };
}

/** Adds (or refreshes) one phone's subscription on a player's list, newest last, at most MAX_PUSH_SUBS. */
export function addSubscription(list: PushSub[] | undefined, sub: PushSubscriptionInput, at: string): PushSub[] {
  const rest = (list ?? []).filter((s) => s.endpoint !== sub.endpoint);
  return [...rest, { ...sub, at }].slice(-MAX_PUSH_SUBS);
}

/** One notification: title, body and the page a tap opens (a path on this site). */
export interface PushMessage {
  title: string;
  body: string;
  url: string;
}

/** The JSON the service worker (public/sw.js) reads. Kept small: push services cap the payload at about 4 KB. */
export function pushPayload(m: PushMessage): string {
  return JSON.stringify({ title: m.title.slice(0, 100), body: m.body.slice(0, 300), url: m.url.startsWith("/") ? m.url : "/" });
}

/**
 * Sends each message to each of its subscriptions. Never throws; returns the endpoints the push service says are
 * gone (404/410: the phone unsubscribed or the app was removed), so the caller can drop them.
 */
export async function sendPush(jobs: { subs: PushSub[]; message: PushMessage }[], keys: PushKeys | null = pushKeys()): Promise<string[]> {
  if (!keys) return [];
  const gone: string[] = [];
  const sends = jobs.flatMap(({ subs, message }) =>
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, pushPayload(message), {
          vapidDetails: keys,
          TTL: 60 * 60 * 24,
          urgency: "normal",
          timeout: 10_000,
        });
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(s.endpoint);
        else console.error("[push] send failed", status ?? (e as Error).message);
      }
    }),
  );
  await Promise.all(sends);
  return gone;
}
