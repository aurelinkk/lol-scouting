"""Modèle de maintien : probabilité qu'un joueur de 1re division (LEC, LCS, LCK,
LPL, LCP, CBLOL) joue encore en 1re division la saison suivante, dans sa région
ou ailleurs.

Pendant du modèle de montée pour les joueurs déjà en haut : agents libres,
remplaçants, joueurs montés en cours de saison (Daglas 2026, monté de TH Academy
en avril, libéré en novembre).

- Joueurs : au moins MIN_GAMES parties de 1re division dans la saison.
- Cible : au moins NEXT_GAMES parties de 1re division la saison suivante, dans
  n'importe quelle région (même pseudo et même poste pour un départ à l'étranger).
- Variables : place de titulaire (part des parties de l'équipe), win rate de
  l'équipe et écart du joueur, score en 1re division, stats de lane comparées aux
  joueurs du même poste, saisons déjà passées en 1re division, montée en cours de
  saison, âge, import, poste, région.
- Même méthode que le modèle de montée (promotion_model.py) : régression
  logistique + LightGBM moyennés, validés saison par saison, test sur la dernière
  saison connue comme si c'était le futur.

Appelé par promotion_model.py (python scout.py modele) : bloc « stay » de
web/data/promotion_model.json.
"""
import json
import math
import os

import numpy as np
import pandas as pd

from scouting.model import promotion_model as pm

MIN_GAMES = 5
NEXT_GAMES = 3
STATS = ["kda", "kp", "gd15", "csd15", "xpd15", "dpm", "deaths_pg"]
LOWER_IS_BETTER = {"deaths_pg"}


def players_file(region):
    return pm.web(region, "players.json")


def season_age(birthdate, season):
    """Âge en fin de saison (1er décembre)."""
    try:
        y, m, d = (int(x) for x in str(birthdate)[:10].split("-"))
    except ValueError:
        return np.nan
    return season - y + (11 - m) / 12 + (1 - d) / 365


def load():
    """Une ligne par joueur de 1re division et par saison, toutes régions."""
    rows, top_next = [], set()
    team_games = {}
    rank_rows = {}
    for region in pm.REGIONS:
        path = players_file(region)
        if not os.path.exists(path) or not os.path.exists(pm.web(region, "meta.json")):
            continue
        for s in json.load(open(pm.web(region, "meta.json"), encoding="utf-8"))["seasons"]:
            f = pm.pub(region, f"rankings_{s}.json")
            if os.path.exists(f):
                for r in json.load(open(f, encoding="utf-8")):
                    rank_rows[(region, r["id"], s, r["tier"])] = r
        players = json.load(open(path, encoding="utf-8"))
        for pid, v in players.items():
            by = {}
            for l in v["lines"]:
                by.setdefault(l["season"], []).append(l)
            for s, ls in by.items():
                top = [l for l in ls if l["tier"] == "LEC"]
                g = sum(l["games"] for l in top)
                if g >= NEXT_GAMES:
                    top_next.add((s, pm.norm_name(v["name"]), top[0]["role"]))
                for l in top:
                    k = (region, s, l["team"])
                    team_games[k] = max(team_games.get(k, (0, 0.5)), (l["games"], l["winrate"]))
                if g < MIN_GAMES:
                    continue
                main = max(top, key=lambda l: l["games"])
                low = [l for l in ls if l["tier"] in ("ERL1", "ERL2")]
                prev = sum(1 for ss, lls in by.items() if ss < s and sum(l["games"] for l in lls if l["tier"] == "LEC") >= MIN_GAMES)
                rec = {"region": region, "id": pid, "name": v["name"], "country": v.get("country"),
                       "season": s, "role": main["role"], "team": main["team"], "games": g,
                       "winrate": sum(l["games"] * l["winrate"] for l in top) / g,
                       "low_games": sum(l["games"] for l in low), "prev_seasons": prev,
                       "age": season_age(v.get("birthdate"), s) if not v.get("age_approx") else np.nan,
                       "first_season": min(by)}
                for st in STATS:
                    rec[st] = main.get(st)
                rows.append(rec)
    d = pd.DataFrame(rows)
    # un joueur présent dans deux régions la même saison : la ligne avec le plus de parties
    d = d.sort_values("games", ascending=False).drop_duplicates(["season", "name", "role"]).reset_index(drop=True)
    tg = [team_games.get((r, s, t), (np.nan, np.nan)) for r, s, t in zip(d["region"], d["season"], d["team"])]
    d["team_games"] = [x[0] for x in tg]
    d["team_wr"] = [x[1] for x in tg]
    d["score_top"] = [rank_rows.get((r, i, s, "LEC"), {}).get("final") for r, i, s in zip(d["region"], d["id"], d["season"])]
    low_rows = [rank_rows.get((r, i, s, "ERL1")) or rank_rows.get((r, i, s, "ERL2")) for r, i, s in zip(d["region"], d["id"], d["season"])]
    d["score_low"] = [x.get("final") if x else None for x in low_rows]
    d["intl_games"] = [rank_rows.get((r, i, s, "LEC"), {}).get("intl_games") or 0 for r, i, s in zip(d["region"], d["id"], d["season"])]
    d["y"] = [float((s + 1, pm.norm_name(n), ro) in top_next) for s, n, ro in zip(d["season"], d["name"], d["role"])]
    return d


def features(d, with_stats=True):
    grp = ["region", "season", "role"]
    X = pd.DataFrame(index=d.index)
    share = (d["games"] / d["team_games"]).clip(0, 1).fillna(0.5)
    X["Titulaire (part des parties)"] = share
    X["Win rate de l'équipe"] = (d["team_wr"].fillna(0.5) - 0.5)
    X["Win rate vs son équipe"] = (d["winrate"] - d["team_wr"].fillna(d["winrate"])).clip(-0.4, 0.4)
    sc = d["score_top"].astype(float)
    X["Score en 1re division"] = pm.zscore(d.assign(v=sc.fillna(sc.median())), "v", grp)
    X["Pas de score en 1re division"] = sc.isna().astype(float)
    X["Saisons en 1re division"] = np.log1p(d["prev_seasons"].clip(0, 8))
    X["1re saison en 1re division"] = ((d["prev_seasons"] == 0) & (d["first_season"] < d["season"])).astype(float)
    X["Monté en cours de saison"] = (d["low_games"] > 0).astype(float)
    X["Parties"] = np.log1p(d["games"]) - math.log(30)
    X["International"] = (d["intl_games"].fillna(0) > 0).astype(float)
    age = d["age"]
    X["Âge"] = (age.fillna(23) - 23).clip(-6, 10)
    X["Âge²"] = X["Âge"] ** 2 / 10
    X["Âge inconnu"] = age.isna().astype(float)
    X["Import"] = [float(not pm.resident(n, c, r)) for n, c, r in zip(d["name"], d["country"], d["region"])]
    if with_stats:
        for s in STATS:
            z = pm.zscore(d.assign(v=pd.to_numeric(d[s], errors="coerce")), "v", grp)
            X[f"stat:{s}"] = -z if s in LOWER_IS_BETTER else z
    for role in pm.ROLES[1:]:
        X[f"Poste {role}"] = (d["role"] == role).astype(float)
    for region in pm.REGIONS[1:]:
        X[f"Région {region}"] = (d["region"] == region).astype(float)
    return X.fillna(0.0)


STAT_LABELS = {"kda": "KDA", "kp": "participation aux kills", "gd15": "avance en or à 15 min",
               "csd15": "avance en CS à 15 min", "xpd15": "avance en XP à 15 min", "dpm": "dégâts par minute",
               "deaths_pg": "morts par partie"}


def explain(name, r, x, c):
    """Phrase courte pour un facteur (c > 0 : aide à rester)."""
    up = c > 0
    if name == "Titulaire (part des parties)":
        pct = round(100 * x)
        return f"Titulaire ({pct} % des parties de l'équipe)" if up else f"Peu utilisé ({pct} % des parties de l'équipe)"
    if name == "Win rate de l'équipe":
        return f"Équipe qui gagne ({round(100 * (x + 0.5))} %)" if up else f"Équipe en difficulté ({round(100 * (x + 0.5))} % de victoires)"
    if name == "Win rate vs son équipe":
        return "Gagne plus que son équipe sans lui" if up else "Moins de victoires que son équipe"
    if name == "Score en 1re division":
        return "Bon score en 1re division" if up else "Score faible en 1re division"
    if name == "Pas de score en 1re division":
        return None
    if name == "Saisons en 1re division":
        n = int(r["prev_seasons"])
        return f"Installé : {n} saison{'s' if n > 1 else ''} de 1re division avant" if up else "Peu d'expérience de 1re division"
    if name == "1re saison en 1re division":
        return "1re saison en 1re division" if not up else None
    if name == "Monté en cours de saison":
        return "Monté en cours de saison (place pas encore acquise)" if not up else None
    if name == "Parties":
        return f"{int(r['games'])} parties dans la saison" if up else f"Seulement {int(r['games'])} parties dans la saison"
    if name == "International":
        return "A joué l'international" if up else None
    if name in ("Âge", "Âge²"):
        if pd.isna(r["age"]):
            return None
        a = f"{r['age']:.0f} ans"
        if up:
            return f"Jeune ({a})"
        return f"Âge ({a}) : départs et retraites plus fréquents" if r["age"] >= 26 else f"Plus âgé que la moyenne ({a})"
    if name == "Import":
        return "Import : prend une des places d'import" if x and not up else None
    if name.startswith("stat:"):
        s = name[5:]
        return f"Bonne {STAT_LABELS[s]}" if up and s in ("kp", "gd15", "csd15", "xpd15") else \
            f"{STAT_LABELS[s].capitalize()} {'élevé' if up else 'faible'}" if s in ("kda",) else \
            f"{STAT_LABELS[s].capitalize()} {'au-dessus' if up else 'en dessous'} de son poste" if s != "deaths_pg" else \
            ("Meurt peu" if up else "Meurt beaucoup")
    return None


def simple_metrics(y, p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return {"n": int(len(y)), "stayed": int(y.sum()), "auc": round(pm.auc(y, p), 3),
            "logloss": round(float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))), 4),
            "brier": round(float(np.mean((p - y) ** 2)), 4)}


def backtest(d, y, X, lam, seasons, sw, boost=False):
    p = np.full(len(y), np.nan)
    for s in seasons:
        test = (d["season"] == s).to_numpy()
        tr = ~test & (sw > 0)
        p[test] = pm.lgbm_fit_predict(X[tr], y[tr], X[test], sw[tr]) if boost else \
            pm.Logit(lam).fit(X[tr], y[tr], sw[tr]).predict(X[test])
    return p


def build(verbose=False):
    d = load()
    last = int(d["season"].max())
    train = (d["season"] < last).to_numpy()
    seasons = sorted(d.loc[train, "season"].unique())
    recent = [s for s in seasons if s >= pm.RECENT_FROM] or seasons
    old = [s for s in seasons if s not in recent]
    y = d["y"].to_numpy()
    ev = d["season"].isin(recent).to_numpy()

    results = {}
    for with_stats in (False, True):
        Xa = features(d, with_stats).to_numpy()
        for w_old in (pm.OLD_WEIGHTS if old else [1.0]):
            sw = np.where(d["season"].isin(old), w_old, 1.0) * train
            for lam in (1, 3, 10, 30, 100):
                p = backtest(d, y, Xa, lam, recent, sw)
                results[(with_stats, lam, w_old)] = simple_metrics(y[ev], p[ev])
    best = min(results, key=lambda k: results[k]["logloss"])
    with_stats, lam, w_old = best
    sw = np.where(d["season"].isin(old), w_old, 1.0) * train
    X = features(d, with_stats)
    cols = list(X.columns)
    Xn = X.to_numpy()
    mix = pm.lgb is not None
    # validation du mélange (logistique + LightGBM)
    p_cv = backtest(d, y, Xn, lam, recent, sw)
    if mix:
        p_cv = (p_cv + backtest(d, y, Xn, lam, recent, sw, boost=True)) / 2
    cv = simple_metrics(y[ev], p_cv[ev])
    # test dans le futur : dernière saison connue, modèle appris sur les précédentes
    fwd = (d["season"] == recent[-1]).to_numpy()
    fwd_tr = train & (d["season"] < recent[-1]).to_numpy() & (sw > 0)
    p_fwd = pm.Logit(lam).fit(Xn[fwd_tr], y[fwd_tr], sw[fwd_tr]).predict(Xn[fwd])
    if mix:
        p_fwd = (p_fwd + pm.lgbm_fit_predict(Xn[fwd_tr], y[fwd_tr], Xn[fwd], sw[fwd_tr])) / 2
    forward = simple_metrics(y[fwd], p_fwd)
    # référence : taux de maintien moyen de la région et du poste
    base = d[train].groupby(["region"])["y"].mean()
    p_base = d["region"].map(base).fillna(y[train].mean()).to_numpy()
    baseline = simple_metrics(y[ev], p_base[ev])

    fit = train & (sw > 0)
    model = pm.Logit(lam).fit(Xn[fit], y[fit], sw[fit])
    boosters = pm.lgbm_fit(Xn[fit], y[fit], sw[fit]) if mix else None
    cur = ~train
    p_cur = model.predict(Xn[cur])
    if mix:
        p_cur = (p_cur + pm.lgbm_predict(boosters, Xn[cur])) / 2
    contrib = model.contributions(Xn[cur])
    players = {}
    for i, (idx, r) in enumerate(d[cur].iterrows()):
        c = contrib[i].copy()
        c[cols.index("Âge")] += c[cols.index("Âge²")]
        c[cols.index("Âge²")] = 0
        factors = []
        for j in np.argsort(-np.abs(c)):
            if abs(c[j]) < 0.08:
                break
            text = explain(cols[j], r, X.loc[idx, cols[j]], c[j])
            if text and text not in [f[0] for f in factors]:
                factors.append([text, round(float(c[j]), 2)])
            if len(factors) == 4:
                break
        players.setdefault(r["region"], {})[r["id"]] = {
            "p": round(float(p_cur[i]), 4), "team": r["team"], "games": int(r["games"]),
            "mid_season": bool(r["low_games"] > 0), "factors": factors}

    rates = {}
    for region, g in d[train & (d["season"] >= recent[0]).to_numpy()].groupby("region"):
        rates[region] = {"n": int(len(g)), "rate": round(float(g["y"].mean()), 3),
                         "mid_season": round(float(g.loc[g["low_games"] > 0, "y"].mean()), 3) if (g["low_games"] > 0).any() else None}
    coefs = sorted(((c_, round(float(w), 3)) for c_, w in zip(cols, model.w[1:])), key=lambda x: -abs(x[1]))
    if verbose:
        for k, m in sorted(results.items()):
            print(f"  maintien stats={k[0]!s:5} lambda={k[1]:<3} poids anciens={k[2]:<5} AUC {m['auc']:.3f} logloss {m['logloss']:.4f}")
    n_cur = int(cur.sum())
    print(f"  Modèle de maintien : {int(y[train].sum())}/{int(train.sum())} joueurs de 1re division encore en 1re division "
          f"l'année suivante ({', '.join(map(str, seasons))}) ; validation AUC {cv['auc']:.3f} "
          f"(taux moyen seul {baseline['auc']:.3f}) ; test {recent[-1]} AUC {forward['auc']:.3f} ; {n_cur} joueurs notés pour {last + 1}")
    return {
        "season": last, "target": last + 1, "trained_on": [int(s) for s in seasons if s in recent or w_old > 0],
        "validated_on": [int(s) for s in recent], "old_weight": w_old,
        "model": "Régression logistique + LightGBM (moyenne)" if mix else "Régression logistique",
        "with_stats": with_stats, "lambda": lam, "validation": cv, "forward": forward, "baseline": baseline,
        "rates": rates, "coefficients": coefs[:16], "players": players,
    }
