"""Score mondial : met les six régions sur une même échelle (celle de l'Europe).

Le score « final » de chaque région est relatif à sa propre région : un +1.5 en
LCK et un +1.5 en LEC ne valent pas la même chose. On les rend comparables avec
les résultats internationaux (Worlds, MSI, Esports World Cup, First Stand) :

1. Force de chaque région, saison par saison : modèle de Bradley-Terry sur
   toutes les parties entre équipes de régions différentes (la saison compte
   pour 1, la précédente pour 0.5, celle d'avant pour 0.25), avec un a priori
   prudent (écart-type de 1 en log-cote) pour les régions qui jouent peu.
2. Conversion en points de score : dans une même ligue, un écart d'un
   écart-type de niveau d'équipe (log-cote de win rate) correspond à
   K écarts-types de score moyen des titulaires. K est mesuré sur toutes les
   ligues majeures (environ 0.8).
3. Décalage de chaque région : on aligne le titulaire moyen de la ligue qui
   envoie les équipes à l'international (LCK, LPL...) sur celui de la LEC, puis
   on ajoute l'écart de force mesuré à l'international :
       mondial = final + (moy. LEC - moy. ligue) + K x (force région - force Europe)
   L'Europe ne bouge donc pas : le score mondial se lit comme un score LEC.

Limite : à l'international, ce sont les meilleures équipes de chaque région qui
s'affrontent ; on suppose que l'écart entre régions est le même plus bas dans
le classement.

Lit les classements exportés de chaque région (web/public/data/**/rankings_*.json),
les rosters exportés et data/intl/pro_games_<année>.csv (python scout.py international).
Écrit web/data/world.json.

Usage :
    python scout.py score-mondial
    python scout.py score-mondial --check     # + contrôle avec les joueurs qui ont changé de région
"""
import argparse
import json
import os
from datetime import datetime

import numpy as np
import pandas as pd

REGIONS = ["eu", "na", "kr", "cn", "lcp", "br"]
REFERENCE = "eu"
SEASON_DECAY = 0.5       # poids de la saison précédente (puis 0.25...)
PRIOR_SD = 1.0           # a priori sur la force d'une région (log-cote)
MIN_STARTER_GAMES = 10
# Correction des divisions inférieures : joueurs de 2e / 3e division partis en
# 1re division d'une autre région. Rétrécie vers 0 (LOWER_PRIOR joueurs fictifs)
LOWER_PRIOR = 10
LOWER_MIN_PLAYERS = 5
OUT = "web/data/world.json"
# Noms d'équipe à l'Esports World Cup (club.équipe) -> nom en ligue
TEAM_ALIASES = {"AG.AL": "Anyone's Legend", "MIBR.LOS": "LØS"}


def pub(region):
    return "web/public/data" if region == "eu" else f"web/public/data/{region}"


def load_rankings():
    rows = []
    for region in REGIONS:
        meta = "web/data/meta.json" if region == "eu" else f"web/data/{region}/meta.json"
        if not os.path.exists(meta):
            continue
        for season in json.load(open(meta, encoding="utf-8"))["seasons"]:
            for r in json.load(open(f"{pub(region)}/rankings_{season}.json", encoding="utf-8")):
                rows.append({"region": region, "season": season, "id": r["id"], "name": r["name"],
                             "team": r["team"], "tier": r["tier"], "league": r["league_code"],
                             "role": r["role"], "final": r["final"], "games": r["games"],
                             "winrate": r["winrate"]})
    return pd.DataFrame(rows)


def team_regions():
    """(saison, équipe) -> (région, ligue), d'après les rosters exportés (1re division d'abord)."""
    out, any_season = {}, {}
    for region in REGIONS:
        path = f"{pub(region)}/rosters.json"
        if not os.path.exists(path):
            continue
        for block in json.load(open(path, encoding="utf-8")):
            for t in block["teams"]:
                key = (block["season"], t["team"])
                prev = out.get(key)
                if prev is None or (prev[2] != "LEC" and block["tier"] == "LEC"):
                    out[key] = (region, block["league_code"], block["tier"])
    for (season, team), v in sorted(out.items()):
        any_season[team] = v
    return out, any_season


def intl_games(seasons):
    """Une ligne par partie entre deux régions suivies : saison, région A, région B, A gagne."""
    by_season, any_season = team_regions()
    rows, unknown = [], set()
    for season in seasons:
        path = f"data/intl/pro_games_{season}.csv"
        if not os.path.exists(path):
            continue
        d = pd.read_csv(path, usecols=["game_id", "team", "win", "event"])
        d["team"] = d["team"].replace(TEAM_ALIASES)
        g = d.groupby(["game_id", "team"]).agg(win=("win", "first"), event=("event", "first")).reset_index()
        for gid, gg in g.groupby("game_id"):
            if len(gg) != 2:
                continue
            info = []
            for _, r in gg.iterrows():
                v = by_season.get((season, r["team"])) or any_season.get(r["team"])
                if v is None:
                    unknown.add(r["team"])
                info.append((v, r))
            if any(v is None for v, _ in info):
                continue
            (va, ra), (vb, rb) = info
            if va[0] == vb[0]:
                continue
            rows.append({"season": season, "a": va[0], "b": vb[0], "league_a": va[1], "league_b": vb[1],
                         "team_a": ra["team"], "team_b": rb["team"], "event": ra["event"],
                         "a_wins": bool(str(ra["win"]).lower() in ("true", "1"))})
    if unknown:
        print(f"  équipes internationales sans région : {', '.join(sorted(unknown))}")
    return pd.DataFrame(rows)


def bradley_terry(games, regions, weights):
    """Forces (log-cote) par maximum a posteriori, a priori N(0, PRIOR_SD²)."""
    idx = {r: i for i, r in enumerate(regions)}
    a = games["a"].map(idx).to_numpy()
    b = games["b"].map(idx).to_numpy()
    y = games["a_wins"].astype(float).to_numpy()
    w = weights
    theta = np.zeros(len(regions))
    for _ in range(100):  # Newton
        p = 1 / (1 + np.exp(-(theta[a] - theta[b])))
        grad = -theta / PRIOR_SD ** 2
        np.add.at(grad, a, w * (y - p))
        np.add.at(grad, b, -w * (y - p))
        h = np.diag(np.full(len(regions), 1 / PRIOR_SD ** 2))
        q = w * p * (1 - p)
        np.add.at(h, (a, a), q)
        np.add.at(h, (b, b), q)
        np.add.at(h, (a, b), -q)
        np.add.at(h, (b, a), -q)
        step = np.linalg.solve(h, grad)
        theta += step
        if np.abs(step).max() < 1e-8:
            break
    se = np.sqrt(np.diag(np.linalg.inv(h)))
    return theta, se


def team_scale(rk):
    """K : écart-type du score moyen des titulaires / écart-type de la log-cote du win rate
    des équipes, au sein de chaque 1re division (écarts à la moyenne de la ligue)."""
    top = rk[(rk["tier"] == "LEC") & (rk["games"] >= MIN_STARTER_GAMES)]
    rows = []
    for key, g in top.groupby(["region", "season", "league", "team"]):
        if len(g) < 4:
            continue
        wr = float(np.clip(np.average(g["winrate"], weights=g["games"]), 0.05, 0.95))
        rows.append(dict(zip(["region", "season", "league", "team"], key),
                         f=np.average(g["final"], weights=g["games"]), lg=np.log(wr / (1 - wr))))
    t = pd.DataFrame(rows)
    for c in ("f", "lg"):
        t[c] -= t.groupby(["region", "season", "league"])[c].transform("mean")
    return float(t["f"].std() / t["lg"].std()), len(t), float(t["f"].corr(t["lg"]))


def league_means(rk, games):
    """Score moyen des titulaires de la (des) ligue(s) qui envoient les équipes à
    l'international, par région et saison (1re division si elle existe)."""
    out = {}
    starters = rk[rk["games"] >= MIN_STARTER_GAMES]
    for (region, season), g in starters.groupby(["region", "season"]):
        leagues = set(games.loc[(games["season"] == season) & (games["a"] == region), "league_a"]) | \
                  set(games.loc[(games["season"] == season) & (games["b"] == region), "league_b"])
        sel = g[g["tier"] == "LEC"]
        if leagues and sel.empty:
            sel = g[g["league"].isin(leagues)]
        if sel.empty:
            continue
        out[(region, season)] = float(np.average(sel["final"], weights=sel["games"]))
    return out


def build(check=False):
    rk = load_rankings()
    if rk.empty:
        raise SystemExit("Aucun classement exporté (python scout.py export)")
    seasons = sorted(rk["season"].unique())
    regions = [r for r in REGIONS if r in set(rk["region"])]
    games = intl_games(seasons)
    if games.empty:
        raise SystemExit("Pas de parties internationales (python scout.py international)")
    k, n_teams, corr = team_scale(rk)
    means = league_means(rk, games)
    print(f"  K = {k:.2f} ({n_teams} équipes de 1re division, corrélation score / win rate {corr:.2f})")

    out_seasons = {}
    for season in seasons:
        sub = games[games["season"] <= season].copy()
        w = SEASON_DECAY ** (season - sub["season"]).to_numpy()
        theta, se = bradley_terry(sub, regions, w)
        ref = regions.index(REFERENCE)
        rel = {r: float(theta[i] - theta[ref]) for i, r in enumerate(regions)}
        counts = pd.concat([sub[["a"]].rename(columns={"a": "r"}), sub[["b"]].rename(columns={"b": "r"})])
        season_games = games[games["season"] == season]
        regions_out = {}
        for i, r in enumerate(regions):
            m_ref = means.get((REFERENCE, season))
            m = means.get((r, season))
            if m is None or m_ref is None:
                continue
            offset = (m_ref - m) + k * rel[r]
            n_season = int(((season_games["a"] == r) | (season_games["b"] == r)).sum())
            wins = int(((season_games["a"] == r) & season_games["a_wins"]).sum()
                       + ((season_games["b"] == r) & ~season_games["a_wins"]).sum())
            regions_out[r] = {
                "offset": round(offset, 3),
                "strength": round(rel[r], 3),          # log-cote contre l'Europe
                "strength_se": round(float(se[i]), 3),
                "top_mean": round(m, 3),
                "games": n_season,                       # parties internationales cette saison
                "wins": wins,
                "games_weighted": int((counts["r"] == r).sum()),
            }
        out_seasons[str(season)] = regions_out

    lower = lower_tier_adjust(rk, out_seasons)

    # Face-à-face bruts (toutes saisons) pour l'affichage
    h2h = {}
    for _, g in games.iterrows():
        for x, y, win in ((g["a"], g["b"], g["a_wins"]), (g["b"], g["a"], not g["a_wins"])):
            cell = h2h.setdefault(x, {}).setdefault(y, [0, 0])
            cell[0] += int(win)
            cell[1] += 1

    data = {
        "generated": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "reference": REFERENCE,
        "k": round(k, 3),
        "seasons": out_seasons,
        "lower": lower,
        "check": movers_check(rk, out_seasons, verbose=check),
        "h2h": h2h,
        "games": int(len(games)),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  {len(games)} parties entre régions -> {OUT}")
    for season in seasons:
        line = "  ".join(f"{r} {v['offset']:+.2f}" for r, v in out_seasons[str(season)].items())
        print(f"  {season} : {line}")
    return data


def with_world(rk, out_seasons, lower=None):
    rk = rk.copy()
    rk["world"] = [
        row.final + out_seasons.get(str(row.season), {}).get(row.region, {}).get("offset", np.nan)
        + ((lower or {}).get(row.region, {}).get("adjust", 0.0) if row.tier != "LEC" else 0.0)
        for row in rk.itertuples()]
    return rk


def lower_tier_adjust(rk, out_seasons):
    """Divisions inférieures : le score régional d'un joueur de 2e / 3e division
    est calé sur les montées DANS sa région. Pour un départ à l'étranger, on
    compare son score mondial avant / après (saison suivante, 1re division
    d'une autre région) à l'écart moyen des montées internes (régression vers
    la moyenne). Ex : les joueurs de LCK CL partis à l'étranger font nettement
    moins bien que prévu (adaptation, et la Corée garde ses meilleurs)."""
    d = with_world(rk[rk["games"] >= MIN_STARTER_GAMES], out_seasons)
    a = d.add_suffix("_a").rename(columns={"id_a": "id"})
    b = d.add_suffix("_b").rename(columns={"id_b": "id"})
    p = a.merge(b, on="id")
    p = p[(p["season_b"] == p["season_a"] + 1) & (p["tier_a"] != "LEC") & (p["tier_b"] == "LEC")]
    p["delta"] = p["world_b"] - p["world_a"]
    inside = p[p["region_a"] == p["region_b"]]
    baseline = float(inside["delta"].mean())
    abroad = p[p["region_a"] != p["region_b"]]
    out = {}
    print(f"  Divisions inférieures : montées internes {baseline:+.2f} en moyenne ({len(inside)} joueurs)")
    for region, g in abroad.groupby("region_a"):
        resid = g["delta"] - baseline
        n = len(g)
        adj = float(resid.sum() / (n + LOWER_PRIOR))
        if region == REFERENCE or n < LOWER_MIN_PLAYERS:
            adj = 0.0  # référence (les ERL sont déjà calées sur l'EMEA Masters) ou trop peu de cas
        out[region] = {"adjust": round(adj, 3), "players": int(n), "raw": round(float(resid.mean()), 3)}
        print(f"    {region} : {n} départs vers une 1re division étrangère, écart {resid.mean():+.2f} -> correction {adj:+.2f}")
    return out


def movers_check(rk, out_seasons, verbose=False):
    """Contrôle : joueurs de 1re division qui changent de région d'une saison à
    l'autre. Avec le score mondial, l'écart avant / après doit se rapprocher de
    celui des joueurs qui restent dans leur région."""
    top = with_world(rk[(rk["tier"] == "LEC") & (rk["games"] >= MIN_STARTER_GAMES)], out_seasons)
    a = top.add_suffix("_a").rename(columns={"id_a": "id"})
    b = top.add_suffix("_b").rename(columns={"id_b": "id"})
    pairs = a.merge(b, on="id")
    pairs = pairs[pairs["season_b"] == pairs["season_a"] + 1]
    stay = pairs[pairs["region_a"] == pairs["region_b"]]
    move = pairs[pairs["region_a"] != pairs["region_b"]]
    base = float((stay["final_b"] - stay["final_a"]).mean())
    raw = move["final_b"] - move["final_a"]
    world = move["world_b"] - move["world_a"]
    out = {"players": int(len(move)), "regional_error": round(float((raw - base).abs().mean()), 3),
           "world_error": round(float((world - base).abs().mean()), 3)}
    print(f"  Contrôle : {len(move)} joueurs de 1re division ont changé de région ; erreur moyenne "
          f"{out['regional_error']:.2f} avec le score régional, {out['world_error']:.2f} avec le score mondial")
    if verbose:
        print(f"    restés dans leur région : écart moyen {base:+.2f}")
        print(f"    changés, score régional : écart moyen {raw.mean():+.2f} (dispersion {raw.std():.2f})")
        print(f"    changés, score mondial  : écart moyen {world.mean():+.2f} (dispersion {world.std():.2f})")
        for _, r in move.sort_values("season_a").iterrows():
            print(f"    {r['name_a']:<18} {r['region_a']}->{r['region_b']} {r['season_a']}->{r['season_b']}  "
                  f"régional {r['final_b'] - r['final_a']:+.2f}  mondial {r['world_b'] - r['world_a']:+.2f}")
    return out


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true")
    build(check=parser.parse_args().check)
