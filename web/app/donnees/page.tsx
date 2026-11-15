import DataTable from "@/components/DataTable";
import { getMeta } from "@/lib/data";

export const metadata = { title: "Données · LoL Scouting" };

export default function DonneesPage() {
  const meta = getMeta();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Données</h1>
        <p className="text-sm text-ink-2">
          Tous les joueurs d&apos;ERL classés. Chaque stat est comparée aux joueurs du même poste dans la même ligue.
        </p>
      </div>
      <DataTable seasons={meta.seasons} hasOe={meta.has_oe} />
    </div>
  );
}
