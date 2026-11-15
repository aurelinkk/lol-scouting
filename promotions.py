"""Qui est monté entre deux saisons, et quel était son profil avant ?

Pour chaque joueur qui monte (ERL -> LEC, ou ERL2 -> ERL1) entre la saison N
et N+1, affiche son classement de prospect en saison N. Permet de vérifier
si le score aurait repéré ces joueurs à l'avance, et de régler les poids
de scoring.py en conséquence.

Le coefficient de ligue est calculé uniquement sur la saison N par défaut,
pour ne pas utiliser d'informations « du futur ».

Usage :
    python promotions.py                 # 2025 -> 2026
    python promotions.py --from 2025 --to 2026
"""
import argparse

import pandas as pd

from league_strength import load_games
from prospects import build_ranking

COLUMNS = ["player", "role", "age", "league_code", "tier", "team", "games",
           "final", "role_percentile", "league_score", "league_bonus",
           "em_score", "em_games", "winrate", "new_level", "new_team"]


def destination(games_next):
    """Plus haut niveau atteint par chaque joueur en saison N+1."""
    order = {"LEC": 0, "ERL1": 1, "ERL2": 2}
    g = games_next[games_next["tier"].isin(order)].copy()
    g["level"] = g["tier"].map(order)
    best = (g.groupby(["player", "tier", "team"]).size().reset_index(name="n")
            .assign(level=lambda d: d["tier"].map(order))
            .sort_values(["level", "n"], ascending=[True, False])
            .drop_duplicates("player"))
    return best.rename(columns={"tier": "new_level", "team": "new_team"})[
        ["player", "new_level", "new_team"]]


def summary(label, moved):
    if moved.empty:
        print(f"\n{label} : aucun joueur trouvé")
        return
    p = moved["role_percentile"]
    print(f"\n=== {label} : {len(moved)} joueurs ===")
    print(f"Rang médian dans leur rôle la saison précédente : top {100 * (1 - p.median()):.0f} %")
    print(f"Dans le top 10 % de leur rôle : {(p >= 0.9).sum()} / {len(moved)}"
          f"  |  top 25 % : {(p >= 0.75).sum()} / {len(moved)}")
    print(moved[COLUMNS].round(2).to_string(index=False))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="season_from", type=int, default=2025)
    parser.add_argument("--to", dest="season_to", type=int, default=2026)
    parser.add_argument("--coef-seasons", type=int, nargs="+",
                        help="par défaut : uniquement la saison de départ")
    parser.add_argument("--min-games", type=int, default=10)
    args = parser.parse_args()

    coef_seasons = args.coef_seasons or [args.season_from]
    games = load_games([args.season_from, args.season_to])

    before = build_ranking(games, args.season_from, coef_seasons, args.min_games)
    before = before[~before["played_lec"]]
    after = destination(games[games["season"] == args.season_to])
    merged = before.merge(after, on="player", how="inner")

    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", None)

    summary(f"Montés en LEC ({args.season_from} -> {args.season_to})",
            merged[merged["new_level"] == "LEC"])
    summary(f"Montés d'ERL2 en ERL1 ({args.season_from} -> {args.season_to})",
            merged[(merged["tier"] == "ERL2") & (merged["new_level"] == "ERL1")])

    path = f"data/promotions_{args.season_from}_{args.season_to}.csv"
    merged.to_csv(path, index=False)
    print(f"\nDétail complet : {path}")


if __name__ == "__main__":
    main()
