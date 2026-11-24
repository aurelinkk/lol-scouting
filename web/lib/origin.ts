import residency from "@/data/residency.json";
import residencyLp from "@/data/residency_lp.json";
import type { Region } from "@/lib/region";

/**
 * Grande région d'origine d'un joueur, d'après sa nationalité (Leaguepedia).
 * Approximation de la résidence : un Coréen en LEC compte comme import (KR).
 *  EMEA : Europe, Turquie, CEI, Moyen-Orient, Afrique (LEC et ERL)
 *  AMER : Amérique du Nord et du Sud (LCS, CBLOL, LTA)
 *  KR   : Corée du Sud (LCK)
 *  LPL  : Chine
 *  LCP  : Taïwan, Hong Kong, Vietnam, Japon, Océanie, Asie du Sud-Est
 */
export type Origin = "EMEA" | "AMER" | "KR" | "LPL" | "LCP";

export const ORIGINS: { value: Origin; label: string }[] = [
  { value: "EMEA", label: "Europe (EMEA)" },
  { value: "AMER", label: "Americas" },
  { value: "KR", label: "Corée (KR)" },
  { value: "LPL", label: "Chine (LPL)" },
  { value: "LCP", label: "Asie-Pacifique (LCP)" },
];

const AMER = new Set([
  "United States", "Canada", "Mexico", "Brazil", "Argentina", "Chile", "Peru", "Colombia", "Uruguay",
  "Venezuela", "Ecuador", "Bolivia", "Paraguay", "Costa Rica", "Panama", "Guatemala", "Honduras",
  "El Salvador", "Nicaragua", "Dominican Republic", "Puerto Rico", "Cuba", "Jamaica",
]);
const LCP = new Set([
  "Taiwan", "Hong Kong", "Macau", "Vietnam", "Japan", "Australia", "New Zealand", "Philippines",
  "Thailand", "Malaysia", "Singapore", "Indonesia", "Cambodia", "Laos", "Myanmar",
]);

// Exceptions saisies à la main (web/data/residency.json) : ex. Busio, Américain
// mais aussi Polonais, compte comme joueur EMEA (pas d'import en LEC)
const RESIDENCY = residency as Record<string, string>;

export function originOf(country?: string | null, name?: string): Origin | null {
  const forced = name ? RESIDENCY[name] ?? RESIDENCY[name.replace(/\s*\(.*\)$/, "")] : undefined;
  if (forced && forced !== "_info") return forced as Origin;
  if (!country) return null;
  if (country === "South Korea") return "KR";
  if (country === "China") return "LPL";
  if (AMER.has(country)) return "AMER";
  if (LCP.has(country)) return "LCP";
  return "EMEA";
}

/** Grande région « locale » des ligues d'une région du site */
export const HOME_ORIGIN: Record<Region, Origin> = { eu: "EMEA", na: "AMER", kr: "KR", cn: "LPL", lcp: "LCP", br: "AMER" };

/**
 * Résident de la ligue (ne prend pas de place d'import) ? Règle mondiale de Riot :
 * au moins 3 résidents dans le cinq de départ, donc 2 imports au plus.
 * Amériques (règles LCS / CBLOL 2026) : un Brésilien est un import en LCS, un
 * Nord-Américain un import au CBLOL ; exception 2026-2027, les joueurs
 * d'Amérique latine comptent comme résidents dans les deux ligues.
 * Nationalité inconnue : compté comme résident (pas de fausse alerte).
 */
const NORTH_AMERICA = new Set(["United States", "Canada"]);

// Résidence officielle Leaguepedia et double nationalité (python residency.py) :
// seulement les joueurs dont la résidence ne se déduit pas de la nationalité.
// Ex : CoreJJ "na" (coréen résident en Amérique du Nord), Busio "eu+na"
// (américain et polonais : résident en LEC comme en LCS)
const RESIDENCY_LP = residencyLp as Record<string, string>;

export function isResident(country: string | null | undefined, name: string | undefined, region: Region): boolean {
  const forced = name ? RESIDENCY[name] ?? RESIDENCY[name.replace(/\s*\(.*\)$/, "")] : undefined;
  const lp = name && !forced ? RESIDENCY_LP[name] ?? RESIDENCY_LP[name.replace(/\s*\(.*\)$/, "")] : undefined;
  if (lp) return lp.split("+").includes(region);
  const origin = originOf(country, name);
  if (!origin) return true;
  if (origin !== HOME_ORIGIN[region]) return false;
  if (origin !== "AMER" || forced || !country) return true;
  if (region === "na") return country !== "Brazil";
  if (region === "br") return !NORTH_AMERICA.has(country);
  return true;
}

/** Étiquette de l'origine : AMER précisé en NA / BR / LATAM (règles d'import des Amériques) */
export function originLabel(origin: Origin, country?: string | null): string {
  if (origin !== "AMER" || !country) return origin;
  if (country === "Brazil") return "BR";
  if (NORTH_AMERICA.has(country)) return "NA";
  return "LATAM";
}
