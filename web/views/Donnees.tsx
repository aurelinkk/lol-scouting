import DataTable from "@/components/DataTable";
import RegionMissing from "@/components/RegionMissing";
import { getMeta, hasRegion } from "@/lib/data";
import { REGION_INFO, type Region } from "@/lib/region";

export const metadata = { title: "Données · LoL Scouting" };

export default function DonneesPage({ region }: { region: Region }) {
  if (!hasRegion(region)) return <RegionMissing region={region} />;
  const meta = getMeta(region);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Données</h1>
        <p className="text-sm text-ink-2">
          Tous les joueurs de {REGION_INFO[region].lower} classés. Chaque stat est comparée aux joueurs du même poste dans la même ligue.
        </p>
      </div>
      <DataTable seasons={meta.seasons} hasOe={meta.has_oe} />
    </div>
  );
}
