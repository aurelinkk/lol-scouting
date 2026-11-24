"""Modèle de montée : probabilité qu'un joueur de division inférieure joue en
1re division de sa région la saison suivante (au début ou en cours de saison).

Appris sur les montées réelles 2023 -> 2024, 2024 -> 2025 et 2025 -> 2026 des six
régions (promotions.json), à partir des classements exportés (rankings_*.json).
Mélange de deux modèles (moyenne des probabilités) : une régression logistique
régularisée écrite avec numpy (explications lisibles) et LightGBM (boosting
d'arbres, effets non linéaires ; si installé : pip install lightgbm). Variables :
- performance : score, rang dans son poste parmi les joueurs pas encore en
  1re division (le plus important : il n'y a que quelques places par poste),
  forme du dernier split, progression sur un an, stats clés du poste ;
- contexte : âge, expérience (parties), niveau de la ligue, 3e division,
  passé par la 1re division, EMEA Masters / international, import ;
- poste et région : taux de base différents (certains postes montent plus
  facilement) et effet du rang propre à chaque poste.

Validation honnête : chaque saison est prédite par un modèle qui ne l'a pas
vue (et la plus récente par un modèle appris seulement sur le passé).

Écrit web/data/promotion_model.json. Usage : python promotion_model.py [--verbose]
"""
import argparse
import json
import math
import os
from datetime import datetime

import numpy as np
import pandas as pd

try:  # boosting d'arbres (pip install lightgbm) ; sans lui : régression logistique seule
    import lightgbm as lgb
except ImportError:
    lgb = None

LGBM_SEEDS = 5  # moyenne de 5 modèles (graines différentes) : prédictions plus stables

REGIONS = ["eu", "na", "kr", "cn", "lcp", "br"]
ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"]
MIN_GAMES = 8
OUT = "web/data/promotion_model.json"
# Saisons sans vraie 1re division l'année suivante (LCP créée en 2025 : les
# équipes PCS / VCS / LJL y sont passées d'office, ce ne sont pas des montées)
SKIP = {("lcp", 2020), ("lcp", 2021), ("lcp", 2022), ("lcp", 2023), ("lcp", 2024)}
# Validation sur les saisons récentes ; les plus anciennes ne servent qu'à
# l'entraînement, avec un poids choisi parmi OLD_WEIGHTS (0 = écartées)
RECENT_FROM = 2023
OLD_WEIGHTS = [0.0, 0.25, 0.5, 1.0]
STATS = ["kda", "kp", "dpm", "cs_min", "gd15", "csd15", "xpd15", "vision_min", "deaths_pg"]
LOWER_IS_BETTER = {"deaths_pg"}

AMER = {"United States", "Canada", "Mexico", "Brazil", "Argentina", "Chile", "Peru", "Colombia", "Uruguay",
        "Venezuela", "Ecuador", "Bolivia", "Paraguay", "Costa Rica", "Panama", "Guatemala", "Honduras",
        "El Salvador", "Nicaragua", "Dominican Republic", "Puerto Rico", "Cuba", "Jamaica"}
LCP = {"Taiwan", "Hong Kong", "Macau", "Vietnam", "Japan", "Australia", "New Zealand", "Philippines",
       "Thailand", "Malaysia", "Singapore", "Indonesia", "Cambodia", "Laos", "Myanmar"}
HOME = {"eu": "EMEA", "na": "AMER", "kr": "KR", "cn": "LPL", "lcp": "LCP", "br": "AMER"}


_RES_LP = None


def resident(name, country, region):
    """Résident de la 1re division de `region` ? Résidence officielle Leaguepedia et
    double nationalité (web/data/residency_lp.json, python residency.py) si connues,
    sinon d'après la nationalité (règles LCS / CBLOL : un Brésilien est un import en
    LCS, un Nord-Américain un import au CBLOL). Nationalité inconnue : résident."""
    global _RES_LP
    if _RES_LP is None:
        path = "web/data/residency_lp.json"
        _RES_LP = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    lp = _RES_LP.get(name) or _RES_LP.get(str(name).split(" (")[0])
    if lp:
        return region in lp.split("+")
    o = origin(country)
    if o is None:
        return True
    if o != HOME[region]:
        return False
    if region == "na":
        return country != "Brazil"
    if region == "br":
        return country not in ("United States", "Canada")
    return True


def origin(country):
    if not isinstance(country, str) or not country:
        return None
    if country == "South Korea":
        return "KR"
    if country == "China":
        return "LPL"
    if country in AMER:
        return "AMER"
    if country in LCP:
        return "LCP"
    return "EMEA"


def web(region, *parts):
    base = ["web", "data"] if region == "eu" else ["web", "data", region]
    return os.path.join(*base, *parts)


def pub(region, *parts):
    base = ["web", "public", "data"] if region == "eu" else ["web", "public", "data", region]
    return os.path.join(*base, *parts)


# ---------------------------------------------------------------------------
# Données
# ---------------------------------------------------------------------------
# Cible : 1re division (top) ou, pour les joueurs de 3e division, 2e division ou plus (tier2)
TARGETS = {"top": {"LEC"}, "tier2": {"ERL1", "LEC"}}


def load(level="top"):
    rows, labels, official = [], {}, {}
    for region in REGIONS:
        if not os.path.exists(web(region, "meta.json")):
            continue
        seasons = json.load(open(web(region, "meta.json"), encoding="utf-8"))["seasons"]
        for s in seasons:
            for r in json.load(open(pub(region, f"rankings_{s}.json"), encoding="utf-8")):
                rows.append({**r, "region": region})
        # Montées en 1re division : au début de la saison suivante (from = s) ou
        # en cours de saison suivante (from = s + 1, mid_season)
        for block in json.load(open(web(region, "promotions.json"), encoding="utf-8")):
            for p in block["players"]:
                if p["new_level"] not in TARGETS[level]:
                    continue
                target = p["from_season"] if not p["mid_season"] else p["from_season"] - 1
                if p["mid_season"] and p["from_season"] != block["from"]:
                    continue
                labels[(region, p["id"], target)] = p.get("new_team")
                if block["to"] == max(seasons) + 1:
                    official[(region, p["id"])] = {"team": p.get("new_team"), "mid": p["mid_season"]}
    df = pd.DataFrame(rows)
    if level == "top":
        cross_region_labels(df, labels, official)
    return df, labels, official


def norm_name(n):
    return str(n).strip().lower()


def cross_region_labels(df, labels, official):
    """Montées dans la 1re division d'une AUTRE région (ex : Yukino, LFL -> FlyQuest
    en LCS). Passé : le joueur figure dans un effectif de 1re division d'une autre
    région la saison suivante (même pseudo, même poste). Saison à venir : mercato
    des autres régions (joueur venu d'ailleurs dans une équipe de 1re division)."""
    top = {}  # (saison, pseudo, poste) -> (région, équipe)
    for region in REGIONS:
        path = pub(region, "rosters.json")
        if not os.path.exists(path):
            continue
        for block in json.load(open(path, encoding="utf-8")):
            if block["tier"] != "LEC":
                continue
            for t in block["teams"]:
                for p in t["players"]:
                    if p.get("games", 0) >= 3:
                        top.setdefault((block["season"], norm_name(p["name"]), p["role"]), (region, t["team"]))
    low = df[df["tier"] != "LEC"]
    added = 0
    for _, r in low.iterrows():
        hit = top.get((r["season"] + 1, norm_name(r["name"]), r["role"]))
        if hit and hit[0] != r["region"] and (r["region"], r["id"], r["season"]) not in labels:
            labels[(r["region"], r["id"], r["season"])] = f"{hit[1]} ({hit[0]})"
            added += 1
    # Saison à venir : mercato des autres régions
    for region in REGIONS:
        path = web(region, "mercato.json")
        if not os.path.exists(path):
            continue
        for t in json.load(open(path, encoding="utf-8"))["teams"]:
            if t.get("tier") != "LEC":
                continue
            for sl in t["slots"]:
                for p in [sl.get("after")] + (sl.get("after_extra") or []):
                    if p and p.get("region") and p["region"] != region and p.get("id"):
                        key = (p["region"], p["id"])
                        if key not in official:
                            official[key] = {"team": t["team"], "league": t["league"], "mid": False,
                                             "rumor": sl.get("right") != "in"}
    print(f"  Montées vers la 1re division d'une autre région ajoutées : {added}")


def eligible(df, level="top"):
    """Joueurs de division inférieure (3e division seulement pour tier2), pas déjà montés dans la saison."""
    low = df["tier"] == "ERL2" if level == "tier2" else df["tier"] != "LEC"
    d = df[low & (~df["played_lec"].fillna(False).astype(bool)) & (df["games"] >= MIN_GAMES)].copy()
    d = d[~d.apply(lambda r: (r["region"], r["season"]) in SKIP, axis=1)]
    # un joueur par (région, saison) : la ligne avec le plus de parties
    d = d.sort_values("games", ascending=False).drop_duplicates(["region", "season", "id"])
    return d.reset_index(drop=True)


SUFFIXES = r"\b(academy|academia|youth|young|junior|challengers?|rookies?|blue|stars?|nord|fenix|fénix|b|esports?|gaming|team|club|\.?y|ca|cl|as)\b"


def org(name):
    """Nom de club sans les suffixes d'équipe réserve / académie."""
    import re
    import unicodedata
    t = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode().lower()
    t = re.sub(r"\(.*?\)", " ", t)
    t = re.sub(SUFFIXES, " ", t)
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def academies(df):
    """(région, saison, équipe) -> True si l'équipe est la réserve / l'académie d'un club de 1re division
    (même nom de club : T1 Esports Academy -> T1, Karmine Corp Blue -> Karmine Corp, BLG Junior...)."""
    out = {}
    for (region, season), g in df.groupby(["region", "season"]):
        tops = {org(t) for t in g.loc[g["tier"] == "LEC", "team"].unique()} - {""}
        for t in g.loc[g["tier"] != "LEC", "team"].unique():
            o = org(t)
            out[(region, season, t)] = bool(o) and o != t.lower() and any(o == x or o.startswith(x + " ") or x.startswith(o + " ") for x in tops)
    return out


def zscore(d, col, by):
    g = d.groupby(by)[col]
    z = (d[col] - g.transform("mean")) / g.transform("std").replace(0, np.nan)
    return z.fillna(0.0)


def features(d, with_stats=True):
    """Matrice de variables (noms lisibles pour les explications)."""
    grp = ["region", "season", "role"]
    d = d.copy()
    d["rank"] = d.groupby(grp)["final"].rank(ascending=False, method="first")
    X = pd.DataFrame(index=d.index)
    X["Score dans son poste"] = zscore(d, "final", grp)
    X["Rang dans son poste"] = -np.log(d["rank"])  # 1er = 0, 2e = -0.69, 10e = -2.3
    # Rang dans sa propre ligue (les équipes recrutent les meilleurs de chaque ligue)
    lgrp = ["region", "season", "league_code", "role"]
    lrank = d.groupby(lgrp)["final"].rank(ascending=False, method="first")
    X["Rang dans sa ligue"] = -np.log(lrank)
    X["1er de sa ligue"] = (lrank == 1).astype(float)
    X["Forme du dernier split"] = zscore(d.assign(f=d["form_score"].fillna(d["final"])), "f", grp)
    X["Progression sur un an"] = d["trend"].fillna(0.0).clip(-2, 2)
    X["Pas de saison précédente"] = d["trend"].isna().astype(float)
    age = d["age"]
    X["Âge"] = (age.fillna(21.5) - 21.5).clip(-5, 8)
    X["Âge²"] = X["Âge"] ** 2 / 10
    X["Âge inconnu"] = age.isna().astype(float)
    X["Expérience (parties)"] = np.log1p(d["games"]) - math.log(40)
    X["Niveau de la ligue (à score égal)"] = zscore(d.assign(c=d["league_coef"].fillna(d["league_coef"].median())), "c", ["region", "season"])
    X["3e division"] = (d["tier"] == "ERL2").astype(float)
    X["Ancien de 1re division"] = d["ex_lec"].notna().astype(float)
    X["EMEA Masters / international"] = ((d["em_games"].fillna(0) > 0) | (d["intl_games"].fillna(0) > 0)).astype(float)
    X["Win rate"] = zscore(d, "winrate", grp)
    X["Import"] = [float(not resident(n, c, r)) for n, c, r in zip(d["name"], d["country"], d["region"])]
    # Académie : seulement en Corée et en Chine, où elle mène vraiment à l'équipe
    # mère (en Europe, les joueurs de KC Blue montent souvent, mais ailleurs qu'à KC)
    X["Académie d'un club de 1re division"] = (d["academy"] & d["region"].isin(["kr", "cn"])).astype(float)
    if with_stats:
        for s in STATS:
            if s not in d:
                continue
            z = zscore(d.assign(v=d[s].astype(float)), "v", grp)
            X[f"stat:{s}"] = -z if s in LOWER_IS_BETTER else z
    for role in ROLES[1:]:
        X[f"Poste {role}"] = (d["role"] == role).astype(float)
        X[f"Rang × {role}"] = X["Rang dans son poste"] * (d["role"] == role)
    for region in REGIONS[1:]:
        X[f"Région {region}"] = (d["region"] == region).astype(float)
    return X.fillna(0.0), d["rank"]


# ---------------------------------------------------------------------------
# Régression logistique (Newton, pénalité L2 sauf constante)
# ---------------------------------------------------------------------------
class Logit:
    def __init__(self, lam=1.0):
        self.lam = lam

    def fit(self, X, y, sw=None):
        sw = np.ones(len(y)) if sw is None else np.asarray(sw, dtype=float)
        self.mu = X.mean(0)
        self.sd = X.std(0)
        self.sd[self.sd == 0] = 1
        Z = np.column_stack([np.ones(len(X)), (X - self.mu) / self.sd])
        w = np.zeros(Z.shape[1])
        w[0] = math.log(max(y.mean(), 1e-4) / (1 - max(y.mean(), 1e-4)))
        pen = np.full(Z.shape[1], self.lam)
        pen[0] = 0
        for _ in range(60):
            p = 1 / (1 + np.exp(-np.clip(Z @ w, -30, 30)))
            g = Z.T @ (sw * (y - p)) - pen * w
            H = (Z * (sw * p * (1 - p))[:, None]).T @ Z + np.diag(pen + 1e-9)
            step = np.linalg.solve(H, g)
            step *= min(1.0, 2.0 / max(1e-9, np.abs(step).max()))  # pas amorti (stabilité)
            w += step
            if np.abs(step).max() < 1e-7:
                break
        self.w = w
        return self

    def z(self, X):
        return (X - self.mu) / self.sd

    def predict(self, X):
        return 1 / (1 + np.exp(-np.clip(self.w[0] + self.z(X) @ self.w[1:], -30, 30)))

    def contributions(self, X):
        """Apport de chaque variable au logit, par rapport au joueur moyen."""
        return self.z(X) * self.w[1:]


def lgbm_fit(Xtr, ytr, sw=None):
    """LightGBM (API native, sans scikit-learn) : 300 arbres de 7 feuilles au plus,
    pas de 0.03, sous-échantillonnage (lignes et variables) et pénalité L2 ;
    un modèle par graine (les prédictions sont moyennées)."""
    boosters = []
    for seed in range(LGBM_SEEDS):
        params = {"objective": "binary", "learning_rate": 0.03, "num_leaves": 7, "min_data_in_leaf": 30,
                  "bagging_fraction": 0.8, "bagging_freq": 1, "feature_fraction": 0.8, "lambda_l2": 5.0,
                  "seed": seed, "verbose": -1, "num_threads": 0}
        boosters.append(lgb.train(params, lgb.Dataset(Xtr, label=ytr, weight=sw), num_boost_round=300))
    return boosters


def lgbm_predict(boosters, X):
    return np.mean([b.predict(X) for b in boosters], axis=0)


def lgbm_fit_predict(Xtr, ytr, Xte, sw=None):
    return lgbm_predict(lgbm_fit(Xtr, ytr, sw), Xte)


def auc(y, p):
    order = np.argsort(p)
    ranks = np.empty(len(p))
    ranks[order] = np.arange(1, len(p) + 1)
    pos = y == 1
    n1, n0 = pos.sum(), (~pos).sum()
    return float((ranks[pos].sum() - n1 * (n1 + 1) / 2) / (n1 * n0)) if n1 and n0 else float("nan")


def metrics(y, p, d):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    out = {"n": int(len(y)), "promoted": int(y.sum()), "auc": round(auc(y, p), 3),
           "logloss": round(float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))), 4),
           "brier": round(float(np.mean((p - y) ** 2)), 4)}
    # Parmi les vrais montés : combien étaient dans le top 3 prédit de leur poste (région, saison) ?
    dd = d.assign(p=p, y=y)
    dd["prank"] = dd.groupby(["region", "season", "role"])["p"].rank(ascending=False, method="first")
    out["top3_share"] = round(float((dd.loc[dd["y"] == 1, "prank"] <= 3).mean()), 3)
    out["top1_share"] = round(float((dd.loc[dd["y"] == 1, "prank"] <= 1).mean()), 3)
    return out


def backtest(d, y, X, lam, seasons, sw=None, boost=False):
    """Chaque saison de `seasons` prédite par un modèle appris sur toutes les
    AUTRES saisons (pondérées par sw). Lignes des autres saisons : NaN."""
    sw = np.ones(len(y)) if sw is None else sw
    p = np.full(len(y), np.nan)
    for s in seasons:
        test = (d["season"] == s).to_numpy()
        tr = ~test & (sw > 0)
        if boost:
            p[test] = lgbm_fit_predict(X[tr], y[tr], X[test], sw[tr])
        else:
            p[test] = Logit(lam).fit(X[tr], y[tr], sw[tr]).predict(X[test])
    return p


def label_text(name, value):
    """Phrase courte pour un facteur (signe = sens de l'effet)."""
    if name.startswith("stat:"):
        stat = name[5:]
        labels = {"kda": "KDA", "kp": "participation aux kills", "dpm": "dégâts/min", "cs_min": "farm",
                  "gd15": "gold d'avance à 15 min", "csd15": "CS d'avance à 15 min", "xpd15": "XP d'avance à 15 min",
                  "vision_min": "vision", "deaths_pg": "peu de morts"}
        return labels.get(stat, stat)
    return name


STAT_WORDS = {"kda": ("Très bon KDA", "KDA faible"), "kp": ("Présent sur les kills", "Peu impliqué dans les kills"),
              "dpm": ("Beaucoup de dégâts", "Peu de dégâts"), "cs_min": ("Très bon farm", "Farm faible"),
              "gd15": ("Avance en gold à 15 min", "En retard en gold à 15 min"),
              "csd15": ("Avance au farm à 15 min", "En retard au farm à 15 min"),
              "xpd15": ("Avance en XP à 15 min", "En retard d'XP à 15 min"),
              "vision_min": ("Bonne vision", "Vision faible"), "deaths_pg": ("Meurt peu", "Meurt souvent")}


def explain(name, r, x, contrib):
    """Phrase lisible pour un facteur, selon la valeur du joueur et le sens de l'effet."""
    up = contrib > 0
    # Variables « plus c'est haut, mieux c'est » : un effet de sens contraire vient
    # d'une corrélation avec les autres variables (ex : grosse progression déjà
    # comptée dans le score), pas d'une vraie raison -> pas affiché
    if name in ("Score dans son poste", "Forme du dernier split", "Progression sur un an", "Win rate",
                "Expérience (parties)") and (x > 0) != up:
        return None
    if name.startswith("Région") or name.startswith("Poste") or name in ("Âge inconnu", "Niveau de la ligue (à score égal)"):
        return None  # effets de base (région, poste) ou correction technique
    if name == "Rang dans son poste":
        n = int(round(math.exp(-x)))
        return f"{n}{'er' if n == 1 else 'e'} de son poste au score" + ("" if up else " (d'autres devant)")
    if name in ("Rang dans sa ligue", "1er de sa ligue"):
        n = int(round(math.exp(-x))) if name == "Rang dans sa ligue" else (1 if x else 0)
        if name == "1er de sa ligue" or not up or n > 2:
            return None  # regroupé dans « Rang dans sa ligue », affiché seulement s'il aide
        return f"{n}{'er' if n == 1 else 'e'} de sa ligue ({r['league_code']}) à son poste"
    if name == "Score dans son poste":
        return "Score élevé dans son poste" if up else "Score en dessous des meilleurs du poste"
    if name == "Âge":
        return (f"Jeune ({r['age']:.0f} ans)" if up else f"Âge ({r['age']:.0f} ans)") if pd.notna(r["age"]) else None
    if name == "Expérience (parties)":
        return f"Beaucoup de parties ({int(r['games'])})" if up else f"Peu de parties ({int(r['games'])})"
    if name == "Forme du dernier split":
        return "Bon dernier split" if up else "Dernier split en dessous"
    if name == "Progression sur un an":
        return (f"En progrès sur un an ({r['trend']:+.2f})" if up else f"En recul sur un an ({r['trend']:+.2f})") if pd.notna(r["trend"]) else None
    if name == "Pas de saison précédente":
        return "Première saison classée" if x else None
    if name == "3e division":
        return "Joue en 3e division" if x else "Joue en 2e division"
    if name == "Ancien de 1re division":
        return "A déjà joué en 1re division" if x else None
    if name == "EMEA Masters / international":
        return "A joué l'EMEA Masters / l'international" if x else "Pas d'EMEA Masters / international"
    if name == "Import":
        return "Import (prend une place d'import)" if x else None
    if name == "Académie d'un club de 1re division":
        return "Académie d'un club de 1re division" if x else None
    if name == "Win rate":
        return "Gagne beaucoup" if up else "Win rate faible"
    if name.startswith("stat:"):
        good, bad = STAT_WORDS.get(name[5:], (name[5:], name[5:]))
        # Stat et effet de sens contraires (ex : XP d'avance qui fait baisser la
        # chance) : effet de corrélation avec le score, pas une vraie raison -> caché
        if (x > 0) != up:
            return None
        return good if x > 0 else bad
    return name


# Variables sur lesquelles un joueur peut agir (plus haut = mieux), et phrase
ACTIONABLE = {
    "Rang dans son poste": "rank",
    "Score dans son poste": "Un score dans son poste au niveau des montés",
    "Forme du dernier split": "Un dernier split au niveau des montés",
    "Expérience (parties)": "games",
    "Win rate": "winrate",
    "Progression sur un an": "Progresser sur un an comme les montés",
    "EMEA Masters / international": "Jouer l'EMEA Masters / l'international",
}
STAT_GAP = {"kda": "KDA", "kp": "participation aux kills", "dpm": "dégâts/min", "cs_min": "farm (CS/min)",
            "gd15": "gold d'avance à 15 min", "csd15": "CS d'avance à 15 min", "xpd15": "XP d'avance à 15 min",
            "vision_min": "vision", "deaths_pg": "nombre de morts"}


def what_if(d, X, cur, yv, train_mask, predict, p_cur, level="top"):
    """Ce qui manque à chaque joueur pour monter : pour chaque variable sur
    laquelle il peut agir et où il est en dessous du monté typique de son poste
    (médiane des montés, saisons d'entraînement), nouvelle probabilité si on la
    remonte à ce niveau, les autres restant égales. Aussi : tout combiné, et
    les freins hors de son contrôle (âge, import, 3e division)."""
    cols = list(X.columns)
    ci = {c: i for i, c in enumerate(cols)}
    promoted = train_mask & (yv == 1)
    Xa = X.to_numpy()
    targets, raw = {}, {}
    for role in ROLES:
        sel = promoted & (d["role"] == role).to_numpy()
        targets[role] = np.median(Xa[sel], axis=0) if sel.sum() >= 5 else np.median(Xa[promoted], axis=0)
        sub = d[sel] if sel.sum() >= 5 else d[promoted]
        ranks = np.exp(-X.loc[sub.index, "Rang dans son poste"])
        raw[role] = {"games": float(sub["games"].median()), "winrate": float(sub["winrate"].median()),
                     "rank": float(ranks.median())}
    keys = [c for c in ACTIONABLE if c in ci] + [c for c in cols if c.startswith("stat:")]
    out = {}
    idxs = np.where(cur)[0]
    for k, i in enumerate(idxs):
        row = Xa[i]
        role = d.iloc[i]["role"]
        tgt = targets[role]
        base = p_cur[k]
        trials, labels = [], []
        for c in keys:
            j = ci[c]
            if row[j] >= tgt[j] - 1e-9:
                continue
            new = row.copy()
            new[j] = tgt[j]
            if c == "Rang dans son poste":  # garder les colonnes liées cohérentes
                for rc in cols:
                    if rc.startswith("Rang × ") and new[ci[rc]] != 0:
                        new[ci[rc]] = tgt[j]
                if "Rang dans sa ligue" in ci:
                    new[ci["Rang dans sa ligue"]] = max(new[ci["Rang dans sa ligue"]], tgt[j])
                    new[ci["1er de sa ligue"]] = float(new[ci["Rang dans sa ligue"]] >= -1e-9)
            trials.append(new)
            labels.append(c)
        r = d.iloc[i]
        ps = predict(np.vstack(trials + [np.max(np.vstack(trials), axis=0)])) if trials else np.array([base])
        items = []
        for c, p_new in zip(labels, ps[:-1]):
            gain = float(p_new - base)
            if gain < 0.01:
                continue
            spec = ACTIONABLE.get(c)
            if spec == "rank":
                tr = max(1, int(round(raw[role]["rank"])))
                now = int(round(math.exp(-row[ci["Rang dans son poste"]])))
                text = f"Monter au {tr}{'er' if tr == 1 else 'e'} rang de son poste au score (aujourd'hui {now}e)"
            elif spec == "games":
                text = f"Jouer plus : {int(r['games'])} parties → ~{int(raw[role]['games'])} (comme les montés)"
            elif spec == "winrate":
                text = f"Gagner plus : {round(100 * r['winrate'])} % → ~{round(100 * raw[role]['winrate'])} % de victoires"
            elif c.startswith("stat:"):
                text = f"{STAT_GAP.get(c[5:], c[5:]).capitalize()} au niveau des montés de son poste"
            else:
                text = spec
            items.append([text, round(gain, 3)])
        items.sort(key=lambda x: -x[1])
        brakes = []
        if pd.notna(r["age"]) and r["age"] >= 23.5:
            brakes.append(f"Âge ({r['age']:.0f} ans) : les montés ont en moyenne 21 ans")
        if X.iloc[i].get("Import", 0):
            brakes.append("Import : prend une des 2 places d'import")
        if level == "top" and X.iloc[i].get("3e division", 0):
            brakes.append("Joue en 3e division : la plupart des montés viennent de la 2e")
        if items or brakes:
            out[d.index[i]] = {"gaps": items[:4], "ceiling": round(float(max(ps[-1], base)), 4), "brakes": brakes}
    return out


# ---------------------------------------------------------------------------
def build(verbose=False, level="top"):
    df, labels, official = load(level)
    d = eligible(df, level)
    acad = academies(df)
    d["academy"] = [acad.get((r, s, t), False) for r, s, t in zip(d["region"], d["season"], d["team"])]
    d["y"] = [1.0 if (r, i, s) in labels else 0.0 for r, i, s in zip(d["region"], d["id"], d["season"])]
    last = int(d["season"].max())
    train_mask = (d["season"] < last).to_numpy()
    seasons = sorted(d.loc[train_mask, "season"].unique())

    # Saisons de validation : les plus récentes (>= RECENT_FROM) ; les plus
    # anciennes (2020-2022 : autre méta, autres formats) servent seulement à
    # l'entraînement, avec un poids choisi en validation (0 = écartées)
    recent = [s_ for s_ in seasons if s_ >= RECENT_FROM]
    if len(recent) < 2:
        recent = seasons
    old_seasons = [s_ for s_ in seasons if s_ not in recent]
    yv = d["y"].to_numpy()
    eval_mask = d["season"].isin(recent).to_numpy()
    de, ye = d[eval_mask], yv[eval_mask]
    weights_for = lambda w_old: np.where(d["season"].isin(old_seasons).to_numpy(), w_old, 1.0)
    old_weights = OLD_WEIGHTS if old_seasons else [1.0]

    results = {}
    for with_stats in (False, True):
        X, _ = features(d, with_stats)
        Xa = X.to_numpy()
        for w_old in old_weights:
            sw = weights_for(w_old) * train_mask
            for lam in (1, 3, 10, 30):
                p = backtest(d, yv, Xa, lam, recent, sw)
                results[(with_stats, lam, w_old)] = (metrics(ye, p[eval_mask], de), p)
    best = min(results, key=lambda k: results[k][0]["logloss"])
    with_stats, lam, w_old = best
    cv, cv_full = results[best]
    sw = weights_for(w_old) * train_mask
    # Référence : le score seul (rang + score dans le poste + région)
    Xb, _ = features(d, False)
    base_cols = ["Score dans son poste", "Rang dans son poste"] + [c for c in Xb if c.startswith("Région")]
    pb = backtest(d, yv, Xb[base_cols].to_numpy(), 10, recent, sw)
    baseline = metrics(ye, pb[eval_mask], de)
    if verbose:
        for k, (m, _) in sorted(results.items()):
            print(f"  stats={k[0]!s:5} lambda={k[1]:<4} poids 2020-22={k[2]:<5} AUC {m['auc']:.3f}  "
                  f"logloss {m['logloss']:.4f}  top3 {m['top3_share']:.2f}")
        print(f"  référence (score seul) : AUC {baseline['auc']:.3f} logloss {baseline['logloss']:.4f} top3 {baseline['top3_share']:.2f}")
    if old_seasons:
        print(f"  Saisons anciennes ({', '.join(map(str, old_seasons))}) : poids retenu {w_old} "
              f"(validation sur {', '.join(map(str, recent))})")

    X, rank = features(d, with_stats)
    Xn = X.to_numpy()
    # Test « dans le futur » : dernière saison connue prédite par un modèle appris sur les précédentes
    fwd_test = (d["season"] == recent[-1]).to_numpy()
    fwd_train = train_mask & (d["season"] < recent[-1]).to_numpy() & (sw > 0)
    p_fwd = Logit(lam).fit(Xn[fwd_train], yv[fwd_train], sw[fwd_train]).predict(Xn[fwd_test])
    logit_cv, logit_forward = cv, metrics(yv[fwd_test], p_fwd, d[fwd_test])
    # Historique (cartes de l'onglet Montées) : chaque saison connue prédite sans elle
    p_hist = backtest(d, yv, Xn, lam, seasons, sw)

    # Mélange avec LightGBM : moyenne des deux probabilités (même validation par saison)
    mix = lgb is not None
    if mix:
        try:  # test rapide : si LightGBM plante sur ce PC, on garde la logistique seule
            lgbm_fit_predict(Xn[:200], np.r_[np.ones(20), np.zeros(180)], Xn[:5])
        except Exception as e:
            print(f"  (LightGBM inutilisable : {e} ; régression logistique seule)")
            mix = False
    if mix:
        boost_full = backtest(d, yv, Xn, lam, recent, sw, boost=True)
        boost_cv = metrics(ye, boost_full[eval_mask], de)
        cv_full = np.where(eval_mask, (cv_full + boost_full) / 2, cv_full)
        cv = metrics(ye, cv_full[eval_mask], de)
        p_fwd = (p_fwd + lgbm_fit_predict(Xn[fwd_train], yv[fwd_train], Xn[fwd_test], sw[fwd_train])) / 2
        hist_boost = backtest(d, yv, Xn, lam, seasons, sw, boost=True)
        p_hist = (p_hist + hist_boost) / 2
        if verbose:
            print(f"  LightGBM seul : AUC {boost_cv['auc']:.3f} logloss {boost_cv['logloss']:.4f} ; "
                  f"mélange : AUC {cv['auc']:.3f} logloss {cv['logloss']:.4f}")
    else:
        print("  (LightGBM absent : régression logistique seule. Pour le mélange : pip install lightgbm)")
    forward = metrics(yv[fwd_test], p_fwd, d[fwd_test])
    cv_p = cv_full[eval_mask]

    # Calibration (validation par saison) : prédit vs observé par tranche
    bins = [0, 0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 1.01]
    yt = ye
    calib = []
    for lo, hi in zip(bins[:-1], bins[1:]):
        sel = (cv_p >= lo) & (cv_p < hi)
        if sel.sum():
            calib.append({"from": lo, "to": min(hi, 1), "n": int(sel.sum()), "predicted": round(float(cv_p[sel].mean()), 3),
                          "observed": round(float(yt[sel].mean()), 3)})

    # Saisons passées : probabilité que le modèle donnait aux montés SANS les avoir
    # vus (validation par saison), pour les cartes de l'onglet Montées
    past = d[train_mask].assign(p=p_hist[train_mask])
    past["prank"] = past.groupby(["region", "season", "role"])["p"].rank(ascending=False, method="first")
    history = {}
    for _, r in past[past["y"] == 1].iterrows():
        history.setdefault(r["region"], {}).setdefault(str(int(r["season"])), {})[r["id"]] = [
            round(float(r["p"]), 4), int(r["prank"])]

    # Modèle final : toutes les saisons connues ; prédiction de la dernière
    fit_mask = train_mask & (sw > 0)
    model = Logit(lam).fit(Xn[fit_mask], yv[fit_mask], sw[fit_mask])
    cols = list(X.columns)
    coefs = sorted(({"name": label_text(c, 0), "key": c, "coef": round(float(w), 3)}
                    for c, w in zip(cols, model.w[1:])), key=lambda x: -abs(x["coef"]))

    # Taux de montée par poste (passé) : postes plus ou moins faciles
    hist = d[train_mask]
    role_rates = {}
    for region in ["all"] + REGIONS:
        sub = hist if region == "all" else hist[hist["region"] == region]
        if not len(sub):
            continue
        role_rates[region] = {}
        for role in ROLES:
            rs = sub[sub["role"] == role]
            top10 = rs[rs.groupby(["region", "season"])["final"].rank(ascending=False) <= 3]
            role_rates[region][role] = {
                "eligible": int(len(rs)), "promoted": int(rs["y"].sum()),
                "rate": round(float(rs["y"].mean()), 4) if len(rs) else None,
                # parmi les 3 meilleurs du poste (région, saison) : part qui monte
                "top3_rate": round(float(top10["y"].mean()), 3) if len(top10) else None,
                "per_season": round(float(rs["y"].sum()) / max(1, rs[["region", "season"]].drop_duplicates().shape[0]), 2),
            }

    # Profils qui montent, par poste : parmi les 10 meilleurs du poste (région,
    # saison), écart moyen (en écarts-types) entre les montés et les autres
    PROFILE = ["Âge", "Expérience (parties)", "Forme du dernier split", "Progression sur un an", "Win rate",
               "Académie d'un club de 1re division", "Import", "EMEA Masters / international"] + \
              [c for c in X.columns if c.startswith("stat:")]
    top10 = (rank <= 10).to_numpy() & train_mask
    role_profiles = {}
    for role in ROLES:
        sel = top10 & (d["role"] == role).to_numpy()
        up, stay = sel & (yv == 1), sel & (yv == 0)
        if up.sum() < 5:
            continue
        diffs = []
        for c in PROFILE:
            v = X[c].to_numpy()
            sd = v[sel].std() or 1
            diffs.append([label_text(c, 0), round(float((v[up].mean() - v[stay].mean()) / sd), 2)])
        role_profiles[role] = {"promoted": int(up.sum()), "others": int(stay.sum()),
                               "age_up": round(float(d.loc[up, "age"].mean()), 1), "age_stay": round(float(d.loc[stay, "age"].mean()), 1),
                               "diffs": sorted(diffs, key=lambda x: -abs(x[1]))[:6]}

    # Prédictions de la dernière saison, avec les 3 facteurs les plus forts
    cur = ~train_mask
    boosters = lgbm_fit(Xn[fit_mask], yv[fit_mask], sw[fit_mask]) if mix else None

    def predict(Xm):
        p_ = model.predict(Xm)
        return (p_ + lgbm_predict(boosters, Xm)) / 2 if mix else p_

    p_cur = predict(Xn[cur])
    gaps = what_if(d, X, cur, yv, train_mask, predict, p_cur, level)
    contrib = model.contributions(Xn[cur])
    players = {}
    dc = d[cur].assign(p=p_cur)
    dc["prank"] = dc.groupby(["region", "role"])["p"].rank(ascending=False, method="first")
    xcur = X[cur]
    for i, (idx, r) in enumerate(dc.iterrows()):
        c = contrib[i].copy()
        # Rang × poste et âge² : regroupés avec le rang et l'âge
        for j, name in enumerate(cols):
            if name.startswith("Rang ×"):
                c[cols.index("Rang dans son poste")] += c[j]
                c[j] = 0
            elif name == "Âge²":
                c[cols.index("Âge")] += c[j]
                c[j] = 0
            elif name == "1er de sa ligue":
                c[cols.index("Rang dans sa ligue")] += c[j]
                c[j] = 0
        order = np.argsort(-np.abs(c))
        factors = []
        for j in order:
            text = explain(cols[j], r, xcur.iloc[i][cols[j]], c[j])
            if not text or abs(c[j]) < 0.08:
                continue
            factors.append([text, round(float(c[j]), 2)])
            if len(factors) == 4:
                break
        players.setdefault(r["region"], {})[r["id"]] = {
            "p": round(float(r["p"]), 4), "rank_role": int(r["prank"]), "score_rank": int(rank[idx]),
            "factors": factors,
            **gaps.get(idx, {}),
            **({"official": official[(r["region"], r["id"])]} if (r["region"], r["id"]) in official else {}),
        }

    # Contrôle en direct : montées déjà connues pour la saison suivante
    live = []
    for (region, pid), info in official.items():
        pr = players.get(region, {}).get(pid)
        if pr:
            live.append({"region": region, "id": pid, "p": pr["p"], "rank_role": pr["rank_role"], "team": info["team"]})
    live.sort(key=lambda x: -x["p"])
    n_live = len(live)

    data = {
        "generated": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "season": last, "target": last + 1,
        "trained_on": [int(s) for s in seasons if s in recent or w_old > 0],
        "validated_on": [int(s) for s in recent],
        "old_seasons": {"seasons": [int(s) for s in old_seasons], "weight": w_old},
        "model": "Régression logistique + LightGBM (moyenne)" if mix else "Régression logistique",
        "logit_validation": logit_cv, "logit_forward": logit_forward,
        "with_stats": with_stats, "lambda": lam,
        "validation": cv, "forward": forward, "baseline": baseline,
        "calibration": calib,
        "coefficients": coefs[:24],
        "role_rates": role_rates,
        "role_profiles": role_profiles,
        "live": {"known": n_live, "median_p": round(float(np.median([x["p"] for x in live])), 3) if live else None,
                 "in_top3": int(sum(x["rank_role"] <= 3 for x in live)),
                 "in_top5": int(sum(x["rank_role"] <= 5 for x in live)), "players": live[:60]},
        "history": history,
        "players": players,
    }
    what = "Modèle de montée" if level == "top" else "Modèle 3e -> 2e division"
    print(f"  {what} : {int(yv[train_mask].sum())} montées apprises sur {int(train_mask.sum())} joueurs "
          f"({', '.join(map(str, seasons))}) ; validation AUC {cv['auc']:.3f} (score seul {baseline['auc']:.3f}), "
          f"{cv['top3_share']:.0%} des montés dans le top 3 prédit de leur poste")
    print(f"  Test dans le futur ({seasons[-1]}) : AUC {forward['auc']:.3f}, top 3 {forward['top3_share']:.0%} ; "
          f"montées {last + 1} déjà connues : {n_live}, dont {data['live']['in_top3']} dans le top 3 prédit")
    return data


def main(verbose=False):
    data = build(verbose, "top")
    # 3e -> 2e division (Europe, Corée : les régions avec une 3e division)
    try:
        data["tier2"] = build(verbose, "tier2")
    except Exception as e:
        print(f"  (modèle 3e -> 2e division non calculé : {e})")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  -> {OUT}")
    return data


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--verbose", action="store_true")
    main(parser.parse_args().verbose)
