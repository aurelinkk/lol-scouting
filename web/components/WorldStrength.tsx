import { REGION_INFO, type Region, REGIONS } from "@/lib/region";
import { WORLD, winProbability } from "@/lib/world";

const pct = (x: number) => `${Math.round(100 * x)} %`;
const sign = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}`;

/** Niveau des régions d'après l'international (python world_scale.py) */
export default function WorldStrength({ compact = false }: { compact?: boolean }) {
  const seasons = Object.keys(WORLD.seasons).map(Number).sort();
  const last = seasons.at(-1);
  if (last === undefined) return null;
  const cur = WORLD.seasons[String(last)];
  const regions = REGIONS.filter((r) => cur[r]).sort(
    (a, b) => cur[b]!.top_mean + cur[b]!.offset - (cur[a]!.top_mean + cur[a]!.offset),
  );
  const level = (r: Region, s: number) => {
    const v = WORLD.seasons[String(s)]?.[r];
    return v ? v.top_mean + v.offset : null;
  };
  const max = Math.max(...regions.map((r) => level(r, last) ?? 0));
  const min = Math.min(0, ...regions.map((r) => level(r, last) ?? 0));

  return (
    <div className="space-y-5">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-3">
              <th className="pb-2 font-medium">Région</th>
              <th className="pb-2 font-medium" title="Score mondial moyen d'un titulaire de 1re division (échelle LEC)">
                Titulaire moyen {last}
              </th>
              <th className="pb-2 text-right font-medium" title="Chance qu'une équipe de cette région batte une équipe européenne, d'après l'international">
                vs Europe
              </th>
              <th className="pb-2 text-right font-medium" title="Parties internationales contre les autres régions suivies, cette saison">
                International {last}
              </th>
              {!compact &&
                seasons.slice(0, -1).map((s) => (
                  <th key={s} className="pb-2 text-right font-medium" title={`Titulaire moyen ${s}`}>
                    {s}
                  </th>
                ))}
              <th className="pb-2 text-right font-medium" title="Décalage ajouté au score de la région pour le passer à l'échelle LEC">
                Décalage
              </th>
            </tr>
          </thead>
          <tbody>
            {regions.map((r) => {
              const v = cur[r]!;
              const lv = level(r, last)!;
              const p = winProbability(r, "eu", last);
              return (
                <tr key={r} className="border-t border-border">
                  <td className="py-1.5 pr-3">
                    <span className="font-medium">{REGION_INFO[r].top}</span>{" "}
                    <span className="text-xs text-ink-3">{REGION_INFO[r].short}</span>
                  </td>
                  <td className="py-1.5 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-28 overflow-hidden rounded-full bg-surface-2 sm:w-40">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(100 * (lv - min)) / (max - min || 1)}%`,
                            background: r === "eu" ? "var(--accent)" : "var(--gold)",
                          }}
                        />
                      </div>
                      <span className="tabular-nums font-semibold">{sign(lv)}</span>
                    </div>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {r === "eu" ? <span className="text-ink-3">–</span> : p !== null ? pct(p) : "?"}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-ink-2">
                    {v.games ? `${v.wins}-${v.games - v.wins} (${pct(v.wins / v.games)})` : "–"}
                  </td>
                  {!compact &&
                    seasons.slice(0, -1).map((s) => {
                      const x = level(r, s);
                      return (
                        <td key={s} className="py-1.5 text-right tabular-nums text-ink-3">
                          {x === null ? "–" : sign(x)}
                        </td>
                      );
                    })}
                  <td className="py-1.5 text-right tabular-nums text-ink-3">{sign(v.offset)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!compact && (
        <div>
          <div className="eyebrow mb-2">Face-à-face à l&apos;international, {seasons[0]}-{last}</div>
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  <th />
                  {regions.map((c) => (
                    <th key={c} className="px-2 pb-1 font-semibold text-ink-2">{REGION_INFO[c].short}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {regions.map((r) => (
                  <tr key={r}>
                    <th className="pr-2 text-left font-semibold text-ink-2">{REGION_INFO[r].short}</th>
                    {regions.map((c) => {
                      const cell = WORLD.h2h[r]?.[c];
                      if (r === c || !cell) return <td key={c} className="px-2 py-1 text-center text-ink-3">·</td>;
                      const wr = cell[0] / cell[1];
                      return (
                        <td
                          key={c}
                          className="px-2 py-1 text-center tabular-nums"
                          style={{ background: `color-mix(in srgb, ${wr >= 0.5 ? "var(--good)" : "var(--critical)"} ${Math.round(Math.abs(wr - 0.5) * 120)}%, transparent)` }}
                          title={`${REGION_INFO[r].top} contre ${REGION_INFO[c].top} : ${cell[0]} victoires sur ${cell[1]} parties`}
                        >
                          {cell[0]}-{cell[1] - cell[0]}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[11px] text-ink-3">Ligne contre colonne (victoires-défaites).</p>
        </div>
      )}
    </div>
  );
}
