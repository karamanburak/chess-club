"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { FaceSvg } from "./Face";
import { Icon, KnightMark } from "./icons";

const links = [
  { href: "/", label: "Leaderboard", icon: "crown" },
  { href: "/pairing", label: "Club night", icon: "pawn" },
  { href: "/tournaments", label: "Tournaments", icon: "rook" },
  { href: "/players", label: "Players", icon: "users" },
  { href: "/games", label: "Games", icon: "list" },
  { href: "/stats", label: "Stats", icon: "chart" },
  { href: "/hall-of-fame", label: "Hall of Fame", icon: "trophy" },
] as const;

export function Nav({ admin, clubName, me }: { admin: boolean; clubName: string; me: { id: string; name: string; avatar: string } | null }) {
  const path = usePathname();
  return (
    <header className="border-b border-line bg-bg/85 backdrop-blur sticky top-0 z-20 no-print">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-fg shadow-[inset_0_-2px_0_rgba(0,0,0,.18)] group-hover:brightness-110 transition">
            <KnightMark className="h-7 w-7" />
          </span>
          <span className="hidden md:block leading-tight">
            <span className="block font-display font-semibold text-[17px] tracking-tight max-w-44 truncate">{clubName}</span>
            <span className="block text-[10px] uppercase tracking-[0.18em] text-muted">chess club</span>
          </span>
        </Link>
        <nav className="flex items-center gap-0.5 text-sm overflow-x-auto -mx-1 px-1 h-full">
          {links.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative h-full px-3 flex items-center gap-2 whitespace-nowrap transition-colors ${active ? "text-fg" : "text-muted hover:text-fg"}`}
              >
                <Icon name={l.icon} className={`h-4 w-4 ${active ? "text-accent" : ""}`} />
                <span className="hidden sm:inline">{l.label}</span>
                {active && <span className="absolute left-3 right-3 -bottom-px h-0.5 rounded-full bg-accent" />}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {me ? (
            <Link href={`/players/${me.id}`} className="flex items-center gap-2 rounded-full border border-line pl-0.5 pr-3 py-0.5 hover:border-accent/60 transition-colors" title="Your profile">
              <FaceSvg seed={me.avatar} title={me.name} className="h-7 w-7 rounded-full" />
              <span className="text-sm hidden md:inline max-w-28 truncate">{me.name}</span>
            </Link>
          ) : (
            <Link href="/me" className="btn btn-sm btn-ghost gap-1.5" title="Tell this device who you are">
              <Icon name="users" className="h-4 w-4" /> <span className="hidden sm:inline">Who are you?</span>
            </Link>
          )}
          <ThemeToggle />
          {admin && (
            <Link href="/admin" className={`badge py-1 ${path.startsWith("/admin") ? "border-accent/60 text-accent" : "border-win/40 text-win"}`} title="Signed in as admin">
              <Icon name="shield" className="h-3 w-3" />
              Admin
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
