import Link from "next/link";
import { HBarChart } from "@/components/Charts";
import { Avatar, PlayerName, TeamLogo } from "@/components/Images";
import RegionMissing from "@/components/RegionMissing";
import { REGIONS } from "@/lib/region";
import { link, playerLink, REGION_INFO, type Region, tierName } from "@/lib/region";
import { getLeagues, getMeta, getPromotions, getRankings, hasRegion } from "@/lib/data";
import { fmtScore, topPercent } from "@/lib/format";
import { ROLES, type RankingRow } from "@/lib/types";
import { ArrowRightIcon, type LucideIcon, SwordsIcon, TrendingUpIcon, TrophyIcon, UsersIcon } from "lucide-react";

const MIN_GAMES = 15;

function Kpi({ label, value, hint, icon: Icon, tone = "accent" }: { label: string; value: string; hint?: string; icon: LucideIcon; tone?: "accent" | "gold" }) {
  const color = tone === "gold" ? "var(--gold)" : "var(--accent)";
  return (
    <div className="card relative overflow-hidden p-4">
      <div
        aria-hidden
        className="absolute -right-6 -top-6 size-24 rounded-full opacity-20 blur-2xl"
        style={{ background: color }}
      />
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
          <Icon className="size-4" />
        </span>
        <span className="eyebrow">{label}</span>
      </div>
      <div className="tabular mt-3 text-3xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

function Card({ title, subtitle, eyebrow, children, action }: { title: string; subtitle?: string; eyebrow?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-1 max-w-3xl text-xs text-ink-3">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Meilleur joueur d'un poste : carte mise en avant */
function Featured({ p, region }: { p: RankingRow; region: Region }) {
  return (
    <Link
      href={playerLink(region, p.id)}
      className="group relative block overflow-hidden rounded-xl border border-border bg-gradient-to-b from-surface-2 to-surface p-3 transition-colors hover:border-gold/60"
    >
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/70 to-transparent" />
      <div className="flex items-center gap-3">
        <span className="rounded-full p-0.5" style={{ background: "conic-gradient(from 200deg, var(--gold), transparent 70%, var(--gold))" }}>
          <Avatar name={p.name} src={p.photo} size={52} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold group-hover:underline">
            <PlayerName name={p.name} />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
            <TeamLogo team={p.team} src={p.logo} size={14} />
            <span className="truncate">{p.team}</span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div className="text-xs text-ink-3">
          {p.league_code} · {p.age !== undefined ? `${p.age_approx ? "~" : ""}${p.age} ans` : "âge ?"}
        </div>
        <div className="text-right">
          <div className="tabular text-2xl font-semibold leading-none text-gold">{fmtScore(p.final)}</div>
          <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-ink-3">{topPercent(p.role_percentile)}</div>
        </div>
      </div>
    </Link>
  );
}

export const metadata = {};

export default function Dashboard({ region }: { region: Region }) {
  if (!hasRegion(region)) return <RegionMissing region={region} />;
  const R = REGION_INFO[region];
  const MAX_AGE = R.prospectMaxAge;
  const T = (tier: string) => tierName(tier, region);
  const meta = getMeta(region);
  const rankings = getRankings(region);
  const leagues = getLeagues(region);
  const promotions = getPromotions(region);
  const season = Math.max(...meta.seasons);
  const lastPromo = promotions[promotions.length - 1];

  const prospects = rankings.filter(
    (r) =>
      r.season === season &&
      !r.played_lec &&
      !r.ex_lec &&
      (r.age === undefined || r.age <= MAX_AGE) &&
      r.games >= MIN_GAMES,
  );

  // Toutes régions : les meilleurs prospects d'Europe et de NA mélangés, classés
  // par rang dans leur région (les scores ne sont pas comparables entre régions)
  const crossRegion = REGIONS.filter(hasRegion).flatMap((reg) => {
    const info = REGION_INFO[reg];
    const s = Math.max(...getMeta(reg).seasons);
    return getRankings(reg)
      .filter(
        (r) =>
          r.season === s &&
          !r.played_lec &&
          !r.ex_lec &&
          (r.age === undefined || r.age <= info.prospectMaxAge) &&
          r.games >= MIN_GAMES,
      )
      .map((r) => ({ ...r, region: reg }));
  });
  const multiRegion = new Set(crossRegion.map((r) => r.region)).size > 1;

  const leagueBars = leagues
    .filter((l) => l.tier === "ERL1" || l.tier === "ERL2")
    .map((l) => ({
      key: l.code,
      label: (
        <span>
          {l.code} <span className="text-ink-3">{l.tier}</span>
        </span>
      ),
      value: l.coef,
      display: l.coef.toFixed(2),
      color: l.tier === "ERL1" ? "var(--series-1)" : "var(--series-2)",
      tooltip: (
        <div className="space-y-0.5">
          <div className="font-semibold">{Object.values(l.names).at(-1)}</div>
          <div>Coefficient {meta.seasons.at(-1)} : {l.coef.toFixed(3)}</div>
          {l.em_coef !== undefined && Math.abs(l.coef - l.em_coef) >= 0.005 && (
            <div>
              dont EM {l.em_coef.toFixed(2)} et niveau des joueurs {l.coef - l.em_coef >= 0 ? "+" : "−"}
              {Math.abs(l.coef - l.em_coef).toFixed(2)}
            </div>
          )}
          {l.em_teams > 0 ? (
            <div>
              {l.em_teams} participations à l&apos;EM · percentile moyen {(l.raw_mean ?? 0).toFixed(2)}
            </div>
          ) : (
            <div>Pas d&apos;EM : coef de l&apos;ERL1 du pays − décote</div>
          )}
        </div>
      ),
    }));

  const hitBars = (from: string) =>
    (lastPromo?.hit_rates ?? [])
      .filter((h) => h.from === from)
      .map((h) => ({
        key: h.bucket,
        label: h.bucket,
        value: h.total ? h.promoted / h.total : 0,
        display: `${Math.round(h.total ? (100 * h.promoted) / h.total : 0)} %`,
        tooltip: (
          <div>
            <span className="font-semibold">{h.promoted}</span> joueurs montés sur {h.total} ({h.bucket} de leur
            niveau en {lastPromo.from})
          </div>
        ),
      }));

  const lecUp = lastPromo?.players.filter((p) => p.new_level === "LEC").length ?? 0;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-surface via-surface to-accent-soft/40 px-6 py-8 sm:px-10 sm:py-10">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-80 rounded-full bg-accent/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 right-40 size-64 rounded-full bg-gold/10 blur-3xl" />
        <div className="relative max-w-3xl">
          <div className="eyebrow mb-3 flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-gold shadow-[0_0_8px_var(--gold)]" />
            Saison {season} · {R.name}
          </div>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Repérer les talents <span className="bg-gradient-to-r from-accent to-gold bg-clip-text text-transparent">avant tout le monde</span>
          </h1>
          <p className="mt-3 text-sm text-ink-2 sm:text-base">
            {region === "eu"
              ? "Prospects européens : ERL1, ERL2, EMEA Masters et montées en LEC."
              : region === "na"
                ? "Prospects nord-américains : NACL et montées en LCS."
                : "Prospects coréens : LCK CL, LCK Academy Series et montées en LCK."}{" "}
            Classement par poste, niveau des ligues, mercato en direct.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href={link(region, "/donnees")}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-medium text-white shadow-[0_0_20px_-6px_var(--accent)] transition-colors hover:bg-accent/90"
            >
              Explorer les joueurs <ArrowRightIcon className="size-4" />
            </Link>
            <Link href={link(region, "/besoins")} className="inline-flex h-9 items-center rounded-full border border-border bg-surface/60 px-4 text-sm text-ink-2 transition-colors hover:border-ink-3 hover:text-ink">
              Besoins des équipes
            </Link>
            <Link href={link(region, "/rosters")} className="inline-flex h-9 items-center rounded-full border border-border bg-surface/60 px-4 text-sm text-ink-2 transition-colors hover:border-ink-3 hover:text-ink">
              Mercato {season + 1}
            </Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={UsersIcon} label="Joueurs suivis" value={meta.players.toLocaleString("fr-FR")} />
        <Kpi icon={SwordsIcon} label="Parties analysées" value={meta.games.toLocaleString("fr-FR")} hint={`Saisons ${meta.seasons.join(", ")}`} />
        <Kpi icon={TrophyIcon} label="Ligues" value={String(meta.leagues)} hint={region === "eu" ? "LEC, EM, ERL1, ERL2" : region === "na" ? "LCS, NACL" : "LCK, LCK CL, Academy"} />
        <Kpi
          icon={TrendingUpIcon}
          tone="gold"
          label={`Montés en ${R.top}`}
          value={String(lecUp)}
          hint={lastPromo ? `${lastPromo.from} → ${lastPromo.to}, hors équipes invitées` : undefined}
        />
      </div>

      {multiRegion && (
        <Card
          eyebrow="Toutes régions"
          title="Meilleurs cracks"
          subtitle="Europe, Amérique du Nord et Corée mélangées, classées par rang dans leur poste au sein de leur région (top 1 % d'abord) : les scores ne se comparent pas directement d'une région à l'autre. 21 ans ou moins (23 en NA), jamais passés par la 1re division."
        >
          <div className="grid gap-4 md:grid-cols-5">
            {ROLES.map((role) => (
              <div key={role}>
                <div className="eyebrow mb-2">{role}</div>
                <ol className="space-y-1.5">
                  {crossRegion
                    .filter((p) => p.role === role)
                    .sort((a, b) => b.role_percentile - a.role_percentile || b.final - a.final)
                    .slice(0, 5)
                    .map((p) => (
                      <li key={`${p.region}-${p.id}`}>
                        <Link
                          href={playerLink(p.region, p.id)}
                          className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-surface-2"
                        >
                          <Avatar name={p.name} src={p.photo} size={34} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm">
                              <PlayerName name={p.name} />
                            </div>
                            <div className="flex items-center gap-1 text-xs text-ink-3">
                              <span
                                className="rounded px-1 text-[10px] font-semibold"
                                style={{
                                  background:
                                    p.region === "eu"
                                      ? "var(--accent-soft)"
                                      : p.region === "na"
                                        ? "color-mix(in srgb, var(--series-2) 22%, transparent)"
                                        : "color-mix(in srgb, var(--series-3) 22%, transparent)",
                                }}
                              >
                                {REGION_INFO[p.region].short}
                              </span>
                              <span className="truncate">
                                {p.league_code} · {p.age !== undefined ? `${p.age_approx ? "~" : ""}${p.age} ans` : "âge ?"}
                              </span>
                            </div>
                          </div>
                          <div className="text-right text-[11px] font-semibold">{topPercent(p.role_percentile)}</div>
                        </Link>
                      </li>
                    ))}
                </ol>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card
        eyebrow={`${MAX_AGE} ans ou moins · saison ${season}`}
        title="Meilleurs prospects"
        action={
          <Link href={link(region, "/donnees")} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
            Tout le classement <ArrowRightIcon className="size-3.5" />
          </Link>
        }
        subtitle={`Hors joueurs déjà passés par la ${R.top}, au moins ${MIN_GAMES} parties. « âge ? » = date de naissance inconnue (à compléter dans birthdates.csv). Score = ${R.hasEm ? "perf. dans sa ligue + niveau de la ligue + EMEA Masters" : "perf. dans la NACL comparée aux joueurs du même poste"}.`}
      >
        <div className="grid gap-4 md:grid-cols-5">
          {ROLES.map((role) => (
            <div key={role}>
              <div className="eyebrow mb-2">{role}</div>
              {prospects.find((p) => p.role === role) && <Featured p={prospects.find((p) => p.role === role)!} region={region} />}
              <ol className="mt-2 space-y-1">
                {prospects
                  .filter((p) => p.role === role)
                  .slice(1, 4)
                  .map((p) => (
                    <li key={p.id}>
                      <Link
                        href={playerLink(region, p.id)}
                        className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-surface-2"
                      >
                        <Avatar name={p.name} src={p.photo} size={40} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">
                            <PlayerName name={p.name} />
                          </div>
                          <div className="flex items-center gap-1 text-xs text-ink-3">
                            <TeamLogo team={p.team} src={p.logo} size={14} />
                            <span className="truncate">
                              {p.league_code} · {p.age !== undefined ? `${p.age_approx ? "~" : ""}${p.age} ans` : "âge ?"}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="tabular text-sm font-semibold">{fmtScore(p.final)}</div>
                          <div className="text-[10px] text-ink-3">{topPercent(p.role_percentile)}</div>
                        </div>
                      </Link>
                    </li>
                  ))}
              </ol>
            </div>
          ))}
        </div>

      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {R.hasLeagues && (
        <Card
          title="Niveau des ligues"
          subtitle={`Coefficient ${meta.seasons.at(-1)} = placement à l'EMEA Masters sur 2 ans (1 = vainqueur) + niveau des joueurs de la ligue. Détail saison par saison dans l'onglet Ligues.`}
        >
          <div className="mb-3 flex gap-4 text-xs text-ink-2">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--series-1)" }} /> ERL1
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--series-2)" }} /> ERL2
            </span>
          </div>
          <HBarChart data={leagueBars} max={1} />
        </Card>
        )}

        <div className="space-y-6">
          {lastPromo && (
            <>
              <Card
                title={`${T("ERL1")} → ${R.top} : taux de montée (${lastPromo.from} → ${lastPromo.to})`}
                subtitle={`Selon le rang du joueur parmi les ${T("ERL1")} de son poste en ${lastPromo.from}.`}
              >
                <HBarChart data={hitBars("ERL1")} max={1} />
              </Card>
              {(lastPromo.hit_rates ?? []).some((h) => h.from === "ERL2" && h.total > 0) && (
              <Card
                title={`${T("ERL2")} → ${T("ERL1")} : taux de montée (${lastPromo.from} → ${lastPromo.to})`}
                subtitle={`Selon le rang du joueur parmi les ${T("ERL2")} de son poste en ${lastPromo.from}.`}
              >
                <HBarChart data={hitBars("ERL2")} max={1} />
              </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
