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
SLOTS = ROLES  # les coachs sont gérés à part (liste en bas de chaque équipe)
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
                         "before": by_role.get(role), "base_tournament": grp["tournament"].iloc[0]})
    return pd.DataFrame(rows)


def is_coach_role(role):
    """Head Coach, Assistant Coach, Strategic Coach... (pas les managers / analystes)."""
    return "coach" in str(role).lower()


def fetch_staff(tournaments, season, refresh=False):
    """Coachs de chaque équipe lors de son dernier tournoi (Leaguepedia, TournamentPlayers)."""
    path = CACHE.format(season=season, kind="staff")
    if os.path.exists(path) and not refresh:
        df = pd.read_csv(path)
        if set(tournaments) <= set(df["tournament"].dropna()) | set(df.get("checked", pd.Series()).dropna()):
            return df.dropna(subset=["coach"])
    rows = []
    todo = sorted(set(tournaments))
    for i in range(0, len(todo), 20):
        quoted = ",".join("'" + t.replace("'", "\\'") + "'" for t in todo[i:i + 20])
        rows += cargo_query(
            tables="TournamentPlayers=TP,Tournaments=T", join_on="TP.OverviewPage=T.OverviewPage",
            fields="T.Name=tournament,TP.Team=team,TP.Link=coach,TP.Role=role",
            where=f"T.Name IN ({quoted}) AND TP.Role LIKE '%Coach%'")
    df = pd.DataFrame(rows, columns=["tournament", "team", "coach", "role"])
    out = pd.concat([df, pd.DataFrame({"checked": todo})], ignore_index=True)
    os.makedirs(RAW_DIR, exist_ok=True)
    out.to_csv(path, index=False)
    return df


def build_coaches(board, changes, rumors, season, refresh=False):
    """Coachs de chaque équipe : staff de fin de saison, puis arrivées / départs
    (officiels ou rumeurs) dans l'ordre chronologique.
    Renvoie {équipe: [{name, role, before, after, status, source, url}]}."""
    teams = board.drop_duplicates("team")
    try:
        staff = fetch_staff(teams["base_tournament"].dropna().tolist(), season - 1, refresh)
    except Exception as e:  # pas de réseau ni de cache
        print(f"  (coachs indisponibles : {e})")
        staff = pd.DataFrame(columns=["tournament", "team", "coach", "role"])
    known = set(board["team"])
    coaches = {t: {} for t in known}
    for _, r in staff.iterrows():
        # l'équipe peut avoir été renommée depuis (ex : Dignitas -> OpTic Gaming)
        team = teams.loc[(teams["base_tournament"] == r["tournament"])
                         & ((teams["team"] == r["team"]) | (teams["former_team"] == r["team"])), "team"]
        if len(team):
            coaches[team.iloc[0]][r["coach"]] = {"name": r["coach"], "role": "Coach", "before": True,
                                                 "after": True, "status": "inchangé", "source": "", "url": None}
    events = []
    for _, c in changes[changes["role"].map(is_coach_role)].iterrows():
        events.append((str(c["date"])[:10], 1, c["direction"], c["player"], c["team"], c["role"],
                       "confirmé", "Leaguepedia", _url(c.get("link"))))
    for _, r in rumors[rumors["role"].map(is_coach_role)].iterrows():
        status = "confirmé" if r["status"] == "Confirmed" else "rumeur"
        if r["team_start"] != r["team_end"]:
            events.append((str(r["day"]), 0, "Leave", r["player"], r["team_start"], r["role"],
                           status, r["source"], _url(r.get("link"))))
        events.append((str(r["day"]), 0, "Join" if r["team_start"] != r["team_end"] else "Stay",
                       r["player"], r["team_end"], r["role"], status, r["source"], _url(r.get("link"))))
    events.sort(key=lambda e: (e[0], e[1], 0 if e[2] == "Leave" else 1))
    for date, _, direction, name, team, role, status, source, url in events:
        if direction == "Leave":
            entry = coaches.get(team, {}).get(name)
            if entry and entry["after"]:
                entry.update(after=False, status=f"départ ({status})", source=source, url=url)
            continue
        if team not in coaches:
            # parti dans une équipe que l'on ne suit pas : il quitte la sienne
            for other in coaches.values():
                if name in other and other[name]["after"] and other[name]["before"]:
                    other[name].update(after=False, status=f"départ ({status})", source=source, url=url)
            continue
        for t, other in coaches.items():  # un coach n'est que dans une équipe
            if t != team and name in other and other[name]["after"]:
                other[name].update(after=False, status=f"départ ({status})", source=source, url=url)
        entry = coaches[team].setdefault(name, {"name": name, "role": role, "before": False})
        label = status if direction == "Join" and not entry["before"] else f"reste ({status})"
        entry.update(after=True, role=role or entry.get("role"), status=label, source=source, url=url)
    return {t: list(c.values()) for t, c in coaches.items()}


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


TEAM_CHANGES_FILE = "team_changes.csv"


def team_changes(season):
    """Équipes renommées ou remplacées pour `season` : {ancien nom: (nouveau, source)}.
    Leaguepedia (table TeamRenames) + team_changes.csv (saisie manuelle, prioritaire :
    season,old_team,new_team,source), ex. OpTic Gaming à la place de Dignitas en LCS 2027."""
    out = {}
    try:
        rows = cargo_query(tables="TeamRenames", fields="Date=date,OriginalName=old,NewName=new",
                           where=f"Date>='{season - 1}-09-01'", order_by="Date")
        for r in rows:
            if r["old"] and r["new"]:
                out[r["old"]] = (r["new"], "Leaguepedia")
    except Exception as e:  # pas de réseau
        print(f"  (renommages d'équipes indisponibles : {e})")
    if os.path.exists(TEAM_CHANGES_FILE):
        manual = pd.read_csv(TEAM_CHANGES_FILE, dtype=str).fillna("")
        for _, m in manual[manual["season"] == str(season)].iterrows():
            out[m["old_team"]] = (m["new_team"], m["source"] or "saisie manuelle")
    return out


def add_contract_ends(board, season):
    """Fin de contrat (GCD) de chaque joueur avec l'équipe du poste : colonnes
    before_end / after_end (date ISO ou None)."""
    names = sorted(set(board["before"].dropna()) | set(board["after"].dropna()))
    board["before_end"], board["after_end"] = None, None
    try:
        contracts = fetch_contracts(names, season)
    except Exception as e:  # pas de réseau ni de cache
        print(f"  (contrats indisponibles : {e})")
        return board
    key = contracts["player"].str.lower() + "|" + contracts["team"].str.lower()
    last_end = pd.to_datetime(contracts["end"], errors="coerce").groupby(key).max()

    def end(name, team):
        if not isinstance(name, str):
            return None
        ends = [last_end.get(f"{n}|{str(team).lower()}") for n in {name.lower(), name.split(" (")[0].lower()}]
        ends = [e for e in ends if e is not None and not pd.isna(e)]
        return max(ends).strftime("%Y-%m-%d") if ends else None

    board["before_end"] = [end(b, t) for b, t in zip(board["before"], board["team"])]
    board["after_end"] = [end(a, t) for a, t in zip(board["after"], board["team"])]
    return board


def build_mercato(games, season, refresh=False):
    """Effectif projeté de `season` pour chaque équipe LEC / ERL1 de `season - 1`."""
    board = base_rosters(games, season - 1)
    # Équipes renommées / remplacées (ex : Dignitas -> OpTic Gaming en LCS 2027)
    renames = team_changes(season)
    board["former_team"] = board["team"].map(lambda t: t if t in renames else "")
    board["team_source"] = board["team"].map(lambda t: renames[t][1] if t in renames else "")
    board["team"] = board["team"].map(lambda t: renames[t][0] if t in renames else t)
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
    # Rumeurs / transferts sous l'ancien nom de l'équipe -> nouveau nom
    rename = lambda t: renames[t][0] if t in renames else t
    rumors["team_start"] = rumors["team_start"].map(rename)
    rumors["team_end"] = rumors["team_end"].map(rename)
    changes["team"] = changes["team"].map(rename)

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

    # Plusieurs joueurs pour le même poste dans le même article (ex : Sheep du
    # 10/11, « Shopify Rebellion envisage Vulcan ou Isles ») : une piste pour le
    # poste, pas un transfert de chacun. Un article plus récent tranche.
    rumors["role_n"] = rumors["role"].map(_role)
    article = rumors["link"].fillna(rumors["source"]) if "link" in rumors else rumors["source"]
    rumors["src_key"] = (rumors["day"] + "|" + rumors["team_end"].astype(str) + "|"
                         + rumors["role_n"].astype(str) + "|" + article.astype(str))
    n_players = (rumors[rumors["team_end"] != rumors["team_start"]]
                 .groupby("src_key")["player"].nunique())
    shortlist = set(n_players[n_players > 1].index)
    for key in shortlist:
        grp = rumors[rumors["src_key"] == key]
        team, role = grp["team_end"].iloc[0], grp["role_n"].iloc[0]
        slot = (board["team"] == team) & (board["role"] == role)
        names = " ou ".join(sorted({str(p).split(" (")[0] for p in grp["player"]}))
        board.loc[slot, "options"] = f"piste : {names} · {grp['source'].iloc[0]}"

    for _, r in rumors.iterrows():
        role = _role(r["role"])
        if not role or r["src_key"] in shortlist:
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
    dest_of = {}     # dernière destination connue de chaque joueur
    leave_info = {}  # dernier départ annoncé de chaque joueur : (statut, source, lien)
    board["url"] = None  # lien vers l'article / le post qui annonce le mouvement
    cols = ["after", "status", "source", "url"]

    def vacate(idx, player, info):
        """Libère un poste. Si le joueur n'en était pas le titulaire de départ (une
        rumeur l'y avait placé), le poste reprend le départ de son titulaire :
        ex. Vitality jungle = départ de Lyncas, pas le lien de l'article Yukino."""
        before = board.at[idx, "before"]
        if isinstance(before, str) and before != player:
            info = leave_info.get(before, ("départ", "", None))
        board.loc[idx, cols] = [None, *info]

    for date, _, direction, player, team, role, status, source, dest, url in events:
        if dest:
            dest_of[player] = dest
        elif direction == "Join":
            dest_of[player] = team
        if direction in ("Leave", "Out"):
            info = (f"départ ({status})", source, url)
            leave_info[player] = info
            scope = board.index if direction == "Out" else board.index[board["team"] == team]
            # poste qu'il occupe (le sien, ou celui où une rumeur l'avait placé)
            for idx in scope[board.loc[scope, "after"] == player]:
                vacate(idx, player, info)
            # son poste d'origine déjà libéré : on garde l'annonce la plus récente
            # (ex : Naak Nako, tweet du 31/10 puis article Sheep du 17/11)
            for idx in scope[(board.loc[scope, "before"] == player) & board.loc[scope, "after"].isna()]:
                # ... sans repasser en « rumeur » un départ déjà officiel
                if "confirmé" in str(board.at[idx, "status"]) and status != "confirmé":
                    continue
                board.loc[idx, ["status", "source", "url"]] = list(info)
            continue
        slot = (board["team"] == team) & (board["role"] == role)
        if not slot.any():
            continue
        # un joueur ne peut être qu'à un seul endroit
        leave_info[player] = (f"parti ({status})", source, url)
        for idx in board.index[(board["after"] == player) & ~slot]:
            vacate(idx, player, (f"parti ({status})", source, url))
        label = status if direction == "Join" else f"reste ({status})"
        board.loc[slot, cols] = [player, label, source, url]

    # Piste tranchée depuis (ex : « Vulcan ou Isles », puis Vulcan annoncé) : note retirée
    for idx in board.index[board["options"].astype(str).str.startswith("piste : ")]:
        after = board.at[idx, "after"]
        if isinstance(after, str) and after.split(" (")[0] in board.at[idx, "options"]:
            board.at[idx, "options"] = ""

    # Destination des joueurs qui quittent leur équipe (si une rumeur ou un
    # transfert la donne) : ex. Yukino -> FlyQuest, Carzzy -> Movistar KOI
    retired = {p for p, d in dest_of.items() if str(d).lower().startswith("retire")}
    board["retired"] = board["before"].isin(retired)
    dest_of = {p: d for p, d in dest_of.items() if d and d not in NOT_A_TEAM}
    board["to"] = [
        dest_of.get(b) if isinstance(b, str) and dest_of.get(b) != t
        and not ((board["team"] == t) & (board["after"] == b)).any() else None
        for b, t in zip(board["before"], board["team"])]

    # Fins de contrat (GCD) : joueurs restés "inchangé" dont le contrat est fini
    board = apply_contract_ends(board, season)
    coaches = build_coaches(board, changes, rumors, season, refresh)
    board = add_contract_ends(board, season)

    # Corrections manuelles (prioritaires). Colonnes facultatives : status
    # (« rumeur » ou « officiel ») et source (lien de l'article / du post)
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
            player = canon(m[col]) if m[col] else None
            kind = str(m.get("status", "")).strip().lower()
            status = "rumeur" if kind.startswith("rum") else "confirmé" if kind.startswith("off") else "manuel"
            src = str(m.get("source", "")).strip()
            url = src if src.startswith("http") else None
            site = ("Sheep Esports" if "sheepesports" in src else "X" if "x.com" in src or "twitter" in src
                    else "saisie manuelle")
            if player:
                # il n'est plus ailleurs ; son ancien poste indique où il part
                for idx in board.index[(board["after"] == player) & ~slot]:
                    board.loc[idx, ["after", "status", "source", "url"]] = [None, f"départ ({status})", site, url]
                board.loc[(board["before"] == player) & ~slot, "to"] = m["team"]
                options.pop(player, None)  # piste tranchée
                short = player.split(" (")[0]
                notes = board["options"].astype(str).str.contains(f"piste : {short}", regex=False)
                board.loc[notes, "options"] = ""
            board.loc[slot, ["after", "status", "source", "url"]] = [player, status, site, url]
    board.attrs["undecided"] = options
    board.attrs["coaches"] = coaches
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
