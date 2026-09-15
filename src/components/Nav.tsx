"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { FaceSvg } from "./Face";
import { Icon, KnightMark } from "./icons";
import { LangToggle } from "./LangToggle";
import { useT } from "./I18nProvider";
import { fmt, type Dict } from "@/lib/i18n";

type IconName = Parameters<typeof Icon>[0]["name"];
interface NavLink {
  href: string;
  label: string;
  icon: IconName;
  /** Extra pages that light this entry up and, for a menu, its items. */
  menu?: { href: string; label: string; icon: IconName; hint: string }[];
}

const buildLinks = (n: Dict["nav"]): NavLink[] => [
  { href: "/", label: n.leaderboard, icon: "crown" },
  {
    href: "/tournaments",
    label: n.tournaments,
    icon: "rook",
    menu: [
      { href: "/tournaments", label: n.tournaments, icon: "rook", hint: n.tournamentsHint },
      { href: "/pairing", label: n.clubNight, icon: "pawn", hint: n.clubNightHint },
    ],
  },
  { href: "/players", label: n.players, icon: "users" },
  { href: "/games", label: n.games, icon: "list" },
  { href: "/stats", label: n.stats, icon: "chart" },
  { href: "/hall-of-fame", label: n.hallOfFame, icon: "trophy" },
];

function isActive(path: string, l: NavLink): boolean {
  if (l.href === "/") return path === "/";
  return path.startsWith(l.href) || (l.menu?.some((m) => path.startsWith(m.href)) ?? false);
}

const itemClass = (active: boolean) =>
  `relative h-full px-3 flex items-center gap-2 whitespace-nowrap transition-colors ${active ? "text-fg" : "text-muted hover:text-fg"}`;

/** A nav entry with a small menu: opens on hover and keyboard focus, toggles on tap, closes on navigation or Escape. */
function MenuItem({ link, path, menuLabel }: { link: NavLink; path: string; menuLabel: string }) {
  // The menu remembers the path it was opened on, so navigating anywhere closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const setOpen = (next: boolean | ((prev: boolean) => boolean)) => setOpenOn((prev) => ((typeof next === "function" ? next(prev === path) : next) ? path : null));
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = isActive(path, link);
  const current = link.menu?.find((m) => path.startsWith(m.href));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hide = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <div className="relative h-full flex items-stretch" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOpen(false)}>
      <Link href={link.href} className={`${itemClass(active)} pr-1`}>
        <Icon name={current?.icon ?? link.icon} className={`h-4 w-4 ${active ? "text-accent" : ""}`} />
        <span className="hidden sm:inline">{current?.label ?? link.label}</span>
        {active && <span className="absolute left-3 right-1 -bottom-px h-0.5 rounded-full bg-accent" />}
      </Link>
      <button
        type="button"
        aria-label={menuLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className={`px-1.5 -ml-1 mr-1 flex items-center rounded-md transition-colors ${active ? "text-fg" : "text-muted hover:text-fg"}`}
      >
        <Icon name="chevron" className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full mt-1 z-40 card p-1.5 min-w-64 flex flex-col gap-0.5 shadow-xl fade-up">
          {link.menu!.map((m) => {
            const here = path.startsWith(m.href);
            return (
              <Link key={m.href} href={m.href} role="menuitem" className={`flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-panel-2 ${here ? "bg-panel-2/70" : ""}`}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border border-line bg-panel-2 ${here ? "text-accent" : "text-muted"}`}>
                  <Icon name={m.icon} className="h-4 w-4" />
                </span>
                <span className="leading-tight">
                  <span className="block text-sm font-medium text-fg">{m.label}</span>
                  <span className="block text-xs text-muted whitespace-nowrap">{m.hint}</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Nav({ admin, clubName, me }: { admin: boolean; clubName: string; me: { id: string; name: string; avatar: string } | null }) {
  const path = usePathname();
  const { t } = useT();
  const links = buildLinks(t.nav);
  return (
    <header className="border-b border-line bg-bg/85 backdrop-blur sticky top-0 z-20 no-print">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-fg shadow-[inset_0_-2px_0_rgba(0,0,0,.18)] group-hover:brightness-110 transition">
            <KnightMark className="h-7 w-7" />
          </span>
          <span className="hidden md:block leading-tight">
            <span className="block font-display font-semibold text-[17px] tracking-tight max-w-44 truncate">{clubName}</span>
            {!/chess\s*club|schach/i.test(clubName) && <span className="block text-[10px] uppercase tracking-[0.18em] text-muted">{t.nav.chessClub}</span>}
          </span>
        </Link>
        <nav className="flex items-center gap-0.5 text-sm h-full">
          {links.map((l) => {
            if (l.menu) return <MenuItem key={l.href} link={l} path={path} menuLabel={fmt(t.nav.menu, { name: l.label })} />;
            const active = isActive(path, l);
            return (
              <Link key={l.href} href={l.href} className={itemClass(active)}>
                <Icon name={l.icon} className={`h-4 w-4 ${active ? "text-accent" : ""}`} />
                <span className="hidden sm:inline">{l.label}</span>
                {active && <span className="absolute left-3 right-3 -bottom-px h-0.5 rounded-full bg-accent" />}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {me ? (
            <Link href={`/players/${me.id}`} className="flex items-center gap-2 rounded-full border border-line pl-0.5 pr-3 py-0.5 hover:border-accent/60 transition-colors" title={t.nav.yourProfile}>
              <FaceSvg seed={me.avatar} title={me.name} className="h-7 w-7 rounded-full" />
              <span className="text-sm hidden md:inline max-w-28 truncate">{me.name}</span>
            </Link>
          ) : (
            <Link href="/me" className="btn btn-sm btn-ghost gap-1.5" title={t.nav.whoAreYouHint}>
              <Icon name="users" className="h-4 w-4" /> <span className="hidden sm:inline">{t.nav.whoAreYou}</span>
            </Link>
          )}
          <LangToggle />
          <ThemeToggle />
          {admin && (
            <Link href="/admin" className={`badge py-1 ${path.startsWith("/admin") ? "border-accent/60 text-accent" : "border-win/40 text-win"}`} title={t.nav.adminHint}>
              <Icon name="shield" className="h-3 w-3" />
              {t.nav.admin}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
