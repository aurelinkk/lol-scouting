import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, TeamLogo } from "@/components/Images";
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

  return (
    <div className="space-y-6">
      <Link href="/donnees" className="text-sm text-ink-3 hover:text-ink">
        ← Données
      </Link>

      <header className="flex flex-col items-start gap-4 rounded-lg border border-border bg-surface p-5 sm:flex-row sm:items-center sm:gap-5">
        <Avatar name={player.name} src={player.photo} size={104} />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{pseudo}</h1>
            {realName && <div className="text-sm text-ink-3">{realName}</div>}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <TeamLogo team={player.team} src={player.logo} size={28} />
            <span className="font-medium">{player.team}</span>
            <span className="text-ink-3">
              · {player.league_code} ({player.tier})
            </span>
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div>
              <dt className="inline text-ink-3">Poste </dt>
              <dd className="inline font-medium">{player.role}</dd>
            </div>
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
          </dl>
        </div>
        <a
          href={`https://lol.fandom.com/wiki/${encodeURIComponent(player.name.replace(/ /g, "_"))}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-accent hover:underline"
        >
          Page Leaguepedia ↗
        </a>
      </header>

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
                      <td className="py-0.5 text-ink-2">Performance dans sa ligue</td>
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
                          {s.em_games ? `(${s.em_games} parties, z = ${fmtScore(s.em_score)})` : "(pas d'EM)"}
                        </span>
                      </td>
                      <td className="text-right">{fmtScore(meta.em_weight * (s.em_score ?? 0))}</td>
                    </tr>
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
