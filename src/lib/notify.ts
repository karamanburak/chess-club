/**
 * Phone notifications via ntfy (https://ntfy.sh): every activity-log line is POSTed to one topic the admin
 * subscribed to in the ntfy app. Enabled by the `NTFY_TOPIC` env variable; `NTFY_URL` points at a self-hosted
 * server instead of ntfy.sh. Without a topic nothing is sent and nothing else changes.
 *
 * The topic name is the only secret (anyone who knows it can read and post), so pick a long random one.
 */

export interface Notification {
  /** The activity-log text, e.g. "Ali challenged Veli". */
  text: string;
  /** Notification title: the club name. */
  title: string;
  /** Whether the admin did it (shown as a tag so the phone can tell members' moves from your own). */
  admin: boolean;
  /** Address to open when the notification is tapped, or "" for none. */
  url: string;
}

export const DEFAULT_NTFY_URL = "https://ntfy.sh";

/** The two variables this module reads; a plain object in tests, process.env in the app. */
export type NtfyEnv = Record<string, string | undefined>;

/** The configured topic, or null when notifications are off. */
export function ntfyTopic(env: NtfyEnv = process.env): string | null {
  const topic = env.NTFY_TOPIC?.trim() ?? "";
  return topic === "" ? null : topic;
}

/** The ntfy server base URL without a trailing slash. */
export function ntfyServer(env: NtfyEnv = process.env): string {
  const url = env.NTFY_URL?.trim() ?? "";
  return (url === "" ? DEFAULT_NTFY_URL : url).replace(/\/+$/, "");
}

/** Where the topic can be subscribed, shown on the Admin page (e.g. "ntfy.sh/my-club-4f9a"). */
export function ntfyLabel(env: NtfyEnv = process.env): string | null {
  const topic = ntfyTopic(env);
  return topic ? `${ntfyServer(env).replace(/^https?:\/\//, "")}/${topic}` : null;
}

/** The JSON body ntfy accepts at the server root (UTF-8 safe, unlike header-based publishing). */
export interface NtfyMessage {
  topic: string;
  message: string;
  title: string;
  tags: string[];
  click?: string;
}

/** Builds the HTTP request for one notification. Pure, so it can be tested without a network. */
export function ntfyRequest(n: Notification, env: NtfyEnv = process.env): { url: string; init: RequestInit } {
  const body: NtfyMessage = {
    topic: ntfyTopic(env) ?? "",
    message: n.text,
    title: n.title,
    tags: [n.admin ? "admin" : "member"],
  };
  if (n.url) body.click = n.url;
  return {
    url: ntfyServer(env),
    init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  };
}

/**
 * Sends the notifications, one POST each, in order. Never throws: a phone notification must not break a result
 * entry, so failures are logged to the server console only.
 */
export async function sendNotifications(items: Notification[], env: NtfyEnv = process.env): Promise<void> {
  if (!ntfyTopic(env)) return;
  for (const n of items) {
    const { url, init } = ntfyRequest(n, env);
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
      if (!res.ok) console.warn(`[notify] ntfy answered ${res.status} for "${n.text}"`);
    } catch (e) {
      console.warn(`[notify] could not reach ntfy: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
