import type { RatingPoint } from "@/lib/queries";

export interface Series {
  name: string;
  color: string;
  points: RatingPoint[];
}

const PALETTE = ["#e4a93b", "#60a5fa", "#4ade80", "#f472b6", "#a78bfa", "#fb923c", "#2dd4bf", "#f87171"];

export function seriesColor(i: number) {
  return PALETTE[i % PALETTE.length];
}

/** Time-based rating chart for one or more players. */
export function RatingChart({ series, height = 220, names }: { series: Series[]; height?: number; names?: Map<string, { name: string }> }) {
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) return <p className="text-sm text-muted">Rating history appears after the first rated game.</p>;

  const w = 720;
  const h = height;
  const pad = { l: 44, r: 12, t: 12, b: 26 };
  const times = all.map((p) => new Date(p.date).getTime());
  let tMin = Math.min(...times);
  let tMax = Math.max(...times);
  if (tMax === tMin) {
    tMin -= 86400_000;
    tMax += 86400_000;
  }
  const ratings = all.map((p) => p.rating);
  const rMin = Math.min(...ratings) - 20;
  const rMax = Math.max(...ratings) + 20;
  const x = (t: number) => pad.l + ((t - tMin) / (tMax - tMin)) * (w - pad.l - pad.r);
  const y = (r: number) => pad.t + (1 - (r - rMin) / (rMax - rMin)) * (h - pad.t - pad.b);

  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => Math.round(rMin + ((rMax - rMin) * i) / ticks));
  const dateTicks = Array.from({ length: 4 }, (_, i) => tMin + ((tMax - tMin) * i) / 3);
  const fmt = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label="Rating history">
        {tickVals.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 3} fontSize={10} textAnchor="end" fill="var(--muted)">
              {t}
            </text>
          </g>
        ))}
        {dateTicks.map((t, i) => (
          <text key={i} x={x(t)} y={h - 8} fontSize={10} fill="var(--muted)" textAnchor={i === 0 ? "start" : i === 3 ? "end" : "middle"}>
            {fmt(t)}
          </text>
        ))}
        {series.map((s) => {
          const pts = [...s.points].sort((a, b) => a.date.localeCompare(b.date));
          // Step to "now" so the line reaches the right edge.
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(new Date(p.date).getTime()).toFixed(1)},${y(p.rating).toFixed(1)}`).join(" ");
          return (
            <g key={s.name}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p, i) => (
                <circle key={i} cx={x(new Date(p.date).getTime())} cy={y(p.rating)} r={series.length > 1 ? 2 : 3} fill={s.color}>
                  <title>
                    {`${s.name}: ${p.rating} · ${p.date.slice(8, 10)}.${p.date.slice(5, 7)}.${p.date.slice(0, 4)}${
                      p.opponentId && names ? ` · vs ${names.get(p.opponentId)?.name ?? "?"} (${p.score === 1 ? "win" : p.score === 0 ? "loss" : "draw"})` : ""
                    }`}
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
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
