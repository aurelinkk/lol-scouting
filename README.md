# LoL Scouting

Repérage des prospects européens de League of Legends à partir des matchs pros
(LEC, EMEA Masters, ERL1, ERL2) des saisons 2025 et 2026.

## Mise à jour des données

```bash
pip install -r requirements.txt
python fetch_pro.py --year 2025     # matchs Leaguepedia (cache dans data/raw/)
python fetch_pro.py --year 2026
python export_web.py                # JSON pour le site (web/data/, web/public/data/)
```

Les stats @15 et first blood viennent d'Oracle's Elixir : télécharger les CSV
sur oracleselixir.com/tools/downloads et les placer dans `data/oracles/`
(`python oracles.py 2026` vérifie la couverture).

Âges : Leaguepedia n'a pas la date de naissance de beaucoup de joueurs d'ERL.
`python missing_ages.py` liste les joueurs classés sans âge (du mieux classé au
moins bien) ; compléter `birthdates.csv` (`player,birthdate,source`), puis
relancer `python export_web.py`.

Pour accélérer Leaguepedia, mettre un bot password dans `.env` :
`LEAGUEPEDIA_USER` et `LEAGUEPEDIA_PASSWORD`.

## Scripts d'analyse

| Script | Rôle |
|---|---|
| `prospects.py` | Classement des prospects (filtres âge, poste, niveau) |
| `player.py <pseudo>` | Fiche joueur : chaque stat vs son poste, détail du score |
| `promotions.py` | Qui est monté (ERL2→ERL1, ERL1→LEC) et son profil l'année d'avant |
| `league_strength.py` | Coefficient des ligues d'après les placements à l'EMEA Masters |
| `scoring.py` | Tous les poids du score (à ajuster) |
| `missing_ages.py` | Joueurs classés sans date de naissance, à compléter dans `birthdates.csv` |
| `leagues.py` | Ligues suivies par saison et leur niveau |

## Site web (Vercel)

Application Next.js dans `web/`. Elle lit les JSON produits par `export_web.py`.

```bash
cd web
npm install
npm run dev        # http://localhost:3000
```

Déploiement : importer le dépôt sur vercel.com et choisir **`web`** comme
*Root Directory*. Ensuite, chaque `git push` (après `python export_web.py`)
redéploie le site.

Données : Leaguepedia (CC BY-SA 3.0), Oracle's Elixir.
