import { REGION_INFO, type Region } from "@/lib/region";

/** Région pas encore exportée (SCOUT_REGION=na python export_web.py). */
export default function RegionMissing({ region }: { region: Region }) {
  return (
    <div className="card p-6 text-sm text-ink-2">
      <h1 className="mb-2 text-lg font-semibold">{REGION_INFO[region].name}</h1>
      Pas encore de données pour cette région. Sur le PC : <code>SCOUT_REGION={region} python export_web.py</code>,
      puis pousser <code>web/data/{region}</code> et <code>web/public/data/{region}</code>.
    </div>
  );
}
