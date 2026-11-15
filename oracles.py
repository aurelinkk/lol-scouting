"""Stats avancées (à 15 min, first blood) depuis les CSV d'Oracle's Elixir.

Leaguepedia n'a que le tableau de fin de partie. Oracle's Elixir publie un
CSV par saison avec, pour chaque joueur et chaque partie : gold / XP / CS à
10, 15, 20 et 25 min, l'écart avec l'adversaire direct, et les first bloods.

Téléchargement (manuel : le site est protégé contre les robots) :
1. https://oracleselixir.com/tools/downloads
2. Télécharger le fichier de la saison, ex :
   2026_LoL_esports_match_data_from_OraclesElixir.csv
3. Le placer dans data/oracles/

Les stats sont rattachées aux joueurs de Leaguepedia par (saison, nom du joueur).
"""
import glob
import os
import re

import pandas as pd

OE_DIR = "data/oracles"

ROLE_MAP = {"top": "Top", "jng": "Jungle", "mid": "Mid", "bot": "Bot", "sup": "Support"}

# Colonnes Oracle's Elixir utilisées
OE_COLUMNS = [
    "gameid", "datacompleteness", "league", "year", "position", "playername",
    "teamname", "firstbloodkill", "firstbloodassist", "firstbloodvictim",
    "csdiffat15", "golddiffat15", "xpdiffat15", "csat15", "goldat15", "xpat15",
]

# Stats produites (moyenne par joueur), utilisables dans scoring.py
OE_STATS = ["csd15", "gd15", "xpd15", "ahead_cs15", "fb_part", "fb_victim"]


def normalize_name(name):
    """'Koala (Alexis Gonzalez)' -> 'koala' pour rapprocher les deux sources."""
    return re.sub(r"\s*\(.*\)\s*$", "", str(name)).strip().lower()


def oe_file(season):
    files = sorted(glob.glob(os.path.join(OE_DIR, f"{season}_*OraclesElixir*.csv")))
    return files[-1] if files else None


def load_oe(season):
    path = oe_file(season)
    if not path:
        return None
    df = pd.read_csv(path, usecols=lambda c: c in OE_COLUMNS, low_memory=False)
    df = df[df["position"].isin(ROLE_MAP)]  # on retire les lignes "team"
    df["role"] = df["position"].map(ROLE_MAP)
    df["name_key"] = df["playername"].map(normalize_name)
    for col in OE_COLUMNS[7:]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def player_oe_stats(season):
    """Une ligne par joueur et rôle, ou None si pas de fichier pour la saison."""
    df = load_oe(season)
    if df is None:
        return None

    # Les parties "partial" n'ont pas les données à 15 min
    complete = df[df["datacompleteness"] == "complete"].copy()
    complete["ahead_cs15"] = (complete["csdiffat15"] > 0).astype(float)
    complete["fb_part"] = ((complete["firstbloodkill"] == 1)
                           | (complete["firstbloodassist"] == 1)).astype(float)

    stats = complete.groupby(["name_key", "role"]).agg(
        oe_games=("gameid", "nunique"),
        csd15=("csdiffat15", "mean"),
        gd15=("golddiffat15", "mean"),
        xpd15=("xpdiffat15", "mean"),
        ahead_cs15=("ahead_cs15", "mean"),
        fb_part=("fb_part", "mean"),
        fb_victim=("firstbloodvictim", "mean"),
    ).reset_index()
    stats["season"] = season
    return stats


def coverage(season):
    """Nombre de parties complètes par ligue dans le fichier (pour vérifier)."""
    df = load_oe(season)
    if df is None:
        return None
    return (df.drop_duplicates("gameid")
            .groupby(["league", "datacompleteness"]).size().unstack(fill_value=0))


if __name__ == "__main__":
    import sys
    season = int(sys.argv[1]) if len(sys.argv) > 1 else 2026
    cov = coverage(season)
    if cov is None:
        print(f"Aucun fichier Oracle's Elixir pour {season} dans {OE_DIR}/")
    else:
        print(cov.to_string())
