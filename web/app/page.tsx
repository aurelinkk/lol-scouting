import Link from "next/link";
import { HBarChart } from "@/components/Charts";
import { Avatar, PlayerName, TeamLogo } from "@/components/Images";
import { getLeagues, getMeta, getPromotions, getRankings } from "@/lib/data";
import { fmtScore, topPercent } from "@/lib/format";
import { ROLES } from "@/lib/types";

const MAX_AGE = 21;
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

export default function Dashboard() {
  const meta = getMeta();
  const rankings = getRankings();
  const leagues = getLeagues();
  const promotions = getPromotions();
  const season = Math.max(...meta.seasons);
  const lastPromo = promotions[promotions.length - 1];

  const prospects = rankings.filter(
    (r) => r.season === season && !r.played_lec && (r.age === undefined || r.age <= MAX_AGE) && r.games >= MIN_GAMES,
  );

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
          <div>Coefficient : {l.coef.toFixed(3)}</div>
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
        <p className="text-sm text-ink-2">Prospects européens : ERL1, ERL2, EMEA Masters et montées en LEC.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Joueurs suivis" value={meta.players.toLocaleString("fr-FR")} />
        <Kpi label="Parties analysées" value={meta.games.toLocaleString("fr-FR")} hint={`Saisons ${meta.seasons.join(", ")}`} />
        <Kpi label="Ligues" value={String(meta.leagues)} hint="LEC, EM, ERL1, ERL2" />
        <Kpi
          label={`Montés en LEC ${lastPromo ? `(${lastPromo.from}→${lastPromo.to})` : ""}`}
          value={String(lecUp)}
          hint="hors équipes invitées"
        />
      </div>

      <Card
        title={`Meilleurs prospects ${season} — ${MAX_AGE} ans ou moins`}
        subtitle={`Hors joueurs passés par la LEC, au moins ${MIN_GAMES} parties. « âge ? » = date de naissance inconnue (à compléter dans birthdates.csv). Score = perf. dans sa ligue + niveau de la ligue + EMEA Masters.`}
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
                        href={`/joueurs/${p.id}`}
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
                              {p.league_code} · {p.age !== undefined ? `${p.age} ans` : "âge ?"}
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
          <Link href="/donnees" className="text-sm text-accent hover:underline">
            Voir tout le classement →
          </Link>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Niveau des ligues"
          subtitle={`Coefficient = placement moyen des équipes de la ligue à l'EMEA Masters (${meta.seasons.join("–")}), 1 = vainqueur.`}
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

        <div className="space-y-6">
          {lastPromo && (
            <>
              <Card
                title={`ERL1 → LEC : taux de montée (${lastPromo.from} → ${lastPromo.to})`}
                subtitle={`Selon le rang du joueur parmi les ERL1 de son poste en ${lastPromo.from}.`}
              >
                <HBarChart data={hitBars("ERL1")} max={1} />
              </Card>
              <Card
                title={`ERL2 → ERL1 : taux de montée (${lastPromo.from} → ${lastPromo.to})`}
                subtitle={`Selon le rang du joueur parmi les ERL2 de son poste en ${lastPromo.from}.`}
              >
                <HBarChart data={hitBars("ERL2")} max={1} />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
