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
from rosters import build_rosters, resolve_name
from league_strength import available_seasons, coef_window, league_coefficients, load_games
from leagues import LEAGUES, leagues_by_region
from region import RAW_DIR, REGION, WEB_DATA_DIR, WEB_PUBLIC_DIR
from promotions import compute_promotions, hit_rates
from prospects import add_game_metrics, aggregate, build_ranking
from league_talent import league_talent, season_coefficients
from scoring import EM_WEIGHT, LEAGUE_WEIGHT, ROLE_WEIGHTS, STAT_LABELS

OUT_DIR = WEB_DATA_DIR             # lu par le serveur au build (jamais envoyé tel quel)
PUBLIC_DIR = WEB_PUBLIC_DIR         # servi au navigateur (tableau filtrable)
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


def league_seasons(seasons, ids):
    """Niveau de chaque ligue saison par saison (league_talent.py), avec les
    joueurs derrière les indicateurs (montés l'année suivante, ex-LEC...)."""
    talent = league_talent()
    players = talent.attrs["players"]
    out = {}
    for season in seasons:
        coefs = season_coefficients(season)
        t = talent[talent["season"] == season].set_index("league_code")
        for code in t.index:
            r = t.loc[code]
            ps = players[(players["season"] == season) & (players["league_code"] == code)]
            ref = lambda d: [{"id": ids.get(p), "name": p, "team": tm}
                             for p, tm in zip(d["player"], d["team"])]
            up = ps[ps["up"] > 0].sort_values("up", ascending=False)
            out.setdefault(code, {})[str(season)] = {
                "coef": clean(coefs["coef"].get(code)), "base": clean(coefs["base"].get(code)),
                "talent": clean(r["talent"]), "starters": int(r["starters"]),
                "ex_lec": int(r["ex_lec_n"]),
                "above": int(r["above_n"]) if r["above_known"] else None,
                "up": int(r["up_n"]) if r["up_count"] > 0 else None,
                "up_value": clean(r["up"]),
                "cross_wins": int(r["cross_wins"]), "cross_games": int(r["cross_games"]),
                "z": {k[2:]: clean(r[k]) for k in r.index if k.startswith("z_") and pd.notna(r[k])},
                "up_players": [{**x, "value": clean(v)} for x, v in zip(ref(up), up["up"])],
                "ex_lec_players": ref(ps[ps["ex_lec"]]),
            }
    return out


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


def team_levels(season):
    """Équipe -> (ligue, niveau, région) en `season`, pour l'Europe ET la NA
    (fichiers data/pro_games_* et data/na/pro_games_*) : sert à situer la
    destination d'un joueur qui change de région (ex : Yukino -> FlyQuest, LCS)."""
    out = {}
    for region, data_dir in (("eu", "data"), ("na", "data/na")):
        path = f"{data_dir}/pro_games_{season}.csv"
        if not os.path.exists(path):
            continue
        g = pd.read_csv(path, usecols=["game_id", "team", "league", "tournament"])
        config = leagues_by_region(region).get(season, {})
        g["league_code"] = g["league"].map(lambda l: config.get(l, (l, "?"))[0])
        g["tier"] = g["league"].map(lambda l: config.get(l, (l, "?"))[1])
        g = g[g["tier"].isin(["LEC", "ERL1", "ERL2"])
              & ~g["tournament"].str.contains("Promotion|Qualifier|Invitational|Versus", case=False, na=False)]
        n = g.groupby(["team", "league_code", "tier"])["game_id"].nunique().reset_index(name="n")
        n = n[n["n"] >= 10].sort_values("n", ascending=False).drop_duplicates("team")
        for _, r in n.iterrows():
            out.setdefault(r["team"], (r["league_code"], r["tier"], region))
    return out


def export_mercato(games, ids, logos, next_season):
    """mercato.json : mercato automatique de la saison suivante (voir mercato.py)."""
    from mercato import build_mercato
    try:
        board = build_mercato(games, next_season)
    except Exception as e:
        print(f"  (mercato indisponible : {e})")
        board = None
    if board is not None and not board.empty:
        levels = team_levels(next_season - 1)

        def destination(team):
            """Club où part un joueur, avec sa ligue (ex : FlyQuest, LCS, NA)."""
            if not isinstance(team, str) or not team:
                return None
            league, tier, region = levels.get(team, (None, None, None))
            return {"team": team, "logo": logos.get(team), "league": league, "tier": tier,
                    "region": region}

        def slot(name):
            if not isinstance(name, str) or not name:
                return None
            pid = resolve_name(name, games)
            return {"name": name, "id": ids.get(pid) if pid else None}

        teams = []
        for (league, tier, team), grp in board.groupby(["league", "tier", "team"], sort=False):
            changed = (any(st not in ("inchangé", "") for st in grp["status"])
                       or any(isinstance(o, str) and o for o in grp.get("options", [])))
            teams.append({"league": league, "tier": tier, "team": team, "logo": logos.get(team),
                          "changed": changed, "slots": [
                {"role": r["role"], "before": slot(r["before"]), "after": slot(r["after"]),
                 "status": r["status"], "source": r["source"] or None,
                 "options": r.get("options") or None, "to": destination(r.get("to"))}
                for _, r in grp.iterrows()
                if r["role"] != "Coach" or isinstance(r["before"], str) or isinstance(r["after"], str)]})
        board_teams = set(board["team"])
        undecided = [{"player": p, "id": ids.get(resolve_name(p, games) or ""), "options": o}
                     for p, o in board.attrs.get("undecided", {}).items()
                     if any(t in board_teams for t in o)]
        write("mercato.json", {"season": next_season, "teams": teams, "undecided": undecided})
    elif os.path.exists(os.path.join(OUT_DIR, "mercato.json")):
        os.remove(os.path.join(OUT_DIR, "mercato.json"))



def player_ids(players):
    """Identifiants stables pour les URLs (/joueurs/<id>)."""
    ids, used = {}, set()
    for player in sorted(players):
        slug, i = slugify(player), 2
        while slug in used:
            slug, i = f"{slugify(player)}-{i}", i + 1
        ids[player] = slug
        used.add(slug)
    return ids


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seasons", type=int, nargs="+", help="par défaut : toutes celles téléchargées")
    parser.add_argument("--only", choices=["mercato"],
                        help="ne régénérer que le mercato (rapide, sans Oracle's Elixir)")
    args = parser.parse_args()
    seasons = sorted(args.seasons or available_seasons())

    if args.only == "mercato":
        games = load_games(seasons)
        _, logos = get_image_urls()
        print("Export web :")
        export_mercato(games, player_ids(games["player"].unique()), logos, max(seasons) + 1)
        return

    games = load_games(seasons)
    games = add_game_metrics(games)
    stats = aggregate(games)
    photos, logos = get_image_urls()

    ids = player_ids(stats["player"].unique())

    print("Export web :")

    # --- Coefficients de ligue -------------------------------------------
    # Coefficient affiché : les 2 dernières saisons
    coefs = league_coefficients(games, coef_window(max(seasons)))
    names = league_names()
    by_season = league_seasons(seasons, ids)
    latest = season_coefficients(max(seasons))
    write("leagues.json", [
        {**names.get(code, {"code": code, "tier": "?", "names": {}}),
         "coef": clean(latest["coef"].get(code, r["coef"])), "em_coef": clean(r["coef"]),
         "em_teams": clean(r["em_teams"]), "raw_mean": clean(r["raw_mean"]),
         "seasons": by_season.get(code, {})}
        for code, r in coefs.iterrows()
    ])

    # Club actuel = club de la dernière partie (hors EMEA Masters), toutes saisons
    club_games = games[games["tier"] != "EM"].sort_values("date")
    current_team = club_games.groupby("player")["team"].last().to_dict()
    current_league = club_games.groupby("player")["league_code"].last().to_dict()

    # --- Classements par saison --------------------------------------------
    rank_fields = ["season", "role", "team", "league_code", "tier", "age", "age_approx", "games",
                   "final", "league_score", "league_score_raw", "sample_factor",
                   "league_bonus", "league_coef", "league_coef_base", "em_score", "em_score_raw", "em_games",
                   "ex_lec", "ex_lec_malus", "soloq_bonus", "soloq_riot_id", "soloq_tier", "soloq_lp", "soloq_rank",
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
    # Saison suivante pas encore jouée : montées prévues d'après le mercato
    # (rumeurs + transferts officiels de Leaguepedia, corrections manuelles)
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
                              "from_team", "from_league", "from_season", "ex_lec"]),
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
    outside_files = glob.glob(f"{RAW_DIR}/outside_*.csv")
    if outside_files:
        from careers import fetch_outside_games
        out_games = pd.concat([fetch_outside_games(
            pd.read_csv(f)["player"].dropna().unique().tolist(), int(f[-8:-4])) for f in outside_files])
        other = outside_stints(out_games)
        if not other.empty:
            st = pd.concat([st, other], ignore_index=True)
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
            "age_approx": bool(rows["age_approx"].any()) if "age_approx" in rows else False,
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
                  "top_champions", "champion_pool", "recent_games", "recent_winrate", "recent_kda",
                  "recent_cs_min", "recent_dpm", "recent_kp", "recent_dmg_share", "recent_gold_min",
                  "recent_vision_min", "recent_deaths", "peak_lp", "peak_tier", "peak_date",
                  "soloq_score", "soloq_role_pct", "standout"]
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

    export_mercato(games, ids, logos, max(seasons) + 1)

    # --- Méta ------------------------------------------------------------
    write("meta.json", {
        "generated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "region": REGION,
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
