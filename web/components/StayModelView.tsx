import Link from "next/link";
import { Avatar, TeamLogo } from "@/components/Images";
import { getPromotionModel, getRankings } from "@/lib/data";
import { publishedSigned } from "@/lib/mercato/abroad";
import { playerLink, REGION_INFO, type Region } from "@/lib/region";
import type { RankingRow } from "@/lib/types";

const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"];
const pct = (x: number) => `${Math.round(100 * x)} %`;
const short = (n: string) => n.replace(/\s*\(.*\)$/, "");

/** Modèle de maintien : joueurs de 1re division dont la place est la plus menacée */
export default function StayModelView({ region }: { region: Region }) {
  const model = getPromotionModel()?.stay;
  const chances = model?.players[region];
  if (!model || !chances) return null;
  const R = REGION_INFO[region];
  const rows = new Map<string, RankingRow>();
  for (const r of getRankings(region)) if (r.season === model.season && (!rows.has(r.id) || r.games > rows.get(r.id)!.games)) rows.set(r.id, r);
  const signed = publishedSigned(region);
  const list = Object.entries(chances)
    .map(([id, c]) => ({ id, ...c, row: rows.get(id) }))
    .filter((x) => x.row);
  const v = model.validation;
  const rate = model.rates[region];
  return (
    <section className="card space-y-4 p-5">
      <div>
        <div className="eyebrow mb-1">
          Modèle de maintien · {model.model} · validé sur {model.validated_on.join(", ")}
        </div>
        <h2 className="text-lg font-semibold tracking-tight">
          Qui va perdre sa place en {R.top} en {model.target} ?
        </h2>
        <p className="mt-1 max-w-4xl text-sm text-ink-2">
          Pour les joueurs de {R.top} (et les montés en cours de saison) : probabilité de jouer encore en 1re division la saison
          prochaine, ici ou dans une autre région. {rate ? `En moyenne ${pct(rate.rate)} y restent` : ""}
          {rate?.mid_season != null ? `, ${pct(rate.mid_season)} des montés en cours de saison` : ""}. Fiabilité : AUC{" "}
          {v.auc.toFixed(2)} en validation, {model.forward.auc.toFixed(2)} en test sur {model.validated_on[model.validated_on.length - 1]}{" "}
          (taux moyen seul {model.baseline.auc.toFixed(2)}). Ce qui compte le plus : la place de titulaire (surtout au dernier split), les résultats de
          l&apos;équipe, le score en 1re division, l&apos;expérience et l&apos;âge. Les 5 places les plus menacées de chaque poste :
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-5">
        {ROLES.map((role) => (
          <div key={role}>
            <div className="eyebrow mb-2">{role}</div>
            <ol className="space-y-1">
              {list
                .filter((x) => x.row!.role === role)
                .sort((a, b) => a.p - b.p)
                .slice(0, 5)
                .map((x) => {
                  const sg = signed[x.id];
                  return (
                    <li key={x.id}>
                      <Link href={playerLink(region, x.id)} className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-surface-2">
                        <Avatar name={x.row!.name} src={x.row!.photo} size={28} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{short(x.row!.name)}</div>
                          <div className="flex items-center gap-1 truncate text-[11px] text-ink-3">
                            <TeamLogo team={x.team} src={x.row!.team === x.team ? x.row!.logo : undefined} size={12} />
                            <span className="truncate">
                              {x.team} · {x.games} p.{x.mid_season ? " · monté en cours" : ""}
                            </span>
                          </div>
                          {sg && (
                            <div className="truncate text-[10px] font-semibold" style={{ color: sg.official ? "var(--good-text)" : "var(--gold)" }}>
                              {sg.stays ? "✓ reste" : `→ ${sg.team}`}
                              {sg.kind === "rumor" ? " (rumeur)" : ""}
                            </div>
                          )}
                        </div>
                        <span
                          className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums"
                          style={{ background: `color-mix(in srgb, var(--accent) ${Math.min(45, Math.round(x.p * 45))}%, transparent)`, color: "var(--text)" }}
                        >
                          {pct(x.p)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
