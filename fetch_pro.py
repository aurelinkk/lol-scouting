"""Télécharge les stats des matchs pros européens depuis Leaguepedia.

Usage :
    python fetch_pro.py                 # saison en cours, toutes les ligues de leagues.py
    python fetch_pro.py --year 2025
    python fetch_pro.py --league "La Ligue Française"

Résultat : data/pro_games_<année>.csv, une ligne par joueur et par partie.
"""
import argparse
import datetime
import os

import pandas as pd

from leaguepedia import cargo_query
from leagues import LEAGUES

FIELDS = {
    # Partie
    "SG.GameId": "game_id",
    "SG.DateTime_UTC": "date",
    "SG.Gamelength_Number": "duration_min",
    "T.League": "league",
    "T.Name": "tournament",
    # Joueur dans la partie
    "SP.Link": "player_link",
    "P.OverviewPage": "player",
    "SP.Team": "team",
    "SP.Role": "role",
    "SP.Champion": "champion",
    "SP.PlayerWin": "win",
    "SP.Kills": "kills",
    "SP.Deaths": "deaths",
    "SP.Assists": "assists",
    "SP.TeamKills": "team_kills",
    "SP.Gold": "gold",
    "SP.CS": "cs",
    "SP.DamageToChampions": "damage",
    "SP.VisionScore": "vision_score",
    # Profil du joueur
    "P.Birthdate": "birthdate",
    "P.Country": "country",
    "P.SoloqueueIds": "soloq_ids",
}

NUMERIC = [
    "duration_min", "kills", "deaths", "assists", "team_kills",
    "gold", "cs", "damage", "vision_score",
]


def fetch_league(league, year):
    rows = cargo_query(
        tables=(
            "ScoreboardPlayers=SP,ScoreboardGames=SG,Tournaments=T,"
            "PlayerRedirects=PR,Players=P"
        ),
        join_on=(
            "SP.GameId=SG.GameId,SG.OverviewPage=T.OverviewPage,"
            "SP.Link=PR.AllName,PR.OverviewPage=P.OverviewPage"
        ),
        fields=",".join(f"{src}={alias}" for src, alias in FIELDS.items()),
        where=f"T.League='{league}' AND T.Year={year}",
        order_by="SG.GameId,SP.Link",
    )
    df = pd.DataFrame(rows)
    if df.empty:
        return df

    df = df[[c for c in FIELDS.values() if c in df.columns]].copy()
    df["tier"] = LEAGUES.get(league, "?")
    return df


def clean(df):
    for col in NUMERIC:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["win"] = df["win"].eq("Yes")
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df["birthdate"] = pd.to_datetime(df["birthdate"], errors="coerce")
    # Pas de page joueur trouvée : on garde le nom affiché dans le match
    df["player"] = df["player"].replace("", pd.NA).fillna(df["player_link"])
    # Remakes / parties sans durée : inutilisables pour les stats par minute
    df = df[df["duration_min"] > 5]
    return df.drop_duplicates(subset=["game_id", "player", "team"])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=datetime.date.today().year)
    parser.add_argument("--league", help="Une seule ligue (nom Leaguepedia)")
    args = parser.parse_args()

    leagues = [args.league] if args.league else list(LEAGUES)

    frames = []
    for league in leagues:
        print(f"{league} ({args.year})...")
        df = fetch_league(league, args.year)
        print(f"  {df['game_id'].nunique() if not df.empty else 0} parties")
        frames.append(df)

    data = pd.concat([f for f in frames if not f.empty], ignore_index=True)
    data = clean(data)

    os.makedirs("data", exist_ok=True)
    path = f"data/pro_games_{args.year}.csv"
    data.to_csv(path, index=False)
    print()
    print(f"{len(data)} lignes ({data['player'].nunique()} joueurs) -> {path}")


if __name__ == "__main__":
    main()
