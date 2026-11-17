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

LEAGUES_EU = {
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


# Amérique du Nord (SCOUT_REGION=na, voir region.py) : "LEC" = 1re division,
# "ERL1" = NACL. En 2025, la LCS est remplacée par la LTA (conférence North +
# finales communes avec le Brésil). Les tournois de promotion vers la LCS
# (« LTA North 2026 Promotion », « LCS 2027 Promotion ») ne sont pas pris.
_NA_COMMON = {
    "League of Legends Championship Series": ("LCS", "LEC"),
    "North American Challengers League": ("NACL", "ERL1"),
}
LEAGUES_NA = {
    2023: _NA_COMMON,
    2024: _NA_COMMON,
    2025: {
        "League of Legends Championship of The Americas North": ("LCS", "LEC"),
        "League of Legends Championship of The Americas": ("LCS", "LEC"),
        "North American Challengers League": ("NACL", "ERL1"),
    },
    2026: _NA_COMMON,
}

from region import IS_EU  # noqa: E402
LEAGUES = LEAGUES_EU if IS_EU else LEAGUES_NA


def leagues_by_region(region):
    """Configuration d'une région précise (eu / na), quelle que soit SCOUT_REGION."""
    return LEAGUES_EU if region == "eu" else LEAGUES_NA


def leagues_for(year):
    if year not in LEAGUES:
        raise SystemExit(
            f"Saison {year} non configurée dans leagues.py "
            f"(saisons disponibles : {sorted(LEAGUES)})"
        )
    return LEAGUES[year]
