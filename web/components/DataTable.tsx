"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Avatar, PlayerName, TeamLogo } from "./Images";
import { fmtScore, fmtStat, topPercent } from "@/lib/format";
import { ROLES, type RankingRow, type StatKey } from "@/lib/types";

type SortKey = "final" | "age" | "games" | "league_score" | "league_bonus" | "em_score" | StatKey;

const STAT_COLUMNS: { key: StatKey; label: string; oe?: boolean }[] = [
  { key: "winrate", label: "WR" },
  { key: "kda", label: "KDA" },
  { key: "cs_min", label: "CS/m" },
  { key: "gold_min", label: "Gold/m" },
  { key: "dpm", label: "DMG/m" },
  { key: "dmg_share", label: "DMG%" },
  { key: "dmg_share_vs_champ", label: "DMG% vs champ" },
  { key: "kp", label: "KP" },
  { key: "csd15", label: "CSD@15", oe: true },
  { key: "gd15", label: "GD@15", oe: true },
  { key: "xpd15", label: "XPD@15", oe: true },
  { key: "fb_part", label: "FB%", oe: true },
];

const PAGE = 100;

export default function DataTable({ seasons, hasOe }: { seasons: number[]; hasOe: boolean }) {
  const [rows, setRows] = useState<RankingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [season, setSeason] = useState(Math.max(...seasons));
  const [role, setRole] = useState<string>("");
  const [tier, setTier] = useState<string>("");
  const [league, setLeague] = useState<string>("");
  const [maxAge, setMaxAge] = useState<string>("");
  const [minGames, setMinGames] = useState<string>("10");
  const [search, setSearch] = useState("");
  const [includeLec, setIncludeLec] = useState(false);
  const [unknownAge, setUnknownAge] = useState(true);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "final", desc: true });
  const [limit, setLimit] = useState(PAGE);

  // Une saison = un fichier (chargé à la demande)
  useEffect(() => {
    setRows(null);
    fetch(`/data/rankings_${season}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .catch(() =>
        // Ancien format : un seul fichier pour toutes les saisons
        fetch("/data/rankings.json")
          .then((r) => r.json())
          .then((all: RankingRow[]) => all.filter((x) => x.season === season)),
      )
      .then(setRows)
      .catch(() => setError("Impossible de charger les données."));
  }, [season]);

  const leagues = useMemo(
    () => [...new Set((rows ?? []).filter((r) => r.season === season).map((r) => r.league_code))].sort(),
    [rows, season],
  );

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    const age = maxAge ? Number(maxAge) : null;
    const games = minGames ? Number(minGames) : 0;
    const out = rows.filter(
      (r) =>
        r.season === season &&
        (!role || r.role === role) &&
        (!tier || r.tier === tier) &&
        (!league || r.league_code === league) &&
        (age === null || (r.age === undefined ? unknownAge : r.age <= age)) &&
        r.games >= games &&
        (includeLec || !r.played_lec) &&
        (!q ||
          r.name.toLowerCase().includes(q) ||
          r.team.toLowerCase().includes(q) ||
          (r.current_team ?? "").toLowerCase().includes(q)),
    );
    const dir = sort.desc ? -1 : 1;
    out.sort((a, b) => {
      const va = a[sort.key as keyof RankingRow] as number | undefined;
      const vb = b[sort.key as keyof RankingRow] as number | undefined;
      if (va === undefined && vb === undefined) return 0;
      if (va === undefined) return 1;
      if (vb === undefined) return -1;
      return (va - vb) * dir;
    });
    return out;
  }, [rows, season, role, tier, league, maxAge, minGames, search, includeLec, unknownAge, sort]);

  useEffect(
    () => setLimit(PAGE),
    [season, role, tier, league, maxAge, minGames, search, includeLec, unknownAge, sort],
  );

  const columns = STAT_COLUMNS.filter((c) => hasOe || !c.oe);

  const header = (key: SortKey, label: string, title?: string) => (
    <th
      className="cursor-pointer select-none whitespace-nowrap px-2 py-2 text-right font-medium hover:text-ink"
      onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : true }))}
      title={title}
      aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"}
    >
      {label}
      {sort.key === key ? (sort.desc ? " ↓" : " ↑") : ""}
    </th>
  );

  const control = "rounded-md border border-border bg-surface px-2 py-1.5 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3">
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Saison
          <select className={control} value={season} onChange={(e) => setSeason(Number(e.target.value))}>
            {[...seasons].reverse().map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Poste
          <select className={control} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Tous</option>
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Niveau
          <select className={control} value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="">Tous</option>
            <option>ERL1</option>
            <option>ERL2</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Ligue
          <select className={control} value={league} onChange={(e) => setLeague(e.target.value)}>
            <option value="">Toutes</option>
            {leagues.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Âge max
          <input
            className={`${control} w-20`}
            type="number"
            min={15}
            max={35}
            placeholder="–"
            value={maxAge}
            onChange={(e) => setMaxAge(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Parties min
          <input
            className={`${control} w-20`}
            type="number"
            min={0}
            value={minGames}
            onChange={(e) => setMinGames(e.target.value)}
          />
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-ink-3">
          Recherche
          <input
            className={control}
            placeholder="Joueur ou équipe"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="flex flex-col gap-1 pb-1 text-sm text-ink-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={includeLec} onChange={(e) => setIncludeLec(e.target.checked)} />
            Inclure les joueurs passés par la LEC
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={unknownAge} onChange={(e) => setUnknownAge(e.target.checked)} />
            Garder les âges inconnus (filtre âge)
          </label>
        </div>
      </div>

      {error && <p className="text-sm text-critical">{error}</p>}
      {!rows && !error && <p className="text-sm text-ink-3">Chargement…</p>}

      {rows && (
        <>
          <p className="text-xs text-ink-3">
            {filtered.length} joueurs · clic sur une colonne pour trier · Score = perf. dans sa ligue + bonus de
            niveau de ligue + EMEA Masters
          </p>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="tabular w-full text-sm">
              <thead className="border-b border-border text-xs text-ink-3">
                <tr>
                  <th className="px-2 py-2 text-left font-medium">#</th>
                  <th className="px-2 py-2 text-left font-medium">Joueur</th>
                  <th className="px-2 py-2 text-left font-medium">Club actuel</th>
                  <th className="px-2 py-2 text-left font-medium" title="Ligue sur laquelle la saison est évaluée">
                    Ligue (saison)
                  </th>
                  {header("age", "Âge")}
                  {header("games", "Parties")}
                  {header("final", "Score", "Score final")}
                  {header("league_score", "Ligue", "Performance dans sa ligue (z-score pondéré)")}
                  {header("league_bonus", "Bonus", "Bonus de niveau de ligue")}
                  {header("em_score", "EM", "Performance à l'EMEA Masters")}
                  {columns.map((c) => header(c.key, c.label))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, limit).map((r, i) => (
                  <tr key={`${r.id}-${r.season}`} className="border-b border-border last:border-0 hover:bg-surface-2">
                    <td className="px-2 py-1.5 text-ink-3">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <Link href={`/joueurs/${r.id}`} className="flex items-center gap-2 hover:underline">
                        <Avatar name={r.name} src={r.photo} size={28} />
                        <span className="whitespace-nowrap">
                          <PlayerName name={r.name} />
                        </span>
                        <span className="text-xs text-ink-3">{r.role}</span>
                      </Link>
                    </td>
                    <td className="px-2 py-1.5">
                      <span
                        className="flex items-center gap-1.5 whitespace-nowrap text-ink-2"
                        title={
                          r.current_team && r.current_team !== r.team
                            ? `Club actuel. En ${r.season} (ligue évaluée) : ${r.team}`
                            : undefined
                        }
                      >
                        <TeamLogo team={r.current_team ?? r.team} src={r.current_logo ?? r.logo} size={18} />
                        <span className="max-w-40 truncate">{r.current_team ?? r.team}</span>
                        {r.current_league && r.current_league !== r.league_code && (
                          <span className="text-xs text-ink-3">{r.current_league}</span>
                        )}
                      </span>
                    </td>
                    <td
                      className="whitespace-nowrap px-2 py-1.5 text-ink-2"
                      title={r.current_team && r.current_team !== r.team ? `Avec ${r.team}` : undefined}
                    >
                      {r.league_code} <span className="text-xs text-ink-3">{r.tier}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right">{r.age ?? "–"}</td>
                    <td className="px-2 py-1.5 text-right">{r.games}</td>
                    <td className="px-2 py-1.5 text-right font-semibold" title={topPercent(r.role_percentile)}>
                      {fmtScore(r.final)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-ink-2">{fmtScore(r.league_score)}</td>
                    <td className="px-2 py-1.5 text-right text-ink-2">{fmtScore(r.league_bonus)}</td>
                    <td className="px-2 py-1.5 text-right text-ink-2" title={r.em_games ? `${r.em_games} parties` : ""}>
                      {fmtScore(r.em_score)}
                    </td>
                    {columns.map((c) => (
                      <td key={c.key} className="whitespace-nowrap px-2 py-1.5 text-right">
                        {fmtStat(c.key, r[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > limit && (
            <button
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
              onClick={() => setLimit((l) => l + PAGE)}
            >
              Afficher {Math.min(PAGE, filtered.length - limit)} de plus
            </button>
          )}
        </>
      )}
    </div>
  );
}
