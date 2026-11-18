"""Tournois internationaux (Worlds, MSI, EWC, First Stand) : toutes les parties,
tous les joueurs du monde, pour juger les joueurs de LEC / LCS contre le
reste du monde (voir prospects.build_ranking et scoring.INTL_*).

Fichiers communs aux deux régions : data/intl/pro_games_<année>.csv

Usage :
    python intl.py                 # toutes les saisons de leagues.py
    python intl.py --year 2026
    python intl.py --refresh       # retélécharger
"""
import argparse
import os

import pandas as pd

INTL_LEAGUES = {
    "World Championship": "WORLDS",
    "Mid-Season Invitational": "MSI",
    "Esports World Cup": "EWC",
    "First Stand": "FST",
}
DIR = "data/intl"
# Pas l'international : qualifications EWC (équipes d'une même région entre
# elles), finales régionales qualificatives pour les Worlds
NOT_INTERNATIONAL = r"Qualifier|Regional Finals|Regional Qualifier"
RAW = "data/raw/intl"


def fetch_intl(year, refresh=False):
    from fetch_pro import clean, fetch_league
    os.makedirs(f"{RAW}/{year}", exist_ok=True)
    frames = []
    for league, code in INTL_LEAGUES.items():
        path = f"{RAW}/{year}/{code}.csv"
        if os.path.exists(path) and not refresh:
            try:
                df = pd.read_csv(path, dtype=str, keep_default_na=False)
            except pd.errors.EmptyDataError:
                df = pd.DataFrame()
        else:
            print(f"{league} ({year})...")
            df = fetch_league(league, year)
            df.to_csv(path, index=False)
            print(f"  {df['game_id'].nunique() if not df.empty else 0} parties")
        if df.empty:
            continue
        df = df.assign(event=code)
        frames.append(df)
    if not frames:
        return None
    data = clean(pd.concat(frames, ignore_index=True))
    data = data[~data["tournament"].str.contains(NOT_INTERNATIONAL, case=False, na=False)]
    # Une seule « ligue » : on compare chaque joueur à tous ceux de son poste
    data["league_code"] = "INTL"
    data["tier"] = "INTL"
    data["season"] = year
    os.makedirs(DIR, exist_ok=True)
    data.to_csv(f"{DIR}/pro_games_{year}.csv", index=False)
    print(f"{data['game_id'].nunique()} parties internationales {year} -> {DIR}/pro_games_{year}.csv")
    return data


def load_intl(season):
    """Parties internationales de la saison, ou None si pas téléchargées."""
    path = f"{DIR}/pro_games_{season}.csv"
    if not os.path.exists(path):
        return None
    df = pd.read_csv(path, parse_dates=["date", "birthdate"])
    return df[~df["tournament"].str.contains(NOT_INTERNATIONAL, case=False, na=False)]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int)
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    from leagues import LEAGUES
    for year in [args.year] if args.year else sorted(LEAGUES):
        fetch_intl(year, args.refresh)


if __name__ == "__main__":
    main()
