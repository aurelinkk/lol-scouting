"""Niveau des ligues saison par saison, d'après leurs joueurs.

Le coefficient EMEA Masters (league_strength.py) mesure le niveau d'une ligue
sur 2 ans, mais ne voit pas qu'une ligue est plus forte une année qu'une autre
(ex : LFL2 2025, pleine de joueurs passés par la LFL, contre une Nexus League
2026 plus jeune), ni le niveau propre des ERL2 (qui ne vont pas à l'EM).

Indicateurs par (ligue, saison), calculés sur les titulaires (>= 10 parties de
saison régulière / playoffs dans la ligue, hors promotion et Invitational) :

ERL1
  - ex_lec  : part des titulaires déjà passés par la LEC (équipes invitées exclues)
  - up      : part des titulaires en LEC la saison suivante
              (parties jouées, ou mercato si la saison n'a pas commencé)
ERL2
  - above   : part des titulaires passés par le niveau au-dessus (>= 10 parties
              d'ERL1 la saison précédente, ou LEC avant)
  - up      : part des titulaires en ERL1 ou LEC la saison suivante
  - cross   : taux de victoire contre les équipes de l'ERL1 du pays (Invitational,
              tournois de promotion...), tiré vers la moyenne s'il y a peu de parties

Chaque indicateur est transformé en z-score parmi toutes les (ligue, saison) du
même niveau, puis moyenné (poids : scoring.TALENT_SIGNAL_WEIGHTS) -> `talent`.
Le coefficient de la ligue cette saison = coef EM + TALENT_WEIGHT x talent.

« up » regarde la saison suivante : pour ne pas récompenser un joueur pour sa
propre montée, son coefficient est recalculé sans lui (leave-one-out, voir
`self_up_adjustment`).

Usage :
    python scout.py niveau-ligues                 # tableau de toutes les saisons
    python scout.py niveau-ligues --league LFL2
"""
import argparse

import numpy as np
import pandas as pd

from scouting.config import scoring
REGULAR_EXCLUDED = r"Promotion|Relegation|Qualifier|Invitational|Play-In|LCQ|Versus|Showmatch|All-Star"
STARTER_GAMES = 10
TEAM_GAMES = 10
ABOVE_GAMES = 10


def regular(games):
    return games[~games["tournament"].str.contains(REGULAR_EXCLUDED, case=False, na=False)]


def main_league(games):
    """Ligue principale (ERL1 / ERL2) de chaque équipe par saison."""
    g = regular(games[games["tier"].isin(["ERL1", "ERL2"])])
    n = g.groupby(["season", "team", "league_code", "tier"])["game_id"].nunique().reset_index(name="n")
    n = n[n["n"] >= TEAM_GAMES].sort_values("n", ascending=False)
    return n.drop_duplicates(["season", "team"])[["season", "team", "league_code", "tier"]]


def starters(games):
    """Titulaires de chaque (ligue, saison) d'ERL : >= 10 parties régulières."""
    g = regular(games[games["tier"].isin(["ERL1", "ERL2"])])
    n = (g.groupby(["season", "league_code", "tier", "player"])
         .agg(games=("game_id", "nunique"), team=("team", "last")).reset_index())
    return n[n["games"] >= STARTER_GAMES]


def next_levels(games, season):
    """Niveau de chaque joueur la saison suivante : ({joueur: (niveau, ligue)}, source).
    Parties jouées si la saison a commencé (source "games"), sinon le mercato
    (source "mercato"). (None, None) si inconnu."""
    from scouting.analysis.promotions import destination
    nxt = games[games["season"] == season + 1]
    if not nxt.empty:
        d, source = destination(nxt), "games"
    else:
        from scouting.mercato.rosters import mercato_destination
        d, source = mercato_destination(season + 1, games), "mercato"
        if d is None or d.empty:
            return None, None
    return dict(zip(d["player"], zip(d["new_level"], d["new_league"]))), source


_BASE = {}


def base_coefficients(games, season, window=None):
    """Coefficient EM de la saison (fenêtre de 2 ans par défaut), sans l'ajustement « talent »."""
    from scouting.analysis.league_strength import coef_window, league_coefficients
    window = tuple(window or coef_window(season))
    if window not in _BASE:
        _BASE[window] = league_coefficients(games[games["season"].isin(window)], list(window))["coef"]
    return _BASE[window]


def promotion_value(tier, league, nxt, base):
    """Valeur d'une montée : 1 pour la LEC ; pour une ERL2, une ERL1 compte selon
    son niveau par rapport à l'ERL1 du pays (LFL2 -> LFL = 1, LFL2 -> LPLOL ~ 0.4)."""
    if nxt is None:
        return 0.0
    level, dest = nxt
    if level == "LEC":
        return 1.0
    if tier == "ERL2" and level == "ERL1":
        parent = base.get(scoring.ERL2_PARENT.get(league))
        dest_coef = base.get(dest)
        if parent is None or dest_coef is None or pd.isna(parent) or pd.isna(dest_coef):
            return 1.0
        return float(np.clip(dest_coef / parent, 0, 1))
    return 0.0


def cross_tier(games):
    """Parties entre une équipe d'ERL2 et une équipe de l'ERL1 de son pays."""
    teams = main_league(games)
    g = games[games["tier"].isin(["ERL1", "ERL2"])].drop_duplicates(["game_id", "team"])
    g = g.merge(teams.rename(columns={"league_code": "team_league", "tier": "team_tier"}),
                on=["season", "team"])
    x = g.merge(g[["game_id", "team", "team_league"]], on="game_id", suffixes=("", "_opp"))
    x = x[x["team"] != x["team_opp"]]
    parent = x["team_league"].map(scoring.ERL2_PARENT)
    x = x[(x["team_tier"] == "ERL2") & (parent == x["team_league_opp"])]
    return (x.groupby(["season", "team_league"])["win"].agg(["sum", "count"])
            .rename(columns={"sum": "cross_wins", "count": "cross_games"})
            .reset_index().rename(columns={"team_league": "league_code"}))


TIER_ORDER = {"LEC": 0, "ERL1": 1, "ERL2": 2}


def player_signals(games, use_next_season=True):
    """Une ligne par titulaire (joueur, ligue, saison) avec ses indicateurs :
    ex_lec, above (bool) et up (valeur de sa montée la saison suivante, 0..1)."""
    from scouting.collect.careers import fetch_lec_history
    lec = fetch_lec_history()
    st = starters(games)
    # Plus haut niveau joué dans la saison (un joueur déjà en ERL1 ne « monte » pas d'ERL2)
    best = (regular(games[games["tier"].isin(TIER_ORDER)])
            .assign(level=lambda d: d["tier"].map(TIER_ORDER))
            .groupby(["season", "player"])["level"].min())
    rows = []
    for season in sorted(st["season"].unique()):
        s = st[st["season"] == season].copy()
        s["ex_lec"] = s["player"].isin(set(lec.loc[lec["year"] < season, "player"]))
        if (games["season"] == season - 1).any():
            prev = regular(games[(games["season"] == season - 1) & (games["tier"] == "ERL1")])
            n = prev.groupby("player")["game_id"].nunique()
            s["above"] = s["player"].isin(n[n >= ABOVE_GAMES].index) | s["ex_lec"]
        else:
            s["above"] = np.nan
        nxt, source = next_levels(games, season) if use_next_season else (None, None)
        if nxt is None:
            s["up"] = np.nan
        else:
            base = base_coefficients(games, season)
            s["up"] = [promotion_value(t, l, nxt.get(p), base)
                       for p, t, l in zip(s["player"], s["tier"], s["league_code"])]
            # Déjà à un niveau supérieur cette saison : pas une montée de cette ligue
            above_now = [best.get((season, p), 9) < TIER_ORDER[t] for p, t in zip(s["player"], s["tier"])]
            s.loc[above_now, "up"] = np.nan
            # Mercato : les rosters LEC sont presque tous connus en novembre, pas
            # ceux des ERL1 -> pas encore de montées d'ERL2 pour cette saison
            if source == "mercato":
                s.loc[s["tier"] == "ERL2", "up"] = np.nan
        rows.append(s)
    return pd.concat(rows, ignore_index=True)


_CACHE = {}


def league_talent(games=None, use_next_season=None, verbose=False):
    """Une ligne par (ligue, saison) d'ERL : indicateurs, z-scores et `talent`.

    use_next_season=False : n'utilise pas la saison suivante (indicateur « up »),
    comme en cours de saison avant le mercato. Sert aux backtests honnêtes.
    Par défaut : scoring.TALENT_USE_NEXT_SEASON.
    """
    if use_next_season is None:
        use_next_season = scoring.TALENT_USE_NEXT_SEASON
    if games is None:
        from scouting.analysis.league_strength import available_seasons, load_games
        if "games" not in _CACHE:
            _CACHE["games"] = load_games(available_seasons())
        games = _CACHE["games"]
    key = (use_next_season, len(games))
    if key in _CACHE:
        return _CACHE[key]

    ps = player_signals(games, use_next_season)
    agg = (ps.groupby(["season", "league_code", "tier"])
           .agg(starters=("player", "nunique"), ex_lec_n=("ex_lec", "sum"),
                above_n=("above", "sum"), above_known=("above", lambda s: s.notna().any()),
                up_sum=("up", "sum"), up_count=("up", "count"),
                up_n=("up", lambda s: int((s > 0).sum())))
           .reset_index())
    agg["ex_lec"] = agg["ex_lec_n"] / agg["starters"]
    agg["above"] = (agg["above_n"] / agg["starters"]).where(agg["above_known"])
    agg["up"] = (agg["up_sum"] / agg["up_count"]).where(agg["up_count"] > 0)

    # Victoires contre l'ERL1 du pays, tirées vers la moyenne générale
    cross = cross_tier(games)
    agg = agg.merge(cross, on=["season", "league_code"], how="left")
    agg[["cross_wins", "cross_games"]] = agg[["cross_wins", "cross_games"]].fillna(0)
    total = cross["cross_wins"].sum() / max(cross["cross_games"].sum(), 1)
    k = scoring.CROSS_SHRINK_GAMES
    agg["cross"] = ((agg["cross_wins"] + k * total) / (agg["cross_games"] + k)).where(
        (agg["tier"] == "ERL2") & (agg["cross_games"] >= scoring.CROSS_MIN_GAMES))

    # z-scores par niveau, puis moyenne pondérée des indicateurs disponibles
    agg["talent"], agg["talent_den"], agg["up_sd"] = 0.0, 0.0, np.nan
    for tier, weights in scoring.TALENT_SIGNAL_WEIGHTS.items():
        t = agg["tier"] == tier
        if not t.any():  # ex : pas d'ERL2 en NA
            continue
        num, den = 0.0, 0.0
        for signal, w in weights.items():
            v = agg.loc[t, signal]
            sd = v.std()
            if not sd or np.isnan(sd):
                continue
            z = ((v - v.mean()) / sd).clip(-2.5, 2.5)
            agg.loc[t, f"z_{signal}"] = z
            if signal == "up":
                agg.loc[t, "up_sd"] = sd
            num = num + (w * z).fillna(0)
            den = den + w * z.notna()
        if isinstance(den, float):  # aucun indicateur utilisable pour ce niveau
            continue
        agg.loc[t, "talent"] = (num / den.replace(0, np.nan)).fillna(0)
        agg.loc[t, "talent_den"] = den
    agg.attrs["players"] = ps
    if verbose:
        print(agg.round(3).to_string())
    _CACHE[key] = agg
    return agg


def season_coefficients(season, use_next_season=None, window=None):
    """Coefficient de chaque ligue pour `season` : coef EM + TALENT_WEIGHT x talent.
    Les ERL2 partent du coef EM de l'ERL1 du pays moins ERL2_DISCOUNT."""
    talent = league_talent(use_next_season=use_next_season)
    base = base_coefficients(_CACHE["games"], season, window).copy()
    t = talent[talent["season"] == season].set_index("league_code")
    out = pd.DataFrame({"base": base})
    out["talent"] = t["talent"].reindex(out.index).fillna(0)
    out["tier"] = t["tier"].reindex(out.index)
    # Poids du niveau de chaque ligue (calcul explicite en float : avec les
    # chaînes Arrow de pandas 3, un .map() peut garder un type texte)
    w = pd.Series([float(scoring.TALENT_WEIGHT.get(t, 0.0)) if isinstance(t, str) else 0.0
                   for t in out["tier"]], index=out.index, dtype=float)
    out["base"] = pd.to_numeric(out["base"], errors="coerce")
    out["talent"] = pd.to_numeric(out["talent"], errors="coerce").fillna(0.0)
    out["coef"] = out["base"] + w * out["talent"]
    # ERL2 : coef EM de l'ERL1 du pays - décote (déjà dans `base`) + son propre
    # niveau ; l'ajustement de l'ERL1 n'est pas répercuté (LFL2 2025 forte,
    # Nexus League 2026 plus faible, quelle que soit la LFL de l'année)
    return out


def self_up_adjustment(season, use_next_season=None):
    """Baisse du coefficient pour chaque joueur monté, quand on retire sa propre
    montée de l'indicateur « up » de sa ligue (leave-one-out) : sa montée ne doit
    pas gonfler son propre score. Renvoie {(joueur, ligue): delta <= 0}."""
    talent = league_talent(use_next_season=use_next_season)
    ps = talent.attrs["players"]
    ps = ps[(ps["season"] == season) & (ps["up"] > 0)]
    t = talent[talent["season"] == season].set_index("league_code")
    out = {}
    for _, r in ps.iterrows():
        L = t.loc[r["league_code"]]
        n, sd, den = L["up_count"], L["up_sd"], L["talent_den"]
        if n < 2 or not sd or not den or np.isnan(sd):
            continue
        loo = (L["up_sum"] - r["up"]) / (n - 1)
        w_up = scoring.TALENT_SIGNAL_WEIGHTS[r["tier"]].get("up", 0)
        delta_talent = w_up * (np.clip((loo - L["up"]) / sd, -2.5, 2.5)) / den
        out[(r["player"], r["league_code"])] = scoring.TALENT_WEIGHT[r["tier"]] * delta_talent
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--league")
    parser.add_argument("--no-next", action="store_true",
                        help="sans la saison suivante (comme en cours de saison)")
    args = parser.parse_args()
    t = league_talent(use_next_season=not args.no_next)
    if args.league:
        t = t[t["league_code"] == args.league]
    pd.set_option("display.width", 250)
    cols = ["season", "league_code", "tier", "starters", "ex_lec_n", "above_n", "up_n", "up",
            "cross_wins", "cross_games", "talent"]
    print(t.sort_values(["tier", "league_code", "season"])[cols].round(2).to_string(index=False))


if __name__ == "__main__":
    main()
