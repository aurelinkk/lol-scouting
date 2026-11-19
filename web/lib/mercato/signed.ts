import type { MercatoTeam } from "@/components/MercatoBoard";
import type { Region } from "@/lib/region";

/** Joueur qui a déjà un club pour la saison suivante d'après le mercato */
export interface Signed {
  team: string;
  league: string;
  official: boolean;
  /** official : annonce du club ; rumor : rumeur (Sheep, X...) ; contract : toujours sous contrat, sans rumeur */
  kind: "official" | "rumor" | "contract";
  /** Reste dans son club (prolongation, sous contrat) */
  stays: boolean;
  /** Niveau du club de destination (LEC = 1re division, ERL1 = 2e) quand il est connu */
  tier?: "LEC" | "ERL1" | "ERL2";
}

const TOP_LEAGUES = new Set(["LEC", "LCS", "LCK"]);
const asTier = (t?: string) => (t === "LEC" || t === "ERL1" || t === "ERL2" ? t : undefined);

/** id du joueur (dans cette région) -> son club de la saison suivante */
export function signedFromMercato(teams: MercatoTeam[], region: Region): Record<string, Signed> {
  const out: Record<string, Signed> = {};
  for (const t of teams) {
    for (const s of t.slots) {
      const p = s.after;
      if (!p?.id || p.region) continue; // fiche d'une autre région : autre espace d'identifiants
      const kind = s.right === "in" ? "official" : s.status === "inchangé" ? "contract" : "rumor";
      out[p.id] = { team: t.team, league: t.league, official: kind === "official", kind,
                    stays: !!s.before && s.before.id === p.id,
                    tier: asTier(t.tier) };
    }
  }
  // Partis vers un club connu, y compris dans une autre région (ex : Naak Nako -> LYON en LCS)
  for (const t of teams) {
    for (const s of t.slots) {
      const p = s.before;
      if (!p?.id || p.region || out[p.id] || !s.to?.team) continue;
      const official = s.status.includes("confirmé");
      out[p.id] = {
        team: s.to.region && s.to.region !== region && s.to.league ? `${s.to.team} (${s.to.league})` : s.to.team,
        league: s.to.league ?? "",
        official,
        kind: official ? "official" : "rumor",
        stays: false,
        tier: asTier(s.to.tier) ?? (s.to.league && TOP_LEAGUES.has(s.to.league) ? "LEC" : undefined),
      };
    }
  }
  return out;
}
