import type { MetadataRoute } from "next";
import { readDb } from "@/lib/db";

/** Web app manifest, so the club can be added to a phone's home screen and opens like an app. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const club = (await readDb()).settings.club;
  return {
    name: club.name,
    short_name: club.name.length <= 12 ? club.name : "Chess Club",
    description: "Players, Elo, club nights and tournaments.",
    start_url: "/",
    display: "standalone",
    background_color: "#0e1014",
    theme_color: "#0e1014",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
