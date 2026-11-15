"""Fiche joueur : toutes ses stats comparées aux joueurs du même poste dans sa ligue,
et le détail du calcul de son score.

Usage :
    python player.py Mercy9
    python player.py Toffe --season 2025
"""
import argparse

import pandas as pd

from league_strength import league_coefficients, load_games
from prospects import add_game_metrics, aggregate, build_ranking, weighted_score, zscores
from scoring import EM_WEIGHT, ROLE_WEIGHTS, STAT_LABELS

PERCENT_STATS = {"winrate", "kp", "dmg_share", "gold_share", "ahead_cs15",
                 "fb_part", "fb_victim", "dmg_share_vs_champ"}
SIGNED_STATS = {"csd15", "gd15", "xpd15", "dpm_vs_champ", "dmg_share_vs_champ"}
LOWER_IS_BETTER = {"deaths_pg", "fb_victim"}


def fmt(stat, value):
    if pd.isna(value):
        return "-"
    if stat in PERCENT_STATS:
        sign = "+" if stat in SIGNED_STATS and value > 0 else ""
        return f"{sign}{100 * value:.1f} %"
    if stat in SIGNED_STATS:
        return f"{value:+.0f}"
    if abs(value) >= 100:
        return f"{value:.0f}"
    return f"{value:.2f}"


def find_player(stats, name):
    exact = stats[stats["player"].str.lower() == name.lower()]
    if not exact.empty:
        return exact
    return stats[stats["player"].str.lower().str.contains(name.lower(), regex=False)]


def stat_table(row, peers):
    role = row["role"]
    z = zscores(peers, role)
    weights = ROLE_WEIGHTS[role]
    lines = []
    for stat in STAT_LABELS:
        if stat not in peers:
            continue
        value = row[stat]
        col = peers[stat].dropna()
        if pd.notna(value) and len(col):
            beaten = (col > value) if stat in LOWER_IS_BETTER else (col < value)
            pct = beaten.mean() * 100
        else:
            pct = float("nan")
        weight = weights.get(stat, 0)
        zval = z.loc[row.name, stat] if stat in z else float("nan")
        lines.append({
            "Stat": STAT_LABELS[stat],
            "Joueur": fmt(stat, value),
            "Moy. poste": fmt(stat, col.mean() if len(col) else float("nan")),
            "Meilleur que": "-" if pd.isna(pct) else f"{pct:.0f} %",
            "z": "-" if pd.isna(zval) else f"{zval:+.2f}",
            "Poids": f"{weight:+.2f}" if weight else "",
            "Contribution": "" if pd.isna(zval) or not weight else f"{zval * weight:+.2f}",
        })
    return pd.DataFrame(lines), weighted_score(z, role).get(row.name)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("name")
    parser.add_argument("--season", type=int, default=2026)
    parser.add_argument("--coef-seasons", type=int, nargs="+", default=[2025, 2026])
    parser.add_argument("--min-games", type=int, default=10)
    args = parser.parse_args()

    games = load_games([args.season])
    stats = aggregate(add_game_metrics(games[games["season"] == args.season]))
    rows = find_player(stats, args.name)
    if rows.empty:
        raise SystemExit(f"Aucun joueur « {args.name} » en {args.season}")
    if rows["player"].nunique() > 1:
        print("Plusieurs joueurs correspondent :", ", ".join(sorted(rows["player"].unique())))
        raise SystemExit("Précise le nom exact.")

    coefs = league_coefficients(load_games(args.coef_seasons), args.coef_seasons)
    ranking = build_ranking(games, args.season, args.coef_seasons, args.min_games)
    pd.set_option("display.width", 200)

    for _, row in rows.sort_values("games", ascending=False).iterrows():
        peers = stats[(stats["league_code"] == row["league_code"])
                      & (stats["role"] == row["role"])
                      & ((stats["games"] >= args.min_games) | (stats.index == row.name))]
        wins = int(round(row["winrate"] * row["games"]))
        print(f"\n{'=' * 90}")
        print(f"{row['player']} - {row['team']} - {row['role']} - {row['league_code']} "
              f"({row['tier']}) - saison {args.season}")
        age = "?" if pd.isna(row["age"]) else row["age"]
        print(f"Âge : {age} | Parties : {row['games']} ({wins}W - {row['games'] - wins}L) "
              f"| Comparé à {len(peers)} joueurs {row['role']} de la ligue "
              f"(min. {args.min_games} parties)")
        if pd.isna(row.get("oe_games")):
            print("Stats @15 / first blood : indisponibles (pas de données Oracle's Elixir)")
        print()

        table, score = stat_table(row, peers)
        print(table.to_string(index=False))
        print()
        print("Score dans la ligue = somme des contributions / somme des poids utilisés "
              f"= {score:+.2f}" if pd.notna(score) else "Score dans la ligue : pas assez de joueurs comparables")

    r = ranking[ranking["player"] == rows["player"].iloc[0]]
    if not r.empty:
        r = r.iloc[0]
        coef = coefs["coef"].get(r["league_code"], float("nan"))
        em = r["em_score"]
        print(f"\n--- Score final (ligue principale : {r['league_code']}) ---")
        print(f"  Score dans la ligue          {r['league_score']:+.2f}")
        print(f"  Bonus niveau de ligue        {r['league_bonus']:+.2f}   "
              f"(coef EM de la ligue : {coef:.2f})")
        print(f"  {EM_WEIGHT} x score EMEA Masters    "
              f"{EM_WEIGHT * (0 if pd.isna(em) else em):+.2f}   "
              f"({'pas d EM' if pd.isna(em) else f'z = {em:+.2f} sur {r.em_games} parties'})")
        print(f"  = FINAL                      {r['final']:+.2f}   "
              f"(top {100 * (1 - r['role_percentile']):.0f} % des {r['role']} d'ERL)")
        if r["played_lec"]:
            print("  (a joué en LEC cette saison : exclu du classement des prospects)")


if __name__ == "__main__":
    main()
