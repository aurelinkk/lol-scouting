"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Avatar, TeamLogo } from "./Images";
import { fmtScore, fmtStat, STAT_LABELS, topPercent } from "@/lib/format";
import { playerLink, publicData, REGION_INFO, type Region, REGIONS, tierName } from "@/lib/region";
import type { RankingRow, StatKey } from "@/lib/types";

// Comparaison de deux joueurs (Europe ou NA, n'importe quelle saison).
// Chaque stat est aussi située dans la ligue et le poste du joueur (percentile),
// car une même valeur ne veut pas dire la même chose en LFL et en NACL.

export interface LeagueInfo {
  code: string;
  name: string;
  /** coef par saison (Europe) */
  seasons: Record<string, { coef?: number; base?: number; talent?: number; starters?: number }>;
}

type Pick = { region: Region; season: number; id: string };

const STATS: StatKey[] = [
  "winrate", "kda", "deaths_pg", "kp", "cs_min", "gold_min", "dpm", "dmg_share",
  "dpm_vs_champ", "dmg_share_vs_champ", "gold_share", "vision_min",
  "csd15", "gd15", "xpd15", "ahead_cs15", "ka15", "fb_part", "fb_victim",
  "cw_min", "wards_killed_min", "champions",
];
const LOWER_IS_BETTER: StatKey[] = ["deaths_pg", "fb_victim"];

const cache = new Map<string, Promise<RankingRow[]>>();
function loadRankings(region: Region, season: number): Promise<RankingRow[]> {
  const key = `${region}-${season}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      fetch(publicData(region, `rankings_${season}.json`))
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    );
  }
  return cache.get(key)!;
}

const encode = (p: Pick | null) => (p ? `${p.region}-${p.season}-${p.id}` : "");
function decode(v: string | null): Pick | null {
  const m = v?.match(/^(eu|na|kr)-(\d{4})-(.+)$/);
  return m ? { region: m[1] as Region, season: Number(m[2]), id: m[3] } : null;
}

/** Percentile d'une valeur parmi les joueurs de la même ligue et du même poste */
function pctInLeague(rows: RankingRow[], row: RankingRow, stat: StatKey): number | null {
  const v = row[stat];
  if (v === undefined || v === null) return null;
  const peers = rows.filter(
    (r) => r.league_code === row.league_code && r.role === row.role && r.games >= 10 && r[stat] != null,
  );
  if (peers.length < 4) return null;
  const lower = LOWER_IS_BETTER.includes(stat);
  const beaten = peers.filter((r) => (lower ? (r[stat] as number) > v : (r[stat] as number) < v)).length;
  return beaten / peers.length;
}

function Picker({
  label,
  value,
  onChange,
  seasons,
}: {
  label: string;
  value: Pick | null;
  onChange: (p: Pick | null) => void;
  seasons: Record<Region, number[]>;
}) {
  const [region, setRegion] = useState<Region>(value?.region ?? "eu");
  const [season, setSeason] = useState<number>(value?.season ?? Math.max(...seasons[value?.region ?? "eu"]));
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (value) {
      setRegion(value.region);
      setSeason(value.season);
    }
  }, [value]);
  useEffect(() => {
    loadRankings(region, season).then(setRows);
  }, [region, season]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return rows
      .filter((r) => r.name.toLowerCase().includes(q) || r.team.toLowerCase().includes(q))
      .sort((a, b) => b.final - a.final)
      .slice(0, 8);
  }, [rows, query]);

  const control = "rounded-md border border-border bg-surface px-2 py-1.5 text-sm";
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        <div className="flex rounded-md border border-border p-0.5 text-xs">
          {REGIONS.map((r) => (
            <button
              key={r}
              onClick={() => {
                setRegion(r);
                setSeason(Math.max(...seasons[r]));
              }}
              className={`rounded px-2 py-1 ${r === region ? "bg-accent-soft font-semibold" : "text-ink-3"}`}
            >
              {REGION_INFO[r].short}
            </button>
          ))}
        </div>
        <select className={control} value={season} onChange={(e) => setSeason(Number(e.target.value))}>
          {[...seasons[region]].reverse().map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <div className="relative min-w-40 flex-1">
          <input
            className={`${control} w-full`}
            placeholder="Joueur ou équipe…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
          {open && matches.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-surface py-1 text-sm shadow-lg">
              {matches.map((r) => (
                <li key={r.id}>
                  <button
                    className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-surface-2"
                    onMouseDown={() => {
                      onChange({ region, season, id: r.id });
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    <Avatar name={r.name} src={r.photo} size={22} />
                    <span className="truncate">{r.name.replace(/\s*\(.*\)$/, "")}</span>
                    <span className="ml-auto shrink-0 text-xs text-ink-3">
                      {r.role} · {r.league_code} · {fmtScore(r.final)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function useRow(pick: Pick | null) {
  const [state, setState] = useState<{ row: RankingRow | null; rows: RankingRow[] }>({ row: null, rows: [] });
  useEffect(() => {
    if (!pick) return setState({ row: null, rows: [] });
    loadRankings(pick.region, pick.season).then((rows) =>
      setState({ row: rows.find((r) => r.id === pick.id) ?? null, rows }),
    );
  }, [pick?.region, pick?.season, pick?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

function Header({ pick, row, leagues }: { pick: Pick; row: RankingRow; leagues: LeagueInfo[] }) {
  const R = REGION_INFO[pick.region];
  const league = leagues.find((l) => l.code === row.league_code);
  const seasonInfo = league?.seasons?.[String(pick.season)];
  const [pseudo, realName] = (() => {
    const m = row.name.match(/^(.*?)\s*\((.*)\)$/);
    return m ? [m[1], m[2]] : [row.name, null];
  })();
  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <Avatar name={row.name} src={row.photo} size={64} />
        <div className="min-w-0">
          <Link href={playerLink(pick.region, row.id)} className="text-xl font-bold hover:underline">
            {pseudo}
          </Link>
          {realName && <div className="truncate text-xs text-ink-3">{realName}</div>}
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
            <span className="rounded border border-border px-1.5">{row.role}</span>
            <span className="rounded border border-border px-1.5">{R.short}</span>
            <span>{row.age !== undefined ? `${row.age_approx ? "~" : ""}${row.age} ans` : "âge ?"}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <TeamLogo team={row.team} src={row.logo} size={22} />
        <span className="font-medium">{row.team}</span>
        <span className="text-ink-3">
          · {row.league_code}
          {row.league_code !== tierName(row.tier, pick.region) ? ` (${tierName(row.tier, pick.region)})` : ""} · {pick.season}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-ink-3">Score final</dt>
        <dd className="text-right font-semibold">
          {fmtScore(row.final)} <span className="text-xs font-normal text-ink-3">{topPercent(row.role_percentile)}</span>
        </dd>
        <dt className="text-ink-3">Perf. dans sa ligue</dt>
        <dd className="text-right">{fmtScore(row.league_score)}</dd>
        <dt className="text-ink-3">Bonus niveau de ligue</dt>
        <dd className="text-right">{fmtScore(row.league_bonus)}</dd>
        {R.hasEm && (
          <>
            <dt className="text-ink-3">EMEA Masters</dt>
            <dd className="text-right">{row.em_games ? `${fmtScore(row.em_score)} (${row.em_games} p.)` : "–"}</dd>
          </>
        )}
        <dt className="text-ink-3">Parties</dt>
        <dd className="text-right">{row.games}</dd>
        {row.intl_games ? (
          <>
            <dt className="text-ink-3">Bonus internationaux</dt>
            <dd className="text-right">
              {fmtScore(row.intl_bonus)}{" "}
              <span className="text-xs text-ink-3">
                ({row.intl_games} p., {fmtScore(row.intl_score)} vs le monde)
              </span>
            </dd>
          </>
        ) : null}
        {seasonInfo?.coef != null && (
          <>
            <dt className="text-ink-3">Coef. {row.league_code} {pick.season}</dt>
            <dd className="text-right">
              {seasonInfo.coef.toFixed(2)}{" "}
              <span className="text-xs text-ink-3">
                (EM {seasonInfo.base?.toFixed(2)} {(seasonInfo.coef - (seasonInfo.base ?? 0)) >= 0 ? "+" : "−"}{" "}
                {Math.abs(seasonInfo.coef - (seasonInfo.base ?? 0)).toFixed(2)})
              </span>
            </dd>
          </>
        )}
        {row.ex_lec && (
          <>
            <dt className="text-ink-3">Ex-{R.top}</dt>
            <dd className="truncate text-right text-xs">{row.ex_lec}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

function Bar({ pct, side }: { pct: number | null; side: "left" | "right" }) {
  if (pct === null) return <div className="h-1.5" />;
  return (
    <div className={`flex h-1.5 rounded-full bg-surface-2 ${side === "left" ? "justify-end" : ""}`}>
      <div
        className="h-1.5 rounded-full"
        style={{ width: `${Math.max(3, pct * 100)}%`, background: side === "left" ? "var(--series-1)" : "var(--series-2)" }}
      />
    </div>
  );
}

export default function Comparator({
  seasons,
  leagues,
}: {
  seasons: Record<Region, number[]>;
  leagues: LeagueInfo[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const a = decode(params.get("a"));
  const b = decode(params.get("b"));
  const A = useRow(a);
  const B = useRow(b);

  const set = (key: "a" | "b", p: Pick | null) => {
    const q = new URLSearchParams(params.toString());
    if (p) q.set(key, encode(p));
    else q.delete(key);
    router.replace(`/comparer?${q.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Picker label="Joueur A" value={a} onChange={(p) => set("a", p)} seasons={seasons} />
        <Picker label="Joueur B" value={b} onChange={(p) => set("b", p)} seasons={seasons} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {a && A.row ? (
          <Header pick={a} row={A.row} leagues={leagues} />
        ) : (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-ink-3">Choisis un joueur.</div>
        )}
        {b && B.row ? (
          <Header pick={b} row={B.row} leagues={leagues} />
        ) : (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-ink-3">Choisis un joueur.</div>
        )}
      </div>

      {A.row && B.row && (() => {
        const ra = A.row!;
        const rb = B.row!;
        const lines = STATS.filter((s) => ra[s] != null || rb[s] != null).map((stat) => {
          const va = ra[stat];
          const vb = rb[stat];
          const pa = pctInLeague(A.rows, ra, stat);
          const pb = pctInLeague(B.rows, rb, stat);
          const lower = LOWER_IS_BETTER.includes(stat);
          const best: "a" | "b" | null =
            va == null || vb == null || va === vb ? null : (lower ? va < vb : va > vb) ? "a" : "b";
          // Gros écart : 35 points de percentile, ou 30 % d'écart relatif sans percentile
          const big =
            best !== null &&
            (pa !== null && pb !== null
              ? Math.abs(pa - pb) >= 0.35
              : Math.abs((va as number) - (vb as number)) / Math.max(Math.abs(va as number), Math.abs(vb as number), 1e-9) >= 0.3);
          return { stat, va, vb, pa, pb, best, big };
        });
        const wins = { a: lines.filter((l) => l.best === "a").length, b: lines.filter((l) => l.best === "b").length };
        const crush = { a: lines.filter((l) => l.best === "a" && l.big).length, b: lines.filter((l) => l.best === "b" && l.big).length };
        const nameA = ra.name.replace(/\s*\(.*\)$/, "");
        const nameB = rb.name.replace(/\s*\(.*\)$/, "");
        const COLOR = { a: "var(--series-1)", b: "var(--series-2)" };
        const Value = ({ side, v, p, stat, best, big }: { side: "a" | "b"; v: number | undefined; p: number | null; stat: StatKey; best: "a" | "b" | null; big: boolean }) => {
          const win = best === side;
          return (
            <span
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 tabular ${win ? "font-semibold text-ink" : "text-ink-3"}`}
              style={win ? { background: `color-mix(in srgb, ${COLOR[side]} ${big ? 30 : 15}%, transparent)` } : undefined}
            >
              {side === "b" && win && big && <span style={{ color: COLOR[side] }}>▲▲</span>}
              {fmtStat(stat, v)}
              {p !== null && <span className="text-[10px] font-normal text-ink-3">{Math.max(1, Math.round(p * 100))}e %</span>}
              {side === "a" && win && big && <span style={{ color: COLOR[side] }}>▲▲</span>}
            </span>
          );
        };
        return (
          <section className="rounded-lg border border-border bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">Stats</h2>
              <div className="flex items-center gap-3 text-sm">
                <span className="font-semibold" style={{ color: COLOR.a }}>
                  {nameA} {wins.a}
                </span>
                <span className="text-ink-3">–</span>
                <span className="font-semibold" style={{ color: COLOR.b }}>
                  {wins.b} {nameB}
                </span>
                <span className="text-xs text-ink-3">
                  stats gagnées · dont nettement : {crush.a} – {crush.b}
                </span>
              </div>
            </div>
            <p className="mt-1 text-xs text-ink-3">
              Fond coloré = le meilleur des deux ; <b>▲▲</b> et fond plus foncé = écart net (au moins 35 points de
              percentile). Percentile parmi les joueurs du même poste <b>dans sa propre ligue</b> (10 parties ou plus) :
              une même valeur ne se vaut pas d&apos;une ligue à l&apos;autre, le score final tient compte du niveau.
            </p>
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_9.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-sm">
              <div className="truncate text-right text-xs font-semibold" style={{ color: COLOR.a }}>
                {nameA} · {ra.league_code} {a!.season}
              </div>
              <div />
              <div className="truncate text-xs font-semibold" style={{ color: COLOR.b }}>
                {nameB} · {rb.league_code} {b!.season}
              </div>
              {lines.map(({ stat, va, vb, pa, pb, best, big }) => (
                <div key={stat} className="contents">
                  <div className="space-y-0.5 text-right">
                    <Value side="a" v={va} p={pa} stat={stat} best={best} big={big} />
                    <Bar pct={pa} side="left" />
                  </div>
                  <div
                    className={`text-center text-xs ${big ? "font-semibold text-ink" : "text-ink-3"}`}
                    title={big ? "Écart net" : undefined}
                  >
                    {best === "a" && <span style={{ color: COLOR.a }}>◀ </span>}
                    {STAT_LABELS[stat]}
                    {best === "b" && <span style={{ color: COLOR.b }}> ▶</span>}
                  </div>
                  <div className="space-y-0.5">
                    <Value side="b" v={vb} p={pb} stat={stat} best={best} big={big} />
                    <Bar pct={pb} side="right" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })()}
    </div>
  );
}
