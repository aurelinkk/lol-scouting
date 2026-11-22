import RegionMissing from "@/components/RegionMissing";
import TeamNeeds, { type Candidate } from "@/components/TeamNeeds";
import { MAX_AGE } from "@/lib/needs";
import { getMercato, getPlayers, getRankings, hasRegion } from "@/lib/data";
import { signedFromMercato } from "@/lib/mercato/signed";
import { type Region, REGION_INFO, REGIONS } from "@/lib/region";

export const metadata = { title: "Besoins · LoL Scouting" };

const POOL_PER_ROLE = 150;
const FOREIGN_PER_ROLE = 10;

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

  // Imports possibles : les meilleurs joueurs disponibles des autres régions
  // suivies (sans club pour la saison suivante d'après leur mercato), par poste.
  // Score de leur propre région : pas directement comparable d'une région à l'autre
  const foreign = R.top === "LCK"
    ? []
    : REGIONS.filter((r2) => r2 !== region && hasRegion(r2)).map((r2) => {
        const taken = new Set(Object.keys(signedFromMercato(getMercato(r2)?.teams ?? [], r2)));
        const rows = getRankings(r2);
        const last = Math.max(...rows.map((x) => x.season));
        const byRole: Record<string, Candidate[]> = {};
        for (const r of rows
          .filter((x) => x.season === last && x.games >= 8 && !taken.has(x.id) && (x.age === undefined || x.age <= MAX_AGE))
          .sort((a, b) => b.final - a.final)) {
          const list = (byRole[r.role] ??= []);
          if (list.length >= FOREIGN_PER_ROLE) continue;
          list.push({
            id: r.id, name: r.name, role: r.role, team: r.current_team || r.team, league: r.league_code, tier: r.tier,
            final: r.final, age: r.age, country: r.country, photo: r.photo, region: r2,
          });
        }
        return { region: r2, label: REGION_INFO[r2].short, byRole };
      });

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
            : `Maximum 2 imports par équipe (joueurs hors ${{ eu: "EMEA", na: "Amériques", cn: "Chine", lcp: "zone Pacifique", br: "Amériques" }[region as "eu" | "na" | "cn" | "lcp" | "br"]}) : quand les places sont prises, les imports ne sont plus proposés.`}{" "}
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
        foreign={foreign}
      />
    </div>
  );
}
