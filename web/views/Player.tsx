import Link from "next/link";
import { FileTextIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { Avatar, TeamLogo } from "@/components/Images";
import { CareerTimeline, LevelSummary, Trophies } from "@/components/Career";
import { TIER_COLOR } from "@/lib/tiers";
import { link, REGION_INFO, type Region, REGIONS, teamLink, tierName } from "@/lib/region";
import { hasTeam } from "@/views/Team";
import DeepButton from "@/components/DeepButton";
import { Evolution, StatsVsRole } from "@/components/PlayerStats";
import { getMeta, getPlayer, getPromotionModel, getRankings, hasRegion } from "@/lib/data";
import { fmtScore, topPercent } from "@/lib/format";
import { similarPlayers } from "@/lib/similar";
import { WORLD, worldOffset, worldScore } from "@/lib/world";

// Pages pré-générées pour les joueurs classés ; les autres sont générées à la demande
export function playerStaticParams(region: Region) {
  if (!hasRegion(region)) return [];
  const ids = new Set(getRankings(region).map((r) => r.id));
  return [...ids].map((id) => ({ id }));
}

export function playerMetadata(id: string, region: Region) {
  if (!hasRegion(region)) return { title: "LoL Scouting" };
  const player = getPlayer(id, region);
  return { title: player ? `${player.name} · LoL Scouting` : "Joueur introuvable" };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function PlayerView({ id, region }: { id: string; region: Region }) {
  if (!hasRegion(region)) notFound();
  const player = getPlayer(id, region);
  if (!player) notFound();
  const meta = getMeta(region);
  const R = REGION_INFO[region];
  // Même joueur dans l'autre région (même page Leaguepedia) : ex. Yukino, NACL puis KC Blue
  const twins = REGIONS.filter(
    (r) => r !== region && hasRegion(r) && getPlayer(id, r)?.name === player.name,
  );

  const [pseudo, realName] = (() => {
    const m = player.name.match(/^(.*?)\s*\((.*)\)$/);
    return m ? [m[1], m[2]] : [player.name, null];
  })();

  const scores = [...player.scores].sort((a, b) => b.season - a.season);
  const career = player.career;

  return (
    <div className="space-y-6">
      <Link href={link(region, "/donnees")} className="text-sm text-ink-3 hover:text-ink">
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
                  {[player.league_code, player.tier].includes(tierName(player.tier, region)) ||
                  player.league_code === player.tier
                    ? player.league_code
                    : `${player.league_code} · ${tierName(player.tier, region)}`}
                </span>
                <span className="rounded border border-border px-2 py-0.5 text-xs font-medium">{player.role}</span>
              </div>
              {realName && <div className="text-sm text-ink-3">{realName}</div>}
            </div>
            <div className="flex items-center gap-3">
              <TeamLogo team={player.team} src={player.logo} size={40} />
              <div>
                <div className="font-semibold">
                  {player.team && hasTeam(region, player.team) ? (
                    <Link href={teamLink(region, player.team)} className="hover:underline">
                      {player.team}
                    </Link>
                  ) : (
                    player.team
                  )}
                </div>
                <div className="text-xs text-ink-3">Club actuel</div>
              </div>
            </div>
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <div>
                <dt className="inline text-ink-3">Âge </dt>
                <dd className="inline font-medium">
                  {player.age ? `${player.age_approx ? "~" : ""}${Math.floor(player.age)} ans` : "inconnu"}
                  {player.birthdate && !player.age_approx && (
                    <span className="text-ink-3"> (né le {player.birthdate})</span>
                  )}
                  {player.age_approx && <span className="text-ink-3"> (année approximative)</span>}
                </dd>
              </div>
              {player.country && (
                <div>
                  <dt className="inline text-ink-3">Pays </dt>
                  <dd className="inline font-medium">{player.country}</dd>
                </div>
              )}
              <Link
                href={link(region, `/joueurs/${id}/fiche`)}
                className="inline-flex items-center gap-1 rounded-full border border-gold/50 px-2.5 py-0.5 text-xs font-medium text-gold transition-colors hover:bg-gold/10"
                title="Fiche A4 à imprimer ou enregistrer en PDF, pour l'envoyer"
              >
                <FileTextIcon className="size-3.5" /> Fiche PDF
              </Link>
              {scores.find((x) => x.soloq_riot_id)?.soloq_riot_id && (
                <DeepButton riotId={scores.find((x) => x.soloq_riot_id)!.soloq_riot_id!} />
              )}
              <a
                href={`https://lol.fandom.com/wiki/${encodeURIComponent(player.name.replace(/ /g, "_"))}`}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                Page Leaguepedia ↗
              </a>
              {scores.length > 0 && (
                <Link
                  href={`/comparer?a=${region}-${scores[0].season}-${id}`}
                  className="text-accent hover:underline"
                >
                  Comparer →
                </Link>
              )}
              {twins.map((r) => (
                <Link key={r} href={link(r, `/joueurs/${id}`)} className="text-accent hover:underline">
                  Fiche {REGION_INFO[r].name} →
                </Link>
              ))}
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
            <LevelSummary career={career} region={region} />
            <CareerTimeline career={career} region={region} />
          </div>
        </Section>
      )}

      {career && (
        <Section title="Palmarès">
          <Trophies career={career} />
        </Section>
      )}

      {(() => {
        const model = getPromotionModel();
        const c = model?.players[region]?.[id];
        if (!model || !c) return null;
        const pctv = Math.round(c.p * 100);
        return (
          <Section title={`Chance de jouer en 1re division en ${model.target}`}>
            <div className="flex flex-wrap items-start gap-5">
              <div>
                <div className="text-4xl font-bold tabular-nums" style={{ color: "var(--gold)" }}>
                  {c.p < 0.01 ? "<1" : pctv} %
                </div>
                <div className="text-xs text-ink-3">
                  {c.rank_role === 1 ? "1re" : `${c.rank_role}e`} chance de son poste en {R.short} · {R.top} ou 1re division
                  d&apos;une autre région
                </div>
                {c.official && (
                  <div className="mt-1 text-xs font-semibold" style={{ color: c.official.rumor ? "var(--gold)" : "var(--good-text)" }}>
                    {c.official.rumor ? "→ rumeur" : "✓ déjà annoncé"}
                    {c.official.team ? ` : ${c.official.team}` : ""}
                    {c.official.league ? ` (${c.official.league})` : ""}
                  </div>
                )}
              </div>
              <div className="min-w-60 flex-1">
                <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-3">Ce qui pèse le plus</div>
                <ul className="space-y-0.5 text-sm">
                  {c.factors.map(([name, v]) => (
                    <li key={name} className="flex items-center gap-2">
                      <span style={{ color: v >= 0 ? "var(--good-text)" : "var(--critical)" }}>{v >= 0 ? "▲" : "▼"}</span>
                      <span>{name}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="w-full text-xs text-ink-3">
                {model.model ?? "Modèle"} appris sur les montées réelles {model.trained_on.join(", ")} des six régions (rang dans le
                poste, score, forme, progression, âge, expérience, stats clés, académie, poste). Les facteurs viennent de la partie
                logistique. Détail et fiabilité dans l&apos;onglet{" "}
                <Link href={link(region, "/montees")} className="text-accent hover:underline">
                  Montées
                </Link>
                .
              </p>
            </div>
          </Section>
        );
      })()}

      {scores.length > 0 && (
        <Section title="Score de prospect">
          <div className="grid gap-3 md:grid-cols-2">
            {scores.map((s) => (
              <div key={s.season} className="rounded-md border border-border p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium">
                    {s.season} · {s.league_code}{s.league_code !== tierName(s.tier, region) && ` (${tierName(s.tier, region)})`} · {s.role}
                  </span>
                  <span className="text-xs text-ink-3">{topPercent(s.role_percentile)} des {s.role} de {R.lower}</span>
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
                    {s.tier === "LEC" && (
                      <tr>
                        <td className="py-0.5 text-ink-2">
                          Bonus 1re division ({R.top}){" "}
                          {s.team_adjust ? (
                            <span className="text-ink-3">
                              · perf. ajustée selon son équipe ({fmtScore(s.team_adjust)})
                            </span>
                          ) : null}
                        </td>
                        <td className="text-right">{fmtScore(s.league_bonus)}</td>
                      </tr>
                    )}
                    {s.tier === "LEC" && s.intl_games ? (
                      <tr>
                        <td className="py-0.5 text-ink-2">
                          Bonus internationaux{" "}
                          <span className="text-ink-3">
                            ({s.intl_games} parties Worlds / MSI / EWC / First Stand, {fmtScore(s.intl_score)} vs les
                            joueurs du monde à son poste)
                          </span>
                        </td>
                        <td className="text-right">{fmtScore(s.intl_bonus)}</td>
                      </tr>
                    ) : null}
                    {R.hasLeagues && s.tier !== "LEC" && (
                      <>
                    <tr>
                      <td className="py-0.5 text-ink-2">
                        Bonus niveau de ligue{" "}
                        {s.league_coef !== undefined && s.league_coef_base !== undefined && (
                          <Link href={link(region, "/ligues")} className="text-ink-3 hover:underline">
                            (coef {s.league_coef.toFixed(2)} = EM {s.league_coef_base.toFixed(2)}{" "}
                            {s.league_coef - s.league_coef_base >= 0 ? "+" : "−"} niveau des joueurs{" "}
                            {Math.abs(s.league_coef - s.league_coef_base).toFixed(2)})
                          </Link>
                        )}
                      </td>
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
                      </>
                    )}
                    {s.form_bonus ? (
                      <tr>
                        <td className="py-0.5 text-ink-2">
                          Forme{" "}
                          <span className="text-ink-3">
                            ({s.form_split} : {fmtScore(s.form_score)} sur {s.form_games} parties, × {meta.form_weight ?? 0.2})
                          </span>
                        </td>
                        <td className="text-right">{fmtScore(s.form_bonus)}</td>
                      </tr>
                    ) : null}
                    {s.ex_lec_malus ? (
                      <tr>
                        <td className="py-0.5 text-ink-2">
                          Ancien joueur de {R.top} <span className="text-ink-3">({s.ex_lec})</span>
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
                    {region !== "eu" && worldScore(s.final, region, s.season, s.tier) !== null && (
                      <tr className="text-gold">
                        <td className="py-0.5" title="Score ramené à l'échelle de la LEC d'après les résultats internationaux de la région : comparable d'une région à l'autre">
                          Score mondial <span className="font-normal text-ink-3">(échelle LEC, décalage {fmtScore(worldOffset(region, s.season, s.tier)!)} {s.tier !== "LEC" && (WORLD.lower?.[region]?.adjust ?? 0) !== 0 ? `, dont ${fmtScore(WORLD.lower![region]!.adjust)} pour la division inférieure` : ""})</span>
                        </td>
                        <td className="text-right font-semibold">{fmtScore(worldScore(s.final, region, s.season, s.tier)!)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {s.played_lec && <p className="mt-1 text-xs text-ink-3">A joué en {R.top} cette saison.</p>}
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

      {(() => {
        const sim = similarPlayers(region, id);
        if (!sim?.list.length) return null;
        return (
          <Section title={`Profils similaires · ${sim.role} ${sim.season}`}>
            <p className="mb-2 text-xs text-ink-3">
              Joueurs du même poste dont les stats {sim.season} ressemblent le plus aux siennes (toutes ligues de la
              région), par exemple pour trouver une alternative moins chère.
            </p>
            <ul className="divide-y divide-border">
              {sim.list.map(({ row, proximity }) => (
                <li key={row.id} className="flex items-center gap-2 py-1.5 text-sm">
                  <Avatar name={row.name} src={row.photo} size={24} />
                  <Link href={link(region, `/joueurs/${row.id}`)} className="font-medium hover:underline">
                    {row.name}
                  </Link>
                  <span className="truncate text-xs text-ink-3">
                    {row.current_team ?? row.team} · {row.league_code}
                    {row.age !== undefined && ` · ${row.age} ans`}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-ink-3" title="Proximité des stats (100 = identiques)">
                    {proximity} %
                  </span>
                  <span className="w-12 shrink-0 text-right font-semibold tabular-nums" title="Score final">
                    {fmtScore(row.final)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        );
      })()}
    </div>
  );
}
