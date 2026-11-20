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

export function originOf(country?: string | null): Origin | null {
  if (!country) return null;
  if (country === "South Korea") return "KR";
  if (country === "China") return "LPL";
  if (AMER.has(country)) return "AMER";
  if (LCP.has(country)) return "LCP";
  return "EMEA";
}

/** Grande région « locale » des ligues d'une région du site */
export const HOME_ORIGIN: Record<Region, Origin> = { eu: "EMEA", na: "AMER", kr: "KR" };
