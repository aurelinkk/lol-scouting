# LoL Scouting

Outil privé de scouting League of Legends : repérer les **prospects européens**
(ERL1, ERL2, EMEA Masters, soloQ) **avant** qu'ils montent en LEC, en croisant
les matchs pros de 2023 à aujourd'hui, la soloQ EUW et le mercato.

## Ce que fait le site

| Onglet | À quoi ça sert |
|---|---|
| **Indicateurs** | Meilleurs prospects par poste (21 ans ou moins), niveau des ligues, taux de montée selon le rang |
| **Données** | Classement complet filtrable (saison, poste, ligue, âge, club actuel…), avec ou sans le niveau de ligue |
| **Fiche joueur** | Photo, club, âge, carrière en frise (LEC / ERL1 / ERL2 / autres régions), titres, récompenses, chaque stat vs son poste, détail du score, évolution par tournoi |
| **Ligues** | Niveau de chaque ligue saison par saison : résultats à l'EMEA Masters, ex-LEC, joueurs passés par la division du dessus, montés l'année suivante, ERL2 contre l'ERL1 du pays |
| **Montées** | Par saison : qui est monté (ERL2 → ERL1, ERL1 → LEC) et son profil l'année d'avant. Valide le score : 9 montés en LEC sur 11 étaient dans notre top 10 % |
| **Comparer** | Deux joueurs côte à côte (Europe ou NA, n'importe quelle saison) : score, niveau de la ligue, chaque stat située dans sa ligue |
| **Rosters** | Effectifs LEC + ERL1 depuis 2023 et **mercato automatique** de la saison suivante (transferts officiels, rumeurs Sheep Esports / X, fins de contrat GCD, pistes non tranchées) |
| **Ladder** | Top 1000 soloQ EUW : non-pros à scouter, progression de LP, volume de jeu, score soloQ par poste (⭐ = top 5 %) |
| **Analyses** | Analyse soloQ approfondie d'un joueur ciblé (toutes ses parties de l'année) lancée depuis le site, rapport prêt en ~20 min |

## Europe et Amérique du Nord

Le sélecteur **EU / NA** en haut du site change de région. Les deux classements
restent séparés : aucune compétition ne permet de comparer le niveau de la NACL
à celui des ERL. En NA, le score est la performance dans la NACL (même calcul
par poste, malus ex-LCS) ; pas de coefficient de ligue ni d'EMEA Masters, pas
encore de soloQ (onglets Ligues, Ladder et Analyses : Europe seulement).
Les scripts Python prennent la région dans la variable `SCOUT_REGION`
(`eu` par défaut) : données dans `data/na/`, site dans `web/data/na/`.

```bash
SCOUT_REGION=na python fetch_pro.py --year 2026   # PowerShell : $env:SCOUT_REGION="na"
SCOUT_REGION=na python export_web.py
```

## Comment le score est calculé

**Score = performance dans sa ligue + niveau de la ligue + EMEA Masters − malus ex-LEC**

- **Performance dans sa ligue** : chaque stat comparée aux joueurs **du même poste dans la même ligue**. On privilégie la phase de lane (écarts de CS, gold et XP à 15 min), puis les dégâts comparés au champion joué, le KDA, la participation aux kills… Le score est réduit quand le joueur a peu de parties.
- **Niveau de la ligue** : d'après le placement de ses équipes à l'EMEA Masters sur 2 ans (la LFL vaut plus que la Liga Portuguesa), ajusté chaque saison selon ses joueurs (`league_talent.py`) : part d'anciens joueurs de LEC et de joueurs montés en LEC l'année suivante pour une ERL1 ; joueurs passés par l'ERL1, montés l'année suivante et résultats contre l'ERL1 du pays pour une ERL2 (ex : LFL2 2025 bien plus forte que la Nexus League 2026). Un joueur monté ne profite pas de sa propre montée.
- **EMEA Masters** : performance face aux joueurs de toutes les ligues.
- **Ex-LEC** : petit malus pour les joueurs déjà passés par la LEC, qui remontent un peu plus rarement.

Les joueurs de LEC / LCS sont aussi classés (filtre « Inclure les joueurs de LEC » dans Données) : perf. dans la LEC jugée à moitié par rapport à leur équipe, + un bonus fixe de 1re division calibré sur les montés (`python prospects.py --calibrate-top`).

Tous les poids sont dans `scoring.py` et se règlent sans rien retélécharger.
Le score soloQ des non-pros est séparé du score pro (pas de matchs officiels à comparer).

## Mettre les données à jour (sur le PC)

Prérequis : `pip install -r requirements.txt` ; dans `.env` : `LEAGUEPEDIA_USER`,
`LEAGUEPEDIA_PASSWORD` (bot password Leaguepedia) et `RIOT_API_KEY` ; les CSV
d'[Oracle's Elixir](https://oracleselixir.com/tools/downloads) dans `data/oracles/`.

```bash
python fetch_pro.py --year 2026        # matchs pros (cache : rapide les fois suivantes)
python soloq.py snapshot               # relevé du ladder EUW (1 fois / semaine)
python soloq.py profiles               # stats soloQ de l'année des non-pros (long, reprend où il s'arrête)
python mercato.py --refresh            # rumeurs, transferts, contrats
python export_web.py                   # génère les données du site
git add web/data web/public/data; git commit -m "Données"; git push   # Vercel redéploie
# (puis la même chose avec SCOUT_REGION=na pour la NA)
```

Corrections à la main (prioritaires sur les données automatiques) :

| Fichier | Pour |
|---|---|
| `birthdates.csv` | Âges manquants (`joueur,2004-06-28,source` ; une année seule = âge approximatif « ~22 ans ») — `python missing_ages.py` liste les prioritaires |
| `rosters_2027.csv` | Corriger un poste du mercato |
| `team_changes.csv` | Équipe remplacée ou renommée au mercato (`2027,Dignitas,OpTic Gaming,lien`) |
| `soloq_accounts.csv` | Lier un pro à son compte soloQ (`joueur,Pseudo#TAG`) |
| `player_overrides.csv` | Séparer deux joueurs que Leaguepedia a confondus |
| `leagues.py` | Ligues suivies par saison et leur niveau (ERL1 / ERL2) |

Outils en ligne de commande : `prospects.py` (classement), `player.py <pseudo>`
(fiche détaillée), `promotions.py` (montées), `league_strength.py` (coefficients),
`oracles.py <saison>` (couverture Oracle's Elixir), `league_talent.py` (niveau des ligues par saison).

## Site (Vercel)

Application Next.js dans `web/` (Root Directory `web` sur Vercel), déployée à
chaque push sur `main`. Pour les **Analyses** lancées depuis le site :

1. Vercel → Storage / Marketplace → **Upstash Redis** → connecter au projet (gratuit).
2. Vercel → Settings → Environment Variables : `RIOT_API_KEY` (secrète) et,
   conseillé, `DEEP_ACCESS_CODE` (code demandé avant de lancer une analyse).
3. Redéployer. Une analyse avance tant qu'un onglet du site est ouvert.

Développement local : `cd web && npm install && npm run dev`.

## Sources

Leaguepedia (CC BY-SA 3.0) : matchs, joueurs, titres, récompenses, rumeurs,
transferts, contrats (GCD) · Oracle's Elixir : stats à 15 min · API Riot : soloQ.
