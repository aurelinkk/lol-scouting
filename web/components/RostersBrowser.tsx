"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Avatar, PlayerName, TeamLogo } from "./Images";
import { TIER_COLOR } from "@/lib/tiers";
import { playerLink, publicData, REGION_INFO } from "@/lib/region";
import { useRegion } from "@/lib/useRegion";


interface RosterPlayer {
  id?: string;
  name: string;
  role: string;
  games: number;
  photo?: string;
}
interface RosterTeam {
  team: string;
  logo?: string;
  players: RosterPlayer[];
}
interface RosterEvent {
  season: number;
  league_code: string;
  tier: string;
  tournament: string;
  start: string;
  teams: RosterTeam[];
}

const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"];

function TeamCard({ team }: { team: RosterTeam }) {
  const region = useRegion();
  // Titulaire = le joueur avec le plus de parties à chaque poste ; les autres = remplaçants
  const starters = ROLES.map((role) => team.players.filter((p) => p.role === role).sort((a, b) => b.games - a.games)[0]);
  const subs = team.players.filter((p) => !starters.includes(p));
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <TeamLogo team={team.team} src={team.logo} size={24} />
        <span className="truncate text-sm font-semibold">{team.team}</span>
      </div>
      <ul className="divide-y divide-border">
        {ROLES.map((role, i) => {
          const p = starters[i];
          return (
            <li key={role} className="flex items-center gap-2 px-3 py-1.5">
              <span className="w-14 shrink-0 text-[11px] uppercase tracking-wide text-ink-3">{role}</span>
              {p ? (
                <>
                  <Avatar name={p.name} src={p.photo} size={22} />
                  {p.id ? (
                    <Link href={playerLink(region, p.id)} className="min-w-0 flex-1 truncate text-sm hover:underline">
                      <PlayerName name={p.name} />
                    </Link>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                  )}
                  <span className="tabular text-xs text-ink-3">{p.games} p.</span>
                </>
              ) : (
                <span className="text-sm text-ink-3">—</span>
              )}
            </li>
          );
        })}
      </ul>
      {subs.length > 0 && (
        <div className="border-t border-border px-3 py-1.5 text-xs text-ink-3">
          Remplaçants :{" "}
          {subs.map((p, i) => (
            <span key={p.name + p.role}>
              {i > 0 && ", "}
              {p.id ? (
                <Link href={playerLink(region, p.id)} className="hover:underline">
                  {p.name.replace(/\s*\(.*\)$/, "")}
                </Link>
              ) : (
                p.name
              )}{" "}
              ({p.role}, {p.games} p.)
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RostersBrowser() {
  const region = useRegion();
  const top = REGION_INFO[region].top;
  const [events, setEvents] = useState<RosterEvent[] | null>(null);
  const [error, setError] = useState(false);
  const [season, setSeason] = useState<number | null>(null);
  const [league, setLeague] = useState(top);
  const [tournament, setTournament] = useState("");

  useEffect(() => {
    fetch(publicData(region, "rosters.json"))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: RosterEvent[]) => {
        setEvents(data);
        setSeason(Math.max(...data.map((e) => e.season)));
      })
      .catch(() => setError(true));
  }, [region]);

  const seasons = useMemo(() => [...new Set((events ?? []).map((e) => e.season))].sort((a, b) => b - a), [events]);
  const leagues = useMemo(() => {
    const codes = [...new Set((events ?? []).filter((e) => e.season === season).map((e) => e.league_code))];
    return codes.sort((a, b) => (a === top ? -1 : b === top ? 1 : a.localeCompare(b)));
  }, [events, season]);
  const tournaments = useMemo(
    () => (events ?? []).filter((e) => e.season === season && e.league_code === league),
    [events, season, league],
  );

  // Garder une sélection valide quand on change de saison / ligue
  useEffect(() => {
    if (leagues.length && !leagues.includes(league)) setLeague(leagues[0]);
  }, [leagues, league]);
  useEffect(() => {
    if (tournaments.length && !tournaments.some((t) => t.tournament === tournament)) {
      // Par défaut : la saison régulière la plus récente (toutes les équipes)
      const regular = tournaments.filter((t) => !/Playoffs|Finals|Final Four/i.test(t.tournament));
      setTournament((regular.length ? regular : tournaments)[(regular.length ? regular : tournaments).length - 1].tournament);
    }
  }, [tournaments, tournament]);

  if (error) return <p className="text-sm text-ink-2">Pas encore de rosters : relance <code>python export_web.py</code>.</p>;
  if (!events || season === null) return <p className="text-sm text-ink-3">Chargement…</p>;

  const current = tournaments.find((t) => t.tournament === tournament);
  const control = "rounded-md border border-border bg-surface px-2 py-1.5 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3">
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Saison
          <select className={control} value={season} onChange={(e) => setSeason(Number(e.target.value))}>
            {seasons.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Ligue
          <select className={control} value={league} onChange={(e) => setLeague(e.target.value)}>
            {leagues.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="flex min-w-60 flex-col gap-1 text-xs text-ink-3">
          Tournoi
          <select className={control} value={tournament} onChange={(e) => setTournament(e.target.value)}>
            {tournaments.map((t) => (
              <option key={t.tournament}>{t.tournament}</option>
            ))}
          </select>
        </label>
      </div>

      {current && (
        <>
          <p className="flex items-center gap-2 text-xs text-ink-3">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: TIER_COLOR[current.tier] }} />
            {current.tournament} · {current.teams.length} équipes · titulaire = le joueur avec le plus de parties à
            chaque poste
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {current.teams.map((t) => (
              <TeamCard key={t.team} team={t} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
