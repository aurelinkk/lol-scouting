"""Télécharge les stats des matchs pros (Europe, ou NA avec SCOUT_REGION=na) depuis Leaguepedia.

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
from leagues import leagues_for
from region import DATA_DIR, RAW_DIR

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


def fetch_league_cached(league, year, refresh=False):
    """Télécharge une ligue, ou la relit depuis data/raw/ si déjà téléchargée."""
    cache_dir = f"{RAW_DIR}/{year}"
    os.makedirs(cache_dir, exist_ok=True)
    path = os.path.join(cache_dir, league.replace("/", "_") + ".csv")

    if os.path.exists(path) and not refresh:
        print(f"{league} ({year}) : déjà en cache")
        try:
            return pd.read_csv(path, dtype=str, keep_default_na=False)
        except pd.errors.EmptyDataError:  # ligue sans aucune partie
            return pd.DataFrame()

    print(f"{league} ({year})...")
    df = fetch_league(league, year)
    df.to_csv(path, index=False)
    print(f"  {df['game_id'].nunique() if not df.empty else 0} parties")
    return df


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=datetime.date.today().year)
    parser.add_argument("--league", help="Une seule ligue (nom Leaguepedia)")
    parser.add_argument("--refresh", action="store_true",
                        help="Retélécharger même les ligues déjà en cache")
    args = parser.parse_args()

    config = leagues_for(args.year)
    leagues = [args.league] if args.league else list(config)

    frames = []
    for league in leagues:
        df = fetch_league_cached(league, args.year, args.refresh)
        if df.empty:
            continue
        # Code stable et niveau : ajoutés ici (pas dans le cache) pour
        # pouvoir corriger leagues.py sans retélécharger
        code, tier = config.get(league, (league, "?"))
        df = df.drop(columns=["tier"], errors="ignore")
        df["league_code"] = code
        df["tier"] = tier
        df["season"] = args.year
        frames.append(df)

    data = pd.concat(frames, ignore_index=True)
    data = clean(data)

    os.makedirs(DATA_DIR, exist_ok=True)
    path = f"{DATA_DIR}/pro_games_{args.year}.csv"
    data.to_csv(path, index=False)
    print()
    print(f"{len(data)} lignes ({data['player'].nunique()} joueurs) -> {path}")


if __name__ == "__main__":
    main()
