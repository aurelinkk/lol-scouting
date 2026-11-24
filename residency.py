"""Résidence légale des joueurs (champs « Residency » et « Nationality » de
Leaguepedia), distincte de la nationalité principale : un Coréen installé en Amérique du Nord (CoreJJ, Impact) est
résident pour la LCS, un Américain résident européen (Busio) n'est pas un
import en LEC. Sert aux places d'import (Besoins, tags d'origine) et au modèle
de montée.

- Cache : data/raw/residency.csv (une ligne par joueur, complété à chaque lancement)
- Site : web/data/residency_lp.json, seulement les joueurs dont la résidence
  ne correspond pas à leur nationalité (le reste se déduit de la nationalité)

Usage : python residency.py [--refresh]
"""
import argparse
import glob
import json
import os

import pandas as pd

from leaguepedia import cargo_query

CACHE = "data/raw/residency.csv"
OUT = "web/data/residency_lp.json"
BATCH = 60

# Résidence Leaguepedia -> régions du site où le joueur est résident
RESIDENCY_REGIONS = {
    "EMEA": ["eu"], "Europe": ["eu"], "Turkey": ["eu"], "CIS": ["eu"],
    "North America": ["na"],
    "Brazil": ["br"],
    # Amérique latine : LLA puis LTA Sud ; résidents aussi en LCS (exception 2026-2027)
    "Latin America": ["br", "na"], "LAS": ["br", "na"], "LAN": ["br", "na"],
    "Korea": ["kr"], "China": ["cn"],
    "Asia Pacific": ["lcp"], "SEA": ["lcp"], "LMS": ["lcp"], "Oceania": ["lcp"],
    "Vietnam": ["lcp"], "Japan": ["lcp"], "PCS": ["lcp"],
}
NORTH_AMERICA = {"United States", "Canada"}


def regions_of(residency, country):
    """Régions où le joueur est résident, ou None si la résidence est inconnue."""
    if residency == "Americas":  # ancienne zone LTA : selon le pays
        if country in NORTH_AMERICA:
            return ["na"]
        return ["br"] if country == "Brazil" else ["br", "na"]
    return RESIDENCY_REGIONS.get(residency)


def player_names():
    """Joueurs connus du site : fiches exportées et parties téléchargées."""
    names = set()
    for path in glob.glob("web/data/players.json") + glob.glob("web/data/*/players.json"):
        with open(path, encoding="utf-8") as f:
            names |= {p["name"] for p in json.load(f).values()}
    for path in glob.glob("data/pro_games_*.csv") + glob.glob("data/*/pro_games_*.csv"):
        try:
            names |= set(pd.read_csv(path, usecols=["player"])["player"].dropna())
        except (ValueError, pd.errors.EmptyDataError):
            pass
    return sorted(n for n in names if isinstance(n, str) and n)


def fetch(refresh=False):
    cached = pd.read_csv(CACHE, keep_default_na=False) if os.path.exists(CACHE) and not refresh else \
        pd.DataFrame(columns=["player", "country", "nationality", "residency", "former"])
    todo = sorted(set(player_names()) - set(cached["player"]))
    if todo:
        print(f"  Résidence Leaguepedia : {len(todo)} joueurs à récupérer")
    rows = []
    for i in range(0, len(todo), BATCH):
        chunk = todo[i:i + BATCH]
        quoted = ",".join("'" + n.replace("'", "\\'") + "'" for n in chunk)
        got = cargo_query(tables="Players=P",
                          fields="P.OverviewPage=player,P.Country=country,P.Nationality=nationality,"
                                 "P.Residency=residency,P.ResidencyFormer=former",
                          where=f"P.OverviewPage IN ({quoted})", pause=0.5)
        found = {g["player"] for g in got}
        rows += got + [{"player": n, "country": "", "nationality": "", "residency": "", "former": ""}
                       for n in chunk if n not in found]
        if (i // BATCH) % 20 == 19:
            print(f"    {i + BATCH}/{len(todo)}")
    if rows:
        cached = pd.concat([cached, pd.DataFrame(rows)], ignore_index=True).drop_duplicates("player", keep="last")
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        cached.to_csv(CACHE, index=False)
    return cached


def nationality_home(country):
    """Région « naturelle » d'après la nationalité (même logique que le site)."""
    from promotion_model import HOME, origin  # import local : évite un import circulaire
    o = origin(country)
    if o is None:
        return None
    if o == "AMER":
        return ["na"] if country in NORTH_AMERICA else ["br"] if country == "Brazil" else ["br", "na"]
    return [r for r, h in HOME.items() if h == o and r not in ("na", "br")]


def resident_regions(row):
    """Régions où le joueur est résident : sa résidence officielle Leaguepedia, plus
    chaque pays dont il a la nationalité (double nationalité : Busio, américain et
    polonais, est résident en LCS comme en LEC). None si rien n'est connu."""
    regs = set(regions_of(row.get("residency", ""), row.get("country", "")) or [])
    nats = [n.strip() for n in str(row.get("nationality", "") or "").split(",") if n.strip()]
    for n in nats or ([row["country"]] if row.get("country") else []):
        regs |= set(nationality_home(n) or [])
    return sorted(regs) or None


def main(refresh=False):
    df = fetch(refresh).fillna("")
    exceptions = {}
    for _, r in df.iterrows():
        regs = resident_regions(r)
        if regs and regs != sorted(nationality_home(r["country"]) or []):
            exceptions[r["player"]] = "+".join(regs)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(dict(sorted(exceptions.items())), f, ensure_ascii=False, separators=(",", ":"))
    known = sum(1 for _, r in df.iterrows() if regions_of(r["residency"], r["country"]))
    if "Busio" in set(df["player"]):
        print(f"  ex : Busio -> {exceptions.get('Busio', 'selon sa nationalité')}")
    print(f"  Résidence : {known}/{len(df)} joueurs connus, {len(exceptions)} différente de la nationalité -> {OUT}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--refresh", action="store_true")
    main(parser.parse_args().refresh)
