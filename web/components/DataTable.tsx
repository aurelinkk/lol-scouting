"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Avatar, PlayerName, TeamLogo } from "./Images";
import { fmtScore, fmtStat, topPercent } from "@/lib/format";
import { ROLES, type RankingRow, type StatKey } from "@/lib/types";
import { playerLink, publicData, REGION_INFO, tierName } from "@/lib/region";
import { useRegion } from "@/lib/useRegion";
import { type ContractEnd, type Signed, signedFromMercato } from "@/lib/mercato/signed";
import { isStale } from "@/lib/mercato/stale";
import { HOME_ORIGIN, ORIGINS, originOf } from "@/lib/origin";
import { useWatchlist } from "@/lib/useWatchlist";

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

/** Montée la saison suivante : 1re division (doré) ou ERL2 -> ERL1 (vert) */
export interface Promoted {
  /** top / second : montée (couleur) ; move : départ vers l'autre région, même niveau ou en dessous */
  level: "top" | "second" | "move";
  team: string;
  season: number;
  rumor: boolean;
}
const PROMO_COLOR = { top: "var(--tier-lec)", second: "var(--tier-em)", move: "var(--text-3)" };

export default function DataTable({
  seasons,
  hasOe,
  promoted = {},
  signed: publishedSigned = {},
  contracts = {},
  mercatoGenerated,
  mercatoSeason,
}: {
  seasons: number[];
  hasOe: boolean;
  promoted?: Record<string, Promoted>;
  /** Joueurs qui ont déjà un club pour la saison suivante (mercato publié) */
  signed?: Record<string, Signed>;
  /** Fin de contrat (GCD) avec le club de la saison passée */
  contracts?: Record<string, ContractEnd>;
  mercatoGenerated?: string;
  mercatoSeason?: number;
}) {
  const region = useRegion();
  const R = REGION_INFO[region];
  // Mercato rafraîchi en ligne (bouton « Actualiser » de Rosters) s'il part du mercato publié
  const [liveSigned, setLiveSigned] = useState<Record<string, Signed> | null>(null);
  useEffect(() => {
    const use = (d: { live?: { mercato: { generated?: string; teams: never[] } } } | null) => {
      if (d?.live && d.live.mercato.generated === mercatoGenerated)
        setLiveSigned(signedFromMercato(d.live.mercato.teams, region));
    };
    fetch(`/api/mercato?region=${region}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        use(d);
        // dernière recherche trop ancienne : on relance en arrière-plan (scoops Sheep, Leaguepedia)
        if (mercatoGenerated && isStale(d?.live, mercatoGenerated))
          return fetch(`/api/mercato?region=${region}`, { method: "POST" })
            .then((r) => (r.ok ? r.json() : null))
            .then(use);
      })
      .catch(() => {});
  }, [region, mercatoGenerated]);
  const signed = liveSigned ?? publishedSigned;
  const [onlyFree, setOnlyFree] = useState(false);
  const [contractEnding, setContractEnding] = useState(false);
  const watch = useWatchlist(region);
  const [onlyWatched, setOnlyWatched] = useState(false);
  const [rows, setRows] = useState<RankingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [season, setSeason] = useState(Math.max(...seasons));
  const [role, setRole] = useState<string>("");
  const [tier, setTier] = useState<string>("");
  const [league, setLeague] = useState<string>("");
  const [origin, setOrigin] = useState<string>("");
  const [maxAge, setMaxAge] = useState<string>("");
  const [minGames, setMinGames] = useState<string>("10");
  const [search, setSearch] = useState("");
  const [includeLec, setIncludeLec] = useState(false);
  const [unknownAge, setUnknownAge] = useState(true);
  // Score sans le niveau de la ligue : qui domine le plus sa propre ligue
  const [noLeague, setNoLeague] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "final", desc: true });
  const [limit, setLimit] = useState(PAGE);

  // Une saison = un fichier (chargé à la demande)
  useEffect(() => {
    setRows(null);
    fetch(publicData(region, `rankings_${season}.json`))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .catch(() =>
        // Ancien format : un seul fichier pour toutes les saisons
        fetch(publicData(region, "rankings.json"))
          .then((r) => r.json())
          .then((all: RankingRow[]) => all.filter((x) => x.season === season)),
      )
      .then(setRows)
      .catch(() => setError("Impossible de charger les données."));
  }, [season, region]);

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
        (!onlyWatched || !!watch.list[r.id]) &&
        (!origin || (origin === "?" ? !originOf(r.country, r.name) : originOf(r.country, r.name) === origin)) &&
        (age === null || (r.age === undefined ? unknownAge : r.age <= age)) &&
        r.games >= games &&
        // Seulement les joueurs encore libres pour la saison suivante (saison en cours)
        (!onlyFree ||
          r.season !== Math.max(...seasons) ||
          ((!signed[r.id] || signed[r.id].kind === "contract") && !promoted[`${r.season}:${r.id}`])) &&
        // Contrat qui se termine à la fin de la saison : récupérable sans rachat
        (!contractEnding || (r.season === Math.max(...seasons) && !!contracts[r.id] &&
          Number(contracts[r.id].end.slice(0, 4)) <= r.season)) &&
        // Les joueurs montés en cours de saison (ex : SamD 2025) restent visibles
        (includeLec || onlyWatched || (!r.played_lec && !r.ex_lec) || (!r.ex_lec && !!promoted[`${r.season}:${r.id}`])) &&
        (!q ||
          r.name.toLowerCase().includes(q) ||
          r.team.toLowerCase().includes(q) ||
          (r.current_team ?? "").toLowerCase().includes(q)),
    );
    const dir = sort.desc ? -1 : 1;
    const value = (r: RankingRow) =>
      sort.key === "final" && noLeague
        ? r.final - r.league_bonus
        : (r[sort.key as keyof RankingRow] as number | undefined);
    out.sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (va === undefined && vb === undefined) return 0;
      if (va === undefined) return 1;
      if (vb === undefined) return -1;
      return (va - vb) * dir;
    });
    return out;
  }, [rows, season, role, tier, league, origin, maxAge, minGames, search, includeLec, unknownAge, noLeague, sort, promoted, onlyFree, signed, seasons, contractEnding, contracts, onlyWatched, watch.list]);

  useEffect(
    () => setLimit(PAGE),
    [season, role, tier, league, origin, maxAge, minGames, search, includeLec, unknownAge, sort, onlyFree, contractEnding, onlyWatched],
  );

  const columns = STAT_COLUMNS.filter((c) => hasOe || !c.oe);
  const isCurrent = season === Math.max(...seasons);
  const next = mercatoSeason ?? season + 1;
  // Couleur de ligne : montée d'un niveau (doré : vers la 1re division, vert : 3e -> 2e)
  // d'abord, sinon « déjà un club » (bleu clair : reste au même niveau ou descend)
  const promoOf = (r: RankingRow): Promoted | undefined => {
    if (r.tier === "LEC") return undefined;
    const p = promoted[`${r.season}:${r.id}`];
    if (p) return p.level !== "move" ? p : undefined;
    // Montée vue seulement dans le mercato (rafraîchi en ligne, correction manuelle...)
    const sg = isCurrent ? signed[r.id] : undefined;
    const level = sg?.tier === "LEC" ? "top" : sg?.tier === "ERL1" && r.tier === "ERL2" ? "second" : undefined;
    return sg && level ? { level, team: sg.team, season: next, rumor: !sg.official } : undefined;
  };
  // Déjà un club : annonce officielle ou rumeur. « Sous contrat » sans source ne
  // compte pas : rien ne dit qu'il reste (voir la colonne Contrat)
  const signedOf = (r: RankingRow) => {
    const sg = isCurrent && !promoOf(r) ? signed[r.id] : undefined;
    return sg && sg.kind !== "contract" ? sg : undefined;
  };
  const contractOf = (r: RankingRow) => (isCurrent ? contracts[r.id] : undefined);
  const rowStyle = (r: RankingRow) => {
    const p = promoOf(r);
    if (p) return { background: `color-mix(in srgb, ${PROMO_COLOR[p.level]} 13%, transparent)` };
    const sg = signedOf(r);
    if (sg) return { background: `color-mix(in srgb, var(--accent) ${sg.official ? 13 : 7}%, transparent)` };
    return undefined;
  };
  const barStyle = (r: RankingRow) => {
    const p = promoOf(r);
    if (p) return { boxShadow: `inset 3px 0 0 ${PROMO_COLOR[p.level]}` };
    const sg = signedOf(r);
    if (sg?.official) return { boxShadow: "inset 3px 0 0 var(--accent)" };
    return undefined;
  };

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
        {(R.hasErl2 || includeLec) && (
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Niveau
          <select className={control} value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="">Tous</option>
            {includeLec && <option value="LEC">{R.top}</option>}
            <option value="ERL1">{tierName("ERL1", region)}</option>
            {R.hasErl2 && <option value="ERL2">{tierName("ERL2", region)}</option>}
          </select>
        </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Ligue
          <select className={control} value={league} onChange={(e) => setLeague(e.target.value)}>
            <option value="">Toutes</option>
            {leagues.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-3" title="D'après la nationalité du joueur">
          Origine
          <select className={control} value={origin} onChange={(e) => setOrigin(e.target.value)}>
            <option value="">Toutes</option>
            {ORIGINS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            <option value="?">Inconnue</option>
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
            Inclure les joueurs de {R.top} (et ceux déjà passés par la {R.top})
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={unknownAge} onChange={(e) => setUnknownAge(e.target.checked)} />
            Garder les âges inconnus (filtre âge)
          </label>
          {isCurrent && Object.keys(signed).length > 0 && (
            <label className="flex items-center gap-2" title="Masque les joueurs qui ont déjà un club pour la saison suivante d'après le mercato">
              <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} />
              Seulement les joueurs encore libres pour {next}
            </label>
          )}
          <label className="flex items-center gap-2" title="Joueurs marqués d'une étoile (liste partagée par tous les visiteurs)">
            <input type="checkbox" checked={onlyWatched} onChange={(e) => setOnlyWatched(e.target.checked)} />
            <span>
              Ma liste <span style={{ color: "var(--gold)" }}>★</span> ({Object.keys(watch.list).length})
            </span>
          </label>
          {isCurrent && Object.keys(contracts).length > 0 && (
            <label className="flex items-center gap-2" title="Contrat (base GCD de Riot) qui se termine à la fin de la saison : joueur récupérable sans rachat. Connu surtout pour les 1res divisions.">
              <input type="checkbox" checked={contractEnding} onChange={(e) => setContractEnding(e.target.checked)} />
              Contrat qui se termine fin {season} (sans rachat)
            </label>
          )}
          {R.hasLeagues && (
          <label
            className="flex items-center gap-2"
            title="Score sans le bonus/malus de niveau de ligue : qui domine le plus sa propre ligue"
          >
            <input type="checkbox" checked={noLeague} onChange={(e) => setNoLeague(e.target.checked)} />
            Score sans le niveau de ligue
          </label>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-critical">{error}</p>}
      {!rows && !error && <p className="text-sm text-ink-3">Chargement…</p>}

      {rows && (
        <>
          <p className="text-xs text-ink-3">
            {filtered.length} joueurs · clic sur une colonne pour trier · Score ={" "}
            {R.hasEm
              ? "perf. dans sa ligue + bonus de niveau de ligue + EMEA Masters"
              : "perf. comparée aux joueurs du même poste"}
            {includeLec &&
              rows.some((r) => r.tier === "LEC") &&
              ` · Joueurs de ${R.top} : perf. dans la ${R.top} jugée en partie par rapport à leur équipe, + bonus fixe de 1re division (${fmtScore(
                rows.find((r) => r.tier === "LEC")?.league_bonus,
              )}) ; leur « top % » les situe parmi les prospects de leur poste`}
          </p>
          {(Object.entries(promoted).some(([k, p]) => k.startsWith(`${season}:`) && p.level !== "move") ||
            (isCurrent && Object.keys(signed).length > 0)) && (
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
              {isCurrent && Object.keys(signed).length > 0 && (
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ background: "color-mix(in srgb, var(--accent) 35%, transparent)" }}
                  />
                  Déjà un club pour {next}, même niveau ou en dessous (plus clair = rumeur)
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PROMO_COLOR.top }} />
                Monte en LEC ou LCS en {season + 1}
              </span>
              {R.hasEm && (
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PROMO_COLOR.second }} />
                  Monte d&apos;ERL2 en ERL1 en {season + 1}
                </span>
              )}
              {isCurrent && <span className="text-ink-3">d&apos;après le mercato (officiel ou rumeur)</span>}
            </p>
          )}
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="tabular w-full text-sm">
              <thead className="border-b border-border text-xs text-ink-3">
                <tr>
                  <th className="px-2 py-2 text-left font-medium">#</th>
                  <th className="px-2 py-2 text-left font-medium">Joueur</th>
                  <th
                    className="px-2 py-2 text-left font-medium"
                    title={isCurrent ? "Club de sa dernière partie" : `Club pendant la saison ${season}`}
                  >
                    {isCurrent ? "Club actuel" : `Club en ${season}`}
                  </th>
                  <th className="px-2 py-2 text-left font-medium" title="Ligue sur laquelle la saison est évaluée">
                    Ligue (saison)
                  </th>
                  {isCurrent && Object.keys(contracts).length > 0 && (
                    <th className="px-2 py-2 text-left font-medium" title="Fin de contrat avec le club (base GCD de Riot, via Leaguepedia)">
                      Contrat
                    </th>
                  )}
                  {header("age", "Âge")}
                  {header("games", "Parties")}
                  {header("final", "Score", "Score final")}
                  {header("league_score", "Ligue", "Performance dans sa ligue (z-score pondéré)")}
                  {(R.hasLeagues || includeLec) && header("league_bonus", "Bonus", "Bonus de niveau de ligue")}
                  {R.hasEm && header("em_score", "EM", "Performance à l'EMEA Masters")}
                  {columns.map((c) => header(c.key, c.label))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, limit).map((r, i) => (
                  <tr
                    key={`${r.id}-${r.season}`}
                    className="border-b border-border last:border-0 hover:bg-surface-2"
                    style={rowStyle(r)}
                  >
                    <td
                      className="px-2 py-1.5 text-ink-3"
                      style={barStyle(r)}
                    >
                      {i + 1}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => watch.toggle(r.id, r.name)}
                        className="shrink-0 text-base leading-none"
                        style={{ color: watch.list[r.id] ? "var(--gold)" : "var(--border)" }}
                        title={watch.list[r.id] ? "Retirer de la liste de suivi" : "Suivre ce joueur (liste partagée)"}
                        aria-label="Suivre"
                      >
                        ★
                      </button>
                      <Link href={playerLink(region, r.id)} className="flex items-center gap-2 hover:underline">
                        <Avatar name={r.name} src={r.photo} size={28} />
                        <span className="whitespace-nowrap">
                          <PlayerName name={r.name} />
                        </span>
                        <span className="text-xs text-ink-3">{r.role}</span>
                        {(() => {
                          // Import : joueur venu d'une autre grande région (ex : un Coréen en LEC)
                          const o = originOf(r.country, r.name);
                          return o && o !== HOME_ORIGIN[region] ? (
                            <span
                              className="rounded px-1 text-[10px] font-semibold"
                              style={{ background: `var(--origin-${o.toLowerCase()})`, color: "var(--origin-ink)" }}
                              title={`Import · ${r.country} (${ORIGINS.find((x) => x.value === o)?.label})`}
                            >
                              {o}
                            </span>
                          ) : null;
                        })()}
                        {(r.ex_lec || (r.played_lec && !promoted[`${r.season}:${r.id}`])) && (
                          <span
                            className="rounded border border-border px-1 text-[10px] text-ink-3"
                            title={
                              r.tier === "LEC" || !r.ex_lec
                                ? `Joueur de ${R.top} cette saison`
                                : `Ancien joueur de ${R.top} : ${r.ex_lec}`
                            }
                          >
                            {r.tier === "LEC" || !r.ex_lec ? R.top : `ex-${R.top}`}
                          </span>
                        )}
                      </Link>
                      {watch.list[r.id] && (
                        <button
                          onClick={() => {
                            const note = window.prompt(`Note sur ${r.name}`, watch.list[r.id]?.note ?? "");
                            if (note !== null) watch.setNote(r.id, r.name, note);
                          }}
                          className="max-w-40 truncate text-left text-xs italic text-ink-3 hover:text-accent"
                          title={watch.list[r.id]?.note || "Ajouter une note"}
                        >
                          {watch.list[r.id]?.note || "✎ note"}
                        </button>
                      )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      {(() => {
                        // Saison en cours : club actuel ; saison passée : club de cette saison
                        const team = isCurrent ? (r.current_team ?? r.team) : r.team;
                        const logo = isCurrent ? (r.current_logo ?? r.logo) : r.logo;
                        const moved = r.current_team && r.current_team !== r.team;
                        return (
                          <span
                            className="flex items-center gap-1.5 whitespace-nowrap text-ink-2"
                            title={
                              moved
                                ? isCurrent
                                  ? `Club actuel. Saison évaluée avec ${r.team}`
                                  : `Aujourd'hui : ${r.current_team}`
                                : undefined
                            }
                          >
                            <TeamLogo team={team} src={logo} size={18} />
                            <span className="max-w-40 truncate">{team}</span>
                            {signedOf(r) && (() => {
                              const sg = signedOf(r)!;
                              return (
                                <span
                                  className="whitespace-nowrap text-xs text-ink-3"
                                  title={`${next} : ${sg.team} (${sg.kind === "official" ? "officiel" : sg.kind === "contract" ? "sous contrat" : "rumeur"})`}
                                >
                                  {sg.stays ? `✓ ${next}` : `→ ${sg.team}`}
                                  {sg.kind === "rumor" && " (rumeur)"}
                                </span>
                              );
                            })()}
                            {(promoOf(r) ?? (r.tier !== "LEC" ? promoted[`${r.season}:${r.id}`] : undefined)) && (() => {
                              const p = (promoOf(r) ?? promoted[`${r.season}:${r.id}`])!;
                              return (
                                <span
                                  className="flex items-center gap-1 text-xs"
                                  title={`${p.rumor ? "Rumeur" : p.level === "move" ? "Transfert" : "Montée"} ${p.season === r.season ? `en cours de saison ${p.season}` : p.season} : ${p.team}`}
                                >
                                  <span style={{ color: PROMO_COLOR[p.level] }}>→</span>
                                  <span className="max-w-32 truncate">{p.team}</span>
                                  {p.rumor && <span className="text-ink-3">(rumeur)</span>}
                                </span>
                              );
                            })()}
                            {isCurrent && r.current_league && r.current_league !== r.league_code && (
                              <span className="text-xs text-ink-3">{r.current_league}</span>
                            )}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-ink-2">
                      {r.league_code}{" "}
                      {r.league_code !== tierName(r.tier, region) && <span className="text-xs text-ink-3">{tierName(r.tier, region)}</span>}
                    </td>
                    {isCurrent && Object.keys(contracts).length > 0 && (
                      <td className="whitespace-nowrap px-2 py-1.5 text-xs">
                        {(() => {
                          const c = contractOf(r);
                          if (!c) return <span className="text-ink-3">–</span>;
                          const year = Number(c.end.slice(0, 4));
                          const ending = year <= r.season;
                          return (
                            <span
                              className={ending ? "font-medium" : "text-ink-2"}
                              style={ending ? { color: "var(--good)" } : undefined}
                              title={`Contrat avec ${c.team} jusqu'au ${c.end.split("-").reverse().join("/")}${ending ? " : récupérable sans rachat" : ""}`}
                            >
                              {ending ? `fin ${year}` : year}
                            </span>
                          );
                        })()}
                      </td>
                    )}
                    <td className="px-2 py-1.5 text-right" title={r.age_approx ? "Âge approximatif (année de naissance seule)" : undefined}>
                      {r.age !== undefined ? `${r.age_approx ? "~" : ""}${r.age}` : "–"}
                    </td>
                    <td className="px-2 py-1.5 text-right">{r.games}</td>
                    <td className="px-2 py-1.5 text-right font-semibold" title={topPercent(r.role_percentile)}>
                      {fmtScore(noLeague ? r.final - r.league_bonus : r.final)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-ink-2">{fmtScore(r.league_score)}</td>
                    {(R.hasLeagues || includeLec) && (
                      <td className="px-2 py-1.5 text-right text-ink-2">{fmtScore(r.league_bonus)}</td>
                    )}
                    {R.hasEm && (
                    <td className="px-2 py-1.5 text-right text-ink-2" title={r.em_games ? `${r.em_games} parties` : ""}>
                      {fmtScore(r.em_score)}
                    </td>
                    )}
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
