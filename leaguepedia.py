"""Petit client pour l'API Cargo de Leaguepedia (lol.fandom.com).

Leaguepedia expose ses tables (matchs, joueurs, tournois...) via des requêtes
proches du SQL. Doc des tables : https://lol.fandom.com/wiki/Special:CargoTables
"""
import time

import requests

API_URL = "https://lol.fandom.com/api.php"
PAGE_SIZE = 500  # maximum autorisé par requête pour un utilisateur anonyme

session = requests.Session()
session.headers["User-Agent"] = "lol-scouting/0.1 (projet perso d'analyse de prospects)"


def cargo_query(tables, fields, where=None, join_on=None, order_by=None, pause=1.0):
    """Exécute une requête Cargo et renvoie toutes les lignes (pagination incluse)."""
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


def _get_with_retry(params, max_attempts=6):
    wait = 5
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
            wait *= 2
            continue

        raise RuntimeError(f"Erreur Leaguepedia : {error}")
