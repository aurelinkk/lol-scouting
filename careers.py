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
from region import RAW_DIR, TOP_LEAGUES, not_region_sql, region_sql

TITLES = f"{RAW_DIR}/titles.csv"
AWARDS = f"{RAW_DIR}/awards.csv"

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
              f"AND ({region_sql()} OR T.Region='International')",
    )
    df = pd.DataFrame(rows, columns=["tournament", "season", "team", "place"])
    df["season"] = pd.to_numeric(df["season"], errors="coerce")
    os.makedirs(RAW_DIR, exist_ok=True)
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
        where=f"IA.Player IS NOT NULL AND ({region_sql()} OR T.Region='International')",
    )
    df = pd.DataFrame(rows, columns=["player", "team", "award", "tournament", "season", "league"])
    df = df[df["player"].astype(str).str.len() > 0]
    os.makedirs(RAW_DIR, exist_ok=True)
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
    # Équipes invitées en LEC (ex : KC Blue en LEC Versus 2026) : pas une période en LEC
    lec = g[g["tier"] == "LEC"]
    special = lec["tournament"].str.contains(r"Versus|Showmatch|All-Star", case=False, na=False)
    regular = set(zip(lec.loc[~special, "season"], lec.loc[~special, "team"]))
    guest = (g["tier"] == "LEC") & ~pd.Series(list(zip(g["season"], g["team"])), index=g.index).isin(regular)
    g = g[~guest]
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
    st = st.assign(start=pd.to_datetime(st["start"]), end=pd.to_datetime(st["end"]))
    st = st.assign(days=(st["end"] - st["start"]).dt.days + 1)
    return st.groupby(["player", "tier"]).agg(games=("games", "sum"), days=("days", "sum")).reset_index()


# --------------------------------------------------------------------------
# Parties hors EMEA (joueurs venus d'une autre région : ex. Zest et Feisty,
# LØS en CBLOL en 2026, avant de rejoindre la LEC en 2027)
# --------------------------------------------------------------------------
OUTSIDE = RAW_DIR + "/outside_{season}.csv"
INTERNATIONAL = r"World Championship|Mid-Season Invitational|Esports World Cup|First Stand|Asian Games"
LEAGUE_SHORT = {
    "Circuit Brazilian League of Legends": "CBLOL",
    "LoL Champions Korea": "LCK",
    "LoL Champions Korea Challengers League": "LCK CL",
    "Tencent LoL Pro League": "LPL",
    "League of Legends Championship Series": "LCS",
    "League of Legends Championship of The Americas": "LTA",
    "LTA North": "LTA N", "LTA South": "LTA S",
    "League of Legends Championship Pacific": "LCP",
    "North American Challengers League": "NACL",
    "Liga Latinoamérica": "LLA",
    # Vu depuis la NA
    "LoL EMEA Championship": "LEC", "La Ligue Française": "LFL",
    "Prime League Pro Division": "PRM", "Liga Española de League of Legends": "LES",
    "LVP SuperLiga": "LVP SL", "Northern League of Legends Championship": "NLC",
    "EMEA Masters": "EM",
    "LCK Challengers League": "LCK CL", "LCK Academy Series": "LCK AS",
    # Chine, Pacifique, Brésil / Amérique latine
    "LoL Development League": "LDL", "Asia Masters Elite Invitational Tournament": "AME",
    "City Heroes Championship": "CHC",
    "Pacific Championship Series": "PCS", "Vietnam Championship Series": "VCS", "LoL Japan League": "LJL",
    "LoL Circuit Oceania": "LCO",
    "League of Legends Championship of The Americas North": "LTA N",
    "League of Legends Championship of The Americas South": "LTA S",
    "Liga Latinoamerica": "LLA", "Circuit Brazilian League of Legends Academy": "CBLOL A",
    "Circuito Desafiante": "CD", "Liga Regional Norte": "LRN", "Liga Regional Sur": "LRS",
}


def fetch_outside_games(players, season, refresh=False):
    """Parties de `players` hors EMEA pendant `season` (cache par saison)."""
    path = OUTSIDE.format(season=season)
    cached = pd.read_csv(path) if os.path.exists(path) and not refresh else pd.DataFrame(
        columns=["player", "team", "league", "region", "tournament", "date", "game_id"])
    todo = sorted(set(players) - set(cached.get("checked", cached["player"]).dropna()))
    if todo:
        rows = []
        for i in range(0, len(todo), 20):
            quoted = ",".join("'" + p.replace("'", "\\'") + "'" for p in todo[i:i + 20])
            rows += cargo_query(
                tables="ScoreboardPlayers=SP,ScoreboardGames=SG,Tournaments=T,PlayerRedirects=PR",
                join_on="SP.GameId=SG.GameId,SG.OverviewPage=T.OverviewPage,SP.Link=PR.AllName",
                fields="PR.OverviewPage=player,SP.Team=team,T.League=league,T.Region=region,"
                       "T.Name=tournament,SG.DateTime_UTC=date,SG.GameId=game_id",
                where=f"PR.OverviewPage IN ({quoted}) AND T.Year={season} AND {not_region_sql()}")
        new = pd.DataFrame(rows, columns=["player", "team", "league", "region", "tournament", "date", "game_id"])
        # On note aussi les joueurs vérifiés sans partie hors EMEA (pour ne pas redemander)
        checked = pd.DataFrame({"checked": todo})
        cached = pd.concat([cached, new, checked], ignore_index=True)
        os.makedirs(RAW_DIR, exist_ok=True)
        cached.to_csv(path, index=False)
    out = cached.dropna(subset=["player"]).copy()
    out["date"] = pd.to_datetime(out["date"], errors="coerce")
    out["league_code"] = out["league"].map(LEAGUE_SHORT).fillna(out["league"])
    for col in ("league", "region", "tournament", "team"):
        out[col] = out[col].astype("string")
    out["international"] = (out["region"].eq("International").fillna(False)
                            | out["league"].str.contains(INTERNATIONAL, case=False, na=False)
                            | out["tournament"].str.contains(INTERNATIONAL, case=False, na=False))
    return out[out["player"].isin(players)]


def outside_stints(outside):
    """Périodes en club hors EMEA (ligues domestiques, pas les tournois internationaux)."""
    g = outside[~outside["international"]].sort_values(["player", "date"])
    if g.empty:
        return pd.DataFrame(columns=["player", "team", "league_code", "tier", "start", "end", "games"])
    out = (g.groupby(["player", "team", "league_code"])
           .agg(start=("date", "min"), end=("date", "max"), games=("game_id", "nunique"))
           .reset_index())
    out["tier"] = "OTHER"
    return out


# --------------------------------------------------------------------------
# Historique LEC complet (LEC depuis 2019 + EU LCS avant), toutes années
# --------------------------------------------------------------------------
LEC_HISTORY = f"{RAW_DIR}/lec_history.csv"
LEC_LEAGUES = TOP_LEAGUES  # LEC + EU LCS (ou LCS + LTA en NA, voir region.py)
# Une équipe invitée (ex : KC Blue / Los Ratones en LEC Versus 2026) ne compte
# pas : est invitée une équipe qui n'a joué que des tournois spéciaux cette année
# (ex : NAVI, arrivé au Summer 2025 avec ~10 parties, compte bien)
LEC_GUEST_EVENTS = r"Versus|Showmatch|All-Star"


def fetch_lec_history(refresh=False):
    """Parties de LEC / EU LCS par joueur, équipe et année (équipes invitées exclues)."""
    if os.path.exists(LEC_HISTORY) and not refresh:
        return pd.read_csv(LEC_HISTORY)
    leagues = ",".join(f"'{l}'" for l in LEC_LEAGUES)
    rows = cargo_query(
        tables="ScoreboardPlayers=SP,ScoreboardGames=SG,Tournaments=T,PlayerRedirects=PR",
        join_on="SP.GameId=SG.GameId,SG.OverviewPage=T.OverviewPage,SP.Link=PR.AllName",
        fields="PR.OverviewPage=player,SP.Link=link,SP.Team=team,T.Year=year,T.Name=tournament,"
               "COUNT(*)=games",
        where=f"T.League IN ({leagues})",
        group_by="PR.OverviewPage,SP.Link,SP.Team,T.Year,T.Name")
    df = pd.DataFrame(rows, columns=["player", "link", "team", "year", "tournament", "games"])
    df["player"] = df["player"].replace("", pd.NA).fillna(df["link"])
    df["year"] = pd.to_numeric(df["year"], errors="coerce")
    df["games"] = pd.to_numeric(df["games"], errors="coerce")
    special = df["tournament"].str.contains(LEC_GUEST_EVENTS, case=False, na=False)
    regular_teams = df[~special].groupby(["year", "team"]).size().reset_index()[["year", "team"]]
    df = df.merge(regular_teams, on=["year", "team"])
    df = df.groupby(["player", "team", "year"], as_index=False)["games"].sum()
    os.makedirs(RAW_DIR, exist_ok=True)
    df.to_csv(LEC_HISTORY, index=False)
    return df


def lec_before(season):
    """Joueurs ayant joué en LEC (hors équipes invitées) une saison < `season`.
    Renvoie {joueur: "équipe (année)" de leur dernière saison en LEC}."""
    hist = fetch_lec_history()
    past = hist[hist["year"] < season].sort_values(["year", "games"])
    last = past.groupby("player").last()
    return {p: f"{r['team']} ({int(r['year'])})" for p, r in last.iterrows()}
