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

# Code de ligue Oracle's Elixir -> code stable de leagues.py
# (vérifié sur le fichier 2026 ; pour une autre saison, lancer
#  `python oracles.py <saison>` et compléter si une ligue manque)
OE_LEAGUE_MAP = {
    "LEC": "LEC", "EM": "EM",
    "LFL": "LFL", "PRM": "PRM", "LES": "ES", "NLC": "NLC", "LIT": "LIT",
    "RL": "RL", "ROL": "ROL", "HM": "HM", "TCL": "TCL", "LPLOL": "LPLOL",
    "HLL": "HLL", "EBL": "EBL", "AL": "AL",
    "HC": "HM2",   # Hitpoint Challengers
    "NL": "LFL2",  # Nexus League
    "SL": "ES",    # LVP SuperLiga (saisons avant la LES)
    "LFL2": "LFL2",
}

# Colonnes Oracle's Elixir utilisées
OE_COLUMNS = [
    "gameid", "datacompleteness", "league", "year", "position", "playername",
    "teamname", "firstbloodkill", "firstbloodassist", "firstbloodvictim",
    "csdiffat15", "golddiffat15", "xpdiffat15", "csat15", "goldat15", "xpat15",
]

# Stats produites (moyenne par joueur), utilisables dans scoring.py
OE_STATS = ["csd15", "gd15", "xpd15", "ahead_cs15", "fb_part", "fb_victim"]


# Pseudos différents entre Leaguepedia et Oracle's Elixir :
# "pseudo Oracle's Elixir": "pseudo Leaguepedia" (voir `python oracles.py 2026`)
NAME_ALIASES = {
}


def normalize_name(name):
    """'Koala (Alexis Gonzalez)' -> 'koala' pour rapprocher les deux sources."""
    name = NAME_ALIASES.get(str(name), str(name))
    return re.sub(r"\s*\(.*\)\s*$", "", name).strip().lower()


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
    df["league_code"] = df["league"].map(OE_LEAGUE_MAP)
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

    complete = complete.dropna(subset=["league_code"])
    stats = complete.groupby(["name_key", "role", "league_code"]).agg(
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


def match_report(season):
    """Pour chaque ligue couverte : % de joueurs Leaguepedia retrouvés dans Oracle's Elixir."""
    games_path = f"data/pro_games_{season}.csv"
    oe = player_oe_stats(season)
    if oe is None or not os.path.exists(games_path):
        return
    games = pd.read_csv(games_path)
    players = (games.groupby(["player", "role", "league_code"]).size()
               .reset_index(name="games"))
    players = players[players["games"] >= 5]
    players["name_key"] = players["player"].map(normalize_name)
    covered = players[players["league_code"].isin(oe["league_code"].unique())]
    merged = covered.merge(oe, on=["name_key", "role", "league_code"], how="left")

    print("\nJoueurs retrouvés (au moins 5 parties) :")
    rate = merged.groupby("league_code")["oe_games"].agg(lambda s: s.notna().mean())
    print((100 * rate).round(0).astype(int).astype(str).add(" %").to_string())

    missing = merged[merged["oe_games"].isna()]
    if not missing.empty:
        print(f"\n{len(missing)} joueurs non retrouvés (pseudo différent ?) :")
        for code, g in missing.groupby("league_code"):
            print(f"  {code}: " + ", ".join(f"{p} ({r})" for p, r in zip(g["player"], g["role"])))

    unmapped = set(load_oe(season)["league"]) - set(OE_LEAGUE_MAP)
    print("\nLigues Oracle's Elixir non utilisées :", ", ".join(sorted(unmapped)))


if __name__ == "__main__":
    import sys
    season = int(sys.argv[1]) if len(sys.argv) > 1 else 2026
    cov = coverage(season)
    if cov is None:
        print(f"Aucun fichier Oracle's Elixir pour {season} dans {OE_DIR}/")
    else:
        print(cov.to_string())
        match_report(season)
