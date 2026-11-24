import { REGION_INFO, type Region } from "@/lib/region";

/** Région pas encore exportée (python scout.py export --region na). */
export default function RegionMissing({ region }: { region: Region }) {
  return (
    <div className="card p-6 text-sm text-ink-2">
      <h1 className="mb-2 text-lg font-semibold">{REGION_INFO[region].name}</h1>
      Pas encore de données pour cette région. Sur le PC : <code>python scout.py export --region {region}</code>,
      puis pousser <code>web/data/{region}</code> et <code>web/public/data/{region}</code>.
    </div>
  );
}
