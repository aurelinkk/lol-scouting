import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Avatar, TeamLogo } from "@/components/Images";
import RegionMissing from "@/components/RegionMissing";
import TeamMercato from "@/components/TeamMercato";
import TeamNeeds from "@/components/TeamNeeds";
import type { MercatoPlayer, MercatoTeam } from "@/components/MercatoBoard";
import { getMercato, getRankings, getRosters, hasRegion } from "@/lib/data";
import { fmtScore, topPercent } from "@/lib/format";
import { IMPORT_LIMIT } from "@/lib/needs";
import { isResident, originLabel, originOf } from "@/lib/origin";
import { link, playerLink, REGION_INFO, type Region, REGIONS, teamSlug, tierName } from "@/lib/region";
import type { RankingRow } from "@/lib/types";
import { convertScore, worldScore } from "@/lib/world";
import { needsData } from "@/views/Besoins";

const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"] as const;
const MIN_GAMES = 10;
const short = (n: string) => n.replace(/\s*\(.*\)$/, "");

/** Toutes les équipes connues de la région : mercato + effectifs des saisons passées */
const teamsCache = new Map<Region, Map<string, string>>();
function allTeams(region: Region): Map<string, string> {
  const cached = teamsCache.get(region);
  if (cached) return cached;
  const out = new Map<string, string>();
  teamsCache.set(region, out);
  for (const t of getMercato(region)?.teams ?? []) out.set(teamSlug(t.team), t.team);
  for (const b of getRosters(region)) for (const t of b.teams) if (!out.has(teamSlug(t.team))) out.set(teamSlug(t.team), t.team);
  return out;
}

/** L'équipe a-t-elle une page dans cette région ? */
export function hasTeam(region: Region, team: string): boolean {
  return hasRegion(region) && allTeams(region).has(teamSlug(team));
}

export function teamStaticParams(region: Region) {
  if (!hasRegion(region)) return [];
  return [...allTeams(region).keys()].map((slug) => ({ slug }));
}

export function teamMetadata(slug: string, region: Region) {
  if (!hasRegion(region)) return { title: "LoL Scouting" };
  const team = allTeams(region).get(slug);
  return { title: team ? `${team} · LoL Scouting` : "Équipe introuvable" };
}

function Section({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "good" | "bad" | "gold" }) {
  const color = tone === "good" ? "var(--good-text)" : tone === "bad" ? "var(--critical)" : tone === "gold" ? "var(--gold)" : undefined;
  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <div className="text-[11px] uppercase tracking-wide text-ink-3">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums" style={{ color }}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-ink-3">{hint}</div>}
    </div>
  );
}

/** Classements de la dernière saison de chaque région, par id et par nom */
function lastSeasonIndex() {
  const out = new Map<Region, { season: number; byId: Map<string, RankingRow>; byName: Map<string, RankingRow> }>();
  for (const r of REGIONS) {
    if (!hasRegion(r)) continue;
    const rows = getRankings(r);
    const season = Math.max(...rows.map((x) => x.season));
    const byId = new Map<string, RankingRow>();
    const byName = new Map<string, RankingRow>();
    for (const x of rows.filter((x) => x.season === season)) {
      const prev = byId.get(x.id);
      if (!prev || x.games > prev.games) byId.set(x.id, x);
      const key = short(x.name).toLowerCase();
      const p2 = byName.get(key);
      if (!p2 || x.games > p2.games) byName.set(key, x);
    }
    out.set(r, { season, byId, byName });
  }
  return out;
}

export default function TeamView({ slug, region }: { slug: string; region: Region }) {
  if (!hasRegion(region)) return <RegionMissing region={region} />;
  const R = REGION_INFO[region];
  const teamName = allTeams(region).get(slug);
  if (!teamName) {
    // Équipe d'une autre région (ex : club actuel d'un joueur parti à l'étranger)
    for (const r of REGIONS) if (r !== region && hasRegion(r) && allTeams(r).has(slug)) redirect(link(r, `/equipes/${slug}`));
    notFound();
  }

  const mercato = getMercato(region);
  const mt: MercatoTeam | undefined = mercato?.teams.find((t) => t.team === teamName);
  const names = new Set([teamName, ...(mt?.former_team ? [mt.former_team] : [])]);

  const rankings = getRankings(region);
  const lastSeason = Math.max(...rankings.map((r) => r.season));
  const index = lastSeasonIndex();

  // ---- Historique : effectifs par saison (tous tournois confondus) ----
  const rosters = getRosters(region);
  const history = [...new Set(rosters.map((b) => b.season))]
    .sort((a, b) => b - a)
    .map((season) => {
      const blocks = rosters.filter((b) => b.season === season && b.teams.some((t) => names.has(t.team)));
      if (!blocks.length) return null;
      const players = new Map<string, { id: string; name: string; role: string; games: number; photo: string | null }>();
      let logo: string | null = null;
      const asName = new Set<string>();
      for (const b of blocks)
        for (const t of b.teams.filter((t) => names.has(t.team))) {
          logo ??= t.logo;
          asName.add(t.team);
          for (const p of t.players) {
            const key = `${p.id}|${p.role}`;
            const cur = players.get(key);
            players.set(key, cur ? { ...cur, games: cur.games + p.games } : { ...p });
          }
        }
      const leagues = [...new Set(blocks.map((b) => b.league_code))];
      const tier = blocks.find((b) => b.tier === "LEC")?.tier ?? blocks[0].tier;
      const list = [...players.values()].sort((a, b) => ROLES.indexOf(a.role as never) - ROLES.indexOf(b.role as never) || b.games - a.games);
      const starters = ROLES.map((role) => list.filter((p) => p.role === role).sort((a, b) => b.games - a.games)[0]).filter(Boolean);
      const rows = starters
        .map((p) => rankings.find((r) => r.season === season && r.id === p.id && names.has(r.team)) ?? rankings.find((r) => r.season === season && r.id === p.id))
        .filter((r): r is RankingRow => !!r);
      const games = rows.reduce((n, r) => n + r.games, 0);
      const winrate = games ? rows.reduce((n, r) => n + (r.winrate ?? 0) * r.games, 0) / games : null;
      const avg = rows.length ? rows.reduce((n, r) => n + r.final, 0) / rows.length : null;
      return { season, leagues, tier, logo, list, starters, winrate, avg, asName: [...asName].filter((n) => n !== teamName) };
    })
    .filter((h): h is NonNullable<typeof h> => !!h);

  const current = history.find((h) => h.season === lastSeason);
  const logo = mt?.logo ?? history[0]?.logo ?? undefined;
  const league = mt?.league ?? current?.leagues[0] ?? history[0]?.leagues[0] ?? "";
  const tier = mt?.tier ?? current?.tier ?? history[0]?.tier ?? "";

  // ---- Moyenne des titulaires de la ligue, par poste (dernière saison) ----
  const leagueRows = rankings.filter((r) => r.season === lastSeason && r.league_code === league && r.games >= MIN_GAMES);
  const startersOf = (rows: RankingRow[]) => {
    const best = new Map<string, RankingRow>();
    for (const r of rows) {
      const k = `${r.team}|${r.role}`;
      const cur = best.get(k);
      if (!cur || r.games > cur.games) best.set(k, r);
    }
    return [...best.values()];
  };
  const leagueStarters = startersOf(leagueRows);
  const roleAvg = Object.fromEntries(
    ROLES.map((role) => {
      const xs = leagueStarters.filter((r) => r.role === role).map((r) => r.final);
      return [role, xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null];
    }),
  ) as Record<string, number | null>;

  // ---- Effectif de la saison à venir (mercato) ----
  const lookup = (p: MercatoPlayer | null | undefined) => {
    if (!p) return null;
    const pr = p.region ?? region;
    const idx = index.get(pr);
    if (!idx) return null;
    const row = (p.id && idx.byId.get(p.id)) || idx.byName.get(short(p.name).toLowerCase()) || null;
    if (!row) return { region: pr, row: null, score: null };
    return { region: pr, row, score: convertScore(row.final, pr, region, idx.season, row.tier) };
  };
  const slots = ROLES.map((role) => {
    const s = mt?.slots.find((x) => x.role === role);
    const after = s?.after ?? null;
    return { role, slot: s, after, info: lookup(after), before: s?.before ?? null, extra: s?.after_extra ?? [] };
  });
  const filled = slots.filter((s) => s.info?.score != null);
  const rosterAvg = filled.length ? filled.reduce((n, s) => n + s.info!.score!, 0) / filled.length : null;
  const avgOfAvg = (() => {
    const xs = ROLES.map((r) => roleAvg[r]).filter((x): x is number => x !== null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  })();
  const limit = IMPORT_LIMIT[region];
  const imports = slots.filter((s) => s.after && s.info?.row && !isResident(s.info.row.country, s.after.name, region));
  const open = slots.filter((s) => !s.after).length;
  const ages = filled.map((s) => s.info!.row!.age).filter((a): a is number => a !== undefined);

  // ---- Profil de jeu de la dernière saison (titulaires) ----
  const teamStarters = startersOf(leagueRows.filter((r) => names.has(r.team)));
  const teamSum = (k: "gd15" | "xpd15" | "csd15") =>
    teamStarters.length === 5 && teamStarters.every((r) => r[k] !== undefined) ? teamStarters.reduce((n, r) => n + (r[k] ?? 0), 0) : null;
  const leagueTeams = [...new Set(leagueStarters.map((r) => r.team))];
  const gdRank = (() => {
    const v = teamSum("gd15");
    if (v === null) return null;
    const all = leagueTeams
      .map((t) => {
        const st = leagueStarters.filter((r) => r.team === t);
        return st.length === 5 && st.every((r) => r.gd15 !== undefined) ? st.reduce((n, r) => n + (r.gd15 ?? 0), 0) : null;
      })
      .filter((x): x is number => x !== null)
      .sort((a, b) => b - a);
    return { v, rank: all.indexOf(v) + 1, of: all.length };
  })();

  const strengths = slots
    .filter((s) => s.info?.score != null && roleAvg[s.role] !== null)
    .map((s) => ({ role: s.role, diff: s.info!.score! - roleAvg[s.role]! }))
    .sort((a, b) => a.diff - b.diff);

  const needs = mt ? needsData(region) : null;

  return (
    <div className="space-y-4">
      <header className="card relative overflow-hidden p-5">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-accent/15 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <TeamLogo team={teamName} src={logo} size={64} />
          <div className="min-w-0">
            <div className="eyebrow">
              {league}
              {tierName(tier, region) !== league && ` · ${tierName(tier, region)}`} · {R.name}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{teamName}</h1>
            {mt?.former_team && <div className="text-xs text-ink-3">anciennement {mt.former_team}</div>}
          </div>
        </div>
        {mt && (
          <div className="relative mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi
              label={`Effectif ${mercato!.season}`}
              value={rosterAvg !== null ? fmtScore(rosterAvg) : "–"}
              hint={`score moyen ${lastSeason} des ${filled.length} titulaires connus`}
              tone="gold"
            />
            <Kpi
              label={`vs moyenne ${league}`}
              value={rosterAvg !== null && avgOfAvg !== null ? fmtScore(rosterAvg - avgOfAvg) : "–"}
              hint={`titulaire moyen ${league} ${lastSeason}`}
              tone={rosterAvg !== null && avgOfAvg !== null ? (rosterAvg >= avgOfAvg ? "good" : "bad") : undefined}
            />
            <Kpi
              label="Imports"
              value={limit === 0 ? "aucun" : `${imports.length}/${limit}`}
              hint={
                imports.length > limit
                  ? `${imports.map((s) => short(s.after!.name)).join(", ")} : trop d'imports, une rumeur ne se fera pas`
                  : imports.length
                    ? imports.map((s) => short(s.after!.name)).join(", ")
                    : limit === 0
                      ? `la ${R.top} n'en prend pas`
                      : "aucun import"
              }
              tone={imports.length > limit ? "bad" : undefined}
            />
            <Kpi label="Postes à pourvoir" value={open} hint={open ? slots.filter((s) => !s.after).map((s) => s.role).join(", ") : "effectif complet"} tone={open ? "bad" : "good"} />
            <Kpi
              label="Âge moyen"
              value={ages.length ? (ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1) : "–"}
              hint={`${filled.filter((s) => s.info!.row!.tier !== "LEC").length} rookie(s) de division inférieure`}
            />
          </div>
        )}
      </header>

      {mt && mercato && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <Section title={`Mercato ${mercato.season}`} subtitle="Mis à jour en ligne avec le reste du mercato (onglet Rosters).">
            <TeamMercato region={region} season={mercato.season} generated={mercato.generated} team={mt} />
          </Section>

          <Section
            title={`Force par poste · effectif ${mercato.season}`}
            subtitle={
              <>
                Score {lastSeason} de chaque titulaire, ramené à l&apos;échelle {R.top} pour les joueurs d&apos;une autre région (score
                mondial), comparé au titulaire moyen de {league} à ce poste.
              </>
            }
          >
            <ul className="space-y-2">
              {slots.map((s) => {
                const avg = roleAvg[s.role];
                const sc = s.info?.score ?? null;
                const diff = sc !== null && avg !== null ? sc - avg : null;
                const row = s.info?.row ?? null;
                const o = row ? originOf(row.country, row.name) : null;
                return (
                  <li key={s.role} className="grid grid-cols-[3.6rem_minmax(0,1fr)_7rem_3.5rem] items-center gap-2 text-sm">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{s.role}</span>
                    <div className="flex min-w-0 items-center gap-2">
                      {s.after ? (
                        <>
                          <Avatar name={s.after.name} src={row?.photo} size={26} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              {row ? (
                                <Link href={playerLink(s.info!.region, row.id)} className="truncate font-medium hover:underline">
                                  {short(s.after.name)}
                                </Link>
                              ) : (
                                <span className="truncate font-medium">{short(s.after.name)}</span>
                              )}
                              {o && row && !isResident(row.country, row.name, region) && (
                                <span
                                  className="rounded px-1 text-[10px] font-semibold"
                                  style={{ background: `var(--origin-${o.toLowerCase()})`, color: "var(--origin-ink)" }}
                                  title={`Import · ${row.country}`}
                                >
                                  {originLabel(o, row.country)}
                                </span>
                              )}
                              {s.slot?.right !== "in" && s.slot?.status !== "inchangé" && (
                                <span className="text-[10px] text-ink-3" title={s.slot?.status}>
                                  rumeur
                                </span>
                              )}
                            </div>
                            <div className="truncate text-[11px] text-ink-3">
                              {row
                                ? `${row.team} · ${row.league_code}${row.age !== undefined ? ` · ${row.age} ans` : ""} · ${topPercent(row.role_percentile)}`
                                : "pas classé"}
                              {s.extra.length > 0 && ` · + ${s.extra.map((p) => short(p.name)).join(", ")}`}
                            </div>
                          </div>
                        </>
                      ) : (
                        <span className="text-xs font-medium" style={{ color: "var(--critical)" }}>
                          à pourvoir{s.before ? ` (était ${short(s.before.name)})` : ""}
                        </span>
                      )}
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-2" title={avg !== null ? `Moyenne ${league} : ${fmtScore(avg)}` : undefined}>
                      {diff !== null && (
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, Math.max(4, 50 + diff * 30))}%`,
                            background: diff >= 0 ? "var(--good)" : "var(--critical)",
                          }}
                        />
                      )}
                    </div>
                    <span className="text-right tabular-nums">
                      {sc !== null ? (
                        <span title={avg !== null ? `${fmtScore(sc)} (moyenne ${league} ${fmtScore(avg)})` : undefined}>
                          <b>{fmtScore(sc)}</b>
                          {diff !== null && (
                            <span className="block text-[10px]" style={{ color: diff >= 0 ? "var(--good-text)" : "var(--critical)" }}>
                              {fmtScore(diff)}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-ink-3">–</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            {strengths.length >= 2 && (
              <p className="mt-3 text-xs text-ink-2">
                Point fort : <b>{strengths.at(-1)!.role}</b> ({fmtScore(strengths.at(-1)!.diff)}) · point faible :{" "}
                <b>{strengths[0].role}</b> ({fmtScore(strengths[0].diff)}) par rapport au titulaire moyen de {league}.
              </p>
            )}
            {rosterAvg !== null && region !== "eu" && (
              <p className="mt-1 text-xs text-ink-3">
                Score mondial moyen de l&apos;effectif (échelle LEC) :{" "}
                {fmtScore(
                  filled.reduce((n, s) => n + (worldScore(s.info!.row!.final, s.info!.region, index.get(s.info!.region)!.season, s.info!.row!.tier) ?? 0), 0) /
                    filled.length,
                )}
              </p>
            )}
          </Section>
        </div>
      )}

      {gdRank && current && (
        <Section title={`Profil de jeu ${lastSeason}`} subtitle="Somme des cinq titulaires (le plus de parties à chaque poste) : un écart d'équipe à 15 minutes.">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi
              label="Gold diff @15"
              value={`${gdRank.v >= 0 ? "+" : "−"}${Math.abs(Math.round(gdRank.v))}`}
              hint={`${gdRank.rank}e sur ${gdRank.of} en ${league}`}
              tone={gdRank.v >= 0 ? "good" : "bad"}
            />
            <Kpi label="XP diff @15" value={teamSum("xpd15") !== null ? `${teamSum("xpd15")! >= 0 ? "+" : "−"}${Math.abs(Math.round(teamSum("xpd15")!))}` : "–"} />
            <Kpi label="CS diff @15" value={teamSum("csd15") !== null ? `${teamSum("csd15")! >= 0 ? "+" : "−"}${Math.abs(teamSum("csd15")!).toFixed(1)}` : "–"} />
            <Kpi
              label="Win rate"
              value={current.winrate !== null ? `${Math.round(100 * current.winrate)} %` : "–"}
              hint="moyenne des titulaires"
            />
          </div>
        </Section>
      )}

      {needs && mt && (
        <Section
          title={`Besoins ${needs.season}`}
          subtitle="Postes à pourvoir et meilleurs joueurs disponibles (même logique que l'onglet Besoins, imports compris)."
        >
          <TeamNeeds
            region={region}
            season={needs.season}
            generated={needs.generated}
            teams={needs.teams}
            pool={needs.pool}
            countries={needs.countries}
            foreign={needs.foreign}
            only={[teamName]}
          />
        </Section>
      )}

      <Section title="Historique" subtitle="Effectifs saison par saison d'après les parties jouées (titulaire = le plus de parties au poste).">
        <div className="space-y-3">
          {history.map((h) => (
            <div key={h.season} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-base font-semibold">{h.season}</span>
                <span className="text-sm text-ink-2">
                  {h.leagues.join(", ")}
                  {!h.leagues.includes(tierName(h.tier, region)) && ` · ${tierName(h.tier, region)}`}
                </span>
                {h.asName.length > 0 && <span className="text-xs text-ink-3">sous le nom {h.asName.join(", ")}</span>}
                <span className="ml-auto flex gap-3 text-xs text-ink-3">
                  {h.winrate !== null && <span>win rate ≈ {Math.round(100 * h.winrate)} %</span>}
                  {h.avg !== null && <span>score moyen des titulaires {fmtScore(h.avg)}</span>}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {h.list.map((p) => {
                  const starter = h.starters.includes(p);
                  return (
                    <Link
                      key={`${p.id}-${p.role}`}
                      href={playerLink(region, p.id)}
                      className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors hover:border-ink-3 ${
                        starter ? "border-border bg-surface-2" : "border-dashed border-border text-ink-3"
                      }`}
                      title={`${p.role} · ${p.games} parties${starter ? "" : " (remplaçant)"}`}
                    >
                      <span className="text-[10px] font-semibold text-ink-3">{p.role.slice(0, 3).toUpperCase()}</span>
                      {short(p.name)}
                      <span className="text-[10px] text-ink-3">{p.games}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          {!history.length && <p className="text-xs text-ink-3">Pas de partie trouvée pour cette équipe.</p>}
        </div>
      </Section>
    </div>
  );
}
