"""Historique du marché des transferts, pour les chances « en direct » du site
(montée et maintien corrigés par les places encore libres au mercato).

- Destinations : quand un joueur décroche une place en 1re division, dans quelle
  région ? Selon la région où il jouait et son origine (résident de sa région, ou
  import coréen, chinois, européen...). Un Coréen basé en Europe part souvent en
  LEC, LCS ou LCK ; un Européen ne va presque jamais en LCK ou en LPL.
- Rotation : combien de places de titulaire changent de joueur chaque année, par
  région et par poste (l'offre « normale » d'un mercato).

Bloc « market » de web/data/promotion_model.json (python scout.py modele).
"""
import json
import os
from collections import Counter, defaultdict

from scouting.model import promotion_model as pm
from scouting.model import stay_model as sm

ORIGIN_OF_HOME = {"eu": "EMEA", "na": "AMER", "br": "AMER", "kr": "KR", "cn": "LPL", "lcp": "LCP"}
SMOOTH = 5.0  # poids de la répartition moyenne de la région (peu de cas pour certaines origines)
TOP_GAMES = 3


def origin_key(name, country, region):
    """« home » si résident de la région où il joue, sinon son origine (KR, LPL, EMEA, AMER, LCP)."""
    if pm.resident(name, country, region):
        return "home"
    return pm.origin(country) or "home"


def build():
    tops = {}  # (saison, pseudo, poste) -> (région, équipe, parties) : place en 1re division
    seen = []  # (région, saison, pseudo, poste, pays, nom, était en 1re division ici)
    team_main = defaultdict(dict)  # (région, saison) -> (équipe, poste) -> (pseudo, parties)
    for region in pm.REGIONS:
        path = sm.players_file(region)
        if not os.path.exists(path):
            continue
        players = json.load(open(path, encoding="utf-8"))
        guests = sm.guest_teams(players)
        for v in players.values():
            n = pm.norm_name(v["name"])
            by = defaultdict(list)
            for l in v["lines"]:
                if l["tier"] == "LEC" and l["team"] in guests.get(l["season"], ()):
                    continue
                by[l["season"]].append(l)
            for s, ls in by.items():
                top = [l for l in ls if l["tier"] == "LEC"]
                g = sum(l["games"] for l in top)
                main = max(ls, key=lambda l: l["games"])
                if g >= TOP_GAMES:
                    t = max(top, key=lambda l: l["games"])
                    tops[(s, n, t["role"])] = (region, t["team"], g)
                    cur = team_main[(region, s)].get((t["team"], t["role"]))
                    if not cur or t["games"] > cur[1]:
                        team_main[(region, s)][(t["team"], t["role"])] = (n, t["games"])
                if sum(l["games"] for l in ls if l["tier"] in ("LEC", "ERL1", "ERL2")) >= 5:
                    seen.append((region, s, n, main["role"], v.get("country"), v["name"], g >= TOP_GAMES))

    # Destinations des joueurs qui obtiennent une place en 1re division (nouvelle place :
    # pas dans la même équipe de 1re division l'année d'avant)
    dest = defaultdict(Counter)
    region_all = defaultdict(Counter)
    for region, s, n, role, country, name, was_top in seen:
        hit = tops.get((s + 1, n, role))
        if not hit:
            continue
        if (hit[0], "lcp") == ("lcp", "lcp") and s + 1 < 2025:
            continue  # pas de vraie 1re division LCP avant 2025
        before = tops.get((s, n, role))
        if before and before[:2] == hit[:2]:
            continue  # reste dans son équipe : pas un transfert
        key = f"{region}|{origin_key(name, country, region)}|{'top' if was_top else 'low'}"
        dest[key][hit[0]] += 1
        region_all[f"{region}|{'top' if was_top else 'low'}"][hit[0]] += 1

    def shares(counter, prior=None):
        tot = sum(counter.values())
        keys = set(counter) | set(prior or {})
        out = {}
        for r in keys:
            num = counter.get(r, 0) + SMOOTH * (prior or {}).get(r, 0)
            out[r] = num / (tot + (SMOOTH if prior else 0))
        z = sum(out.values()) or 1
        return {r: round(x / z, 4) for r, x in sorted(out.items(), key=lambda x: -x[1]) if x / z >= 0.002}

    base = {k: shares(c) for k, c in region_all.items()}
    destinations = {}
    for key, c in dest.items():
        region, _, lvl = key.split("|")
        destinations[key] = {"n": sum(c.values()), "to": shares(c, base.get(f"{region}|{lvl}"))}
    for k, sh in base.items():
        region, lvl = k.split("|")
        destinations.setdefault(f"{region}|home|{lvl}", {"n": sum(region_all[k].values()), "to": sh})

    # Rotation : places (équipe, poste) dont le titulaire change d'une saison à l'autre
    turnover = defaultdict(lambda: defaultdict(list))
    for (region, s), slots in team_main.items():
        prev = team_main.get((region, s - 1))
        if not prev or s < 2023:
            continue
        # équipe renommée (même effectif, nouveau nom) : rattachée à son ancien nom
        prev_teams = defaultdict(set)
        for (team, role), (n, _) in prev.items():
            prev_teams[team].add(n)
        cur_teams = defaultdict(set)
        for (team, role), (n, _) in slots.items():
            cur_teams[team].add(n)
        alias = {}
        for team, names in cur_teams.items():
            if team in prev_teams:
                continue
            best = max(prev_teams, key=lambda t: len(prev_teams[t] & names), default=None)
            if best and len(prev_teams[best] & names) >= 3:
                alias[team] = best
        changed = Counter()
        for (team, role), (n, _) in slots.items():
            p = prev.get((alias.get(team, team), role))
            if not p or p[0] != n:
                changed[role] += 1
        for role in pm.ROLES:
            turnover[region][role].append(changed.get(role, 0))
    rotation = {r: {role: round(sum(v) / len(v), 2) for role, v in roles.items()} for r, roles in turnover.items()}

    print(f"  Marché : {sum(sum(c.values()) for c in dest.values())} transferts vers la 1re division appris ; "
          f"rotation moyenne par poste en Europe : {rotation.get('eu')}")
    return {"destinations": destinations, "rotation": rotation}
