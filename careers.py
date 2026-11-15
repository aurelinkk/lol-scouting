"""Carrière des joueurs : passages en club, titres, récompenses individuelles.

- Passages en club : déduits des parties (une période = même équipe, même ligue,
  sans interruption ; l'EMEA Masters est rattaché au club, pas compté à part).
- Titres : vainqueurs des playoffs / finales / main events (Leaguepedia,
  table TournamentResults), attribués aux joueurs qui ont joué ce tournoi
  pour l'équipe gagnante.
- Récompenses individuelles : MVP, MVP des finales, équipes All-Pro, Rookie...
  (Leaguepedia, table IndividualAchievements), toutes années confondues.

Résultats Leaguepedia en cache dans data/raw/titles.csv et data/raw/awards.csv
(supprimer ces fichiers pour les mettre à jour).
"""
import os

import pandas as pd

from leaguepedia import cargo_query

TITLES = "data/raw/titles.csv"
AWARDS = "data/raw/awards.csv"

# Tournois qui donnent un titre (pas les saisons régulières ni les qualifs)
TITLE_PATTERN = r"Playoffs|Finals|Final Four|Main Event|Grand Final|Invitational|Kick-off|Cup"
NOT_TITLE_PATTERN = r"Promotion|Relegation|Qualifier|Play-In|LCQ"


def fetch_titles(seasons, refresh=False):
    if os.path.exists(TITLES) and not refresh:
        df = pd.read_csv(TITLES)
        if set(seasons) <= set(df["season"]):
            return df
    rows = cargo_query(
        tables="TournamentResults=TR,Tournaments=T",
        join_on="TR.OverviewPage=T.OverviewPage",
        fields="T.Name=tournament,T.Year=season,TR.Team=team,TR.Place_Number=place",
        where=f"T.Year IN ({','.join(map(str, seasons))}) AND TR.Place_Number=1 "
              "AND (T.Region='EMEA' OR T.Region='International')",
    )
    df = pd.DataFrame(rows, columns=["tournament", "season", "team", "place"])
    df["season"] = pd.to_numeric(df["season"], errors="coerce")
    os.makedirs("data/raw", exist_ok=True)
    df.to_csv(TITLES, index=False)
    return df


def fetch_awards(refresh=False):
    if os.path.exists(AWARDS) and not refresh:
        return pd.read_csv(AWARDS)
    rows = cargo_query(
        tables="IndividualAchievements=IA,Tournaments=T",
        join_on="IA.OverviewPage=T.OverviewPage",
        fields="IA.Player=player,IA.Team=team,IA.Display=award,T.Name=tournament,"
               "T.Year=season,T.League=league",
        where="IA.Player IS NOT NULL AND (T.Region='EMEA' OR T.Region='International')",
    )
    df = pd.DataFrame(rows, columns=["player", "team", "award", "tournament", "season", "league"])
    df = df[df["player"].astype(str).str.len() > 0]
    os.makedirs("data/raw", exist_ok=True)
    df.to_csv(AWARDS, index=False)
    return df


def stints(games):
    """Périodes en club : une ligne par (joueur, équipe, ligue) consécutifs.

    Les tournois de promotion / relégation / Invitational ne créent pas de
    période (ils couperaient une saison en morceaux : ex. Looki chez DKB).
    """
    g = games[(games["tier"] != "EM")
              & ~games["tournament"].str.contains(NOT_TITLE_PATTERN + "|Invitational",
                                                  case=False, na=False)]
    g = g.sort_values(["player", "date"])
    key = g["team"].astype(str) + "|" + g["league_code"].astype(str)
    new_stint = (key != key.groupby(g["player"]).shift()) | (g["player"] != g["player"].shift())
    g = g.assign(stint=new_stint.cumsum())
    out = g.groupby("stint").agg(
        player=("player", "first"), team=("team", "first"), league_code=("league_code", "first"),
        tier=("tier", "first"), role=("role", lambda s: s.mode().iloc[0]),
        start=("date", "min"), end=("date", "max"), games=("game_id", "nunique"),
        wins=("win", "sum"),
    ).reset_index(drop=True)

    # Parties d'EMEA Masters jouées pendant la période, avec ce club
    em = games[games["tier"] == "EM"]
    em_counts = em.groupby(["player", "team"])["game_id"].nunique()
    out["em_games"] = [em_counts.get((p, t), 0) for p, t in zip(out["player"], out["team"])]
    return out


def titles_by_player(games, titles):
    t = titles[titles["tournament"].str.contains(TITLE_PATTERN, case=False, na=False)
               & ~titles["tournament"].str.contains(NOT_TITLE_PATTERN, case=False, na=False)]
    played = games[["player", "team", "tournament", "league_code", "tier", "season", "date"]]
    won = played.merge(t[["tournament", "team"]], on=["tournament", "team"])
    return (won.groupby(["player", "tournament", "team"])
            .agg(league_code=("league_code", "first"), tier=("tier", "first"),
                 season=("season", "first"), date=("date", "max"))
            .reset_index().sort_values("date"))


def level_totals(st):
    """Parties et durée (jours) par niveau, par joueur."""
    st = st.assign(days=(st["end"] - st["start"]).dt.days + 1)
    return st.groupby(["player", "tier"]).agg(games=("games", "sum"), days=("days", "sum")).reset_index()
