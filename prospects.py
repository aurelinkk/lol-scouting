"""Classement des prospects (joueurs d'ERL, hors LEC).

Score final = score_ligue + bonus_ligue + EM_WEIGHT x score_em

- score_ligue : performance comparée aux joueurs du même rôle dans la même
  ligue (z-scores pondérés, poids dans scoring.py). 0 = moyenne de la ligue.
- bonus_ligue : niveau de la ligue d'après les placements à l'EMEA Masters
  (league_strength.py).
- score_em : performance à l'EMEA Masters face aux joueurs de toutes les ligues.

Usage :
    python prospects.py                          # saison 2026
    python prospects.py --season 2025
    python prospects.py --max-age 21 --role Mid --top 15
    python prospects.py --tier ERL2
"""
import argparse

import pandas as pd

from league_strength import league_coefficients, load_games
from scoring import (EM_MIN_GAMES, EM_WEIGHT, LEAGUE_WEIGHT,
                     MIN_PLAYERS_FOR_COMPARISON, ROLE_WEIGHTS)

DISPLAY = ["player", "team", "league_code", "tier", "age", "games", "final",
           "league_score", "league_bonus", "em_score", "em_games",
           "winrate", "kda", "cs_min", "dpm", "dmg_share", "kp", "champions"]


def add_game_metrics(df):
    df = df.copy()
    team = df.groupby(["game_id", "team"])[["damage", "gold"]].transform("sum")
    df["dmg_share"] = df["damage"] / team["damage"]
    df["gold_share"] = df["gold"] / team["gold"]
    df["kp"] = (df["kills"] + df["assists"]) / df["team_kills"].where(df["team_kills"] > 0)
    return df


def aggregate(df):
    """Une ligne par saison / joueur / ligue / rôle."""
    keys = ["season", "player", "league_code", "tier", "role"]
    grouped = df.groupby(keys)
    totals = grouped[["kills", "deaths", "assists", "cs", "gold", "damage",
                      "vision_score", "duration_min"]].sum()
    games = grouped.size()

    stats = pd.DataFrame({
        "games": games,
        "team": grouped["team"].last(),  # équipe la plus récente
        "winrate": grouped["win"].mean(),
        "kda": (totals["kills"] + totals["assists"]) / totals["deaths"].clip(lower=1),
        "deaths_pg": totals["deaths"] / games,
        "assists_pg": totals["assists"] / games,
        "cs_min": totals["cs"] / totals["duration_min"],
        "gold_min": totals["gold"] / totals["duration_min"],
        "dpm": totals["damage"] / totals["duration_min"],
        "vision_min": totals["vision_score"] / totals["duration_min"],
        "kp": grouped["kp"].mean(),
        "dmg_share": grouped["dmg_share"].mean(),
        "gold_share": grouped["gold_share"].mean(),
        "champions": grouped["champion"].nunique(),
        "birthdate": grouped["birthdate"].first(),
        "last_game": grouped["date"].max(),
        "country": grouped["country"].first(),
    }).reset_index()

    # Âge au moment de la dernière partie de la saison
    stats["age"] = ((stats["last_game"] - stats["birthdate"]).dt.days / 365.25).round(1)
    return stats


def weighted_zscores(stats, group_keys):
    """Score = moyenne pondérée des z-scores, au sein de chaque groupe."""
    stats = stats.copy()
    stats["score"] = float("nan")
    for _, group in stats.groupby(group_keys):
        role = group["role"].iloc[0]
        if role not in ROLE_WEIGHTS or len(group) < MIN_PLAYERS_FOR_COMPARISON:
            continue
        total, weight_sum = 0, 0
        for stat, weight in ROLE_WEIGHTS[role].items():
            std = group[stat].std()
            if weight == 0 or not std or pd.isna(std):
                continue
            total = total + weight * (group[stat] - group[stat].mean()) / std
            weight_sum += abs(weight)
        if weight_sum:
            stats.loc[group.index, "score"] = total / weight_sum
    return stats


def build_ranking(games, season, coef_seasons, min_games=10):
    """Classement de tous les joueurs d'ERL de la saison (LEC exclue)."""
    games = add_game_metrics(games[games["season"] == season])
    stats = aggregate(games)

    # Score dans sa ligue (on ne garde que les échantillons suffisants)
    league_rows = stats[stats["tier"].isin(["ERL1", "ERL2"]) & (stats["games"] >= min_games)]
    league_rows = weighted_zscores(league_rows, ["league_code", "role"])
    league_rows = league_rows.rename(columns={"score": "league_score"})

    # Ligue principale d'un joueur = celle où il a le plus de parties
    ranking = (league_rows.dropna(subset=["league_score"])
               .sort_values("games", ascending=False)
               .drop_duplicates("player"))

    # Bonus de niveau de ligue
    coefs = league_coefficients(load_games(coef_seasons), coef_seasons)
    erl1 = [c for c in ranking.loc[ranking["tier"] == "ERL1", "league_code"].unique()
            if c in coefs.index]
    ref = coefs.loc[erl1, "coef"]
    ranking["league_coef"] = ranking["league_code"].map(coefs["coef"])
    ranking["league_bonus"] = (LEAGUE_WEIGHT * (ranking["league_coef"] - ref.mean())
                               / ref.std()).fillna(0)

    # Performance à l'EMEA Masters (comparée à tous les joueurs de l'EM)
    em = stats[(stats["tier"] == "EM") & (stats["games"] >= EM_MIN_GAMES)]
    em = weighted_zscores(em, ["role"])
    em = em.sort_values("games", ascending=False).drop_duplicates("player")
    ranking = ranking.merge(
        em[["player", "score", "games"]].rename(columns={"score": "em_score", "games": "em_games"}),
        on="player", how="left")
    ranking["em_games"] = ranking["em_games"].fillna(0).astype(int)

    # Joueurs qui ont joué en LEC cette saison : exclus des prospects
    lec_players = set(stats.loc[stats["tier"] == "LEC", "player"])
    ranking["played_lec"] = ranking["player"].isin(lec_players)

    ranking["final"] = (ranking["league_score"] + ranking["league_bonus"]
                        + EM_WEIGHT * ranking["em_score"].fillna(0))

    # Rang (percentile) dans son rôle parmi tous les joueurs d'ERL
    ranking["role_percentile"] = ranking.groupby("role")["final"].rank(pct=True).round(3)
    return ranking.sort_values("final", ascending=False)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, default=2026)
    parser.add_argument("--coef-seasons", type=int, nargs="+", default=[2025, 2026],
                        help="saisons utilisées pour le coefficient de ligue")
    parser.add_argument("--min-games", type=int, default=10)
    parser.add_argument("--max-age", type=float, help="ex : 21 pour les moins de 21 ans")
    parser.add_argument("--role", choices=list(ROLE_WEIGHTS))
    parser.add_argument("--tier", nargs="+", help="ex : ERL1 ERL2")
    parser.add_argument("--top", type=int, default=10, help="joueurs affichés par rôle")
    args = parser.parse_args()

    games = load_games([args.season])
    ranking = build_ranking(games, args.season, args.coef_seasons, args.min_games)
    ranking = ranking[~ranking["played_lec"]]

    if args.max_age:
        ranking = ranking[ranking["age"] <= args.max_age]
    if args.role:
        ranking = ranking[ranking["role"] == args.role]
    if args.tier:
        ranking = ranking[ranking["tier"].isin(args.tier)]

    path = f"data/prospects_{args.season}.csv"
    ranking.to_csv(path, index=False)

    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", None)
    for role in ROLE_WEIGHTS:
        top = ranking[ranking["role"] == role].head(args.top)
        if not top.empty:
            print(f"\n=== {role.upper()} ===")
            print(top[DISPLAY].round(2).to_string(index=False))

    print(f"\nClassement complet : {path}")


if __name__ == "__main__":
    main()
