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

## SoloQ (clé RIOT_API_KEY dans .env)

```bash
python soloq.py snapshot            # relevé du top 1000 EUW (~20 min la 1re fois : Riot ID)
python soloq.py profiles --top 300  # poste / champions des non-pros (long, optionnel)
python soloq.py show --non-pro      # aperçu dans le terminal
python export_web.py                # onglet Ladder + soloQ sur les fiches
```

Lancer `snapshot` une fois par semaine : les évolutions (LP et parties sur 7 / 30
jours) montrent qui grind. Les comptes des pros viennent de Leaguepedia ; pour
en ajouter ou corriger, `soloq_accounts.csv` (`player,riot_id`).

## Rosters et mercato

L'onglet Rosters montre les effectifs LEC + ERL1 depuis 2023 (d'après les
parties jouées) et le mercato de la saison suivante, **construit
automatiquement** depuis Leaguepedia : effectif de fin de saison, puis
transferts officiels (RosterChanges) et rumeurs (RosterRumors, qui reprend
Sheep Esports, X...). Il sert aussi aux montées vers la saison suivante.

```bash
python mercato.py --refresh          # mettre à jour rumeurs / transferts
python mercato.py --league LFL       # aperçu d'une ligue
```

Pour corriger un poste à la main (prioritaire sur l'automatique) :
`rosters_2027.csv` (`league,team,role,player_2026,player_2027`).

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
| `soloq.py` | Ladder EUW, lien avec les pros, profil des non-pros |
| `careers.py` | Carrière : périodes en club, titres, récompenses individuelles |
| `rosters.py` | Effectifs par split |
| `mercato.py` | Mercato automatique (Leaguepedia : transferts + rumeurs) |
| `player_overrides.csv` | Corriger l'identité d'un joueur mal rattaché par Leaguepedia |

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
