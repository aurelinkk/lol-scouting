import "server-only";
import { getPromotionModel, getRankings, hasRegion } from "@/lib/data";
import { fmtScore } from "@/lib/format";
import { REGION_INFO, type Region } from "@/lib/region";
import type { RankingRow } from "@/lib/types";

/**
 * Récap quotidien Discord d'une région :
 *  - top 5 par poste des joueurs de moins de MAX_AGE ans hors 1re division (score) ;
 *  - top 5 des progressions d'un split à l'autre (sinon d'une saison à l'autre).
 */
const MAX_AGE = 25;
const MIN_GAMES = 10;
const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"];
const short = (n: string) => n.replace(/\s*\(.*\)$/, "");

export function digestMessages(region: Region, siteUrl?: string): string[] {
  if (!hasRegion(region)) return [];
  const R = REGION_INFO[region];
  const rows = getRankings(region);
  const season = Math.max(...rows.map((r) => r.season));
  const model = getPromotionModel();
  const chance = (id: string) => model?.players[region]?.[id]?.p;
  const pool = rows.filter(
    (r) => r.season === season && r.tier !== "LEC" && !r.played_lec && r.games >= MIN_GAMES && r.age !== undefined && r.age < MAX_AGE,
  );
  const link = (r: RankingRow) => (siteUrl ? `[${short(r.name)}](<${siteUrl}${region === "eu" ? "" : `/${region}`}/joueurs/${r.id}>)` : `**${short(r.name)}**`);
  const line = (r: RankingRow, extra = "") => {
    const c = chance(r.id);
    const o = model?.players[region]?.[r.id]?.official;
    const signed = o ? ` · ${o.rumor ? "→" : "✓"} ${o.team ?? R.top}${o.rumor ? " (rumeur)" : ""}` : "";
    return `${link(r)} · ${r.current_team ?? r.team} (${r.league_code}) · ${r.age} ans · **${fmtScore(r.final)}**${c !== undefined ? ` · montée ${Math.round(c * 100)} %` : ""}${signed}${extra}`;
  };

  const top: string[] = [`## 🏆 ${R.name} — top 5 par poste (moins de ${MAX_AGE} ans, hors ${R.top}) · ${season}`];
  for (const role of ROLES) {
    const list = pool.filter((r) => r.role === role).sort((a, b) => b.final - a.final).slice(0, 5);
    if (!list.length) continue;
    top.push(`**${role}**`);
    list.forEach((r, i) => top.push(`${i + 1}. ${line(r)}`));
  }

  const bySplit = pool.filter((r) => typeof r.split_progress === "number");
  const prog: string[] = [];
  if (bySplit.length >= 5) {
    prog.push(`## 📈 ${R.name} — plus fortes progressions depuis le split précédent`);
    bySplit
      .sort((a, b) => b.split_progress! - a.split_progress!)
      .slice(0, 5)
      .forEach((r, i) =>
        prog.push(`${i + 1}. ${line(r, ` · ${r.form_prev_split} → ${r.form_split} : **${fmtScore(r.split_progress!)}**`)}`),
      );
  } else {
    prog.push(`## 📈 ${R.name} — plus fortes progressions depuis la saison précédente`);
    pool
      .filter((r) => typeof r.trend === "number")
      .sort((a, b) => b.trend! - a.trend!)
      .slice(0, 5)
      .forEach((r, i) => prog.push(`${i + 1}. ${line(r, ` · ${r.trend_prev ?? season - 1} → ${season} : **${fmtScore(r.trend!)}**`)}`));
  }
  // Discord : 2000 caractères par message
  const out: string[] = [];
  for (const block of [top, prog]) {
    let msg = "";
    for (const l of block) {
      if ((msg + "\n" + l).length > 1900) {
        out.push(msg);
        msg = "";
      }
      msg = msg ? `${msg}\n${l}` : l;
    }
    if (msg) out.push(msg);
  }
  return out;
}
