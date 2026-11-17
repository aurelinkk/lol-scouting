import Link from "next/link";
import { Avatar, PlayerName, TeamLogo } from "@/components/Images";
import SeasonTabs from "@/components/SeasonTabs";
import RegionMissing from "@/components/RegionMissing";
import { getPromotions, hasRegion } from "@/lib/data";
import { playerLink, REGION_INFO, type Region, tierName } from "@/lib/region";
import { fmtScore, fmtStat, topPercent } from "@/lib/format";
import type { Promotion, PromotionPlayer } from "@/lib/types";

export const metadata = { title: "Montées · LoL Scouting" };

function Move({ p }: { p: PromotionPlayer }) {
  const from = p.from_team ?? p.team;
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-sm">
      <TeamLogo team={from} src={p.from_logo ?? p.logo} size={18} />
      <span className="max-w-36 truncate text-ink-2" title={from !== p.team ? `Saison évaluée avec ${p.team}` : undefined}>
        {from}
      </span>
      <span className="text-ink-3">→</span>
      <TeamLogo team={p.new_team} src={p.new_logo} size={18} />
      <span className="max-w-36 truncate font-medium">{p.new_team}</span>
    </span>
  );
}

function PromotionTable({ players, rankLabel, region }: { players: PromotionPlayer[]; rankLabel: string; region: Region }) {
  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full whitespace-nowrap text-sm">
        <thead className="border-b border-border text-xs text-ink-3">
          <tr>
            <th className="px-2 py-2 text-left font-medium">Joueur</th>
            <th className="px-2 py-2 text-left font-medium">Transfert</th>
            <th className="px-2 py-2 text-left font-medium">Ligue (avant)</th>
            <th className="px-2 py-2 text-right font-medium">Âge</th>
            <th className="px-2 py-2 text-right font-medium">Parties</th>
            <th className="px-2 py-2 text-right font-medium">Score</th>
            <th className="px-2 py-2 text-right font-medium">{rankLabel}</th>
            <th className="px-2 py-2 text-right font-medium">EM</th>
            <th className="px-2 py-2 text-right font-medium">WR</th>
            <th className="px-2 py-2 text-right font-medium">KDA</th>
            <th className="px-2 py-2 text-right font-medium">DMG/m</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface-2">
              <td className="px-2 py-1.5">
                <Link href={playerLink(region, p.id)} className="flex items-center gap-2 hover:underline">
                  <Avatar name={p.name} src={p.photo} size={28} />
                  <span className="whitespace-nowrap">
                    <PlayerName name={p.name} />
                  </span>
                  <span className="text-xs text-ink-3">{p.role}</span>
                </Link>
              </td>
              <td className="px-2 py-1.5">
                <Move p={p} />
              </td>
              <td className="whitespace-nowrap px-2 py-1.5 text-ink-2">
                {p.league_code} <span className="text-xs text-ink-3">{p.tier}</span>
              </td>
              <td className="px-2 py-1.5 text-right">{p.age ?? "–"}</td>
              <td className="px-2 py-1.5 text-right">{p.games}</td>
              <td className="px-2 py-1.5 text-right font-semibold">{fmtScore(p.final)}</td>
              <td className="whitespace-nowrap px-2 py-1.5 text-right">{topPercent(p.tier_percentile)}</td>
              <td className="px-2 py-1.5 text-right text-ink-2">{p.em_games ? `${p.em_games} p.` : "–"}</td>
              <td className="px-2 py-1.5 text-right">{fmtStat("winrate", p.winrate)}</td>
              <td className="px-2 py-1.5 text-right">{fmtStat("kda", p.kda)}</td>
              <td className="px-2 py-1.5 text-right">{fmtStat("dpm", p.dpm)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MonteesPage({ region }: { region: Region }) {
  if (!hasRegion(region)) return <RegionMissing region={region} />;
  const promotions = [...getPromotions(region)].reverse();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Montées</h1>
        <p className="text-sm text-ink-2">
          Les joueurs qui sont montés d&apos;un niveau entre deux saisons, avec leur profil la saison d&apos;avant :
          est-ce que le score les avait repérés ?
        </p>
      </div>

      <SeasonTabs
        items={promotions.map((promo) => ({
          key: `${promo.from}-${promo.to}`,
          label: `${promo.from} → ${promo.to}`,
          content: <PromotionSeason promo={promo} region={region} />,
        }))}
      />
    </div>
  );
}

function PromotionSeason({ promo, region }: { promo: Promotion; region: Region }) {
        const R = REGION_INFO[region];
        const T = (tier: string) => tierName(tier, region);
        const lec = promo.players.filter((p) => p.new_level === "LEC");
        const erl = promo.players.filter((p) => p.tier === "ERL2" && p.new_level === "ERL1");
        const top10 = (list: PromotionPlayer[]) => list.filter((p) => p.tier_percentile >= 0.9).length;
        return (
          <div className="space-y-6">

            <section className="rounded-lg border border-border bg-surface p-4">
              <h3 className="text-sm font-semibold">{T("ERL1")} → {R.top} · {lec.length} joueurs</h3>
              <p className="mt-0.5 text-xs text-ink-3">
                {top10(lec)} sur {lec.length} étaient dans le top 10 % des {T("ERL1")} de leur poste en {promo.from}.
                {region === "eu" && " Équipes invitées (ex : LEC Versus) exclues."}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {lec.map((p) => (
                  <Link
                    key={p.id}
                    href={playerLink(region, p.id)}
                    className="flex gap-3 rounded-md border border-border p-3 hover:bg-surface-2"
                  >
                    <Avatar name={p.name} src={p.photo} size={56} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm">
                          <PlayerName name={p.name} />
                        </span>
                        <span className="text-xs text-ink-3">
                          {p.ex_lec && (
                            <span className="mr-1 rounded border border-border px-1" title={`Déjà en ${R.top} : ${p.ex_lec}`}>
                              retour
                            </span>
                          )}
                          {p.role}
                        </span>
                      </div>
                      <Move p={p} />
                      <div className="text-xs text-ink-3">
                        {p.from_season !== undefined && p.from_season < promo.from && (
                          <span>dernière saison en {R.lower} : {p.from_season} · </span>
                        )}
                        {p.from_team && p.from_team !== p.team && (
                          <span>
                            évalué sur {p.league_code} {promo.from} ({p.team}) ·{" "}
                          </span>
                        )}
                        {p.from_league ?? p.league_code} · {p.age ? `${p.age} ans` : "âge ?"} · score{" "}
                        <span className="font-semibold text-ink">{fmtScore(p.final)}</span> ·{" "}
                        {topPercent(p.tier_percentile)}
                        {R.hasEm && <> · {p.em_games ? `${p.em_games} p. d'EM` : "pas d'EM"}</>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            {erl.length > 0 && (
            <section className="rounded-lg border border-border bg-surface p-4">
              <h3 className="text-sm font-semibold">ERL2 → ERL1 · {erl.length} joueurs</h3>
              <p className="mb-3 mt-0.5 text-xs text-ink-3">
                {top10(erl)} sur {erl.length} étaient dans le top 10 % des ERL2 de leur poste en {promo.from}. Beaucoup
                montent avec toute leur équipe (promotion), indépendamment du niveau individuel.
              </p>
              <PromotionTable players={erl} rankLabel={`Rang ERL2 ${promo.from}`} region={region} />
            </section>
            )}
          </div>
        );
}
