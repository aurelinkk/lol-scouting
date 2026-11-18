import MercatoBoard from "@/components/MercatoBoard";
import RostersBrowser from "@/components/RostersBrowser";
import RegionMissing from "@/components/RegionMissing";
import { getMercato, hasRegion } from "@/lib/data";
import type { Region } from "@/lib/region";

export const metadata = { title: "Rosters · LoL Scouting" };

export default function RostersPage({ region }: { region: Region }) {
  if (!hasRegion(region)) return <RegionMissing region={region} />;
  const mercato = getMercato(region);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Rosters</h1>
        <p className="text-sm text-ink-2">
          {region === "eu"
            ? "Effectifs de la LEC et des ERL1"
            : region === "na"
              ? "Effectifs de la LCS et de la NACL"
              : "Effectifs de la LCK et de la LCK CL"} depuis 2023, d&apos;après les parties jouées, et le mercato de la saison à
          venir.
        </p>
      </div>

      {mercato && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Mercato {mercato.season}</h2>
            <p className="text-xs text-ink-3">
              Construit automatiquement depuis Leaguepedia : effectif de fin de saison {mercato.season - 1}, puis
              transferts officiels et rumeurs. Sert aussi aux montées {mercato.season - 1} → {mercato.season}.
            </p>
          </div>
          <MercatoBoard season={mercato.season} teams={mercato.teams} undecided={mercato.undecided} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Effectifs par saison</h2>
        <RostersBrowser />
      </section>
    </div>
  );
}
