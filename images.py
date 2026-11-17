"""URLs des photos de joueurs et des logos d'équipes sur Leaguepedia.

On ne télécharge pas les images : on récupère seulement leur adresse sur le
CDN de Leaguepedia, que la web app affiche directement.
Résultats en cache dans data/raw/images.json (data/na/raw/ pour la NA).
"""
import json
import os
import re

from leaguepedia import API_URL, cargo_query, session
from region import RAW_DIR, region_sql

CACHE = f"{RAW_DIR}/images.json"  # un cache par région (data/raw, data/na/raw)
THUMB_WIDTH = 240


def _load_cache():
    if os.path.exists(CACHE):
        with open(CACHE, encoding="utf-8") as f:
            return json.load(f)
    return {"files": {}, "player_files": {}, "team_files": {}}


def _save_cache(cache):
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False)


def _year(text):
    years = re.findall(r"20\d\d", text or "")
    return max(map(int, years)) if years else 0


def player_files(min_year):
    """Photo la plus récente de chaque joueur (tournois de la région depuis min_year)."""
    rows = cargo_query(
        tables="PlayerImages=PI,Tournaments=T",
        join_on="PI.Tournament=T.OverviewPage",
        fields="PI.Link=player,PI.FileName=file,PI.Team=team,PI.Tournament=tournament",
        where=f"T.Year>={min_year} AND {region_sql('T')}",
    )
    best = {}
    for r in rows:
        key = (_year(r["tournament"]), _year(r["file"]), r["file"])
        if r["player"] not in best or key > best[r["player"]][0]:
            best[r["player"]] = (key, r["file"])
    return {p: f for p, (_, f) in best.items()}


def team_files():
    rows = cargo_query(tables="Teams=Te", fields="Te.Name=team,Te.Image=file",
                       where=f"{region_sql('Te')} AND Te.Image IS NOT NULL")
    return {r["team"]: r["file"] for r in rows if r["file"]}


def resolve_urls(filenames, cache):
    """Nom de fichier -> URL de la miniature (par lots de 50)."""
    todo = sorted({f for f in filenames if f and f not in cache["files"]})
    for i in range(0, len(todo), 50):
        batch = todo[i:i + 50]
        data = session.get(API_URL, params={
            "action": "query", "format": "json", "prop": "imageinfo",
            "iiprop": "url", "iiurlwidth": THUMB_WIDTH,
            "titles": "|".join("File:" + f for f in batch),
        }, timeout=60).json()
        query = data.get("query", {})
        # MediaWiki normalise les titres (ex : "_" -> " ") : on garde la correspondance
        normalized = {n["to"]: n["from"] for n in query.get("normalized", [])}
        for page in query.get("pages", {}).values():
            title = normalized.get(page.get("title"), page.get("title", ""))
            name = title.removeprefix("File:")
            info = (page.get("imageinfo") or [{}])[0]
            cache["files"][name] = info.get("thumburl") or info.get("url")
        for f in batch:  # fichiers introuvables : on note None pour ne pas redemander
            cache["files"].setdefault(f, None)
        print(f"  images : {min(i + 50, len(todo))}/{len(todo)}")
    return cache


def get_image_urls(min_year=2024, refresh=False):
    """Renvoie (photos par joueur, logos par équipe), sous forme d'URLs."""
    cache = {"files": {}, "player_files": {}, "team_files": {}} if refresh else _load_cache()
    if not cache["player_files"]:
        print("Photos des joueurs (Leaguepedia)...")
        cache["player_files"] = player_files(min_year)
    if not cache["team_files"]:
        print("Logos des équipes (Leaguepedia)...")
        cache["team_files"] = team_files()
    cache = resolve_urls(list(cache["player_files"].values())
                         + list(cache["team_files"].values()), cache)
    _save_cache(cache)

    photos = {p: cache["files"].get(f) for p, f in cache["player_files"].items()}
    logos = {t: cache["files"].get(f) for t, f in cache["team_files"].items()}
    return ({k: v for k, v in photos.items() if v}, {k: v for k, v in logos.items() if v})


if __name__ == "__main__":
    photos, logos = get_image_urls()
    print(f"{len(photos)} photos, {len(logos)} logos")
