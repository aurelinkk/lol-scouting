import { Suspense } from "react";
import DataExplorer from "@/components/data/DataExplorer";
import RegionMissing from "@/components/RegionMissing";
import { getMercato, getMeta, getPromotions, hasRegion, getPromotionModel } from "@/lib/data";
import type { Promoted } from "@/components/data/DataExplorer";
import { contractsFromMercato, departureFromMercato, signedFromMercato } from "@/lib/mercato/signed";
import { REGION_INFO, type Region } from "@/lib/region";

export const metadata = { title: "Données · LoL Scouting" };

export default function DonneesPage({ region }: { region: Region }) {
  if (!hasRegion(region)) return <RegionMissing region={region} />;
  const meta = getMeta(region);

  // Joueurs montés la saison suivante (parties jouées, ou mercato pour la
  // saison à venir : officiel ou rumeur), par saison : "2026:zamudo" -> ...
  const rumors = new Set(
    (getMercato(region)?.teams ?? []).flatMap((t) =>
      t.slots.filter((s) => s.after?.id && s.status.includes("rumeur")).map((s) => s.after!.id!),
    ),
  );
  const mercatoSeason = getMercato(region)?.season;
  const promoted: Record<string, Promoted> = {};
  for (const promo of getPromotions(region)) {
    for (const p of promo.players) {
      const level = p.new_level === "LEC" ? "top" : p.new_level === "ERL1" && p.tier === "ERL2" ? "second" : null;
      if (!level) continue;
      const abroad = p.new_league && p.new_level === "LEC" && p.new_league !== REGION_INFO[region].top;
      promoted[`${p.from_season ?? promo.from}:${p.id}`] = {
        level,
        team: abroad ? `${p.new_team} (${p.new_league})` : p.new_team,
        season: p.mid_season ? promo.from : promo.to,
        rumor: promo.to === mercatoSeason && rumors.has(p.id),
      };
    }
  }

  // Départs vers un club d'une autre ligue d'après le mercato, y compris dans
  // l'autre région (ex : Yukino, KC Blue -> FlyQuest en LCS)
  const RANK: Record<string, number> = { LEC: 0, ERL1: 1, ERL2: 2 };
  for (const t of getMercato(region)?.teams ?? []) {
    for (const s of t.slots) {
      const to = s.to;
      if (!to?.tier || !s.before?.id || to.tier === "?") continue;
      const key = `${(mercatoSeason ?? 0) - 1}:${s.before.id}`;
      if (promoted[key]) continue;
      const abroad = to.region && to.region !== region;
      const up = (RANK[to.tier] ?? 9) < (RANK[t.tier] ?? 9);
      if (!up && !abroad) continue;
      promoted[key] = {
        level: up ? (to.tier === "LEC" ? "top" : "second") : "move",
        team: abroad && to.league ? `${to.team} (${to.league})` : to.team,
        season: mercatoSeason ?? 0,
        rumor: s.status.includes("rumeur"),
      };
    }
  }

  // Monté en cours de saison puis libéré au mercato (Daglas : TH Academy -> Team
  // Heretics en avril 2026, quitte TH en novembre) : la montée reste affichée,
  // avec le départ et la nouvelle piste éventuelle
  const mercato = getMercato(region);
  const signed = signedFromMercato(mercato?.teams ?? [], region);
  for (const [key, p] of Object.entries(promoted)) {
    const id = key.split(":")[1];
    if (!mercatoSeason || p.season !== mercatoSeason - 1 || !key.startsWith(`${mercatoSeason - 1}:`)) continue;
    const dep = departureFromMercato(mercato, id);
    if (!dep || dep.tier !== "LEC") continue;
    const sg = signed[id];
    const to = sg && !sg.stays && sg.team !== dep.team ? sg : undefined;
    promoted[key] = { ...p, left: { team: dep.team, rumor: !dep.official, to: to?.team, toRumor: to ? !to.official : undefined } };
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Données</h1>
        <p className="text-sm text-ink-2">
          Tous les joueurs de {REGION_INFO[region].lower} classés. Chaque stat est comparée aux joueurs du même poste dans la même ligue.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-ink-3">Chargement…</p>}>
        <DataExplorer
          seasons={meta.seasons}
          hasOe={meta.has_oe}
          promoted={promoted}
          signed={signedFromMercato(getMercato(region)?.teams ?? [], region)}
          contracts={contractsFromMercato(getMercato(region)?.teams ?? [])}
          mercatoGenerated={getMercato(region)?.generated}
          mercatoSeason={mercatoSeason}
          promotionChance={Object.fromEntries(
            Object.entries(getPromotionModel()?.players[region] ?? {}).map(([id, v]) => [id, v.p]),
          )}
          stayChance={Object.fromEntries(
            Object.entries(getPromotionModel()?.stay?.players[region] ?? {}).map(([id, v]) => [id, v.p]),
          )}
        />
      </Suspense>
    </div>
  );
}
