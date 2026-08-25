from riot_api import get_account_by_riot_id, get_match_ids_by_puuid


game_name = input("Game Name : ")
tag_line = input("Tag Line : ")

account = get_account_by_riot_id(game_name, tag_line)

if account:
    print()
    print("Compte trouvé")
    print("Game Name :", account["gameName"])
    print("Tag Line :", account["tagLine"])

    puuid = account["puuid"]

    print()
    print("Récupération des dernières SoloQ...")

    match_ids = get_match_ids_by_puuid(puuid, 20)

    if match_ids:
        print()
        print(f"{len(match_ids)} matchs trouvés :")

        for match_id in match_ids:
            print(match_id)