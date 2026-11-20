import "server-only";
import { getRankings } from "@/lib/data";
import type { Region } from "@/lib/region";
import type { RankingRow } from "@/lib/types";

/** Stats de style de jeu comparées (z-scores parmi les joueurs du même poste et de la même saison) */
const STATS = [
  "winrate", "kda", "kp", "dpm", "dmg_share", "dmg_share_vs_champ", "gold_min", "cs_min", "vision_min",
  "deaths_pg", "assists_pg", "csd15", "gd15", "xpd15", "fb_part",
] as const;
const MIN_COMMON = 6;

export interface Similar {
  row: RankingRow;
  /** 0-100 : 100 = mêmes stats */
  proximity: number;
}

/** Les joueurs aux stats les plus proches (même poste, même saison, toutes ligues de la région) */
export function similarPlayers(region: Region, id: string, n = 5): { season: number; role: string; list: Similar[] } | null {
  const rows = getRankings(region);
  const mine = rows.filter((r) => r.id === id && r.games >= 8).sort((a, b) => b.season - a.season)[0];
  if (!mine) return null;
  const pool = rows.filter((r) => r.season === mine.season && r.role === mine.role && r.games >= 8);
  const stat = (r: RankingRow, k: string) => (r as unknown as Record<string, number | undefined>)[k];
  const norm = new Map<string, { mean: number; sd: number }>();
  for (const k of STATS) {
    const v = pool.map((r) => stat(r, k)).filter((x): x is number => typeof x === "number" && isFinite(x));
    if (v.length < 10) continue;
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length) || 1;
    norm.set(k, { mean, sd });
  }
  const z = (r: RankingRow, k: string) => {
    const x = stat(r, k);
    const s = norm.get(k);
    return typeof x === "number" && isFinite(x) && s ? (x - s.mean) / s.sd : null;
  };
  const list: Similar[] = [];
  for (const r of pool) {
    if (r.id === mine.id) continue;
    let sum = 0;
    let common = 0;
    for (const k of norm.keys()) {
      const a = z(mine, k);
      const b = z(r, k);
      if (a === null || b === null) continue;
      sum += (a - b) ** 2;
      common++;
    }
    if (common < MIN_COMMON) continue;
    const d = Math.sqrt(sum / common);
    list.push({ row: r, proximity: Math.round(100 * Math.exp(-d)) });
  }
  list.sort((a, b) => b.proximity - a.proximity);
  return { season: mine.season, role: mine.role, list: list.slice(0, n) };
}
