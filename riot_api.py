"""Client minimal pour l'API Riot (clé RIOT_API_KEY dans .env).

Respecte les limites d'une clé Personal / Development :
20 requêtes par seconde et 100 requêtes toutes les 2 minutes.
En cas de 429 (trop de requêtes), attend le délai indiqué par Riot.
"""
import collections
import os
import time
from urllib.parse import quote

import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("RIOT_API_KEY")

PLATFORM = "https://euw1.api.riotgames.com"   # ladder, ligues (EUW)
REGION = "https://europe.api.riotgames.com"   # comptes, historique de parties

# Fenêtres de limite : (nombre de requêtes, durée en secondes)
RATE_LIMITS = [(20, 1.0), (100, 120.0)]
_calls = collections.deque()
session = requests.Session()


def _wait_for_rate_limit():
    while True:
        now = time.monotonic()
        while _calls and now - _calls[0] > max(w for _, w in RATE_LIMITS):
            _calls.popleft()
        wait = 0.0
        for limit, window in RATE_LIMITS:
            recent = [t for t in _calls if now - t < window]
            if len(recent) >= limit:
                wait = max(wait, window - (now - recent[0]) + 0.05)
        if wait <= 0:
            _calls.append(now)
            return
        time.sleep(wait)


def get(url, params=None, max_attempts=5):
    """GET sur l'API Riot. Renvoie le JSON, ou None si 404."""
    if not API_KEY:
        raise SystemExit("RIOT_API_KEY manquante : ajoute-la dans le fichier .env")
    for attempt in range(1, max_attempts + 1):
        _wait_for_rate_limit()
        response = session.get(url, params=params, headers={"X-Riot-Token": API_KEY}, timeout=30)
        if response.status_code == 200:
            return response.json()
        if response.status_code == 404:
            return None
        if response.status_code == 429 or response.status_code >= 500:
            wait = int(response.headers.get("Retry-After", 5 * attempt))
            print(f"  API Riot : {response.status_code}, nouvelle tentative dans {wait}s...")
            time.sleep(wait)
            continue
        if response.status_code in (401, 403):
            raise SystemExit(f"API Riot : clé refusée ({response.status_code}). "
                             "Vérifie RIOT_API_KEY dans .env (clé expirée ou régénérée ?)")
        response.raise_for_status()
    raise RuntimeError(f"API Riot : échec après {max_attempts} tentatives sur {url}")


# --- Comptes ---------------------------------------------------------------

def get_account_by_riot_id(game_name, tag_line):
    return get(f"{REGION}/riot/account/v1/accounts/by-riot-id/"
               f"{quote(game_name, safe='')}/{quote(tag_line, safe='')}")


def get_account_by_puuid(puuid):
    return get(f"{REGION}/riot/account/v1/accounts/by-puuid/{puuid}")


# --- Classement soloQ ------------------------------------------------------

def get_apex_league(tier, queue="RANKED_SOLO_5x5"):
    """tier : challenger, grandmaster ou master. Renvoie la liste des entrées."""
    data = get(f"{PLATFORM}/lol/league/v4/{tier}leagues/by-queue/{queue}")
    return (data or {}).get("entries", [])


# --- Parties ---------------------------------------------------------------

def get_match_ids_by_puuid(puuid, count=20, queue=420, start_time=None):
    params = {"queue": queue, "start": 0, "count": count}
    if start_time:
        params["startTime"] = int(start_time)
    return get(f"{REGION}/lol/match/v5/matches/by-puuid/{puuid}/ids", params=params) or []


def get_match_by_id(match_id):
    return get(f"{REGION}/lol/match/v5/matches/{match_id}")
