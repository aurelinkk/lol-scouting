"""Coefficient de niveau des ligues à partir des placements à l'EMEA Masters.

Principe :
1. Pour chaque édition de l'EMEA Masters (Winter / Spring / Summer de chaque
   saison), on classe toutes les équipes. Une équipe éliminée en Play-In ou
   en LCQ est classée derrière toutes les équipes du Main Event.
2. Chaque équipe reçoit un percentile : 1 = vainqueur, 0 = dernière.
3. On retrouve la ligue de chaque équipe (la ligue où elle a joué le plus
   de parties cette saison-là).
4. Coefficient d'une ligue = moyenne des percentiles de ses équipes sur les
   saisons choisies, tirée vers 0.5 quand il y a peu de participations
   (pour ne pas sur-réagir à 1 ou 2 résultats).

Les ERL2 ne vont pas (ou presque pas) à l'EMEA Masters : leur coefficient
est celui de l'ERL1 du même pays, moins ERL2_DISCOUNT (voir scoring.py).

Usage :
    python league_strength.py                # saisons 2025 et 2026
    python league_strength.py --seasons 2026
"""
import argparse
import os
import re

import pandas as pd

from leaguepedia import cargo_query
from leagues import leagues_for
from scoring import ERL2_DISCOUNT, ERL2_PARENT, EXCLUDED_EM_TEAMS, SHRINK_APPEARANCES


def fetch_em_results(seasons, refresh=False):
    path = "data/raw/em_results.csv"
    if os.path.exists(path) and not refresh:
        df = pd.read_csv(path)
        if set(seasons) <= set(df["season"]):
            return df[df["season"].isin(seasons)]

    rows = cargo_query(
        tables="TournamentResults=TR,Tournaments=T",
        join_on="TR.OverviewPage=T.OverviewPage",
        fields="T.Name=tournament,T.Year=season,TR.Team=team,TR.Place_Number=place",
        where=f"T.League='EMEA Masters' AND T.Year IN ({','.join(map(str, seasons))})",
    )
    df = pd.DataFrame(rows)[["tournament", "season", "team", "place"]]
    df["season"] = df["season"].astype(int)
    df["place"] = pd.to_numeric(df["place"], errors="coerce")
    df = df[df["team"].ne("") & df["place"].notna()]

    os.makedirs("data/raw", exist_ok=True)
    df.to_csv(path, index=False)
    return df


def edition_percentiles(results):
    """Un percentile par équipe et par édition (Winter / Spring / Summer)."""
    df = results.copy()
    df["edition"] = df["season"].astype(str) + " " + df["tournament"].str.extract(
        r"(Winter|Spring|Summer)", flags=re.IGNORECASE)[0].fillna("?")
    # 0 = Main Event (ou édition sans phase préliminaire), 1 = Play-In / LCQ
    df["stage"] = df["tournament"].str.contains("Play-In|LCQ", case=False).astype(int)

    # Une équipe passée par le Play-In puis le Main Event : on garde le Main Event
    df = df.sort_values(["edition", "team", "stage"]).drop_duplicates(["edition", "team"])

    out = []
    for edition, g in df.groupby("edition"):
        g = g.sort_values(["stage", "place"]).copy()
        # rang global dans l'édition (égalités = rang moyen)
        g["rank"] = g[["stage", "place"]].apply(tuple, axis=1).rank(method="average")
        n = len(g)
        g["percentile"] = 1 - (g["rank"] - 1) / (n - 1) if n > 1 else 0.5
        out.append(g)
    return pd.concat(out)[["season", "edition", "team", "percentile"]]


def team_leagues(games):
    """Ligue (code) de chaque équipe par saison, d'après ses parties en ERL."""
    erl = games[games["tier"].isin(["ERL1", "ERL2"])]
    counts = erl.groupby(["season", "team", "league_code"]).size().reset_index(name="n")
    counts = counts.sort_values("n", ascending=False).drop_duplicates(["season", "team"])
    return counts[["season", "team", "league_code"]]


def league_coefficients(games, seasons, verbose=False):
    em = fetch_em_results(seasons)
    results = edition_percentiles(em[~em["team"].isin(EXCLUDED_EM_TEAMS)])
    results = results.merge(team_leagues(games), on=["season", "team"], how="left")

    unmatched = results[results["league_code"].isna()]
    if verbose and not unmatched.empty:
        print(f"{len(unmatched)} équipes EM sans ligue retrouvée (ignorées) :")
        print("  " + ", ".join(sorted(unmatched["team"].unique())))
        print()

    matched = results.dropna(subset=["league_code"])
    by_league = matched.groupby("league_code")["percentile"].agg(["sum", "count", "mean"])
    k = SHRINK_APPEARANCES
    by_league["coef"] = (by_league["sum"] + 0.5 * k) / (by_league["count"] + k)
    coefs = by_league.rename(columns={"count": "em_teams", "mean": "raw_mean"})[
        ["em_teams", "raw_mean", "coef"]]

    # ERL2 : coefficient de l'ERL1 du même pays moins une décote
    for erl2, parent in ERL2_PARENT.items():
        if parent in coefs.index and erl2 not in coefs.index:
            coefs.loc[erl2] = [0, float("nan"), coefs.loc[parent, "coef"] - ERL2_DISCOUNT]

    return coefs.sort_values("coef", ascending=False)


def load_season(season):
    """Charge data/pro_games_<saison>.csv, ou None s'il n'existe pas.

    Les colonnes season / league_code / tier sont (re)calculées depuis
    leagues.py : les fichiers créés par une ancienne version de fetch_pro.py
    restent utilisables, et une correction de leagues.py s'applique sans
    retélécharger.
    """
    path = f"data/pro_games_{season}.csv"
    if not os.path.exists(path):
        return None
    df = pd.read_csv(path, parse_dates=["date", "birthdate"])
    config = leagues_for(season)
    df["season"] = season
    df["league_code"] = df["league"].map(lambda l: config.get(l, (l, "?"))[0])
    df["tier"] = df["league"].map(lambda l: config.get(l, (l, "?"))[1])
    return apply_birthdates(df)


BIRTHDATES_FILE = "birthdates.csv"


def apply_birthdates(df):
    """Complète / corrige les dates de naissance avec birthdates.csv (saisie manuelle).

    Leaguepedia n'a pas la date de naissance de beaucoup de joueurs d'ERL.
    La date saisie à la main est prioritaire sur celle de Leaguepedia.
    """
    if not os.path.exists(BIRTHDATES_FILE):
        return df
    manual = pd.read_csv(BIRTHDATES_FILE, parse_dates=["birthdate"])
    dates = dict(zip(manual["player"], manual["birthdate"]))
    override = df["player"].map(dates)
    if "player_link" in df:
        override = override.fillna(df["player_link"].map(dates))
    df["birthdate"] = override.fillna(df["birthdate"])
    return df


def available_seasons():
    """Saisons configurées dans leagues.py dont le fichier de parties existe."""
    from leagues import LEAGUES
    return sorted(s for s in LEAGUES if os.path.exists(f"data/pro_games_{s}.csv"))


def coef_window(season, years=2):
    """Saisons utilisées pour le coefficient de ligue d'une saison : fenêtre
    glissante de 2 ans (la saison et la précédente), parmi celles disponibles."""
    window = [s for s in available_seasons() if season - years < s <= season]
    return window or [season]


def load_games(seasons):
    frames = [df for df in map(load_season, seasons) if df is not None]
    if not frames:
        raise SystemExit("Aucune donnée : lance d'abord fetch_pro.py")
    return pd.concat(frames, ignore_index=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seasons", type=int, nargs="+",
                        help="défaut : les 2 dernières saisons téléchargées")
    args = parser.parse_args()

    seasons = args.seasons or coef_window(max(available_seasons()))
    coefs = league_coefficients(load_games(seasons), seasons, verbose=True)
    print(coefs.round(3).to_string())


if __name__ == "__main__":
    main()
