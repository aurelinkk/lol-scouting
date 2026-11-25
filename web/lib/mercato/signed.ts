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
      const kind = s.right === "in" ? "official" : s.status === "inchangé" ? "contract" : "rumor";
      for (const p of [s.after, ...(s.after_extra ?? [])]) {
        if (!p?.id || p.region) continue; // fiche d'une autre région : autre espace d'identifiants
        out[p.id] = { team: t.team, league: t.league, official: kind === "official", kind,
                      stays: !!s.before && s.before.id === p.id,
                      tier: asTier(t.tier) };
      }
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

/**
 * Signatures dans une autre région : un joueur de `region` qui apparaît comme
 * arrivée dans le mercato d'une autre région (Noah, GIANTX -> BNK FEARX en LCK).
 * Utile quand il n'est plus dans le mercato de sa région (mis sur le banc avant
 * la fin de saison, sa case part de son remplaçant).
 */
export function signedAbroad(teamsByRegion: Partial<Record<Region, MercatoTeam[]>>, region: Region): Record<string, Signed> {
  const out: Record<string, Signed> = {};
  for (const [r, teams] of Object.entries(teamsByRegion) as [Region, MercatoTeam[]][]) {
    if (r === region) continue;
    for (const t of teams ?? [])
      for (const s of t.slots)
        for (const p of [s.after, ...(s.after_extra ?? [])]) {
          if (!p?.id || p.region !== region) continue;
          const kind = s.right === "in" ? "official" : "rumor";
          if (out[p.id]?.official && kind !== "official") continue;
          out[p.id] = { team: `${t.team} (${t.league})`, league: t.league, official: kind === "official", kind, stays: false, tier: asTier(t.tier) };
        }
  }
  return out;
}

/** Fusion : une signature officielle à l'étranger l'emporte sur une rumeur ou un contrat chez soi */
export function mergeSigned(own: Record<string, Signed>, abroad: Record<string, Signed>): Record<string, Signed> {
  const out = { ...own };
  for (const [id, a] of Object.entries(abroad)) {
    const o = out[id];
    if (!o || (a.official && !o.official) || (a.official && o.kind === "contract")) out[id] = a;
  }
  return out;
}

/** Départ d'un joueur de son club au mercato (remplacé, libéré, retraite), officiel ou rumeur.
 *  Officiel si la case le dit ou si le fil des nouveautés l'a annoncé (« Daglas quitte Team Heretics »). */
export function departureFromMercato(
  mercato: { teams: MercatoTeam[]; news?: { team: string; text: string; official: boolean }[] } | null,
  id: string,
): { team: string; tier?: string; official: boolean } | undefined {
  for (const t of mercato?.teams ?? []) {
    for (const s of t.slots) {
      const b = s.before;
      if (!b?.id || b.region || b.id !== id || s.after?.id === id) continue;
      if (!s.after && !["out", "rumor_out", "fa", "retired"].includes(s.left ?? "")) continue;
      const official =
        s.left === "out" || s.left === "fa" || s.left === "retired" || s.status.includes("confirmé") ||
        (mercato?.news ?? []).some((n) => n.official && n.team === t.team && n.text === `${b.name} quitte ${t.team}`);
      return { team: t.team, tier: t.tier, official };
    }
  }
  return undefined;
}

/** Fin de contrat (GCD) de chaque joueur avec son club de la saison passée */
export interface ContractEnd {
  team: string;
  /** date ISO, ex « 2027-11-15 » : sous contrat pour la saison 2027 */
  end: string;
}

export function contractsFromMercato(teams: MercatoTeam[]): Record<string, ContractEnd> {
  const out: Record<string, ContractEnd> = {};
  for (const t of teams)
    for (const s of t.slots)
      if (s.before?.id && !s.before.region && s.before_end) out[s.before.id] = { team: t.team, end: s.before_end };
  return out;
}
