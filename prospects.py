"""Classement des prospects (joueurs d'ERL, hors LEC).

Score final = score_ligue + bonus_ligue + EM_WEIGHT x score_em

- score_ligue : performance comparée aux joueurs du même rôle dans la même
  ligue (z-scores pondérés, poids dans scoring.py). 0 = moyenne de la ligue.
- bonus_ligue : niveau de la ligue d'après les placements à l'EMEA Masters
  (league_strength.py).
- score_em : performance à l'EMEA Masters face aux joueurs de toutes les ligues.

Usage :
    python prospects.py                          # saison 2026
    python prospects.py --season 2025
    python prospects.py --max-age 21 --role Mid --top 15
    python prospects.py --tier ERL2
"""
import argparse

import pandas as pd

from league_strength import available_seasons, coef_window, load_games
from region import DATA_DIR, IS_EU
from league_talent import season_coefficients, self_up_adjustment
from oracles import OE_STATS, attach_oe
import scoring
from scoring import (EM_MIN_GAMES, EM_SHRINK_GAMES, EM_WEIGHT, LEAGUE_WEIGHT,
                     MIN_PLAYERS_FOR_COMPARISON, ROLE_WEIGHTS, SAMPLE_SHRINK_GAMES,
                     SOLOQ_WEIGHT)

DISPLAY = ["player", "team", "league_code", "tier", "age", "games", "final",
           "league_score", "league_bonus", "em_score", "em_games",
           "winrate", "kda", "cs_min", "dpm", "dmg_share", "kp", "champions"]


def add_game_metrics(df):
    df = df.copy()
    team = df.groupby(["game_id", "team"])[["damage", "gold"]].transform("sum")
    df["dmg_share"] = df["damage"] / team["damage"]
    df["gold_share"] = df["gold"] / team["gold"]
    df["kp"] = (df["kills"] + df["assists"]) / df["team_kills"].where(df["team_kills"] > 0)
    df = add_champion_adjusted(df)
    # Stats @15 / first blood d'Oracle's Elixir, rattachées partie par partie
    return attach_oe(df)


# Nombre minimum de parties sur un champion (à un poste) pour avoir une moyenne
# fiable ; en dessous, on compare à la moyenne du poste
MIN_CHAMPION_GAMES = 20


def add_champion_adjusted(df):
    """Dégâts comparés à la moyenne des joueurs du même poste sur le même champion.

    Un mid qui joue Orianna ou Anivia fait naturellement moins de dégâts qu'un
    mid LeBlanc : on mesure l'écart à ce qu'on attend du champion joué.
    dmg_share_vs_champ = +0.03 -> 3 points de % de dégâts de plus que la moyenne
    des joueurs sur ce champion à ce poste.
    """
    df["dpm_game"] = df["damage"] / df["duration_min"]
    by_champ = df.groupby(["role", "champion"])
    n = by_champ["game_id"].transform("count")
    by_role = df.groupby("role")
    for stat, out in (("dmg_share", "dmg_share_vs_champ"), ("dpm_game", "dpm_vs_champ")):
        expected = by_champ[stat].transform("mean").where(n >= MIN_CHAMPION_GAMES,
                                                          by_role[stat].transform("mean"))
        df[out] = df[stat] - expected
    return df


def aggregate(df):
    """Une ligne par saison / joueur / ligue / rôle."""
    keys = ["season", "player", "league_code", "tier", "role"]
    df = df.sort_values("date")  # pour que "last" = la partie la plus récente
    grouped = df.groupby(keys)
    totals = grouped[["kills", "deaths", "assists", "cs", "gold", "damage",
                      "vision_score", "duration_min"]].sum()
    games = grouped.size()

    stats = pd.DataFrame({
        "games": games,
        "team": grouped["team"].last(),  # équipe la plus récente
        "winrate": grouped["win"].mean(),
        "kda": (totals["kills"] + totals["assists"]) / totals["deaths"].clip(lower=1),
        "deaths_pg": totals["deaths"] / games,
        "assists_pg": totals["assists"] / games,
        "cs_min": totals["cs"] / totals["duration_min"],
        "gold_min": totals["gold"] / totals["duration_min"],
        "dpm": totals["damage"] / totals["duration_min"],
        "vision_min": totals["vision_score"] / totals["duration_min"],
        "kp": grouped["kp"].mean(),
        "dmg_share": grouped["dmg_share"].mean(),
        "dmg_share_vs_champ": grouped["dmg_share_vs_champ"].mean(),
        "dpm_vs_champ": grouped["dpm_vs_champ"].mean(),
        "gold_share": grouped["gold_share"].mean(),
        "champions": grouped["champion"].nunique(),
        # Oracle's Elixir : moyenne sur les parties retrouvées
        **{stat: grouped[stat].mean() for stat in OE_STATS},
        "oe_games": grouped["oe_match"].sum(),
        "birthdate": grouped["birthdate"].first(),
        "age_approx": grouped["birthdate_approx"].any() if "birthdate_approx" in df else False,
        "last_game": grouped["date"].max(),
        "country": grouped["country"].first(),
    }).reset_index()

    # Âge au moment de la dernière partie de la saison
    # (dernière partie de la saison, toutes ligues confondues)
    season_end = stats.groupby(["season", "player"])["last_game"].transform("max")
    stats["age"] = ((season_end - stats["birthdate"]).dt.days / 365.25).round(1)
    return stats


def zscores(group, role):
    """z-score de chaque stat du rôle, par rapport au groupe (même poste, même ligue)."""
    z = {}
    for stat, weight in ROLE_WEIGHTS[role].items():
        if weight == 0 or stat not in group:
            continue
        values = group[stat]
        std = values.std()
        if values.notna().sum() < MIN_PLAYERS_FOR_COMPARISON or not std or pd.isna(std):
            continue  # stat absente pour cette ligue (ex : pas de données @15)
        z[stat] = (values - values.mean()) / std
    return pd.DataFrame(z, index=group.index)


def weighted_score(z, role):
    """Moyenne pondérée des z-scores ; une stat manquante pour un joueur est ignorée."""
    weights = pd.Series({s: ROLE_WEIGHTS[role][s] for s in z.columns})
    contributions = z * weights
    used_weight = z.notna().mul(weights.abs()).sum(axis=1)
    return contributions.sum(axis=1) / used_weight.where(used_weight > 0)


def weighted_zscores(stats, group_keys):
    """Score = moyenne pondérée des z-scores, au sein de chaque groupe."""
    stats = stats.copy()
    stats["score"] = float("nan")
    for _, group in stats.groupby(group_keys):
        role = group["role"].iloc[0]
        if role not in ROLE_WEIGHTS or len(group) < MIN_PLAYERS_FOR_COMPARISON:
            continue
        z = zscores(group, role)
        if not z.empty:
            stats.loc[group.index, "score"] = weighted_score(z, role)
    return stats


def blend_international(league_rows, season):
    """1re division (LEC / LCS) : bonus des tournois internationaux (Worlds, MSI,
    EWC, First Stand, voir intl.py) et écart élargi entre joueurs de LEC
    (scoring.TOP_LEAGUE_SPREAD).

    Aux internationaux, chaque joueur est comparé à tous ceux de son poste (LCK,
    LPL...) : z-score. On y ajoute l'écart de niveau entre l'international et
    la LEC (écart moyen entre le score LEC et le score international des
    joueurs de LEC présents), pour qu'une perf. moyenne aux Worlds rapporte déjà.
    Bonus = INTL_WEIGHT x (z + écart) x parties / (parties + INTL_SHRINK_GAMES),
    comme le bonus EMEA Masters des joueurs d'ERL."""
    league_rows = league_rows.copy()
    top = league_rows["tier"] == "LEC"
    league_rows["intl_games"] = 0
    league_rows["intl_score"] = float("nan")
    league_rows["intl_bonus"] = 0.0
    try:
        from intl import load_intl
        intl = load_intl(season)
    except Exception:
        intl = None
    if intl is not None and top.any():
        istats = aggregate(add_game_metrics(intl))
        istats = istats[istats["games"] >= scoring.INTL_MIN_GAMES]
        istats = weighted_zscores(istats, ["role"]).dropna(subset=["score"])
        z = istats.set_index("player")["score"]
        n = istats.set_index("player")["games"]
        rows = league_rows[top & league_rows["player"].isin(z.index)]
        if len(rows):
            gap = max(0.0, (rows["score"] - rows["player"].map(z)).mean()) if len(rows) >= 5 else 0.0
            for idx, r in rows.iterrows():
                games = n[r["player"]]
                league_rows.at[idx, "intl_games"] = int(games)
                league_rows.at[idx, "intl_score"] = round(float(z[r["player"]]), 3)
                league_rows.at[idx, "intl_bonus"] = (scoring.INTL_WEIGHT * (z[r["player"]] + gap)
                                                     * games / (games + scoring.INTL_SHRINK_GAMES))
    league_rows.loc[top, "score"] = league_rows.loc[top, "score"] * scoring.TOP_LEAGUE_SPREAD
    return league_rows


def build_ranking(games, season, coef_seasons, min_games=10, use_next_season=None):
    """Classement de tous les joueurs d'ERL de la saison (LEC exclue).

    use_next_season : utiliser les montées de la saison suivante dans le niveau
    de la ligue (défaut : scoring.TALENT_USE_NEXT_SEASON ; False pour les backtests).
    """
    games = add_game_metrics(games[games["season"] == season])
    stats = aggregate(games)

    # Score dans sa ligue (on ne garde que les échantillons suffisants). La LEC
    # (LCS en NA) est calculée aussi, pour comparer les prospects aux titulaires
    # de 1re division (onglet Données, filtre désactivé par défaut)
    league_rows = stats[stats["tier"].isin(["ERL1", "ERL2", "LEC"]) & (stats["games"] >= min_games)]
    # Pas les équipes invitées en LEC (Los Ratones, KC Blue en LEC Versus 2026)
    lec_games = games[games["tier"] == "LEC"]
    regular_lec = set(lec_games.loc[~lec_games["tournament"].str.contains(
        r"Versus|Showmatch|All-Star", case=False, na=False), "team"])
    league_rows = league_rows[(league_rows["tier"] != "LEC") | league_rows["team"].isin(regular_lec)]
    league_rows = weighted_zscores(league_rows, ["league_code", "role"])
    # Performance comparée à son équipe (scoring.TEAM_ADJUST) : le joueur le plus
    # faible d'une équipe qui gagne tout ne doit pas passer devant celui qui
    # surperforme dans une équipe du bas de tableau
    grp = league_rows.groupby(["league_code", "team"])["score"]
    n = grp.transform("count")
    mates = ((grp.transform("sum") - league_rows["score"]) / (n - 1)).where(n > 1, 0.0)
    league_rows["team_mates"] = mates
    league_rows["team_adjust"] = -league_rows["tier"].map(
        lambda t: scoring.TEAM_ADJUST.get(t, 0.0)).astype(float) * mates
    league_rows["score"] = league_rows["score"] + league_rows["team_adjust"]
    league_rows = blend_international(league_rows, season)
    # Réduction selon le nombre de parties (voir SAMPLE_SHRINK_GAMES)
    league_rows["league_score_raw"] = league_rows["score"]
    league_rows["sample_factor"] = league_rows["games"] / (league_rows["games"] + SAMPLE_SHRINK_GAMES)
    league_rows["league_score"] = league_rows["score"] * league_rows["sample_factor"]
    league_rows = league_rows.drop(columns="score")

    # Ligue principale d'un joueur : la plus haute qu'il a jouée avec assez de
    # parties (ERL1 avant ERL2), puis la plus récente. Ex : Looki 2026 =
    # LFL avec KC Blue, pas la PRM2 de l'automne 2025 avec DKB.
    # La LEC n'est la ligue principale que d'un joueur sans saison d'ERL (un
    # monté en cours de saison garde son profil ERL : ex. SamD 2025)
    tier_order = {"ERL1": 0, "ERL2": 1, "LEC": 2}
    ranking = (league_rows.dropna(subset=["league_score"])
               .assign(_tier=lambda d: d["tier"].map(tier_order))
               .sort_values(["_tier", "last_game"], ascending=[True, False])
               .drop_duplicates("player")
               .drop(columns="_tier"))

    # Bonus de niveau de ligue
    # Coefficient de la saison = coef EM (2 ans) + niveau des joueurs de la ligue
    # cette saison (league_talent.py). Un joueur monté ne profite pas de sa
    # propre montée dans l'indicateur « montées de la ligue » (leave-one-out).
    coefs = season_coefficients(season, use_next_season, window=coef_seasons)
    erl1 = [c for c in ranking.loc[ranking["tier"] == "ERL1", "league_code"].unique()
            if c in coefs.index]
    ref = coefs.loc[erl1, "coef"]
    ranking["league_coef_base"] = ranking["league_code"].map(coefs["base"])
    ranking["league_talent"] = ranking["league_code"].map(coefs["talent"])
    loo = self_up_adjustment(season, use_next_season)
    ranking["league_coef"] = ranking["league_code"].map(coefs["coef"]) + [
        loo.get((p, l), 0.0) for p, l in zip(ranking["player"], ranking["league_code"])]
    ranking["league_bonus"] = (LEAGUE_WEIGHT * (ranking["league_coef"] - ref.mean())
                               / ref.std()).fillna(0)

    # Performance à l'EMEA Masters (comparée à tous les joueurs de l'EM)
    em = stats[(stats["tier"] == "EM") & (stats["games"] >= EM_MIN_GAMES)]
    em = weighted_zscores(em, ["role"])
    em = em.sort_values("games", ascending=False).drop_duplicates("player")
    em["em_score_raw"] = em["score"]
    em["em_score"] = em["score"] * em["games"] / (em["games"] + EM_SHRINK_GAMES)
    ranking = ranking.merge(
        em[["player", "em_score", "em_score_raw", "games"]].rename(columns={"games": "em_games"}),
        on="player", how="left")
    ranking["em_games"] = ranking["em_games"].fillna(0).astype(int)

    # Passage en LEC (historique complet Leaguepedia, équipes invitées exclues) :
    #  - played_lec : a joué en LEC cette saison -> exclu des prospects
    #  - ex_lec     : a joué en LEC une saison précédente -> malus (remonte plus rarement)
    try:
        from careers import fetch_lec_history, lec_before
        hist = fetch_lec_history()
        lec_now = set(hist.loc[hist["year"] == season, "player"])
        before = lec_before(season)
    except Exception as e:  # pas de réseau ni de cache : on se rabat sur nos données
        print(f"  (historique LEC indisponible : {e})")
        lec_now, before = set(stats.loc[stats["tier"] == "LEC", "player"]), {}
    ranking["played_lec"] = ranking["player"].isin(lec_now)
    ranking["ex_lec"] = ranking["player"].map(before)  # "Rogue (European Team) (2024)"
    top = ranking["tier"] == "LEC"
    ranking["ex_lec_malus"] = (ranking["ex_lec"].notna() & ~top) * scoring.EX_LEC_MALUS
    # 1re division : bonus fixe de niveau (calibré sur les montés, voir scoring.py)
    from region import REGION
    ranking.loc[top, "league_bonus"] = scoring.TOP_LEAGUE_BONUS.get(REGION, 0.0)
    # Sans EMEA Masters pour situer les ligues (Corée) : malus fixe de 3e division
    if REGION in scoring.THIRD_TIER_MALUS:
        ranking.loc[ranking["tier"] == "ERL2", "league_bonus"] = scoring.THIRD_TIER_MALUS[REGION]

    # SoloQ : seulement pour la saison en cours (le relevé est d'aujourd'hui)
    ranking["soloq_bonus"] = 0.0
    if season == pd.Timestamp.today().year:
        from soloq import pro_soloq
        sq = pro_soloq()
        if sq is not None:
            ranking = ranking.merge(sq, on="player", how="left")
            ranking["soloq_bonus"] = (SOLOQ_WEIGHT * (1 - (ranking["soloq_rank"] - 1)
                                                      / ranking["soloq_ladder_size"])).fillna(0)

    ranking["intl_bonus"] = ranking.get("intl_bonus", pd.Series(0.0, index=ranking.index)).fillna(0.0)
    # Un joueur classé en LEC n'a pas de bonus EMEA Masters (ex : Stend 2026,
    # EM avec Vitality.Bee puis LEC avec Shifters) : il est jugé au niveau LEC
    ranking.loc[ranking["tier"] == "LEC", "em_score"] = float("nan")
    ranking["final"] = (ranking["league_score"] + ranking["league_bonus"] + ranking["intl_bonus"]
                        + EM_WEIGHT * ranking["em_score"].fillna(0) + ranking["soloq_bonus"]
                        + ranking["ex_lec_malus"])

    # Rang (percentile) dans son rôle parmi tous les joueurs d'ERL
    # Percentile parmi les joueurs d'ERL ; un joueur de LEC est situé par rapport
    # à eux (où il se classerait parmi les prospects de son poste)
    erl = ranking[~top]
    ranking.loc[~top, "role_percentile"] = erl.groupby("role")["final"].rank(pct=True).round(3)
    for idx in ranking.index[top]:
        same = erl.loc[erl["role"] == ranking.at[idx, "role"], "final"]
        ranking.at[idx, "role_percentile"] = round(float((same < ranking.at[idx, "final"]).mean()), 3) if len(same) else None
    return ranking.sort_values("final", ascending=False)


def calibrate_top_bonus():
    """Bonus de 1re division : écart moyen entre le score d'un joueur en ERL la
    saison N et son score en LEC (LCS) la saison N+1, sur tous les montés."""
    import io, contextlib
    seasons = available_seasons()
    games = load_games(seasons)
    saved = dict(scoring.TOP_LEAGUE_BONUS)
    scoring.TOP_LEAGUE_BONUS = {k: 0.0 for k in saved}
    rk = {}
    for s in seasons:
        with contextlib.redirect_stdout(io.StringIO()):
            rk[s] = build_ranking(games, s, coef_window(s))
    scoring.TOP_LEAGUE_BONUS = saved
    rows = []
    for s in seasons[:-1]:
        a = rk[s][rk[s]["tier"] != "LEC"][["player", "final"]]
        b = rk[s + 1][rk[s + 1]["tier"] == "LEC"][["player", "league_score"]]
        rows.append(a.merge(b, on="player").assign(season=s))
    m = pd.concat(rows)
    m["gap"] = m["final"] - m["league_score"]
    print(f"{len(m)} montés ; bonus conseillé = {m['gap'].mean():.2f} (médiane {m['gap'].median():.2f})")
    print(m.groupby("season")["gap"].agg(["count", "mean"]).round(2).to_string())
    print("-> à reporter dans scoring.TOP_LEAGUE_BONUS")
    # 3e division sans EMEA Masters (Corée) : écart entre le score en 3e division
    # (sans malus) et le score en 2e division l'année suivante
    from region import REGION
    if REGION in scoring.THIRD_TIER_MALUS:
        rows = []
        for s in seasons[:-1]:
            a = rk[s][rk[s]["tier"] == "ERL2"].assign(
                raw=lambda d: d["final"] - d["league_bonus"])[["player", "raw"]]
            b = rk[s + 1][rk[s + 1]["tier"] == "ERL1"][["player", "final"]]
            rows.append(a.merge(b, on="player"))
        m = pd.concat(rows)
        if len(m):
            print(f"{len(m)} montés de 3e en 2e division ; malus conseillé = {-(m['raw'] - m['final']).mean():.2f}"
                  " -> scoring.THIRD_TIER_MALUS")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--calibrate-top", action="store_true",
                        help="calcule le bonus de 1re division (LEC / LCS) à mettre dans scoring.py")
    parser.add_argument("--season", type=int, default=2026)
    parser.add_argument("--coef-seasons", type=int, nargs="+",
                        help="saisons du coefficient de ligue (défaut : la saison et la précédente)")
    parser.add_argument("--min-games", type=int, default=10)
    parser.add_argument("--max-age", type=float, help="ex : 21 pour les moins de 21 ans")
    parser.add_argument("--exclude-unknown-age", action="store_true",
                        help="avec --max-age : retirer aussi les joueurs dont l'âge est inconnu")
    parser.add_argument("--role", choices=list(ROLE_WEIGHTS))
    parser.add_argument("--tier", nargs="+", help="ex : ERL1 ERL2")
    parser.add_argument("--top", type=int, default=10, help="joueurs affichés par rôle")
    args = parser.parse_args()
    if args.calibrate_top:
        calibrate_top_bonus()
        return

    games = load_games([args.season])
    ranking = build_ranking(games, args.season, args.coef_seasons or coef_window(args.season),
                            args.min_games)
    ranking = ranking[~ranking["played_lec"]]

    if args.max_age:
        # Âge inconnu : gardé par défaut (beaucoup de joueurs d'ERL n'ont pas de date
        # de naissance sur Leaguepedia ; à compléter dans birthdates.csv)
        keep = ranking["age"] <= args.max_age
        if not args.exclude_unknown_age:
            keep |= ranking["age"].isna()
        ranking = ranking[keep]
    if args.role:
        ranking = ranking[ranking["role"] == args.role]
    if args.tier:
        ranking = ranking[ranking["tier"].isin(args.tier)]

    path = f"{DATA_DIR}/prospects_{args.season}.csv"
    ranking.to_csv(path, index=False)

    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", None)
    for role in ROLE_WEIGHTS:
        top = ranking[ranking["role"] == role].head(args.top)
        if not top.empty:
            print(f"\n=== {role.upper()} ===")
            print(top[DISPLAY].round(2).to_string(index=False))

    print(f"\nClassement complet : {path}")


if __name__ == "__main__":
    main()
