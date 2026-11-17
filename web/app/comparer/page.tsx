import { Suspense } from "react";
import Comparator, { type LeagueInfo } from "@/components/Comparator";
import { getLeagues, getMeta, hasRegion } from "@/lib/data";
import type { Region } from "@/lib/region";

export const metadata = { title: "Comparer · LoL Scouting" };

export default function ComparerPage() {
  const seasons = { eu: getMeta("eu").seasons, na: hasRegion("na") ? getMeta("na").seasons : [] } as Record<
    Region,
    number[]
  >;
  // Niveau des ligues européennes saison par saison (coef EM + niveau des joueurs)
  const leagues: LeagueInfo[] = getLeagues("eu").map((l) => ({
    code: l.code,
    name: Object.values(l.names).at(-1) ?? l.code,
    seasons: Object.fromEntries(
      Object.entries(l.seasons ?? {}).map(([s, v]) => [
        s,
        { coef: v.coef, base: v.base, talent: v.talent, starters: v.starters },
      ]),
    ),
  }));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Comparer</h1>
        <p className="text-sm text-ink-2">
          Deux joueurs côte à côte, Europe ou Amérique du Nord, n&apos;importe quelle saison : score, niveau de leur
          ligue et chaque stat située dans sa propre ligue.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-ink-3">Chargement…</p>}>
        <Comparator seasons={seasons} leagues={leagues} />
      </Suspense>
    </div>
  );
}
