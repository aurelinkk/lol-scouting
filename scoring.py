"""Tous les réglages du score de prospect, au même endroit.

Modifie ces valeurs pour tester d'autres pondérations, puis relance
prospects.py. Aucun retéléchargement n'est nécessaire.
"""

# ---------------------------------------------------------------------------
# 1. Performance dans sa ligue
# ---------------------------------------------------------------------------
# Chaque stat est comparée aux joueurs du même rôle dans la même ligue
# (z-score). Le score de ligue est la moyenne pondérée de ces z-scores.
# Poids positif : plus c'est haut, mieux c'est.
# Poids négatif : plus c'est bas, mieux c'est (ex : les morts).
# Poids 0 : stat ignorée.
#
# Stats disponibles :
#   cs_min, gold_min, dpm, vision_min, kp (participation aux kills),
#   dmg_share (part des dégâts de l'équipe), gold_share,
#   kda, deaths_pg, assists_pg (par partie), winrate, champions (taille du pool)

ROLE_WEIGHTS = {
    "Top": {
        "cs_min": 1.0, "gold_min": 1.0, "dpm": 1.0, "dmg_share": 1.0,
        "kp": 0.5, "deaths_pg": -1.0, "winrate": 0.5,
    },
    "Jungle": {
        "cs_min": 0.5, "gold_min": 1.0, "dpm": 0.5, "kp": 1.0,
        "vision_min": 0.5, "deaths_pg": -1.0, "winrate": 0.5,
    },
    "Mid": {
        "cs_min": 1.0, "gold_min": 1.0, "dpm": 1.0, "dmg_share": 1.0,
        "kp": 0.5, "deaths_pg": -1.0, "winrate": 0.5,
    },
    "Bot": {
        "cs_min": 1.0, "gold_min": 1.0, "dpm": 1.0, "dmg_share": 1.0,
        "kp": 0.5, "deaths_pg": -1.0, "winrate": 0.5,
    },
    "Support": {
        "kp": 1.0, "vision_min": 1.0, "assists_pg": 1.0,
        "deaths_pg": -1.0, "winrate": 0.5,
    },
}

# Nombre minimum de joueurs du même rôle dans une ligue pour comparer
MIN_PLAYERS_FOR_COMPARISON = 4

# ---------------------------------------------------------------------------
# 2. Niveau de la ligue (coefficient EMEA Masters, voir league_strength.py)
# ---------------------------------------------------------------------------
# Bonus/malus = LEAGUE_WEIGHT x (coef de la ligue - coef moyen des ERL1) / écart-type.
# 0 = on ignore le niveau de la ligue.
LEAGUE_WEIGHT = 0.5

# Participations nécessaires avant de faire confiance au coefficient brut :
# avec peu d'équipes envoyées à l'EM, le coef est tiré vers la moyenne (0.5).
SHRINK_APPEARANCES = 3

# Les ERL2 ne vont pas à l'EM : on prend le coef de l'ERL1 du pays moins cette décote
ERL2_DISCOUNT = 0.15
ERL2_PARENT = {
    "PRM2": "PRM", "LFL2": "LFL", "ES2": "ES", "HM2": "HM",
    "ROL2": "ROL", "HLL2": "HLL", "AL2": "AL",
}

# ---------------------------------------------------------------------------
# 3. Performance à l'EMEA Masters
# ---------------------------------------------------------------------------
# Le z-score du joueur à l'EM (comparé à tous les joueurs de l'EM de son rôle)
# est ajouté avec ce poids. Les joueurs sans EM ont 0 (= neutre).
EM_WEIGHT = 0.5
EM_MIN_GAMES = 5
