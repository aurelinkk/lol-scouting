"""Toutes les commandes du pipeline de scouting, à lancer depuis la racine du dépôt.

    python scout.py                              # liste des commandes
    python scout.py export --region na           # une commande pour une région
    python scout.py joueur Mercy9 --season 2025  # les options suivent la commande
    python scout.py tout                         # tout mettre à jour (= python run_all.py)

--region (eu, na, kr, cn, lcp, br) remplace la variable SCOUT_REGION : même
syntaxe sous Windows PowerShell et sous Linux. Europe par défaut.
"""
import os
import runpy
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))

# commande -> (module, ce qu'elle fait). L'ordre est celui de l'aide.
COMMANDS = {
    "tout": ("run_all", "Tout mettre à jour : matchs, soloQ, exports, modèles, envoi (python run_all.py)"),
    # Collecte
    "matchs": ("scouting.collect.pro_games", "Parties pro d'une saison via Leaguepedia (--year 2026, --refresh)"),
    "international": ("scouting.collect.international", "Worlds, MSI, EWC, First Stand (communs aux régions)"),
    "soloq": ("scouting.collect.soloq", "Ladder EUW et profils soloQ : snapshot | profiles | show"),
    "residence": ("scouting.collect.residency", "Résidence officielle et double nationalité (Leaguepedia)"),
    "equipes": ("scouting.collect.team_history", "Résultats et historique des matchs des équipes"),
    "mercato": ("scouting.mercato.mercato", "Mercato : rumeurs, transferts, contrats, coachs (--refresh)"),
    # Calculs
    "classement": ("scouting.analysis.prospects", "Classement des prospects (--season, --role, --tier, --calibrate-top)"),
    "ligues": ("scouting.analysis.league_strength", "Coefficient EMEA Masters / 2e division des ligues"),
    "niveau-ligues": ("scouting.analysis.league_talent", "Niveau des ligues saison par saison (joueurs passés, montés)"),
    "montees": ("scouting.analysis.promotions", "Qui est monté d'une saison à l'autre (--from 2025 --to 2026)"),
    "score-mondial": ("scouting.analysis.world_score", "Force des régions (Bradley-Terry sur l'international, --check)"),
    "modele": ("scouting.model.promotion_model", "Modèle de montée en 1re et 2e division (--verbose)"),
    # Site
    "export": ("scouting.export.site", "Données du site pour une région (--only mercato|equipes)"),
    "reglages": ("scouting.export.settings", "Réglages du score pour la page Technique"),
    # Outils
    "joueur": ("scouting.tools.player_report", "Fiche détaillée d'un joueur dans le terminal"),
    "ages-manquants": ("scouting.tools.missing_ages", "Prospects sans date de naissance (à mettre dans corrections/)"),
    "oracles": ("scouting.sources.oracles_elixir", "Couverture Oracle's Elixir d'une saison"),
    "photos": ("scouting.sources.images", "Photos des joueurs et logos des équipes (Leaguepedia)"),
    "sheep": ("scouting.sources.sheep_esports", "Scoops Sheep Esports (titres Google News)"),
}
SECTIONS = {"matchs": "Collecte", "classement": "Calculs", "export": "Site", "joueur": "Outils"}


def usage():
    print(__doc__.strip().split("\n\n")[0] + "\n")
    for name, (_, desc) in COMMANDS.items():
        if name in SECTIONS:
            print(f"\n{SECTIONS[name]}")
        print(f"  {name:<15} {desc}")
    print("\nAide d'une commande : python scout.py <commande> --help")


def main(argv):
    os.chdir(ROOT)  # chemins des données relatifs à la racine du dépôt
    sys.path.insert(0, ROOT)
    args = list(argv)
    if "--region" in args:
        i = args.index("--region")
        if i + 1 >= len(args):
            raise SystemExit("--region : préciser la région (eu, na, kr, cn, lcp, br)")
        os.environ["SCOUT_REGION"] = args[i + 1]
        del args[i:i + 2]
    if not args or args[0] in ("-h", "--help", "aide"):
        return usage()
    name = args[0]
    if name not in COMMANDS:
        close = [c for c in COMMANDS if c.startswith(name[:3])]
        raise SystemExit(f"Commande inconnue : {name}" + (f" (tu voulais dire {', '.join(close)} ?)" if close else "")
                         + "\nListe : python scout.py")
    module = COMMANDS[name][0]
    sys.argv = [f"scout.py {name}"] + args[1:]
    runpy.run_module(module, run_name="__main__")


if __name__ == "__main__":
    main(sys.argv[1:])
