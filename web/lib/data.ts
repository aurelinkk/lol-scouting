import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Region } from "./region";
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
export const getPlayers = (region: Region = "eu") => read<Record<string, Player>>(...dir(region), "players.json");
export const getRankings = (region: Region = "eu"): RankingRow[] => {
  // Un fichier par saison ; ancien format (un seul rankings.json) accepté aussi
  const legacy = path.join(process.cwd(), ...pub(region), "rankings.json");
  if (fs.existsSync(legacy)) return read<RankingRow[]>(...pub(region), "rankings.json");
  return getMeta(region).seasons.flatMap((season) => read<RankingRow[]>(...pub(region), `rankings_${season}.json`));
};

export const getPlayer = (id: string, region: Region = "eu"): Player | undefined => getPlayers(region)[id];

import type { MercatoTeam } from "@/components/MercatoBoard";
export interface Mercato {
  season: number;
  teams: MercatoTeam[];
  undecided?: { player: string; id?: string; options: string[] }[];
  /** Date de l'export (« 2026-11-18 08:10 ») : le rafraîchissement en ligne part de là */
  generated?: string;
}

export const getMercato = (region: Region = "eu"): Mercato | null => {
  const file = path.join(process.cwd(), ...dir(region), "mercato.json");
  return fs.existsSync(file) ? read<Mercato>(...dir(region), "mercato.json") : null;
};
