"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FaceSvg } from "./Face";
import { Icon, KnightMark } from "./icons";
import { PrefsMenu } from "./PrefsMenu";
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

export function Nav({ admin, clubName, me, waiting = 0 }: { admin: boolean; clubName: string; me: { id: string; name: string; avatar: string } | null; waiting?: number }) {
  const path = usePathname();
  const { t } = useT();
  const links = buildLinks(t.nav);
  return (
    <>
    <header className="border-b border-line bg-bg/85 backdrop-blur sticky top-0 z-20 no-print">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-fg shadow-[inset_0_-2px_0_rgba(0,0,0,.18)] group-hover:brightness-110 transition">
            <KnightMark className="h-7 w-7" />
          </span>
          <span className="block leading-tight">
            <span className="block font-display font-semibold text-[17px] tracking-tight max-w-36 sm:max-w-44 truncate">{clubName}</span>
            {!/chess\s*club|schach/i.test(clubName) && <span className="block text-[10px] uppercase tracking-[0.18em] text-muted">{t.nav.chessClub}</span>}
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-0.5 text-sm h-full">
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
          {(me || admin) && (
            <Link href="/challenges" className={`relative btn btn-sm btn-ghost ${path.startsWith("/challenges") ? "bg-panel-2 text-fg" : ""}`} title={t.nav.challengesHint} aria-label={t.nav.challenges}>
              <Icon name="swords" className="h-4 w-4" />
              {waiting > 0 && (
                <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-fg" aria-label={fmt(t.challenges.badge, { n: waiting })}>
                  {waiting}
                </span>
              )}
            </Link>
          )}
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
          <PrefsMenu />
          {admin && (
            <Link href="/admin" className={`badge py-1 ${path.startsWith("/admin") ? "border-accent/60 text-accent" : "border-win/40 text-win"}`} title={t.nav.adminHint}>
              <Icon name="shield" className="h-3 w-3" />
              <span className="hidden sm:inline">{t.nav.admin}</span>
            </Link>
          )}
        </div>
      </div>
    </header>
    {/* Outside the header: its backdrop-filter would otherwise become the containing block of the fixed bar. */}
    <MobileTabs links={links} path={path} admin={admin} member={!!me || admin} waiting={waiting} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Phone: bottom tab bar with the four places people go on a club night, */
/* plus a "More" sheet for the rest.                                     */
/* ------------------------------------------------------------------ */

function MobileTabs({ links, path, admin, member, waiting }: { links: NavLink[]; path: string; admin: boolean; member: boolean; waiting: number }) {
  const { t } = useT();
  // Same trick as MenuItem: the sheet remembers the path it opened on, so any navigation closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  type Entry = { href: string; label: string; icon: IconName };
  const flat: Entry[] = links.flatMap((l): Entry[] => (l.menu ? l.menu : [l]));
  const byHref = (href: string): Entry => flat.find((l) => l.href === href)!;
  const tabs = [byHref("/"), byHref("/tournaments"), byHref("/pairing"), byHref("/players")];
  const more: Entry[] = [byHref("/games"), byHref("/stats"), byHref("/hall-of-fame")];
  if (member) more.unshift({ href: "/challenges", label: t.nav.challenges, icon: "swords" });
  const moreActive = more.some((m) => path.startsWith(m.href)) || path.startsWith("/admin");
  const tabActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  const tabClass = (active: boolean) =>
    `relative flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium leading-none transition-colors ${active ? "text-fg" : "text-muted"}`;
  const bar = <span className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" />;

  return (
    <>
      <nav aria-label={t.nav.mobileNav} className="md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/92 backdrop-blur pb-[env(safe-area-inset-bottom)] no-print">
        <div className="flex items-stretch h-14">
          {tabs.map((l) => {
            const active = tabActive(l.href) && !open;
            return (
              <Link key={l.href} href={l.href} className={tabClass(active)} aria-current={active ? "page" : undefined}>
                {active && bar}
                <Icon name={l.icon} className={`h-5 w-5 ${active ? "text-accent" : ""}`} />
                <span className="truncate max-w-full px-1">{l.label}</span>
              </Link>
            );
          })}
          <button type="button" onClick={() => setOpenOn(open ? null : path)} className={tabClass(moreActive || open)} aria-expanded={open} aria-haspopup="dialog">
            {moreActive && !open && bar}
            <span className="relative">
              <Icon name="more" className={`h-5 w-5 ${moreActive || open ? "text-accent" : ""}`} />
              {waiting > 0 && <span className="absolute -top-1.5 -right-2 h-2.5 w-2.5 rounded-full bg-accent" />}
            </span>
            <span>{t.nav.more}</span>
          </button>
        </div>
      </nav>
      {open && (
        <div className="md:hidden fixed inset-0 z-40" role="dialog" aria-label={t.nav.more}>
          <button type="button" aria-label={t.common.close} onClick={() => setOpenOn(null)} className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-line bg-panel p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-2xl sheet-up">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            <div className="grid grid-cols-3 gap-2">
              {more.map((m) => {
                const here = path.startsWith(m.href);
                return (
                  <Link key={m.href} href={m.href} className={`flex flex-col items-center gap-2 rounded-2xl border px-2 py-4 text-center transition-colors ${here ? "border-accent/50 bg-accent/5" : "border-line bg-panel-2 hover:bg-panel-3"}`}>
                    <span className={`grid h-10 w-10 place-items-center rounded-xl border border-line bg-panel ${here ? "text-accent" : "text-muted"}`}>
                      <Icon name={m.icon} className="h-5 w-5" />
                    </span>
                    <span className="text-sm font-medium leading-tight">{m.label}</span>
                  </Link>
                );
              })}
              {admin && (
                <Link href="/admin" className={`flex flex-col items-center gap-2 rounded-2xl border px-2 py-4 text-center transition-colors ${path.startsWith("/admin") ? "border-accent/50 bg-accent/5" : "border-win/30 bg-panel-2 hover:bg-panel-3"}`}>
                  <span className={`grid h-10 w-10 place-items-center rounded-xl border border-line bg-panel ${path.startsWith("/admin") ? "text-accent" : "text-win"}`}>
                    <Icon name="shield" className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-medium leading-tight">{t.nav.admin}</span>
                </Link>
              )}
              <Link href="/tv" className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-panel-2 px-2 py-4 text-center transition-colors hover:bg-panel-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-panel text-muted">
                  <Icon name="tv" className="h-5 w-5" />
                </span>
                <span className="text-sm font-medium leading-tight">{t.nav.tvScreen}</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
