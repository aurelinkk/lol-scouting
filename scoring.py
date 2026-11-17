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
#   dmg_share_vs_champ / dpm_vs_champ : dégâts comparés à la moyenne des joueurs
#     du même poste sur le même champion (un mid Orianna n'est pas comparé à LeBlanc)
#
# Stats avancées (Oracle's Elixir, seulement si le CSV est dans data/oracles/
# et que la ligue y est couverte ; sinon la stat est ignorée pour ce joueur) :
#   csd15 / gd15 / xpd15 : écart de CS / gold / XP avec l'adversaire direct à 15 min
#   ahead_cs15 : % de parties avec plus de CS que l'adversaire direct à 15 min
#   fb_part : % de first blood (kill ou assist) ; fb_victim : % de first blood subi
#
# Principes des poids actuels :
#   - la phase de lane (@15) pèse le plus : elle dépend le moins de l'équipe
#   - les dégâts sont comparés au champion joué et pèsent moins
#   - le winrate pèse peu : il reflète surtout le niveau de l'équipe

ROLE_WEIGHTS = {
    "Top": {
        "kda": 0.5, "cs_min": 0.5, "gold_min": 0.5,
        "dpm_vs_champ": 0.5, "dmg_share_vs_champ": 0.5,
        "gold_share": 0.5, "kp": 0.5, "deaths_pg": -0.5, "winrate": 0.25,
        "csd15": 1.5, "gd15": 1.5, "xpd15": 1.5, "ahead_cs15": 0.5,
        "fb_part": 0.25, "fb_victim": -0.5,
    },
    "Jungle": {
        "kda": 1.0, "cs_min": 0.5, "gold_min": 0.5, "dpm_vs_champ": 0.5, "kp": 1.0,
        "vision_min": 0.5, "deaths_pg": -0.5, "winrate": 0.25,
        "csd15": 0.5, "gd15": 1.5, "xpd15": 1.5,
        "fb_part": 1.0, "fb_victim": -0.5,
    },
    "Mid": {
        "kda": 0.5, "cs_min": 0.5, "gold_min": 0.5,
        "dpm_vs_champ": 0.5, "dmg_share_vs_champ": 0.5,
        "gold_share": 0.5, "kp": 0.75, "deaths_pg": -0.5, "winrate": 0.25,
        "csd15": 1.5, "gd15": 1.5, "xpd15": 1.5, "ahead_cs15": 0.5,
        "fb_part": 0.5, "fb_victim": -0.5,
    },
    "Bot": {
        "kda": 0.5, "cs_min": 0.5, "gold_min": 0.5,
        "dpm_vs_champ": 0.75, "dmg_share_vs_champ": 0.75,
        "gold_share": 0.5, "kp": 0.5, "deaths_pg": -0.5, "winrate": 0.25,
        "csd15": 1.5, "gd15": 1.5, "xpd15": 1.0, "ahead_cs15": 0.5,
        "fb_part": 0.25, "fb_victim": -0.5,
    },
    "Support": {
        "kda": 1.0, "kp": 1.0, "vision_min": 1.0, "assists_pg": 0.5,
        "deaths_pg": -0.5, "winrate": 0.25,
        "gd15": 0.5, "xpd15": 1.0, "fb_part": 1.0, "fb_victim": -0.5,
    },
}

# Libellés affichés dans la fiche joueur (player.py)
STAT_LABELS = {
    "winrate": "Win rate", "kda": "KDA", "cs_min": "CS/min", "gold_min": "Gold/min",
    "dpm": "DMG/min", "kp": "Kill participation", "dmg_share": "DMG %",
    "dpm_vs_champ": "DMG/min vs champion", "dmg_share_vs_champ": "DMG % vs champion",
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

# Ajustement manuel du coefficient de certaines ligues (ajouté au coefficient
# calculé). Utile quand les résultats à l'EMEA Masters sous-estiment le niveau
# des meilleurs joueurs d'une ligue. Ex : {"LIT": 0.10, "AL": 0.05}
LEAGUE_COEF_ADJUST = {}

# Participations nécessaires avant de faire confiance au coefficient brut :
# avec peu d'équipes envoyées à l'EM, le coef est tiré vers la moyenne (0.5).
SHRINK_APPEARANCES = 3

# Les ERL2 ne vont pas à l'EM : on prend le coef de l'ERL1 du pays moins cette décote
ERL2_DISCOUNT = 0.30
ERL2_PARENT = {
    "PRM2": "PRM", "LFL2": "LFL", "ES2": "ES", "HM2": "HM",
    "ROL2": "ROL", "HLL2": "HLL", "AL2": "AL",
    "NLC2": "NLC", "RL2": "RL", "TCL2": "TCL", "LPLOL2": "LPLOL", "LIT2": "LIT",
}

# Niveau de la ligue saison par saison, d'après ses joueurs (league_talent.py).
# Coefficient de la saison = coef EM (ou ERL1 du pays - décote pour une ERL2)
#                            + TALENT_WEIGHT x talent (moyenne de z-scores).
# 0 = on garde le coefficient EM seul, identique toutes les saisons.
TALENT_WEIGHT = {"ERL1": 0.10, "ERL2": 0.05}
TALENT_SIGNAL_WEIGHTS = {
    # part des titulaires déjà passés par la LEC / montés en LEC l'année suivante
    "ERL1": {"ex_lec": 1.0, "up": 1.0},
    # passés par l'ERL1 / montés l'année suivante / victoires contre l'ERL1 du pays
    "ERL2": {"above": 1.0, "up": 1.0, "cross": 1.0},
}
# Utiliser les montées de la saison suivante (connues après coup ou via le
# mercato). False = comme en cours de saison (backtests sans info du futur).
TALENT_USE_NEXT_SEASON = True
# ---------------------------------------------------------------------------
# 1re division (LEC / LCS) dans le classement (onglet Données, filtre « inclure
# les joueurs passés par la LEC ») : perf. dans la LEC + bonus fixe de niveau.
# ---------------------------------------------------------------------------
# Bonus de niveau d'un joueur de 1re division, en points de score : écart moyen
# entre le score des montés l'année d'avant (ERL) et leur score en LEC une fois
# montés (python prospects.py --calibrate-top).
# Calibré avec Oracle's Elixir : Europe 1.43 (39 montés, 1.16 à 1.66 selon la
# saison), NA 0.70 avec Oracle's Elixir (17 montés). Recalculer : python prospects.py --calibrate-top
TOP_LEAGUE_BONUS = {"eu": 1.4, "na": 0.70}
# Part de la moyenne des coéquipiers retirée au score d'un joueur, par niveau :
# 0.5 = on juge à moitié sa performance par rapport à son équipe. 0 en ERL pour
# garder le calibrage des montées (ajustable).
TEAM_ADJUST = {"LEC": 0.5, "ERL1": 0.0, "ERL2": 0.0}

CROSS_MIN_GAMES = 5      # parties ERL2 vs ERL1 nécessaires pour compter
CROSS_SHRINK_GAMES = 10  # tirées vers la moyenne générale avec ce poids

# ---------------------------------------------------------------------------
# 3. Performance à l'EMEA Masters
# ---------------------------------------------------------------------------
# Le z-score du joueur à l'EM (comparé à tous les joueurs de l'EM de son rôle)
# est ajouté avec ce poids. Les joueurs sans EM ont 0 (= neutre).
EM_WEIGHT = 0.5

# Équipes de l'EM à ne pas compter dans le coefficient (exceptions)
EXCLUDED_EM_TEAMS = {"Witchcraft"}
EM_MIN_GAMES = 5

# ---------------------------------------------------------------------------
# 4. Taille d'échantillon
# ---------------------------------------------------------------------------
# Sur peu de parties, les stats sont très variables : les extrêmes ressortent
# par hasard. Le score est donc multiplié par parties / (parties + N) :
#   10 parties -> 40 % du score, 30 -> 67 %, 60 -> 80 %, 100 -> 87 %.
# Plus N est grand, plus on exige un gros volume de parties pour être en haut.
SAMPLE_SHRINK_GAMES = 15
EM_SHRINK_GAMES = 10

# ---------------------------------------------------------------------------
# 5. SoloQ (saison en cours uniquement, d'après le dernier relevé soloq.py)
# ---------------------------------------------------------------------------
# Bonus = SOLOQ_WEIGHT x (1 - (rang EUW - 1) / taille du relevé).
# Ex : 1er EUW -> +0.10, 500e sur 1000 -> +0.05, hors top 1000 -> 0.
# Volontairement minime : la soloQ sert surtout à repérer qui grind.
# Désactivé (0) par défaut : pendant l'intersaison beaucoup de pros ne jouent
# pas (et les Master+ perdent des LP par inactivité), le rang du moment ne
# reflète donc pas leur niveau. À remettre à ~0.1 en pleine saison.
SOLOQ_WEIGHT = 0.0

# ---------------------------------------------------------------------------
# 5 bis. Anciens joueurs de LEC redescendus en ERL
# ---------------------------------------------------------------------------
# Un joueur déjà passé par la LEC (une saison avant, hors équipes invitées)
# remonte plus rarement : les équipes préfèrent les nouveaux talents.
# Ce malus s'ajoute à son score final.
EX_LEC_MALUS = -0.25   # calibré sur 2023-2026 (au-delà de -0.25, la détection des montées baisse)

# ---------------------------------------------------------------------------
# 6. Score soloQ des non-pros (onglet Ladder, séparé du score pro)
# ---------------------------------------------------------------------------
# Chaque joueur profilé (soloq.py profiles) est comparé aux autres joueurs du
# relevé ayant le même poste principal (z-scores pondérés), sur ses parties
# classées de l'année. "lp" = LP actuels, "games" = parties de la saison.
_SOLOQ_COMMON = {
    "lp": 1.0, "games": 0.25, "recent_winrate": 0.5, "recent_kda": 0.5,
    "recent_deaths": -0.5, "recent_kp": 0.75, "recent_dmg_share": 0.75,
    "recent_dpm": 0.75, "recent_gold_min": 0.5,
}
SOLOQ_ROLE_WEIGHTS = {
    "Top": {**_SOLOQ_COMMON, "recent_cs_min": 0.75},
    "Jungle": {**_SOLOQ_COMMON, "recent_cs_min": 0.5, "recent_vision_min": 0.5},
    "Mid": {**_SOLOQ_COMMON, "recent_cs_min": 0.75},
    "Bot": {**_SOLOQ_COMMON, "recent_cs_min": 0.75},
    "Support": {**_SOLOQ_COMMON, "recent_dpm": 0.25, "recent_dmg_share": 0.25,
                "recent_gold_min": 0.25, "recent_vision_min": 1.0},
}
SOLOQ_MIN_GAMES = 15          # parties analysées minimum pour avoir un score
SOLOQ_STANDOUT = 0.95         # « se démarque » = top 5 % de son poste
