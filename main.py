from riot_api import (
    get_account_by_riot_id,
    get_match_ids_by_puuid,
    get_match_by_id
)


game_name = input("Game Name : ")
tag_line = input("Tag Line : ")

account = get_account_by_riot_id(game_name, tag_line)

if account:
    puuid = account["puuid"]

    match_ids = get_match_ids_by_puuid(puuid, 20)

    if match_ids:
        print()
        print(f"{len(match_ids)} matchs trouvés")

        first_match_id = match_ids[0]

        print()
        print("Analyse du match :", first_match_id)

        match = get_match_by_id(first_match_id)

        if match:
            participants = match["info"]["participants"]

            for player in participants:
                if player["puuid"] == puuid:
                    print()
                    print("=== TES STATS ===")
                    print("Champion :", player["championName"])
                    print("Role :", player["teamPosition"])
                    print("Win :", player["win"])
                    print("Kills :", player["kills"])
                    print("Deaths :", player["deaths"])
                    print("Assists :", player["assists"])
                    print("Gold :", player["goldEarned"])
                    print("Damage :", player["totalDamageDealtToChampions"])
                    print("Vision score :", player["visionScore"])

                    cs = (
                        player["totalMinionsKilled"]
                        + player["neutralMinionsKilled"]
                    )

                    duration_minutes = match["info"]["gameDuration"] / 60

                    cs_per_min = cs / duration_minutes
                    damage_per_min = (
                        player["totalDamageDealtToChampions"]
                        / duration_minutes
                    )

                    print("CS :", cs)
                    print("CS/min :", round(cs_per_min, 2))
                    print("DPM :", round(damage_per_min, 2))