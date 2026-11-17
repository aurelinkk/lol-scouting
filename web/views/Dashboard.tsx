import Link from "next/link";
import { HBarChart } from "@/components/Charts";
import { Avatar, PlayerName, TeamLogo } from "@/components/Images";
import RegionMissing from "@/components/RegionMissing";
import { REGIONS } from "@/lib/region";
import { link, playerLink, REGION_INFO, type Region, tierName } from "@/lib/region";
import { getLeagues, getMeta, getPromotions, getRankings, hasRegion } from "@/lib/data";
import { fmtScore, topPercent } from "@/lib/format";
import { ROLES } from "@/lib/types";

const MIN_GAMES = 15;

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-ink-3">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
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
      <div>
        <h1 className="text-xl font-semibold">Indicateurs</h1>
        <p className="text-sm text-ink-2">
          {region === "eu"
            ? "Prospects européens : ERL1, ERL2, EMEA Masters et montées en LEC."
            : "Prospects nord-américains : NACL et montées en LCS."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Joueurs suivis" value={meta.players.toLocaleString("fr-FR")} />
        <Kpi label="Parties analysées" value={meta.games.toLocaleString("fr-FR")} hint={`Saisons ${meta.seasons.join(", ")}`} />
        <Kpi label="Ligues" value={String(meta.leagues)} hint={region === "eu" ? "LEC, EM, ERL1, ERL2" : "LCS, NACL"} />
        <Kpi
          label={`Montés en ${R.top} ${lastPromo ? `(${lastPromo.from}→${lastPromo.to})` : ""}`}
          value={String(lecUp)}
          hint="hors équipes invitées"
        />
      </div>

      {multiRegion && (
        <Card
          title="Meilleurs cracks — toutes régions"
          subtitle="Europe et Amérique du Nord mélangées, classées par rang dans leur poste au sein de leur région (top 1 % d'abord) : les scores ne se comparent pas directement d'une région à l'autre. 21 ans ou moins en Europe, 23 en NA, jamais passés par la 1re division."
        >
          <div className="grid gap-4 md:grid-cols-5">
            {ROLES.map((role) => (
              <div key={role}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">{role}</div>
                <ol className="space-y-1.5">
                  {crossRegion
                    .filter((p) => p.role === role)
                    .sort((a, b) => b.role_percentile - a.role_percentile || b.final - a.final)
                    .slice(0, 5)
                    .map((p) => (
                      <li key={`${p.region}-${p.id}`}>
                        <Link
                          href={playerLink(p.region, p.id)}
                          className="flex items-center gap-2 rounded-md p-1.5 hover:bg-surface-2"
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
                                  background: p.region === "eu" ? "var(--accent-soft)" : "color-mix(in srgb, var(--series-2) 22%, transparent)",
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
        title={`Meilleurs prospects ${season} — ${MAX_AGE} ans ou moins`}
        subtitle={`Hors joueurs déjà passés par la ${R.top}, au moins ${MIN_GAMES} parties. « âge ? » = date de naissance inconnue (à compléter dans birthdates.csv). Score = ${R.hasEm ? "perf. dans sa ligue + niveau de la ligue + EMEA Masters" : "perf. dans la NACL comparée aux joueurs du même poste"}.`}
      >
        <div className="grid gap-4 md:grid-cols-5">
          {ROLES.map((role) => (
            <div key={role}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">{role}</div>
              <ol className="space-y-2">
                {prospects
                  .filter((p) => p.role === role)
                  .slice(0, 4)
                  .map((p) => (
                    <li key={p.id}>
                      <Link
                        href={playerLink(region, p.id)}
                        className="flex items-center gap-2 rounded-md p-1.5 hover:bg-surface-2"
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
        <div className="mt-3 text-right">
          <Link href={link(region, "/donnees")} className="text-sm text-accent hover:underline">
            Voir tout le classement →
          </Link>
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
                title={`ERL2 → ERL1 : taux de montée (${lastPromo.from} → ${lastPromo.to})`}
                subtitle={`Selon le rang du joueur parmi les ERL2 de son poste en ${lastPromo.from}.`}
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
