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
    python scout.py ligues                # saisons 2025 et 2026
    python scout.py ligues --seasons 2026
"""
import argparse
import os
import re

import pandas as pd

from scouting.sources.leaguepedia import cargo_query
from scouting.config.leagues import leagues_for
from scouting.config.regions import CORRECTIONS_DIR, DATA_DIR, HAS_EM, RAW_DIR, SHARED_RAW_DIR
from scouting.config import scoring
from scouting.config.scoring import ERL2_DISCOUNT, ERL2_PARENT, EXCLUDED_EM_TEAMS, SHRINK_APPEARANCES


def fetch_em_results(seasons, refresh=False):
    path = f"{RAW_DIR}/em_results.csv"
    if not HAS_EM:  # pas d'EMEA Masters (NA) : pas de coefficient de ligue
        return pd.DataFrame(columns=["tournament", "season", "team", "place"])
    if os.path.exists(path) and not refresh:
        df = pd.read_csv(path)
        if set(seasons) <= set(df["season"]):
            return df[df["season"].isin(seasons)]

    rows = cargo_query(
        tables="TournamentResults=TR,Tournaments=T",
        join_on="TR.OverviewPage=T.OverviewPage",
        fields="T.Name=tournament,T.Year=season,TR.Team=team,TR.Place_Number=place",
        # « European Masters » jusqu'en 2022, « EMEA Masters » depuis 2023
        where=f"T.League IN ('EMEA Masters','European Masters') AND T.Year IN ({','.join(map(str, seasons))})",
    )
    df = pd.DataFrame(rows)[["tournament", "season", "team", "place"]]
    df["season"] = df["season"].astype(int)
    df["place"] = pd.to_numeric(df["place"], errors="coerce")
    df = df[df["team"].ne("") & df["place"].notna()]

    os.makedirs(RAW_DIR, exist_ok=True)
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


TIER2_GAMES = f"{SHARED_RAW_DIR}/tier2_intl_games.csv"
TIER2_SHRINK_GAMES = 10


def fetch_tier2_games(refresh=False):
    """Parties des tournois internationaux de 2e division (ASCI, Asia Masters,
    WSCI), qualifications exclues : une ligne par équipe et par partie."""
    if os.path.exists(TIER2_GAMES) and not refresh:
        return pd.read_csv(TIER2_GAMES)
    leagues = ",".join(f"'{l}'" for l in scoring.TIER2_INTL_LEAGUES)
    rows = cargo_query(
        tables="ScoreboardGames=SG,Tournaments=T", join_on="SG.OverviewPage=T.OverviewPage",
        fields="T.Name=tournament,T.Year=season,SG.GameId=game_id,SG.Team1=team1,SG.Team2=team2,SG.WinTeam=winner",
        where=f"T.League IN ({leagues}) AND T.Region='International'")
    df = pd.DataFrame(rows, columns=["tournament", "season", "game_id", "team1", "team2", "winner"])
    df = df[~df["tournament"].str.contains("Qualifier", case=False, na=False)]
    out = pd.concat([
        pd.DataFrame({"season": df["season"], "tournament": df["tournament"], "team": df["team1"],
                      "opponent": df["team2"], "win": df["winner"] == df["team1"]}),
        pd.DataFrame({"season": df["season"], "tournament": df["tournament"], "team": df["team2"],
                      "opponent": df["team1"], "win": df["winner"] == df["team2"]}),
    ])
    out["season"] = pd.to_numeric(out["season"], errors="coerce")
    os.makedirs(SHARED_RAW_DIR, exist_ok=True)
    out.to_csv(TIER2_GAMES, index=False)
    return out


def tier2_coefficients(games, seasons):
    """Coefficient des 2e divisions hors Europe : taux de victoire des équipes de
    la ligue aux tournois internationaux de 2e division, ramené vers la valeur de
    départ de la ligue (scoring.LEAGUE_PRIOR) selon le nombre de parties."""
    codes = sorted(games.loc[games["tier"].isin(["ERL1", "ERL2"]), "league_code"].dropna().unique())
    out = pd.DataFrame(index=pd.Index(codes, name="league_code"))
    out["em_teams"], out["raw_mean"] = 0.0, float("nan")
    try:
        t2 = fetch_tier2_games()
    except Exception as e:  # pas de réseau ni de cache : valeurs de départ seules
        print(f"  (tournois internationaux de 2e division indisponibles : {e})")
        t2 = pd.DataFrame(columns=["season", "team", "win"])
    t2 = t2[t2["season"].isin(seasons)].merge(team_leagues(games), on=["season", "team"])
    by = t2.groupby("league_code")["win"].agg(["sum", "count"])
    k = TIER2_SHRINK_GAMES
    prior = pd.Series({c: float(scoring.LEAGUE_PRIOR.get(c, 0.5)) for c in codes}, dtype=float)
    wins = by["sum"].reindex(codes).fillna(0).astype(float)
    n = by["count"].reindex(codes).fillna(0).astype(float)
    out["em_teams"] = n
    out["raw_mean"] = (wins / n).where(n > 0)
    out["coef"] = (wins + prior * k) / (n + k)
    return out.sort_values("coef", ascending=False)


def league_coefficients(games, seasons, verbose=False):
    if not HAS_EM:  # hors Europe : tournois internationaux de 2e division
        return tier2_coefficients(games, seasons)
    em = fetch_em_results(seasons)
    if em.empty:
        return pd.DataFrame(columns=["em_teams", "raw_mean", "coef"], dtype=float)
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

    # Ajustements manuels (scoring.LEAGUE_COEF_ADJUST), ERL2 du pays comprises
    for code, delta in scoring.LEAGUE_COEF_ADJUST.items():
        for c in [code] + [e for e, parent in ERL2_PARENT.items() if parent == code]:
            if c in coefs.index:
                coefs.loc[c, "coef"] += delta
    return coefs.sort_values("coef", ascending=False)


def load_season(season):
    """Charge data/pro_games_<saison>.csv, ou None s'il n'existe pas.

    Les colonnes season / league_code / tier sont (re)calculées depuis
    leagues.py : les fichiers créés par une ancienne version de la collecte des matchs
    restent utilisables, et une correction de leagues.py s'applique sans
    retélécharger.
    """
    path = f"{DATA_DIR}/pro_games_{season}.csv"
    if not os.path.exists(path):
        return None
    df = pd.read_csv(path, parse_dates=["date", "birthdate"])
    config = leagues_for(season)
    df["season"] = season
    df["league_code"] = df["league"].map(lambda l: config.get(l, (l, "?"))[0])
    df["tier"] = df["league"].map(lambda l: config.get(l, (l, "?"))[1])
    return apply_birthdates(apply_player_overrides(df))


OVERRIDES_FILE = f"{CORRECTIONS_DIR}/player_overrides.csv"


def apply_player_overrides(df):
    """Corrige l'identité des joueurs que Leaguepedia a mal rattachés.

    corrections/player_overrides.csv : player_link,player
      - player_link : le nom tel qu'écrit dans le match (colonne player_link)
      - player      : le joueur auquel ces parties appartiennent vraiment
    Ex : "BOOSHI,BOOSHI (BK ROG)" sépare BOOSHI de BK ROG du Booshi de ZYB,
    que la jointure de Leaguepedia (insensible à la casse) avait fusionnés.
    """
    if not os.path.exists(OVERRIDES_FILE) or "player_link" not in df:
        return df
    overrides = pd.read_csv(OVERRIDES_FILE)
    mapping = dict(zip(overrides["player_link"], overrides["player"]))
    mask = df["player_link"].isin(mapping)
    df.loc[mask, "player"] = df.loc[mask, "player_link"].map(mapping)
    # La date de naissance / le pays venaient de l'autre joueur : on les retire
    df.loc[mask, "birthdate"] = pd.NaT
    df.loc[mask, "country"] = None
    return df


BIRTHDATES_FILE = f"{CORRECTIONS_DIR}/birthdates.csv"


def parse_birthdate(value):
    """Date complète (2004-06-28), mois (2004-06) ou année seule (2004).
    Renvoie (date, approximative ?) : l'année seule -> 1er juillet, le mois -> le 15."""
    text = str(value).strip()
    if re.fullmatch(r"\d{4}", text):
        return pd.Timestamp(f"{text}-07-01"), True
    if re.fullmatch(r"\d{4}-\d{1,2}", text):
        return pd.Timestamp(f"{text}-15"), True
    date = pd.to_datetime(text, errors="coerce")
    return date, False


def apply_birthdates(df):
    """Complète / corrige les dates de naissance avec corrections/birthdates.csv (saisie manuelle).

    Leaguepedia n'a pas la date de naissance de beaucoup de joueurs d'ERL.
    La date saisie à la main est prioritaire sur celle de Leaguepedia.
    Une année seule (ex : 2004, déduite d'un « 22 ans » vu sur Twitter) est
    acceptée : l'âge est alors marqué approximatif (« ~22 ans »).
    """
    df["birthdate_approx"] = False
    if not os.path.exists(BIRTHDATES_FILE):
        return df
    manual = pd.read_csv(BIRTHDATES_FILE, dtype=str).fillna("")
    parsed = {p: parse_birthdate(b) for p, b in zip(manual["player"], manual["birthdate"]) if b}
    dates = {p: d for p, (d, _) in parsed.items() if not pd.isna(d)}
    approx = {p for p, (d, a) in parsed.items() if a and not pd.isna(d)}
    key = df["player"].where(df["player"].isin(dates), df.get("player_link", df["player"]))
    override = key.map(dates)
    df["birthdate"] = pd.to_datetime(override).fillna(df["birthdate"])
    df["birthdate_approx"] = key.isin(approx) & override.notna()
    return df


def available_seasons():
    """Saisons configurées dans leagues.py dont le fichier de parties existe."""
    from scouting.config.leagues import LEAGUES
    return sorted(s for s in LEAGUES if os.path.exists(f"{DATA_DIR}/pro_games_{s}.csv"))


def coef_window(season, years=2):
    """Saisons utilisées pour le coefficient de ligue d'une saison : fenêtre
    glissante de 2 ans (la saison et la précédente), parmi celles disponibles."""
    window = [s for s in available_seasons() if season - years < s <= season]
    return window or [season]


def load_games(seasons):
    frames = [df for df in map(load_season, seasons) if df is not None]
    if not frames:
        raise SystemExit("Aucune donnée : lance d'abord python scout.py matchs")
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
