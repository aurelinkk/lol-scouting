"use client";

import { useState } from "react";
import { LineChart } from "./Charts";
import { TeamLogo } from "./Images";
import { fmtStat, STAT_LABELS } from "@/lib/format";
import type { EvolutionPoint, PlayerLine, StatKey } from "@/lib/types";

const ORDER: StatKey[] = [
  "winrate", "kda", "cs_min", "gold_min", "dpm", "dmg_share", "gold_share", "kp",
  "vision_min", "deaths_pg", "assists_pg", "champions",
  "csd15", "gd15", "xpd15", "ahead_cs15", "fb_part", "fb_victim",
];

/* Stats du joueur comparées à son poste dans sa ligue, par saison/ligue */
export function StatsVsRole({
  lines,
  weights,
}: {
  lines: PlayerLine[];
  weights: Record<string, Partial<Record<StatKey, number>>>;
}) {
  const sorted = [...lines].sort((a, b) => b.season - a.season || b.games - a.games);
  const [index, setIndex] = useState(0);
  const line = sorted[index];
  if (!line) return null;
  const roleWeights = weights[line.role] ?? {};

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {sorted.map((l, i) => (
          <button
            key={`${l.season}-${l.league_code}-${l.role}`}
            onClick={() => setIndex(i)}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${
              i === index ? "border-accent bg-accent-soft text-ink" : "border-border text-ink-2 hover:bg-surface-2"
            }`}
          >
            <TeamLogo team={l.team} src={l.logo} size={14} />
            {l.season} · {l.league_code} · {l.role} · {l.games} p.
          </button>
        ))}
      </div>

      <p className="mb-3 text-xs text-ink-3">
        Comparé à {line.peers.n} joueurs {line.role} de la {line.league_code} {line.season} (au moins 10 parties).
        La barre indique le pourcentage de joueurs qu&apos;il dépasse ; le trait central marque la médiane.
      </p>

      <div className="space-y-1">
        <div className="grid grid-cols-[6.5rem_4rem_1fr_2.5rem] gap-2 px-1 text-[11px] sm:grid-cols-[minmax(8rem,12rem)_4.5rem_1fr_4.5rem_3rem] sm:gap-3 uppercase tracking-wide text-ink-3">
          <span>Stat</span>
          <span className="text-right">Joueur</span>
          <span>Meilleur que…</span>
          <span className="hidden text-right sm:block">Moy. poste</span>
          <span className="text-right" title="Poids dans le score">Poids</span>
        </div>
        {ORDER.filter((s) => line[s] !== undefined).map((stat) => {
          const peer = line.peers[stat];
          const pct = peer ? Math.round(peer.pct * 100) : null;
          const weight = roleWeights[stat];
          return (
            <div
              key={stat}
              className="group grid grid-cols-[6.5rem_4rem_1fr_2.5rem] items-center gap-2 rounded sm:grid-cols-[minmax(8rem,12rem)_4.5rem_1fr_4.5rem_3rem] sm:gap-3 px-1 py-1 hover:bg-surface-2"
              title={pct !== null ? `${STAT_LABELS[stat]} : meilleur que ${pct} % des ${line.role} de la ligue` : ""}
            >
              <span className="truncate text-sm text-ink-2">{STAT_LABELS[stat]}</span>
              <span className="tabular text-right text-sm font-medium">{fmtStat(stat, line[stat])}</span>
              <div className="relative h-3 rounded-full bg-surface-2">
                {pct !== null && (
                  <div
                    className="h-3 rounded-full"
                    style={{
                      width: `${Math.max(pct, 2)}%`,
                      background: weight ? "var(--series-1)" : "var(--text-3)",
                    }}
                  />
                )}
                <div className="absolute left-1/2 top-[-2px] h-4 w-px bg-ink-3" aria-hidden />
                {pct !== null && (
                  <span className="tabular absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-2">
                    {pct} %
                  </span>
                )}
              </div>
              <span className="tabular hidden text-right text-sm text-ink-3 sm:block">{fmtStat(stat, peer?.avg)}</span>
              <span className="tabular text-right text-xs text-ink-3">
                {weight ? `${weight > 0 ? "+" : ""}${weight}` : ""}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-ink-3">
        Barres bleues : stats qui comptent dans le score (poids ≠ 0). Grises : affichées pour info.
      </p>
    </div>
  );
}

/* Évolution par tournoi */
const EVO_METRICS: { key: keyof EvolutionPoint & StatKey; label: string }[] = [
  { key: "kda", label: "KDA" },
  { key: "dpm", label: "DMG/min" },
  { key: "cs_min", label: "CS/min" },
  { key: "gold_min", label: "Gold/min" },
  { key: "kp", label: "Kill participation" },
  { key: "dmg_share", label: "DMG %" },
  { key: "winrate", label: "Win rate" },
];

export function Evolution({ points }: { points: EvolutionPoint[] }) {
  const [metric, setMetric] = useState<(typeof EVO_METRICS)[number]["key"]>("kda");
  const [minGames, setMinGames] = useState(3);
  const data = points
    .filter((p) => p.games >= minGames && p[metric] !== undefined)
    .map((p) => ({
      label: `${p.league_code} ${p.date.slice(0, 7)}`,
      value: p[metric] as number,
      tooltip: (
        <div className="space-y-0.5">
          <div className="font-semibold">{p.tournament}</div>
          <div className="text-ink-3">
            {p.league_code} ({p.tier}) · {p.role} · {p.games} parties
          </div>
          <div>
            {EVO_METRICS.find((m) => m.key === metric)?.label} :{" "}
            <span className="font-semibold">{fmtStat(metric, p[metric] as number)}</span>
          </div>
          <div className="text-ink-3">
            WR {fmtStat("winrate", p.winrate)} · KDA {fmtStat("kda", p.kda)} · DMG/min {fmtStat("dpm", p.dpm)}
          </div>
        </div>
      ),
    }));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {EVO_METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`rounded-md border px-2.5 py-1 text-xs ${
              metric === m.key ? "border-accent bg-accent-soft text-ink" : "border-border text-ink-2 hover:bg-surface-2"
            }`}
          >
            {m.label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-3">
          Parties min. par tournoi
          <input
            type="number"
            min={1}
            value={minGames}
            onChange={(e) => setMinGames(Math.max(1, Number(e.target.value)))}
            className="w-14 rounded border border-border bg-surface px-1.5 py-0.5"
          />
        </label>
      </div>
      <LineChart points={data} format={(v) => fmtStat(metric, v)} />
      <p className="mt-1 text-xs text-ink-3">Un point par tournoi (split, playoffs, EMEA Masters…), dans l&apos;ordre chronologique.</p>
    </div>
  );
}
