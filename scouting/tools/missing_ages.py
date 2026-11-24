"""Joueurs classés dont on ne connaît pas l'âge, du mieux classé au moins bien.

À compléter dans corrections/birthdates.csv (player,birthdate,source), en recopiant le nom
du joueur exactement comme dans la première colonne.

Usage :
    python scout.py ages-manquants                  # saison 2026, top 100
    python scout.py ages-manquants --tier ERL2 --top 50
"""
import argparse

import pandas as pd

from scouting.config.regions import DATA_DIR

from scouting.analysis.league_strength import load_games
from scouting.analysis.prospects import build_ranking


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, default=2026)
    parser.add_argument("--tier", nargs="+", default=["ERL1", "ERL2"])
    parser.add_argument("--top", type=int, default=100)
    args = parser.parse_args()

    games = load_games([args.season])
    ranking = build_ranking(games, args.season, [args.season])
    ranking = ranking[~ranking["played_lec"] & ranking["tier"].isin(args.tier)]
    missing = ranking[ranking["age"].isna()]

    print(f"{len(missing)} joueurs classés sans âge sur {len(ranking)} "
          f"({100 * len(missing) / max(len(ranking), 1):.0f} %)\n")
    cols = ["player", "role", "team", "league_code", "tier", "games", "final", "role_percentile"]
    pd.set_option("display.width", 200)
    print(missing[cols].head(args.top).round(2).to_string(index=False))

    path = f"{DATA_DIR}/missing_ages_{args.season}.csv"
    missing[cols].to_csv(path, index=False)
    print(f"\nListe complète : {path}")


if __name__ == "__main__":
    main()
