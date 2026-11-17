"use client";

import Link from "next/link";
import { playerLink, REGION_INFO, type Region } from "@/lib/region";
import { useRegion } from "@/lib/useRegion";

import { useMemo, useState } from "react";
import { TeamLogo } from "./Images";

/** region : fiche dans l'autre région (ex : Naak Nako, joueur d'ERL, dans le mercato NA) */
export interface MercatoPlayer {
  name: string;
  id?: string;
  region?: Region;
}

export type Change = "stay" | "leave" | "new";

export interface MercatoCoach extends MercatoPlayer {
  role: string;
  change: Change;
  rumor: boolean;
  status?: string;
  source?: string | null;
  url?: string | null;
}

export interface MercatoSlot {
  role: string;
  before: MercatoPlayer | null;
  after: MercatoPlayer | null;
  /** Article / post qui annonce le mouvement (Sheep Esports, X...) */
  url?: string | null;
  status: string;
  source?: string;
  /** Piste non tranchée (plusieurs destinations le même jour) */
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
  /** Staff : restent (stay), partent (leave), arrivent (new) */
  coaches?: MercatoCoach[];
  /** Équipe remplacée / renommée (ex : OpTic Gaming à la place de Dignitas) */
  former_team?: string | null;
  team_source?: string | null;
}

function short(name: string) {
  return name.replace(/\s*\(.*\)$/, "");
}

// Pastilles de couleur : vert = reste, rouge = part, bleu = arrive
const CHANGE_COLOR: Record<Change, string> = {
  stay: "var(--good)",
  leave: "var(--critical)",
  new: "var(--accent)",
};

function Chip({ change, children, dashed }: { change: Change; children: React.ReactNode; dashed?: boolean }) {
  const c = CHANGE_COLOR[change];
  return (
    <span
      className="inline-flex max-w-full min-w-0 items-center rounded-md px-1.5 py-px"
      style={{
        background: `color-mix(in srgb, ${c} 14%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} ${dashed ? 0 : 28}%, transparent)`,
        outline: dashed ? `1px dashed color-mix(in srgb, ${c} 45%, transparent)` : undefined,
        outlineOffset: dashed ? "-1px" : undefined,
      }}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

function PlayerLink({ p, className }: { p: MercatoSlot["after"]; className?: string }) {
  const region = useRegion();
  if (!p) return <span className="text-ink-3">—</span>;
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

function Badge({ status, url, source }: { status: string; url?: string | null; source?: string }) {
  if (!status || status === "inchangé") return null;
  const confirmed = status.includes("confirmé") || status === "manuel" || status.startsWith("fin de contrat");
  // Pastille pleine = officiel, anneau = rumeur (forme + couleur, pas la couleur seule)
  const dot = (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={
        confirmed
          ? { background: "var(--good)" }
          : { border: "1.5px solid var(--text-3)", background: "transparent" }
      }
      aria-label={status}
    />
  );
  // Avec un lien : la pastille + ↗ ouvrent l'article (Sheep Esports, X...)
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex shrink-0 items-center gap-0.5 text-[10px] text-ink-3 hover:text-accent"
      title={`${status}${source ? ` · ${source}` : ""} — ouvrir la source`}
    >
      {dot}↗
    </a>
  ) : (
    <span className="flex shrink-0" title={status}>
      {dot}
    </span>
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
  }, [teams]);
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((t) => (
          <div key={t.team} className="overflow-hidden rounded-lg border border-border bg-surface">
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
            <ul className="divide-y divide-border">
              {t.slots.map((s) => {
                const unchanged = !!s.before && s.before.name === s.after?.name;
                return (
                  <li
                    key={s.role}
                    className="grid grid-cols-[3.75rem_minmax(0,1fr)_0.75rem_minmax(0,1fr)] items-center gap-2 px-3 py-1.5 text-sm"
                    title={s.source ? `${s.status} · source : ${s.source}` : s.status}
                  >
                    <span className="text-[11px] uppercase tracking-wide text-ink-3">{s.role}</span>
                    <span className="flex min-w-0">
                      {s.before ? (
                        <Chip change={unchanged ? "stay" : "leave"}>
                          <PlayerLink p={s.before} />
                        </Chip>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </span>
                    <span className="text-center text-ink-3">→</span>
                    <span className="flex min-w-0 items-center justify-end gap-1 text-right">
                      {s.after ? (
                        <Chip change={unchanged ? "stay" : "new"}>
                          <PlayerLink p={s.after} className={unchanged ? "" : "font-semibold"} />
                        </Chip>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                      <Badge status={s.status} url={s.url} source={s.source} />
                    </span>
                    {s.to && (
                      <span className="col-span-4 -mt-1 truncate text-right text-[11px] text-ink-3">
                        {s.before ? short(s.before.name) : ""} part chez {s.to.team}
                        {s.to.league && s.to.region && s.to.region !== region ? ` (${s.to.league})` : ""}
                      </span>
                    )}
                    {s.options && (
                      <span className="col-span-4 -mt-1 truncate text-right text-[11px] italic text-ink-3" title={s.options}>
                        {s.options.split(" · ")[0]}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {t.coaches && t.coaches.length > 0 && (
              <div className="border-t border-border bg-surface-2/40 px-3 py-2">
                <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-3">Coachs</div>
                <div className="flex flex-wrap gap-1 text-xs">
                  {t.coaches.map((c) => (
                    <span
                      key={c.name}
                      className="inline-flex items-center gap-1"
                      title={`${c.role} · ${c.status ?? ""}${c.source ? ` · ${c.source}` : ""}`}
                    >
                      <Chip change={c.change} dashed={c.rumor}>
                        <PlayerLink p={c} className={c.change === "new" ? "font-semibold" : ""} />
                        {c.role !== "Coach" && (
                          <span className="ml-1 text-[10px] text-ink-3">
                            {c.role.replace("Head Coach", "HC").replace(" Coach", "")}
                          </span>
                        )}
                      </Chip>
                      {c.url && (
                        <a href={c.url} target="_blank" rel="noreferrer" className="text-[10px] text-ink-3 hover:text-accent">
                          ↗
                        </a>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {!shown.length && <p className="text-sm text-ink-3">Aucune équipe.</p>}
      {undecided.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-3 text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Pistes non tranchées</div>
          <ul className="space-y-0.5">
            {undecided.map((u) => (
              <li key={u.player}>
                {u.id ? (
                  <Link href={playerLink(region, u.id!)} className="font-medium hover:underline">
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
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
        <span className="flex items-center gap-1.5">
          <Chip change="stay">reste</Chip>
          <Chip change="leave">part</Chip>
          <Chip change="new">arrive</Chip>
          <Chip change="new" dashed>
            coach (rumeur)
          </Chip>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--good)" }} /> officiel
          (Leaguepedia, fins de contrat GCD)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ border: "1.5px solid var(--text-3)" }} /> rumeur
          (Sheep Esports, X…)
        </span>
        <span>
          ↗ = ouvrir l&apos;article ou le post · Saison {season} · corrections possibles dans{" "}
          <code>rosters_{season}.csv</code>
        </span>
      </p>
    </div>
  );
}
