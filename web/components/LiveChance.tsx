"use client";

import { useEffect, useState } from "react";
import { REGION_INFO, type Region } from "@/lib/region";

interface Live {
  base: number;
  p: number;
  why: string;
  dest?: { region: Region; share: number; open: number; rotation: number }[];
}
const pct = (x: number) => (x < 0.01 ? "<1" : Math.round(x * 100));
const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/0$/, ""));

/** Chance « en direct » : celle du modèle corrigée par le mercato en cours (lib/mercato/chances.ts) */
export default function LiveChance({ region, id, kind }: { region: Region; id: string; kind: "up" | "stay" }) {
  const [c, setC] = useState<Live | null | undefined>(undefined);
  useEffect(() => {
    fetch(`/api/chances?region=${region}&id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setC(d?.[kind] ?? null))
      .catch(() => setC(null));
  }, [region, id, kind]);
  if (c === undefined) return <div className="mt-2 text-xs text-ink-3">Mercato en direct…</div>;
  if (!c) return null;
  return (
    <div className="mt-2 rounded-lg border border-border bg-surface-2/40 px-3 py-2">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] uppercase tracking-wide text-ink-3">En direct (mercato)</span>
        <span className="text-xl font-bold tabular-nums" style={{ color: c.p >= 0.5 ? "var(--good-text)" : c.p >= 0.2 ? "var(--gold)" : "var(--critical)" }}>
          {pct(c.p)} %
        </span>
      </div>
      <div className="text-xs text-ink-2">{c.why}</div>
      {c.dest && c.why === "places encore libres" && (
        <ul className="mt-1 space-y-0.5 text-[11px] text-ink-3">
          {c.dest.map((d) => (
            <li key={d.region}>
              {REGION_INFO[d.region].top} : {Math.round(d.share * 100)} % des joueurs comme lui y vont · places libres à son poste{" "}
              {fmt(d.open)} / {fmt(d.rotation)} d&apos;habitude
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
