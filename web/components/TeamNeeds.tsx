"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Avatar, TeamLogo } from "./Images";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { MercatoSlot, MercatoTeam } from "./MercatoBoard";
import { fmtScore } from "@/lib/format";
import { contractsFromMercato, signedFromMercato } from "@/lib/mercato/signed";
import { isStale } from "@/lib/mercato/stale";
import { HOME_ORIGIN, type Origin, originOf } from "@/lib/origin";
import { playerLink, type Region, REGION_INFO } from "@/lib/region";

export interface Candidate {
  id: string;
  name: string;
  role: string;
  team: string;
  league: string;
  tier: string;
  final: number;
  age?: number;
  country?: string;
  photo?: string;
}

const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"];
/** Âge maximum des joueurs proposés (âge inconnu : gardé) */
export const MAX_AGE = 26.2;
const SHORT_LIST = 5;
const LONG_LIST = 10;
/** Imports autorisés par équipe : 2 en LEC / LCS, aucun en LCK */
const IMPORT_LIMIT: Record<Region, number> = { eu: 2, na: 2, kr: 0 };

type Need = "open" | "rumor" | "contract" | "official";
const NEED: Record<Need, { label: string; color: string }> = {
  open: { label: "à pourvoir", color: "var(--critical)" },
  rumor: { label: "rumeur", color: "var(--gold)" },
  contract: { label: "sous contrat, sans rumeur de départ", color: "var(--accent)" },
  official: { label: "officiel", color: "var(--good)" },
};

function needOf(s: MercatoSlot): Need {
  if (!s.after) return "open";
  if (s.right === "in" || s.status.includes("confirmé") || s.status === "manuel") return "official";
  if (s.status.includes("rumeur")) return "rumor";
  return "contract";
}

const short = (n: string) => n.replace(/\s*\(.*\)$/, "");

export default function TeamNeeds({
  region,
  season,
  generated,
  teams: baseTeams,
  pool,
  countries,
}: {
  region: Region;
  season: number;
  generated?: string;
  teams: MercatoTeam[];
  pool: Record<string, Candidate[]>;
  countries: Record<string, string>;
}) {
  const R = REGION_INFO[region];
  const home = HOME_ORIGIN[region];
  const limit = IMPORT_LIMIT[region];

  // Mercato rafraîchi en ligne (même logique que Rosters / Données)
  const [liveTeams, setLiveTeams] = useState<MercatoTeam[] | null>(null);
  useEffect(() => {
    type Live = { mercato: { generated?: string; teams: MercatoTeam[] }; updatedAt: number };
    const use = (d: { live?: Live } | null) => {
      if (d?.live && d.live.mercato.generated === generated) setLiveTeams(d.live.mercato.teams);
    };
    fetch(`/api/mercato?region=${region}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        use(d);
        if (generated && isStale(d?.live, generated))
          return fetch(`/api/mercato?region=${region}`, { method: "POST" })
            .then((r) => (r.ok ? r.json() : null))
            .then(use);
      })
      .catch(() => {});
  }, [region, generated]);

  const all = liveTeams ?? baseTeams;
  const signed = useMemo(() => signedFromMercato(all, region), [all, region]);
  const contracts = useMemo(() => contractsFromMercato(all), [all]);
  const topTeams = all.filter((t) => t.tier === "LEC" && t.league === R.top);

  const originOfName = (name: string): Origin | null => {
    const fromPool = Object.values(pool).flat().find((c) => c.name === name);
    return originOf(fromPool?.country ?? countries[name] ?? countries[short(name)], name);
  };

  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [more, setMore] = useState<Record<string, boolean>>({});

  const openCount = topTeams.reduce((n, t) => n + t.slots.filter((s) => ROLES.includes(s.role) && !s.after).length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-2">
        <span>
          <b className="text-ink">{openCount}</b> poste{openCount > 1 ? "s" : ""} à pourvoir en {R.top}
          {liveTeams && " · mercato à jour en ligne"}
        </span>
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox checked={showAll} onCheckedChange={(v) => setShowAll(v === true)} />
          Proposer aussi des joueurs pour les postes pas encore officialisés
        </label>
        <span className="flex items-center gap-3">
          {(Object.keys(NEED) as Need[]).map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: NEED[k].color }} />
              {NEED[k].label}
            </span>
          ))}
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {topTeams.map((t) => {
          const slots = ROLES.map((role) => t.slots.find((s) => s.role === role)).filter(Boolean) as MercatoSlot[];
          const roster = slots.flatMap((s) => [s.after, ...(s.after_extra ?? [])]).filter(Boolean).map((p) => p!.name);
          const imports = roster.filter((n) => {
            const o = originOfName(n);
            return o && o !== home;
          });
          return (
            <section key={t.team} className="rounded-2xl border border-border bg-surface p-3">
              <header className="mb-2 flex items-center gap-2">
                <TeamLogo team={t.team} src={t.logo} size={20} />
                <h2 className="font-semibold">{t.team}</h2>
                <span
                  className="ml-auto rounded border border-border px-1.5 py-0.5 text-[11px] text-ink-3"
                  title={imports.length ? `Imports : ${imports.map(short).join(", ")}` : "Aucun import"}
                >
                  {limit === 0 ? "aucun import autorisé" : `imports ${imports.length}/${limit}`}
                </span>
              </header>
              <ul className="divide-y divide-border">
                {slots.map((s) => {
                  const need = needOf(s);
                  const key = `${t.team}|${s.role}`;
                  const expanded = open[key] ?? (need === "open" || (showAll && need !== "official"));
                  // places d'import restantes si ce poste change de titulaire
                  const others = imports.filter((n) => !s.after || n !== s.after.name).length;
                  const importOk = limit > 0 && others < limit;
                  const taken = new Set(roster.map(short));
                  // Disponibles : pas de club pour la saison suivante dans le mercato (officiel,
                  // rumeur, ou contrat sans rumeur de départ ni remplaçant). Un joueur sous
                  // contrat mais remplacé (ex : Poby chez NAVI) reste proposé.
                  const available = (pool[s.role] ?? [])
                    .filter((c) => !taken.has(short(c.name)) && !signed[c.id])
                    .filter((c) => c.age === undefined || c.age <= MAX_AGE)
                    .filter((c) => {
                      const o = originOf(c.country, c.name);
                      return !o || o === home || importOk;
                    });
                  const n = more[key] ? LONG_LIST : SHORT_LIST;
                  const top = available.slice(0, n);
                  // joueurs de 1re division sans club : toujours proposés, même plus bas
                  const freeTop = available.filter((c) => c.tier === "LEC" && !top.includes(c)).slice(0, 3);
                  const candidates = [...top, ...freeTop];
                  return (
                    <li key={s.role} className="py-1.5">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="w-14 shrink-0 text-xs uppercase text-ink-3">{s.role}</span>
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: NEED[need].color }} title={NEED[need].label} />
                        <span className={s.after ? "" : "text-ink-3"}>
                          {s.after ? [s.after, ...(s.after_extra ?? [])].map((p) => short(p.name)).join(" / ") : "?"}
                        </span>
                        <span className="text-xs text-ink-3">
                          {need === "contract" && s.after_end ? `contrat → ${s.after_end.slice(0, 4)}` : need !== "official" ? NEED[need].label : ""}
                        </span>
                        {s.options && <span className="truncate text-xs text-ink-3" title={s.options}>· {s.options}</span>}
                        {need !== "official" && (
                          <Button
                            variant="link"
                            size="sm"
                            onClick={() => setOpen((o) => ({ ...o, [key]: !expanded }))}
                            className="ml-auto"
                            aria-expanded={expanded}
                          >
                            {expanded ? "masquer" : "options"}
                            <ChevronDownIcon className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
                          </Button>
                        )}
                      </div>
                      {expanded && (
                        <ol className="mt-1 space-y-0.5 pl-16">
                          {candidates.map((c) => {
                            const o = originOf(c.country, c.name);
                            const ct = contracts[c.id];
                            const year = ct ? Number(ct.end.slice(0, 4)) : null;
                            return (
                              <li key={c.id} className="flex items-center gap-2 text-xs">
                                <Avatar name={c.name} src={c.photo} size={18} />
                                <Link href={playerLink(region, c.id)} className="font-medium text-ink hover:underline">
                                  {short(c.name)}
                                </Link>
                                {o && o !== home && (
                                  <span
                                    className="rounded px-1 text-[10px] font-semibold"
                                    style={{ background: `var(--origin-${o.toLowerCase()})`, color: "var(--origin-ink)" }}
                                    title={`Import · ${c.country}`}
                                  >
                                    {o}
                                  </span>
                                )}
                                {c.tier === "LEC" && (
                                  <span className="shrink-0 rounded border border-border px-1 text-[10px] text-ink-2" title={`Joueur de ${R.top} sans club pour ${season}`}>
                                    {R.top} sans club
                                  </span>
                                )}
                                <span className="truncate text-ink-3">
                                  {c.team} · {c.league}
                                  {c.age !== undefined && ` · ${c.age} ans`}
                                </span>
                                {ct && year !== null && (
                                  <span
                                    className="shrink-0"
                                    style={year <= season - 1 ? { color: "var(--good)" } : { color: "var(--gold)" }}
                                    title={`Contrat avec ${ct.team} jusqu'au ${ct.end.split("-").reverse().join("/")}`}
                                  >
                                    {year <= season - 1 ? "fin de contrat" : `sous contrat → ${year}`}
                                  </span>
                                )}
                                <span className="ml-auto shrink-0 font-semibold tabular-nums">{fmtScore(c.final)}</span>
                              </li>
                            );
                          })}
                          {!candidates.length && <li className="text-xs text-ink-3">Aucun joueur disponible trouvé.</li>}
                          {available.length > SHORT_LIST && (
                            <li>
                              <Button variant="link" size="sm" className="text-[11px]" onClick={() => setMore((m) => ({ ...m, [key]: !m[key] }))}>
                                {more[key] ? "voir moins" : `voir le top ${LONG_LIST}`}
                              </Button>
                            </li>
                          )}
                          {limit > 0 && !importOk && (
                            <li className="text-[11px] text-ink-3">Places d&apos;import prises : imports non proposés.</li>
                          )}
                        </ol>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
