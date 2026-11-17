"""Mercato automatique : effectifs de la saison suivante d'après Leaguepedia.

Point de départ : l'effectif de chaque équipe de LEC / ERL1 lors de son dernier
split de la saison (d'après les parties jouées). On applique ensuite, dans
l'ordre chronologique :
  - RosterChanges : arrivées / départs officialisés (statut "confirmé")
  - RosterRumors  : rumeurs (Sheep Esports, X...), sauf celles marquées
                    "ne se fera pas" (statut "rumeur")
Les corrections saisies dans rosters_<saison>.csv sont prioritaires (statut
"manuel"), une ligne par poste : league,team,role,player_<saison-1>,player_<saison>

Usage :
    python mercato.py                # aperçu du mercato LEC
    python mercato.py --league LFL
"""
import argparse
import os
import time

import pandas as pd

from leaguepedia import cargo_query
from region import RAW_DIR
from rosters import ROLES, build_rosters, load_mercato

CACHE = RAW_DIR + "/mercato_{season}_{kind}.csv"

# Fin de contrat (base de contrats de Riot, le GCD, reprise par Leaguepedia) :
# un joueur sans nouvelle dont le contrat avec son club se termine au plus tard
# à cette date (mois-jour, saison précédente) est retiré de l'effectif projeté
CONTRACT_CUTOFF = "11-16"
SLOTS = ROLES + ["Coach"]
EVENTS_MAX_AGE_HOURS = 1  # rumeurs / transferts retéléchargés au-delà
NOT_A_TEAM = {"Free Agent", "Retired", "Inactive", "Unknown", "None", ""}
COACH_ROLES = {"Coach", "Head Coach"}


def _role(r):
    r = str(r or "").strip()
    if r in COACH_ROLES:
        return "Coach"
    return r if r in ROLES else None


def _url(value):
    return value if isinstance(value, str) and value.startswith("http") else None


def fetch_events(season, refresh=False):
    """Rumeurs et changements officiels depuis septembre de la saison précédente."""
    since = f"{season - 1}-09-01"
    paths = {k: CACHE.format(season=season, kind=k) for k in ("rumors", "changes")}
    # Cache de quelques heures seulement : les rumeurs arrivent tous les jours
    fresh = (all(os.path.exists(p) for p in paths.values()) and not refresh
             and all(time.time() - os.path.getmtime(p) < EVENTS_MAX_AGE_HOURS * 3600
                     for p in paths.values()))
    if fresh:
        rumors, changes = pd.read_csv(paths["rumors"]), pd.read_csv(paths["changes"])
        if "link" in rumors and "link" in changes:  # ancien cache sans les liens : on retélécharge
            return rumors, changes
    rumors = pd.DataFrame(cargo_query(
        tables="RosterRumors",
        fields="Date=date,Player=player,TeamStart=team_start,TeamEnd=team_end,"
               "RoleEnd=role,Status=status,NotHappening=not_happening,SourceSite=source,"
               "SourceLink=link",
        where=f"Date>='{since}'"),
        columns=["date", "player", "team_start", "team_end", "role", "status", "not_happening", "source",
                 "link"])
    changes = pd.DataFrame(cargo_query(
        tables="RosterChanges",
        fields="Date_Sort=date,Player=player,Team=team,Direction=direction,Role=role,Source=ref",
        where=f"Date_Sort>='{since}'"),
        columns=["date", "player", "team", "direction", "role", "ref"])
    # Source : "https://x.com/...;;;Titre;;;x.com;;;..." -> première URL
    changes["link"] = changes["ref"].astype(str).str.extract(r"(https?://[^;\s]+)")[0]
    os.makedirs(RAW_DIR, exist_ok=True)
    rumors.to_csv(paths["rumors"], index=False)
    changes.to_csv(paths["changes"], index=False)
    return rumors, changes


def base_rosters(games, season):
    """Titulaires de chaque équipe LEC / ERL1 lors de son dernier split de `season`."""
    rc = build_rosters(games[games["season"] == season])
    # Équipes invitées (Los Ratones en LEC Versus, KC Blue Stars en LFL
    # Invitational...) : pas de vraie place dans la ligue
    team_games = (games[games["season"] == season].groupby(["league_code", "team"])["game_id"]
                  .nunique().reset_index(name="n"))
    team_games["min"] = team_games["league_code"].map(lambda lg: 15 if lg == "LEC" else 10)
    real = team_games[team_games["n"] >= team_games["min"]][["league_code", "team"]]
    rc = rc.merge(real, on=["league_code", "team"])
    last = (rc.sort_values("start").groupby(["league_code", "team"])["tournament"].last()
            .reset_index())
    rc = rc.merge(last, on=["league_code", "team", "tournament"])
    starters = (rc.sort_values("games", ascending=False)
                .drop_duplicates(["league_code", "team", "role"]))
    rows = []
    for (league, team, tier), grp in starters.groupby(["league_code", "team", "tier"]):
        by_role = dict(zip(grp["role"], grp["player"]))
        for role in SLOTS:
            rows.append({"league": league, "tier": tier, "team": team, "role": role,
                         "before": by_role.get(role)})
    return pd.DataFrame(rows)


def fetch_contracts(players, season, refresh=False):
    """Contrats (GCD) des joueurs, depuis la table Contracts de Leaguepedia."""
    path = CACHE.format(season=season, kind="contracts")
    cached = pd.read_csv(path) if os.path.exists(path) and not refresh else pd.DataFrame(
        columns=["player", "team", "end", "checked"])
    done = set(cached["checked"].dropna()) if "checked" in cached else set()
    todo = sorted({p for p in players if isinstance(p, str)} - done)
    if todo:
        rows = []
        for i in range(0, len(todo), 40):
            quoted = ",".join("'" + p.replace("'", "\\'") + "'" for p in todo[i:i + 40])
            rows += cargo_query(tables="Contracts", fields="Player=player,Team=team,ContractEnd=end",
                                where=f"Player IN ({quoted}) AND IsRemoval=0")
        cached = pd.concat([cached, pd.DataFrame(rows, columns=["player", "team", "end"]),
                            pd.DataFrame({"checked": todo})], ignore_index=True)
        os.makedirs(RAW_DIR, exist_ok=True)
        cached.to_csv(path, index=False)
    return cached.dropna(subset=["player"])


def apply_contract_ends(board, season):
    """Retire les joueurs « inchangé » dont le contrat avec leur club est terminé."""
    cutoff = pd.Timestamp(f"{season - 1}-{CONTRACT_CUTOFF}")
    unchanged = board[(board["status"] == "inchangé") & board["after"].notna() & (board["role"] != "Coach")]
    if unchanged.empty:
        return board
    try:
        contracts = fetch_contracts(unchanged["after"].tolist(), season)
    except Exception as e:  # pas de réseau ni de cache
        print(f"  (contrats indisponibles : {e})")
        return board
    contracts["key"] = contracts["player"].str.lower() + "|" + contracts["team"].str.lower()
    last_end = pd.to_datetime(contracts["end"], errors="coerce").groupby(contracts["key"]).max()
    for idx, r in unchanged.iterrows():
        # nom de page Leaguepedia : "Zest (Kim Dong-min)" -> contrat sous "Zest" ou la page entière
        names = {r["after"].lower(), r["after"].split(" (")[0].lower()}
        ends = [last_end.get(f"{n}|{r['team'].lower()}") for n in names]
        ends = [e for e in ends if e is not None and not pd.isna(e)]
        if ends and max(ends) <= cutoff:
            board.loc[idx, ["after", "status", "source"]] = [
                None, f"fin de contrat ({max(ends).date():%d/%m/%Y})", "GCD (Leaguepedia)"]
    return board


def build_mercato(games, season, refresh=False):
    """Effectif projeté de `season` pour chaque équipe LEC / ERL1 de `season - 1`."""
    board = base_rosters(games, season - 1)
    board["after"] = board["before"]
    board["status"] = board["before"].map(lambda p: "inchangé" if p else "")
    board["source"] = ""
    rumors, changes = fetch_events(season, refresh=refresh)
    teams = set(board["team"])

    # Noms parfois en minuscules dans Leaguepedia ("kyeahoo") : on reprend
    # l'écriture de nos données quand elle existe
    known = {str(p).lower(): p for p in pd.concat([games["player"], board["before"].dropna()]).unique()}
    canon = lambda name: known.get(str(name).lower(), name)
    rumors["player"] = rumors["player"].map(canon)
    changes["player"] = changes["player"].map(canon)

    events = []
    for _, c in changes.iterrows():
        role = _role(c["role"])
        if role and c["team"] in teams:
            events.append((str(c["date"])[:10], 1, c["direction"], c["player"], c["team"], role,
                           "confirmé", "Leaguepedia", None, _url(c.get("link"))))
    # Plusieurs destinations le même jour pour un joueur (ex : SkewMond, article
    # Sheep du 10/11 citant Karmine Corp ET Team Vitality) : rien n'est tranché,
    # on ne le place nulle part et on garde les pistes pour l'affichage
    rumors = rumors[~rumors["not_happening"].astype(str).isin(["1", "True", "true"])].copy()
    rumors["day"] = rumors["date"].astype(str).str[:10]
    moves = rumors[rumors["team_end"] != rumors["team_start"]]
    latest = moves.groupby("player")["day"].transform("max")
    last_moves = moves[moves["day"] == latest]
    n_dest = last_moves.groupby("player")["team_end"].nunique()
    undecided = set(n_dest[n_dest > 1].index)
    options = {p: sorted(last_moves.loc[last_moves["player"] == p, "team_end"].unique())
               for p in undecided}
    board["options"] = ""

    for _, r in rumors.iterrows():
        role = _role(r["role"])
        if not role:
            continue
        status = "confirmé" if r["status"] == "Confirmed" else "rumeur"
        if r["player"] in undecided and r["team_end"] in options[r["player"]]:
            # piste non tranchée : on la note sur le poste visé, sans y placer le joueur
            slot = (board["team"] == r["team_end"]) & (board["role"] == role)
            others = " / ".join(t for t in options[r["player"]] if t != r["team_end"])
            board.loc[slot, "options"] = (f"piste : {r['player']} (aussi {others})"
                                          f" · {r['source']}")
            if r["team_start"] in teams:
                events.append((str(r["date"])[:10], 0, "Leave", r["player"], r["team_start"], role,
                               status, r["source"], None, _url(r.get("link"))))
            continue
        if r["team_start"] in teams and r["team_start"] != r["team_end"]:
            events.append((str(r["date"])[:10], 0, "Leave", r["player"], r["team_start"], role,
                           status, r["source"], r["team_end"], _url(r.get("link"))))
        if r["team_end"] not in teams and r["team_start"] != r["team_end"]:
            # Destination hors de nos ligues (ex : Yukino, KC Blue -> FlyQuest en
            # LCS) : il quitte le poste où une rumeur plus ancienne l'avait placé
            events.append((str(r["date"])[:10], 0, "Out", r["player"], r["team_end"], role,
                           status, r["source"], r["team_end"], _url(r.get("link"))))
        if r["team_end"] in teams:
            kind = "Stay" if r["team_start"] == r["team_end"] else "Join"
            events.append((str(r["date"])[:10], 0, kind, r["player"], r["team_end"], role,
                           status, r["source"], None, _url(r.get("link"))))

    # Ordre chronologique ; à date égale : la rumeur avant l'officiel, et le
    # départ avant l'arrivée (un départ + une arrivée le même jour = prolongation)
    order = {"Leave": 0, "Out": 0, "Stay": 1, "Join": 1}
    events.sort(key=lambda e: (e[0], e[1], order.get(e[2], 1)))
    dest_of = {}  # dernière destination connue de chaque joueur
    board["url"] = None  # lien vers l'article / le post qui annonce le mouvement
    for date, _, direction, player, team, role, status, source, dest, url in events:
        if dest:
            dest_of[player] = dest
        elif direction == "Join":
            dest_of[player] = team
        if direction == "Out":
            # parti hors de nos ligues : son poste se libère (son ancien poste s'il
            # y était, ou celui où une rumeur plus ancienne l'avait placé)
            for idx in board.index[board["after"] == player]:
                board.loc[idx, ["after", "status", "source", "url"]] = [None, f"départ ({status})", source, url]
            continue
        slot = (board["team"] == team) & (board["role"] == role)
        if not slot.any():
            continue
        current = board.loc[slot, "after"].iloc[0]
        if direction == "Leave":
            if current == player:
                board.loc[slot, ["after", "status", "source", "url"]] = [None, f"départ ({status})", source, url]
            # le joueur quitte peut-être un autre poste de l'équipe
            other = (board["team"] == team) & (board["after"] == player)
            board.loc[other, ["after", "status", "source", "url"]] = [None, f"départ ({status})", source, url]
        else:
            # un joueur ne peut être qu'à un seul endroit
            board.loc[board["after"] == player, ["after", "status", "source"]] = [None, "parti", source]
            label = status if direction == "Join" else f"reste ({status})"
            # Une rumeur qui remplace un joueur officialisé : on garde la trace
            # (ex : LYON, Castle officiel le 08/09 puis rumeur Naak Nako le 17/11)
            prev_status = board.loc[slot, "status"].iloc[0]
            if (status == "rumeur" and prev_status == "confirmé" and isinstance(current, str)
                    and current != player):
                board.loc[slot, "options"] = f"officiel : {current}"
            board.loc[slot, ["after", "status", "source", "url"]] = [player, label, source, url]

    # Destination des joueurs qui quittent leur équipe (si une rumeur ou un
    # transfert la donne) : ex. Yukino -> FlyQuest, Carzzy -> Movistar KOI
    dest_of = {p: d for p, d in dest_of.items() if d and d not in NOT_A_TEAM}
    board["to"] = [
        dest_of.get(b) if isinstance(b, str) and dest_of.get(b) != t
        and not ((board["team"] == t) & (board["after"] == b)).any() else None
        for b, t in zip(board["before"], board["team"])]

    # Fins de contrat (GCD) : joueurs restés "inchangé" dont le contrat est fini
    board = apply_contract_ends(board, season)

    # Corrections manuelles (prioritaires)
    manual = load_mercato(season)
    if manual is not None:
        col = f"player_{season}"
        for _, m in manual.iterrows():
            slot = (board["team"] == m["team"]) & (board["role"] == m["role"])
            if not slot.any():
                board = pd.concat([board, pd.DataFrame([{
                    "league": m["league"], "tier": "LEC" if m["league"] == "LEC" else "ERL1",
                    "team": m["team"], "role": m["role"], "before": m.get(f"player_{season - 1}") or None,
                    "after": None, "status": "", "source": ""}])], ignore_index=True)
                slot = (board["team"] == m["team"]) & (board["role"] == m["role"])
            board.loc[slot, ["after", "status", "source"]] = [m[col] or None, "manuel", "saisie manuelle"]
    board.attrs["undecided"] = options
    return board


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, default=pd.Timestamp.today().year + 1)
    parser.add_argument("--league", default="LEC")
    parser.add_argument("--refresh", action="store_true", help="retélécharger rumeurs / changements")
    args = parser.parse_args()
    from league_strength import load_games
    if args.refresh:
        fetch_events(args.season, refresh=True)
    board = build_mercato(load_games([args.season - 1]), args.season)
    view = board[board["league"] == args.league]
    pd.set_option("display.width", 200)
    for team, grp in view.groupby("team"):
        print(f"\n== {team}")
        print(grp[["role", "before", "after", "status", "source"]].fillna("—").to_string(index=False))


if __name__ == "__main__":
    main()
