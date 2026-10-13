import "server-only";
import { headers } from "next/headers";

/**
 * The address the current request came in on, e.g. `https://club.example.com` or `http://192.168.1.5:5173`.
 * Honours the forwarding headers only on Vercel, whose edge sets them; on a laptop on the club Wi-Fi anyone could send
 * them and point the QR code or the notification links at another site. Used for the phone QR code and those links.
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const behindVercel = !!process.env.VERCEL;
  const host = (behindVercel && h.get("x-forwarded-host")) || h.get("host") || "localhost";
  const proto = (behindVercel && h.get("x-forwarded-proto")) || (host.startsWith("localhost") || /^\d+\.\d+\.\d+\.\d+/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
