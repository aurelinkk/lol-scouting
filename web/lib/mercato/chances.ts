import "server-only";
import type { MercatoPlayer, MercatoTeam } from "@/components/MercatoBoard";
import { getMercato, getPlayers, getPromotionModel, hasRegion, type Mercato } from "@/lib/data";
import { getStore } from "@/lib/deep/store";
import { IMPORT_LIMIT } from "@/lib/needs";
import { isResident, originOf } from "@/lib/origin";
import { type Region, REGIONS } from "@/lib/region";
import type { LiveMercato } from "./live";
import { mergeSigned, signedAbroad, signedFromMercato } from "./signed";

/**
 * Chances « en direct » : la chance du modèle (profil seul, comme au début du
 * mercato) corrigée par le mercato en cours.
 *
 *   direct = base × Σ régions [ part des destinations × places encore libres ]
 *
 * - part des destinations : où partent, historiquement, les joueurs de sa région
 *   et de son origine quand ils décrochent une place en 1re division (un Européen
 *   d'ERL : 85 % LEC, 9 % LCS... ; un Coréen basé en Europe : plusieurs régions) ;
 * - places encore libres : postes de 1re division sans joueur prévu à son poste,
 *   rapportés aux places qui changent de titulaire une année normale (rotation) ;
 *   une place prise par une rumeur compte pour un quart (la rumeur peut tomber).
 *   S'il n'est pas résident de la région, seulement dans les équipes qui ont
 *   encore une place d'import (aucune en LCK).
 * - une signature officielle tranche : 100 % en 1re division, presque 0 en dessous ;
 *   une rumeur en 1re division donne au moins 70 %.
 */
export interface LiveChance {
  /** chance du modèle (profil seul) et chance corrigée par le mercato */
  base: number;
  p: number;
  /** pourquoi : « signé », « rumeur », « places libres » */
  why: string;
  /** détail par région de destination : part historique, places libres / rotation */
  dest?: { region: Region; share: number; open: number; rotation: number }[];
}
export interface LiveChances {
  generated: number;
  up: Record<string, LiveChance>;
  stay: Record<string, LiveChance>;
}

const RUMOR_FLOOR = 0.7;
/** Une place prise par une simple rumeur reste un peu ouverte (la rumeur peut tomber) */
const RUMOR_OPEN = 0.25;

async function liveMercato(region: Region): Promise<Mercato | null> {
  const published = getMercato(region);
  try {
    const live = await getStore().get<LiveMercato>(`mercato:live:${region}`);
    if (live && live.mercato.generated === published?.generated) return live.mercato;
  } catch {
    // pas de stockage : mercato publié
  }
  return published;
}

/** Places libres de 1re division par poste, pour les résidents et pour les imports */
function openSeats(region: Region, teams: MercatoTeam[]) {
  const out: Record<string, { resident: number; imports: number }> = {};
  const countryOf = (p: MercatoPlayer) => (p.id ? getPlayers((p.region as Region) ?? region)[p.id]?.country : undefined);
  for (const t of teams) {
    if (t.tier !== "LEC") continue;
    const roster = t.slots.filter((s) => s.after).map((s) => s.after!);
    const imports = roster.filter((p) => !isResident(countryOf(p), p.name, region)).length;
    const importOk = imports < IMPORT_LIMIT[region];
    for (const s of t.slots) {
      const w = !s.after ? 1 : s.status.includes("rumeur") ? RUMOR_OPEN : 0;
      if (!w) continue;
      const o = (out[s.role] ??= { resident: 0, imports: 0 });
      o.resident += w;
      if (importOk) o.imports += w;
    }
  }
  return out;
}

export async function computeLiveChances(region: Region): Promise<LiveChances | null> {
  const model = getPromotionModel();
  const market = model?.market;
  if (!model || !market) return null;
  const regions = REGIONS.filter((r) => hasRegion(r));
  const mercatos = Object.fromEntries(await Promise.all(regions.map(async (r) => [r, await liveMercato(r)] as const))) as Record<Region, Mercato | null>;
  const seats = Object.fromEntries(regions.map((r) => [r, openSeats(r, mercatos[r]?.teams ?? [])])) as Record<Region, ReturnType<typeof openSeats>>;
  const signed = mergeSigned(
    signedFromMercato(mercatos[region]?.teams ?? [], region),
    signedAbroad(Object.fromEntries(regions.map((r) => [r, mercatos[r]?.teams ?? []])), region),
  );
  const players = getPlayers(region);

  const chance = (id: string, base: number, level: "low" | "top"): LiveChance | null => {
    const pl = players[id];
    if (!pl) return null;
    const sg = signed[id];
    // Ce que le mercato dit déjà
    if (sg) {
      const top = sg.tier === "LEC";
      if (sg.kind === "official" || (sg.kind === "contract" && top)) {
        if (top) return { base, p: 1, why: sg.stays ? `reste à ${sg.team}` : `signé : ${sg.team}` };
        if (sg.tier) return { base, p: 0.02, why: `${sg.stays ? "reste" : "signé"} en division inférieure : ${sg.team}` };
      } else if (sg.kind === "contract") {
        // sous contrat en division inférieure : un rachat reste possible, le calcul s'applique
      } else if (top) {
        // rumeur : au moins 70 %, plus si son profil le justifie (calcul ci-dessous)
      } else if (sg.tier) {
        base = Math.min(base, 0.3); // rumeur en division inférieure
      }
    }
    const role = pl.role;
    const originKey = isResident(pl.country, pl.name, region) ? "home" : originOf(pl.country, pl.name) ?? "home";
    const shares = (market.destinations[`${region}|${originKey}|${level}`] ?? market.destinations[`${region}|home|${level}`])?.to ?? { [region]: 1 };
    const dest: NonNullable<LiveChance["dest"]> = [];
    let factor = 0;
    for (const [r, share] of Object.entries(shares) as [Region, number][]) {
      if (!seats[r]) continue;
      const rot = market.rotation[r]?.[role] ?? 5;
      const s = seats[r][role] ?? { resident: 0, imports: 0 };
      const open = isResident(pl.country, pl.name, r) ? s.resident : s.imports;
      factor += share * Math.min(1, open / rot);
      dest.push({ region: r, share, open, rotation: rot });
    }
    let p = base * factor;
    let why = "places encore libres";
    if (sg && sg.tier === "LEC" && sg.kind === "rumor") {
      p = Math.max(p, RUMOR_FLOOR, base);
      why = `rumeur : ${sg.team}`;
    } else if (sg && sg.tier && sg.tier !== "LEC") {
      why = `rumeur en division inférieure : ${sg.team}`;
    }
    return { base, p: Math.round(p * 1000) / 1000, why, dest: dest.sort((a, b) => b.share - a.share).slice(0, 4) };
  };

  const up: Record<string, LiveChance> = {};
  for (const [id, c] of Object.entries(model.players[region] ?? {})) {
    const x = chance(id, c.p, "low");
    if (x) up[id] = x;
  }
  const stay: Record<string, LiveChance> = {};
  for (const [id, c] of Object.entries(model.stay?.players[region] ?? {})) {
    const sg = signed[id];
    // encore à sa place (contrat, prolongation) : le profil suffit, le siège est pris
    if (sg?.stays && sg.tier === "LEC") {
      stay[id] = { base: c.p, p: sg.kind === "rumor" ? Math.max(c.p, 0.8) : 1, why: sg.kind === "rumor" ? `rumeur : reste à ${sg.team}` : `reste à ${sg.team}` };
      continue;
    }
    const x = chance(id, c.p, "top");
    if (x) stay[id] = x;
  }
  return { generated: Date.now(), up, stay };
}
