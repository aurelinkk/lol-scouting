// Régions analysées : Europe (racine du site) et Amérique du Nord (/na).
// Les données NA sont générées par `SCOUT_REGION=na python export_web.py`
// (web/data/na, web/public/data/na). Même code de niveaux qu'en Europe :
// "LEC" = 1re division (LCS en NA), "ERL1" = 2e division (NACL).

export type Region = "eu" | "na";
export const REGIONS: Region[] = ["eu", "na"];

export interface RegionInfo {
  name: string;
  short: string;
  /** Nom affiché de chaque niveau */
  tiers: Record<string, string>;
  top: string;
  /** Les divisions inférieures, au pluriel (« ERL », « NACL ») */
  lower: string;
  hasEm: boolean;
  hasLeagues: boolean;
  hasSoloq: boolean;
  /** Âge max des « meilleurs prospects » (la NACL est plus âgée que les ERL) */
  prospectMaxAge: number;
}

export const REGION_INFO: Record<Region, RegionInfo> = {
  eu: {
    name: "Europe",
    short: "EU",
    tiers: { LEC: "LEC", ERL1: "ERL1", ERL2: "ERL2", EM: "EMEA Masters", OTHER: "Autre région" },
    top: "LEC",
    lower: "ERL",
    hasEm: true,
    hasLeagues: true,
    hasSoloq: true,
    prospectMaxAge: 21,
  },
  na: {
    name: "Amérique du Nord",
    short: "NA",
    tiers: { LEC: "LCS", ERL1: "NACL", ERL2: "Div. 3", EM: "Tournoi international", OTHER: "Autre région" },
    top: "LCS",
    lower: "NACL",
    hasEm: false,
    hasLeagues: false,
    hasSoloq: false,
    prospectMaxAge: 23,
  },
};

export const tierName = (tier: string, region: Region = "eu") => REGION_INFO[region].tiers[tier] ?? tier;

export function regionFromPath(pathname: string): Region {
  return pathname === "/na" || pathname.startsWith("/na/") ? "na" : "eu";
}

/** Lien interne dans la région : link("na", "/donnees") -> "/na/donnees" */
export function link(region: Region, path: string): string {
  if (region === "eu") return path;
  return path === "/" ? "/na" : `/na${path}`;
}

export const playerLink = (region: Region, id: string) => link(region, `/joueurs/${id}`);

/** Fichier public (téléchargé par le navigateur) de la région */
export const publicData = (region: Region, file: string) => (region === "eu" ? `/data/${file}` : `/data/na/${file}`);
