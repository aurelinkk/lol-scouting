"""Réglages du score (scoring.py) pour la page Technique du site : web/data/scoring.json.
Usage : python export_config.py (lancé aussi par run_all)."""
import json
import os

import scoring

KEYS = ["ROLE_WEIGHTS", "LEAGUE_WEIGHT", "EM_WEIGHT", "EM_SHRINK_GAMES", "EM_MIN_GAMES", "SAMPLE_SHRINK_GAMES",
        "MIN_PLAYERS_FOR_COMPARISON", "TOP_LEAGUE_BONUS", "THIRD_TIER_MALUS", "TEAM_ADJUST", "TOP_LEAGUE_SPREAD",
        "INTL_WEIGHT", "INTL_SHRINK_GAMES", "INTL_MIN_GAMES", "SOLOQ_WEIGHT", "EX_LEC_MALUS", "FORM_WEIGHT",
        "ERL2_DISCOUNT", "SHRINK_APPEARANCES", "TALENT_WEIGHT", "STAT_LABELS"]


def main():
    data = {k: getattr(scoring, k) for k in KEYS if hasattr(scoring, k)}
    path = os.path.join("web", "data", "scoring.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f"  réglages du score -> {path}")


if __name__ == "__main__":
    main()
