import "server-only";
import type { MercatoTeam } from "@/components/MercatoBoard";
import { getMercato, hasRegion } from "@/lib/data";
import { type Region, REGIONS } from "@/lib/region";
import { mergeSigned, type Signed, signedAbroad, signedFromMercato } from "./signed";

/** Signatures des joueurs de `region` dans les mercatos publiés des autres régions */
export function publishedAbroad(region: Region): Record<string, Signed> {
  const teams: Partial<Record<Region, MercatoTeam[]>> = {};
  for (const r of REGIONS) if (r !== region && hasRegion(r)) teams[r] = getMercato(r)?.teams ?? [];
  return signedAbroad(teams, region);
}

/** Club de la saison suivante d'après le mercato publié de la région et ceux des autres régions */
export function publishedSigned(region: Region): Record<string, Signed> {
  return mergeSigned(signedFromMercato(getMercato(region)?.teams ?? [], region), publishedAbroad(region));
}
