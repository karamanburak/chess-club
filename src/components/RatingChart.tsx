import type { RatingPoint } from "@/lib/queries";
import { getT } from "@/lib/lang";
import { fmt, localeOf } from "@/lib/i18n";
import { clubTimeZone } from "@/lib/time";

export interface Series {
  name: string;
  color: string;
  points: RatingPoint[];
}

const PALETTE = ["#e4a93b", "#60a5fa", "#4ade80", "#f472b6", "#a78bfa", "#fb923c", "#2dd4bf", "#f87171"];

export function seriesColor(i: number) {
  return PALETTE[i % PALETTE.length];
}

/**
 * Rating chart for one or more players. The x axis is the order of the games, not the calendar: a club night puts
 * five games on one evening, which on a time axis would stack into a vertical line. Every rating change of every
 * shown player gets its own slot, so several players stay comparable; the date labels underneath name the slot.
 * The axis labels are HTML next to the drawing, so they keep their size when the SVG shrinks to a phone's width.
 */
export async function RatingChart({ series, height = 220, names }: { series: Series[]; height?: number; names?: Map<string, { name: string }> }) {
  const { t: msg, lang } = await getT();
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) return <p className="text-sm text-muted">{msg.stats.chart.empty}</p>;

  // One slot per distinct moment, oldest first; the starting rating of each player sits at its own date too.
  const moments = [...new Set(all.map((p) => p.date))].sort();
  const slot = new Map(moments.map((d, i) => [d, i]));
  const last = Math.max(1, moments.length - 1);

  const w = 720;
  const h = height;
  const pad = { l: 8, r: 8, t: 10, b: 10 };
  const ratings = all.map((p) => p.rating);
  const rMin = Math.min(...ratings) - 20;
  const rMax = Math.max(...ratings) + 20;
  const x = (date: string) => pad.l + ((slot.get(date) ?? 0) / last) * (w - pad.l - pad.r);
  const y = (r: number) => pad.t + (1 - (r - rMin) / (rMax - rMin)) * (h - pad.t - pad.b);

  const tickVals = Array.from({ length: 5 }, (_, i) => Math.round(rMin + ((rMax - rMin) * i) / 4));
  const dateLabel = (iso: string) => new Date(iso).toLocaleDateString(localeOf(lang), { day: "2-digit", month: "short", timeZone: clubTimeZone() });
  const dateTicks = [...new Set([0, Math.round(last / 3), Math.round((2 * last) / 3), last])];

  // The peak is worth a mark when one player is shown: it is the number people ask about.
  const single = series.length === 1 ? series[0] : null;
  const peak = single && single.points.length > 2 ? single.points.reduce((best, p) => (p.rating > best.rating ? p : best)) : null;

  const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(2)}%`;

  return (
    <div>
      <div className="flex gap-2">
        <div className="relative w-9 shrink-0" aria-hidden>
          {tickVals.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2 text-xs text-muted tabular-nums" style={{ top: pct(y(t), h) }}>
              {t}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <svg viewBox={`0 0 ${w} ${h}`} className="block w-full h-auto" role="img" aria-label={msg.stats.chart.label}>
            {tickVals.map((t) => (
              <line key={t} x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
            ))}
            {series.map((s) => {
              const pts = [...s.points].sort((a, b) => a.date.localeCompare(b.date));
              const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.date).toFixed(1)},${y(p.rating).toFixed(1)}`).join(" ");
              return (
                <g key={s.name}>
                  <path d={d} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                  {pts.map((p, i) => (
                    <circle key={i} cx={x(p.date)} cy={y(p.rating)} r={series.length > 1 ? 2.5 : 3.5} fill={s.color}>
                      <title>
                        {`${s.name}: ${p.rating} · ${dateLabel(p.date)}${
                          p.opponentId && names ? ` · ${msg.stats.chart.vs} ${names.get(p.opponentId)?.name ?? "?"} (${p.score === 1 ? msg.stats.chart.win : p.score === 0 ? msg.stats.chart.loss : msg.stats.chart.draw})` : ""
                        }`}
                      </title>
                    </circle>
                  ))}
                </g>
              );
            })}
            {peak && <circle cx={x(peak.date)} cy={y(peak.rating)} r={8} fill="none" stroke="var(--accent)" strokeWidth={2} />}
          </svg>
          {peak && (
            <span
              className="absolute -translate-x-1/2 -translate-y-full rounded bg-panel-2 px-1.5 text-xs text-accent tabular-nums whitespace-nowrap"
              style={{ left: `clamp(2rem, ${pct(x(peak.date), w)}, calc(100% - 2rem))`, top: `calc(${pct(y(peak.rating), h)} - 0.6rem)` }}
            >
              {fmt(msg.stats.chart.peak, { rating: peak.rating })}
            </span>
          )}
          <div className="relative h-5 mt-1" aria-hidden>
            {dateTicks.map((i, k) => (
              <span
                key={i}
                className={`absolute text-xs text-muted whitespace-nowrap ${k === 0 ? "" : k === dateTicks.length - 1 ? "-translate-x-full" : "-translate-x-1/2"}`}
                style={{ left: pct(x(moments[i]), w) }}
              >
                {dateLabel(moments[i])}
              </span>
            ))}
          </div>
        </div>
      </div>
      {series.length > 1 && (
        <div className="flex flex-wrap gap-3 mt-2 text-xs">
          {series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full" style={{ background: s.color }} /> {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
