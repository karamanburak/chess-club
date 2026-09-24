/**
 * Challenge news to the club's Slack channel through an Incoming Webhook (Slack → your app → Incoming Webhooks →
 * pick the channel). Enabled by the `SLACK_WEBHOOK_URL` env variable; without it nothing is sent and nothing else
 * changes. One-way: the app posts, Slack never calls back.
 *
 * The webhook address is the only secret (anyone who has it can post to that channel), so it lives in the
 * environment only, never in the repository, the data or the activity log.
 */

/** The one variable this module reads; a plain object in tests, process.env in the app. */
export type SlackEnv = Record<string, string | undefined>;

/** Only Slack's own webhook host is accepted, so a mistyped variable cannot make the server post elsewhere. */
const WEBHOOK_RE = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/;

/** The configured webhook, or null when Slack is off (unset or not a Slack webhook address). */
export function slackWebhook(env: SlackEnv = process.env): string | null {
  const url = env.SLACK_WEBHOOK_URL?.trim() ?? "";
  return WEBHOOK_RE.test(url) ? url : null;
}

/** Names and places go into Slack's mrkdwn: these three would otherwise start links or mentions. */
export function slackEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface SlackMessage {
  /** Already escaped mrkdwn: build it with slackEscape() around every user-typed part. */
  text: string;
  /** Page to open, shown as a link after the text; "" for none. */
  url: string;
  /** Link text, in the club's language. */
  linkLabel: string;
}

/** The HTTP request for one message. Pure, so it can be tested without a network. */
export function slackRequest(m: SlackMessage, webhook: string): { url: string; init: RequestInit } {
  const text = m.url ? `${m.text} <${m.url}|${slackEscape(m.linkLabel)}>` : m.text;
  return {
    url: webhook,
    init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) },
  };
}

/**
 * Posts the messages in order. Never throws: a Slack hiccup must not break a challenge, so failures go to the server
 * console only. No webhook configured: returns at once, no network call.
 */
export async function sendSlack(items: SlackMessage[], env: SlackEnv = process.env): Promise<void> {
  const webhook = slackWebhook(env);
  if (!webhook) return;
  for (const m of items) {
    const { url, init } = slackRequest(m, webhook);
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
      if (!res.ok) console.warn(`[slack] webhook answered ${res.status}`);
    } catch (e) {
      console.warn(`[slack] could not reach Slack: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
