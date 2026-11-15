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
  la Liga Nexo est la 2e division espagnole en 2025.
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

LEAGUES = {
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


def leagues_for(year):
    if year not in LEAGUES:
        raise SystemExit(
            f"Saison {year} non configurée dans leagues.py "
            f"(saisons disponibles : {sorted(LEAGUES)})"
        )
    return LEAGUES[year]
