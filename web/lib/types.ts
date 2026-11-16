export type Role = "Top" | "Jungle" | "Mid" | "Bot" | "Support";
export const ROLES: Role[] = ["Top", "Jungle", "Mid", "Bot", "Support"];

export type StatKey =
  | "winrate" | "kda" | "cs_min" | "gold_min" | "dpm" | "kp" | "dmg_share"
  | "gold_share" | "vision_min" | "deaths_pg" | "assists_pg" | "champions"
  | "dpm_vs_champ" | "dmg_share_vs_champ"
  | "csd15" | "gd15" | "xpd15" | "ahead_cs15" | "fb_part" | "fb_victim";

/** Une ligne du classement (un joueur, une saison, sa ligue principale). */
export interface RankingRow extends Partial<Record<StatKey, number>> {
  id: string;
  name: string;
  season: number;
  role: Role;
  team: string;
  league_code: string;
  tier: string;
  age?: number;
  games: number;
  final: number;
  league_score: number;
  league_score_raw?: number;
  sample_factor?: number;
  league_bonus: number;
  em_score?: number;
  em_score_raw?: number;
  soloq_bonus?: number;
  soloq_riot_id?: string;
  soloq_tier?: string;
  soloq_lp?: number;
  soloq_rank?: number;
  soloq_games?: number;
  soloq_winrate?: number;
  soloq_lp_7d?: number;
  soloq_games_7d?: number;
  em_games: number;
  role_percentile: number;
  played_lec: boolean;
  /** Ancien joueur de LEC (dernière saison en LEC), ex : "Rogue (European Team) (2024)" */
  ex_lec?: string;
  ex_lec_malus?: number;
  photo?: string;
  logo?: string;
  country?: string;
  /** Club actuel (dernière partie, toutes saisons) */
  current_team?: string;
  current_logo?: string;
  current_league?: string;
}

export interface PeerStat {
  avg: number;
  pct: number;
}

export interface PlayerLine extends Partial<Record<StatKey, number>> {
  season: number;
  league_code: string;
  tier: string;
  team: string;
  role: Role;
  games: number;
  logo?: string;
  peers: { n: number } & Partial<Record<StatKey, PeerStat>>;
}

export interface EvolutionPoint {
  season: number;
  tournament: string;
  league_code: string;
  tier: string;
  role: Role;
  date: string;
  games: number;
  winrate: number;
  kda: number;
  cs_min: number;
  gold_min: number;
  dpm: number;
  kp?: number;
  dmg_share?: number;
}

export interface CareerStint {
  team: string;
  logo?: string;
  league_code: string;
  tier: string;
  role?: string;
  games: number;
  wins?: number;
  em_games?: number;
  start: string;
  end: string;
}

export interface CareerTitle {
  tournament: string;
  team: string;
  logo?: string;
  league_code: string;
  tier: string;
  season: number;
  date: string;
}

export interface CareerAward {
  award: string;
  tournament?: string;
  team?: string;
  season?: number;
  league?: string;
}

export interface Career {
  stints: CareerStint[];
  levels: Partial<Record<string, { games: number; days: number }>>;
  titles: CareerTitle[];
  awards: CareerAward[];
}

export interface Player {
  id: string;
  name: string;
  photo?: string;
  country?: string;
  birthdate?: string;
  age?: number;
  team: string;
  logo?: string;
  role: Role;
  league_code: string;
  tier: string;
  lines: PlayerLine[];
  scores: Omit<RankingRow, "id" | "name" | "photo">[];
  evolution: EvolutionPoint[];
  career?: Career;
}

export interface League {
  code: string;
  tier: string;
  names: Record<string, string>;
  coef: number;
  em_teams: number;
  raw_mean?: number;
}

export interface PromotionPlayer {
  id: string;
  name: string;
  role: Role;
  age?: number;
  team: string;
  league_code: string;
  tier: string;
  games: number;
  final: number;
  role_percentile: number;
  tier_percentile: number;
  em_games: number;
  em_score?: number;
  winrate: number;
  kda: number;
  dpm: number;
  new_level: string;
  new_team: string;
  /** Dernier club avant la montée (peut être en saison N+1) */
  from_team?: string;
  from_league?: string;
  from_logo?: string;
  /** Saison du profil évalué (N, ou N-1 s'il n'a pas joué en ERL en N) */
  from_season?: number;
  /** Déjà passé par la LEC avant : c'est un retour */
  ex_lec?: string;
  photo?: string;
  logo?: string;
  new_logo?: string;
}

export interface Promotion {
  from: number;
  to: number;
  hit_rates: { from: string; bucket: string; promoted: number; total: number }[];
  players: PromotionPlayer[];
}

export interface Meta {
  generated: string;
  seasons: number[];
  games: number;
  players: number;
  leagues: number;
  weights: Record<Role, Partial<Record<StatKey, number>>>;
  league_weight: number;
  em_weight: number;
  stat_labels: Record<StatKey, string>;
  has_oe: boolean;
}
