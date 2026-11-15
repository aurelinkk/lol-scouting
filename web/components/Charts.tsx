"use client";

import { useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* Barres horizontales (une série), info-bulle au survol               */
/* ------------------------------------------------------------------ */

export interface BarDatum {
  key: string;
  label: React.ReactNode;
  value: number;
  display: string;
  color?: string; // variable CSS, ex : "var(--series-1)"
  tooltip: React.ReactNode;
}

export function HBarChart({ data, max }: { data: BarDatum[]; max?: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const top = max ?? Math.max(...data.map((d) => d.value), 0) * 1.08;
  return (
    <div className="space-y-1.5" role="list">
      {data.map((d) => {
        const width = top > 0 ? Math.max(0, (d.value / top) * 100) : 0;
        const active = hover === d.key;
        return (
          <div
            key={d.key}
            role="listitem"
            className="relative grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-3 rounded px-1 py-0.5 hover:bg-surface-2"
            onMouseEnter={() => setHover(d.key)}
            onMouseLeave={() => setHover(null)}
          >
            <div className="truncate text-sm text-ink-2">{d.label}</div>
            <div className="h-3">
              <div
                className="h-3 rounded-r"
                style={{
                  width: `${width}%`,
                  background: d.color ?? "var(--series-1)",
                  opacity: hover && !active ? 0.45 : 1,
                }}
              />
            </div>
            <div className="tabular text-right text-sm text-ink">{d.display}</div>
            {active && (
              <div className="pointer-events-none absolute left-32 top-full z-10 mt-1 min-w-48 rounded-md border border-border bg-surface p-2 text-xs shadow-lg">
                {d.tooltip}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Courbe (une série) avec crosshair + info-bulle                     */
/* ------------------------------------------------------------------ */

export interface LinePoint {
  label: string; // abscisse affichée (ex : tournoi)
  value: number;
  tooltip: React.ReactNode;
}

export function LineChart({
  points,
  format,
  height = 220,
}: {
  points: LinePoint[];
  format: (v: number) => string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // Dessin à la taille réelle du conteneur : le texte garde la même taille
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver(([entry]) => setW(Math.max(280, entry.contentRect.width)));
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  if (points.length === 0) return <p className="text-sm text-ink-3">Pas de données.</p>;

  const H = height;
  const pad = { l: 48, r: 16, t: 12, b: 28 };
  const values = points.map((p) => p.value);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const span = hi - lo;
  lo -= span * 0.1;
  hi += span * 0.1;

  const x = (i: number) =>
    points.length === 1 ? (pad.l + W - pad.r) / 2 : pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => lo + t * (hi - lo));
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    points.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    });
    setHover(best);
  };

  return (
    <div className="relative" ref={ref}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--text-3)">
              {format(t)}
            </text>
          </g>
        ))}
        {hover !== null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={pad.t}
            y2={H - pad.b}
            stroke="var(--text-3)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}
        <path d={path} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(p.value)}
            r={hover === i ? 5 : 4}
            fill="var(--series-1)"
            stroke="var(--surface)"
            strokeWidth={2}
          />
        ))}
        {[0, points.length - 1]
          .filter((i, k, arr) => arr.indexOf(i) === k)
          .map((i) => (
            <text
              key={i}
              x={x(i)}
              y={H - 8}
              textAnchor={i === 0 && points.length > 1 ? "start" : "end"}
              fontSize={11}
              fill="var(--text-3)"
            >
              {points[i].label}
            </text>
          ))}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-52 rounded-md border border-border bg-surface p-2 text-xs shadow-lg"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            transform: x(hover) > W / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
          }}
        >
          {points[hover].tooltip}
        </div>
      )}
    </div>
  );
}
