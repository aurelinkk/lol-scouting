import fs from "node:fs";
import path from "node:path";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getPromotionModel } from "@/lib/data";
import { STAT_LABELS } from "@/lib/format";
import { REGION_INFO, type Region, REGIONS } from "@/lib/region";
import type { StatKey } from "@/lib/types";
import { WORLD } from "@/lib/world";

export const metadata = { title: "Technique · LoL Scouting" };

interface ScoringConfig {
  ROLE_WEIGHTS: Record<string, Partial<Record<StatKey, number>>>;
  LEAGUE_WEIGHT: number;
  EM_WEIGHT: number;
  EM_SHRINK_GAMES: number;
  SAMPLE_SHRINK_GAMES: number;
  MIN_PLAYERS_FOR_COMPARISON: number;
  TOP_LEAGUE_BONUS: Record<string, number>;
  THIRD_TIER_MALUS: Record<string, number>;
  TEAM_ADJUST: Record<string, number>;
  TOP_LEAGUE_SPREAD: number;
  INTL_WEIGHT: number;
  INTL_SHRINK_GAMES: number;
  SOLOQ_WEIGHT: number;
  EX_LEC_MALUS: number;
  FORM_WEIGHT: number;
  ERL2_DISCOUNT: number;
  SHRINK_APPEARANCES: number;
}

function config(): ScoringConfig | null {
  const file = path.join(process.cwd(), "data", "scoring.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf-8")) : null;
}

const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"];

function F({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border bg-surface-2/70 px-3 py-2 font-mono text-[12.5px] leading-relaxed text-ink">
      {children}
    </pre>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="space-y-2 text-sm text-ink-2">{children}</div>
    </section>
  );
}

function KV({ items }: { items: [string, React.ReactNode, string?][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      {items.map(([k, v, hint]) => (
        <div key={k} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1">
          <dt className="text-ink-2" title={hint}>
            {k}
          </dt>
          <dd className="font-mono text-xs text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
function ScoreTab({ c }: { c: ScoringConfig | null }) {
  if (!c) return <p className="text-sm text-ink-3">Réglages pas encore exportés (python scout.py reglages).</p>;
  const stats = [...new Set(ROLES.flatMap((r) => Object.keys(c.ROLE_WEIGHTS[r] ?? {})))] as StatKey[];
  return (
    <div className="space-y-6">
      <Block title="Pipeline du score (prospects.build_ranking)">
        <p>Pour chaque joueur et chaque saison, dans sa ligue principale (au moins 10 parties) :</p>
        <F>{`1. z_s = (x_s − μ_s) / σ_s                       par (ligue, poste), ≥ ${c.MIN_PLAYERS_FOR_COMPARISON} joueurs
2. perf = Σ w_s·z_s / Σ |w_s|                       w = poids du poste (tableau ci-dessous)
3. perf += −a_tier · moyenne(perf des coéquipiers)  a = ${JSON.stringify(c.TEAM_ADJUST)}
4. league_score = perf · n / (n + ${c.SAMPLE_SHRINK_GAMES})                n = parties (rétrécissement)
5. final = league_score
         + ${c.LEAGUE_WEIGHT} · (coef_ligue − moy. ERL1) / σ_ERL1      niveau de ligue
         + ${c.EM_WEIGHT} · z_EM · n_EM / (n_EM + ${c.EM_SHRINK_GAMES})            EMEA Masters
         + ${c.INTL_WEIGHT} · (z_intl + écart) · n / (n + ${c.INTL_SHRINK_GAMES})    Worlds / MSI / EWC (1re div.)
         + ${c.FORM_WEIGHT} · score_dernier_split · n_s / (n_s + ${c.SAMPLE_SHRINK_GAMES})   forme
         + ${c.EX_LEC_MALUS} si déjà passé par la 1re division
         + ${c.SOLOQ_WEIGHT} · (1 − rang_EUW / taille)            soloQ (désactivée)`}</F>
        <p>
          1re division : perf × {c.TOP_LEAGUE_SPREAD} + bonus fixe calibré (écart moyen des montés entre leur score en 2e division et
          leur score une fois montés) : {Object.entries(c.TOP_LEAGUE_BONUS).map(([r, v]) => `${r} ${v}`).join(" · ")}. 3e division
          sans EMEA Masters : {Object.entries(c.THIRD_TIER_MALUS).map(([r, v]) => `${r} ${v}`).join(" · ") || "aucun"}.
        </p>
      </Block>

      <Block title="Coefficient de ligue (analysis/league_strength.py, league_talent.py)">
        <F>{`Europe : coef = placement moyen à l'EMEA Masters sur 2 ans (1 = vainqueur), tiré vers 0.5
         avec ${c.SHRINK_APPEARANCES} participations fictives ; ERL2 = ERL1 du pays − ${c.ERL2_DISCOUNT}
         + niveau des joueurs (anciens de LEC, montés, victoires contre l'ERL1)
Autres régions : coef 2e div. = win rate aux tournois Asia Masters / ASCI / WSCI,
         (victoires + prior·10) / (parties + 10)`}</F>
      </Block>

      <Block title="Poids des stats par poste (scoring.ROLE_WEIGHTS)">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs tabular-nums">
            <thead>
              <tr className="text-left text-ink-3">
                <th className="py-1 font-medium">Stat</th>
                {ROLES.map((r) => (
                  <th key={r} className="py-1 text-right font-medium">
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s} className="border-t border-border/60">
                  <td className="py-1 text-ink-2">
                    {STAT_LABELS[s] ?? s} <span className="font-mono text-[10px] text-ink-3">{s}</span>
                  </td>
                  {ROLES.map((r) => {
                    const w = c.ROLE_WEIGHTS[r]?.[s];
                    return (
                      <td
                        key={r}
                        className="py-1 text-right font-mono"
                        style={{ color: !w ? "var(--text-3)" : w < 0 ? "var(--critical)" : w >= 1.5 ? "var(--gold)" : undefined }}
                      >
                        {w ? (w > 0 ? `+${w}` : w) : "·"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-3">
          Doré : poids fort (la phase de lane @15 dépend le moins de l&apos;équipe). Rouge : plus bas = mieux. Une stat absente pour un
          joueur (ligue sans données @15) est retirée du dénominateur. Poids choisis par backtest sur les montées 2023-2025.
        </p>
      </Block>
    </div>
  );
}

// ---------------------------------------------------------------------------
function ModelTab() {
  const m = getPromotionModel();
  if (!m) return <p className="text-sm text-ink-3">Modèle pas encore entraîné (python scout.py modele).</p>;
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  const rows: [string, typeof m.validation | undefined][] = [
    ["Score seul (référence)", m.baseline],
    ["Régression logistique", m.logit_validation],
    [m.model ?? "Modèle", m.validation],
  ];
  return (
    <div className="space-y-6">
      <Block title="Problème">
        <F>{`Classification binaire, une ligne = (joueur, saison) en 2e / 3e division, ≥ 8 parties
y = 1 si le joueur joue en 1re division la saison suivante (début ou en cours), dans sa région
    ou dans une autre (même pseudo et même poste dans un effectif de 1re division : ex. Yukino → FlyQuest)
Entraînement : ${m.trained_on.join(", ")}${m.old_seasons?.seasons.length ? `  (${m.old_seasons.seasons.join(", ")} : poids ${m.old_seasons.weight}, choisi en validation)` : ""}
Validation   : ${(m.validated_on ?? m.trained_on).join(", ")} → ${m.validation.n} lignes, ${m.validation.promoted} positifs (${pct(m.validation.promoted / m.validation.n)})
Prédiction   : ${m.season} → ${m.target}      Exclu : LCP 2023-2024 (création de la ligue)`}</F>
      </Block>

      <Block title="Modèles">
        <F>{`Logistique : p = σ(w₀ + wᵀz),   z = variables standardisées
  L(w) = −Σ [y log p + (1−y) log(1−p)] + (λ/2)‖w₁:‖²        λ = ${m.lambda ?? "?"} (validation)
  Newton-Raphson :  g = Zᵀ(y−p) − λw,   H = ZᵀWZ + λI,  W = diag(p(1−p)),  w ← w + H⁻¹g
  (problème convexe : ~10 itérations, minimum global unique ; des epochs SGD donneraient le même w)
LightGBM : 300 arbres, 7 feuilles max, learning rate 0.03, subsample 0.8, colsample 0.8, L2 = 5,
  min 30 joueurs par feuille, moyenne de 5 graines
Prédiction finale : p = (p_logistique + p_LightGBM) / 2      explications = contributions logistiques w_j·z_j`}</F>
      </Block>

      <Block title="Validation (aucune saison n'est prédite par un modèle qui l'a vue)">
        <F>{`Validation croisée par saison : apprend sur 2 saisons, prédit la 3e (×3) → choix de λ et des variables
Test « futur » : apprend sur ${m.trained_on.slice(0, -1).join(", ")}, prédit ${m.trained_on.at(-1)}
Test réel : mercato ${m.target} en cours (${m.live.known} montées connues, ${m.live.in_top3} dans le top 3 prédit du poste)
Pas de découpage aléatoire : un joueur sur plusieurs saisons ferait fuiter l'information`}</F>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-xs tabular-nums">
            <thead>
              <tr className="text-left text-ink-3">
                <th className="py-1 font-medium">Modèle (validation par saison)</th>
                <th className="py-1 text-right font-medium">AUC</th>
                <th className="py-1 text-right font-medium">Log loss</th>
                <th className="py-1 text-right font-medium">Brier</th>
                <th className="py-1 text-right font-medium">Montés dans le top 3 prédit</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((r) => r[1])
                .map(([name, v]) => (
                  <tr key={name} className="border-t border-border/60">
                    <td className="py-1 text-ink-2">{name}</td>
                    <td className="py-1 text-right font-mono">{v!.auc.toFixed(3)}</td>
                    <td className="py-1 text-right font-mono">{v!.logloss.toFixed(4)}</td>
                    <td className="py-1 text-right font-mono">{v!.brier.toFixed(4)}</td>
                    <td className="py-1 text-right font-mono">{pct(v!.top3_share)}</td>
                  </tr>
                ))}
              <tr className="border-t border-border/60">
                <td className="py-1 text-ink-2">Test futur {m.trained_on.at(-1)}</td>
                <td className="py-1 text-right font-mono">{m.forward.auc.toFixed(3)}</td>
                <td className="py-1 text-right font-mono">{m.forward.logloss.toFixed(4)}</td>
                <td className="py-1 text-right font-mono">{m.forward.brier.toFixed(4)}</td>
                <td className="py-1 text-right font-mono">{pct(m.forward.top3_share)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-3">
          Benchmark du 23/11/2026 (même validation) : random forest AUC 0.933, réseau de neurones 32-16 AUC 0.925 (trop peu de positifs
          pour un réseau), LightGBM seul 0.947. Places libres par poste testées : pas de gain mesurable, affichées à part.
        </p>
      </Block>

      <Block title="Variables (38)">
        <F>{`Rang dans le poste : −log(rang)      Score, forme, win rate, stats clés : z-scores par (région, saison, poste)
Progression sur un an (clip ±2)      Âge − 21.5, âge², âge inconnu      log(1 + parties)
Niveau de la ligue, 3e division, ancien de 1re division, EMEA Masters / international, import,
académie d'un club de 1re division (nom de club commun : T1 Esports Academy → T1)
One-hot poste (4) et région (5), interactions rang × poste (4)`}</F>
      </Block>

      <Block title="Calibration (saisons non vues)">
        <div className="flex flex-wrap gap-2 text-xs">
          {m.calibration.map((b) => (
            <span key={b.from} className="rounded border border-border px-2 py-1 font-mono">
              {Math.round(b.from * 100)}-{Math.round(b.to * 100)} % : prédit {pct(b.predicted)} / observé {pct(b.observed)}{" "}
              <span className="text-ink-3">(n={b.n})</span>
            </span>
          ))}
        </div>
      </Block>

      {m.stay && (
        <Block title="Modèle de maintien (model/stay_model.py)">
          <F>{`Joueurs : au moins 5 parties de 1re division dans la saison (titulaires, remplaçants, montés en cours de saison)
Cible : au moins 3 parties de 1re division la saison suivante, n'importe quelle région (pseudo + poste)
Variables : part des parties de l'équipe (saison et dernier split : banc en fin de saison), win rate de l'équipe et écart du joueur, score en 1re division,
saisons déjà passées en 1re division, montée en cours de saison, parties, international, âge, âge², import,
poste et région (one-hot)${m.stay.with_stats ? ", stats clés (z-scores par poste)" : ""}
${m.stay.model}, λ = ${m.stay.lambda}, saisons 2020-2022 pondérées ${m.stay.old_weight}
Validation ${m.stay.validated_on.join(", ")} : AUC ${m.stay.validation.auc.toFixed(3)} · log loss ${m.stay.validation.logloss.toFixed(3)} (taux moyen seul : AUC ${m.stay.baseline.auc.toFixed(3)}, log loss ${m.stay.baseline.logloss.toFixed(3)})
Test ${m.stay.validated_on[m.stay.validated_on.length - 1]} : AUC ${m.stay.forward.auc.toFixed(3)} sur ${m.stay.forward.n} joueurs`}</F>
        </Block>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function WorldTab() {
  const last = Math.max(...Object.keys(WORLD.seasons).map(Number));
  const cur = WORLD.seasons[String(last)];
  return (
    <div className="space-y-6">
      <Block title="Force des régions : Bradley-Terry (analysis/world_score.py)">
        <F>{`P(région A bat région B) = σ(θ_A − θ_B)
θ = argmax Σ_parties ω · log P(résultat) − ‖θ‖² / (2·1²)       a priori N(0, 1), Newton
ω = 1 (saison), 0.5 (saison −1), 0.25 (saison −2)        ${WORLD.games} parties entre régions`}</F>
      </Block>
      <Block title="Conversion en points de score">
        <F>{`K = σ(score moyen des titulaires d'une équipe) / σ(logit win rate de l'équipe)   (dans chaque ligue)
K = ${WORLD.k}
décalage_R = (moy. titulaires LEC − moy. titulaires R) + K · (θ_R − θ_EU)
score mondial = score régional + décalage_R  (+ correction 2e / 3e division mesurée sur les départs à l'étranger)`}</F>
        <KV
          items={REGIONS.filter((r) => cur[r]).map((r) => [
            `${REGION_INFO[r as Region].top} (${last})`,
            `θ ${cur[r]!.strength >= 0 ? "+" : ""}${cur[r]!.strength.toFixed(2)} ± ${cur[r]!.strength_se.toFixed(2)}   décalage ${cur[r]!.offset >= 0 ? "+" : ""}${cur[r]!.offset.toFixed(2)}`,
          ])}
        />
        {WORLD.check && (
          <p className="text-xs text-ink-3">
            Contrôle : {WORLD.check.players} joueurs de 1re division ayant changé de région, erreur moyenne avant / après{" "}
            {WORLD.check.regional_error.toFixed(2)} (score régional) → {WORLD.check.world_error.toFixed(2)} (score mondial).
          </p>
        )}
      </Block>
    </div>
  );
}

// ---------------------------------------------------------------------------
const GLOSSARY: [StatKey, string, string][] = [
  ["winrate", "victoires / parties", "Leaguepedia"],
  ["kda", "(kills + assists) / max(1, morts)", "Leaguepedia"],
  ["kp", "(kills + assists) / kills de l'équipe", "Leaguepedia"],
  ["cs_min", "creeps tués / minute", "Leaguepedia"],
  ["gold_min", "gold gagné / minute", "Leaguepedia"],
  ["dpm", "dégâts aux champions / minute", "Leaguepedia"],
  ["dmg_share", "dégâts du joueur / dégâts de l'équipe", "Leaguepedia"],
  ["dpm_vs_champ", "DPM − moyenne des joueurs du poste sur le même champion", "calcul (prospects.add_game_metrics)"],
  ["dmg_share_vs_champ", "DMG % − moyenne sur le même champion", "calcul"],
  ["gold_share", "gold du joueur / gold de l'équipe", "Leaguepedia"],
  ["vision_min", "score de vision / minute", "Leaguepedia"],
  ["deaths_pg", "morts par partie (plus bas = mieux)", "Leaguepedia"],
  ["assists_pg", "assists par partie", "Leaguepedia"],
  ["champions", "nombre de champions différents joués", "Leaguepedia"],
  ["csd15", "CS du joueur − CS de son vis-à-vis à 15:00", "Oracle's Elixir"],
  ["gd15", "gold du joueur − gold de son vis-à-vis à 15:00", "Oracle's Elixir"],
  ["xpd15", "XP du joueur − XP de son vis-à-vis à 15:00", "Oracle's Elixir"],
  ["ahead_cs15", "part des parties avec plus de CS que le vis-à-vis à 15:00", "Oracle's Elixir"],
  ["ka15", "kills + assists avant 15:00", "Oracle's Elixir"],
  ["fb_part", "part des first bloods avec kill ou assist du joueur", "Oracle's Elixir"],
  ["fb_victim", "part des first bloods subis (plus bas = mieux)", "Oracle's Elixir"],
  ["cw_min", "control wards achetées / minute", "Oracle's Elixir"],
  ["wards_killed_min", "wards détruites / minute", "Oracle's Elixir"],
];

function StatsTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">
        Moyennes par joueur sur la saison (ou le split), pondérées par partie. Les percentiles des fiches comparent chaque valeur aux
        joueurs du même poste dans la même ligue (au moins 10 parties). Oracle&apos;s Elixir est rattaché partie par partie
        (sources/oracles_elixir.py) ; une stat absente pour une ligue n&apos;entre pas dans le score.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-3">
              <th className="py-1 font-medium">Stat</th>
              <th className="py-1 font-medium">Clé</th>
              <th className="py-1 font-medium">Définition</th>
              <th className="py-1 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {GLOSSARY.map(([k, def, src]) => (
              <tr key={k} className="border-t border-border/60">
                <td className="py-1.5 pr-3">{STAT_LABELS[k] ?? k}</td>
                <td className="py-1.5 pr-3 font-mono text-xs text-ink-3">{k}</td>
                <td className="py-1.5 pr-3 text-ink-2">{def}</td>
                <td className="py-1.5 text-xs text-ink-3">{src}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
const PIPELINE: [string, string][] = [
  ["scout.py · run_all.py", "Point d'entrée de toutes les commandes (python scout.py) ; run_all enchaîne git pull, téléchargements, exports, modèles, commit, push"],
  ["config/ (regions · leagues · scoring)", "Régions suivies, ligues par saison avec leur niveau (1re / 2e / 3e division), tous les poids du score"],
  ["sources/ (leaguepedia · riot_api · oracles_elixir · sheep_esports · images)", "Clients des sources : API Cargo de Leaguepedia, API Riot, CSV Oracle's Elixir (stats @15), scoops Sheep Esports (Google News RSS), photos et logos"],
  ["collect/pro_games · international", "Parties pro par saison et ligue (ScoreboardGames / ScoreboardPlayers) ; Worlds, MSI, EWC, First Stand communs aux 6 régions"],
  ["collect/careers · residency · team_history · soloq", "Périodes en club, titres, récompenses ; résidence officielle et double nationalité ; résultats et matchs des équipes ; ladder EUW et profils soloQ"],
  ["analysis/league_strength · league_talent", "Coefficient de chaque ligue (EMEA Masters, tournois de 2e division, niveau des joueurs)"],
  ["analysis/prospects · promotions", "Score de prospect (z-scores pondérés, bonus, forme) ; montées d'une saison à l'autre"],
  ["analysis/world_score", "Score mondial (Bradley-Terry sur l'international)"],
  ["model/promotion_model", "Modèle de montée (logistique numpy + LightGBM), 1re et 2e division"],
  ["mercato/ (mercato · rosters)", "Rosters et mercato : rumeurs / transferts Leaguepedia, contrats (GCD), coachs, scoops Sheep"],
  ["export/ (site · settings)", "Export JSON du site (web/data : serveur ; web/public/data : navigateur), réglages pour cette page"],
  ["corrections/", "Corrections à la main versionnées : dates de naissance, postes du mercato, équipes renommées, comptes soloQ, homonymes"],
];
const WEB: [string, string][] = [
  ["Next.js 15 (App Router)", "≈ 10 000 pages générées au build (SSG) ; fiches PDF et pages rares générées à la première visite puis en cache (ISR)"],
  ["React 19 · TypeScript", "Composants serveur pour les données, composants client pour l'interactif"],
  ["Tailwind CSS 4", "Thème sombre / clair par variables CSS (globals.css), impression A4 dédiée"],
  ["Radix UI (style shadcn/ui)", "Dialog, Popover, Tabs, Checkbox accessibles (components/ui)"],
  ["TanStack Table + Virtual", "Tableau Données : tri, colonnes, 1 000+ lignes virtualisées"],
  ["nuqs", "Filtres de Données dans l'URL (liens partageables)"],
  ["API routes", "/api/mercato (mise à jour en direct), /api/watch (liste ⭐ + alertes Discord), /api/deep (analyse soloQ), /api/search (index statique)"],
  ["Upstash Redis", "Mercato en direct, liste de suivi, tâches d'analyse"],
  ["Vercel", "Hébergement, déploiement à chaque push sur main"],
  ["GitHub Actions", "Vérification données + types + build à chaque push ; mercato toutes les heures (6 régions)"],
];

function StackTab() {
  return (
    <div className="space-y-6">
      <Block title="Flux de données">
        <F>{`Leaguepedia (Cargo) ─┐
Oracle's Elixir (CSV)─┼─► data/<région>/*.csv ─► analysis / model ─► export ─► web/data (JSON)
API Riot (soloQ) ─────┤                                                              │
Google News (Sheep) ──┘                                     git push ─► Vercel (build Next.js) ─► site
                                          Upstash Redis ◄─► /api/mercato (mises à jour entre deux exports)`}</F>
      </Block>
      <Block title="Pipeline Python, dossier scouting/ (PC : python run_all.py)">
        <KV items={PIPELINE.map(([k, v]) => [k, <span key={k} className="font-sans text-xs text-ink-2">{v}</span>])} />
      </Block>
      <Block title="Site (dossier web/)">
        <KV items={WEB.map(([k, v]) => [k, <span key={k} className="font-sans text-xs text-ink-2">{v}</span>])} />
      </Block>
    </div>
  );
}

export default function TechniquePage() {
  const c = config();
  return (
    <div className="space-y-4">
      <div>
        <div className="eyebrow mb-1">Mode développeur</div>
        <h1 className="text-xl font-semibold">Technique</h1>
        <p className="max-w-3xl text-sm text-ink-2">
          Comment sont calculés le score des joueurs, le modèle de montée et le score mondial, ce que veut dire chaque stat, et sur quoi
          tourne le site. Les valeurs sont lues dans les fichiers exportés : elles suivent les réglages réels.
        </p>
      </div>
      <Tabs defaultValue="score">
        <TabsList aria-label="Sections techniques">
          <TabsTrigger value="score">Score de performance</TabsTrigger>
          <TabsTrigger value="model">Modèle de montée</TabsTrigger>
          <TabsTrigger value="world">Score mondial</TabsTrigger>
          <TabsTrigger value="stats">Stats des joueurs</TabsTrigger>
          <TabsTrigger value="stack">Stack technique</TabsTrigger>
        </TabsList>
        <div className="card mt-3 p-5">
          <TabsContent value="score">
            <ScoreTab c={c} />
          </TabsContent>
          <TabsContent value="model">
            <ModelTab />
          </TabsContent>
          <TabsContent value="world">
            <WorldTab />
          </TabsContent>
          <TabsContent value="stats">
            <StatsTab />
          </TabsContent>
          <TabsContent value="stack">
            <StackTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
