"""Région analysée : Europe (par défaut) ou Amérique du Nord.

Choisie avec la variable d'environnement SCOUT_REGION :
    python fetch_pro.py --year 2026                    # Europe
    SCOUT_REGION=na python fetch_pro.py --year 2026    # Amérique du Nord
    (Windows PowerShell : $env:SCOUT_REGION="na"; python fetch_pro.py --year 2026)

Les deux régions ont chacune leurs données (data/ et data/na/) et leurs fichiers
du site (web/data et web/data/na) : les classements ne sont pas mélangés, faute
de compétition commune pour comparer les niveaux (pas d'EMEA Masters en NA).

Pour garder le même code, la NA réutilise les niveaux de l'Europe :
    "LEC"  = 1re division (LCS ; LTA North en 2025)
    "ERL1" = 2e division  (NACL)
Le site affiche les vrais noms (LCS, NACL).
"""
import os

REGION = os.environ.get("SCOUT_REGION", "eu").strip().lower()
if REGION not in ("eu", "na"):
    raise SystemExit(f"SCOUT_REGION={REGION!r} inconnue (eu ou na)")
IS_EU = REGION == "eu"

DATA_DIR = "data" if IS_EU else "data/na"
RAW_DIR = f"{DATA_DIR}/raw"
SHARED_RAW_DIR = "data/raw"  # caches communs (photos, logos)

WEB_DATA_DIR = "web/data" if IS_EU else "web/data/na"
WEB_PUBLIC_DIR = "web/public/data" if IS_EU else "web/public/data/na"

# Régions Leaguepedia (champ Tournaments.Region) de la région analysée
HOME_REGIONS = ("EMEA",) if IS_EU else ("North America", "Americas")

# Ligue(s) de 1re division, toutes années (historique « ex-LEC » / « ex-LCS »)
TOP_LEAGUES = (
    ("LoL EMEA Championship", "Europe League Championship Series") if IS_EU else
    ("League of Legends Championship Series",
     "League of Legends Championship of The Americas North",
     "League of Legends Championship of The Americas")
)
TOP_NAME = "LEC" if IS_EU else "LCS"

# Tournoi international de la 2e division (coefficient de ligue) : EU seulement
HAS_EM = IS_EU


def region_sql(alias="T"):
    """Condition SQL : tournoi de la région analysée."""
    return "(" + " OR ".join(f"{alias}.Region='{r}'" for r in HOME_REGIONS) + ")"


def not_region_sql(alias="T"):
    return " AND ".join(f"{alias}.Region!='{r}'" for r in HOME_REGIONS)
