"""Classement des prospects à partir des données de fetch_pro.py.

Chaque joueur est comparé aux autres joueurs du MÊME RÔLE dans la MÊME LIGUE
(z-score : 0 = moyenne de la ligue, +1 = un écart-type au-dessus).
Le score est la moyenne de ces z-scores sur les stats pertinentes pour le rôle.

Attention : un score de +1 en ERL2 ne vaut pas un +1 en LEC. Le score dit
« ce joueur domine sa ligue », pas « ce joueur est meilleur dans l'absolu ».

Usage :
    python prospects.py
    python prospects.py --max-age 21 --role Mid --top 15
    python prospects.py --tier ERL1 ERL2 --min-games 15
"""
import argparse
import datetime

import pandas as pd

# Stats utilisées pour le score, par rôle. Le signe indique le sens :
# +1 = plus c'est haut mieux c'est, -1 = plus c'est bas mieux c'est.
ROLE_STATS = {
    "Top":     {"cs_min": 1, "gold_min": 1, "dpm": 1, "dmg_share": 1, "kp": 1, "deaths_pg": -1, "winrate": 1},
    "Jungle":  {"cs_min": 1, "gold_min": 1, "dpm": 1, "kp": 1, "vision_min": 1, "deaths_pg": -1, "winrate": 1},
    "Mid":     {"cs_min": 1, "gold_min": 1, "dpm": 1, "dmg_share": 1, "kp": 1, "deaths_pg": -1, "winrate": 1},
    "Bot":     {"cs_min": 1, "gold_min": 1, "dpm": 1, "dmg_share": 1, "kp": 1, "deaths_pg": -1, "winrate": 1},
    "Support": {"kp": 1, "vision_min": 1, "assists_pg": 1, "deaths_pg": -1, "winrate": 1},
}

MIN_PLAYERS_FOR_COMPARISON = 4


def load(year):
    df = pd.read_csv(f"data/pro_games_{year}.csv", parse_dates=["date", "birthdate"])

    # Parts de l'équipe (dégâts et gold) dans chaque partie
    team = df.groupby(["game_id", "team"])[["damage", "gold"]].transform("sum")
    df["dmg_share"] = df["damage"] / team["damage"]
    df["gold_share"] = df["gold"] / team["gold"]
    df["kp"] = (df["kills"] + df["assists"]) / df["team_kills"].where(df["team_kills"] > 0)
    return df


def aggregate(df):
    """Une ligne par joueur / ligue / rôle."""
    grouped = df.groupby(["player", "league", "tier", "role"])
    totals = grouped[["kills", "deaths", "assists", "cs", "gold", "damage",
                      "vision_score", "duration_min"]].sum()

    stats = pd.DataFrame({
        "games": grouped.size(),
        "team": grouped["team"].agg(lambda s: s.iloc[-1]),  # équipe la plus récente
        "winrate": grouped["win"].mean(),
        "kda": (totals["kills"] + totals["assists"]) / totals["deaths"].clip(lower=1),
        "deaths_pg": totals["deaths"] / grouped.size(),
        "assists_pg": totals["assists"] / grouped.size(),
        "cs_min": totals["cs"] / totals["duration_min"],
        "gold_min": totals["gold"] / totals["duration_min"],
        "dpm": totals["damage"] / totals["duration_min"],
        "vision_min": totals["vision_score"] / totals["duration_min"],
        "kp": grouped["kp"].mean(),
        "dmg_share": grouped["dmg_share"].mean(),
        "gold_share": grouped["gold_share"].mean(),
        "champions": grouped["champion"].nunique(),
        "birthdate": grouped["birthdate"].first(),
        "country": grouped["country"].first(),
    }).reset_index()

    today = pd.Timestamp(datetime.date.today())
    stats["age"] = ((today - stats["birthdate"]).dt.days / 365.25).round(1)
    return stats


def score(stats, min_games):
    stats = stats[stats["games"] >= min_games].copy()
    stats["score"] = float("nan")

    for (league, role), group in stats.groupby(["league", "role"]):
        if role not in ROLE_STATS or len(group) < MIN_PLAYERS_FOR_COMPARISON:
            continue
        zs = []
        for stat, sign in ROLE_STATS[role].items():
            std = group[stat].std()
            if std and std > 0:
                zs.append(sign * (group[stat] - group[stat].mean()) / std)
        if zs:
            stats.loc[group.index, "score"] = pd.concat(zs, axis=1).mean(axis=1)

    return stats.dropna(subset=["score"]).sort_values("score", ascending=False)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=datetime.date.today().year)
    parser.add_argument("--min-games", type=int, default=10)
    parser.add_argument("--max-age", type=float, help="ex : 21 pour les moins de 21 ans")
    parser.add_argument("--role", choices=list(ROLE_STATS))
    parser.add_argument("--tier", nargs="+", help="ex : ERL1 ERL2")
    parser.add_argument("--top", type=int, default=10, help="joueurs affichés par rôle")
    args = parser.parse_args()

    ranking = score(aggregate(load(args.year)), args.min_games)

    if args.max_age:
        ranking = ranking[ranking["age"] <= args.max_age]
    if args.role:
        ranking = ranking[ranking["role"] == args.role]
    if args.tier:
        ranking = ranking[ranking["tier"].isin(args.tier)]

    ranking.to_csv(f"data/prospects_{args.year}.csv", index=False)

    columns = ["player", "team", "tier", "league", "age", "games", "score",
               "winrate", "kda", "cs_min", "dpm", "dmg_share", "kp", "champions"]
    pd.set_option("display.width", 200)
    pd.set_option("display.max_columns", None)

    for role in ROLE_STATS:
        top = ranking[ranking["role"] == role].head(args.top)
        if top.empty:
            continue
        print(f"\n=== {role.upper()} ===")
        print(top[columns].round(2).to_string(index=False))

    print(f"\nClassement complet : data/prospects_{args.year}.csv")


if __name__ == "__main__":
    main()
