import Link from "next/link";
import { Avatar, TeamLogo } from "@/components/Images";
import { getPromotionModel, getRankings } from "@/lib/data";
import { playerLink, REGION_INFO, type Region, tierName } from "@/lib/region";
import type { RankingRow } from "@/lib/types";

const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"];
const pct = (x: number) => `${Math.round(100 * x)} %`;
const short = (n: string) => n.replace(/\s*\(.*\)$/, "");

/** Modèle 3e -> 2e division (Europe, Corée), même méthode que le modèle de montée */
export default function Tier2ModelView({ region }: { region: Region }) {
  const model = getPromotionModel()?.tier2;
  const chances = model?.players[region];
  if (!model || !chances) return null;
  const R = REGION_INFO[region];
  const rows = new Map<string, RankingRow>();
  for (const r of getRankings(region)) if (r.season === model.season && (!rows.has(r.id) || r.games > rows.get(r.id)!.games)) rows.set(r.id, r);
  const list = Object.entries(chances)
    .map(([id, c]) => ({ id, ...c, row: rows.get(id) }))
    .filter((x) => x.row);
  const v = model.validation;
  const base = v.promoted / v.n;
  return (
    <section className="card space-y-4 p-5">
      <div>
        <div className="eyebrow mb-1">
          Modèle 3e → 2e division · {model.model ?? "Régression logistique"} · validé sur {(model.validated_on ?? model.trained_on).join(", ")}
        </div>
        <h2 className="text-lg font-semibold tracking-tight">
          Qui va monter en {tierName("ERL1", region)} en {model.target} ?
        </h2>
        <p className="mt-1 max-w-4xl text-sm text-ink-2">
          Pour les joueurs de {tierName("ERL2", region)} : probabilité de jouer en 2e division (ou plus haut) la saison prochaine.
          Moins fiable que le modèle de 1re division (AUC {v.auc.toFixed(2)}, score seul {model.baseline.auc.toFixed(2)}) : chaque
          année {pct(base)} des joueurs de 3e division montent, souvent avec toute leur équipe via un tournoi de promotion, ce que
          les stats individuelles prévoient mal.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-5">
        {ROLES.map((role) => (
          <div key={role}>
            <div className="eyebrow mb-2">{role}</div>
            <ol className="space-y-1">
              {list
                .filter((x) => x.row!.role === role)
                .sort((a, b) => b.p - a.p)
                .slice(0, 5)
                .map((x) => (
                  <li key={x.id}>
                    <Link href={playerLink(region, x.id)} className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-surface-2">
                      <Avatar name={x.row!.name} src={x.row!.photo} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{short(x.row!.name)}</div>
                        <div className="flex items-center gap-1 truncate text-[11px] text-ink-3">
                          <TeamLogo team={x.row!.team} src={x.row!.logo} size={12} />
                          <span className="truncate">
                            {x.row!.league_code}
                            {x.row!.age !== undefined && ` · ${x.row!.age} ans`}
                          </span>
                        </div>
                        {x.official && (
                          <div className="truncate text-[10px] font-semibold" style={{ color: x.official.rumor ? "var(--gold)" : "var(--good-text)" }}>
                            {x.official.rumor ? "→" : "✓"} {x.official.team}
                          </div>
                        )}
                      </div>
                      <span
                        className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums"
                        style={{ background: `color-mix(in srgb, var(--series-3) ${Math.min(60, Math.round(x.p * 70) + 8)}%, transparent)`, color: "var(--text)" }}
                      >
                        {pct(x.p)}
                      </span>
                    </Link>
                  </li>
                ))}
            </ol>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-ink-3">
        {R.name} · {model.live.known} montées en {tierName("ERL1", region)} déjà connues pour {model.target} (toutes régions concernées), dont{" "}
        {model.live.in_top3} dans le top 3 prédit de leur poste.
      </p>
    </section>
  );
}
