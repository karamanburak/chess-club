"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
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
  /** Further routes that light this entry up without a menu (the Stats area spans three pages with their own tabs). */
  also?: string[];
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
  { href: "/stats", label: n.stats, icon: "chart", also: STATS_AREA },
];

/** Club stats, Hall of Fame and Head-to-head share one nav entry and switch with `StatsTabs`. */
const STATS_AREA = ["/hall-of-fame", "/h2h"];

function isActive(path: string, l: NavLink): boolean {
  if (l.href === "/") return path === "/";
  return path.startsWith(l.href) || (l.menu?.some((m) => path.startsWith(m.href)) ?? false) || (l.also?.some((h) => path.startsWith(h)) ?? false);
}

const itemClass = (active: boolean) =>
  `relative h-full px-3 flex items-center gap-2 whitespace-nowrap transition-colors ${active ? "text-fg" : "text-muted hover:text-fg"}`;

/**
 * A nav entry with a small disclosure list of links: opens on hover, toggles with its chevron button, closes on
 * navigation, on leaving it, or on Escape (focus goes back to the chevron). Plain links, no ARIA menu roles.
 */
function MenuItem({ link, path, menuLabel }: { link: NavLink; path: string; menuLabel: string }) {
  // The menu remembers the path it was opened on, so navigating anywhere closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const setOpen = (next: boolean | ((prev: boolean) => boolean)) => setOpenOn((prev) => ((typeof next === "function" ? next(prev === path) : next) ? path : null));
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const active = isActive(path, link);
  const current = link.menu?.find((m) => path.startsWith(m.href));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const inside = wrapRef.current?.contains(document.activeElement);
      setOpenOn(null);
      if (inside) toggleRef.current?.focus();
    };
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
    <div ref={wrapRef} className="relative h-full flex items-stretch" onMouseEnter={show} onMouseLeave={hide} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOpen(false)}>
      <Link href={link.href} className={`${itemClass(active)} pr-1`} aria-current={path === link.href || path.startsWith(`${link.href}/`) ? "page" : undefined}>
        <Icon name={current?.icon ?? link.icon} className={`h-4 w-4 ${active ? "text-accent" : ""}`} />
        <span className="hidden sm:inline">{current?.label ?? link.label}</span>
        {active && <span className="absolute left-3 right-1 -bottom-px h-0.5 rounded-full bg-accent" />}
      </Link>
      <button
        ref={toggleRef}
        type="button"
        aria-label={menuLabel}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={`px-1.5 -ml-1 mr-1 flex items-center rounded-md transition-colors ${active ? "text-fg" : "text-muted hover:text-fg"}`}
      >
        <Icon name="chevron" className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul id={listId} className="absolute left-0 top-full mt-1 z-40 card p-1.5 min-w-64 flex flex-col gap-0.5 shadow-xl fade-up">
          {link.menu!.map((m) => {
            const here = path.startsWith(m.href);
            return (
              <li key={m.href}>
              <Link href={m.href} aria-current={here ? "page" : undefined} className={`flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-panel-2 ${here ? "bg-panel-2/70" : ""}`}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border border-line bg-panel-2 ${here ? "text-accent" : "text-muted"}`}>
                  <Icon name={m.icon} className="h-4 w-4" />
                </span>
                <span className="leading-tight">
                  <span className="block text-sm font-medium text-fg">{m.label}</span>
                  <span className="block text-xs text-muted whitespace-nowrap">{m.hint}</span>
                </span>
              </Link>
              </li>
            );
          })}
        </ul>
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
          <KnightMark className="h-10 w-10 text-fg transition group-hover:brightness-110" />
          <span className="block leading-tight">
            <span className="block font-display font-semibold text-[17px] tracking-tight max-w-36 sm:max-w-44 truncate">{clubName}</span>
            {!/chess\s*club|schach/i.test(clubName) && <span className="block text-xs leading-tight uppercase tracking-[0.14em] text-muted">{t.nav.chessClub}</span>}
          </span>
        </Link>
        <nav aria-label={t.nav.mobileNav} className="hidden md:flex items-center gap-0.5 text-sm h-full">
          {links.map((l) => {
            if (l.menu) return <MenuItem key={l.href} link={l} path={path} menuLabel={fmt(t.nav.menu, { name: l.label })} />;
            const active = isActive(path, l);
            return (
              <Link key={l.href} href={l.href} className={itemClass(active)} aria-current={active ? "page" : undefined}>
                <Icon name={l.icon} className={`h-4 w-4 ${active ? "text-accent" : ""}`} />
                <span className="hidden sm:inline">{l.label}</span>
                {active && <span className="absolute left-3 right-3 -bottom-px h-0.5 rounded-full bg-accent" />}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {(me || admin) && (
            <Link
              href="/challenges"
              // Phones show Challenges as a bottom tab (with the same badge) for every member, so the icon is desktop-only.
              className={`relative btn btn-sm btn-ghost hidden md:inline-flex ${path.startsWith("/challenges") ? "bg-panel-2 text-fg" : ""}`}
              title={t.nav.challengesHint}
              aria-label={waiting > 0 ? `${t.nav.challenges} · ${fmt(t.challenges.badge, { n: waiting })}` : t.nav.challenges}
              aria-current={path.startsWith("/challenges") ? "page" : undefined}
            >
              <Icon name="swords" className="h-4 w-4" />
              {waiting > 0 && (
                <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-fg" aria-hidden>
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
/* Phone: bottom tab bar with the places people go most (for members:  */
/* Home, Challenges, Club night, Players), plus a "More" sheet.          */
/* ------------------------------------------------------------------ */

function MobileTabs({ links, path, admin, member, waiting }: { links: NavLink[]; path: string; admin: boolean; member: boolean; waiting: number }) {
  const { t } = useT();
  // Same trick as MenuItem: the sheet remembers the path it opened on, so any navigation closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const close = () => {
    setOpenOn(null);
    triggerRef.current?.focus();
  };

  // While the sheet is open: Escape closes it, Tab stays inside it, the page behind does not scroll.
  useEffect(() => {
    if (!open) return;
    const sheet = sheetRef.current;
    const trigger = triggerRef.current;
    const focusables = () => [...(sheet?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? [])];
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpenOn(null);
        trigger?.focus();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = sheet?.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  type Entry = { href: string; label: string; icon: IconName; badge?: number; also?: string[] };
  const flat: Entry[] = links.flatMap((l): Entry[] => (l.menu ? l.menu : [l]));
  const here = (m: Entry) => path.startsWith(m.href) || (m.also?.some((h) => path.startsWith(h)) ?? false);
  const byHref = (href: string): Entry => flat.find((l) => l.href === href)!;
  // Challenges are the members' everyday feature, so they get a tab and Tournaments move into More;
  // a guest cannot challenge anyone and keeps Tournaments in the bar.
  const challenges: Entry = { href: "/challenges", label: t.nav.challengesShort, icon: "swords", badge: waiting };
  // The bar has room for about ten characters per tab: "Leaderboard" / "Vereinsabend" get short labels there.
  const home: Entry = { ...byHref("/"), label: t.nav.homeShort };
  const night: Entry = { ...byHref("/pairing"), label: t.nav.clubNightShort };
  const tabs = member ? [home, challenges, night, byHref("/players")] : [home, byHref("/tournaments"), night, byHref("/players")];
  const more: Entry[] = [...(member ? [byHref("/tournaments")] : []), byHref("/games"), byHref("/stats")];
  const moreActive = more.some(here) || path.startsWith("/admin") || path.startsWith("/tv");
  const tabActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  const tabClass = (active: boolean) =>
    `relative flex flex-1 min-w-0 flex-col items-center justify-center gap-1 py-2 text-xs font-medium leading-none transition-colors ${active ? "text-fg" : "text-muted"}`;
  const bar = <span className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" aria-hidden />;

  return (
    <>
      <nav aria-label={t.nav.mobileNav} className="md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/92 backdrop-blur pb-[env(safe-area-inset-bottom)] no-print">
        <ul className="flex items-stretch h-14">
          {tabs.map((l) => {
            const active = tabActive(l.href) && !open;
            return (
              <li key={l.href} className="flex flex-1 min-w-0">
                <Link
                  href={l.href}
                  className={tabClass(active)}
                  aria-current={active ? "page" : undefined}
                  aria-label={l.badge ? `${l.label} · ${fmt(t.challenges.badge, { n: l.badge })}` : undefined}
                >
                  {active && bar}
                  <span className="relative">
                    <Icon name={l.icon} className={`h-5 w-5 ${active ? "text-accent" : ""}`} />
                    {!!l.badge && (
                      <span className="absolute -top-1.5 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-fg" aria-hidden>
                        {l.badge}
                      </span>
                    )}
                  </span>
                  <span className="truncate max-w-full px-1">{l.label}</span>
                </Link>
              </li>
            );
          })}
          <li className="flex flex-1 min-w-0">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => (open ? close() : setOpenOn(path))}
              className={tabClass(moreActive || open)}
              aria-expanded={open}
              aria-haspopup="dialog"
            >
              {moreActive && !open && bar}
              <Icon name="more" className={`h-5 w-5 ${moreActive || open ? "text-accent" : ""}`} />
              <span>{t.nav.more}</span>
            </button>
          </li>
        </ul>
      </nav>
      {open && (
        <div className="md:hidden fixed inset-0 z-40" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <button type="button" tabIndex={-1} aria-label={t.common.close} onClick={close} className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
          <div ref={sheetRef} className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-line bg-panel p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-2xl sheet-up">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <h2 id={titleId} className="text-sm font-medium text-muted">
                {t.nav.more}
              </h2>
              <button type="button" onClick={close} className="btn btn-sm btn-ghost" aria-label={t.common.close}>
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
            <ul className="grid grid-cols-3 gap-2">
              {more.map((m) => {
                const on = here(m);
                return (
                  <li key={m.href} className="flex">
                    <Link href={m.href} aria-current={on ? "page" : undefined} className={`flex flex-1 flex-col items-center gap-2 rounded-2xl border px-2 py-4 text-center transition-colors ${on ? "border-accent/50 bg-accent/5" : "border-line bg-panel-2 hover:bg-panel-3"}`}>
                      <span className={`grid h-10 w-10 place-items-center rounded-xl border border-line bg-panel ${on ? "text-accent" : "text-muted"}`}>
                        <Icon name={m.icon} className="h-5 w-5" />
                      </span>
                      <span className="text-sm font-medium leading-tight">{m.label}</span>
                    </Link>
                  </li>
                );
              })}
              {admin && (
                <li className="flex">
                  <Link href="/admin" aria-current={path.startsWith("/admin") ? "page" : undefined} className={`flex flex-1 flex-col items-center gap-2 rounded-2xl border px-2 py-4 text-center transition-colors ${path.startsWith("/admin") ? "border-accent/50 bg-accent/5" : "border-win/30 bg-panel-2 hover:bg-panel-3"}`}>
                    <span className={`grid h-10 w-10 place-items-center rounded-xl border border-line bg-panel ${path.startsWith("/admin") ? "text-accent" : "text-win"}`}>
                      <Icon name="shield" className="h-5 w-5" />
                    </span>
                    <span className="text-sm font-medium leading-tight">{t.nav.admin}</span>
                  </Link>
                </li>
              )}
              <li className="flex">
                <Link href="/tv" className="flex flex-1 flex-col items-center gap-2 rounded-2xl border border-line bg-panel-2 px-2 py-4 text-center transition-colors hover:bg-panel-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-panel text-muted">
                    <Icon name="tv" className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-medium leading-tight">{t.nav.tvScreen}</span>
                </Link>
              </li>
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
