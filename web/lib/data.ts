import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Region } from "./region";
import { ageFrom, withCurrentAge } from "./age";
import type { League, Meta, Player, Promotion, RankingRow } from "./types";

// Fichiers générés par `python export_web.py` à la racine du dépôt
const cache = new Map<string, unknown>();

function read<T>(...parts: string[]): T {
  const file = path.join(process.cwd(), ...parts);
  if (!cache.has(file)) cache.set(file, JSON.parse(fs.readFileSync(file, "utf-8")));
  return cache.get(file) as T;
}

// Europe : data/ ; Amérique du Nord : data/na/
const dir = (region: Region) => (region === "eu" ? ["data"] : ["data", region]);
const pub = (region: Region) => (region === "eu" ? ["public", "data"] : ["public", "data", region]);

/** La région a-t-elle été exportée ? (SCOUT_REGION=na python export_web.py) */
export const hasRegion = (region: Region) =>
  fs.existsSync(path.join(process.cwd(), ...dir(region), "meta.json"));

export const getMeta = (region: Region = "eu") => read<Meta>(...dir(region), "meta.json");
export const getLeagues = (region: Region = "eu") => read<League[]>(...dir(region), "leagues.json");
export const getPromotions = (region: Region = "eu") => read<Promotion[]>(...dir(region), "promotions.json");
const agesDone = new Set<string>();
export const getPlayers = (region: Region = "eu") => {
  const players = read<Record<string, Player>>(...dir(region), "players.json");
  // Âge actuel (l'export donne l'âge le jour de l'export)
  if (!agesDone.has(`p-${region}`)) {
    agesDone.add(`p-${region}`);
    for (const p of Object.values(players)) {
      const a = ageFrom(p.birthdate);
      if (a !== undefined && !p.age_approx) p.age = a;
    }
  }
  return players;
};
export const getRankings = (region: Region = "eu"): RankingRow[] => {
  // Un fichier par saison ; ancien format (un seul rankings.json) accepté aussi
  const legacy = path.join(process.cwd(), ...pub(region), "rankings.json");
  const rows = fs.existsSync(legacy)
    ? read<RankingRow[]>(...pub(region), "rankings.json")
    : getMeta(region).seasons.flatMap((season) => read<RankingRow[]>(...pub(region), `rankings_${season}.json`));
  // Saison en cours : âge actuel (date de naissance de la ligne, sinon de la fiche joueur)
  if (!agesDone.has(`r-${region}`)) {
    agesDone.add(`r-${region}`);
    const needsPlayers = rows.some((r) => !r.birthdate && !r.age_approx);
    const births: Record<string, string | undefined> = {};
    if (needsPlayers) for (const p of Object.values(getPlayers(region))) if (!p.age_approx) births[p.id] = p.birthdate;
    withCurrentAge(rows, births, (r) => r.id);
  }
  return rows;
};

/** Effectifs par saison et par tournoi (fichier public, lu aussi côté serveur) */
export interface RosterBlock {
  season: number;
  league_code: string;
  tier: string;
  tournament: string;
  start?: string;
  teams: { team: string; logo: string | null; players: { id: string; name: string; role: string; games: number; photo: string | null }[] }[];
}
export const getRosters = (region: Region = "eu"): RosterBlock[] => {
  const file = path.join(process.cwd(), ...pub(region), "rosters.json");
  return fs.existsSync(file) ? read<RosterBlock[]>(...pub(region), "rosters.json") : [];
};

export const getPlayer = (id: string, region: Region = "eu"): Player | undefined => getPlayers(region)[id];

import type { MercatoTeam } from "@/components/MercatoBoard";
/** Ligne du fil « Nouveautés » (export Python : dernières semaines, par ligue) */
export interface MercatoNews {
  date: string;
  league: string;
  team: string;
  text: string;
  url: string | null;
  official: boolean;
}

export interface Mercato {
  season: number;
  news?: MercatoNews[];
  teams: MercatoTeam[];
  undecided?: { player: string; id?: string; options: string[] }[];
  /** Date de l'export (« 2026-11-18 08:10 ») : le rafraîchissement en ligne part de là */
  generated?: string;
}

export const getMercato = (region: Region = "eu"): Mercato | null => {
  const file = path.join(process.cwd(), ...dir(region), "mercato.json");
  return fs.existsSync(file) ? read<Mercato>(...dir(region), "mercato.json") : null;
};
