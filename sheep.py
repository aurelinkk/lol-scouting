"""Rumeurs Sheep Esports via le flux RSS de Google News.

Sheep Esports publie ses scoops mercato avec des titres réguliers :
    « Sources: Karis set to join NAVI for the 2027 LEC season »
    « Nongshim RedForce extend Kingen, Calix and bon0 contracts until 2028 »
Le site de Sheep bloque les robots (Cloudflare) : on ne le contacte jamais. On lit
seulement les titres indexés par Google News (flux RSS public), souvent quelques
minutes après la publication, bien avant leur saisie sur Leaguepedia.

Chaque titre reconnu devient une ligne au format des rumeurs Leaguepedia
(RosterRumors) : le moteur du mercato applique ensuite les mêmes règles. Seuls
les titres dont le joueur est connu (nos données, toutes régions) et l'équipe
identifiée sont gardés ; les autres jeux (Valorant, CS...) sont ignorés.

Même logique côté site : web/lib/mercato/sheep.ts.
"""
import json
import os
import re
import time
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

import requests

from region import ALL_REGIONS, web_data_dir

RSS = "https://news.google.com/rss/search"
CACHE = "data/raw/sheep_news.json"  # commun aux régions, cumulatif
MAX_AGE_MINUTES = 30

OTHER_GAMES = re.compile(
    r"\b(VCT|Valorant|CS2|Counter-Strike|Rocket League|Dota|Game Changers|Overwatch|Fortnite|"
    r"Apex|Rainbow|R6|Call of Duty|PUBG|Mobile Legends|TFT|Teamfight|Marvel Rivals|Deadlock)\b", re.I)

# Abréviations courantes dans les titres -> nom Leaguepedia
TEAM_ALIASES = {
    "navi": "Natus Vincere", "kc": "Karmine Corp", "koi": "Movistar KOI", "mkoi": "Movistar KOI",
    "gx": "GIANTX", "th": "Team Heretics", "heretics": "Team Heretics", "bds": "Team BDS",
    "sk": "SK Gaming", "vitality": "Team Vitality", "vit": "Team Vitality", "fnc": "Fnatic",
    "g2": "G2 Esports", "c9": "Cloud9", "tl": "Team Liquid", "liquid": "Team Liquid",
    "fly": "FlyQuest", "hle": "Hanwha Life Esports", "hanwha": "Hanwha Life Esports",
    "dk": "Dplus Kia", "dplus": "Dplus Kia", "kt": "KT Rolster", "ns": "Nongshim RedForce",
    "nongshim": "Nongshim RedForce", "shopify": "Shopify Rebellion", "sr": "Shopify Rebellion",
    "drx": "Kiwoom DRX", "fearx": "BNK FEARX", "brion": "HANJIN BRION", "soopers": "DN SOOPers",
    # LPL, LCP, CBLOL
    "blg": "Bilibili Gaming",
    "jdg": "JD Gaming",
    "tes": "Top Esports",
    "wbg": "Weibo Gaming",
    "lng": "LNG Esports",
    "nip": "Ninjas in Pyjamas.CN",
    "edg": "EDward Gaming",
    "ig": "Invictus Gaming",
    "fpx": "FunPlus Phoenix",
    "rng": "Royal Never Give Up",
    "omg": "Oh My God",
    "al": "Anyone's Legend",
    "up": "Ultra Prime",
    "lgd": "LGD Gaming",
    "tt": "ThunderTalk Gaming",
    "cfo": "CTBC Flying Oyster",
    "gam": "GAM Esports",
    "psg": "PSG Talon",
    "shg": "Fukuoka SoftBank HAWKS gaming",
    "dfm": "DetonatioN FocusMe",
    "tsw": "Team Secret Whales",
    "mvk": "MVK Esports",
    "pain": "paiN Gaming",
    "png": "paiN Gaming",
    "loud": "LOUD",
    "furia": "FURIA",
    "red": "RED Canids",
    "vks": "Vivo Keyd Stars",
    "keyd": "Vivo Keyd Stars",
    "fluxo": "Fluxo W7M",
    "lev": "Leviatán",
    "isg": "Isurus Estral",
}

_END = r"(?=\s+(?:for|in|ahead|as|until|on|after|from|following|this|next)\b|\s*[,:;(]|\s+-\s|$)"
_PRE = r"(?:(?:is|are)\s+)?(?:(?:set|expected|poised|likely|close|about|tipped|ready|due)\s+to\s+|will\s+|to\s+)?"
PATTERNS = [
    # joueur -> équipe
    ("in", re.compile(r"^(?P<p>.+?)\s+" + _PRE + r"(?:join|joins|re-?sign(?:s)?\s+with|sign(?:s)?\s+with|"
                      r"stay(?:s)?\s+with|remain(?:s)?\s+with|extend(?:s)?\s+with|return(?:s)?\s+to|"
                      r"move(?:s)?\s+to|head(?:s)?\s+to|commit(?:s)?\s+to)\s+(?P<t>.+?)" + _END, re.I)),
    ("in", re.compile(r"^(?P<p>.+?)\s+reach(?:es)?\s+(?:an?\s+)?(?:[\w-]+\s+){0,3}(?:agreement|deal|terms)\s+"
                      r"with\s+(?P<t>.+?)" + _END, re.I)),
    # équipe -> joueurs
    ("in", re.compile(r"^(?P<t>.+?)\s+" + _PRE + r"(?:sign|signs|re-?sign|re-?signs|extend|extends|add|adds|"
                      r"acquire|acquires|bring(?:s)?\s+back|promote|promotes|recruit|recruits|welcome|welcomes|"
                      r"pick(?:s)?\s+up|lock(?:s)?\s+in)\s+(?P<p>.+?)"
                      r"(?=\s+(?:for|until|ahead|as|in|on|to|from|through|after)\b|\s+contracts?\b|\s*[,:;(]\s*(?!\s*\w+\s*(?:,|and\b))|$)", re.I)),
    # départs
    ("out", re.compile(r"^(?P<p>.+?)\s+" + _PRE + r"(?:leave|leaves|depart|departs|part(?:s)?\s+ways\s+with|"
                       r"split(?:s)?\s+from|exit(?:s)?)\s+(?P<t>.+?)" + _END, re.I)),
    ("out", re.compile(r"^(?P<t>.+?)\s+" + _PRE + r"(?:part(?:s)?\s+ways\s+with|release(?:s)?|bench(?:es)?|"
                       r"drop(?:s)?)\s+(?P<p>.+?)" + _END, re.I)),
]


def _norm(s):
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


def _short(name):
    return re.sub(r"\s*\(.*\)$", "", str(name)).strip()


def clean_title(title):
    title = re.sub(r"\s+-\s+Sheep Esports\s*$", "", title).strip()
    return re.sub(r"^(?:sources?|report|exclusive|breaking)\s*:\s*", "", title, flags=re.I).strip()


def parse_title(title):
    """Titre -> (sens "in" / "out", [noms de joueurs], texte de l'équipe) ou None."""
    if OTHER_GAMES.search(title):
        return None
    t = clean_title(title)
    for direction, rx in PATTERNS:
        m = rx.match(t)
        if not m:
            continue
        players = [p.strip(" .'\"") for p in re.split(r",\s*|\s+and\s+|\s*&\s*", m["p"]) if p.strip()]
        return direction, players, m["t"].strip(" .'\"")
    return None


class Index:
    """Joueurs et équipes connus (toutes régions) pour valider un titre."""

    def __init__(self, extra_players=None, extra_teams=()):
        self.players = {}  # nom en minuscules -> [(nom, poste, équipe), ...] (homonymes possibles)
        teams = set(extra_teams)
        for r in ALL_REGIONS:
            d = web_data_dir(r)
            try:
                with open(f"{d}/players.json", encoding="utf-8") as f:
                    for p in json.load(f).values():
                        self._add(p["name"], p.get("role"), p.get("team"))
                        if p.get("team"):
                            teams.add(p["team"])
            except FileNotFoundError:
                pass
            try:
                with open(f"{d}/mercato.json", encoding="utf-8") as f:
                    for t in json.load(f)["teams"]:
                        teams.add(t["team"])
                        if t.get("former_team"):
                            teams.add(t["former_team"])
            except FileNotFoundError:
                pass
        # priorité aux données de la région analysée (effectif actuel)
        for name, (role, team) in (extra_players or {}).items():
            self._add(name, role, team, force=True)
        self.teams = {}
        for t in sorted(teams, key=len):
            base = re.sub(r"\s*\(.*\)$", "", t)  # « LYON (2024 American Team) » -> « LYON »
            for key in {_norm(t), _norm(base), _norm(re.sub(r"\b(esports?|gaming|team|club)\b", "", base, flags=re.I))}:
                if key and key not in self.teams:
                    self.teams[key] = t

    def _add(self, name, role, team, force=False):
        for key in {str(name).lower(), _short(name).lower()}:
            hits = self.players.setdefault(key, [])
            if any(h[0] == name for h in hits):
                if force:  # effectif actuel de la région analysée : prioritaire
                    hits[:] = [(name, role, team)] + [h for h in hits if h[0] != name]
                continue
            if force:
                hits.insert(0, (name, role, team))
            else:
                hits.append((name, role, team))

    def player(self, text, team=None):
        """Joueur cité dans un titre ; entre homonymes, celui déjà lié à l'équipe."""
        text = text.strip()
        for cand in (text, text.split()[-1] if text.split() else text):
            hits = self.players.get(cand.lower())
            if hits:
                return next((h for h in hits if team and h[2] == team), hits[0])
        return None

    def team(self, text):
        key = _norm(text)
        if key in TEAM_ALIASES:
            return TEAM_ALIASES[key]
        if key in self.teams:
            return self.teams[key]
        stripped = _norm(re.sub(r"\b(esports?|gaming|team|club)\b", "", text, flags=re.I))
        return self.teams.get(stripped)


def fetch_news(window="7d", refresh=False):
    """Articles Sheep Esports indexés par Google News, cumulés dans un cache local."""
    cache = {}
    if os.path.exists(CACHE):
        with open(CACHE, encoding="utf-8") as f:
            cache = json.load(f)
    fresh = os.path.exists(CACHE) and time.time() - os.path.getmtime(CACHE) < MAX_AGE_MINUTES * 60
    if fresh and not refresh:
        return list(cache.values())
    try:
        res = requests.get(RSS, params={"q": f"site:sheepesports.com when:{window}", "hl": "en-US",
                                        "gl": "US", "ceid": "US:en"},
                           headers={"User-Agent": "lol-scouting (outil de scouting privé)"}, timeout=20)
        res.raise_for_status()
        root = ET.fromstring(res.content)
    except Exception as e:  # pas bloquant : Leaguepedia reste la source principale
        print(f"  Sheep Esports (Google News) indisponible : {e}")
        return list(cache.values())
    for item in root.iter("item"):
        guid = item.findtext("guid") or item.findtext("link")
        try:
            date = parsedate_to_datetime(item.findtext("pubDate")).strftime("%Y-%m-%d")
        except Exception:
            continue
        cache[guid] = {"title": item.findtext("title") or "", "date": date, "link": item.findtext("link")}
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=0)
    return list(cache.values())


def sheep_rumors(since, index, news=None):
    """Lignes au format RosterRumors (date, player, team_start, team_end, role, ...)."""
    rows = []
    for n in news if news is not None else fetch_news():
        if n["date"] < since:
            continue
        parsed = parse_title(n["title"])
        if not parsed:
            continue
        direction, names, team_text = parsed
        team = index.team(team_text)
        if not team and len(names) == 1 and index.team(names[0]) and index.player(team_text):
            # « Fnatic part ways with Razork » : équipe et joueur dans l'autre sens
            team, names = index.team(names[0]), [team_text]
        if not team:
            continue  # VARREL, Paper Rex... : équipe inconnue -> titre ignoré
        hits = [h for h in (index.player(p, team) for p in names) if h]
        for name, role, current in hits:
            if direction == "in":
                start, end = (current or "Unknown"), team
            else:
                start, end = team, "Free Agent"
            rows.append({"date": n["date"], "player": name, "team_start": start, "team_end": end,
                         "role": role, "status": "Rumor", "not_happening": 0,
                         "source": "Sheep Esports", "link": n["link"], "title": clean_title(n["title"])})
    return rows


if __name__ == "__main__":
    idx = Index()
    for r in sheep_rumors("2000-01-01", idx, fetch_news(refresh=True)):
        print(r["date"], r["player"], r["role"], "|", r["team_start"], "->", r["team_end"], "|", r["title"])
