import Link from "next/link";
import { cache, type ReactNode } from "react";
import { readDb } from "@/lib/db";
import { getT } from "@/lib/lang";
import { fmt, localeOf, plural } from "@/lib/i18n";
import { FaceSvg } from "./Face";
import { Icon, type IconName } from "./icons";
import type { Achievement, Title } from "@/lib/club";
import type { GameResult } from "@/lib/types";

/** Player id → avatar seed, read once per request. Server components only. */
const avatarLookup = cache(async () => new Map((await readDb()).players.map((p) => [p.id, p.avatar])));

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        {eyebrow && <div className="text-[11px] uppercase tracking-wider text-muted mb-1">{eyebrow}</div>}
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <div className="text-sm text-muted mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export async function Avatar({ id, name, size = "sm", seed }: { id: string; name: string; size?: "xs" | "sm" | "md" | "lg" | "xl"; seed?: string }) {
  const s = seed ?? (await avatarLookup()).get(id) ?? id;
  const sz = { xs: "h-5 w-5", sm: "h-7 w-7", md: "h-9 w-9", lg: "h-16 w-16", xl: "h-24 w-24" }[size];
  return <FaceSvg seed={s} title={name} className={`${sz} shrink-0 rounded-full ring-1 ring-line/70`} />;
}

export function PlayerLink({
  id,
  name,
  className = "",
  avatar = false,
  rating,
}: {
  id: string;
  name: string;
  className?: string;
  avatar?: boolean;
  rating?: number | null;
}) {
  return (
    <Link href={`/players/${id}`} className={`inline-flex items-center gap-2 hover:text-accent transition-colors min-w-0 ${className}`}>
      {avatar && <Avatar id={id} name={name} />}
      <span className="truncate">{name}</span>
      {rating !== undefined && rating !== null && <span className="text-xs text-muted font-mono">{rating}</span>}
    </Link>
  );
}

export function RatingDelta({ before, after, className = "" }: { before: number | null; after: number | null; className?: string }) {
  if (before === null || after === null) return null;
  const d = after - before;
  const color = d > 0 ? "text-win" : d < 0 ? "text-loss" : "text-muted";
  return (
    <span className={`font-mono text-xs ${color} ${className}`}>
      {d > 0 ? "+" : ""}
      {d}
    </span>
  );
}

export async function StatusBadge({ status }: { status: "planned" | "running" | "finished" }) {
  const { t } = await getT();
  const styles = {
    planned: "border-muted/40 text-muted",
    running: "border-accent/50 text-accent bg-accent/10",
    finished: "border-win/40 text-win bg-win/10",
  }[status];
  const label = { planned: t.common.planned, running: t.common.live, finished: t.common.finished }[status];
  return (
    <span className={`badge ${styles}`}>
      {status === "running" && <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />}
      {label}
    </span>
  );
}

export function Empty({ icon = "pawn", title, children }: { icon?: IconName; title?: string; children?: ReactNode }) {
  return (
    <div className="text-center py-12 px-6">
      <Icon name={icon} className="h-10 w-10 mx-auto mb-3 opacity-30" />
      {title && <div className="font-medium mb-1">{title}</div>}
      {children && <div className="text-sm text-muted">{children}</div>}
    </div>
  );
}

export function ColorDot({ color, size = "sm" }: { color: "white" | "black"; size?: "sm" | "md" }) {
  const sz = size === "md" ? "h-4 w-4" : "h-3 w-3";
  return (
    <span
      title={color}
      className={`inline-block rounded-full border shrink-0 ${sz} ${color === "white" ? "bg-white border-white" : "bg-black border-muted/70"}`}
    />
  );
}

/** Last few results as small dots, oldest to newest. */
export function FormDots({ results }: { results: ("W" | "D" | "L")[] }) {
  if (!results.length) return <span className="text-muted text-xs">–</span>;
  return (
    <span className="inline-flex items-center gap-1" title={results.join(" ")}>
      {results.map((r, i) => (
        <span
          key={i}
          className={`h-2 w-2 rounded-full ${r === "W" ? "bg-win" : r === "L" ? "bg-loss" : "bg-draw/70"}`}
        />
      ))}
    </span>
  );
}

const MEDAL = ["bg-[#e4a93b] text-[#1a1408] ring-[#f5d78a]", "bg-[#b8bec9] text-[#1a1d24] ring-[#e3e7ee]", "bg-[#c8845a] text-[#1f130b] ring-[#e8b78f]"];

export function Rank({ n }: { n: number }) {
  if (n <= 3) {
    return (
      <span className={`inline-grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ring-1 ring-inset ${MEDAL[n - 1]}`}>
        {n}
      </span>
    );
  }
  return <span className="text-muted font-mono text-sm">{n}</span>;
}

export function ResultChip({ result }: { result: GameResult | null }) {
  const label = !result ? "–" : result === "1/2-1/2" ? "½–½" : result.replace("-", "–");
  return <span className="font-mono text-sm px-2 py-0.5 rounded-md bg-panel-2 border border-line">{label}</span>;
}

export function Section({ title, right, children, flush }: { title: ReactNode; right?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className={`card flex flex-col ${flush ? "p-0 overflow-hidden" : ""}`}>
      <div className={`flex flex-wrap items-center justify-between gap-3 ${flush ? "px-5 pt-5 pb-3" : "mb-4"}`}>
        <h2 className="card-title">{title}</h2>
        {right}
      </div>
      <div className="flex-1 min-h-0 flex flex-col [&>.scroll-x]:flex-1">{children}</div>
    </section>
  );
}

export async function Provisional({ games }: { games: number }) {
  if (games >= 30) return null;
  const { t } = await getT();
  return (
    <span className="badge border-muted/40 text-muted" title={fmt(t.common.provisional, { games })}>
      P
    </span>
  );
}

export async function RankMove({ delta }: { delta: number | undefined }) {
  if (!delta) return null;
  const { t } = await getT();
  return (
    <span className={`font-mono text-xs ${delta > 0 ? "text-win" : "text-loss"}`} title={fmt(plural(Math.abs(delta), t.common.rankMove), { dir: delta > 0 ? t.common.up : t.common.down })}>
      {delta > 0 ? "▲" : "▼"}
      {Math.abs(delta)}
    </span>
  );
}

export async function StreakBadge({ streak }: { streak: { kind: "W" | "D" | "L"; length: number } | null }) {
  if (!streak || streak.length < 2) return null;
  const { t } = await getT();
  const style = streak.kind === "W" ? "border-win/40 text-win bg-win/10" : streak.kind === "L" ? "border-loss/40 text-loss bg-loss/10" : "border-draw/40 text-draw";
  return (
    <span className={`badge ${style}`} title={fmt(streak.kind === "W" ? t.common.streakWins : streak.kind === "L" ? t.common.streakLosses : t.common.streakDraws, { n: streak.length })}>
      {streak.kind === "W" ? "🔥" : ""}
      {streak.length}
      {streak.kind}
    </span>
  );
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "accent" | "win" | "loss" }) {
  const t = {
    muted: "border-line text-muted",
    accent: "border-accent/50 text-accent bg-accent/10",
    win: "border-win/40 text-win bg-win/10",
    loss: "border-loss/40 text-loss bg-loss/10",
  }[tone];
  return <span className={`badge ${t}`}>{children}</span>;
}

/** Club title (Novice … Club Grandmaster). Renders nothing for players without one yet. */
export async function TitleBadge({ title, compact = false }: { title: Title | null; compact?: boolean }) {
  if (!title) return null;
  const { t } = await getT();
  const label = t.club.titles[title.key as keyof typeof t.club.titles] ?? title.label;
  return (
    <span className="badge border-accent/40 text-accent bg-accent/5" title={fmt(t.common.titleFrom, { title: label, min: title.min })}>
      <span aria-hidden>{title.icon}</span>
      {compact ? title.short : label}
    </span>
  );
}

/** One achievement, lit when earned and dimmed when still locked. */
export async function AchievementChip({ a, size = "sm" }: { a: Achievement; size?: "sm" | "lg" }) {
  const { t, lang } = await getT();
  const earned = !!a.earnedAt;
  const when = a.earnedAt ? new Date(a.earnedAt).toLocaleDateString(localeOf(lang), { day: "2-digit", month: "short", year: "numeric" }) : null;
  const text = t.club.achievements[a.key as keyof typeof t.club.achievements] ?? { label: a.label, description: a.description };
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 ${size === "lg" ? "text-sm" : "text-xs"} ${
        earned ? "border-accent/40 bg-accent/10" : "border-line bg-panel-2/40 opacity-50 grayscale"
      }`}
      title={`${text.description} · ${when ? fmt(t.common.earnedOn, { date: when }) : t.common.notYetEarned}`}
    >
      <span className={size === "lg" ? "text-2xl leading-none" : "text-lg leading-none"} aria-hidden>
        {a.icon}
      </span>
      <span className="flex flex-col leading-tight text-left">
        <span className="font-medium">{text.label}</span>
        <span className="text-[10px] text-muted">{earned ? when : text.description}</span>
      </span>
    </span>
  );
}
