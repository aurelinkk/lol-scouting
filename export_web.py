"""Exporte les données calculées en JSON pour la web app (dossier web/data/).

Usage :
    python export_web.py                    # toutes les saisons téléchargées
    python export_web.py --seasons 2025 2026

À relancer après chaque fetch_pro.py, puis commit + push : Vercel redéploie
le site automatiquement.
"""
import argparse
import datetime
import json
import math
import os
import re
import unicodedata

import pandas as pd

import glob

from careers import (fetch_awards, fetch_titles, level_totals, outside_stints, stints,
                     titles_by_player)
from images import get_image_urls
from rosters import ROLES as ROSTER_ROLES, build_rosters, load_mercato, mercato_file, resolve_name
from league_strength import available_seasons, coef_window, league_coefficients, load_games
from leagues import LEAGUES
from promotions import compute_promotions, hit_rates
from prospects import add_game_metrics, aggregate, build_ranking
from scoring import EM_WEIGHT, LEAGUE_WEIGHT, ROLE_WEIGHTS, STAT_LABELS

OUT_DIR = "web/data"                # lu par le serveur au build (jamais envoyé tel quel)
PUBLIC_DIR = "web/public/data"      # servi au navigateur (tableau filtrable)
STATS = list(STAT_LABELS)
LOWER_IS_BETTER = {"deaths_pg", "fb_victim"}
MIN_PEER_GAMES = 10


def slugify(name):
    text = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "joueur"


def clean(value, digits=3):
    """Valeur JSON propre : NaN -> None, arrondi des flottants."""
    if value is None:
        return None
    if isinstance(value, (pd.Timestamp, datetime.date)):
        return None if pd.isna(value) else value.strftime("%Y-%m-%d")
    if isinstance(value, float) or hasattr(value, "dtype"):
        try:
            f = float(value)
        except (TypeError, ValueError):
            return value
        if math.isnan(f):
            return None
        return int(f) if f.is_integer() and abs(f) > 1 else round(f, digits)
    return value


def record(row, fields):
    """Champs non vides seulement (allège les JSON)."""
    out = {}
    for f in fields:
        v = clean(row.get(f))
        if v is not None:
            out[f] = v
    return out


def write(name, data, directory=OUT_DIR):
    os.makedirs(directory, exist_ok=True)
    path = os.path.join(directory, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  {path} ({os.path.getsize(path) / 1024:.0f} Ko)")


def league_names():
    names = {}
    for season, config in LEAGUES.items():
        for league, (code, tier) in config.items():
            names.setdefault(code, {"code": code, "tier": tier, "names": {}})
            names[code]["names"][str(season)] = league
    return names


def peer_percentiles(stats):
    """Pour chaque ligne : moyenne du poste dans la ligue et percentile, par stat."""
    out = {}
    eligible = stats[stats["games"] >= MIN_PEER_GAMES]
    for (season, code, role), group in stats.groupby(["season", "league_code", "role"]):
        peers = eligible[(eligible["season"] == season) & (eligible["league_code"] == code)
                         & (eligible["role"] == role)]
        for idx, row in group.iterrows():
            entry = {"n": len(peers)}
            for stat in STATS:
                col = peers[stat].dropna() if stat in peers else pd.Series(dtype=float)
                value = row.get(stat)
                if pd.isna(value) or col.empty:
                    continue
                beaten = (col > value) if stat in LOWER_IS_BETTER else (col < value)
                entry[stat] = {"avg": clean(col.mean()), "pct": clean(beaten.mean(), 2)}
            out[idx] = entry
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seasons", type=int, nargs="+", help="par défaut : toutes celles téléchargées")
    args = parser.parse_args()
    seasons = sorted(args.seasons or available_seasons())

    games = load_games(seasons)
    games = add_game_metrics(games)
    stats = aggregate(games)
    photos, logos = get_image_urls()

    # Identifiants stables pour les URLs (/joueurs/<id>)
    ids, used = {}, set()
    for player in sorted(stats["player"].unique()):
        slug, i = slugify(player), 2
        while slug in used:
            slug, i = f"{slugify(player)}-{i}", i + 1
        ids[player] = slug
        used.add(slug)

    print("Export web :")

    # --- Coefficients de ligue -------------------------------------------
    # Coefficient affiché : les 2 dernières saisons
    coefs = league_coefficients(games, coef_window(max(seasons)))
    names = league_names()
    write("leagues.json", [
        {**names.get(code, {"code": code, "tier": "?", "names": {}}),
         "coef": clean(r["coef"]), "em_teams": clean(r["em_teams"]),
         "raw_mean": clean(r["raw_mean"])}
        for code, r in coefs.iterrows()
    ])

    # Club actuel = club de la dernière partie (hors EMEA Masters), toutes saisons
    club_games = games[games["tier"] != "EM"].sort_values("date")
    current_team = club_games.groupby("player")["team"].last().to_dict()
    current_league = club_games.groupby("player")["league_code"].last().to_dict()

    # --- Classements par saison --------------------------------------------
    rank_fields = ["season", "role", "team", "league_code", "tier", "age", "games",
                   "final", "league_score", "league_score_raw", "sample_factor",
                   "league_bonus", "em_score", "em_score_raw", "em_games",
                   "soloq_bonus", "soloq_riot_id", "soloq_tier", "soloq_lp", "soloq_rank",
                   "soloq_games", "soloq_winrate", "soloq_lp_7d", "soloq_games_7d",
                   "role_percentile", "played_lec"] + STATS
    rankings = []
    scores = {}  # (season, player) -> détail du score
    for season in seasons:
        ranking = build_ranking(games, season, coef_window(season))
        for _, r in ranking.iterrows():
            rec = record(r, rank_fields)
            rec.update(id=ids[r["player"]], name=r["player"], played_lec=bool(r["played_lec"]))
            cur = current_team.get(r["player"], r["team"])
            for key, value in (("photo", photos.get(r["player"])), ("logo", logos.get(r["team"])),
                               ("country", clean(r.get("country"))),
                               ("current_team", cur), ("current_logo", logos.get(cur)),
                               ("current_league", current_league.get(r["player"]))):
                if value:
                    rec[key] = value
            rankings.append(rec)
            scores[(season, r["player"])] = rec
    # Un fichier par saison : l'onglet Données ne charge que la saison choisie
    for season in seasons:
        write(f"rankings_{season}.json", [r for r in rankings if r["season"] == season], PUBLIC_DIR)
    old = os.path.join(PUBLIC_DIR, "rankings.json")
    if os.path.exists(old):
        os.remove(old)

    # --- Montées entre saisons consécutives ------------------------------
    promos = []
    pairs = list(zip(seasons, seasons[1:]))
    # Saison suivante pas encore jouée mais mercato saisi : montées prévues
    if os.path.exists(mercato_file(max(seasons) + 1)):
        pairs.append((max(seasons), max(seasons) + 1))
    for s_from, s_to in pairs:
        merged = compute_promotions(games, s_from, s_to)
        moved = merged[(merged["new_level"] == "LEC")
                       | ((merged["tier"] == "ERL2") & (merged["new_level"] == "ERL1"))]
        promos.append({
            "from": s_from, "to": s_to,
            "hit_rates": hit_rates(merged).to_dict("records"),
            "players": [
                {**record(r, ["role", "age", "team", "league_code", "tier", "games",
                              "final", "role_percentile", "tier_percentile", "em_games",
                              "em_score", "winrate", "kda", "dpm", "new_level", "new_team",
                              "from_team", "from_league", "from_season"]),
                 "id": ids[r["player"]], "name": r["player"],
                 "photo": photos.get(r["player"]), "logo": logos.get(r["team"]),
                 "from_logo": logos.get(r["from_team"]),
                 "new_logo": logos.get(r["new_team"])}
                for _, r in moved.sort_values("final", ascending=False).iterrows()
            ],
        })
    write("promotions.json", promos)

    # --- Fiches joueurs ----------------------------------------------------
    peers = peer_percentiles(stats)
    evolution = (games.groupby(["player", "season", "tournament", "league_code", "tier", "role"])
                 .agg(date=("date", "min"), games=("game_id", "nunique"), wins=("win", "sum"),
                      kills=("kills", "sum"), deaths=("deaths", "sum"),
                      assists=("assists", "sum"), cs=("cs", "sum"), gold=("gold", "sum"),
                      damage=("damage", "sum"), minutes=("duration_min", "sum"),
                      kp=("kp", "mean"), dmg_share=("dmg_share", "mean"))
                 .reset_index())

    # Carrière : périodes en club, titres, récompenses individuelles
    st = stints(games)
    # Périodes hors EMEA déjà relevées (ex : LØS en CBLOL pour Zest et Feisty)
    outside_files = glob.glob("data/raw/outside_*.csv")
    if outside_files:
        from careers import fetch_outside_games
        out_games = pd.concat([fetch_outside_games(
            pd.read_csv(f)["player"].dropna().unique().tolist(), int(f[-8:-4])) for f in outside_files])
        st = pd.concat([st, outside_stints(out_games)], ignore_index=True)
    st = st.sort_values(["player", "start"])
    st_by = {p: g for p, g in st.groupby("player")}
    lv_by = {p: g for p, g in level_totals(st[st["tier"] != "OTHER"]).groupby("player")}
    tt = titles_by_player(games, fetch_titles(seasons))
    tt_by = {p: g for p, g in tt.groupby("player")}
    aw = fetch_awards()
    aw_by = {p: g for p, g in aw.groupby("player")}

    def career(player):
        out = {"stints": [], "levels": {}, "titles": [], "awards": []}
        if player in st_by:
            out["stints"] = [
                {**record(r, ["team", "league_code", "tier", "role", "games", "wins", "em_games"]),
                 "start": clean(r["start"]), "end": clean(r["end"]), "logo": logos.get(r["team"])}
                for _, r in st_by[player].iterrows()]
        if player in lv_by:
            out["levels"] = {r["tier"]: {"games": int(r["games"]), "days": int(r["days"])}
                             for _, r in lv_by[player].iterrows()}
        if player in tt_by:
            out["titles"] = [
                {**record(r, ["tournament", "team", "league_code", "tier", "season"]),
                 "date": clean(r["date"]), "logo": logos.get(r["team"])}
                for _, r in tt_by[player].iterrows()]
        if player in aw_by:
            out["awards"] = [
                {**record(r, ["award", "tournament", "team", "season", "league"])}
                for _, r in aw_by[player].sort_values("season").iterrows()]
        return out

    today = pd.Timestamp(datetime.date.today())
    players = {}
    for player, rows in stats.groupby("player"):
        rows = rows.sort_values(["season", "games"], ascending=[True, False])
        # Situation actuelle = la ligne de sa partie la plus récente, hors EMEA
        # Masters (on veut la ligue de son club, pas le tournoi international)
        club_rows = rows[rows["tier"] != "EM"]
        latest = (club_rows if len(club_rows) else rows)
        latest = latest.loc[latest["last_game"].idxmax()]
        birth = rows["birthdate"].dropna()
        evo = evolution[evolution["player"] == player].sort_values("date")
        players[ids[player]] = {
            "id": ids[player], "name": player,
            "photo": photos.get(player), "country": clean(latest.get("country")),
            "birthdate": clean(birth.iloc[0]) if len(birth) else None,
            "age": clean(round((today - birth.iloc[0]).days / 365.25, 1)) if len(birth) else None,
            "team": latest["team"], "logo": logos.get(latest["team"]),
            "role": latest["role"], "league_code": latest["league_code"],
            "tier": latest["tier"],
            "lines": [
                {**record(r, ["season", "league_code", "tier", "team", "role", "games"] + STATS),
                 "logo": logos.get(r["team"]), "peers": peers.get(idx, {})}
                for idx, r in rows.iterrows()
            ],
            "scores": [{k: v for k, v in scores[(s, player)].items()
                        if k not in ("name", "photo", "id") and v is not None}
                       for s in seasons if (s, player) in scores],
            "career": career(player),
            "evolution": [
                {"season": int(e["season"]), "tournament": e["tournament"],
                 "league_code": e["league_code"], "tier": e["tier"], "role": e["role"],
                 "date": clean(e["date"]), "games": int(e["games"]),
                 "winrate": clean(e["wins"] / e["games"]),
                 "kda": clean((e["kills"] + e["assists"]) / max(e["deaths"], 1)),
                 "cs_min": clean(e["cs"] / e["minutes"]),
                 "gold_min": clean(e["gold"] / e["minutes"]),
                 "dpm": clean(e["damage"] / e["minutes"]),
                 "kp": clean(e["kp"]), "dmg_share": clean(e["dmg_share"])}
                for _, e in evo.iterrows()
            ],
        }
    write("players.json", players)

    # --- Ladder soloQ EUW (dernier relevé de soloq.py) ------------------------
    from soloq import latest_ladder
    ladder = latest_ladder()
    if ladder is not None:
        fields = ["rank", "riot_id", "tier", "lp", "games", "winrate", "hot_streak",
                  "lp_7d", "games_7d", "lp_30d", "games_30d", "main_role", "main_role_share",
                  "top_champions", "recent_games", "recent_winrate", "recent_kda", "recent_cs_min"]
        rows = []
        for _, r in ladder.iterrows():
            rec = record(r, fields)
            if isinstance(r.get("pro"), str):
                rec["pro"] = r["pro"]
                if r["pro"] in ids:
                    rec["pro_id"] = ids[r["pro"]]
                    rec["pro_team"] = current_team.get(r["pro"])
            rows.append(rec)
        write("ladder.json", {"date": ladder["snapshot_date"].iloc[0], "rows": rows}, PUBLIC_DIR)

    # --- Rosters (LEC + ERL1, d'après les parties jouées) -------------------
    rc = build_rosters(games)
    roster_list = []
    for (season, code, tournament), grp in rc.groupby(["season", "league_code", "tournament"]):
        teams = []
        for team, tg in grp.groupby("team"):
            tg = tg.sort_values("games", ascending=False)
            teams.append({"team": team, "logo": logos.get(team), "players": [
                {"id": ids.get(r["player"]), "name": r["player"], "role": r["role"],
                 "games": int(r["games"]), "photo": photos.get(r["player"])}
                for _, r in tg.iterrows()]})
        roster_list.append({"season": int(season), "league_code": code,
                            "tier": grp["tier"].iloc[0], "tournament": tournament,
                            "start": clean(grp["start"].min()),
                            "teams": sorted(teams, key=lambda t: t["team"].lower())})
    write("rosters.json", sorted(roster_list, key=lambda r: (r["season"], r["start"])), PUBLIC_DIR)

    # --- Mercato de la saison suivante (rosters_<saison>.csv) ------------------
    next_season = max(seasons) + 1
    mercato = load_mercato(next_season)
    if mercato is not None:
        before_col, after_col = f"player_{next_season - 1}", f"player_{next_season}"

        def slot(name):
            if not name:
                return None
            pid = resolve_name(name, games)
            return {"name": name, "id": ids.get(pid) if pid else None,
                    "photo": photos.get(pid) if pid else None}

        teams = []
        for (league, team), grp in mercato.groupby(["league", "team"], sort=False):
            teams.append({"league": league, "team": team, "logo": logos.get(team), "slots": [
                {"role": r["role"], "before": slot(r[before_col]), "after": slot(r[after_col])}
                for _, r in grp.iterrows()]})
        write("mercato.json", {"season": next_season, "teams": teams})
    elif os.path.exists(os.path.join(OUT_DIR, "mercato.json")):
        os.remove(os.path.join(OUT_DIR, "mercato.json"))

    # --- Méta ------------------------------------------------------------
    write("meta.json", {
        "generated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "seasons": seasons,
        "games": int(games["game_id"].nunique()),
        "players": len(players),
        "leagues": int(games["league_code"].nunique()),
        "weights": ROLE_WEIGHTS, "league_weight": LEAGUE_WEIGHT, "em_weight": EM_WEIGHT,
        "stat_labels": STAT_LABELS,
        "has_oe": bool((stats["oe_games"] > 0).any()),
        "has_soloq": ladder is not None,
    })


if __name__ == "__main__":
    main()
