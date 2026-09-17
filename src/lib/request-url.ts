import "server-only";
import { headers } from "next/headers";

/**
 * The address the current request came in on, e.g. `https://club.example.com` or `http://192.168.1.5:5173`.
 * Honours the proxy headers Vercel sets. Used for the "open on your phone" QR code.
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || /^\d+\.\d+\.\d+\.\d+/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
