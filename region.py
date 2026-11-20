"""Région analysée : Europe (par défaut) ou Amérique du Nord.

Choisie avec la variable d'environnement SCOUT_REGION :
    python fetch_pro.py --year 2026                    # Europe
    SCOUT_REGION=na python fetch_pro.py --year 2026    # Amérique du Nord
    (Windows PowerShell : $env:SCOUT_REGION="na"; python fetch_pro.py --year 2026)

Chaque région (eu, na, kr) a ses données (data/, data/na/, data/kr/) et ses
fichiers du site (web/data, web/data/na, web/data/kr) : les classements ne sont
pas mélangés, faute de compétition commune pour comparer les niveaux.

Pour garder le même code, la NA et la Corée réutilisent les niveaux de l'Europe :
    "LEC"  = 1re division (LCS ; LTA North en 2025 / LCK)
    "ERL1" = 2e division  (NACL / LCK CL)
    "ERL2" = 3e division  (LCK Academy Series)
Le site affiche les vrais noms (LCS, NACL).
"""
import os

# Configuration de chaque région suivie
REGIONS = {
    "eu": {"data": "data", "web": "", "home": ("EMEA",),
           "top": ("LoL EMEA Championship", "Europe League Championship Series"), "top_name": "LEC",
           "has_em": True, "roster_tiers": ("LEC", "ERL1")},
    "na": {"data": "data/na", "web": "/na", "home": ("North America", "Americas"),
           "top": ("League of Legends Championship Series",
                   "League of Legends Championship of The Americas North",
                   "League of Legends Championship of The Americas"), "top_name": "LCS",
           "has_em": False, "roster_tiers": ("LEC", "ERL1")},
    "kr": {"data": "data/kr", "web": "/kr", "home": ("Korea",),
           "top": ("LoL Champions Korea",), "top_name": "LCK", "has_em": False,
           "roster_tiers": ("LEC", "ERL1", "ERL2")},
}
ALL_REGIONS = tuple(REGIONS)

REGION = os.environ.get("SCOUT_REGION", "eu").strip().lower()
if REGION not in REGIONS:
    raise SystemExit(f"SCOUT_REGION={REGION!r} inconnue ({', '.join(REGIONS)})")
IS_EU = REGION == "eu"
_cfg = REGIONS[REGION]

DATA_DIR = _cfg["data"]
RAW_DIR = f"{DATA_DIR}/raw"
SHARED_RAW_DIR = "data/raw"  # caches communs (photos, logos)

WEB_DATA_DIR = "web/data" + _cfg["web"]
WEB_PUBLIC_DIR = "web/public/data" + _cfg["web"]

# Régions Leaguepedia (champ Tournaments.Region) de la région analysée
HOME_REGIONS = _cfg["home"]

# Ligue(s) de 1re division, toutes années (historique « ex-LEC » / « ex-LCS » / « ex-LCK »)
TOP_LEAGUES = _cfg["top"]
TOP_NAME = _cfg["top_name"]

# Divisions affichées dans l'onglet Rosters (effectifs + mercato) : la Corée
# a aussi sa 3e division (LCK Academy Series) ; en Europe, les ERL2 sont trop
# nombreuses pour le mercato
ROSTER_TIERS = _cfg["roster_tiers"]

# Tournoi international de la 2e division (coefficient de ligue) : EU seulement
HAS_EM = _cfg["has_em"]

OTHER_REGIONS = tuple(r for r in REGIONS if r != REGION)


def data_dir(region):
    return REGIONS[region]["data"]


def web_data_dir(region):
    return "web/data" + REGIONS[region]["web"]


def region_sql(alias="T"):
    """Condition SQL : tournoi de la région analysée."""
    return "(" + " OR ".join(f"{alias}.Region='{r}'" for r in HOME_REGIONS) + ")"


def not_region_sql(alias="T"):
    return " AND ".join(f"{alias}.Region!='{r}'" for r in HOME_REGIONS)
