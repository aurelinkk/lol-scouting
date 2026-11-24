"""Ligues européennes suivies, par saison.

Pour chaque saison : nom exact du champ `League` dans Leaguepedia
-> (code stable de la ligue, niveau).

Le code stable sert à suivre une même ligue d'une année à l'autre même
quand elle change de nom (ex : LVP SuperLiga en 2025 -> LES en 2026),
notamment pour calculer le coefficient de ligue sur plusieurs saisons.

Pièges Leaguepedia vérifiés :
- Prime League : Leaguepedia garde les anciens noms.
  "Prime League Pro Division" = tournois "PRM 1st Division" (ERL1)
  "Prime League 1st Division" = tournois "PRM 2nd Division" (ERL2)
- France : la Nexus League remplace la LFL Division 2 à partir de 2026
  (la "LFL Division 2" 2026 ne contient plus que la promotion).
- Espagne : la LES (2026) succède à la LVP SuperLiga (2025) ;
  la Liga Nexo est la 2e division espagnole en 2025. En 2023-2024 la 2e
  division est la "LVP SuperLiga 2nd Division" (Liga Nexo = 3e division).
- 2023-2024 : noms différents pour plusieurs ligues
  Benelux = Elite Series, Grèce = Greek Legends League, Pologne = Ultraliga,
  Italie = PG Nationals (2023) puis LIT (2024), 2e division italienne =
  PG Proving Grounds. Plus de 2e divisions (NLC, TCL, LPLOL, Ultraliga...).
"""

_ERL1_COMMON = {
    "La Ligue Française": ("LFL", "ERL1"),
    "Prime League Pro Division": ("PRM", "ERL1"),
    "Northern League of Legends Championship": ("NLC", "ERL1"),
    "LIT": ("LIT", "ERL1"),
    "Rift Legends": ("RL", "ERL1"),
    "TransIP Road Of Legends": ("ROL", "ERL1"),
    "Hitpoint Masters": ("HM", "ERL1"),
    "Turkish Championship League": ("TCL", "ERL1"),
    "Liga Portuguesa": ("LPLOL", "ERL1"),
    "Hellenic Legends League": ("HLL", "ERL1"),
    "Esports Balkan League": ("EBL", "ERL1"),
    "Arabian League": ("AL", "ERL1"),
}

_ERL2_COMMON = {
    "Prime League 1st Division": ("PRM2", "ERL2"),
    "Hitpoint Challengers": ("HM2", "ERL2"),
    "Benelux Ascend Series": ("ROL2", "ERL2"),
    "Hellenic Challengers Cup": ("HLL2", "ERL2"),
}

_LEGACY_ERL = {   # 2023-2024
    "LoL EMEA Championship": ("LEC", "LEC"),
    "EMEA Masters": ("EM", "EM"),
    # ERL1
    "La Ligue Française": ("LFL", "ERL1"),
    "Prime League Pro Division": ("PRM", "ERL1"),
    "LVP SuperLiga": ("ES", "ERL1"),
    "Northern League of Legends Championship": ("NLC", "ERL1"),
    "Ultraliga": ("RL", "ERL1"),
    "Elite Series: League of Legends": ("ROL", "ERL1"),
    "Hitpoint Masters": ("HM", "ERL1"),
    "Turkish Championship League": ("TCL", "ERL1"),
    "Liga Portuguesa": ("LPLOL", "ERL1"),
    "Greek Legends League": ("HLL", "ERL1"),
    "Esports Balkan League": ("EBL", "ERL1"),
    "Arabian League": ("AL", "ERL1"),
    # ERL2
    "La Ligue Française Division 2": ("LFL2", "ERL2"),
    "Prime League 1st Division": ("PRM2", "ERL2"),
    "LVP SuperLiga 2nd Division": ("ES2", "ERL2"),
    "Northern League of Legends Championship 2nd Division": ("NLC2", "ERL2"),
    "Ultraliga 2nd Division": ("RL2", "ERL2"),
    "Elite Series 2nd Division": ("ROL2", "ERL2"),
    "Hitpoint Challengers": ("HM2", "ERL2"),
    "TCL Division 2": ("TCL2", "ERL2"),
    "LPLOL 2nd Division": ("LPLOL2", "ERL2"),
    "Greek Legends League 2nd Division": ("HLL2", "ERL2"),
    "Arabian League 2nd Division": ("AL2", "ERL2"),
}

# 2020-2022 (vérifié sur Leaguepedia : nombre de parties par ligue et par année).
# Noms d'époque : European Masters (EMEA Masters depuis 2023), LVP SuperLiga
# Orange (2020), Ultraliga, PG Nationals ; Benelux = Belgian League + Dutch
# League (2020-2021) puis Elite Series (2022) ; Baltic Masters et UK League
# Championship jusqu'en 2021 ; Liga Nexo = 2e division espagnole avant 2022.
_OLD_EU_COMMON = {
    "LoL EMEA Championship": ("LEC", "LEC"),
    "European Masters": ("EM", "EM"),
    "La Ligue Française": ("LFL", "ERL1"),
    "Prime League Pro Division": ("PRM", "ERL1"),
    "Northern League of Legends Championship": ("NLC", "ERL1"),
    "Ultraliga": ("RL", "ERL1"),
    "PG Nationals": ("LIT", "ERL1"),
    "Hitpoint Masters": ("HM", "ERL1"),
    "Turkish Championship League": ("TCL", "ERL1"),
    "Liga Portuguesa": ("LPLOL", "ERL1"),
    "Greek Legends League": ("HLL", "ERL1"),
    "Esports Balkan League": ("EBL", "ERL1"),
    "La Ligue Française Division 2": ("LFL2", "ERL2"),
    "Prime League 1st Division": ("PRM2", "ERL2"),
    "Hitpoint Challengers": ("HM2", "ERL2"),
    "Turkey Academy League": ("TCL2", "ERL2"),
}
_OLD_EU_2020_21 = {
    "Baltic Masters": ("BM", "ERL1"),
    "Belgian League": ("BEL", "ERL1"),
    "Dutch League": ("NLD", "ERL1"),
    "UK League Championship": ("UKLC", "ERL1"),
    "Liga Nexo": ("ES2", "ERL2"),
}

LEAGUES_EU = {
    2020: {**_OLD_EU_COMMON, **_OLD_EU_2020_21, "LVP SuperLiga Orange": ("ES", "ERL1")},
    2021: {**_OLD_EU_COMMON, **_OLD_EU_2020_21, "LVP SuperLiga": ("ES", "ERL1"),
           "PG Proving Grounds": ("LIT2", "ERL2"), "Greek Legends Wings League": ("HLL2", "ERL2")},
    2022: {**_OLD_EU_COMMON, "LVP SuperLiga": ("ES", "ERL1"),
           "Elite Series: League of Legends": ("ROL", "ERL1"),
           "LVP SuperLiga 2nd Division": ("ES2", "ERL2"),
           "Northern League of Legends Championship 2nd Division": ("NLC2", "ERL2"),
           "Ultraliga 2nd Division": ("RL2", "ERL2"),
           "PG Proving Grounds": ("LIT2", "ERL2"),
           "LPLOL 2nd Division": ("LPLOL2", "ERL2"),
           "Greek Legends Wings League": ("HLL2", "ERL2")},
    2023: {**_LEGACY_ERL, "PG Nationals": ("LIT", "ERL1"), "PG Proving Grounds": ("LIT2", "ERL2")},
    2024: {**_LEGACY_ERL, "LIT": ("LIT", "ERL1"), "PG Proving Grounds": ("LIT2", "ERL2")},
    2025: {
        "LoL EMEA Championship": ("LEC", "LEC"),
        "EMEA Masters": ("EM", "EM"),
        **_ERL1_COMMON,
        "LVP SuperLiga": ("ES", "ERL1"),
        **_ERL2_COMMON,
        "La Ligue Française Division 2": ("LFL2", "ERL2"),
        "Liga Nexo": ("ES2", "ERL2"),
    },
    2026: {
        "LoL EMEA Championship": ("LEC", "LEC"),
        "EMEA Masters": ("EM", "EM"),
        **_ERL1_COMMON,
        "Liga Española de League of Legends": ("ES", "ERL1"),
        **_ERL2_COMMON,
        "Nexus League": ("LFL2", "ERL2"),
        "La Ligue Française Division 2": ("LFL2", "ERL2"),  # promotion uniquement
        "Arabian League 2nd Division": ("AL2", "ERL2"),
        "Road to LES": ("ES2", "ERL2"),
    },
}


# Amérique du Nord (SCOUT_REGION=na, voir regions.py) : "LEC" = 1re division,
# "ERL1" = NACL. En 2025, la LCS est remplacée par la LTA (conférence North +
# finales communes avec le Brésil). Les tournois de promotion vers la LCS
# (« LTA North 2026 Promotion », « LCS 2027 Promotion ») ne sont pas pris.
_NA_COMMON = {
    "League of Legends Championship Series": ("LCS", "LEC"),
    "North American Challengers League": ("NACL", "ERL1"),
}
# 2020-2022 : la 2e division est la NA Academy League (académies des équipes de LCS)
_NA_OLD = {"League of Legends Championship Series": ("LCS", "LEC"), "NA Academy League": ("NAAC", "ERL1")}
LEAGUES_NA = {
    2020: _NA_OLD, 2021: _NA_OLD, 2022: _NA_OLD,
    2023: _NA_COMMON,
    2024: _NA_COMMON,
    2025: {
        "League of Legends Championship of The Americas North": ("LCS", "LEC"),
        "League of Legends Championship of The Americas": ("LCS", "LEC"),
        "North American Challengers League": ("NACL", "ERL1"),
    },
    # 2026 : la Liga Regional Norte (Mexique, Amérique centrale, Colombie...)
    # passe dans l'écosystème LCS, 2e division parallèle à la NACL
    2026: {**_NA_COMMON, "Liga Regional Norte": ("LRN", "ERL1")},
}

# Corée (SCOUT_REGION=kr) : LCK = 1re division, LCK CL = 2e, LCK Academy Series = 3e
_KR = {
    "LoL Champions Korea": ("LCK", "LEC"),
    "LCK Challengers League": ("LCKCL", "ERL1"),
    "LCK Academy Series": ("LCKAS", "ERL2"),
}
LEAGUES_KR = {
    # 2020 : la 2e division s'appelle encore Challengers Korea (LCK CL depuis 2021)
    2020: {"LoL Champions Korea": ("LCK", "LEC"), "Challengers Korea": ("LCKCL", "ERL1"),
           "LCK Academy Series": ("LCKAS", "ERL2")},
    2021: _KR, 2022: _KR, 2023: _KR, 2024: _KR, 2025: _KR, 2026: _KR,
}

# Chine (SCOUT_REGION=cn) : LPL = 1re division. 2e division : LDL jusqu'en 2025 ;
# en 2026 la LDL disparaît, remplacée par l'Asia Masters Elite (AME) et le City
# Heroes Championship (CHC), les deux qualificatifs chinois du WSCI 2026.
_CN = {"Tencent LoL Pro League": ("LPL", "LEC"), "LoL Development League": ("LDL", "ERL1")}
LEAGUES_CN = {
    2020: _CN, 2021: _CN, 2022: _CN,
    2023: _CN, 2024: _CN, 2025: _CN,
    2026: {
        "Tencent LoL Pro League": ("LPL", "LEC"),
        "Asia Masters Elite Invitational Tournament": ("AME", "ERL1"),
        "City Heroes Championship": ("CHC", "ERL1"),
    },
}

# Pacifique (SCOUT_REGION=lcp) : la LCP naît en 2025 au-dessus de la PCS (Taïwan /
# Asie du Sud-Est), du VCS (Vietnam) et de la LJL (Japon). En 2023-2024 ces
# ligues (et la LCO, Océanie) sont les ligues majeures de la zone : on les classe
# en 2e division, sans 1re division au-dessus, pour suivre les mêmes ligues sur 4 ans.
_PACIFIC_ERL = {
    "Pacific Championship Series": ("PCS", "ERL1"),
    "Vietnam Championship Series": ("VCS", "ERL1"),
    "LoL Japan League": ("LJL", "ERL1"),
}
LEAGUES_LCP = {
    2020: {**_PACIFIC_ERL, "Oceanic Pro League": ("LCO", "ERL1")},
    2021: {**_PACIFIC_ERL, "LoL Circuit Oceania": ("LCO", "ERL1")},
    2022: {**_PACIFIC_ERL, "LoL Circuit Oceania": ("LCO", "ERL1")},
    2023: {**_PACIFIC_ERL, "LoL Circuit Oceania": ("LCO", "ERL1")},
    2024: {**_PACIFIC_ERL, "LoL Circuit Oceania": ("LCO", "ERL1")},
    2025: {"League of Legends Championship Pacific": ("LCP", "LEC"), **_PACIFIC_ERL},
    2026: {"League of Legends Championship Pacific": ("LCP", "LEC"), **_PACIFIC_ERL},
}

# Brésil et Amérique latine (SCOUT_REGION=br) : CBLOL = 1re division (LTA South
# en 2025, qui réunit Brésil et Amérique latine ; LLA = ligue latino-américaine
# en 2023-2024). 2e division : CBLOL Academy (2023-2024), Circuito Desafiante
# (2025-2026), Liga Regional Norte / Sur (en 2026, la LRN alimente la LCS).
_LR = {"Liga Regional Norte": ("LRN", "ERL1"), "Liga Regional Sur": ("LRS", "ERL1")}
LEAGUES_BR = {
    # 2020 : 2e division = Brazilian Challenger Circuit ; CBLOL Academy à partir de 2021
    2020: {"Circuit Brazilian League of Legends": ("CBLOL", "LEC"), "Liga Latinoamerica": ("LLA", "LEC"),
           "Brazilian Challenger Circuit": ("CBLA", "ERL1")},
    2021: {"Circuit Brazilian League of Legends": ("CBLOL", "LEC"), "Liga Latinoamerica": ("LLA", "LEC"),
           "Circuit Brazilian League of Legends Academy": ("CBLA", "ERL1")},
    2022: {"Circuit Brazilian League of Legends": ("CBLOL", "LEC"), "Liga Latinoamerica": ("LLA", "LEC"),
           "Circuit Brazilian League of Legends Academy": ("CBLA", "ERL1")},
    2023: {"Circuit Brazilian League of Legends": ("CBLOL", "LEC"), "Liga Latinoamerica": ("LLA", "LEC"),
           "Circuit Brazilian League of Legends Academy": ("CBLA", "ERL1"), **_LR},
    2024: {"Circuit Brazilian League of Legends": ("CBLOL", "LEC"), "Liga Latinoamerica": ("LLA", "LEC"),
           "Circuit Brazilian League of Legends Academy": ("CBLA", "ERL1"), **_LR},
    2025: {"League of Legends Championship of The Americas South": ("CBLOL", "LEC"),
           "Circuito Desafiante": ("CD", "ERL1"), **_LR},
    2026: {"Circuit Brazilian League of Legends": ("CBLOL", "LEC"),
           "Circuito Desafiante": ("CD", "ERL1"), "Liga Regional Sur": ("LRS", "ERL1")},
}

_BY_REGION = {"eu": LEAGUES_EU, "na": LEAGUES_NA, "kr": LEAGUES_KR,
              "cn": LEAGUES_CN, "lcp": LEAGUES_LCP, "br": LEAGUES_BR}

from scouting.config.regions import REGION  # noqa: E402
LEAGUES = _BY_REGION[REGION]


def leagues_by_region(region):
    """Configuration d'une région précise (eu / na / kr / cn / lcp / br), quelle que soit SCOUT_REGION."""
    return _BY_REGION[region]


def leagues_for(year):
    if year not in LEAGUES:
        raise SystemExit(
            f"Saison {year} non configurée dans leagues.py "
            f"(saisons disponibles : {sorted(LEAGUES)})"
        )
    return LEAGUES[year]
