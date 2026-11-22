"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { parseAsBoolean, parseAsFloat, parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { Avatar, PlayerName, TeamLogo } from "../Images";
import { Columns3Icon, LinkIcon, PencilLineIcon, RotateCcwIcon, SearchIcon, StarIcon } from "lucide-react";
import { NumberChip, Segmented, SelectChip, ToggleChip } from "./controls";
import NoteDialog from "./NoteDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fmtScore, fmtStat, topPercent } from "@/lib/format";
import { ROLES, type RankingRow, type StatKey } from "@/lib/types";
import { playerLink, publicData, REGION_INFO, teamLink, tierName } from "@/lib/region";
import { withCurrentAge } from "@/lib/age";
import { useRegion } from "@/lib/useRegion";
import { type ContractEnd, type Signed, signedFromMercato } from "@/lib/mercato/signed";
import { isStale } from "@/lib/mercato/stale";
import { isResident, ORIGINS, originLabel, originOf } from "@/lib/origin";
import { useWatchlist } from "@/lib/useWatchlist";

/** Montée la saison suivante : 1re division (doré) ou ERL2 -> ERL1 (vert) */
export interface Promoted {
  /** top / second : montée (couleur) ; move : départ vers l'autre région, même niveau ou en dessous */
  level: "top" | "second" | "move";
  team: string;
  season: number;
  rumor: boolean;
}
const PROMO_COLOR = { top: "var(--tier-lec)", second: "var(--tier-em)", move: "var(--text-3)" };

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

const ROW_HEIGHT = 44;
const RANK_W = 44; // largeur de la colonne « # » (colonne fixe à gauche)
const COLS_KEY = "donnees:colonnes";

type Meta = { align?: "right"; group: "info" | "score" | "stats"; title?: string; sticky?: number };

export default function DataExplorer({
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
  const lastSeason = Math.max(...seasons);

  // ---- Filtres : dans l'adresse de la page (lien partageable) -------------
  const [f, setF] = useQueryStates(
    {
      saison: parseAsInteger.withDefault(lastSeason),
      poste: parseAsString.withDefault(""),
      niveau: parseAsString.withDefault(""),
      ligue: parseAsString.withDefault(""),
      origine: parseAsString.withDefault(""),
      age: parseAsFloat,
      parties: parseAsInteger.withDefault(10),
      q: parseAsString.withDefault(""),
      lec: parseAsBoolean.withDefault(false),
      libres: parseAsBoolean.withDefault(false),
      liste: parseAsBoolean.withDefault(false),
      contrat: parseAsBoolean.withDefault(false),
      sansniveau: parseAsBoolean.withDefault(false),
      agesinconnus: parseAsBoolean.withDefault(true),
      tri: parseAsString.withDefault("final"),
      ordre: parseAsString.withDefault("desc"),
    },
    { history: "replace", shallow: true },
  );
  const season = seasons.includes(f.saison) ? f.saison : lastSeason;
  const isCurrent = season === lastSeason;
  const next = mercatoSeason ?? season + 1;

  // Recherche : saisie immédiate, adresse mise à jour un peu après
  const [search, setSearch] = useState(f.q);
  useEffect(() => setSearch(f.q), [f.q]);
  useEffect(() => {
    if (search === f.q) return;
    const t = setTimeout(() => setF({ q: search || null }), 250);
    return () => clearTimeout(t);
  }, [search, f.q, setF]);

  // ---- Mercato en direct (même source que Rosters) -----------------------
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
        if (mercatoGenerated && isStale(d?.live, mercatoGenerated))
          return fetch(`/api/mercato?region=${region}`, { method: "POST" })
            .then((r) => (r.ok ? r.json() : null))
            .then(use);
      })
      .catch(() => {});
  }, [region, mercatoGenerated]);
  const signed = liveSigned ?? publishedSigned;
  const watch = useWatchlist(region);
  const [noteFor, setNoteFor] = useState<{ id: string; name: string; note?: string } | null>(null);

  // ---- Données de la saison (un fichier par saison) ----------------------
  const [rows, setRows] = useState<RankingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setRows(null);
    fetch(publicData(region, `rankings_${season}.json`))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .catch(() =>
        fetch(publicData(region, "rankings.json"))
          .then((r) => r.json())
          .then((all: RankingRow[]) => all.filter((x) => x.season === season)),
      )
      .then((rs: RankingRow[]) => setRows(season === lastSeason ? withCurrentAge(rs) : rs))
      .catch(() => setError("Impossible de charger les données."));
  }, [season, region, lastSeason]);

  const leagues = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.league_code))].sort(),
    [rows],
  );
  const hasTrend = useMemo(() => (rows ?? []).some((r) => r.trend !== undefined), [rows]);
  const hasContracts = isCurrent && Object.keys(contracts).length > 0;

  // ---- Couleurs de ligne : montée, sinon « déjà un club » -----------------
  const promoOf = useCallback(
    (r: RankingRow): Promoted | undefined => {
      if (r.tier === "LEC") return undefined;
      const p = promoted[`${r.season}:${r.id}`];
      if (p) return p.level !== "move" ? p : undefined;
      const sg = isCurrent ? signed[r.id] : undefined;
      const level = sg?.tier === "LEC" ? "top" : sg?.tier === "ERL1" && r.tier === "ERL2" ? "second" : undefined;
      return sg && level ? { level, team: sg.team, season: next, rumor: !sg.official } : undefined;
    },
    [promoted, signed, isCurrent, next],
  );
  // Déjà un club : officiel, rumeur, ou contrat sans rumeur de départ ni remplaçant
  const signedOf = useCallback(
    (r: RankingRow) => (isCurrent && !promoOf(r) ? signed[r.id] : undefined),
    [isCurrent, promoOf, signed],
  );
  const tintOf = (r: RankingRow): { bg?: string; bar?: string } => {
    const p = promoOf(r);
    if (p) return { bg: `color-mix(in srgb, ${PROMO_COLOR[p.level]} 13%, transparent)`, bar: PROMO_COLOR[p.level] };
    const sg = signedOf(r);
    if (sg) return { bg: `color-mix(in srgb, var(--accent) ${sg.official ? 13 : 7}%, transparent)`, bar: sg.official ? "var(--accent)" : undefined };
    return {};
  };

  // ---- Filtrage ----------------------------------------------------------
  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = f.q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!f.poste || r.role === f.poste) &&
        (!f.niveau || r.tier === f.niveau) &&
        (!f.ligue || r.league_code === f.ligue) &&
        (!f.liste || !!watch.list[r.id]) &&
        (!f.origine || (f.origine === "?" ? !originOf(r.country, r.name) : originOf(r.country, r.name) === f.origine)) &&
        (f.age === null || (r.age === undefined ? f.agesinconnus : r.age <= f.age)) &&
        r.games >= f.parties &&
        (!f.libres || !isCurrent || (!signed[r.id] && !promoted[`${r.season}:${r.id}`])) &&
        (!f.contrat || (isCurrent && !!contracts[r.id] && Number(contracts[r.id].end.slice(0, 4)) <= r.season)) &&
        // joueurs de 1re division masqués par défaut (sauf montés en cours de saison)
        (f.lec || f.liste || (!r.played_lec && !r.ex_lec) || (!r.ex_lec && !!promoted[`${r.season}:${r.id}`])) &&
        (!q ||
          r.name.toLowerCase().includes(q) ||
          r.team.toLowerCase().includes(q) ||
          (r.current_team ?? "").toLowerCase().includes(q)),
    );
  }, [rows, f, watch.list, signed, promoted, contracts, isCurrent]);

  // ---- Cellules ------------------------------------------------------------
  function renderPlayer(r: RankingRow) {
    const o = originOf(r.country, r.name);
    const w = watch.list[r.id];
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          onClick={() => watch.toggle(r.id, r.name)}
          className="shrink-0 rounded-full p-0.5 transition-transform hover:scale-110"
          style={{ color: w ? "var(--gold)" : "var(--text-3)" }}
          title={w ? "Retirer de la liste de suivi" : "Suivre ce joueur (liste partagée)"}
          aria-label={w ? `Ne plus suivre ${r.name}` : `Suivre ${r.name}`}
          aria-pressed={!!w}
        >
          <StarIcon className="size-4" fill={w ? "currentColor" : "none"} strokeWidth={w ? 1.5 : 1.75} opacity={w ? 1 : 0.55} />
        </button>
        <Link href={playerLink(region, r.id)} className="group flex min-w-0 items-center gap-2">
          <Avatar name={r.name} src={r.photo} size={28} />
          <span className="truncate whitespace-nowrap group-hover:underline">
            <PlayerName name={r.name} />
          </span>
        </Link>
        <span className="shrink-0 text-xs text-ink-3">{r.role}</span>
        {o && !isResident(r.country, r.name, region) && (
          <span
            className="shrink-0 rounded px-1 text-[10px] font-semibold"
            style={{ background: `var(--origin-${o.toLowerCase()})`, color: "var(--origin-ink)" }}
            title={`Import · ${r.country} (${ORIGINS.find((x) => x.value === o)?.label})`}
          >
            {originLabel(o, r.country)}
          </span>
        )}
        {(r.ex_lec || (r.played_lec && !promoted[`${r.season}:${r.id}`])) && (
          <span
            className="shrink-0 rounded border border-border px-1 text-[10px] text-ink-3"
            title={r.tier === "LEC" || !r.ex_lec ? `Joueur de ${R.top} cette saison` : `Ancien joueur de ${R.top} : ${r.ex_lec}`}
          >
            {r.tier === "LEC" || !r.ex_lec ? R.top : `ex-${R.top}`}
          </span>
        )}
        {w && (
          <button
            onClick={() => setNoteFor({ id: r.id, name: r.name, note: w.note })}
            className="inline-flex max-w-40 shrink items-center gap-1 truncate text-left text-xs italic text-ink-3 hover:text-accent"
            title={w.note || "Ajouter une note"}
          >
            {!w.note && <PencilLineIcon className="size-3 shrink-0" />}
            <span className="truncate">{w.note || "note"}</span>
          </button>
        )}
      </div>
    );
  }

  function renderClub(r: RankingRow) {
    const team = isCurrent ? (r.current_team ?? r.team) : r.team;
    const logo = isCurrent ? (r.current_logo ?? r.logo) : r.logo;
    const moved = r.current_team && r.current_team !== r.team;
    const sg = signedOf(r);
    const p = promoOf(r) ?? (r.tier !== "LEC" ? promoted[`${r.season}:${r.id}`] : undefined);
    return (
      <span
        className="flex items-center gap-1.5 whitespace-nowrap text-ink-2"
        title={moved ? (isCurrent ? `Club actuel. Saison évaluée avec ${r.team}` : `Aujourd'hui : ${r.current_team}`) : undefined}
      >
        <TeamLogo team={team} src={logo} size={18} />
        <Link
          href={teamLink(region, team)}
          onClick={(e) => e.stopPropagation()}
          className="max-w-40 truncate hover:text-ink hover:underline"
          title={`Page de l'équipe ${team}`}
        >
          {team}
        </Link>
        {sg && (
          <span
            className="text-xs text-ink-3"
            title={`${next} : ${sg.team} (${sg.kind === "official" ? "officiel" : sg.kind === "contract" ? "sous contrat" : "rumeur"})`}
          >
            {sg.stays ? (
              `✓ ${next}`
            ) : (
              <>
                →{" "}
                <Link href={teamLink(region, sg.team)} onClick={(e) => e.stopPropagation()} className="hover:text-ink hover:underline">
                  {sg.team}
                </Link>
              </>
            )}
            {sg.kind === "rumor" && " (rumeur)"}
            {sg.kind === "contract" && " (sous contrat)"}
          </span>
        )}
        {p && (
          <span
            className="flex items-center gap-1 text-xs"
            title={`${p.rumor ? "Rumeur" : p.level === "move" ? "Transfert" : "Montée"} ${p.season === r.season ? `en cours de saison ${p.season}` : p.season} : ${p.team}`}
          >
            <span style={{ color: PROMO_COLOR[p.level] }}>→</span>
            <Link href={teamLink(region, p.team)} onClick={(e) => e.stopPropagation()} className="max-w-32 truncate hover:underline">
              {p.team}
            </Link>
            {p.rumor && <span className="text-ink-3">(rumeur)</span>}
          </span>
        )}
        {isCurrent && r.current_league && r.current_league !== r.league_code && (
          <span className="text-xs text-ink-3">{r.current_league}</span>
        )}
      </span>
    );
  }

  // ---- Colonnes ----------------------------------------------------------
  const columns = useMemo<ColumnDef<RankingRow>[]>(() => {
    const num = (key: keyof RankingRow, header: string, meta: Partial<Meta> & { group: Meta["group"] }, cell?: (r: RankingRow) => React.ReactNode): ColumnDef<RankingRow> => ({
      id: key as string,
      header,
      accessorFn: (r) => r[key] as number | undefined,
      sortUndefined: "last",
      sortDescFirst: true,
      meta: { align: "right", ...meta } satisfies Meta,
      cell: ({ row }) => (cell ? cell(row.original) : fmtScore(row.original[key] as number | undefined)),
    });
    const cols: ColumnDef<RankingRow>[] = [
      {
        id: "player",
        header: "Joueur",
        enableSorting: false,
        enableHiding: false,
        meta: { group: "info", sticky: RANK_W } satisfies Meta,
        cell: ({ row }) => renderPlayer(row.original),
      },
      {
        id: "club",
        header: isCurrent ? "Club actuel" : `Club en ${season}`,
        enableSorting: false,
        meta: { group: "info", title: isCurrent ? "Club de sa dernière partie, et son club pour la saison suivante d'après le mercato" : undefined } satisfies Meta,
        cell: ({ row }) => renderClub(row.original),
      },
      {
        id: "league",
        header: "Ligue",
        accessorFn: (r) => r.league_code,
        sortDescFirst: false,
        meta: { group: "info", title: "Ligue sur laquelle la saison est évaluée" } satisfies Meta,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-ink-2">
            {row.original.league_code}{" "}
            {row.original.league_code !== tierName(row.original.tier, region) && (
              <span className="text-xs text-ink-3">{tierName(row.original.tier, region)}</span>
            )}
          </span>
        ),
      },
    ];
    if (hasContracts)
      cols.push({
        id: "contract",
        header: "Contrat",
        accessorFn: (r) => (contracts[r.id] ? Number(contracts[r.id].end.slice(0, 4)) : undefined),
        sortUndefined: "last",
        sortDescFirst: false,
        meta: { group: "info", title: "Fin de contrat avec le club (base GCD de Riot, via Leaguepedia)" } satisfies Meta,
        cell: ({ row }) => <ContractCell c={contracts[row.original.id]} season={row.original.season} />,
      });
    cols.push(
      num("age", "Âge", { group: "info" }, (r) => (
        <span title={r.age_approx ? "Âge approximatif (année de naissance seule)" : undefined}>
          {r.age !== undefined ? `${r.age_approx ? "~" : ""}${r.age}` : "–"}
        </span>
      )),
      num("games", "Parties", { group: "info" }, (r) => r.games),
      {
        id: "final",
        header: "Score",
        accessorFn: (r) => (f.sansniveau ? r.final - r.league_bonus : r.final),
        sortDescFirst: true,
        enableHiding: false,
        meta: { align: "right", group: "score", title: f.sansniveau ? "Score sans le niveau de ligue" : "Score final" } satisfies Meta,
        cell: ({ row, getValue }) => (
          <span className="font-semibold text-ink" title={topPercent(row.original.role_percentile)}>
            {fmtScore(getValue() as number)}
          </span>
        ),
      },
    );
    if (hasTrend)
      cols.push(
        num("trend", "Prog.", { group: "score", title: "Progression : score final de la saison moins celui de la saison précédente" }, (r) =>
          r.trend === undefined ? (
            <span className="text-ink-3" title="Pas classé la saison précédente">–</span>
          ) : (
            <span
              className="whitespace-nowrap text-xs"
              title={`${r.trend_prev} → ${r.trend_split}`}
              style={{ color: r.trend >= 0.15 ? "var(--good)" : r.trend <= -0.15 ? "var(--critical)" : "var(--text-3)" }}
            >
              {r.trend >= 0.15 ? "↑" : r.trend <= -0.15 ? "↓" : "→"} {fmtScore(r.trend)}
            </span>
          ),
        ),
      );
    cols.push(num("league_score", "Ligue", { group: "score", title: "Performance dans sa ligue (z-score pondéré)" }));
    if (R.hasLeagues || f.lec) cols.push(num("league_bonus", "Bonus", { group: "score", title: "Bonus de niveau de ligue" }));
    if (R.hasEm)
      cols.push(
        num("em_score", "EM", { group: "score", title: "Performance à l'EMEA Masters" }, (r) => (
          <span title={r.em_games ? `${r.em_games} parties` : ""}>{fmtScore(r.em_score)}</span>
        )),
      );
    for (const c of STAT_COLUMNS.filter((c) => hasOe || !c.oe))
      cols.push(num(c.key, c.label, { group: "stats" }, (r) => <span className="whitespace-nowrap">{fmtStat(c.key, r[c.key])}</span>));
    return cols;
    // renderPlayer / renderClub lisent watch, promoOf... : recréées avec eux
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCurrent, season, region, hasContracts, contracts, f.sansniveau, f.lec, hasTrend, R, hasOe, watch.list, promoOf, signedOf]);

  // Colonnes affichées : choix mémorisé dans ce navigateur
  const [visibility, setVisibility] = useState<VisibilityState>({});
  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLS_KEY);
      if (saved) setVisibility(JSON.parse(saved));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(COLS_KEY, JSON.stringify(visibility));
    } catch {}
  }, [visibility]);

  const sortId = columns.some((c) => c.id === f.tri) ? f.tri : "final";
  // Même objet d'un rendu à l'autre : sinon TanStack recalcule le tri à
  // chaque rendu et relance un rendu (boucle)
  const sortDesc = f.ordre !== "asc";
  const sorting: SortingState = useMemo(() => [{ id: sortId, desc: sortDesc }], [sortId, sortDesc]);
  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, columnVisibility: visibility },
    onSortingChange: (updater) => {
      const s = typeof updater === "function" ? updater(sorting) : updater;
      const first = s[0];
      if (!first) setF({ tri: null, ordre: null });
      else setF({ tri: first.id === "final" ? null : first.id, ordre: first.desc ? null : "asc" });
    },
    onColumnVisibilityChange: setVisibility,
    enableSortingRemoval: false,
    autoResetPageIndex: false, // pas de pagination (défilement virtualisé)
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const tableRows = table.getRowModel().rows;

  // ---- Défilement virtualisé ---------------------------------------------
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  const items = virtualizer.getVirtualItems();
  const padTop = items.length ? items[0].start : 0;
  const padBottom = items.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0;
  // retour en haut du tableau quand les filtres changent
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [f.poste, f.niveau, f.ligue, f.origine, f.age, f.parties, f.q, f.lec, f.libres, f.liste, f.contrat, season]);

  // ---- Barre de filtres ----------------------------------------------------
  const tiers = [
    ...(f.lec ? [{ value: "LEC", label: R.top }] : []),
    { value: "ERL1", label: tierName("ERL1", region) },
    ...(R.hasErl2 ? [{ value: "ERL2", label: tierName("ERL2", region) }] : []),
  ];
  const isDefault =
    !f.poste && !f.niveau && !f.ligue && !f.origine && f.age === null && f.parties === 10 && !f.q && !f.lec &&
    !f.libres && !f.liste && !f.contrat && !f.sansniveau;
  const [copied, setCopied] = useState(false);
  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  const reset = () =>
    setF({
      poste: null, niveau: null, ligue: null, origine: null, age: null, parties: null, q: null, lec: null,
      libres: null, liste: null, contrat: null, sansniveau: null, agesinconnus: null, tri: null, ordre: null,
    });

  const hideable = table.getAllLeafColumns().filter((c) => c.getCanHide());
  const groups: { id: Meta["group"]; label: string }[] = [
    { id: "info", label: "Infos" },
    { id: "score", label: "Score" },
    { id: "stats", label: "Stats" },
  ];
  const hiddenCount = hideable.filter((c) => !c.getIsVisible()).length;

  return (
    <div className="space-y-3">
      {/* Filtres */}
      <section
        aria-label="Filtres"
        className="space-y-3 card p-3 shadow-[0_1px_2px_rgb(0_0_0/0.04)] sm:p-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1 sm:max-w-sm">
            <SearchIcon aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Joueur ou équipe…"
              aria-label="Rechercher un joueur ou une équipe"
              className="h-9 w-full rounded-full border border-border bg-surface-2 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-ink-3 focus:border-accent focus:bg-surface"
            />
          </div>
          <Segmented
            label="Saison"
            value={String(season)}
            onChange={(v) => setF({ saison: Number(v) === lastSeason ? null : Number(v) })}
            options={[...seasons].reverse().map((s) => ({ value: String(s), label: String(s) }))}
          />
          <Segmented
            label="Poste"
            value={f.poste}
            onChange={(v) => setF({ poste: v || null })}
            options={[{ value: "", label: "Tous" }, ...ROLES.map((r) => ({ value: r, label: r }))]}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(R.hasErl2 || f.lec) && (
            <SelectChip label="Niveau" value={f.niveau} onChange={(v) => setF({ niveau: v || null })} options={tiers} allLabel="Tous" />
          )}
          <SelectChip
            label="Ligue"
            value={f.ligue}
            onChange={(v) => setF({ ligue: v || null })}
            options={leagues.map((l) => ({ value: l, label: l }))}
          />
          <SelectChip
            label="Origine"
            value={f.origine}
            onChange={(v) => setF({ origine: v || null })}
            options={[...ORIGINS, { value: "?", label: "Inconnue" }]}
          />
          <NumberChip label="Âge max" value={f.age} onChange={(v) => setF({ age: v })} min={15} max={40} step={0.1} suffix="ans" />
          <NumberChip label="Parties min" value={f.parties} onChange={(v) => setF({ parties: v === 10 ? null : v ?? 0 })} min={0} max={200} defaultValue={10} />
          <span aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:block" />
          <ToggleChip checked={f.lec} onChange={(v) => setF({ lec: v || null })} title={`Joueurs de ${R.top} et anciens joueurs de ${R.top}`}>
            {R.top} inclus
          </ToggleChip>
          {isCurrent && Object.keys(signed).length > 0 && (
            <ToggleChip checked={f.libres} onChange={(v) => setF({ libres: v || null })} title={`Sans club pour ${next} d'après le mercato`}>
              Libres pour {next}
            </ToggleChip>
          )}
          {hasContracts && (
            <ToggleChip
              checked={f.contrat}
              onChange={(v) => setF({ contrat: v || null })}
              title="Contrat (base GCD de Riot) qui se termine à la fin de la saison : récupérable sans rachat"
            >
              Fin de contrat {season}
            </ToggleChip>
          )}
          <ToggleChip checked={f.liste} onChange={(v) => setF({ liste: v || null })} title="Joueurs suivis (liste partagée)">
            <StarIcon className="size-3.5" style={{ color: "var(--gold)" }} fill="currentColor" /> Ma liste · {Object.keys(watch.list).length}
          </ToggleChip>
          {R.hasLeagues && (
            <ToggleChip
              checked={f.sansniveau}
              onChange={(v) => setF({ sansniveau: v || null })}
              title="Score sans le bonus/malus de niveau de ligue : qui domine le plus sa propre ligue"
            >
              Sans niveau de ligue
            </ToggleChip>
          )}
          {f.age !== null && (
            <ToggleChip checked={f.agesinconnus} onChange={(v) => setF({ agesinconnus: v ? null : false })} title="Garder les joueurs dont l'âge est inconnu">
              Âges inconnus
            </ToggleChip>
          )}
        </div>
      </section>

      {/* Résumé, légende et actions */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-2">
        <span className="text-sm">
          <b className="text-ink tabular-nums">{rows ? filtered.length : "…"}</b> joueurs
        </span>
        {isCurrent && Object.keys(signed).length > 0 && (
          <Legend color="color-mix(in srgb, var(--accent) 40%, transparent)" title="Officiel, rumeur, ou sous contrat sans rumeur de départ ni remplaçant (plus clair = rumeur ou sous contrat)">
            Déjà un club pour {next}
          </Legend>
        )}
        <Legend color={PROMO_COLOR.top}>Monte en {R.top}</Legend>
        {R.hasEm && <Legend color={PROMO_COLOR.second}>Monte en {tierName("ERL1", region)}</Legend>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button>
                <Columns3Icon />
                Colonnes{hiddenCount ? ` · ${hiddenCount} masquée${hiddenCount > 1 ? "s" : ""}` : ""}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-2">
              {groups.map((g) => (
                <div key={g.id}>
                  <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{g.label}</div>
                  <div className="grid grid-cols-2 gap-0.5">
                    {hideable
                      .filter((c) => (c.columnDef.meta as Meta | undefined)?.group === g.id)
                      .map((c) => (
                        <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-[13px] hover:bg-surface-2">
                          <Checkbox checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(v === true)} />
                          {String(c.columnDef.header)}
                        </label>
                      ))}
                  </div>
                </div>
              ))}
              {hiddenCount > 0 && (
                <Button variant="link" size="sm" className="px-1.5" onClick={() => setVisibility({})}>
                  Tout afficher
                </Button>
              )}
            </PopoverContent>
          </Popover>
          <Button onClick={copyLink} title="Copier l'adresse de cette vue (filtres et tri compris)">
            <LinkIcon />
            {copied ? "Lien copié ✓" : "Copier le lien"}
          </Button>
          {!isDefault && (
            <Button variant="ghost" onClick={reset}>
              <RotateCcwIcon />
              Réinitialiser
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-critical">{error}</p>}

      {/* Tableau */}
      <div
        ref={scrollRef}
        className="relative h-[calc(100dvh-15rem)] min-h-[26rem] overflow-auto card"
      >
        {!rows && !error && <p className="p-4 text-sm text-ink-3">Chargement…</p>}
        {rows && (
          <table className="tabular w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-20 text-xs text-ink-3">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  <th
                    className="sticky left-0 z-10 border-b border-border bg-surface-2 px-2 py-2.5 text-left font-medium"
                    style={{ width: RANK_W, minWidth: RANK_W }}
                  >
                    #
                  </th>
                  {hg.headers.map((h) => {
                    const meta = h.column.columnDef.meta as Meta | undefined;
                    const sorted = h.column.getIsSorted();
                    return (
                      <th
                        key={h.id}
                        title={meta?.title}
                        aria-sort={sorted ? (sorted === "desc" ? "descending" : "ascending") : undefined}
                        className={`whitespace-nowrap border-b border-border bg-surface-2 px-2 py-2.5 font-medium ${
                          meta?.align === "right" ? "text-right" : "text-left"
                        } ${meta?.sticky !== undefined ? "sticky z-10" : ""}`}
                        style={meta?.sticky !== undefined ? { left: meta.sticky } : undefined}
                      >
                        {h.column.getCanSort() ? (
                          <button
                            onClick={h.column.getToggleSortingHandler()}
                            className={`inline-flex items-center gap-1 hover:text-ink ${sorted ? "text-ink" : ""}`}
                          >
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            <span aria-hidden className={sorted ? "text-accent" : "opacity-0"}>
                              {sorted === "asc" ? "↑" : "↓"}
                            </span>
                          </button>
                        ) : (
                          flexRender(h.column.columnDef.header, h.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {padTop > 0 && (
                <tr aria-hidden>
                  <td style={{ height: padTop }} />
                </tr>
              )}
              {items.map((vi) => {
                const row = tableRows[vi.index];
                const r = row.original;
                const tint = tintOf(r);
                // cellules fixes (# et joueur) : fond opaque + teinte de la ligne
                const stickyBg = tint.bg ? `linear-gradient(${tint.bg}, ${tint.bg}), var(--surface)` : "var(--surface)";
                return (
                  <tr key={row.id} className="group" style={{ height: ROW_HEIGHT, background: tint.bg }}>
                    <td
                      className="sticky left-0 z-10 border-b border-border px-2 text-ink-3 tabular-nums group-hover:brightness-95"
                      style={{ background: stickyBg, boxShadow: tint.bar ? `inset 3px 0 0 ${tint.bar}` : undefined, width: RANK_W }}
                    >
                      {vi.index + 1}
                    </td>
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as Meta | undefined;
                      const sticky = meta?.sticky !== undefined;
                      return (
                        <td
                          key={cell.id}
                          className={`border-b border-border px-2 group-hover:bg-surface-2/60 ${meta?.align === "right" ? "text-right" : ""} ${
                            sticky ? "sticky z-10 max-w-[22rem] border-r border-r-border/70" : ""
                          }`}
                          style={sticky ? { left: meta!.sticky, background: stickyBg } : undefined}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {padBottom > 0 && (
                <tr aria-hidden>
                  <td style={{ height: padBottom }} />
                </tr>
              )}
              {!filtered.length && (
                <tr>
                  <td colSpan={99} className="p-8 text-center text-sm text-ink-3">
                    Aucun joueur avec ces filtres.{" "}
                    <button onClick={reset} className="text-accent hover:underline">
                      Réinitialiser
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <NoteDialog
        player={noteFor}
        onOpenChange={(open) => !open && setNoteFor(null)}
        onSave={(note) => {
          if (noteFor) watch.setNote(noteFor.id, noteFor.name, note);
          setNoteFor(null);
        }}
        onRemove={() => {
          if (noteFor) watch.toggle(noteFor.id, noteFor.name);
          setNoteFor(null);
        }}
      />

      <p className="text-xs text-ink-3">
        Score ={" "}
        {R.hasEm ? "perf. dans sa ligue + bonus de niveau de ligue + EMEA Masters + forme du dernier split" : "perf. comparée aux joueurs du même poste + forme du dernier split"}
        {f.lec && ` · Joueurs de ${R.top} : jugés en partie par rapport à leur équipe, + bonus fixe de 1re division ; leur « top % » les situe parmi les prospects de leur poste`}
        . Clic sur un en-tête pour trier ; filtres et tri sont dans l&apos;adresse de la page.
      </p>
    </div>
  );
}

function Legend({ color, children, title }: { color: string; children: React.ReactNode; title?: string }) {
  return (
    <span className="flex items-center gap-1.5" title={title}>
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {children}
    </span>
  );
}

function ContractCell({ c, season }: { c?: ContractEnd; season: number }) {
  if (!c) return <span className="text-ink-3">–</span>;
  const year = Number(c.end.slice(0, 4));
  const ending = year <= season;
  return (
    <span
      className={`whitespace-nowrap text-xs ${ending ? "font-medium" : "text-ink-2"}`}
      style={ending ? { color: "var(--good)" } : undefined}
      title={`Contrat avec ${c.team} jusqu'au ${c.end.split("-").reverse().join("/")}${ending ? " : récupérable sans rachat" : ""}`}
    >
      {ending ? `fin ${year}` : year}
    </span>
  );
}
