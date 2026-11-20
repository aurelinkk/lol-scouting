import RegionMissing from "@/components/RegionMissing";
import TeamNeeds, { type Candidate, MAX_AGE } from "@/components/TeamNeeds";
import { getMercato, getPlayers, getRankings, hasRegion } from "@/lib/data";
import { type Region, REGION_INFO, REGIONS } from "@/lib/region";

export const metadata = { title: "Besoins · LoL Scouting" };

const POOL_PER_ROLE = 150;

export default function BesoinsPage({ region }: { region: Region }) {
  if (!hasRegion(region)) return <RegionMissing region={region} />;
  const mercato = getMercato(region);
  const R = REGION_INFO[region];
  if (!mercato) return <p className="text-sm text-ink-3">Pas de mercato exporté pour cette région.</p>;

  // Viviers : joueurs de la dernière saison, par poste, les mieux classés d'abord
  const rankings = getRankings(region);
  const season = Math.max(...rankings.map((r) => r.season));
  const byRole = new Map<string, Candidate[]>();
  for (const r of rankings
    .filter((x) => x.season === season && x.games >= 8)
    .sort((a, b) => b.final - a.final)) {
    const list = byRole.get(r.role) ?? [];
    // les mieux classés, plus tous les joueurs de 1re division (ceux sans club
    // sont toujours proposés, même un peu plus bas)
    if (list.length >= POOL_PER_ROLE && r.tier !== "LEC") continue;
    list.push({
      id: r.id, name: r.name, role: r.role, team: r.current_team || r.team, league: r.league_code, tier: r.tier,
      final: r.final, age: r.age, country: r.country, photo: r.photo,
    });
    byRole.set(r.role, list);
  }

  // Nationalité des joueurs des effectifs (y compris ceux venus d'une autre région)
  const countries: Record<string, string> = {};
  for (const r of REGIONS) {
    if (!hasRegion(r)) continue;
    for (const p of Object.values(getPlayers(r))) if (p.country && !countries[p.name]) countries[p.name] = p.country;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Besoins des équipes · {mercato.season}</h1>
        <p className="text-sm text-ink-2">
          Pour chaque équipe de {R.top}, les postes encore à pourvoir ou pas officialisés pour {mercato.season}, et les
          meilleurs joueurs disponibles à ce poste (classement {season} de l&apos;onglet Données, {MAX_AGE} ans maximum), joueurs
          de {R.top} sans club compris. Suit le mercato en direct : un transfert dans Rosters change aussitôt les besoins.
        </p>
        <p className="mt-1 text-xs text-ink-3">
          {region === "kr"
            ? "La LCK ne prend aucun import : seuls les joueurs coréens sont proposés."
            : `Maximum 2 imports par équipe (joueurs hors ${region === "eu" ? "EMEA" : "Amériques"}) : quand les places sont prises, les imports ne sont plus proposés.`}{" "}
          Origine d&apos;après la nationalité ; exceptions (double nationalité, résidence acquise) dans{" "}
          <code>web/data/residency.json</code>.
        </p>
      </div>
      <TeamNeeds
        region={region}
        season={mercato.season}
        generated={mercato.generated}
        teams={mercato.teams}
        pool={Object.fromEntries(byRole)}
        countries={countries}
      />
    </div>
  );
}
