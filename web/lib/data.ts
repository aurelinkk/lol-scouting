import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { League, Meta, Player, Promotion, RankingRow } from "./types";

// Fichiers générés par `python export_web.py` à la racine du dépôt
const cache = new Map<string, unknown>();

function read<T>(...parts: string[]): T {
  const file = path.join(process.cwd(), ...parts);
  if (!cache.has(file)) cache.set(file, JSON.parse(fs.readFileSync(file, "utf-8")));
  return cache.get(file) as T;
}

export const getMeta = () => read<Meta>("data", "meta.json");
export const getLeagues = () => read<League[]>("data", "leagues.json");
export const getPromotions = () => read<Promotion[]>("data", "promotions.json");
export const getPlayers = () => read<Record<string, Player>>("data", "players.json");
export const getRankings = (): RankingRow[] => {
  // Un fichier par saison ; ancien format (un seul rankings.json) accepté aussi
  const legacy = path.join(process.cwd(), "public", "data", "rankings.json");
  if (fs.existsSync(legacy)) return read<RankingRow[]>("public", "data", "rankings.json");
  return getMeta().seasons.flatMap((season) => read<RankingRow[]>("public", "data", `rankings_${season}.json`));
};

export const getPlayer = (id: string): Player | undefined => getPlayers()[id];
