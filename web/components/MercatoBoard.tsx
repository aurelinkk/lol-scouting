"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { playerLink, REGION_INFO, type Region } from "@/lib/region";
import { useRegion } from "@/lib/useRegion";
import { TeamLogo } from "./Images";

/** region : fiche dans l'autre région (ex : Naak Nako, joueur d'ERL, dans le mercato NA) */
export interface MercatoPlayer {
  name: string;
  id?: string;
  region?: Region;
}

/** Couleur d'une case (légende façon tableur de mercato) */
export type CellState = "team" | "rumor_in" | "rumor_out" | "out" | "in" | "fa" | "c2027" | "c2028" | "retired";
export type Change = "stay" | "leave" | "new";

export interface MercatoCoach extends MercatoPlayer {
  role: string;
  change: Change;
  state?: CellState;
  rumor: boolean;
  status?: string;
  source?: string | null;
  url?: string | null;
}

export interface MercatoSlot {
  role: string;
  before: MercatoPlayer | null;
  after: MercatoPlayer | null;
  left?: CellState | null;
  right?: CellState | null;
  /** Article / post qui annonce le mouvement (Sheep Esports, X...) */
  url?: string | null;
  status: string;
  source?: string;
  /** Piste non tranchée (plusieurs destinations, ou plusieurs joueurs pour le poste) */
  options?: string;
  /** Où part le joueur de départ (ex : Yukino -> FlyQuest, LCS) */
  to?: { team: string; logo?: string; league?: string; tier?: string; region?: string } | null;
}
export interface MercatoTeam {
  league: string;
  tier: string;
  team: string;
  logo?: string;
  changed: boolean;
  slots: MercatoSlot[];
  coaches?: MercatoCoach[];
  /** Équipe remplacée / renommée (ex : OpTic Gaming à la place de Dignitas) */
  former_team?: string | null;
  team_source?: string | null;
}

const LEGEND: { state: CellState; label: string }[] = [
  { state: "team", label: "Dans l'équipe en 2026" },
  { state: "rumor_in", label: "Rumeur : rejoint / reste" },
  { state: "rumor_out", label: "Rumeur : part" },
  { state: "out", label: "Officiellement parti" },
  { state: "in", label: "Officiellement arrivé / prolongé" },
  { state: "fa", label: "Fin de contrat (agent libre)" },
  { state: "c2027", label: "Sous contrat jusqu'à fin {next}" },
  { state: "c2028", label: "Sous contrat au-delà" },
  { state: "retired", label: "Prend sa retraite" },
];

const bg = (state?: CellState | null) => (state ? `var(--m-${state})` : "transparent");

function short(name: string) {
  return name.replace(/\s*\(.*\)$/, "");
}

function PlayerLink({ p, className }: { p: MercatoPlayer; className?: string }) {
  const region = useRegion();
  return p.id ? (
    <Link
      href={playerLink(p.region ?? region, p.id)}
      className={`hover:underline ${className ?? ""}`}
      title={p.region && p.region !== region ? `${p.name} · fiche ${REGION_INFO[p.region].name}` : p.name}
    >
      {short(p.name)}
    </Link>
  ) : (
    <span className={className} title={p.name}>
      {short(p.name)}
    </span>
  );
}

function SourceLink({ url, title }: { url?: string | null; title: string }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="ml-auto shrink-0 pl-1 text-[11px] leading-none opacity-60 hover:opacity-100"
      title={`${title} — ouvrir la source`}
      aria-label="Source"
    >
      ↗
    </a>
  );
}

/** Une case colorée (un joueur ou un coach), sur toute la largeur de sa colonne */
function Cell({
  p,
  state,
  url,
  title,
  bold,
  note,
}: {
  p: MercatoPlayer | null;
  state?: CellState | null;
  url?: string | null;
  title: string;
  bold?: boolean;
  note?: string;
}) {
  if (!p) return <div className="rounded-[5px] border border-dashed border-border px-2 py-1 text-ink-3">—</div>;
  return (
    <div
      className="flex min-w-0 items-center rounded-[5px] px-2 py-1"
      style={{ background: bg(state) }}
      title={title}
    >
      <span className="min-w-0 truncate">
        <PlayerLink p={p} className={bold ? "font-semibold" : ""} />
        {note && <span className="ml-1 text-[10px] opacity-70">{note}</span>}
      </span>
      <SourceLink url={url} title={title} />
    </div>
  );
}

function TeamCard({ t, season }: { t: MercatoTeam; season: number }) {
  const region = useRegion();
  const coachesBefore = (t.coaches ?? []).filter((c) => c.change !== "new");
  const coachesAfter = (t.coaches ?? []).filter((c) => c.change !== "leave");
  const coachNote = (role: string) =>
    role === "Coach" ? undefined : role.replace("Head Coach", "HC").replace(" Coach", "");
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <TeamLogo team={t.team} src={t.logo} size={22} />
        <span className="truncate text-sm font-semibold">{t.team}</span>
        {t.former_team &&
          (t.team_source?.startsWith("http") ? (
            <a
              href={t.team_source}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-[11px] text-ink-3 hover:text-accent"
              title="Source"
            >
              ex-{t.former_team} ↗
            </a>
          ) : (
            <span className="shrink-0 text-[11px] text-ink-3">ex-{t.former_team}</span>
          ))}
        <span className="ml-auto text-[10px] text-ink-3">{t.league}</span>
      </div>

      <div className="grid grid-cols-[3.4rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-1 gap-y-1 px-2 py-2 text-[13px]">
        <span />
        <span className="text-center text-[10px] font-semibold uppercase tracking-wide text-ink-3">{season - 1}</span>
        <span className="text-center text-[10px] font-semibold uppercase tracking-wide text-ink-3">{season}</span>

        {t.slots.map((s) => {
          const title = s.source ? `${s.status} · ${s.source}` : s.status;
          const unchanged = !!s.before && s.before.name === s.after?.name;
          const note = s.to
            ? `${s.before ? short(s.before.name) : ""} → ${s.to.team}${
                s.to.league && s.to.region && s.to.region !== region ? ` (${s.to.league})` : ""
              }`
            : null;
          const piste = s.options ? s.options.split(" · ")[0] : null;
          return (
            <div key={s.role} className="contents">
              <span className="self-center text-[10px] font-medium uppercase tracking-wide text-ink-3">{s.role}</span>
              <Cell p={s.before} state={s.left} title={title} />
              <Cell p={s.after} state={s.right} url={s.url} title={title} bold={!unchanged} />
              {(note || piste) && (
                <span className="col-span-2 col-start-2 -mt-0.5 truncate text-right text-[10.5px] text-ink-3" title={piste ?? note ?? ""}>
                  {note}
                  {note && piste ? " · " : ""}
                  {piste && <i>{piste}</i>}
                </span>
              )}
            </div>
          );
        })}

        {(coachesBefore.length > 0 || coachesAfter.length > 0) && (
          <>
            <span className="mt-1 self-start pt-1 text-[10px] font-medium uppercase tracking-wide text-ink-3">Coachs</span>
            <div className="mt-1 space-y-1">
              {coachesBefore.map((c) => (
                <Cell
                  key={c.name}
                  p={c}
                  state={c.change === "stay" ? "team" : c.state}
                  title={`${c.role} · ${c.status ?? ""}${c.source ? ` · ${c.source}` : ""}`}
                  note={coachNote(c.role)}
                />
              ))}
            </div>
            <div className="mt-1 space-y-1">
              {coachesAfter.map((c) => (
                <Cell
                  key={c.name}
                  p={c}
                  state={c.state}
                  url={c.url}
                  title={`${c.role} · ${c.status ?? ""}${c.source ? ` · ${c.source}` : ""}`}
                  bold={c.change === "new"}
                  note={coachNote(c.role)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function MercatoBoard({
  season,
  teams,
  undecided = [],
}: {
  season: number;
  teams: MercatoTeam[];
  undecided?: { player: string; id?: string; options: string[] }[];
}) {
  const region = useRegion();
  const top = REGION_INFO[region].top;
  const leagues = useMemo(() => {
    const codes = [...new Set(teams.map((t) => t.league))];
    return codes.sort((a, b) => (a === top ? -1 : b === top ? 1 : a.localeCompare(b)));
  }, [teams, top]);
  const [league, setLeague] = useState(top);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const shown = teams.filter((t) => t.league === league && (!onlyChanged || t.changed));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {leagues.map((l) => (
          <button
            key={l}
            onClick={() => setLeague(l)}
            className={`rounded-md border px-2.5 py-1 text-xs ${
              league === l ? "border-accent bg-accent-soft font-medium text-ink" : "border-border text-ink-2 hover:bg-surface-2"
            }`}
          >
            {l}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-ink-2">
          <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />
          Seulement les équipes qui bougent
        </label>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((t) => (
            <TeamCard key={t.team} t={t} season={season} />
          ))}
          {!shown.length && <p className="text-sm text-ink-3">Aucune équipe.</p>}
        </div>

        <aside className="shrink-0 space-y-3 lg:sticky lg:top-20 lg:w-60">
          <div className="rounded-lg border border-border bg-surface p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Légende</div>
            <ul className="space-y-1 text-xs">
              {LEGEND.map((l) => (
                <li key={l.state} className="rounded-[5px] px-2 py-1" style={{ background: bg(l.state) }}>
                  {l.label.replace("{next}", String(season))}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] leading-snug text-ink-3">
              ↗ ouvre l&apos;article ou le post (Sheep Esports, X, annonce officielle). Contrats : base GCD de Riot via
              Leaguepedia. Corrections : <code>rosters_{season}.csv</code>.
            </p>
          </div>
          {undecided.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-3 text-sm">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Pistes non tranchées</div>
              <ul className="space-y-0.5 text-xs">
                {undecided.map((u) => (
                  <li key={u.player}>
                    {u.id ? (
                      <Link href={playerLink(region, u.id)} className="font-medium hover:underline">
                        {short(u.player)}
                      </Link>
                    ) : (
                      <span className="font-medium">{short(u.player)}</span>
                    )}{" "}
                    <span className="text-ink-2">→ {u.options.join(" ou ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
