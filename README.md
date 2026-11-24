# LoL Scouting

Outil privé de scouting League of Legends. Il repère les prospects de 2e et 3e
division **avant** leur montée en 1re division, dans 6 régions. Il croise :

- les matchs pros de 2020 à aujourd'hui ;
- les stats à 15 min d'Oracle's Elixir ;
- la soloQ EUW ;
- le mercato en direct ;
- un modèle de montée appris sur les montées passées.

Le dépôt contient deux parties :

- **`scouting/`** : le pipeline Python, lancé sur le PC. Il télécharge, calcule et exporte des fichiers JSON.
- **`web/`** : le site Next.js, hébergé sur Vercel. Il lit ces fichiers JSON et se redéploie à chaque push sur `main`.

## Sommaire

- [Démarrage rapide](#démarrage-rapide)
- [Organisation du dépôt](#organisation-du-dépôt)
- [Commandes](#commandes)
- [Régions suivies](#régions-suivies)
- [Le site](#le-site)
- [Comment le score est calculé](#comment-le-score-est-calculé)
- [Modèle de montée](#modèle-de-montée)
- [Corrections à la main](#corrections-à-la-main)
- [Réglages (Vercel, GitHub, Discord)](#réglages-vercel-github-discord)
- [Sources](#sources)

## Démarrage rapide

Sur le PC, à la racine du dépôt :

```bash
pip install -r requirements.txt
python run_all.py
```

`run_all.py` fait tout, dans l'ordre :

1. `git pull` ;
2. télécharge les matchs manquants et les tournois internationaux ;
3. fait le relevé soloQ ;
4. met à jour la résidence des joueurs ;
5. exporte les 6 régions ;
6. calcule le score mondial et entraîne le modèle de montée ;
7. commit et push des données. Vercel redéploie le site.

Le journal complet est dans `run_all.log`.

| Option | Effet |
|---|---|
| `--regions eu na` | Seulement certaines régions |
| `--full` | Retélécharge aussi la saison en cours (nouveaux matchs) |
| `--mercato` | Seulement le mercato (rumeurs, transferts, contrats), environ 2 min |
| `--no-push` | Sans envoyer sur GitHub |
| `--skip-soloq` | Sans relevé du ladder soloQ |

**Prérequis :**

- **Fichier `.env`** à la racine, jamais versionné :
  - `LEAGUEPEDIA_USER` et `LEAGUEPEDIA_PASSWORD`, un *bot password* Leaguepedia (sans lui, l'accès est anonyme, plus lent et limité) ;
  - `RIOT_API_KEY`.
- **CSV d'[Oracle's Elixir](https://oracleselixir.com/tools/downloads)** dans `data/oracles/`, une saison par fichier. Le plus récent d'une saison remplace les autres.

## Organisation du dépôt

```
lol-scouting/
├── run_all.py            Tout mettre à jour en une commande
├── scout.py              Toutes les autres commandes (python scout.py pour la liste)
├── requirements.txt
├── corrections/          Corrections à la main, versionnées (voir plus bas)
├── scouting/             Pipeline Python
│   ├── config/           Réglages
│   │   ├── regions.py        6 régions suivies, dossiers de données par région
│   │   ├── leagues.py        Ligues suivies saison par saison et leur niveau (1re / 2e / 3e division)
│   │   └── scoring.py        Tous les poids du score (se règlent sans rien retélécharger)
│   ├── sources/          Clients des sources externes
│   │   ├── leaguepedia.py    API Cargo de Leaguepedia (bot password, pauses, reprises)
│   │   ├── riot_api.py       API Riot (soloQ)
│   │   ├── oracles_elixir.py Stats à 15 min d'Oracle's Elixir, rattachées partie par partie
│   │   ├── sheep_esports.py  Scoops Sheep Esports via les titres Google News
│   │   └── images.py         Photos des joueurs et logos des équipes
│   ├── collect/          Collecte et cache des données
│   │   ├── pro_games.py      Parties pro d'une saison (toutes les ligues de leagues.py)
│   │   ├── international.py  Worlds, MSI, EWC, First Stand
│   │   ├── careers.py        Périodes en club, titres, récompenses, passages en 1re division
│   │   ├── residency.py      Résidence officielle et double nationalité (places d'import)
│   │   ├── team_history.py   Résultats et historique des matchs des équipes
│   │   └── soloq.py          Ladder EUW, profils soloQ, liens pros ↔ comptes
│   ├── analysis/         Calculs
│   │   ├── prospects.py      Score de chaque joueur (perf. par poste, ligue, international, forme)
│   │   ├── league_strength.py Coefficient de ligue (EMEA Masters, tournois de 2e division)
│   │   ├── league_talent.py  Niveau des ligues saison par saison (joueurs passés, montés)
│   │   ├── promotions.py     Qui est monté d'une saison à l'autre
│   │   └── world_score.py    Score mondial : force des régions (Bradley-Terry)
│   ├── model/
│   │   └── promotion_model.py Modèle de montée (régression logistique + LightGBM)
│   ├── mercato/
│   │   ├── mercato.py        Mercato de la saison suivante : rumeurs, transferts, contrats, coachs
│   │   └── rosters.py        Effectifs par saison
│   ├── export/
│   │   ├── site.py           Export JSON du site pour une région
│   │   └── settings.py       Réglages du score pour la page Technique
│   └── tools/
│       ├── player_report.py  Fiche détaillée d'un joueur dans le terminal
│       └── missing_ages.py   Prospects sans date de naissance
├── web/                  Site Next.js (Root Directory « web » sur Vercel)
│   ├── app/              Pages et routes API
│   ├── views/            Contenu des pages
│   ├── components/       Composants (tableaux, graphiques, cartes...)
│   ├── lib/              Lecture des données, mercato en direct, alertes, recherche
│   ├── data/             JSON lus par le serveur (générés par le pipeline)
│   └── public/data/      JSON lus par le navigateur (générés par le pipeline)
├── .github/workflows/    Vérification du build, mercato toutes les heures, récap Discord
└── data/                 (non versionné) caches et téléchargements, un dossier par région
```

## Commandes

Chaque étape se lance seule avec `python scout.py <commande>`. Sans argument, la
commande affiche la liste. `--help` après une commande donne ses options.

`--region` choisit la région (`eu` par défaut, sinon `na`, `kr`, `cn`, `lcp`,
`br`). La syntaxe est la même sous PowerShell et sous Linux.

```bash
python scout.py matchs --year 2026 --region kr     # parties pro d'une saison
python scout.py export --region na                 # données du site d'une région
python scout.py modele                             # réentraîner le modèle de montée
python scout.py residence                          # résidence officielle des joueurs
python scout.py mercato --refresh                  # mercato : rumeurs, transferts, contrats
python scout.py soloq snapshot                     # relevé du ladder EUW (1 fois par semaine)
python scout.py classement --role Mid --top 15     # classement dans le terminal
python scout.py joueur Mercy9 --season 2025        # fiche détaillée d'un joueur
python scout.py ages-manquants                     # prospects sans date de naissance
```

| Commande | Ce qu'elle fait |
|---|---|
| `matchs` | Parties pro d'une saison via Leaguepedia (`--year`, `--refresh`) |
| `international` | Worlds, MSI, EWC, First Stand (communs aux 6 régions) |
| `soloq` | Ladder EUW et profils soloQ : `snapshot`, `profiles`, `show` |
| `residence` | Résidence officielle et double nationalité |
| `equipes` | Résultats et historique des matchs des équipes |
| `mercato` | Mercato de la saison suivante |
| `classement` | Classement des prospects (`--calibrate-top` : bonus de 1re division conseillé) |
| `ligues` · `niveau-ligues` | Niveau des ligues (coefficient, saison par saison) |
| `montees` | Qui est monté d'une saison à l'autre |
| `score-mondial` | Force des régions d'après l'international (`--check`) |
| `modele` | Modèle de montée en 1re et 2e division |
| `export` | Données du site d'une région (`--only mercato` ou `equipes`) |
| `reglages` | Réglages du score pour la page Technique |
| `joueur` · `ages-manquants` · `oracles` | Outils de vérification |

## Régions suivies

Chaque région a ses données (`data/<région>/`) et ses fichiers du site
(`web/data/<région>/`). L'Europe est à la racine. Le code utilise les mêmes
niveaux partout : `LEC` = 1re division, `ERL1` = 2e, `ERL2` = 3e. Le site
affiche les vrais noms des ligues.

| Code | 1re division | Divisions inférieures |
|---|---|---|
| `eu` | LEC | ERL1, ERL2, EMEA Masters |
| `na` | LCS (LTA North en 2025) | NACL, NA Academy (2020-2022) |
| `kr` | LCK | LCK CL, LCK Academy Series |
| `cn` | LPL | LDL (jusqu'en 2025), Asia Masters Elite et City Heroes Championship (2026) |
| `lcp` | LCP (depuis 2025) | PCS, VCS, LJL (+ LCO) |
| `br` | CBLOL (LTA South en 2025, + LLA en 2023-2024) | CBLOL Academy, Circuito Desafiante, Ligas Regionales |

## Le site

| Menu | Pages |
|---|---|
| **Accueil** | Indicateurs : meilleurs prospects par poste, cracks de toutes les régions. Ligues : niveau de chaque ligue saison par saison |
| **Joueurs** | Données : classement complet filtrable. Comparer : deux joueurs côte à côte, radar |
| **Mercato** | Rosters : effectifs et mercato en direct. Besoins : places à prendre par équipe. Montées : qui est monté, chances du modèle |
| **SoloQ** | Ladder : top 1000 EUW. Analyses : analyse soloQ approfondie d'un joueur |

À cela s'ajoutent :

- **Fiche joueur** : carrière, stats par poste, détail du score, chances de montée (ce qui lui manque, ses freins), trajectoires comparées aux montés passés, fiche PDF de scouting ;
- **Page équipe** : roster, mercato, résultats, anciens joueurs, historique des matchs (KDA, gold, objectifs, bans) ;
- **Recherche globale** : Ctrl+K ;
- **Liste de suivi ⭐** avec notes et alertes Discord ;
- **Technique** : comment tout est calculé, et la stack.

Développement local :

```bash
cd web
npm install
npm run dev
```

## Comment le score est calculé

**Score = performance dans sa ligue + niveau de la ligue + international − malus ex-1re division**

- **Performance dans sa ligue** : chaque stat est comparée aux joueurs **du même poste dans la même ligue**. On privilégie la phase de lane (écarts de CS, gold et XP à 15 min), puis les dégâts comparés au champion joué, le KDA, la participation aux kills… Le score est réduit quand le joueur a peu de parties.
- **Niveau de la ligue** : d'après les résultats à l'EMEA Masters (Europe) ou aux tournois internationaux de 2e division (autres régions), ajusté chaque saison selon ses joueurs : anciens joueurs de 1re division, montés l'année suivante, résultats contre la division du dessus.
- **International** : performance à l'EMEA Masters, face aux joueurs de toutes les ligues.
- **Forme** : le dernier split compte plus, et la progression d'un split à l'autre est affichée.
- **Score mondial** : les 6 régions sont ramenées sur l'échelle LEC, d'après leurs matchs internationaux (modèle de Bradley-Terry).

Tous les poids sont dans `scouting/config/scoring.py`. La page **Technique** du site les affiche.

## Modèle de montée

`python scout.py modele` donne la probabilité qu'un joueur monte en 1re
division la saison suivante. Il entraîne aussi un second modèle pour la montée
de 3e en 2e division.

- **Ce qu'il apprend** : toutes les montées des saisons 2020 à 2025, dans les 6 régions. Une montée dans la 1re division d'une autre région compte aussi.
- **Ce qu'il regarde** : score, rang dans son poste et dans sa ligue, âge, expérience, international, et si le joueur est un import. Le statut d'import suit la résidence officielle Leaguepedia, double nationalité comprise.
- **Comment il calcule** : régression logistique et LightGBM, moyennés.
- **Comment il est validé** : une saison récente est mise de côté à chaque essai, puis il est testé sur 2025 comme si c'était le futur.

## Corrections à la main

Dans `corrections/`. Elles sont prioritaires sur les données automatiques.

| Fichier | Pour |
|---|---|
| `birthdates.csv` | Âges manquants : `joueur,2004-06-28,source`. Une année seule donne un âge approximatif (« ~22 ans »). `python scout.py ages-manquants` liste les prioritaires |
| `rosters_2027.csv` | Corriger un poste du mercato : `LEC,Karmine Corp,Jungle,Yike,SkewMond,rumeur,lien`. Statut `rumeur` ou `officiel` |
| `team_changes.csv` | Équipe remplacée ou renommée au mercato : `2027,Dignitas,OpTic Gaming,lien` |
| `soloq_accounts.csv` | Lier un pro à son compte soloQ : `joueur,Pseudo#TAG` |
| `player_overrides.csv` | Séparer deux joueurs que Leaguepedia a confondus |

Côté site, `web/data/residency.json` force la résidence d'un joueur (`EMEA`,
`AMER`, `KR`, `LPL`, `LCP`). Ce n'est utile que si Leaguepedia se trompe :
`python scout.py residence` récupère déjà la résidence officielle.

## Réglages (Vercel, GitHub, Discord)

Les secrets restent dans `.env` (PC) ou dans les variables Vercel. Ils ne sont jamais dans le dépôt.

| Où | Variable | Pour |
|---|---|---|
| Vercel > Settings > Environment Variables | `DISCORD_WEBHOOK_URL` | Alertes Discord (news des joueurs suivis, mouvements du modèle) et récap quotidien |
| Vercel | `RIOT_API_KEY`, `DEEP_ACCESS_CODE` | Analyses soloQ lancées depuis le site (code demandé avant de lancer) |
| Vercel > Storage | Upstash Redis | Mercato en direct, liste de suivi, analyses |
| GitHub > Settings > Secrets and variables > Actions > Variables | `SITE_URL` | Mercato actualisé toutes les heures et récap Discord, même sans visite |
| GitHub, même endroit | `DIGEST_REGIONS` | Régions du récap quotidien, par exemple `eu,na` (`eu` par défaut) |

Les GitHub Actions (`.github/workflows/`) :

- **Vérification du site**, à chaque push : pipeline Python (syntaxe et imports), données des 6 régions, types, build Next.js.
- **Mercato en ligne**, toutes les heures.
- **Récap quotidien Discord**, chaque matin : top 5 par poste des moins de 25 ans hors 1re division, et plus fortes progressions.

## Sources

- **Leaguepedia** (CC BY-SA 3.0) : matchs, joueurs, résidence, titres, récompenses, rumeurs, transferts, contrats.
- **Oracle's Elixir** : stats à 15 min.
- **API Riot** : soloQ.
- **Sheep Esports** : uniquement via les titres Google News, le site n'est jamais contacté.
