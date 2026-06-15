// Lightweight inline-SVG charts — no charting library, no canvas/WebGL. Pure
// SVG with one-time stroke-dash draw-in, so they're tiny and GPU-friendly.

type Slice = { label: string; value: number; color: string };

// Donut with a centered headline. Segments are stroke arcs on one circle.
export function Donut({
  data,
  size = 132,
  thickness = 14,
  center,
  centerSub,
}: {
  data: Slice[];
  size?: number;
  thickness?: number;
  center?: string;
  centerSub?: string;
}) {
  const total = data.reduce((n, d) => n + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={thickness} />
        {data.map((d, i) => {
          const len = (d.value / total) * c;
          const seg = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              strokeLinecap="round"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              style={{ ["--dash-from" as string]: `${c}`, ["--dash-to" as string]: `${-offset}` }}
            />
          );
          offset += len;
          return seg;
        })}
      </svg>
      {(center || centerSub) && (
        <div className="min-w-0">
          {center && <div className="font-mono text-2xl font-semibold leading-none text-gradient tabular-nums">{center}</div>}
          {centerSub && <div className="mt-1 text-xs text-zinc-500">{centerSub}</div>}
        </div>
      )}
    </div>
  );
}

export function Legend({ data }: { data: Slice[] }) {
  const total = data.reduce((n, d) => n + d.value, 0) || 1;
  return (
    <ul className="space-y-1.5">
      {data.map((d) => (
        <li key={d.label} className="flex items-center gap-2 text-xs">
          <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: d.color }} />
          <span className="flex-1 truncate text-zinc-400">{d.label}</span>
          <span className="font-mono tabular-nums text-zinc-300">{d.value}</span>
          <span className="w-9 text-right font-mono tabular-nums text-zinc-600">{Math.round((d.value / total) * 100)}%</span>
        </li>
      ))}
    </ul>
  );
}

// Sparkline + soft area fill. Good for the discovery-volume trend.
export function Sparkline({
  values,
  width = 260,
  height = 56,
  color = "#818cf8",
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const pad = 4;
  const step = (width - pad * 2) / (values.length - 1);
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);
  const pts = values.map((v, i) => [pad + i * step, y(v)] as const);
  const line = pts.map(([x, yy], i) => `${i ? "L" : "M"}${x.toFixed(1)},${yy.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height - pad} L${pad},${height - pad} Z`;
  const id = `spark-${color.replace("#", "")}`;
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map(([x, yy], i) => (
        <circle key={i} cx={x} cy={yy} r={i === pts.length - 1 ? 3 : 1.6} fill={i === pts.length - 1 ? color : "rgba(255,255,255,0.5)"} />
      ))}
    </svg>
  );
}

// Radial gauge for a single 0..100 metric (e.g. a headline fit score).
export function Gauge({ value, label, size = 96 }: { value: number; label?: string; size?: number }) {
  const v = Math.max(0, Math.min(100, value));
  const thickness = 9;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const len = (v / 100) * c;
  const tone = v >= 70 ? "#34d399" : v >= 45 ? "#818cf8" : "#fbbf24";
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={thickness} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${len} ${c - len}`}
          className="animate-dash"
          style={{ ["--dash-from" as string]: `${c}`, ["--dash-to" as string]: "0" }}
        />
      </svg>
      <div className="absolute grid place-items-center text-center">
        <span className="font-mono text-lg font-semibold leading-none tabular-nums text-white">{Math.round(v)}</span>
        {label && <span className="mt-0.5 text-[9px] uppercase tracking-wider text-zinc-500">{label}</span>}
      </div>
    </div>
  );
}

// Horizontal mini-bar with gradient fill — a refined replacement for plain bars.
export function MiniBar({ value, max, from = "#6366f1", to = "#a855f7" }: { value: number; max: number; from?: string; to?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.04]">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${from}, ${to})` }}
      />
    </div>
  );
}
