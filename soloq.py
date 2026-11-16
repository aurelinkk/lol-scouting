"""SoloQ EUW : relevé du ladder, lien avec les pros, profil des non-pros.

Usage (clé RIOT_API_KEY dans .env) :
    python soloq.py snapshot              # relevé du top 1000 EUW + Riot ID + lien pros
    python soloq.py snapshot --top 500
    python soloq.py profiles --top 300    # poste principal / champions des non-pros
    python soloq.py show                  # dernier relevé dans le terminal

Lancer `snapshot` régulièrement (ex : une fois par semaine) : la progression
de LP et le volume de parties entre deux relevés montrent qui grind.

Fichiers (dans data/soloq/, non versionnés) :
    snapshots/AAAA-MM-JJ.csv   un relevé du ladder
    accounts.csv               cache puuid -> Riot ID
    profiles.csv               cache poste / champions (non-pros)
    matches/                   cache des parties lues
Fichier versionné : soloq_accounts.csv (player,riot_id) pour lier à la main
un pro à son compte (ex : "Panda (Hamza Siala),KCB Panda#EUW").
"""
import argparse
import datetime
import json
import os
import re
import time
import unicodedata

import pandas as pd

import riot_api

DIR = "data/soloq"
SNAP_DIR = os.path.join(DIR, "snapshots")
ACCOUNTS = os.path.join(DIR, "accounts.csv")
PROFILES = os.path.join(DIR, "profiles.csv")
MATCH_DIR = os.path.join(DIR, "matches_v2")  # v2 : gold, dégâts, vision, équipe
MANUAL_LINKS = "soloq_accounts.csv"

TIER_ORDER = {"CHALLENGER": 0, "GRANDMASTER": 1, "MASTER": 2}
ROLE_MAP = {"TOP": "Top", "JUNGLE": "Jungle", "MIDDLE": "Mid", "BOTTOM": "Bot", "UTILITY": "Support"}


# --------------------------------------------------------------------------
# Relevé du ladder
# --------------------------------------------------------------------------

def fetch_ladder(top=1000):
    rows = []
    for tier in ("challenger", "grandmaster", "master"):
        entries = riot_api.get_apex_league(tier)
        print(f"  {tier} : {len(entries)} joueurs")
        for e in entries:
            rows.append({
                "puuid": e.get("puuid"), "tier": tier.upper(), "lp": e.get("leaguePoints", 0),
                "wins": e.get("wins", 0), "losses": e.get("losses", 0),
                "hot_streak": e.get("hotStreak", False), "inactive": e.get("inactive", False),
            })
        if len(rows) >= top and tier != "challenger":
            break
    df = pd.DataFrame(rows).dropna(subset=["puuid"])
    df["tier_order"] = df["tier"].map(TIER_ORDER)
    df = df.sort_values(["tier_order", "lp"], ascending=[True, False]).head(top)
    df["rank"] = range(1, len(df) + 1)
    df["games"] = df["wins"] + df["losses"]
    df["winrate"] = (df["wins"] / df["games"].where(df["games"] > 0)).round(3)
    return df.drop(columns="tier_order")


def resolve_accounts(puuids):
    """puuid -> Riot ID (nom#tag), avec cache local."""
    cache = pd.read_csv(ACCOUNTS) if os.path.exists(ACCOUNTS) else pd.DataFrame(
        columns=["puuid", "game_name", "tag_line"])
    known = set(cache["puuid"])
    todo = [p for p in puuids if p not in known]
    if todo:
        print(f"  Riot ID à récupérer : {len(todo)} (environ {len(todo) * 1.2 / 60:.0f} min)")
    new = []
    for i, puuid in enumerate(todo, 1):
        acc = riot_api.get_account_by_puuid(puuid) or {}
        new.append({"puuid": puuid, "game_name": acc.get("gameName"), "tag_line": acc.get("tagLine")})
        if i % 50 == 0:
            print(f"    {i}/{len(todo)}")
            _save_accounts(cache, new)
    cache = _save_accounts(cache, new)
    return cache


def _save_accounts(cache, new):
    os.makedirs(DIR, exist_ok=True)
    out = pd.concat([cache, pd.DataFrame(new)], ignore_index=True).drop_duplicates("puuid", keep="last")
    out.to_csv(ACCOUNTS, index=False)
    return out


# --------------------------------------------------------------------------
# Lien avec les pros (comptes listés par Leaguepedia + saisie manuelle)
# --------------------------------------------------------------------------

def norm(name):
    """Nom comparable : sans accents, minuscules, sans espaces ni ponctuation."""
    text = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", text.lower())


def parse_soloq_ids(text):
    """Extrait les noms de comptes EUW du champ SoloqueueIds de Leaguepedia.

    Exemples : "'''EUW:''' AbbedaggÆ <br> Mein Königreich <br> '''NA:''' babadagge"
               "greasy hypernerd (EUW), mTouck (EUW)"
    """
    if not isinstance(text, str) or not text.strip():
        return []
    text = re.sub(r"'{2,}", "", text)
    names, region = [], "EUW"
    for part in re.split(r"<br\s*/?>|,|\n|;", text):
        part = part.strip()
        m = re.match(r"^([A-Z]{2,4})\s*:\s*(.*)$", part)
        if m:
            region, part = m.group(1), m.group(2)
        for chunk in re.split(r"\)\s+", part):
            chunk = chunk.strip()
            r = re.search(r"\((EUW|EUNE|NA|KR|TR|RU|BR|LAN|LAS|OCE|JP)\)?$", chunk)
            chunk_region = r.group(1) if r else region
            chunk = re.sub(r"\((EUW|EUNE|NA|KR|TR|RU|BR|LAN|LAS|OCE|JP)\)?$", "", chunk).strip()
            if chunk and chunk_region == "EUW":
                names.append(chunk)
    return names


def pro_accounts(season_files=None):
    """Table (player, name_key, tag_key) des comptes connus des pros."""
    from league_strength import available_seasons, load_season
    rows = []
    seasons = season_files or available_seasons()[-2:]
    for season in seasons:
        games = load_season(season)
        if games is None or "soloq_ids" not in games:
            continue
        for player, text in games.drop_duplicates("player")[["player", "soloq_ids"]].itertuples(index=False):
            for name in parse_soloq_ids(text):
                game, _, tag = name.partition("#")
                rows.append({"player": player, "name_key": norm(game), "tag_key": norm(tag)})
    if os.path.exists(MANUAL_LINKS):
        manual = pd.read_csv(MANUAL_LINKS)
        for player, riot_id in manual[["player", "riot_id"]].itertuples(index=False):
            game, _, tag = str(riot_id).partition("#")
            rows.append({"player": player, "name_key": norm(game), "tag_key": norm(tag), "manual": True})
    df = pd.DataFrame(rows, columns=["player", "name_key", "tag_key", "manual"])
    return df[df["name_key"] != ""].drop_duplicates()


def link_pros(ladder, accounts):
    df = ladder.merge(accounts, on="puuid", how="left")
    df["riot_id"] = df["game_name"].fillna("?") + "#" + df["tag_line"].fillna("?")
    df["name_key"] = df["game_name"].map(norm)
    df["tag_key"] = df["tag_line"].map(norm)

    pros = pro_accounts()
    # 1) correspondance exacte nom + tag (Riot ID complet), 2) nom seul s'il est unique
    full = pros[pros["tag_key"] != ""].drop_duplicates(["name_key", "tag_key"])
    df = df.merge(full[["name_key", "tag_key", "player"]], on=["name_key", "tag_key"], how="left")
    by_name = pros.drop_duplicates(["name_key", "player"])
    by_name = by_name[~by_name.duplicated("name_key", keep=False)][["name_key", "player"]]
    df = df.merge(by_name.rename(columns={"player": "player_by_name"}), on="name_key", how="left")
    df["pro"] = df["player"].fillna(df["player_by_name"])
    return df.drop(columns=["player", "player_by_name", "name_key", "tag_key"])


# --------------------------------------------------------------------------
# Évolution entre relevés
# --------------------------------------------------------------------------

def snapshots():
    if not os.path.isdir(SNAP_DIR):
        return []
    return sorted(f for f in os.listdir(SNAP_DIR) if f.endswith(".csv"))


def load_snapshot(name):
    return pd.read_csv(os.path.join(SNAP_DIR, name))


def with_trends(latest_name, days=(7, 30)):
    latest = load_snapshot(latest_name)
    latest_date = datetime.date.fromisoformat(latest_name[:10])
    for d in days:
        target = latest_date - datetime.timedelta(days=d)
        older = [s for s in snapshots() if datetime.date.fromisoformat(s[:10]) <= target]
        if not older:
            latest[f"lp_{d}d"] = float("nan")
            latest[f"games_{d}d"] = float("nan")
            continue
        old = load_snapshot(older[-1])[["puuid", "lp", "games"]]
        merged = latest[["puuid"]].merge(old, on="puuid", how="left")
        latest[f"lp_{d}d"] = (latest["lp"] - merged["lp"].values)
        latest[f"games_{d}d"] = (latest["games"] - merged["games"].values)
    return latest


# --------------------------------------------------------------------------
# Profil des non-pros (poste principal, champions)
# --------------------------------------------------------------------------

PARTICIPANT_FIELDS = ("puuid", "teamId", "teamPosition", "championName", "kills", "deaths",
                      "assists", "totalMinionsKilled", "neutralMinionsKilled", "goldEarned",
                      "totalDamageDealtToChampions", "visionScore", "win")


def match_details(match_id):
    os.makedirs(MATCH_DIR, exist_ok=True)
    path = os.path.join(MATCH_DIR, f"{match_id}.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    data = riot_api.get_match_by_id(match_id)
    if data:
        # On ne garde que l'utile pour limiter la place sur le disque
        slim = {"info": {"gameDuration": data["info"]["gameDuration"],
                         "gameStart": data["info"].get("gameStartTimestamp"),
                         "participants": [{k: p.get(k) for k in PARTICIPANT_FIELDS}
                                          for p in data["info"]["participants"]]}}
        with open(path, "w", encoding="utf-8") as f:
            json.dump(slim, f)
        return slim
    return None


def season_match_ids(puuid, since, max_matches):
    """Ids des parties classées solo depuis `since` (les plus récentes d'abord)."""
    start_time = int(pd.Timestamp(since).timestamp())
    ids, start = [], 0
    while len(ids) < max_matches:
        count = min(100, max_matches - len(ids))
        page = riot_api.get(f"{riot_api.REGION}/lol/match/v5/matches/by-puuid/{puuid}/ids",
                            params={"queue": 420, "start": start, "count": count,
                                    "startTime": start_time}) or []
        ids += page
        if len(page) < count:
            break
        start += count
    return ids


def build_profile(puuid, n_matches, since):
    rows = []
    for match_id in season_match_ids(puuid, since, n_matches):
        match = match_details(match_id)
        if not match:
            continue
        info = match["info"]
        minutes = info["gameDuration"] / 60
        if minutes < 10:  # remakes
            continue
        parts = info["participants"]
        me = next((p for p in parts if p["puuid"] == puuid), None)
        if not me:
            continue
        team = [p for p in parts if p.get("teamId") == me.get("teamId")]
        team_kills = sum(p["kills"] for p in team) or 1
        team_dmg = sum(p.get("totalDamageDealtToChampions") or 0 for p in team) or 1
        rows.append({
            "role": ROLE_MAP.get(me.get("teamPosition") or "", None),
            "champion": me["championName"], "win": me["win"],
            "kda": (me["kills"] + me["assists"]) / max(me["deaths"], 1),
            "deaths": me["deaths"],
            "cs_min": (me["totalMinionsKilled"] + me["neutralMinionsKilled"]) / minutes,
            "gold_min": (me.get("goldEarned") or 0) / minutes,
            "dpm": (me.get("totalDamageDealtToChampions") or 0) / minutes,
            "vision_min": (me.get("visionScore") or 0) / minutes,
            "kp": (me["kills"] + me["assists"]) / team_kills,
            "dmg_share": (me.get("totalDamageDealtToChampions") or 0) / team_dmg,
        })
    if not rows:
        return {"puuid": puuid, "recent_games": 0, "profiled_at": datetime.date.today().isoformat()}
    df = pd.DataFrame(rows)
    roles = df["role"].value_counts(normalize=True)
    champs = df["champion"].value_counts()
    out = {
        "puuid": puuid, "recent_games": len(df),
        "main_role": roles.index[0] if len(roles) else None,
        "main_role_share": round(float(roles.iloc[0]), 2) if len(roles) else None,
        "top_champions": ", ".join(f"{c} ({n})" for c, n in champs.head(3).items()),
        "champion_pool": int(champs.size),
        "recent_winrate": round(float(df["win"].mean()), 3),
        "profiled_at": datetime.date.today().isoformat(),
    }
    for stat in ("kda", "deaths", "cs_min", "gold_min", "dpm", "vision_min", "kp", "dmg_share"):
        out[f"recent_{stat}"] = round(float(df[stat].mean()), 3)
    return out


def update_profiles(top, n_matches, since=None, max_age_days=14):
    names = snapshots()
    if not names:
        raise SystemExit("Aucun relevé : lance d'abord `python soloq.py snapshot`")
    ladder = load_snapshot(names[-1])
    targets = ladder[ladder["pro"].isna()].head(top)
    since = since or f"{datetime.date.today().year}-01-01"
    cache = pd.read_csv(PROFILES) if os.path.exists(PROFILES) else pd.DataFrame(columns=["puuid", "profiled_at"])
    if "recent_dpm" not in cache:  # ancien format (sans dégâts / gold) : on recalcule
        cache = pd.DataFrame(columns=["puuid", "profiled_at"])
    fresh = cache[pd.to_datetime(cache["profiled_at"]) >= pd.Timestamp.today() - pd.Timedelta(days=max_age_days)]
    todo = [p for p in targets["puuid"] if p not in set(fresh["puuid"])]
    print(f"Profils à calculer : {len(todo)} non-pros, jusqu'à {n_matches} parties classées depuis "
          f"le {since} chacun (~{n_matches + 1} requêtes max par joueur, moins grâce au cache ; "
          f"on peut interrompre et relancer)")
    names = dict(zip(ladder["puuid"], ladder.get("riot_id", ladder["puuid"])))
    new, started = [], time.monotonic()
    calls_before = riot_api.CALL_COUNT["n"]
    for i, puuid in enumerate(todo, 1):
        before = riot_api.CALL_COUNT["n"]
        profile = build_profile(puuid, n_matches, since)
        new.append(profile)
        # sauvegarde après chaque joueur : Ctrl+C ne fait rien perdre
        out = pd.concat([cache, pd.DataFrame(new)]).drop_duplicates("puuid", keep="last")
        out.to_csv(PROFILES, index=False)
        elapsed = time.monotonic() - started
        eta = elapsed / i * (len(todo) - i)
        print(f"  {i}/{len(todo)} · {names.get(puuid, puuid)} · {profile.get('recent_games', 0)} parties "
              f"({riot_api.CALL_COUNT['n'] - before} requêtes, le reste en cache) · "
              f"reste ~{int(eta // 3600)} h {int(eta % 3600 // 60):02d} min", flush=True)
    if todo:
        print(f"Terminé : {riot_api.CALL_COUNT['n'] - calls_before} requêtes en "
              f"{(time.monotonic() - started) / 60:.0f} min")


def peak_lp():
    """Pic de LP de chaque compte sur l'ensemble de nos relevés (depuis le premier)."""
    frames = []
    for name in snapshots():
        snap = load_snapshot(name)[["puuid", "lp", "tier"]]
        snap["date"] = name[:10]
        frames.append(snap)
    if not frames:
        return pd.DataFrame(columns=["puuid", "peak_lp", "peak_tier", "peak_date"])
    allsnap = pd.concat(frames).sort_values("lp", ascending=False).drop_duplicates("puuid")
    return allsnap.rename(columns={"lp": "peak_lp", "tier": "peak_tier", "date": "peak_date"})


def soloq_scores(df):
    """Score soloQ par poste principal (voir scoring.SOLOQ_ROLE_WEIGHTS)."""
    from scoring import SOLOQ_MIN_GAMES, SOLOQ_ROLE_WEIGHTS, SOLOQ_STANDOUT
    df = df.copy()
    df["soloq_score"] = float("nan")
    if "recent_games" not in df:
        return df
    ok = df["recent_games"].fillna(0) >= SOLOQ_MIN_GAMES
    for role, weights in SOLOQ_ROLE_WEIGHTS.items():
        grp = df[ok & (df["main_role"] == role)]
        if len(grp) < 5:
            continue
        total, wsum = 0, 0
        for stat, w in weights.items():
            if stat not in grp or not w:
                continue
            std = grp[stat].std()
            if not std or pd.isna(std):
                continue
            total = total + w * (grp[stat] - grp[stat].mean()) / std
            wsum += abs(w)
        if wsum:
            n = grp["recent_games"]
            df.loc[grp.index, "soloq_score"] = (total / wsum) * n / (n + SOLOQ_MIN_GAMES)
    pct = df.groupby("main_role")["soloq_score"].rank(pct=True)
    df["soloq_role_pct"] = pct.round(3)
    df["standout"] = pct >= SOLOQ_STANDOUT
    return df


def latest_ladder():
    """Dernier relevé enrichi (évolutions 7 / 30 jours, profils), ou None."""
    names = snapshots()
    if not names:
        return None
    df = with_trends(names[-1])
    df["snapshot_date"] = names[-1][:10]
    if os.path.exists(PROFILES):
        df = df.merge(pd.read_csv(PROFILES).drop(columns=["profiled_at"], errors="ignore"),
                      on="puuid", how="left")
    df = df.merge(peak_lp(), on="puuid", how="left")
    return soloq_scores(df)


def pro_soloq():
    """Meilleur compte du dernier relevé pour chaque pro reconnu, ou None."""
    df = latest_ladder()
    if df is None:
        return None
    pros = df[df["pro"].notna()].sort_values("rank").drop_duplicates("pro")
    out = pros[["pro", "riot_id", "tier", "lp", "rank", "games", "winrate",
                "lp_7d", "games_7d", "snapshot_date"]].rename(columns={"pro": "player"})
    out["ladder_size"] = len(df)
    return out.add_prefix("soloq_").rename(columns={"soloq_player": "player"})


# --------------------------------------------------------------------------

def snapshot(top):
    print("Ladder EUW...")
    ladder = fetch_ladder(top)
    accounts = resolve_accounts(ladder["puuid"].tolist())
    ladder = link_pros(ladder, accounts)
    os.makedirs(SNAP_DIR, exist_ok=True)
    path = os.path.join(SNAP_DIR, f"{datetime.date.today().isoformat()}.csv")
    ladder.to_csv(path, index=False)
    n_pro = ladder["pro"].notna().sum()
    print(f"\n{len(ladder)} joueurs -> {path} ({n_pro} reconnus comme pros)")


def show(top=40, non_pro=False, by_score=False):
    df = latest_ladder()
    if df is None:
        raise SystemExit("Aucun relevé : lance d'abord `python soloq.py snapshot`")
    if non_pro:
        df = df[df["pro"].isna()]
    if by_score:
        df = df.sort_values("soloq_score", ascending=False)
    cols = [c for c in ["rank", "riot_id", "tier", "lp", "peak_lp", "games", "winrate", "lp_7d",
                        "games_7d", "pro", "main_role", "soloq_score", "standout", "recent_games",
                        "recent_kda", "recent_dpm", "recent_kp", "top_champions"] if c in df]
    pd.set_option("display.width", 250)
    print(f"Relevé du {df['snapshot_date'].iloc[0]} ({len(snapshots())} relevé(s) au total)\n")
    print(df[cols].head(top).round(2).to_string(index=False))


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("snapshot", help="relevé du ladder EUW")
    p.add_argument("--top", type=int, default=1000)
    p = sub.add_parser("profiles", help="stats soloQ de l'année des non-pros (poste, champions, score)")
    p.add_argument("--top", type=int, default=200, help="nombre de non-pros (les mieux classés)")
    p.add_argument("--matches", type=int, default=50, help="parties analysées par joueur")
    p.add_argument("--since", help="début de la période (défaut : 1er janvier)")
    p = sub.add_parser("show", help="afficher le dernier relevé")
    p.add_argument("--top", type=int, default=40)
    p.add_argument("--non-pro", action="store_true")
    p.add_argument("--by-score", action="store_true", help="trier par score soloQ")
    args = parser.parse_args()

    if args.cmd == "snapshot":
        snapshot(args.top)
    elif args.cmd == "profiles":
        update_profiles(args.top, args.matches, args.since)
    else:
        show(args.top, args.non_pro, args.by_score)


if __name__ == "__main__":
    main()
