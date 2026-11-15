import LadderTable from "@/components/LadderTable";

export const metadata = { title: "Ladder · LoL Scouting" };

export default function LadderPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Ladder EUW</h1>
        <p className="text-sm text-ink-2">
          Top de la soloQ EUW. Par défaut, les joueurs qui ne sont dans aucune équipe pro de nos données : ceux à
          scouter. Les relevés successifs montrent qui gagne des LP et qui joue beaucoup.
        </p>
      </div>
      <LadderTable />
    </div>
  );
}
