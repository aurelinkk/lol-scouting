import world from "@/data/world.json";
import type { Region } from "./region";

/**
 * Score mondial (python scout.py score-mondial) : décalage de chaque région, saison par
 * saison, pour mettre son score à l'échelle de l'Europe (LEC), d'après les
 * résultats internationaux (Worlds, MSI, EWC, First Stand).
 */
export interface WorldRegion {
  offset: number;
  /** log-cote contre l'Europe à l'international */
  strength: number;
  strength_se: number;
  top_mean: number;
  games: number;
  wins: number;
  games_weighted: number;
}
export interface World {
  generated: string;
  reference: Region;
  k: number;
  games: number;
  seasons: Record<string, Partial<Record<Region, WorldRegion>>>;
  /** Correction des 2e / 3e divisions (joueurs partis en 1re division d'une autre région) */
  lower?: Partial<Record<Region, { adjust: number; players: number; raw: number }>>;
  check?: { players: number; regional_error: number; world_error: number };
  h2h: Partial<Record<Region, Partial<Record<Region, [number, number]>>>>;
}

export const WORLD = world as unknown as World;

/** Décalage d'une région (et d'un niveau : `tier` autre que "LEC" = division inférieure) */
export function worldOffset(region: Region, season: number, tier = "LEC"): number | null {
  const s = WORLD.seasons[String(season)] ?? WORLD.seasons[String(Math.max(...Object.keys(WORLD.seasons).map(Number)))];
  const o = s?.[region]?.offset;
  if (o === undefined) return null;
  return o + (tier !== "LEC" ? (WORLD.lower?.[region]?.adjust ?? 0) : 0);
}

/** Score à l'échelle LEC (null si la région n'est pas calibrée) */
export function worldScore(final: number, region: Region, season: number, tier = "LEC"): number | null {
  const o = worldOffset(region, season, tier);
  return o === null ? null : final + o;
}

/** Score d'un joueur de `from` (niveau `tier`) exprimé à l'échelle de `to` (même saison) */
export function convertScore(final: number, from: Region, to: Region, season: number, tier = "LEC"): number | null {
  if (from === to) return final;
  const a = worldOffset(from, season, tier);
  const b = worldOffset(to, season);
  return a === null || b === null ? null : final + a - b;
}

/** Probabilité de victoire d'une équipe de `a` contre une équipe de `b` (à l'international) */
export function winProbability(a: Region, b: Region, season: number): number | null {
  const s = WORLD.seasons[String(season)];
  const x = s?.[a]?.strength;
  const y = s?.[b]?.strength;
  return x === undefined || y === undefined ? null : 1 / (1 + Math.exp(-(x - y)));
}
