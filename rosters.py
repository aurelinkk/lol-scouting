"""Rosters : effectifs réels (d'après les parties jouées) et mercato à venir.

- build_rosters(games) : pour chaque saison, ligue (LEC + ERL1) et split,
  les équipes et les joueurs qui ont joué, avec leur nombre de parties.
- load_mercato(season) : rosters_<saison>.csv, saisi à la main au fil des
  annonces (league,team,role,player_<saison-1>,player_<saison>).
- mercato_destination(season, games) : sert aux montées vers une saison qui
  n'a pas encore de parties (ex : 2026 -> 2027).
"""
import os
import re

import pandas as pd

from leagues import LEAGUES

ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"]
EXCLUDED = r"Promotion|Relegation|Qualifier|Play-In|LCQ"


def build_rosters(games, tiers=("LEC", "ERL1")):
    g = games[games["tier"].isin(tiers)
              & ~games["tournament"].str.contains(EXCLUDED, case=False, na=False)]
    counts = (g.groupby(["season", "league_code", "tier", "tournament", "team", "player", "role"])
              .agg(games=("game_id", "nunique"), start=("date", "min"))
              .reset_index())
    return counts


def mercato_file(season):
    return f"rosters_{season}.csv"


def load_mercato(season):
    path = mercato_file(season)
    if not os.path.exists(path):
        return None
    df = pd.read_csv(path, dtype=str).fillna("")
    return df


def resolve_name(name, games):
    """Nom saisi à la main -> identifiant joueur de nos données.

    Accepte le nom exact ("Zest (Kim Dong-min)") ou le pseudo seul ("Zest") ;
    si plusieurs joueurs ont ce pseudo, prend celui qui a joué le plus récemment.
    """
    if not name:
        return None
    players = games[["player", "date"]]
    exact = players[players["player"] == name]
    if exact.empty:
        key = name.strip().lower()
        base = players["player"].str.replace(r"\s*\(.*\)$", "", regex=True).str.lower()
        exact = players[base == key]
    if exact.empty:
        return None
    return exact.sort_values("date")["player"].iloc[-1]


def tier_of(league_code):
    for config in reversed(list(LEAGUES.values())):
        for code, tier in config.values():
            if code == league_code:
                return tier
    return "LEC" if league_code == "LEC" else "?"


def mercato_destination(season, games):
    """Niveau et club en `season` d'après rosters_<season>.csv (joueurs, pas les coachs)."""
    mercato = load_mercato(season)
    if mercato is None:
        return None
    col = f"player_{season}"
    rows = []
    for _, r in mercato[mercato["role"].isin(ROLES)].iterrows():
        player = resolve_name(r[col], games)
        if player:
            rows.append({"player": player, "new_level": tier_of(r["league"]),
                         "new_team": r["team"], "first_game": pd.Timestamp.max})
    df = pd.DataFrame(rows, columns=["player", "new_level", "new_team", "first_game"])
    order = {"LEC": 0, "ERL1": 1, "ERL2": 2}
    return (df.assign(level=df["new_level"].map(order)).sort_values("level")
            .drop_duplicates("player").drop(columns="level"))
