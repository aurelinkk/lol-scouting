import { Suspense } from "react";
import Comparator, { type LeagueInfo } from "@/components/Comparator";
import { getLeagues, getMeta, hasRegion } from "@/lib/data";
import { type Region, REGION_INFO, REGIONS } from "@/lib/region";
import WorldStrength from "@/components/WorldStrength";
import { WORLD } from "@/lib/world";

export const metadata = { title: "Comparer · LoL Scouting" };

function lowerText() {
  const parts = Object.entries(WORLD.lower ?? {})
    .filter(([, v]) => v && v.adjust !== 0)
    .map(([r, v]) => `${REGION_INFO[r as Region].lower} ${v!.adjust >= 0 ? "+" : "−"}${Math.abs(v!.adjust).toFixed(2)} (${v!.players} joueurs partis en 1re division d'une autre région, moins bons que prévu)`);
  return parts.length ? ` Correction des divisions inférieures : ${parts.join(", ")}.` : "";
}

export default function ComparerPage() {
  const seasons = Object.fromEntries(
    REGIONS.map((r) => [r, hasRegion(r) ? getMeta(r).seasons : []]),
  ) as Record<Region, number[]>;
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
          Deux joueurs côte à côte, de n&apos;importe quelle région suivie et n&apos;importe quelle saison : score régional et score mondial (comparable d&apos;une
          région à l&apos;autre), niveau de leur ligue et chaque stat située dans sa propre ligue.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-ink-3">Chargement…</p>}>
        <Comparator seasons={seasons} leagues={leagues} />
      </Suspense>
      <section className="card space-y-3 p-5">
        <div>
          <div className="eyebrow mb-1">Worlds · MSI · EWC · First Stand</div>
          <h2 className="text-base font-semibold tracking-tight">Niveau des régions et score mondial</h2>
          <p className="mt-1 max-w-3xl text-xs text-ink-3">
            Le score de chaque région est relatif à sa région. Pour comparer, on mesure la force de chaque région sur toutes
            ses parties internationales contre les autres régions (modèle de Bradley-Terry : la saison compte pour 1, la
            précédente pour 0.5), puis on la convertit en points de score : dans une même ligue, une équipe plus forte d&apos;un
            écart-type a des titulaires meilleurs de {WORLD.k.toFixed(2)} écart-type de score. Score mondial = score régional +
            décalage ; un joueur de LEC garde son score.
            {WORLD.check &&
              ` Vérification : pour les ${WORLD.check.players} joueurs de 1re division qui ont changé de région, l'écart de score avant / après passe de ${WORLD.check.regional_error.toFixed(2)} à ${WORLD.check.world_error.toFixed(2)} en moyenne.`}
            {lowerText()} Limite : ce sont les meilleures équipes de chaque région qui se croisent à l&apos;international.
          </p>
        </div>
        <WorldStrength />
      </section>
    </div>
  );
}
