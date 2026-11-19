/** Le mercato en ligne est relancé automatiquement à l'ouverture d'une page au-delà de ce délai */
export const AUTO_REFRESH_MS = 20 * 60 * 1000;

export function isStale(live: { updatedAt: number; mercato: { generated?: string } } | null | undefined, generated?: string) {
  return !live || live.mercato.generated !== generated || Date.now() - live.updatedAt > AUTO_REFRESH_MS;
}
