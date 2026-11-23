"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { playerLink, type Region, teamLink } from "@/lib/region";
import { champIcon, useDdragonVersion } from "@/lib/champions";

export interface TeamResult {
  season: number;
  tournament: string;
  league?: string | null;
  code?: string | null;
  tier?: string | null;
  intl: boolean;
  start?: string | null;
  end?: string | null;
  team: string;
  place?: string | null;
  place_n?: number | null;
  prize?: number | null;
  last?: string | null;
  wins?: number | null;
  games?: number | null;
  lineup: { name: string; id?: string | null; role: string; games: number }[];
}
export interface TeamMatchSide {
  team: string;
  win: boolean;
  /** [pseudo, id, champion, kills, morts, assists, CS, gold, dégâts] (stats : exports récents) */
  players: [string, string | null, string, ...(number | null)[]][];
}
export interface TeamMatch {
  date: string;
  season: number;
  tournament: string;
  code?: string | null;
  duration?: number | null;
  a: TeamMatchSide;
  b: TeamMatchSide;
}
export interface FormerPlayer {
  id: string;
  name: string;
  role: string;
  first: number;
  last: number;
  games: number;
  now?: string;
}

const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"];
const MAJOR_INTL = ["World Championship", "Mid-Season Invitational", "Esports World Cup", "First Stand"];
/** Vrai tournoi international (pas l'EMEA Masters, compétition de 2e division, ni une qualification) */
const isMajor = (r: TeamResult) =>
  !!r.league && MAJOR_INTL.includes(r.league) && !/qualifier|qualification/i.test(r.tournament);
const isEM = (r: TeamResult) => r.league === "EMEA Masters" || r.league === "European Masters" || r.code === "EM" || /EMEA Masters|^EM \d/.test(r.tournament);
const short = (n: string) => n.replace(/\s*\(.*\)$/, "");
const fmtDate = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "–");
const MEDAL: Record<number, string> = { 1: "#f2b440", 2: "#b9c3d6", 3: "#cd7f45" };

function Place({ r }: { r: TeamResult }) {
  if (!r.place) return <span className="text-ink-3" title="Pas de classement renseigné (tournoi en cours ou non classé)">–</span>;
  const color = r.place_n ? MEDAL[r.place_n] : undefined;
  return (
    <span
      className="inline-flex min-w-9 justify-center rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums"
      style={color ? { background: `color-mix(in srgb, ${color} 22%, transparent)`, color } : { background: "var(--surface-2)" }}
    >
      {r.place_n === 1 ? "🏆 1" : r.place}
    </span>
  );
}

function Lineup({ r, region }: { r: TeamResult; region: Region }) {
  const starters = ROLES.map((role) => r.lineup.filter((p) => p.role === role).sort((a, b) => b.games - a.games)[0]).filter(Boolean);
  const subs = r.lineup.filter((p) => !starters.includes(p));
  return (
    <span className="flex flex-wrap items-center gap-1">
      {starters.map((p) =>
        p.id ? (
          <Link key={p.name + p.role} href={playerLink(region, p.id)} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] hover:text-accent" title={`${p.role} · ${p.games} parties`}>
            {short(p.name)}
          </Link>
        ) : (
          <span key={p.name + p.role} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px]" title={`${p.role} · ${p.games} parties`}>
            {short(p.name)}
          </span>
        ),
      )}
      {subs.length > 0 && (
        <span className="text-[10px] text-ink-3" title={subs.map((p) => `${short(p.name)} (${p.role}, ${p.games} p.)`).join(", ")}>
          +{subs.length}
        </span>
      )}
    </span>
  );
}

function Results({ results, region }: { results: TeamResult[]; region: Region }) {
  const seasons = [...new Set(results.map((r) => r.season))].sort((a, b) => b - a);
  const [season, setSeason] = useState("all");
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: "date" | "place"; asc: boolean }>({ key: "date", asc: false });
  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = results.filter(
      (r) =>
        (season === "all" || r.season === Number(season)) &&
        (kind === "all" ||
          (kind === "intl" ? isMajor(r) : kind === "em" ? isEM(r) : kind === "league" ? !r.intl && !isEM(r) : true)) &&
        (kind !== "playoffs" || /playoff|final/i.test(r.tournament)) &&
        (!query || r.tournament.toLowerCase().includes(query) || (r.league ?? "").toLowerCase().includes(query)),
    );
    const dir = sort.asc ? 1 : -1;
    return [...list].sort((a, b) =>
      sort.key === "date"
        ? dir * (a.end ?? a.start ?? "").localeCompare(b.end ?? b.start ?? "")
        : dir * ((a.place_n ?? 999) - (b.place_n ?? 999)),
    );
  }, [results, season, kind, q, sort]);

  const titles = results.filter((r) => r.place_n === 1);
  const podiums = results.filter((r) => r.place_n && r.place_n <= 3);
  const intlBest = results.filter((r) => isMajor(r) && r.place_n).sort((a, b) => a.place_n! - b.place_n! || (b.end ?? "").localeCompare(a.end ?? ""))[0];
  const emBest = results.filter((r) => isEM(r) && r.place_n).sort((a, b) => a.place_n! - b.place_n!)[0];
  const prize = results.reduce((n, r) => n + (r.prize ?? 0), 0);
  const total = rows.reduce((acc, r) => ({ w: acc.w + (r.wins ?? 0), g: acc.g + (r.games ?? 0) }), { w: 0, g: 0 });
  const SortIcon = sort.asc ? ArrowUpIcon : ArrowDownIcon;
  const header = (key: "date" | "place", label: string) => (
    <button className="inline-flex items-center gap-0.5 uppercase" onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : key === "place" }))}>
      {label}
      {sort.key === key && <SortIcon className="size-3" />}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Titres" value={titles.length} hint={titles.slice(0, 3).map((t) => t.tournament).join(" · ") || "aucun depuis 2023"} gold />
        <Stat label="Podiums" value={podiums.length} hint={`sur ${results.filter((r) => r.place).length} tournois classés`} />
        <Stat
          label="Meilleur résultat international"
          value={intlBest ? intlBest.place ?? "–" : "–"}
          hint={
            intlBest
              ? results
                  .filter((r) => isMajor(r) && r.place_n === intlBest.place_n)
                  .map((r) => r.tournament)
                  .join(" · ")
              : emBest
                ? `pas de Worlds / MSI / EWC / First Stand ; EMEA Masters : ${emBest.place} (${emBest.tournament})`
                : "Worlds, MSI, EWC, First Stand : aucun classement"
          }
        />
        <Stat label="Gains" value={prize ? `${prize.toLocaleString("fr-FR")} $` : "–"} hint="prize money renseigné sur Leaguepedia" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect value={season} onChange={(e) => setSeason(e.target.value)} aria-label="Saison">
          <option value="all">Toutes les saisons</option>
          {seasons.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type">
          <option value="all">Tous les tournois</option>
          <option value="league">Ligue</option>
          <option value="playoffs">Playoffs et finales</option>
          <option value="intl">International (Worlds, MSI, EWC, First Stand)</option>
          {results.some(isEM) && <option value="em">EMEA Masters</option>}
        </NativeSelect>
        <label className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-sm">
          <SearchIcon className="size-3.5 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tournoi…" className="w-32 bg-transparent outline-none" />
        </label>
        <span className="ml-auto text-xs text-ink-3">
          {rows.length} tournois · {total.w}-{total.g - total.w} en parties
          {total.g ? ` (${Math.round((100 * total.w) / total.g)} %)` : ""}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] text-ink-3">
              <th className="py-1.5 pr-2 font-medium">{header("date", "Date")}</th>
              <th className="py-1.5 pr-2 font-medium uppercase">Tournoi</th>
              <th className="py-1.5 pr-2 text-center font-medium">{header("place", "Place")}</th>
              <th className="py-1.5 pr-2 text-right font-medium uppercase">Bilan</th>
              <th className="py-1.5 pr-2 text-right font-medium uppercase" title="Score du dernier match ou de la phase">Dernier</th>
              <th className="py-1.5 pr-2 text-right font-medium uppercase">Gains</th>
              <th className="py-1.5 font-medium uppercase">Effectif</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.tournament}|${r.team}`} className="border-b border-border/60 align-middle hover:bg-surface-2/50">
                <td className="whitespace-nowrap py-1.5 pr-2 tabular-nums text-ink-2">{fmtDate(r.end ?? r.start)}</td>
                <td className="py-1.5 pr-2">
                  <div className="flex items-center gap-1.5">
                    {isMajor(r) && <span className="rounded bg-accent-soft px-1 text-[10px] font-semibold text-accent">INTL</span>}
                    {isEM(r) && <span className="rounded bg-surface-2 px-1 text-[10px] font-semibold text-ink-2">EM</span>}
                    <span className="font-medium">{r.tournament}</span>
                  </div>
                  {r.team !== results[0]?.team && <div className="text-[11px] text-ink-3">sous le nom {r.team}</div>}
                </td>
                <td className="py-1.5 pr-2 text-center">
                  <Place r={r} />
                </td>
                <td className="whitespace-nowrap py-1.5 pr-2 text-right tabular-nums">
                  {r.games ? (
                    <span title={`${r.wins} victoires sur ${r.games} parties`}>
                      {r.wins}-{r.games - (r.wins ?? 0)}
                      <span className="ml-1 text-[11px] text-ink-3">{Math.round((100 * (r.wins ?? 0)) / r.games)} %</span>
                    </span>
                  ) : (
                    "–"
                  )}
                </td>
                <td className="whitespace-nowrap py-1.5 pr-2 text-right tabular-nums text-ink-2">{r.last ?? "–"}</td>
                <td className="whitespace-nowrap py-1.5 pr-2 text-right tabular-nums text-ink-2">{r.prize ? `${r.prize.toLocaleString("fr-FR")} $` : "–"}</td>
                <td className="py-1.5">
                  <Lineup r={r} region={region} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="py-6 text-center text-sm text-ink-3">Aucun tournoi pour ces filtres.</p>}
      </div>
    </div>
  );
}

function Stat({ label, value, hint, gold }: { label: string; value: React.ReactNode; hint?: string; gold?: boolean }) {
  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <div className="text-[11px] uppercase tracking-wide text-ink-3">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums" style={gold ? { color: "var(--gold)" } : undefined}>
        {value}
      </div>
      {hint && <div className="truncate text-[11px] text-ink-3" title={hint}>{hint}</div>}
    </div>
  );
}

const PAGE = 40;

function Champ({ name, version, size = 30 }: { name: string; version: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = name.replace(/[^A-Za-z ]/g, "").split(" ").map((w) => w[0]).join("").slice(0, 2);
  if (!version || failed)
    return (
      <span
        className="grid shrink-0 place-items-center rounded-md bg-surface-2 text-[10px] font-semibold text-ink-3"
        style={{ width: size, height: size }}
        title={name}
      >
        {initials}
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={champIcon(version, name)}
      alt={name}
      title={name}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-md ring-1 ring-border"
    />
  );
}

const k = (n?: number | null) => (n === null || n === undefined ? "–" : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const sumOf = (side: TeamMatchSide, i: number) =>
  side.players.reduce((n, p) => n + ((p[i] as number | null | undefined) ?? 0), 0);
const hasStats = (side: TeamMatchSide) => side.players.some((p) => typeof p[3] === "number");

function MatchDetail({ m, us, them, region }: { m: TeamMatch; us: TeamMatchSide; them: TeamMatchSide; region: Region }) {
  const version = useDdragonVersion();
  const stats = hasStats(us) && hasStats(them);
  const maxDmg = Math.max(1, ...[...us.players, ...them.players].map((p) => (p[8] as number | null) ?? 0));
  const minutes = m.duration ?? null;
  const goldDiff = stats ? sumOf(us, 7) - sumOf(them, 7) : null;
  const side = (s: TeamMatchSide, mirror: boolean) => (
    <div className={`rounded-xl border p-3 ${s.win ? "border-[color-mix(in_srgb,var(--good)_45%,transparent)]" : "border-border"}`}>
      <div className={`mb-2 flex items-center gap-2 ${mirror ? "flex-row-reverse text-right" : ""}`}>
        <Link href={teamLink(region, s.team)} className="truncate font-semibold hover:underline">
          {s.team}
        </Link>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
          style={{ background: `color-mix(in srgb, ${s.win ? "var(--good)" : "var(--critical)"} 22%, transparent)`, color: s.win ? "var(--good-text)" : "var(--critical)" }}
        >
          {s.win ? "Victoire" : "Défaite"}
        </span>
        {stats && (
          <span className={`text-xs tabular-nums text-ink-3 ${mirror ? "mr-auto" : "ml-auto"}`}>
            {sumOf(s, 3)}/{sumOf(s, 4)}/{sumOf(s, 5)} · {k(sumOf(s, 7))} gold
          </span>
        )}
      </div>
      <ul className="space-y-1">
        {s.players.map(([name, id, champ, kills, deaths, assists, cs, gold, dmg], i) => {
          const kda = typeof kills === "number" ? `${kills}/${deaths}/${assists}` : null;
          const ratio = typeof kills === "number" ? ((kills + (assists ?? 0)) / Math.max(1, deaths ?? 0)).toFixed(1) : null;
          return (
            <li key={name + i} className={`flex items-center gap-2 ${mirror ? "flex-row-reverse text-right" : ""}`}>
              <Champ name={champ as string} version={version} />
              <div className="min-w-0 flex-1">
                <div className={`flex items-baseline gap-1.5 ${mirror ? "flex-row-reverse" : ""}`}>
                  <span className="w-7 shrink-0 text-[10px] uppercase text-ink-3">{(ROLES[i] ?? "").slice(0, 3)}</span>
                  {id ? (
                    <Link href={playerLink(region, id as string)} className="truncate text-sm font-medium hover:underline">
                      {short(name as string)}
                    </Link>
                  ) : (
                    <span className="truncate text-sm font-medium">{short(name as string)}</span>
                  )}
                  <span className="truncate text-[11px] text-ink-3">{champ}</span>
                </div>
                {typeof dmg === "number" && (
                  <div className={`mt-0.5 flex items-center gap-1.5 ${mirror ? "flex-row-reverse" : ""}`} title={`${dmg.toLocaleString("fr-FR")} dégâts aux champions`}>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className={`h-full rounded-full ${mirror ? "ml-auto" : ""}`}
                        style={{ width: `${(100 * dmg) / maxDmg}%`, background: s.win ? "var(--good)" : "var(--series-2)" }}
                      />
                    </div>
                    <span className="w-9 shrink-0 text-[10px] tabular-nums text-ink-3">{k(dmg)}</span>
                  </div>
                )}
              </div>
              {kda && (
                <div className="w-28 shrink-0 text-xs tabular-nums">
                  <div className="font-semibold">{kda}</div>
                  <div className="text-[10px] text-ink-3">
                    KDA {ratio} · {cs} CS{minutes ? ` (${((cs as number) / minutes).toFixed(1)})` : ""}
                  </div>
                </div>
              )}
              {typeof gold === "number" && <div className="hidden w-11 shrink-0 text-[11px] tabular-nums text-ink-3 sm:block">{k(gold)}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
  return (
    <div className="mb-3 space-y-3 rounded-xl bg-surface-2/40 p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
        <span className="font-semibold text-ink">{m.tournament}</span>
        <span>{m.date.replace("T", " ").slice(0, 16).split(" ")[0].split("-").reverse().join("/")} {m.date.slice(11, 16)}</span>
        {minutes && <span>durée {Math.floor(minutes)}:{String(Math.round((minutes % 1) * 60)).padStart(2, "0")}</span>}
        {stats && (
          <span className="ml-auto flex items-center gap-3 tabular-nums">
            <span className="text-base font-bold text-ink">
              {sumOf(us, 3)} <span className="text-ink-3">–</span> {sumOf(them, 3)}
            </span>
            <span style={{ color: goldDiff! >= 0 ? "var(--good-text)" : "var(--critical)" }}>
              {goldDiff! >= 0 ? "+" : "−"}
              {k(Math.abs(goldDiff!))} gold
            </span>
          </span>
        )}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {side(us, false)}
        {side(them, true)}
      </div>
      {!stats && <p className="text-[11px] text-ink-3">K/D/A, CS et dégâts : au prochain export (python run_all.py).</p>}
    </div>
  );
}

function Matches({ matches, names, region }: { matches: TeamMatch[]; names: string[]; region: Region }) {
  const seasons = [...new Set(matches.map((m) => m.season))].sort((a, b) => b - a);
  const [season, setSeason] = useState(String(seasons[0] ?? "all"));
  const [tournament, setTournament] = useState("all");
  const [result, setResult] = useState("all");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const ours = (m: TeamMatch) => (names.includes(m.a.team) ? [m.a, m.b] : [m.b, m.a]);
  const inSeason = matches.filter((m) => season === "all" || m.season === Number(season));
  const tournaments = [...new Set(inSeason.map((m) => m.tournament))];
  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return inSeason.filter((m) => {
      const [us, them] = ours(m);
      return (
        (tournament === "all" || m.tournament === tournament) &&
        (result === "all" || (result === "w" ? us.win : !us.win)) &&
        (!query ||
          them.team.toLowerCase().includes(query) ||
          [...us.players, ...them.players].some((p) => p[0].toLowerCase().includes(query) || p[2].toLowerCase().includes(query)))
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, season, tournament, result, q]);
  const wins = rows.filter((m) => ours(m)[0].win).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect value={season} onChange={(e) => { setSeason(e.target.value); setTournament("all"); setShown(PAGE); }} aria-label="Saison">
          <option value="all">Toutes les saisons</option>
          {seasons.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={tournament} onChange={(e) => { setTournament(e.target.value); setShown(PAGE); }} aria-label="Tournoi" className="max-w-64">
          <option value="all">Tous les tournois</option>
          {tournaments.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={result} onChange={(e) => setResult(e.target.value)} aria-label="Résultat">
          <option value="all">Victoires et défaites</option>
          <option value="w">Victoires</option>
          <option value="l">Défaites</option>
        </NativeSelect>
        <label className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-sm">
          <SearchIcon className="size-3.5 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Adversaire, joueur, champion…" className="w-48 bg-transparent outline-none" />
        </label>
        <span className="ml-auto text-xs text-ink-3">
          {rows.length} parties · <b className="text-ink">{wins}-{rows.length - wins}</b>
          {rows.length ? ` (${Math.round((100 * wins) / rows.length)} %)` : ""}
        </span>
      </div>

      <ul className="divide-y divide-border/60">
        {rows.slice(0, shown).map((m) => {
          const [us, them] = ours(m);
          const key = `${m.date}|${m.tournament}|${them.team}`;
          const expanded = open === key;
          return (
            <li key={key}>
              <button onClick={() => setOpen(expanded ? null : key)} className="grid w-full grid-cols-[5.5rem_2rem_minmax(0,1fr)_3.5rem] items-center gap-2 py-1.5 text-left text-sm hover:bg-surface-2/50 sm:grid-cols-[5.5rem_2rem_minmax(0,14rem)_minmax(0,1fr)_3.5rem]">
                <span className="tabular-nums text-xs text-ink-2">{fmtDate(m.date)}</span>
                <span
                  className="rounded px-1 text-center text-[11px] font-bold"
                  style={{ background: `color-mix(in srgb, ${us.win ? "var(--good)" : "var(--critical)"} 22%, transparent)`, color: us.win ? "var(--good-text)" : "var(--critical)" }}
                >
                  {us.win ? "V" : "D"}
                </span>
                <span className="min-w-0 truncate">
                  <span className="text-ink-3">vs </span>
                  <span className="font-medium">{them.team}</span>
                  <span className="block truncate text-[11px] text-ink-3">{m.tournament}</span>
                </span>
                <span className="hidden min-w-0 truncate text-[11px] text-ink-2 sm:block" title="Champions joués (Top → Support)">
                  {us.players.map((p) => p[2]).join(" · ")}
                </span>
                <span className="text-right tabular-nums text-xs text-ink-3">{m.duration ? `${Math.floor(m.duration)}:${String(Math.round((m.duration % 1) * 60)).padStart(2, "0")}` : ""}</span>
              </button>
              {expanded && <MatchDetail m={m} us={us} them={them} region={region} />}
            </li>
          );
        })}
      </ul>
      {rows.length > shown && (
        <Button variant="soft" onClick={() => setShown((n) => n + PAGE * 2)}>
          Voir {Math.min(PAGE * 2, rows.length - shown)} parties de plus
        </Button>
      )}
      {!rows.length && <p className="py-6 text-center text-sm text-ink-3">Aucune partie pour ces filtres.</p>}
    </div>
  );
}

function Formers({ formers, region }: { formers: FormerPlayer[]; region: Region }) {
  const [role, setRole] = useState("all");
  const rows = formers.filter((p) => role === "all" || p.role === role);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <NativeSelect value={role} onChange={(e) => setRole(e.target.value)} aria-label="Poste">
          <option value="all">Tous les postes</option>
          {ROLES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </NativeSelect>
        <span className="ml-auto text-xs text-ink-3">{rows.length} anciens joueurs depuis 2023</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase text-ink-3">
              <th className="py-1.5 pr-2 font-medium">Joueur</th>
              <th className="py-1.5 pr-2 font-medium">Poste</th>
              <th className="py-1.5 pr-2 font-medium">Période</th>
              <th className="py-1.5 pr-2 text-right font-medium">Parties</th>
              <th className="py-1.5 font-medium">Club actuel</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={`${p.id}-${p.role}`} className="border-b border-border/60 hover:bg-surface-2/50">
                <td className="py-1.5 pr-2">
                  <Link href={playerLink(region, p.id)} className="font-medium hover:underline">
                    {short(p.name)}
                  </Link>
                </td>
                <td className="py-1.5 pr-2 text-ink-2">{p.role}</td>
                <td className="py-1.5 pr-2 tabular-nums text-ink-2">{p.first === p.last ? p.first : `${p.first}–${p.last}`}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{p.games}</td>
                <td className="py-1.5 text-ink-2">
                  {p.now ? (
                    <Link href={teamLink(region, p.now)} className="hover:underline">
                      {p.now}
                    </Link>
                  ) : (
                    <span className="text-ink-3">–</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function TeamHistory({
  region,
  names,
  results,
  matches,
  formers,
  rosters,
}: {
  region: Region;
  names: string[];
  results: TeamResult[] | null;
  matches: TeamMatch[] | null;
  formers: FormerPlayer[];
  /** Effectifs saison par saison (rendus côté serveur) */
  rosters: React.ReactNode;
}) {
  const first = results?.length ? "results" : matches?.length ? "matches" : "rosters";
  return (
    <Tabs defaultValue={first}>
      <TabsList aria-label="Historique de l'équipe">
        <TabsTrigger value="results">Résultats{results ? ` (${results.length})` : ""}</TabsTrigger>
        <TabsTrigger value="matches">Matchs{matches ? ` (${matches.length})` : ""}</TabsTrigger>
        <TabsTrigger value="formers">Anciens joueurs ({formers.length})</TabsTrigger>
        <TabsTrigger value="rosters">Effectifs par saison</TabsTrigger>
      </TabsList>
      <TabsContent value="results" className="mt-3">
        {results ? (
          <Results results={results} region={region} />
        ) : (
          <NotExported />
        )}
      </TabsContent>
      <TabsContent value="matches" className="mt-3">
        {matches ? <Matches matches={matches} names={names} region={region} /> : <NotExported />}
      </TabsContent>
      <TabsContent value="formers" className="mt-3">
        <Formers formers={formers} region={region} />
      </TabsContent>
      <TabsContent value="rosters" className="mt-3">
        {rosters}
      </TabsContent>
    </Tabs>
  );
}

function NotExported() {
  return (
    <p className="rounded-lg border border-dashed border-border p-4 text-sm text-ink-3">
      Pas encore exporté pour cette région : lancer <code>python run_all.py</code> (ou <code>python team_history.py</code> avec
      SCOUT_REGION) sur le PC.
    </p>
  );
}
