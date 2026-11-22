import Link from "next/link";
import { Avatar, TeamLogo } from "@/components/Images";
import { getPromotionModel, getRankings, type PromotionModel } from "@/lib/data";
import { playerLink, REGION_INFO, type Region } from "@/lib/region";
import type { RankingRow } from "@/lib/types";

const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"];
const pct = (x: number | null | undefined, digits = 0) => (x === null || x === undefined ? "–" : `${(100 * x).toFixed(digits)} %`);
const short = (n: string) => n.replace(/\s*\(.*\)$/, "");

function Chance({ p }: { p: number }) {
  return (
    <span
      className="inline-flex min-w-11 justify-center rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums"
      style={{ background: `color-mix(in srgb, var(--gold) ${Math.min(65, Math.round(p * 85) + 8)}%, transparent)`, color: p >= 0.3 ? "var(--text)" : "var(--text-2)" }}
    >
      {p < 0.01 ? "<1" : Math.round(p * 100)} %
    </span>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div className="h-full rounded-full" style={{ width: `${Math.max(3, (100 * value) / (max || 1))}%`, background: color }} />
    </div>
  );
}

export default function PromotionModelView({ region }: { region: Region }) {
  const model = getPromotionModel();
  const chances = model?.players[region];
  if (!model || !chances) return null;
  const R = REGION_INFO[region];
  const rows = new Map<string, RankingRow>();
  for (const r of getRankings(region)) if (r.season === model.season && (!rows.has(r.id) || r.games > rows.get(r.id)!.games)) rows.set(r.id, r);
  const list = Object.entries(chances)
    .map(([id, c]) => ({ id, ...c, row: rows.get(id) }))
    .filter((x) => x.row);
  const rates = model.role_rates[region] ?? model.role_rates.all;
  const all = model.role_rates.all;
  const maxRate = Math.max(...ROLES.map((r) => rates[r]?.rate ?? 0));
  const live = model.live.players.filter((p) => p.region === region);
  const v = model.validation;

  return (
    <section className="card space-y-6 p-5">
      <div>
        <div className="eyebrow mb-1">Modèle de montée · appris sur {model.trained_on.join(", ")} → saison suivante</div>
        <h2 className="text-lg font-semibold tracking-tight">
          Qui va jouer en {R.top} en {model.target} ?
        </h2>
        <p className="mt-1 max-w-4xl text-sm text-ink-2">
          Probabilité, pour chaque joueur de {R.lower}, de jouer en {R.top} la saison prochaine (au début ou en cours de
          saison). Le modèle a appris sur les {v.promoted} montées réelles des six régions depuis 2023. Il regarde le rang du joueur
          dans son poste, son score, sa forme, sa progression, son âge, son expérience, ses stats clés, l&apos;académie d&apos;un
          club de 1re division, et le poste : certains postes montent plus facilement que d&apos;autres. Ce n&apos;est pas une
          vérité : un mercato dépend aussi des places libres, des contrats et des relations entre clubs.
        </p>
      </div>

      {/* Fiabilité */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Quality
          label="Repère les montés"
          value={pct(v.top3_share)}
          hint={`des montés étaient dans le top 3 prédit de leur poste (score seul : ${pct(model.baseline.top3_share)})`}
        />
        <Quality label="Classement (AUC)" value={v.auc.toFixed(2)} hint={`1 = parfait, 0.5 = hasard ; score seul ${model.baseline.auc.toFixed(2)}`} />
        <Quality
          label={`Test sur ${model.trained_on.at(-1)}`}
          value={model.forward.auc.toFixed(2)}
          hint={`appris seulement sur les saisons d'avant : top 3 ${pct(model.forward.top3_share)}`}
        />
        <Quality
          label={`Mercato ${model.target} en cours`}
          value={`${live.filter((x) => x.rank_role <= 3).length}/${live.length}`}
          hint={live.length ? `montées déjà connues dans le top 3 prédit de leur poste` : "pas encore de montée connue"}
        />
      </div>

      {/* Meilleures chances par poste */}
      <div>
        <h3 className="mb-2 text-sm font-semibold">Meilleures chances par poste</h3>
        <div className="grid gap-4 md:grid-cols-5">
          {ROLES.map((role) => (
            <div key={role}>
              <div className="eyebrow mb-2 flex items-center justify-between">
                {role}
                <span className="normal-case tracking-normal text-ink-3" title={`Montées par saison à ce poste dans la région (${model.trained_on.join(", ")})`}>
                  ~{rates[role]?.per_season ?? "?"} / saison
                </span>
              </div>
              <ol className="space-y-1">
                {list
                  .filter((x) => x.row!.role === role)
                  .sort((a, b) => b.p - a.p)
                  .slice(0, 6)
                  .map((x) => (
                    <li key={x.id}>
                      <Link
                        href={playerLink(region, x.id)}
                        className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-surface-2"
                        title={x.factors.map(([n, c]) => `${c >= 0 ? "+" : "−"} ${n}`).join("\n")}
                      >
                        <Avatar name={x.row!.name} src={x.row!.photo} size={30} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{short(x.row!.name)}</div>
                          <div className="flex items-center gap-1 truncate text-[11px] text-ink-3">
                            <TeamLogo team={x.row!.current_team ?? x.row!.team} src={x.row!.current_logo ?? x.row!.logo} size={12} />
                            <span className="truncate">
                              {x.row!.league_code}
                              {x.row!.age !== undefined && ` · ${x.row!.age} ans`}
                            </span>
                          </div>
                          {x.official && (
                            <div className="truncate text-[10px] font-semibold" style={{ color: "var(--good-text)" }}>
                              ✓ {x.official.team ?? R.top}
                            </div>
                          )}
                        </div>
                        <Chance p={x.p} />
                      </Link>
                    </li>
                  ))}
              </ol>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Postes : plus ou moins faciles */}
        <div>
          <h3 className="text-sm font-semibold">Monter selon le poste</h3>
          <p className="mb-2 text-xs text-ink-3">
            Sur {model.trained_on.join(", ")} : part des joueurs de {R.lower} qui jouent en {R.top} la saison suivante, et part
            des 3 meilleurs du poste (au score) qui y arrivent. Toutes régions entre parenthèses.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-3">
                <th className="pb-1 font-medium">Poste</th>
                <th className="pb-1 font-medium">Taux de montée</th>
                <th className="pb-1 text-right font-medium">Par saison</th>
                <th className="pb-1 text-right font-medium">Top 3 qui montent</th>
              </tr>
            </thead>
            <tbody>
              {ROLES.map((role) => {
                const r = rates[role];
                const a = all[role];
                return (
                  <tr key={role} className="border-t border-border">
                    <td className="py-1.5 font-medium">{role}</td>
                    <td className="py-1.5 pr-3">
                      <div className="flex items-center gap-2">
                        <div className="w-24">
                          <Bar value={r?.rate ?? 0} max={maxRate} color="var(--accent)" />
                        </div>
                        <span className="tabular-nums">{pct(r?.rate, 1)}</span>
                        <span className="text-[11px] text-ink-3">({pct(a?.rate, 1)})</span>
                      </div>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{r?.per_season ?? "–"}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {pct(r?.top3_rate)} <span className="text-[11px] text-ink-3">({pct(a?.top3_rate)})</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Profils qui montent */}
        <div>
          <h3 className="text-sm font-semibold">Le profil de ceux qui montent, par poste</h3>
          <p className="mb-2 text-xs text-ink-3">
            Parmi les 10 meilleurs de chaque poste (six régions, {model.trained_on.join(", ")}) : ce qui distingue ceux qui sont
            montés des autres (en écarts-types ; vert = plus élevé chez les montés).
          </p>
          <div className="space-y-2.5">
            {ROLES.filter((r) => model.role_profiles[r]).map((role) => {
              const p = model.role_profiles[role];
              return (
                <div key={role}>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="font-semibold">{role}</span>
                    <span className="text-ink-3">
                      {p.promoted} montés · {p.age_up} ans en moyenne (autres : {p.age_stay})
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.diffs.map(([name, d]) => (
                      <span
                        key={name}
                        className="rounded px-1.5 py-0.5 text-[11px]"
                        style={{
                          background: `color-mix(in srgb, ${d >= 0 ? "var(--good)" : "var(--critical)"} ${Math.min(40, Math.round(Math.abs(d) * 45))}%, transparent)`,
                        }}
                      >
                        {d >= 0 ? "▲" : "▼"} {name} {Math.abs(d).toFixed(1)}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <details className="rounded-lg border border-border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Ce que regarde le modèle, et sa calibration</summary>
        <div className="mt-3 grid gap-6 lg:grid-cols-2">
          <Coefs model={model} />
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Calibration (saisons non vues)</h4>
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="text-left text-ink-3">
                  <th className="font-medium">Prédit</th>
                  <th className="text-right font-medium">Joueurs</th>
                  <th className="text-right font-medium">Prédit en moyenne</th>
                  <th className="text-right font-medium">Vraiment montés</th>
                </tr>
              </thead>
              <tbody>
                {model.calibration.map((c) => (
                  <tr key={c.from} className="border-t border-border">
                    <td className="py-0.5">
                      {Math.round(c.from * 100)}–{Math.round(c.to * 100)} %
                    </td>
                    <td className="text-right">{c.n}</td>
                    <td className="text-right">{pct(c.predicted, 1)}</td>
                    <td className="text-right font-semibold">{pct(c.observed, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-ink-3">
              Quand le modèle annonce 26 %, environ un joueur sur quatre monte vraiment : les pourcentages se lisent tels quels.
              Régression logistique régularisée, validée en prédisant chaque saison avec un modèle qui ne l&apos;a pas vue.
            </p>
          </div>
        </div>
      </details>
    </section>
  );
}

function Quality({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <div className="text-[11px] uppercase tracking-wide text-ink-3">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-ink-3">{hint}</div>
    </div>
  );
}

function Coefs({ model }: { model: PromotionModel }) {
  const list = model.coefficients.filter((c) => !c.key.startsWith("Région") && !c.key.startsWith("Rang ×") && !c.key.startsWith("Poste") && c.key !== "Âge²").slice(0, 14);
  const max = Math.max(...list.map((c) => Math.abs(c.coef)));
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Poids des variables</h4>
      <ul className="space-y-1">
        {list.map((c) => (
          <li key={c.key} className="grid grid-cols-[minmax(0,13rem)_1fr_3rem] items-center gap-2 text-xs">
            <span className="truncate text-ink-2">{c.name}</span>
            <div className="relative h-2 rounded-full bg-surface-2">
              <div
                className="absolute top-0 h-2 rounded-full"
                style={{
                  left: c.coef >= 0 ? "50%" : `${50 - (50 * Math.abs(c.coef)) / max}%`,
                  width: `${(50 * Math.abs(c.coef)) / max}%`,
                  background: c.coef >= 0 ? "var(--good)" : "var(--critical)",
                }}
              />
              <div className="absolute left-1/2 top-[-2px] h-3 w-px bg-ink-3" />
            </div>
            <span className="text-right tabular-nums">{c.coef >= 0 ? "+" : "−"}{Math.abs(c.coef).toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-ink-3">
        Effet d&apos;un écart-type de la variable sur la cote de monter, les autres étant égales. « Niveau de la ligue » est négatif car
        il est déjà compté dans le score : à score égal, le meilleur d&apos;une petite ligue monte aussi souvent.
      </p>
    </div>
  );
}
