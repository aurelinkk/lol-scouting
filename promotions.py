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

    best = (g.groupby(["player", "tier", "team"])["date"].min().reset_index(name="first_game")
            .assign(level=lambda d: d["tier"].map(order))
            .sort_values(["level", "first_game"])
            .drop_duplicates("player"))
    return best.rename(columns={"tier": "new_level", "team": "new_team"})[
        ["player", "new_level", "new_team"]]


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
    # Coefficient de ligue sur les 2 ans qui précèdent la montée (pas d'info du futur)
    before = build_ranking(games, season_from, coef_seasons or coef_window(season_from), min_games)
    before = before[~before["played_lec"]].copy()
    before["tier_percentile"] = (before.groupby(["tier", "role"])["final"]
                                 .rank(pct=True).round(3))
    after = destination(games[games["season"] == season_to])
    return before.merge(after, on="player", how="left")


def hit_rates(merged):
    """Taux de montée par tranche de rang (dans son niveau) en saison N."""
    rows = []
    buckets = [(0.9, 1.01, "top 10 %"), (0.75, 0.9, "top 10-25 %"),
               (0.5, 0.75, "top 25-50 %"), (0, 0.5, "moitié basse")]
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

    path = f"data/promotions_{args.season_from}_{args.season_to}.csv"
    merged.to_csv(path, index=False)
    print(f"\nDétail complet : {path}")


if __name__ == "__main__":
    main()
