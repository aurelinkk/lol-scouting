"""Qui est monté entre deux saisons, et quel était son profil avant ?

Pour chaque joueur qui monte (ERL -> LEC, ou ERL2 -> ERL1) entre la saison N
et N+1, affiche son classement de prospect en saison N. Permet de vérifier
si le score aurait repéré ces joueurs à l'avance, et de régler les poids
de scoring.py en conséquence.

Le coefficient de ligue est calculé uniquement sur la saison N par défaut,
pour ne pas utiliser d'informations « du futur ».

Usage :
    python promotions.py                 # 2025 -> 2026
    python promotions.py --from 2025 --to 2026
"""
import argparse

import pandas as pd

from league_strength import coef_window, load_games
from region import DATA_DIR
from prospects import build_ranking

COLUMNS = ["player", "role", "age", "league_code", "tier", "team", "games",
           "final", "role_percentile", "league_score", "league_bonus",
           "em_score", "em_games", "winrate", "new_level", "new_team"]


# Une équipe ne compte comme équipe d'un niveau que si elle y a joué au moins
# ce nombre de parties (hors tournois de promotion / relégation). Exclut :
#  - les équipes invitées (LEC Versus 2026 : Los Ratones et KC Blue, 11 parties ;
#    LFL Invitational : équipes d'ERL2) ;
#  - les tournois de promotion rangés dans la ligue supérieure (PRM 1st
#    Division Promotion avec des équipes d'ERL2).
MIN_TEAM_GAMES = {"LEC": 15, "ERL1": 10, "ERL2": 10}
PROMOTION_PATTERN = "Promotion|Relegation|Qualifier"


def destination(games_next):
    """Plus haut niveau atteint par chaque joueur en saison N+1, et le premier
    club avec lequel il l'a atteint (le club qu'il a rejoint en montant).

    Ex : Sayn 2026 = ERL1, BK ROG Esports (janvier), même s'il a ensuite joué
    plus de parties avec FN Esports puis Verdant.
    """
    order = {"LEC": 0, "ERL1": 1, "ERL2": 2}
    g = games_next[games_next["tier"].isin(order)].copy()
    g = g[~g["tournament"].str.contains(PROMOTION_PATTERN, case=False, na=False)]

    team_games = g.groupby(["tier", "team"])["game_id"].nunique().reset_index(name="n")
    team_games["ok"] = team_games["n"] >= team_games["tier"].map(MIN_TEAM_GAMES)
    g = g.merge(team_games[team_games["ok"]][["tier", "team"]], on=["tier", "team"])

    best = (g.groupby(["player", "tier", "team"])
            .agg(first_game=("date", "min"), new_league=("league_code", "first")).reset_index()
            .assign(level=lambda d: d["tier"].map(order))
            .sort_values(["level", "first_game"])
            .drop_duplicates("player"))
    return best.rename(columns={"tier": "new_level", "team": "new_team"})[
        ["player", "new_level", "new_team", "new_league", "first_game"]]


def previous_club(games, promoted):
    """Dernier club (hors EMEA Masters et tournois de promotion) avant la première
    partie au nouveau niveau, en saison N ou en début de saison N+1.

    Ex : Vladi = Nativz (NLC 2023) -> KC Blue (LFL, printemps 2024) -> Karmine Corp
    (LEC, été 2024) : le club d'origine affiché est KC Blue.
    """
    order = {"LEC": 0, "ERL1": 1, "ERL2": 2}
    g = games[games["tier"].isin(order)
              & ~games["tournament"].str.contains(PROMOTION_PATTERN, case=False, na=False)]
    g = g.merge(promoted[["player", "new_level", "first_game"]], on="player")
    g = g[(g["date"] < g["first_game"]) & (g["tier"].map(order) > g["new_level"].map(order))]
    last = g.sort_values("date").groupby("player").last()
    return last[["team", "league_code", "tier"]].rename(columns={
        "team": "from_team", "league_code": "from_league", "tier": "from_tier"}).reset_index()


def summary(label, moved, percentile="role_percentile"):
    if moved.empty:
        print(f"\n{label} : aucun joueur trouvé")
        return
    p = moved[percentile]
    print(f"\n=== {label} : {len(moved)} joueurs ===")
    print(f"Rang médian dans leur rôle la saison précédente : top {100 * (1 - p.median()):.0f} %")
    print(f"Dans le top 10 % de leur rôle : {(p >= 0.9).sum()} / {len(moved)}"
          f"  |  top 25 % : {(p >= 0.75).sum()} / {len(moved)}")
    print(moved[COLUMNS].round(2).to_string(index=False))


def compute_promotions(games, season_from, season_to, coef_seasons=None, min_games=10):
    """Tous les joueurs d'ERL de la saison N (hors LEC), avec leur niveau en N+1.

    Colonnes ajoutées : new_level / new_team (NaN si plus en ERL/LEC en N+1),
    tier_percentile (rang dans son rôle parmi les joueurs du même niveau en N).
    """
    # Coefficient de ligue sur les 2 ans qui précèdent la montée, sans les montées
    # de la saison suivante (pas d'info du futur : on juge le score tel qu'il était)
    before = build_ranking(games, season_from, coef_seasons or coef_window(season_from), min_games,
                           use_next_season=False)
    before = before[~before["played_lec"]].copy()
    before["tier_percentile"] = (before.groupby(["tier", "role"])["final"]
                                 .rank(pct=True).round(3))
    next_games = games[games["season"] == season_to]
    if next_games.empty:
        # Saison pas encore jouée : on utilise le mercato saisi à la main
        from rosters import mercato_destination
        after = mercato_destination(season_to, games)
        if after is None:
            raise SystemExit(f"Pas de parties ni de rosters_{season_to}.csv pour {season_to}")
    else:
        after = destination(next_games)
    merged = before.merge(after, on="player", how="left")
    merged["from_season"] = season_from

    # Montés sans avoir joué en ERL la saison N (ex : Feisty, Zest pour 2027) :
    # on prend leur profil de la saison N-1 s'ils ne sont pas passés par la LEC en N
    missing = after[(after["new_level"] == "LEC") & ~after["player"].isin(before["player"])]
    lec_n = set(games.loc[(games["season"] == season_from) & (games["tier"] == "LEC"), "player"])
    missing = missing[~missing["player"].isin(lec_n)]
    if not missing.empty and (games["season"] == season_from - 1).any():
        prev = build_ranking(games, season_from - 1, coef_window(season_from - 1), min_games,
                             use_next_season=False)
        prev = prev[~prev["played_lec"]].copy()
        prev["tier_percentile"] = prev.groupby(["tier", "role"])["final"].rank(pct=True).round(3)
        prev = prev[prev["player"].isin(missing["player"])].merge(missing, on="player")
        prev["from_season"] = season_from - 1
        merged = pd.concat([merged, prev], ignore_index=True)

    # Venus d'une autre région (pas des montées d'ERL) : ex. Zest et Feisty, LØS
    # (CBLOL) en 2026 avant la LEC en 2027
    merged["origin"] = "ERL"
    candidates = merged.loc[merged["from_season"] < season_from, "player"].tolist()
    if candidates:
        try:
            from careers import fetch_outside_games
            outside = fetch_outside_games(candidates, season_from)
            domestic = outside[~outside["international"]]
            if not domestic.empty:
                main = (domestic.sort_values("date").groupby("player")
                        .agg(team=("team", "last"), league=("league_code", "last")))
                mask = merged["player"].isin(main.index)
                merged.loc[mask, "origin"] = "other_region"
                merged.loc[mask, "other_team"] = merged.loc[mask, "player"].map(main["team"])
                merged.loc[mask, "other_league"] = merged.loc[mask, "player"].map(main["league"])
        except Exception as e:  # pas de réseau : on garde la montée telle quelle
            print(f"  (vérification des autres régions impossible : {e})")

    both = games[games["season"].isin([season_from - 1, season_from, season_to])]
    merged = merged.merge(previous_club(both, after), on="player", how="left")
    # Par défaut, l'équipe de la saison N
    merged["from_team"] = merged["from_team"].fillna(merged["team"])
    merged["from_league"] = merged["from_league"].fillna(merged["league_code"])
    # Arrivées d'une autre ligue majeure : ce ne sont pas des montées, on les retire
    merged = merged[merged["origin"] != "other_region"]
    return merged


def hit_rates(merged):
    """Taux de montée par tranche de rang (dans son niveau) en saison N."""
    rows = []
    buckets = [(0.9, 1.01, "top 10 %"), (0.75, 0.9, "top 10-25 %"),
               (0.5, 0.75, "top 25-50 %"), (0, 0.5, "moitié basse")]
    if "from_season" in merged:
        merged = merged[merged["from_season"] == merged["from_season"].max()]
    for tier, targets in [("ERL1", {"LEC"}), ("ERL2", {"LEC", "ERL1"})]:
        t = merged[merged["tier"] == tier]
        for lo, hi, label in buckets:
            b = t[(t["tier_percentile"] >= lo) & (t["tier_percentile"] < hi)]
            up = b["new_level"].isin(targets).sum()
            rows.append({"from": tier, "bucket": label, "promoted": int(up), "total": len(b)})
    return pd.DataFrame(rows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="season_from", type=int, default=2025)
    parser.add_argument("--to", dest="season_to", type=int, default=2026)
    parser.add_argument("--coef-seasons", type=int, nargs="+",
                        help="par défaut : la saison de départ et la précédente")
    parser.add_argument("--min-games", type=int, default=10)
    args = parser.parse_args()

    games = load_games([args.season_from, args.season_to])
    merged = compute_promotions(games, args.season_from, args.season_to,
                                args.coef_seasons, args.min_games)

    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", None)
    COLUMNS.insert(COLUMNS.index("role_percentile") + 1, "tier_percentile")

    summary(f"Montés en LEC ({args.season_from} -> {args.season_to})",
            merged[merged["new_level"] == "LEC"].sort_values("final", ascending=False))
    summary(f"Montés d'ERL2 en ERL1 ({args.season_from} -> {args.season_to})",
            merged[(merged["tier"] == "ERL2") & (merged["new_level"] == "ERL1")]
            .sort_values("final", ascending=False),
            percentile="tier_percentile")

    print("\n=== Taux de montée selon le rang en saison N (dans son niveau) ===")
    print(hit_rates(merged).to_string(index=False))

    path = f"{DATA_DIR}/promotions_{args.season_from}_{args.season_to}.csv"
    merged.to_csv(path, index=False)
    print(f"\nDétail complet : {path}")


if __name__ == "__main__":
    main()
