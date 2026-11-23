import "server-only";
import { getPromotions, getRankings } from "@/lib/data";
import type { Region } from "@/lib/region";

/**
 * Trajectoires comparées : la courbe d'un joueur (score de chaque saison selon
 * son âge) comparée à celle des joueurs déjà montés en 1re division dans sa
 * région, avant leur montée. Les âges sont alignés (à 7 mois près) et la
 * ressemblance est l'écart moyen de score aux mêmes âges.
 */
export interface TrajPoint {
  season: number;
  age: number;
  score: number;
  league: string;
  top: boolean;
}
export interface TrajMatch {
  id: string;
  name: string;
  role: string;
  points: TrajPoint[];
  /** saison et âge de la montée en 1re division, club rejoint */
  upSeason: number;
  upAge: number | null;
  upTeam: string;
  /** écart moyen de score aux mêmes âges, nombre de saisons comparées */
  gap: number;
  common: number;
}

const AGE_TOLERANCE = 0.6;
const cache = new Map<Region, { points: Map<string, TrajPoint[]>; names: Map<string, [string, string]>; refs: Omit<TrajMatch, "gap" | "common">[] }>();

function build(region: Region) {
  const hit = cache.get(region);
  if (hit) return hit;
  const points = new Map<string, TrajPoint[]>();
  const names = new Map<string, [string, string]>();
  // un point par saison (la ligne avec le plus de parties), âge de fin de saison
  const best = new Map<string, { games: number; p: TrajPoint }>();
  for (const r of getRankings(region)) {
    if (r.age === undefined || r.age_approx) continue;
    const k = `${r.id}|${r.season}`;
    const cur = best.get(k);
    if (cur && cur.games >= r.games) continue;
    best.set(k, { games: r.games, p: { season: r.season, age: r.age, score: r.final, league: r.league_code, top: r.tier === "LEC" } });
    names.set(r.id, [r.name, r.role]);
  }
  for (const [k, v] of best) {
    const id = k.split("|")[0];
    const list = points.get(id) ?? [];
    list.push(v.p);
    points.set(id, list);
  }
  for (const list of points.values()) list.sort((a, b) => a.season - b.season);

  // Montés en 1re division : leur courbe AVANT la montée
  const refs: Omit<TrajMatch, "gap" | "common">[] = [];
  const seen = new Set<string>();
  for (const block of getPromotions(region)) {
    for (const p of block.players) {
      if (p.new_level !== "LEC" || seen.has(p.id)) continue;
      const pts = (points.get(p.id) ?? []).filter((x) => !x.top && x.season <= (p.from_season ?? block.from));
      if (!pts.length) continue;
      seen.add(p.id);
      const last = pts[pts.length - 1];
      refs.push({
        id: p.id,
        name: p.name,
        role: p.role,
        points: pts,
        upSeason: p.mid_season ? (p.from_season ?? block.from) : block.to,
        upAge: last ? Math.round((last.age + (p.mid_season ? 0 : 0.3)) * 10) / 10 : null,
        upTeam: p.new_team ?? "",
      });
    }
  }
  const out = { points, names, refs };
  cache.set(region, out);
  return out;
}

/** Les montés passés dont la courbe ressemble le plus à celle du joueur (même poste d'abord) */
export function similarTrajectories(region: Region, id: string, n = 3): { me: TrajPoint[]; matches: TrajMatch[] } | null {
  const { points, names, refs } = build(region);
  const me = (points.get(id) ?? []).filter((p) => !p.top);
  if (!me.length) return null;
  const role = names.get(id)?.[1];
  const scored: TrajMatch[] = [];
  for (const ref of refs) {
    if (ref.id === id) continue;
    let sum = 0;
    let common = 0;
    for (const p of me) {
      const near = ref.points.reduce<TrajPoint | null>(
        (b, q) => (Math.abs(q.age - p.age) <= AGE_TOLERANCE && (!b || Math.abs(q.age - p.age) < Math.abs(b.age - p.age)) ? q : b),
        null,
      );
      if (!near) continue;
      sum += Math.abs(near.score - p.score);
      common += 1;
    }
    if (!common || common < Math.min(2, me.length)) continue;
    scored.push({ ...ref, gap: sum / common, common });
  }
  // même poste d'abord, puis le plus proche ; à écart égal, plus de saisons comparées
  const rank = (m: TrajMatch) => m.gap - 0.05 * m.common + (m.role === role ? 0 : 0.35);
  scored.sort((a, b) => rank(a) - rank(b));
  return { me, matches: scored.slice(0, n) };
}
