import "server-only";

// Hôtes surchargeables pour les tests (serveur Riot factice)
const REGION = process.env.RIOT_REGION_URL ?? "https://europe.api.riotgames.com";

export class RateLimited extends Error {
  constructor(public retryAfter: number) {
    super(`Limite Riot : réessayer dans ${retryAfter}s`);
  }
}

let last = 0;
/** GET Riot avec la clé (variable secrète Vercel RIOT_API_KEY), 20 req/s max. */
export async function riot<T>(path: string, params?: Record<string, string | number>): Promise<T | null> {
  const key = process.env.RIOT_API_KEY;
  if (!key) throw new Error("RIOT_API_KEY n'est pas configurée sur Vercel");
  const wait = last + 60 - Date.now(); // ~16 req/s, sous la limite de 20/s
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const url = new URL(REGION + path);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { "X-Riot-Token": key }, cache: "no-store" });
  if (res.status === 404) return null;
  if (res.status === 429) throw new RateLimited(Number(res.headers.get("Retry-After") ?? 60));
  if (res.status === 401 || res.status === 403) throw new Error("Clé Riot refusée (expirée ou régénérée ?)");
  if (!res.ok) throw new Error(`API Riot : erreur ${res.status}`);
  return (await res.json()) as T;
}
