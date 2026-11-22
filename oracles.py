"""Stats avancées (à 15 min, first blood) depuis les CSV d'Oracle's Elixir.

Leaguepedia n'a que le tableau de fin de partie. Oracle's Elixir publie un
CSV par saison avec, pour chaque joueur et chaque partie : gold / XP / CS à
10, 15, 20 et 25 min, l'écart avec l'adversaire direct, et les first bloods.

Téléchargement (manuel : le site est protégé contre les robots) :
1. https://oracleselixir.com/tools/downloads
2. Télécharger le fichier de la saison, ex :
   2026_LoL_esports_match_data_from_OraclesElixir.csv
3. Le placer dans data/oracles/

Rattachement aux parties Leaguepedia : partie par partie, sans utiliser les
pseudos (qui diffèrent souvent entre les deux sources). Une ligne joueur est
identifiée par le jour du match, le poste, le champion et le K/D/A ; à défaut
(nom de champion écrit différemment), par le jour, le poste, le K/D/A et le
gold total ; enfin en tolérant un jour d'écart (fuseaux horaires).
"""
import glob
import os
import re

import pandas as pd

OE_DIR = "data/oracles"

ROLE_MAP = {"top": "Top", "jng": "Jungle", "mid": "Mid", "bot": "Bot", "sup": "Support"}

# Code de ligue Oracle's Elixir -> code stable de leagues.py
# (vérifié sur les fichiers 2025 et 2026 ; pour une autre saison, lancer
#  `python oracles.py <saison>` et compléter si une ligue manque)
OE_LEAGUE_MAP = {
    "LEC": "LEC", "EM": "EM",
    "LFL": "LFL", "PRM": "PRM", "LES": "ES", "NLC": "NLC", "LIT": "LIT",
    "RL": "RL", "ROL": "ROL", "HM": "HM", "TCL": "TCL", "LPLOL": "LPLOL",
    "HLL": "HLL", "EBL": "EBL", "AL": "AL",
    "HC": "HM2",       # Hitpoint Challengers
    "NL": "LFL2",      # Nexus League (2026)
    "LFL2": "LFL2",    # LFL Division 2 (2025)
    "LVP SL": "ES",    # LVP SuperLiga (2025, avant la LES)
    "NEXO": "ES2",     # Liga Nexo (2e division espagnole depuis 2025)
    # Amérique du Nord (SCOUT_REGION=na)
    "LCS": "LCS", "NACL": "NACL", "LTA N": "LCS", "LTA": "LCS",
    # Corée (SCOUT_REGION=kr)
    "LCK": "LCK", "LCKC": "LCKCL", "LCK CL": "LCKCL", "LAS": "LCKAS",
    # Chine (SCOUT_REGION=cn)
    "LPL": "LPL", "LDL": "LDL", "AME": "AME", "CHC": "CHC",
    # Pacifique (SCOUT_REGION=lcp)
    "LCP": "LCP", "PCS": "PCS", "VCS": "VCS", "LJL": "LJL", "LCO": "LCO",
    # Brésil / Amérique latine (SCOUT_REGION=br) ; « LTA » (finales communes) reste à la LCS
    "CBLOL": "CBLOL", "CBLOLA": "CBLA", "CBLOL A": "CBLA", "LTA S": "CBLOL", "LLA": "LLA",
    "CD": "CD", "LRN": "LRN", "LRS": "LRS",
}

# Différences par saison (None = ligue qui n'est pas dans nos ligues cette saison)
_LEGACY_OE = {
    "ESLOL": "ROL",    # Elite Series (Benelux)
    "GLL": "HLL",      # Greek Legends League
    "UL": "RL",        # Ultraliga (Pologne)
    "PGN": "LIT",      # PG Nationals (Italie, 2023)
    "NEXO": None,      # Liga Nexo = 3e division espagnole avant 2025
}
OE_LEAGUE_MAP_BY_SEASON = {2023: _LEGACY_OE, 2024: _LEGACY_OE}


def league_map(season):
    mapping = {**OE_LEAGUE_MAP, **OE_LEAGUE_MAP_BY_SEASON.get(season, {})}
    return {k: v for k, v in mapping.items() if v}

OE_COLUMNS = [
    "gameid", "datacompleteness", "league", "date", "position", "playername",
    "teamname", "champion", "kills", "deaths", "assists", "totalgold",
    "firstbloodkill", "firstbloodassist", "firstbloodvictim",
    "csdiffat15", "golddiffat15", "xpdiffat15",
    # vision (supports) et jungle
    "gamelength", "controlwardsbought", "wardskilled", "killsat15", "assistsat15",
]
NUMERIC = ["kills", "deaths", "assists", "totalgold", "firstbloodkill", "firstbloodassist",
           "firstbloodvictim", "csdiffat15", "golddiffat15", "xpdiffat15",
           "gamelength", "controlwardsbought", "wardskilled", "killsat15", "assistsat15"]

# Stats produites (par partie, puis moyennées par joueur), utilisables dans scoring.py
OE_STATS = ["csd15", "gd15", "xpd15", "ahead_cs15", "fb_part", "fb_victim",
            # control wards achetées / wards détruites par minute, kills + assists
            # à 15 min (implication en début de partie). Affichées, poids 0
            "cw_min", "wards_killed_min", "ka15"]

_cache = {}


def normalize_name(name):
    """'Koala (Alexis Gonzalez)' -> 'koala'."""
    return re.sub(r"\s*\(.*\)\s*$", "", str(name)).strip().lower()


def champion_key(name):
    """Nom de champion comparable entre les sources : "Kai'Sa" -> "kaisa"."""
    key = re.sub(r"[^a-z0-9]", "", str(name).lower())
    return "nunu" if key.startswith("nunu") else key


def oe_file(season):
    files = sorted(glob.glob(os.path.join(OE_DIR, f"{season}_*OraclesElixir*.csv")))
    return files[-1] if files else None


def load_oe(season):
    """Lignes joueurs d'Oracle's Elixir (sans les lignes "team"), ou None."""
    if season in _cache:
        return _cache[season]
    path = oe_file(season)
    if not path:
        _cache[season] = None
        return None
    df = pd.read_csv(path, usecols=lambda c: c in OE_COLUMNS, low_memory=False)
    df = df[df["position"].isin(ROLE_MAP)].copy()
    df["role"] = df["position"].map(ROLE_MAP)
    df["league_code"] = df["league"].map(league_map(season))
    for col in NUMERIC:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["day"] = pd.to_datetime(df["date"], errors="coerce").dt.normalize()
    df["champ_key"] = df["champion"].map(champion_key)

    # Stats par partie (seules les parties "complete" ont les données @15)
    complete = df["datacompleteness"] == "complete"
    df["csd15"] = df["csdiffat15"].where(complete)
    df["gd15"] = df["golddiffat15"].where(complete)
    df["xpd15"] = df["xpdiffat15"].where(complete)
    df["ahead_cs15"] = (df["csdiffat15"] > 0).astype(float).where(df["csd15"].notna())
    df["fb_part"] = ((df["firstbloodkill"] == 1) | (df["firstbloodassist"] == 1)).astype(float)
    df["fb_part"] = df["fb_part"].where(df["firstbloodkill"].notna())
    df["fb_victim"] = df["firstbloodvictim"]
    # Colonnes absentes de certains fichiers (anciennes saisons) : NaN
    minutes = df["gamelength"] / 60 if "gamelength" in df else float("nan")
    col = lambda c: df[c] if c in df else float("nan")
    df["cw_min"] = col("controlwardsbought") / minutes
    df["wards_killed_min"] = col("wardskilled") / minutes
    df["ka15"] = (col("killsat15") + col("assistsat15")).where(complete)
    _cache[season] = df
    return df


def _unique(df, keys):
    """Ne garde que les lignes dont la clé est unique (évite les faux rattachements)."""
    return df[~df.duplicated(keys, keep=False)]


def attach_oe(games):
    """Ajoute aux parties Leaguepedia les stats Oracle's Elixir de la même partie.

    `games` : une ligne par joueur et par partie (colonnes date, role, champion,
    kills, deaths, assists, gold, season). Ajoute OE_STATS (NaN si pas trouvé).
    """
    games = games.copy()
    for col in OE_STATS:
        games[col] = float("nan")
    games["oe_match"] = False

    for season in games["season"].unique():
        oe = load_oe(int(season))
        if oe is None:
            continue
        mask = games["season"] == season
        g = games.loc[mask, ["date", "role", "champion", "kills", "deaths", "assists", "gold"]].copy()
        g["day"] = pd.to_datetime(g["date"], errors="coerce").dt.normalize()
        g["champ_key"] = g["champion"].map(champion_key)
        g["totalgold"] = g["gold"]
        found = pd.DataFrame(index=g.index, columns=OE_STATS, dtype=float)
        matched = pd.Series(False, index=g.index)

        passes = [
            (["day", "role", "champ_key", "kills", "deaths", "assists"], 0),
            (["day", "role", "kills", "deaths", "assists", "totalgold"], 0),
            (["day", "role", "champ_key", "kills", "deaths", "assists"], 1),
            (["day", "role", "champ_key", "kills", "deaths", "assists"], -1),
        ]
        for keys, shift in passes:
            left = _unique(g[~matched], keys).reset_index()
            right = oe[keys + OE_STATS].copy()
            right["day"] = right["day"] + pd.Timedelta(days=shift)
            right = _unique(right, keys)
            m = left.merge(right, on=keys, how="inner").set_index("index")
            found.loc[m.index, OE_STATS] = m[OE_STATS].values
            matched.loc[m.index] = True

        games.loc[mask, OE_STATS] = found.values
        games.loc[mask, "oe_match"] = matched.values
    return games


def coverage(season):
    """Nombre de parties par ligue dans le fichier (pour vérifier)."""
    df = load_oe(season)
    if df is None:
        return None
    return (df.drop_duplicates("gameid")
            .groupby(["league", "datacompleteness"]).size().unstack(fill_value=0))


def match_report(season):
    """% des parties Leaguepedia retrouvées dans Oracle's Elixir, par ligue."""
    from league_strength import load_season  # import local : évite un import circulaire

    games = load_season(season)
    if games is None:
        print(f"\n(data/pro_games_{season}.csv absent : lance fetch_pro.py "
              "pour voir quelles parties sont retrouvées)")
        return
    games = attach_oe(games)
    oe = load_oe(season)
    covered = set(oe["league_code"].dropna())
    g = games[games["league_code"].isin(covered)]

    print("\nLignes joueur-partie Leaguepedia retrouvées dans Oracle's Elixir :")
    rate = g.groupby("league_code")["oe_match"].mean().sort_values()
    print((100 * rate).round(0).astype(int).astype(str).add(" %").to_string())

    per_player = g.groupby(["player", "league_code", "role"])["oe_match"].agg(["sum", "count"])
    missing = per_player[(per_player["count"] >= 5) & (per_player["sum"] == 0)]
    if not missing.empty:
        print(f"\n{len(missing)} joueurs (5+ parties) sans aucune partie retrouvée :")
        for code, grp in missing.reset_index().groupby("league_code"):
            print(f"  {code}: " + ", ".join(f"{p} ({r})" for p, r in zip(grp["player"], grp["role"])))

    not_covered = sorted(set(games["league_code"]) - covered)
    print("\nNos ligues absentes d'Oracle's Elixir :", ", ".join(not_covered) or "aucune")
    unmapped = set(oe["league"]) - set(league_map(season))
    print("Ligues Oracle's Elixir non utilisées :", ", ".join(sorted(unmapped)))


if __name__ == "__main__":
    import sys
    season = int(sys.argv[1]) if len(sys.argv) > 1 else 2026
    cov = coverage(season)
    if cov is None:
        print(f"Aucun fichier Oracle's Elixir pour {season} dans {OE_DIR}/")
    else:
        print(cov.to_string())
        match_report(season)
