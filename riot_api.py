import os
import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("RIOT_API_KEY")

def get_account_by_riot_id(game_name, tag_line):
    url = f"https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{game_name}/{tag_line}"

    headers = {
        "X-Riot-Token": API_KEY
    }

    response = requests.get(url, headers=headers)

    print("Status code :", response.status_code)

    if response.status_code == 200:
        return response.json()

    print("Erreur :", response.text)
    return None

def get_match_ids_by_puuid(puuid, count=20):
    url = (
        f"https://europe.api.riotgames.com"
        f"/lol/match/v5/matches/by-puuid/{puuid}/ids"
    )

    params = {
        "queue": 420,   # Ranked Solo/Duo
        "start": 0,
        "count": count
    }

    headers = {
        "X-Riot-Token": API_KEY
    }

    response = requests.get(url, headers=headers, params=params)

    print("Match history status :", response.status_code)

    if response.status_code == 200:
        return response.json()

    print("Erreur :", response.text)
    return None