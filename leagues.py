"""Ligues européennes suivies et leur niveau.

Les clés sont les noms exacts du champ `League` dans Leaguepedia.
Le classement ERL1 / ERL2 est fait à la main : à vérifier / ajuster à chaque
saison (Riot réorganise régulièrement les ERL).
"""

LEAGUES = {
    # Niveau 1
    "LoL EMEA Championship": "LEC",

    # Tournoi qui oppose les meilleures équipes des ERL : très utile pour
    # comparer des joueurs de ligues différentes
    "EMEA Masters": "EM",

    # ERL1 (ligues régionales principales)
    "La Ligue Française": "ERL1",
    # Attention : Leaguepedia garde les anciens noms de la Prime League.
    # "Prime League Pro Division" = la "1st Division" depuis 2026 (ERL1)
    "Prime League Pro Division": "ERL1",
    "Liga Española de League of Legends": "ERL1",
    "Northern League of Legends Championship": "ERL1",
    "LIT": "ERL1",
    "Rift Legends": "ERL1",
    "TransIP Road Of Legends": "ERL1",
    "Hitpoint Masters": "ERL1",
    "Turkish Championship League": "ERL1",
    "Liga Portuguesa": "ERL1",
    "Hellenic Legends League": "ERL1",
    "Esports Balkan League": "ERL1",
    "Arabian League": "ERL1",

    # ERL2 (deuxièmes divisions)
    # "Prime League 1st Division" = la "2nd Division" depuis 2026 (ERL2)
    "Prime League 1st Division": "ERL2",
    # En 2026 la LFL Division 2 ne contient plus que la promotion ;
    # la 2e division française est la Nexus League (à confirmer)
    "Nexus League": "ERL2",
    "La Ligue Française Division 2": "ERL2",
    "Hitpoint Challengers": "ERL2",
    "Benelux Ascend Series": "ERL2",
    "Hellenic Challengers Cup": "ERL2",
    "Arabian League 2nd Division": "ERL2",
    "Road to LES": "ERL2",
}
