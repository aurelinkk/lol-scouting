"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { HBarChart, LineChart } from "@/components/Charts";
import { type DeepJobView, progress } from "@/lib/deep/client";

interface Agg {
  games: number;
  winrate: number;
  kda: number;
  deaths: number;
  cs_min: number;
  gold_min: number;
  dpm: number;
  vision_min: number;
  kp: number;
  dmg_share: number;
}
interface Report {
  riotId: string;
  first: string | null;
  last: string | null;
  summary: Agg;
  roles: { role: string; games: number; share: number }[];
  months: ({ month: string } & Agg)[];
  champions: ({ champion: string } & Agg)[];
}

const pct = (v: number) => `${(v * 100).toFixed(1)} %`;
const METRICS: { key: keyof Agg; label: string; fmt: (v: number) => string }[] = [
  { key: "winrate", label: "Win rate", fmt: pct },
  { key: "kda", label: "KDA", fmt: (v) => v.toFixed(2) },
  { key: "dpm", label: "DMG/min", fmt: (v) => Math.round(v).toString() },
  { key: "cs_min", label: "CS/min", fmt: (v) => v.toFixed(1) },
  { key: "kp", label: "Kill participation", fmt: pct },
  { key: "games", label: "Parties jouées", fmt: (v) => Math.round(v).toString() },
];
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="text-xs uppercase tracking-wide text-ink-3">{label}</div>
      <div className="tabular mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

export default function DeepReportPage() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<DeepJobView | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<keyof Agg>("winrate");
  const [minChampGames, setMinChampGames] = useState(5);

  useEffect(() => {
    let done = false;
    const load = () =>
      fetch(`/api/deep/${id}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => {
          setJob(d.job);
          setReport(d.report);
          done = !!d.report;
        })
        .catch(() => setError("Analyse introuvable."));
    load();
    // Tant que le rapport n'est pas prêt, on revérifie toutes les 15 s
    const t = setInterval(() => !done && load(), 15_000);
    return () => clearInterval(t);
  }, [id]);

  if (error) return <p className="text-sm text-critical">{error}</p>;
  if (!job) return <p className="text-sm text-ink-3">Chargement…</p>;
  if (!report)
    return (
      <div className="space-y-2">
        <Link href="/analyses" className="text-sm text-ink-3 hover:text-ink">
          ← Analyses
        </Link>
        <h1 className="text-xl font-semibold">{job.riotId}</h1>
        <p className="text-sm text-ink-2">
          Analyse en cours : {progress(job)}. Le rapport s&apos;affichera ici automatiquement.
        </p>
      </div>
    );

  const s = report.summary;
  const m = METRICS.find((x) => x.key === metric)!;
  const champs = report.champions.filter((c) => c.games >= minChampGames);

  return (
    <div className="space-y-6">
      <Link href="/analyses" className="text-sm text-ink-3 hover:text-ink">
        ← Analyses
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{report.riotId}</h1>
        <p className="text-sm text-ink-3">
          {s.games} parties classées analysées · du {report.first} au {report.last}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        <Tile label="Win rate" value={pct(s.winrate)} />
        <Tile label="KDA" value={s.kda.toFixed(2)} />
        <Tile label="Morts/partie" value={s.deaths.toFixed(1)} />
        <Tile label="CS/min" value={s.cs_min.toFixed(1)} />
        <Tile label="Gold/min" value={Math.round(s.gold_min).toString()} />
        <Tile label="DMG/min" value={Math.round(s.dpm).toString()} />
        <Tile label="KP" value={pct(s.kp)} />
        <Tile label="Vision/min" value={s.vision_min.toFixed(2)} />
      </div>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">Évolution mois par mois</h2>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {METRICS.map((x) => (
            <button
              key={x.key}
              onClick={() => setMetric(x.key)}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                metric === x.key ? "border-accent bg-accent-soft text-ink" : "border-border text-ink-2 hover:bg-surface-2"
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>
        <LineChart
          points={report.months.map((mo) => ({
            label: monthLabel(mo.month),
            value: mo[metric] as number,
            tooltip: (
              <div className="space-y-0.5">
                <div className="font-semibold">{monthLabel(mo.month)}</div>
                <div>
                  {m.label} : <span className="font-semibold">{m.fmt(mo[metric] as number)}</span>
                </div>
                <div className="text-ink-3">
                  {mo.games} parties · WR {pct(mo.winrate)} · KDA {mo.kda.toFixed(2)}
                </div>
              </div>
            ),
          }))}
          format={m.fmt}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold">Postes</h2>
          <HBarChart
            max={1}
            data={report.roles.map((r) => ({
              key: r.role,
              label: r.role,
              value: r.share,
              display: pct(r.share),
              tooltip: <div>{r.games} parties</div>,
            }))}
          />
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Pool de champions ({report.champions.length} joués)</h2>
            <label className="flex items-center gap-1.5 text-xs text-ink-3">
              Parties min.
              <input
                type="number"
                min={1}
                value={minChampGames}
                onChange={(e) => setMinChampGames(Math.max(1, Number(e.target.value)))}
                className="w-14 rounded border border-border bg-surface px-1.5 py-0.5"
              />
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="tabular w-full whitespace-nowrap text-sm">
              <thead className="border-b border-border text-xs text-ink-3">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Champion</th>
                  <th className="px-2 py-1.5 text-right font-medium">Parties</th>
                  <th className="px-2 py-1.5 text-right font-medium">WR</th>
                  <th className="px-2 py-1.5 text-right font-medium">KDA</th>
                  <th className="px-2 py-1.5 text-right font-medium">DMG/m</th>
                  <th className="px-2 py-1.5 text-right font-medium">CS/m</th>
                  <th className="px-2 py-1.5 text-right font-medium">KP</th>
                </tr>
              </thead>
              <tbody>
                {champs.map((c) => (
                  <tr key={c.champion} className="border-b border-border last:border-0">
                    <td className="px-2 py-1.5 font-medium">{c.champion}</td>
                    <td className="px-2 py-1.5 text-right">{c.games}</td>
                    <td className="px-2 py-1.5 text-right">{pct(c.winrate)}</td>
                    <td className="px-2 py-1.5 text-right">{c.kda.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-right">{Math.round(c.dpm)}</td>
                    <td className="px-2 py-1.5 text-right">{c.cs_min.toFixed(1)}</td>
                    <td className="px-2 py-1.5 text-right">{pct(c.kp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
