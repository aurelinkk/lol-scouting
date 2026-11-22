import { fmtStat, STAT_LABELS } from "./format";
import type { PlayerLine, StatKey } from "./types";

/**
 * Profil de jeu d'un joueur à partir de ses percentiles (comparé aux joueurs du
 * même poste dans sa ligue) : grandes familles de stats et points forts / faibles
 * rédigés, avec les stats qui comptent le plus à chaque poste.
 */

export const CATEGORIES: { key: string; label: string; stats: StatKey[]; hint: string }[] = [
  { key: "lane", label: "Phase de lane", stats: ["csd15", "gd15", "xpd15", "ahead_cs15"], hint: "écarts de CS, gold et XP à 15 min" },
  { key: "dmg", label: "Dégâts", stats: ["dpm", "dpm_vs_champ", "dmg_share", "dmg_share_vs_champ"], hint: "dégâts par minute et part des dégâts, à champion égal" },
  { key: "team", label: "Jeu d'équipe", stats: ["kp", "ka15", "fb_part", "assists_pg"], hint: "participation aux kills, early game, first blood" },
  { key: "farm", label: "Ressources", stats: ["cs_min", "gold_min", "gold_share"], hint: "farm et part du gold" },
  { key: "safe", label: "Sécurité", stats: ["deaths_pg", "fb_victim", "kda"], hint: "morts, first blood subis, KDA" },
  { key: "vision", label: "Vision", stats: ["vision_min", "cw_min", "wards_killed_min"], hint: "vision, control wards, wards détruites" },
  { key: "win", label: "Résultats", stats: ["winrate"], hint: "win rate" },
];

/** Stats clés par poste (comptent davantage dans les points forts / faibles) */
const ROLE_KEYS: Record<string, StatKey[]> = {
  Top: ["csd15", "gd15", "xpd15", "dmg_share", "dpm_vs_champ", "deaths_pg", "gold_share"],
  Jungle: ["kp", "ka15", "fb_part", "xpd15", "gd15", "vision_min", "deaths_pg"],
  Mid: ["csd15", "gd15", "xpd15", "dpm", "dmg_share", "kp", "cs_min"],
  Bot: ["cs_min", "dpm", "dmg_share", "gold_share", "csd15", "gd15", "deaths_pg"],
  Support: ["kp", "vision_min", "ka15", "fb_part", "deaths_pg", "assists_pg", "xpd15"],
};

/** Phrase de scout pour une stat (point fort / point faible) */
const PHRASES: Partial<Record<StatKey, [string, string]>> = {
  csd15: ["Gagne sa lane au farm", "Perd du farm en lane"],
  gd15: ["Prend de l'avance en gold tôt", "Souvent en retard en gold à 15 min"],
  xpd15: ["Avance en niveaux en early game", "En retard d'XP en early game"],
  ahead_cs15: ["Souvent devant en CS à 15 min", "Rarement devant en CS à 15 min"],
  dpm: ["Gros dégâts par minute", "Dégâts par minute faibles"],
  dpm_vs_champ: ["Fait plus de dégâts que la moyenne sur les mêmes champions", "Moins de dégâts que la moyenne sur ses champions"],
  dmg_share: ["Porte une grosse part des dégâts de l'équipe", "Faible part des dégâts de l'équipe"],
  dmg_share_vs_champ: ["Part des dégâts élevée à champion égal", "Part des dégâts faible à champion égal"],
  kp: ["Présent sur presque tous les kills", "Peu impliqué dans les kills de l'équipe"],
  ka15: ["Très actif en early game (kills + assists à 15 min)", "Peu d'impact sur la carte avant 15 min"],
  fb_part: ["Souvent sur le first blood", "Rarement impliqué dans le first blood"],
  assists_pg: ["Beaucoup d'assists", "Peu d'assists"],
  cs_min: ["Excellent farm", "Farm en dessous de la moyenne"],
  gold_min: ["Génère beaucoup de gold", "Génère peu de gold"],
  gold_share: ["Utilise beaucoup de ressources", "Joue avec peu de ressources"],
  deaths_pg: ["Meurt rarement", "Meurt souvent"],
  fb_victim: ["Rarement victime du first blood", "Souvent victime du first blood"],
  kda: ["Très bon KDA", "KDA faible"],
  vision_min: ["Très bon contrôle de vision", "Vision en dessous de la moyenne"],
  cw_min: ["Achète beaucoup de control wards", "Peu de control wards"],
  wards_killed_min: ["Détruit beaucoup de wards", "Détruit peu de wards"],
  winrate: ["Gagne beaucoup", "Win rate faible"],
  champions: ["Large champion pool", "Champion pool restreint"],
};

export interface ProfileItem {
  stat: StatKey;
  label: string;
  value: string;
  pct: number;
  key: boolean;
  text: string;
}

export function playerProfile(line: PlayerLine) {
  const keys = new Set(ROLE_KEYS[line.role] ?? []);
  const items: ProfileItem[] = [];
  for (const [stat, peer] of Object.entries(line.peers)) {
    if (stat === "n" || typeof peer !== "object" || !peer) continue;
    const s = stat as StatKey;
    const phrase = PHRASES[s];
    if (!phrase || line[s] === undefined) continue;
    items.push({
      stat: s,
      label: STAT_LABELS[s] ?? s,
      value: fmtStat(s, line[s]),
      pct: peer.pct,
      key: keys.has(s),
      text: "",
    });
  }
  // Stats clés du poste en priorité (bonus de 5 points de percentile)
  const strengths = items
    .filter((x) => x.pct >= 0.7)
    .sort((a, b) => b.pct + (b.key ? 0.05 : 0) - (a.pct + (a.key ? 0.05 : 0)))
    .slice(0, 4)
    .map((x) => ({ ...x, text: PHRASES[x.stat]![0] }));
  const weaknesses = items
    .filter((x) => x.pct <= 0.35)
    .sort((a, b) => a.pct - (a.key ? 0.05 : 0) - (b.pct - (b.key ? 0.05 : 0)))
    .slice(0, 3)
    .map((x) => ({ ...x, text: PHRASES[x.stat]![1] }));

  const categories = CATEGORIES.map((c) => {
    const pcts = c.stats.map((s) => line.peers[s]?.pct).filter((p): p is number => p !== undefined);
    return { ...c, pct: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null, n: pcts.length };
  }).filter((c) => c.pct !== null) as ((typeof CATEGORIES)[number] & { pct: number; n: number })[];

  return { strengths, weaknesses, categories };
}
