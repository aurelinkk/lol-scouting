/** Liste de suivi partagée (⭐) : un joueur suivi par région, avec une note */
export interface WatchEntry {
  name: string;
  note?: string;
  /** horodatage d'ajout (ms) */
  added: number;
}
export type Watchlist = Record<string, WatchEntry>;

export const watchKey = (region: string) => `watch:${region}`;

/** Le texte d'une news concerne-t-il ce joueur ? (nom sans parenthèses, mot entier) */
export function mentions(text: string, name: string) {
  const n = name.replace(/\s*\(.*\)$/, "").trim();
  if (!n) return false;
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}([^\\p{L}\\p{N}]|$)`, "iu").test(text);
}
