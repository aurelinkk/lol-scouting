// Régions analysées : Europe (racine du site) et Amérique du Nord (/na).
// Les données NA sont générées par `SCOUT_REGION=na python export_web.py`
// (web/data/na, web/public/data/na). Même code de niveaux qu'en Europe :
// "LEC" = 1re division (LCS en NA), "ERL1" = 2e division (NACL).

export type Region = "eu" | "na" | "kr" | "cn" | "lcp" | "br";
export const REGIONS: Region[] = ["eu", "na", "kr", "cn", "lcp", "br"];

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
  /** 3e division suivie (ERL2 en Europe, LCK Academy Series en Corée) */
  hasErl2: boolean;
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
    hasErl2: true,
    prospectMaxAge: 21,
  },
  na: {
    name: "Amérique du Nord",
    short: "NA",
    tiers: { LEC: "LCS", ERL1: "NACL", ERL2: "Div. 3", EM: "Tournoi international", OTHER: "Autre région" },
    top: "LCS",
    lower: "NACL (et LRN en 2026)",
    hasEm: false,
    hasLeagues: false,
    hasSoloq: false,
    hasErl2: false,
    prospectMaxAge: 23,
  },
  kr: {
    name: "Corée",
    short: "KR",
    tiers: { LEC: "LCK", ERL1: "LCK CL", ERL2: "Academy", EM: "Tournoi international", OTHER: "Autre région" },
    top: "LCK",
    lower: "LCK CL et Academy",
    hasEm: false,
    hasLeagues: false,
    hasSoloq: false,
    hasErl2: true,
    prospectMaxAge: 21,
  },
  cn: {
    name: "Chine",
    short: "CN",
    tiers: { LEC: "LPL", ERL1: "LDL / AME", ERL2: "Div. 3", EM: "Tournoi international", OTHER: "Autre région" },
    top: "LPL",
    lower: "LDL / AME / CHC",
    hasEm: false,
    hasLeagues: false,
    hasSoloq: false,
    hasErl2: false,
    prospectMaxAge: 21,
  },
  lcp: {
    name: "Pacifique",
    short: "LCP",
    tiers: { LEC: "LCP", ERL1: "PCS / VCS / LJL", ERL2: "Div. 3", EM: "Tournoi international", OTHER: "Autre région" },
    top: "LCP",
    lower: "PCS, VCS et LJL",
    hasEm: false,
    hasLeagues: false,
    hasSoloq: false,
    hasErl2: false,
    prospectMaxAge: 22,
  },
  br: {
    name: "Brésil et Amérique latine",
    short: "BR",
    tiers: { LEC: "CBLOL", ERL1: "CD / Ligas Regionales", ERL2: "Div. 3", EM: "Tournoi international", OTHER: "Autre région" },
    top: "CBLOL",
    lower: "Circuito Desafiante et Ligas Regionales",
    hasEm: false,
    hasLeagues: false,
    hasSoloq: false,
    hasErl2: false,
    prospectMaxAge: 22,
  }
};

export const tierName = (tier: string, region: Region = "eu") => REGION_INFO[region].tiers[tier] ?? tier;

export function regionFromPath(pathname: string): Region {
  for (const r of REGIONS) if (r !== "eu" && (pathname === `/${r}` || pathname.startsWith(`/${r}/`))) return r;
  return "eu";
}

/** Chemin sans le préfixe de région : "/kr/donnees" -> "/donnees" */
export const stripRegion = (pathname: string) => pathname.replace(/^\/(na|kr|cn|lcp|br)(?=\/|$)/, "") || "/";

/** Lien interne dans la région : link("na", "/donnees") -> "/na/donnees" */
export function link(region: Region, path: string): string {
  if (region === "eu") return path;
  return path === "/" ? `/${region}` : `/${region}${path}`;
}

export const playerLink = (region: Region, id: string) => link(region, `/joueurs/${id}`);

/** Identifiant d'URL d'une équipe : "Karmine Corp Blue" -> "karmine-corp-blue" */
export function teamSlug(team: string): string {
  return (
    team
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "equipe"
  );
}

export const teamLink = (region: Region, team: string) => link(region, `/equipes/${teamSlug(team)}`);

/** Fichier public (téléchargé par le navigateur) de la région */
export const publicData = (region: Region, file: string) =>
  region === "eu" ? `/data/${file}` : `/data/${region}/${file}`;
