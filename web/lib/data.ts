import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Region } from "./region";
import { ageFrom, withCurrentAge } from "./age";
import type { League, Meta, Player, Promotion, RankingRow } from "./types";
import type { TeamMatch, TeamResult } from "@/components/TeamHistory";

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

/** Résultats par tournoi et parties des équipes (team_history.py), si exportés */
export const getTeamResults = (region: Region = "eu"): TeamResult[] | null => {
  const file = path.join(process.cwd(), ...dir(region), "results.json");
  return fs.existsSync(file) ? read<TeamResult[]>(...dir(region), "results.json") : null;
};
export const getTeamMatches = (region: Region = "eu"): TeamMatch[] | null => {
  const file = path.join(process.cwd(), ...dir(region), "matches.json");
  return fs.existsSync(file) ? read<TeamMatch[]>(...dir(region), "matches.json") : null;
};

/** Modèle de montée (python promotion_model.py), toutes régions */
export interface PromotionModel {
  generated: string;
  season: number;
  target: number;
  trained_on: number[];
  model?: string;
  lambda?: number;
  validated_on?: number[];
  old_seasons?: { seasons: number[]; weight: number };
  logit_validation?: PromotionModel["validation"];
  logit_forward?: PromotionModel["validation"];
  validation: { n: number; promoted: number; auc: number; logloss: number; brier: number; top3_share: number; top1_share: number };
  forward: PromotionModel["validation"];
  baseline: PromotionModel["validation"];
  calibration: { from: number; to: number; n: number; predicted: number; observed: number }[];
  coefficients: { name: string; key: string; coef: number }[];
  role_rates: Record<string, Record<string, { eligible: number; promoted: number; rate: number | null; top3_rate: number | null; per_season: number }>>;
  role_profiles: Record<string, { promoted: number; others: number; age_up: number; age_stay: number; diffs: [string, number][] }>;
  history?: Partial<Record<Region, Record<string, Record<string, [number, number]>>>>;
  live: { known: number; median_p: number | null; in_top3: number; in_top5?: number; players: { region: Region; id: string; p: number; rank_role: number; team?: string }[] };
  players: Partial<Record<Region, Record<string, PromotionChance>>>;
  /** Modèle 3e -> 2e division (même format) */
  tier2?: PromotionModel;
}
export interface PromotionChance {
  p: number;
  rank_role: number;
  score_rank: number;
  factors: [string, number][];
  /** Ce qui lui manque : [phrase, gain de probabilité] si cette variable atteignait le niveau des montés de son poste */
  gaps?: [string, number][];
  /** Probabilité si tous ces manques étaient comblés */
  ceiling?: number;
  /** Freins hors de son contrôle (âge, import, 3e division) */
  brakes?: string[];
  /** Montée déjà annoncée (officielle ou rumeur), éventuellement dans une autre région */
  official?: { team?: string; mid?: boolean; league?: string; rumor?: boolean };
}
export const getPromotionModel = (): PromotionModel | null => {
  const file = path.join(process.cwd(), "data", "promotion_model.json");
  return fs.existsSync(file) ? read<PromotionModel>("data", "promotion_model.json") : null;
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
