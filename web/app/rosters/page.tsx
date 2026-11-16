import MercatoBoard from "@/components/MercatoBoard";
import RostersBrowser from "@/components/RostersBrowser";
import { getMercato } from "@/lib/data";

export const metadata = { title: "Rosters · LoL Scouting" };

export default function RostersPage() {
  const mercato = getMercato();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Rosters</h1>
        <p className="text-sm text-ink-2">
          Effectifs de la LEC et des ERL1 depuis 2023, d&apos;après les parties jouées, et le mercato de la saison à
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
