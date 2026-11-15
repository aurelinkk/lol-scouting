import type { StatKey } from "./types";

export const STAT_LABELS: Record<StatKey, string> = {
  winrate: "Win rate",
  kda: "KDA",
  cs_min: "CS/min",
  gold_min: "Gold/min",
  dpm: "DMG/min",
  kp: "Kill participation",
  dmg_share: "DMG %",
  dpm_vs_champ: "DMG/min vs champion",
  dmg_share_vs_champ: "DMG % vs champion",
  gold_share: "Gold %",
  vision_min: "Vision/min",
  deaths_pg: "Morts/partie",
  assists_pg: "Assists/partie",
  champions: "Champions joués",
  csd15: "CS diff @15",
  gd15: "Gold diff @15",
  xpd15: "XP diff @15",
  ahead_cs15: "Devant en CS @15",
  fb_part: "First blood (participation)",
  fb_victim: "First blood (victime)",
};

const PERCENT: StatKey[] = ["winrate", "kp", "dmg_share", "gold_share", "ahead_cs15", "fb_part", "fb_victim"];
const SIGNED: StatKey[] = ["csd15", "gd15", "xpd15", "dpm_vs_champ"];

export function fmtStat(stat: StatKey, value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "–";
  if (stat === "dmg_share_vs_champ") return `${value > 0 ? "+" : ""}${(value * 100).toFixed(1)} %`;
  if (PERCENT.includes(stat)) return `${(value * 100).toFixed(1)} %`;
  if (SIGNED.includes(stat)) return `${value > 0 ? "+" : ""}${Math.round(value)}`;
  if (Math.abs(value) >= 100) return Math.round(value).toString();
  return value.toFixed(2);
}

export function fmtScore(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "–";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

export function topPercent(percentile: number | undefined): string {
  if (percentile === undefined) return "–";
  return `top ${Math.max(1, Math.round((1 - percentile) * 100))} %`;
}

export const TIER_LABEL: Record<string, string> = {
  LEC: "LEC",
  EM: "EMEA Masters",
  ERL1: "ERL1",
  ERL2: "ERL2",
};
