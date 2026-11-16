import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, TeamLogo } from "@/components/Images";
import { CareerTimeline, LevelSummary, Trophies } from "@/components/Career";
import { TIER_COLOR, TIER_NAME } from "@/lib/tiers";
import { Evolution, StatsVsRole } from "@/components/PlayerStats";
import { getMeta, getPlayer, getRankings } from "@/lib/data";
import { fmtScore, topPercent } from "@/lib/format";

// Pages pré-générées pour les joueurs classés ; les autres sont générées à la demande
export const dynamicParams = true;

export function generateStaticParams() {
  const ids = new Set(getRankings().map((r) => r.id));
  return [...ids].map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const player = getPlayer((await params).id);
  return { title: player ? `${player.name} · LoL Scouting` : "Joueur introuvable" };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const player = getPlayer(id);
  if (!player) notFound();
  const meta = getMeta();

  const [pseudo, realName] = (() => {
    const m = player.name.match(/^(.*?)\s*\((.*)\)$/);
    return m ? [m[1], m[2]] : [player.name, null];
  })();

  const scores = [...player.scores].sort((a, b) => b.season - a.season);
  const career = player.career;

  return (
    <div className="space-y-6">
      <Link href="/donnees" className="text-sm text-ink-3 hover:text-ink">
        ← Données
      </Link>

      <header
        className="relative overflow-hidden rounded-xl border border-border bg-surface"
        style={{ borderTop: `4px solid ${TIER_COLOR[player.tier] ?? "var(--accent)"}` }}
      >
        {/* Logo du club en filigrane */}
        {player.logo && (
          <div
            aria-hidden
            className="pointer-events-none absolute -right-6 -top-6 h-56 w-56 bg-contain bg-center bg-no-repeat opacity-[0.07]"
            style={{ backgroundImage: `url("${player.logo}")` }}
          />
        )}
        <div className="relative flex flex-col items-start gap-5 p-5 sm:flex-row sm:items-center">
          <Avatar name={player.name} src={player.photo} size={128} />
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-bold tracking-tight">{pseudo}</h1>
                <span
                  className="rounded px-2 py-0.5 text-xs font-semibold text-[#111]"
                  style={{ background: TIER_COLOR[player.tier] ?? "var(--surface-2)" }}
                >
                  {player.league_code === player.tier
                    ? player.league_code
                    : `${player.league_code} · ${TIER_NAME[player.tier] ?? player.tier}`}
                </span>
                <span className="rounded border border-border px-2 py-0.5 text-xs font-medium">{player.role}</span>
              </div>
              {realName && <div className="text-sm text-ink-3">{realName}</div>}
            </div>
            <div className="flex items-center gap-3">
              <TeamLogo team={player.team} src={player.logo} size={40} />
              <div>
                <div className="font-semibold">{player.team}</div>
                <div className="text-xs text-ink-3">Club actuel</div>
              </div>
            </div>
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <div>
                <dt className="inline text-ink-3">Âge </dt>
                <dd className="inline font-medium">
                  {player.age ? `${Math.floor(player.age)} ans` : "inconnu"}
                  {player.birthdate && <span className="text-ink-3"> (né le {player.birthdate})</span>}
                </dd>
              </div>
              {player.country && (
                <div>
                  <dt className="inline text-ink-3">Pays </dt>
                  <dd className="inline font-medium">{player.country}</dd>
                </div>
              )}
              <a
                href={`https://lol.fandom.com/wiki/${encodeURIComponent(player.name.replace(/ /g, "_"))}`}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                Page Leaguepedia ↗
              </a>
            </dl>
          </div>
          {career && (
            <div className="grid grid-cols-3 gap-2 text-center sm:w-72">
              <div className="rounded-lg bg-surface-2 p-2">
                <div className="text-xl font-bold">{career.titles.length}</div>
                <div className="text-[11px] text-ink-3">titres</div>
              </div>
              <div className="rounded-lg bg-surface-2 p-2">
                <div className="text-xl font-bold">{career.awards.length}</div>
                <div className="text-[11px] text-ink-3">récompenses</div>
              </div>
              <div className="rounded-lg bg-surface-2 p-2">
                <div className="text-xl font-bold">{new Set(career.stints.map((s) => s.team)).size}</div>
                <div className="text-[11px] text-ink-3">clubs</div>
              </div>
            </div>
          )}
        </div>
      </header>

      {career && career.stints.length > 0 && (
        <Section title="Carrière">
          <div className="space-y-5">
            <LevelSummary career={career} />
            <CareerTimeline career={career} />
          </div>
        </Section>
      )}

      {career && (
        <Section title="Palmarès">
          <Trophies career={career} />
        </Section>
      )}

      {scores.length > 0 && (
        <Section title="Score de prospect">
          <div className="grid gap-3 md:grid-cols-2">
            {scores.map((s) => (
              <div key={s.season} className="rounded-md border border-border p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium">
                    {s.season} · {s.league_code} ({s.tier}) · {s.role}
                  </span>
                  <span className="text-xs text-ink-3">{topPercent(s.role_percentile)} des {s.role} d&apos;ERL</span>
                </div>
                <table className="tabular mt-2 w-full text-sm">
                  <tbody>
                    <tr>
                      <td className="py-0.5 text-ink-2">
                        Performance dans sa ligue{" "}
                        {s.league_score_raw !== undefined && s.sample_factor !== undefined && (
                          <span className="text-ink-3">
                            ({fmtScore(s.league_score_raw)} × {s.sample_factor.toFixed(2)} pour {s.games} parties)
                          </span>
                        )}
                      </td>
                      <td className="text-right">{fmtScore(s.league_score)}</td>
                    </tr>
                    <tr>
                      <td className="py-0.5 text-ink-2">Bonus niveau de ligue</td>
                      <td className="text-right">{fmtScore(s.league_bonus)}</td>
                    </tr>
                    <tr>
                      <td className="py-0.5 text-ink-2">
                        {meta.em_weight} × EMEA Masters{" "}
                        <span className="text-ink-3">
                          {s.em_games
                            ? `(${fmtScore(s.em_score_raw ?? s.em_score)} réduit à ${fmtScore(s.em_score)} pour ${s.em_games} parties)`
                            : "(pas d'EM)"}
                        </span>
                      </td>
                      <td className="text-right">{fmtScore(meta.em_weight * (s.em_score ?? 0))}</td>
                    </tr>
                    {s.ex_lec_malus ? (
                      <tr>
                        <td className="py-0.5 text-ink-2">
                          Ancien joueur de LEC <span className="text-ink-3">({s.ex_lec})</span>
                        </td>
                        <td className="text-right">{fmtScore(s.ex_lec_malus)}</td>
                      </tr>
                    ) : null}
                    {s.soloq_bonus ? (
                      <tr>
                        <td className="py-0.5 text-ink-2">
                          SoloQ{" "}
                          <span className="text-ink-3">
                            ({s.soloq_riot_id} · {s.soloq_tier} {s.soloq_lp} LP · #{s.soloq_rank} EUW ·{" "}
                            {s.soloq_games} parties
                            {s.soloq_games_7d ? ` · ${s.soloq_games_7d} sur 7 j` : ""})
                          </span>
                        </td>
                        <td className="text-right">{fmtScore(s.soloq_bonus)}</td>
                      </tr>
                    ) : null}
                    <tr className="border-t border-border font-semibold">
                      <td className="pt-1">Score final</td>
                      <td className="pt-1 text-right">{fmtScore(s.final)}</td>
                    </tr>
                  </tbody>
                </table>
                {s.played_lec && <p className="mt-1 text-xs text-ink-3">A joué en LEC cette saison.</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Stats comparées à son poste dans sa ligue">
        <StatsVsRole lines={player.lines} weights={meta.weights} />
      </Section>

      <Section title="Évolution">
        <Evolution points={player.evolution} />
      </Section>
    </div>
  );
}
