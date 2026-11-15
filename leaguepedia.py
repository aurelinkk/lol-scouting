"""Petit client pour l'API Cargo de Leaguepedia (lol.fandom.com).

Leaguepedia expose ses tables (matchs, joueurs, tournois...) via des requêtes
proches du SQL. Doc des tables : https://lol.fandom.com/wiki/Special:CargoTables
"""
import os
import time

import requests
from dotenv import load_dotenv

load_dotenv()

API_URL = "https://lol.fandom.com/api.php"
PAGE_SIZE = 500  # maximum autorisé par requête

session = requests.Session()
session.headers["User-Agent"] = "lol-scouting/0.1 (projet perso d'analyse de prospects)"
_logged_in = False


def login():
    """Connexion avec un bot password (LEAGUEPEDIA_USER / LEAGUEPEDIA_PASSWORD dans .env).

    Connecté, les limites de requêtes sont bien plus hautes qu'en anonyme.
    Sans identifiants, on continue en anonyme.
    """
    global _logged_in
    if _logged_in:
        return
    _logged_in = True  # une seule tentative par exécution

    user = os.getenv("LEAGUEPEDIA_USER")
    password = os.getenv("LEAGUEPEDIA_PASSWORD")
    if not user or not password:
        print("Leaguepedia : pas d'identifiants dans .env, mode anonyme (plus lent)")
        return

    token = session.get(API_URL, params={
        "action": "query", "meta": "tokens", "type": "login", "format": "json",
    }, timeout=60).json()["query"]["tokens"]["logintoken"]

    result = session.post(API_URL, data={
        "action": "login", "lgname": user, "lgpassword": password,
        "lgtoken": token, "format": "json",
    }, timeout=60).json()["login"]

    if result["result"] == "Success":
        print(f"Leaguepedia : connecté en tant que {result['lgusername']}")
    else:
        print(f"Leaguepedia : échec de connexion ({result.get('reason', result['result'])}), "
              "mode anonyme")


def cargo_query(tables, fields, where=None, join_on=None, order_by=None, pause=2.0):
    """Exécute une requête Cargo et renvoie toutes les lignes (pagination incluse)."""
    login()
    rows = []
    offset = 0

    while True:
        params = {
            "action": "cargoquery",
            "format": "json",
            "tables": tables,
            "fields": fields,
            "limit": PAGE_SIZE,
            "offset": offset,
        }
        if where:
            params["where"] = where
        if join_on:
            params["join_on"] = join_on
        if order_by:
            params["order_by"] = order_by

        data = _get_with_retry(params)
        page = [item["title"] for item in data.get("cargoquery", [])]
        rows.extend(page)

        if len(page) < PAGE_SIZE:
            return rows

        offset += PAGE_SIZE
        time.sleep(pause)  # on reste poli avec le wiki


def _get_with_retry(params, max_attempts=10, max_wait=120):
    wait = 10
    for attempt in range(1, max_attempts + 1):
        response = session.get(API_URL, params=params, timeout=60)
        response.raise_for_status()
        data = response.json()

        error = data.get("error")
        if not error:
            return data

        # Leaguepedia limite le nombre de requêtes : on attend puis on réessaie
        if error.get("code") == "ratelimited" and attempt < max_attempts:
            print(f"  Rate limit Leaguepedia, nouvelle tentative dans {wait}s...")
            time.sleep(wait)
            wait = min(wait * 2, max_wait)
            continue

        raise RuntimeError(f"Erreur Leaguepedia : {error}")
