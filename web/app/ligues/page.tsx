import Link from "next/link";
import SeasonTabs from "@/components/SeasonTabs";
import { getLeagues, getMeta } from "@/lib/data";
import { TIER_COLOR } from "@/lib/tiers";
import type { League, LeaguePlayerRef, LeagueSeason } from "@/lib/types";

export const metadata = { title: "Ligues · LoL Scouting" };

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;
const lastName = (l: League) => Object.values(l.names).at(-1) ?? l.code;

function Players({ list, empty = "–" }: { list: LeaguePlayerRef[]; empty?: string }) {
  if (!list.length) return <span className="text-ink-3">{empty}</span>;
  return (
    <ul className="space-y-0.5">
      {list.map((p) => (
        <li key={p.name} className="whitespace-nowrap">
          {p.id ? (
            <Link href={`/joueurs/${p.id}`} className="hover:underline">
              {p.name.replace(/ \(.*\)$/, "")}
            </Link>
          ) : (
            p.name
          )}{" "}
          <span className="text-ink-3">{p.team}</span>
          {p.value !== undefined && p.value < 0.99 && (
            <span className="text-ink-3" title="Montée vers une ERL1 moins forte que celle du pays : compte en partie">
              {" "}
              (×{p.value.toFixed(1)})
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Nombre cliquable qui déplie la liste des joueurs */
function Count({ n, total, list }: { n: number | null; total: number; list: LeaguePlayerRef[] }) {
  if (n === null) return <span className="text-ink-3" title="Saison suivante pas encore connue">?</span>;
  const label = (
    <>
      {n} <span className="text-ink-3">/ {total}</span>
    </>
  );
  if (!list.length) return label;
  return (
    <details className="group inline-block text-left">
      <summary className="cursor-pointer list-none underline decoration-dotted underline-offset-2">{label}</summary>
      <div className="absolute z-10 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-surface p-2 text-xs shadow-lg">
        <Players list={list} />
      </div>
    </details>
  );
}

function CoefBar({ value, max }: { value: number; max: number }) {
  const w = Math.max(0, Math.min(1, value / max));
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-20 rounded-full bg-surface-2">
        <span className="block h-1.5 rounded-full" style={{ width: `${w * 100}%`, background: "var(--accent)" }} />
      </span>
      <span className="w-10 text-right font-medium">{value.toFixed(2)}</span>
    </span>
  );
}

function SeasonTable({ leagues, season, tier }: { leagues: League[]; season: string; tier: "ERL1" | "ERL2" }) {
  const rows = leagues
    .filter((l) => l.tier === tier && l.seasons?.[season]?.coef != null)
    .map((l) => ({ l, s: l.seasons![season] as LeagueSeason }))
    .sort((a, b) => (b.s.coef ?? 0) - (a.s.coef ?? 0));
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.s.coef ?? 0), 1);
  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full whitespace-nowrap text-sm">
        <thead className="border-b border-border text-xs text-ink-3">
          <tr>
            <th className="px-2 py-2 text-left font-medium">Ligue</th>
            <th className="px-2 py-2 text-left font-medium">Coef de la saison</th>
            <th className="px-2 py-2 text-right font-medium" title={tier === "ERL1" ? "Placements à l'EMEA Masters sur 2 ans" : "Coef EM de l'ERL1 du pays − décote"}>
              {tier === "ERL1" ? "EMEA Masters" : "ERL1 du pays − décote"}
            </th>
            <th className="px-2 py-2 text-right font-medium" title="Ajustement selon les joueurs de la ligue cette saison">
              Niveau des joueurs
            </th>
            <th className="px-2 py-2 text-right font-medium">Titulaires</th>
            {tier === "ERL1" ? (
              <th className="px-2 py-2 text-right font-medium" title="Titulaires déjà passés par la LEC">
                Ex-LEC
              </th>
            ) : (
              <th className="px-2 py-2 text-right font-medium" title="Titulaires passés par l'ERL1 la saison d'avant (ou par la LEC)">
                Passés par l&apos;ERL1
              </th>
            )}
            <th className="px-2 py-2 text-right font-medium" title={tier === "ERL1" ? "Titulaires en LEC la saison suivante" : "Titulaires en ERL1 ou LEC la saison suivante"}>
              Montés l&apos;année d&apos;après
            </th>
            {tier === "ERL2" && (
              <th className="px-2 py-2 text-right font-medium" title="Victoires contre les équipes de l'ERL1 du pays (Invitational, promotion...)">
                vs ERL1 du pays
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ l, s }) => {
            const delta = (s.coef ?? 0) - (s.base ?? 0);
            return (
              <tr key={l.code} className="border-b border-border last:border-0 hover:bg-surface-2">
                <td className="px-2 py-1.5">
                  <span className="font-medium">{l.code}</span>{" "}
                  <span className="text-xs text-ink-3">{l.names[season] ?? lastName(l)}</span>
                </td>
                <td className="px-2 py-1.5">
                  <CoefBar value={s.coef ?? 0} max={max} />
                </td>
                <td className="px-2 py-1.5 text-right text-ink-2">{(s.base ?? 0).toFixed(2)}</td>
                <td
                  className="px-2 py-1.5 text-right"
                  style={{ color: Math.abs(delta) < 0.005 ? "var(--text-3)" : delta > 0 ? "var(--good-text)" : "var(--critical)" }}
                >
                  {signed(delta)}
                </td>
                <td className="px-2 py-1.5 text-right text-ink-2">{s.starters}</td>
                <td className="relative px-2 py-1.5 text-right">
                  {tier === "ERL1" ? (
                    <Count n={s.ex_lec} total={s.starters} list={s.ex_lec_players} />
                  ) : s.above === null ? (
                    <span className="text-ink-3" title="Pas de données de la saison d'avant">?</span>
                  ) : (
                    <>
                      {s.above} <span className="text-ink-3">/ {s.starters}</span>
                    </>
                  )}
                </td>
                <td className="relative px-2 py-1.5 text-right">
                  <Count n={s.up} total={s.starters} list={s.up_players} />
                </td>
                {tier === "ERL2" && (
                  <td className="px-2 py-1.5 text-right text-ink-2">
                    {s.cross_games ? (
                      <>
                        {s.cross_wins}–{s.cross_games - s.cross_wins}
                      </>
                    ) : (
                      <span className="text-ink-3">–</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Evolution({ leagues, seasons }: { leagues: League[]; seasons: string[] }) {
  const rows = leagues
    .filter((l) => (l.tier === "ERL1" || l.tier === "ERL2") && l.seasons && Object.keys(l.seasons).length > 1)
    .sort((a, b) => (a.tier === b.tier ? b.coef - a.coef : a.tier.localeCompare(b.tier)));
  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full whitespace-nowrap text-sm">
        <thead className="border-b border-border text-xs text-ink-3">
          <tr>
            <th className="px-2 py-2 text-left font-medium">Ligue</th>
            {seasons.map((s) => (
              <th key={s} className="px-2 py-2 text-right font-medium">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.code} className="border-b border-border last:border-0 hover:bg-surface-2">
              <td className="px-2 py-1.5">
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: TIER_COLOR[l.tier] }} />
                <span className="font-medium">{l.code}</span> <span className="text-xs text-ink-3">{l.tier}</span>
              </td>
              {seasons.map((s, i) => {
                const cur = l.seasons?.[s]?.coef;
                const prev = i > 0 ? l.seasons?.[seasons[i - 1]]?.coef : undefined;
                const d = cur != null && prev != null ? cur - prev : null;
                return (
                  <td key={s} className="px-2 py-1.5 text-right">
                    {cur == null ? (
                      <span className="text-ink-3">–</span>
                    ) : (
                      <>
                        {cur.toFixed(2)}
                        {d !== null && Math.abs(d) >= 0.03 && (
                          <span className="ml-1 text-xs" style={{ color: d > 0 ? "var(--good-text)" : "var(--critical)" }}>
                            {d > 0 ? "▲" : "▼"}
                          </span>
                        )}
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LiguesPage() {
  const leagues = getLeagues();
  const meta = getMeta();
  const hasSeasons = leagues.some((l) => l.seasons && Object.keys(l.seasons).length);
  const seasons = meta.seasons.map(String);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Ligues</h1>
        <p className="max-w-3xl text-sm text-ink-2">
          Niveau de chaque ligue, saison par saison. Le coefficient part des résultats à l&apos;EMEA Masters sur 2 ans
          (pour une ERL2 : l&apos;ERL1 du pays moins une décote), puis s&apos;ajuste selon les joueurs de la ligue cette
          saison : anciens joueurs de LEC, joueurs passés par la division du dessus, joueurs montés l&apos;année
          suivante, et résultats d&apos;une ERL2 contre l&apos;ERL1 de son pays. Un joueur monté ne profite pas de sa
          propre montée dans le calcul de son score.
        </p>
      </div>

      {!hasSeasons ? (
        <p className="text-sm text-ink-3">Relance <code>python scout.py export</code> pour générer le niveau des ligues par saison.</p>
      ) : (
        <>
          <section className="card p-4">
            <h2 className="text-sm font-semibold">Évolution du coefficient</h2>
            <p className="mt-0.5 text-xs text-ink-3">▲ ▼ : variation d&apos;au moins 0,03 par rapport à la saison d&apos;avant.</p>
            <div className="mt-3">
              <Evolution leagues={leagues} seasons={seasons} />
            </div>
          </section>

          <SeasonTabs
            items={[...seasons].reverse().map((season) => ({
              key: season,
              label: season,
              content: (
                <div className="space-y-6">
                  {(["ERL1", "ERL2"] as const).map((tier) => (
                    <section key={tier} className="card p-4">
                      <h2 className="text-sm font-semibold">
                        {tier} {season}
                      </h2>
                      <p className="mt-0.5 text-xs text-ink-3">
                        {tier === "ERL1"
                          ? "Clique sur un nombre pour voir les joueurs. « ? » : saison suivante pas encore connue."
                          : "Une montée vers une ERL1 plus faible que celle du pays compte en partie (ex : LFL2 → LPLOL)."}
                      </p>
                      <div className="mt-3">
                        <SeasonTable leagues={leagues} season={season} tier={tier} />
                      </div>
                    </section>
                  ))}
                </div>
              ),
            }))}
          />
        </>
      )}
    </div>
  );
}
