import DataTable from "@/components/DataTable";
import RegionMissing from "@/components/RegionMissing";
import { getMercato, getMeta, getPromotions, hasRegion } from "@/lib/data";
import type { Promoted } from "@/components/DataTable";
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
      promoted[`${p.from_season ?? promo.from}:${p.id}`] = {
        level,
        team: p.new_team,
        season: promo.to,
        rumor: promo.to === mercatoSeason && rumors.has(p.id),
      };
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Données</h1>
        <p className="text-sm text-ink-2">
          Tous les joueurs de {REGION_INFO[region].lower} classés. Chaque stat est comparée aux joueurs du même poste dans la même ligue.
        </p>
      </div>
      <DataTable seasons={meta.seasons} hasOe={meta.has_oe} promoted={promoted} />
    </div>
  );
}
