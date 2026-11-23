"""Résultats et historique des équipes (page équipe du site, onglet Résultats).

- results.json : classement de chaque équipe de la région dans chaque tournoi
  joué (ligues de la région + Worlds, MSI, EWC, First Stand, EMEA Masters),
  d'après la table TournamentResults de Leaguepedia, avec le bilan en parties
  et l'effectif aligné (d'après les parties jouées).
- matches.json : toutes les parties de la région et les parties
  internationales de ses équipes, avec les joueurs, champions et stats
  (K/D/A, CS, gold, dégâts) de chaque côté.

Les deux fichiers vont dans web/data/<région>/ (lus par le serveur au build).
Appelé par export_web.py ; seul : SCOUT_REGION=kr python team_history.py
"""
import json
import os

import pandas as pd

from intl import INTL_LEAGUES, load_intl
from leaguepedia import cargo_query
from leagues import leagues_by_region
from region import RAW_DIR, REGION, WEB_DATA_DIR

ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"]
CACHE = RAW_DIR + "/team_results_{season}.csv"


def league_names(seasons):
    """Noms Leaguepedia des ligues suivies dans la région + compétitions internationales."""
    names = set(INTL_LEAGUES)
    if REGION == "eu":
        names |= {"EMEA Masters", "European Masters"}
    config = leagues_by_region(REGION)
    for s in seasons:
        names |= set(config.get(s, {}))
    return sorted(names)


def fetch_results(seasons, refresh=False):
    """Classements par tournoi (TournamentResults + Tournaments), une saison à la fois
    (cache data/raw ; la saison en cours est relue à chaque export)."""
    frames = []
    current = max(seasons)
    names = league_names(seasons)
    for season in seasons:
        path = CACHE.format(season=season)
        if os.path.exists(path) and not refresh and season != current:
            frames.append(pd.read_csv(path, dtype=str, keep_default_na=False))
            continue
        rows = []
        for i in range(0, len(names), 12):
            quoted = ",".join("'" + n.replace("'", "\\'") + "'" for n in names[i:i + 12])
            rows += cargo_query(
                tables="TournamentResults=TR,Tournaments=T", join_on="TR.OverviewPage=T.OverviewPage",
                fields="T.Name=tournament,T.League=league,T.DateStart=start,T.Date=end,TR.Team=team,"
                       "TR.Place=place,TR.Place_Number=place_n,TR.Prize_USD=prize,TR.Phase=phase,"
                       "TR.LastResult=last_result,TR.GroupName=group_name",
                where=f"T.League IN ({quoted}) AND T.Year={season} AND TR.Team IS NOT NULL")
        df = pd.DataFrame(rows, columns=["tournament", "league", "start", "end", "team", "place", "place_n",
                                         "prize", "phase", "last_result", "group_name"]).fillna("")
        df["season"] = str(season)
        os.makedirs(RAW_DIR, exist_ok=True)
        df.to_csv(path, index=False)
        frames.append(df)
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


GAME_FIELDS = ["GameId", "Team1", "Team2", "Team1Bans", "Team2Bans", "Team1Dragons", "Team2Dragons",
               "Team1Elders", "Team2Elders", "Team1Barons", "Team2Barons", "Team1Towers", "Team2Towers",
               "Team1Gold", "Team2Gold", "Team1Kills", "Team2Kills", "Team1RiftHeralds", "Team2RiftHeralds",
               "Team1VoidGrubs", "Team2VoidGrubs", "Team1Atakhans", "Team2Atakhans",
               "Team1Inhibitors", "Team2Inhibitors", "Patch"]
GAMES_CACHE = RAW_DIR + "/team_games_{season}.csv"


def fetch_game_details(seasons, refresh=False):
    """Stats d'équipe de chaque partie (ScoreboardGames) : tours, dragons, barons,
    hérauts, larves, Atakhan, inhibiteurs, gold, kills, bans, patch."""
    frames = []
    current = max(seasons)
    names = league_names(seasons)
    for season in seasons:
        path = GAMES_CACHE.format(season=season)
        if os.path.exists(path) and not refresh and season != current:
            frames.append(pd.read_csv(path, dtype=str, keep_default_na=False))
            continue
        rows = []
        for i in range(0, len(names), 12):
            quoted = ",".join("'" + n.replace("'", "\\'") + "'" for n in names[i:i + 12])
            rows += cargo_query(
                tables="ScoreboardGames=SG,Tournaments=T", join_on="SG.OverviewPage=T.OverviewPage",
                fields=",".join(f"SG.{f}={f}" for f in GAME_FIELDS),
                where=f"T.League IN ({quoted}) AND T.Year={season}")
        df = pd.DataFrame(rows, columns=GAME_FIELDS).fillna("")
        os.makedirs(RAW_DIR, exist_ok=True)
        df.to_csv(path, index=False)
        frames.append(df)
    df = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(columns=GAME_FIELDS)
    return df.drop_duplicates("GameId").set_index("GameId")


OBJ_KEYS = ["Towers", "Dragons", "Barons", "RiftHeralds", "VoidGrubs", "Inhibitors", "Gold", "Elders", "Atakhans"]


def side_details(g, n):
    """Objectifs de l'équipe n (1 ou 2) d'une ligne ScoreboardGames, en liste compacte
    [tours, dragons, barons, hérauts, larves, inhibiteurs, gold, elders, atakhans],
    et ses bans."""
    def num(f):
        v = pd.to_numeric(g.get(f"Team{n}{f}", ""), errors="coerce")
        return None if pd.isna(v) else int(v)
    obj = [num(f) for f in OBJ_KEYS]
    while obj and obj[-1] is None:
        obj.pop()
    bans = [b.strip() for b in str(g.get(f"Team{n}Bans", "")).split(",") if b.strip() and b.strip().lower() != "none"]
    return obj, bans


def intl_games(seasons, teams):
    """Parties internationales des équipes de la région."""
    frames = []
    for s in seasons:
        df = load_intl(s)
        if df is None:
            continue
        df = df[df["team"].isin(teams) | df["game_id"].isin(df.loc[df["team"].isin(teams), "game_id"])]
        frames.append(df.assign(season=s, league_code=df["event"], tier="INTL"))
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


def lineups(games, ids):
    """Effectif aligné par (tournoi, équipe) : joueurs avec leurs parties, titulaires d'abord."""
    g = (games.groupby(["tournament", "team", "player", "role"])["game_id"].nunique()
         .reset_index(name="games").sort_values("games", ascending=False))
    out = {}
    for (tournament, team), grp in g.groupby(["tournament", "team"]):
        out[(tournament, team)] = [
            {"name": r["player"], "id": ids.get(r["player"]), "role": r["role"], "games": int(r["games"])}
            for _, r in grp.iterrows()]
    return out


def build_results(games, ids, seasons, refresh=False):
    teams = set(games.loc[games["tier"].isin(["LEC", "ERL1", "ERL2"]), "team"])
    intl = intl_games(seasons, teams)
    every = pd.concat([games, intl], ignore_index=True) if len(intl) else games
    try:
        res = fetch_results(seasons, refresh)
    except Exception as e:  # pas de réseau : pas de classements, mais les bilans restent
        print(f"  (classements indisponibles : {e})")
        res = pd.DataFrame(columns=["tournament", "league", "start", "end", "team", "place", "place_n",
                                    "prize", "phase", "last_result", "group_name", "season"])
    res = res[res["team"].isin(teams)]
    # Bilan en parties par (tournoi, équipe)
    per_game = every.drop_duplicates(["game_id", "team"])
    record = per_game.groupby(["tournament", "team"])["win"].agg(
        wins=lambda w: int(w.astype(str).str.lower().isin(["true", "1"]).sum()), games="count")
    lu = lineups(every, ids)
    tier_of = every.drop_duplicates("tournament").set_index("tournament")["tier"].to_dict()
    code_of = every.drop_duplicates("tournament").set_index("tournament")["league_code"].to_dict()
    out, seen = [], set()
    for _, r in res.iterrows():
        key = (r["tournament"], r["team"])
        if key in seen:  # plusieurs phases : la première ligne (classement final) suffit
            continue
        seen.add(key)
        rec = record.loc[key] if key in record.index else None
        place_n = pd.to_numeric(r["place_n"], errors="coerce")
        prize = pd.to_numeric(r["prize"], errors="coerce")
        out.append({
            "season": int(r["season"]), "tournament": r["tournament"], "league": r["league"],
            "code": code_of.get(r["tournament"]), "tier": tier_of.get(r["tournament"]),
            "intl": r["league"] in INTL_LEAGUES or r["league"] in ("EMEA Masters", "European Masters"),
            "start": r["start"][:10] or None, "end": r["end"][:10] or None,
            "team": r["team"], "place": r["place"] or None,
            "place_n": None if pd.isna(place_n) else int(place_n),
            "prize": None if pd.isna(prize) or not prize else int(prize),
            "last": r["last_result"] or None,
            "wins": int(rec["wins"]) if rec is not None else None,
            "games": int(rec["games"]) if rec is not None else None,
            "lineup": lu.get(key, []),
        })
    # Tournois joués sans ligne de classement (en cours, ou pas renseignés) : bilan seul
    for (tournament, team), rec in record.iterrows():
        if team not in teams or (tournament, team) in seen:
            continue
        sub = every[(every["tournament"] == tournament) & (every["team"] == team)]
        out.append({
            "season": int(sub["season"].iloc[0]), "tournament": tournament,
            "league": sub["league"].iloc[0] if "league" in sub else None,
            "code": code_of.get(tournament), "tier": tier_of.get(tournament),
            "intl": tier_of.get(tournament) == "INTL" or code_of.get(tournament) == "EM",
            "start": str(sub["date"].min())[:10], "end": str(sub["date"].max())[:10],
            "team": team, "place": None, "place_n": None, "prize": None, "last": None,
            "wins": int(rec["wins"]), "games": int(rec["games"]), "lineup": lu.get((tournament, team), []),
        })
    return sorted(out, key=lambda x: (x["end"] or x["start"] or "", x["tournament"]), reverse=True), every


def build_matches(every, ids, details=None):
    """Une ligne par partie : date, tournoi, les deux équipes, vainqueur, durée, et
    pour chaque équipe les joueurs et champions dans l'ordre des postes."""
    out = []
    rank = {r: i for i, r in enumerate(ROLES)}
    for gid, g in every.groupby("game_id"):
        teams = list(dict.fromkeys(g["team"]))
        if len(teams) != 2:
            continue
        sides = []
        for t in teams:
            tg = g[g["team"] == t].sort_values("role", key=lambda s: s.map(rank).fillna(9))
            win = str(tg["win"].iloc[0]).lower() in ("true", "1")
            def num(v):
                return None if pd.isna(v) else int(round(float(v)))
            # [pseudo, id, champion, kills, morts, assists, CS, gold, dégâts]
            sides.append({"team": t, "win": win,
                          "players": [[r["player"], ids.get(r["player"]), r["champion"],
                                       num(r.get("kills")), num(r.get("deaths")), num(r.get("assists")),
                                       num(r.get("cs")), num(r.get("gold")), num(r.get("damage"))]
                                      for _, r in tg.iterrows()]})
        first = g.iloc[0]
        extra = {}
        if details is not None and gid in details.index:
            row = details.loc[gid]
            t1, t2 = row.get("Team1", ""), row.get("Team2", "")
            for side in sides:
                n = 1 if side["team"] == t1 else 2 if side["team"] == t2 else None
                if n:
                    side["o"], side["bans"] = side_details(row, n)
            if row.get("Patch"):
                extra["patch"] = row["Patch"]
        out.append({**extra,
            "date": str(first["date"])[:16], "season": int(first["season"]),
            "tournament": first["tournament"], "code": first.get("league_code"),
            "duration": None if pd.isna(first.get("duration_min")) else round(float(first["duration_min"]), 1),
            "a": sides[0], "b": sides[1],
        })
    return sorted(out, key=lambda m: m["date"], reverse=True)


def export_team_history(games, ids, seasons, refresh=False):
    results, every = build_results(games, ids, seasons, refresh)
    try:
        details = fetch_game_details(seasons, refresh)
    except Exception as e:  # pas de réseau : parties sans les objectifs
        print(f"  (stats d'équipe des parties indisponibles : {e})")
        details = None
    matches = build_matches(every, ids, details)
    os.makedirs(WEB_DATA_DIR, exist_ok=True)
    for name, data in (("results.json", results), ("matches.json", matches)):
        path = os.path.join(WEB_DATA_DIR, name)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"), default=str)
        print(f"  {path} ({os.path.getsize(path) // 1024} Ko)")


if __name__ == "__main__":
    import argparse

    from export_web import player_ids
    from league_strength import available_seasons, load_games

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--refresh", action="store_true", help="retélécharger les classements")
    args = parser.parse_args()
    seasons = sorted(available_seasons())
    games = load_games(seasons)
    ids = player_ids(games["player"].unique())
    published = os.path.join(WEB_DATA_DIR, "players.json")
    if os.path.exists(published):
        with open(published, encoding="utf-8") as f:
            ids.update({p["name"]: pid for pid, p in json.load(f).items()})
    print("Historique des équipes :")
    export_team_history(games, ids, seasons, args.refresh)
