"""Région analysée : Europe (par défaut), Amérique du Nord, Corée, Chine,
Pacifique (LCP) ou Brésil / Amérique latine (CBLOL).

Choisie avec la variable d'environnement SCOUT_REGION, ou l'option --region de scout.py :
    python scout.py matchs --year 2026                 # Europe
    python scout.py matchs --year 2026 --region na     # Amérique du Nord

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
    # Chine : LPL ; 2e division = LDL (2023-2025), puis Asia Masters Elite et
    # City Heroes Championship (2026, les qualifiés chinois du WSCI)
    "cn": {"data": "data/cn", "web": "/cn", "home": ("China",),
           "top": ("Tencent LoL Pro League",), "top_name": "LPL", "has_em": False,
           "roster_tiers": ("LEC", "ERL1")},
    # Pacifique : LCP depuis 2025 ; PCS, VCS, LJL (et LCO) = 2e division
    # (en 2023-2024 ce sont les ligues majeures de la zone, sans ligue au-dessus)
    "lcp": {"data": "data/lcp", "web": "/lcp",
            "home": ("Asia Pacific", "PCS", "Vietnam", "Japan", "Oceania"),
            "top": ("League of Legends Championship Pacific",), "top_name": "LCP", "has_em": False,
            "roster_tiers": ("LEC", "ERL1")},
    # Brésil et Amérique latine : CBLOL (LTA South en 2025, LLA en 2023-2024) ;
    # 2e division = CBLOL Academy (2023-2024), Circuito Desafiante (2025+),
    # Liga Regional Sur (et Norte jusqu'en 2025, la LRN alimente la LCS en 2026)
    "br": {"data": "data/br", "web": "/br", "home": ("Brazil", "Latin America", "Americas"),
           "top": ("Circuit Brazilian League of Legends", "League of Legends Championship of The Americas South",
                   "Liga Latinoamerica"), "top_name": "CBLOL", "has_em": False,
           "roster_tiers": ("LEC", "ERL1")},
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
CORRECTIONS_DIR = "corrections"  # corrections à la main (âges, mercato, comptes soloQ...), versionnées

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
