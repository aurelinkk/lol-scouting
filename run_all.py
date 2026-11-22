"""Tout mettre à jour en une commande : code, données, calculs, site.

    python run_all.py                  # Europe + NA + Corée, puis envoi sur le site
    python run_all.py --regions kr     # une seule région
    python run_all.py --full           # retélécharge aussi la saison en cours
    python run_all.py --no-push        # sans envoyer sur GitHub
    python run_all.py --mercato        # seulement le mercato (rumeurs Sheep, X, transferts) : 2 min

Étapes (chacune est sautée proprement si elle échoue, le résumé le dit) :
  1. git pull (arrêt si ça échoue : rien n'est lancé sur un vieux code)
  2. matchs pros de chaque région : saisons manquantes (+ saison en cours si --full)
  3. tournois internationaux (Worlds, MSI, EWC, First Stand)
  4. relevé du ladder soloQ EUW (si RIOT_API_KEY dans .env)
  5. export du site pour chaque région (classements, fiches, montées, mercato...)
  6. bonus de 1re division conseillé pour chaque région (informatif, dans le journal)
  7. git add / commit / push des données du site

Journal complet : run_all.log
"""
import argparse
import datetime
import os
import subprocess
import sys

LOG = "run_all.log"
from region import ALL_REGIONS, data_dir  # noqa: E402

ALL = list(ALL_REGIONS)


def log(msg):
    line = f"[{datetime.datetime.now():%H:%M:%S}] {msg}"
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def run(cmd, region=None, check=False):
    """Lance une commande, recopie sa sortie dans le journal. Renvoie True si OK."""
    # PYTHONUNBUFFERED : afficher la progression au fil de l'eau (sinon Python
    # garde sa sortie en mémoire et tout arrive d'un coup à la fin)
    env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUNBUFFERED="1")
    if region:
        env["SCOUT_REGION"] = region
    log(("[" + region + "] " if region else "") + " ".join(cmd))
    proc = subprocess.Popen(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, encoding="utf-8", errors="replace")
    with open(LOG, "a", encoding="utf-8") as f:
        for line in proc.stdout:
            if "Rate limit" in line:  # trop bavard
                continue
            print("    " + line.rstrip(), flush=True)
            f.write("    " + line)
    ok = proc.wait() == 0
    if not ok:
        log(f"  ÉCHEC (code {proc.returncode})")
        if check:
            raise SystemExit(1)
    return ok


def seasons(region):
    out = subprocess.run([sys.executable, "-c", "from leagues import LEAGUES; print(*sorted(LEAGUES))"],
                         env=dict(os.environ, SCOUT_REGION=region), capture_output=True, text=True)
    return [int(s) for s in out.stdout.split()]


def data_file(region, season):
    return f"{data_dir(region)}/pro_games_{season}.csv"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--regions", nargs="+", default=ALL, choices=ALL)
    parser.add_argument("--full", action="store_true", help="retélécharger aussi la saison en cours")
    parser.add_argument("--no-push", action="store_true")
    parser.add_argument("--skip-soloq", action="store_true")
    parser.add_argument("--mercato", action="store_true",
                        help="seulement le mercato des régions (rumeurs, transferts, contrats)")
    args = parser.parse_args()
    py = sys.executable
    status = {}
    log(f"===== Mise à jour complète : {', '.join(args.regions)} =====")

    # 1. Code à jour (sinon on calcule avec une vieille version)
    run(["git", "pull", "--no-rebase"], check=True)

    if args.mercato:
        for region in args.regions:
            status[f"mercato {region}"] = run([py, "export_web.py", "--only", "mercato"], region)
        push(args, status)
        summary(status)
        return

    # 2. Matchs pros
    for region in args.regions:
        ok = True
        all_seasons = seasons(region)
        for season in all_seasons:
            current = season == max(all_seasons)
            if os.path.exists(data_file(region, season)) and not (args.full and current):
                continue
            cmd = [py, "fetch_pro.py", "--year", str(season)] + (["--refresh"] if args.full and current else [])
            ok &= run(cmd, region)
        status[f"matchs {region}"] = ok

    # 3. Internationaux (communs à toutes les régions)
    status["internationaux"] = run([py, "intl.py"])

    # 4. Ladder soloQ EUW
    if "eu" in args.regions and not args.skip_soloq:
        status["soloQ EUW"] = run([py, "soloq.py", "snapshot"], "eu")

    # 5. Export du site
    for region in args.regions:
        status[f"export {region}"] = run([py, "export_web.py"], region)

    # 6. Calibrage (informatif)
    for region in args.regions:
        run([py, "prospects.py", "--calibrate-top"], region)

    # 7. Envoi
    push(args, status)
    summary(status)


def push(args, status):
    if args.no_push:
        return
    run(["git", "add", "web/data", "web/public/data"])
    run(["git", "commit", "-m", f"Donnees {datetime.date.today()}"])
    if not run(["git", "push"]):
        run(["git", "pull", "--no-rebase"])
        status["envoi"] = run(["git", "push"])
    else:
        status["envoi"] = True


def summary(status):
    log("===== Résumé =====")
    for step, ok in status.items():
        log(f"  {'OK    ' if ok else 'ÉCHEC '} {step}")
    log(f"Journal complet : {LOG}")


if __name__ == "__main__":
    main()
