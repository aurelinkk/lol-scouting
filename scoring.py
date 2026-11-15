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
# Stats de fin de partie (Leaguepedia, toutes les ligues) :
#   kda, cs_min, gold_min, dpm (dégâts/min), kp (participation aux kills),
#   dmg_share (% des dégâts de l'équipe), gold_share (% du gold de l'équipe),
#   vision_min, deaths_pg, assists_pg (par partie), winrate, champions
#
# Stats avancées (Oracle's Elixir, seulement si le CSV est dans data/oracles/
# et que la ligue y est couverte ; sinon la stat est ignorée pour ce joueur) :
#   csd15 / gd15 / xpd15 : écart de CS / gold / XP avec l'adversaire direct à 15 min
#   ahead_cs15 : % de parties avec plus de CS que l'adversaire direct à 15 min
#   fb_part : % de first blood (kill ou assist) ; fb_victim : % de first blood subi

ROLE_WEIGHTS = {
    "Top": {
        "kda": 0.5, "cs_min": 0.5, "gold_min": 0.5, "dpm": 1.0, "dmg_share": 1.0,
        "gold_share": 0.5, "kp": 0.5, "deaths_pg": -0.5, "winrate": 0.5,
        "csd15": 1.0, "gd15": 1.0, "xpd15": 1.0, "ahead_cs15": 0.5,
        "fb_part": 0.25, "fb_victim": -0.5,
    },
    "Jungle": {
        "kda": 1.0, "cs_min": 0.5, "gold_min": 0.5, "dpm": 0.5, "kp": 1.0,
        "vision_min": 0.5, "deaths_pg": -0.5, "winrate": 0.5,
        "csd15": 0.5, "gd15": 1.0, "xpd15": 1.0,
        "fb_part": 1.0, "fb_victim": -0.5,
    },
    "Mid": {
        "kda": 0.5, "cs_min": 0.5, "gold_min": 0.5, "dpm": 1.0, "dmg_share": 1.0,
        "gold_share": 0.5, "kp": 0.5, "deaths_pg": -0.5, "winrate": 0.5,
        "csd15": 1.0, "gd15": 1.0, "xpd15": 1.0, "ahead_cs15": 0.5,
        "fb_part": 0.5, "fb_victim": -0.5,
    },
    "Bot": {
        "kda": 0.5, "cs_min": 0.5, "gold_min": 0.5, "dpm": 1.0, "dmg_share": 1.0,
        "gold_share": 0.5, "kp": 0.5, "deaths_pg": -0.5, "winrate": 0.5,
        "csd15": 1.0, "gd15": 1.0, "xpd15": 0.5, "ahead_cs15": 0.5,
        "fb_part": 0.25, "fb_victim": -0.5,
    },
    "Support": {
        "kda": 1.0, "kp": 1.0, "vision_min": 1.0, "assists_pg": 0.5,
        "deaths_pg": -0.5, "winrate": 0.5,
        "gd15": 0.5, "xpd15": 0.5, "fb_part": 1.0, "fb_victim": -0.5,
    },
}

# Libellés affichés dans la fiche joueur (player.py)
STAT_LABELS = {
    "winrate": "Win rate", "kda": "KDA", "cs_min": "CS/min", "gold_min": "Gold/min",
    "dpm": "DMG/min", "kp": "Kill participation", "dmg_share": "DMG %",
    "gold_share": "Gold %", "vision_min": "Vision/min", "deaths_pg": "Morts/partie",
    "assists_pg": "Assists/partie", "champions": "Champions joués",
    "csd15": "CS diff @15", "gd15": "Gold diff @15", "xpd15": "XP diff @15",
    "ahead_cs15": "Devant en CS @15", "fb_part": "First blood (participation)",
    "fb_victim": "First blood (victime)",
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
ERL2_DISCOUNT = 0.30
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

# Équipes de l'EM à ne pas compter dans le coefficient (exceptions)
EXCLUDED_EM_TEAMS = {"Witchcraft"}
EM_MIN_GAMES = 5
