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

from images import get_image_urls
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
    write("rankings.json", rankings, PUBLIC_DIR)

    # --- Montées entre saisons consécutives ------------------------------
    promos = []
    for s_from, s_to in zip(seasons, seasons[1:]):
        merged = compute_promotions(games, s_from, s_to)
        moved = merged[(merged["new_level"] == "LEC")
                       | ((merged["tier"] == "ERL2") & (merged["new_level"] == "ERL1"))]
        promos.append({
            "from": s_from, "to": s_to,
            "hit_rates": hit_rates(merged).to_dict("records"),
            "players": [
                {**record(r, ["role", "age", "team", "league_code", "tier", "games",
                              "final", "role_percentile", "tier_percentile", "em_games",
                              "em_score", "winrate", "kda", "dpm", "new_level", "new_team"]),
                 "id": ids[r["player"]], "name": r["player"],
                 "photo": photos.get(r["player"]), "logo": logos.get(r["team"]),
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
    })


if __name__ == "__main__":
    main()
