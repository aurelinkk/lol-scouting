import { notFound } from "next/navigation";
import { Avatar, TeamLogo } from "@/components/Images";
import RegionMissing from "@/components/RegionMissing";
import { ScoutNotes, SheetToolbar } from "@/components/SheetTools";
import { getMercato, getMeta, getPlayer, hasRegion } from "@/lib/data";
import { fmtScore, fmtStat, STAT_LABELS, topPercent } from "@/lib/format";
import { contractsFromMercato } from "@/lib/mercato/signed";
import { originLabel, originOf } from "@/lib/origin";
import { playerProfile } from "@/lib/profile";
import { link, playerLink, REGION_INFO, type Region, tierName } from "@/lib/region";
import { similarPlayers } from "@/lib/similar";
import type { StatKey } from "@/lib/types";
import { worldScore } from "@/lib/world";

export function sheetMetadata(id: string, region: Region) {
  if (!hasRegion(region)) return { title: "LoL Scouting" };
  const p = getPlayer(id, region);
  return { title: p ? `Fiche ${p.name.replace(/\s*\(.*\)$/, "")} · LoL Scouting` : "Joueur introuvable" };
}

const STATS: StatKey[] = [
  "winrate", "kda", "kp", "deaths_pg", "csd15", "gd15", "xpd15", "ka15", "cs_min", "gold_min",
  "dpm", "dpm_vs_champ", "dmg_share", "gold_share", "vision_min", "fb_part", "champions",
];
const SPLIT: StatKey[] = ["winrate", "kda", "csd15", "gd15", "xpd15", "ka15", "dpm", "kp"];
const SPLIT_LABEL: Partial<Record<StatKey, string>> = {
  csd15: "CSD@15", gd15: "GD@15", xpd15: "XPD@15", ka15: "K+A@15", kp: "KP", dpm: "DMG/min",
};

const pctColor = (p: number) => (p >= 0.66 ? "var(--good)" : p <= 0.33 ? "var(--critical)" : "var(--accent)");
const fmtDate = (d: string) => d.split("-").reverse().join("/");

function Block({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`break-inside-avoid ${className}`}>
      <h2 className="mb-1.5 border-b border-border pb-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">{title}</h2>
      {children}
    </section>
  );
}

export default function SheetView({ id, region }: { id: string; region: Region }) {
  if (!hasRegion(region)) return <RegionMissing region={region} />;
  const player = getPlayer(id, region);
  if (!player) notFound();
  const R = REGION_INFO[region];
  const meta = getMeta(region);
  const [pseudo, realName] = (() => {
    const m = player.name.match(/^(.*?)\s*\((.*)\)$/);
    return m ? [m[1], m[2]] : [player.name, null];
  })();

  const scores = [...player.scores].sort((a, b) => b.season - a.season);
  const last = scores[0];
  const world = last ? worldScore(last.final, region, last.season, last.tier) : null;
  const line = [...player.lines].sort((a, b) => b.season - a.season || b.games - a.games)[0];
  const profile = line ? playerProfile(line) : null;
  const contract = contractsFromMercato(getMercato(region)?.teams ?? [])[id];
  const origin = originOf(player.country, player.name);
  const lane = player.evolution.filter((e) => (e.oe_games ?? 0) >= 2 && e.csd15 !== undefined).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const stints = [...(player.career?.stints ?? [])].sort((a, b) => b.start.localeCompare(a.start)).slice(0, 8);
  const titles = player.career?.titles ?? [];
  const awards = player.career?.awards ?? [];
  let sim: ReturnType<typeof similarPlayers> = null;
  try {
    sim = similarPlayers(region, id, 4);
  } catch {
    sim = null; // classements absents : la fiche reste affichée sans profils similaires
  }
  const soloq = scores.find((s) => s.soloq_riot_id);
  const today = new Date().toLocaleDateString("fr-FR");

  return (
    <div>
      <SheetToolbar back={playerLink(region, id)} />
      <article className="sheet mx-auto w-[210mm] max-w-full space-y-3 rounded-lg border border-border p-[9mm] text-[11px] leading-snug shadow-xl">
        {/* En-tête */}
        <header className="flex items-start gap-4 border-b-2 pb-3" style={{ borderColor: "var(--gold)" }}>
          <Avatar name={player.name} src={player.photo} size={76} />
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-3">Fiche de scouting · {R.name}</div>
            <h1 className="text-[26px] font-bold leading-tight tracking-tight">{pseudo}</h1>
            {realName && <div className="text-[12px] text-ink-2">{realName}</div>}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="rounded border border-border px-1.5 font-semibold">{player.role}</span>
              <span>{player.age !== undefined ? `${player.age_approx ? "~" : ""}${player.age} ans` : "âge inconnu"}</span>
              {player.birthdate && <span className="text-ink-3">(né le {fmtDate(player.birthdate)})</span>}
              {player.country && (
                <span>
                  · {player.country}
                  {origin && <span className="text-ink-3"> ({originLabel(origin, player.country)})</span>}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[12px]">
              <TeamLogo team={player.team} src={player.logo} size={18} />
              <b>{player.team}</b>
              <span className="text-ink-3">
                · {player.league_code}
                {player.league_code !== tierName(player.tier, region) && ` (${tierName(player.tier, region)})`}
              </span>
              {contract && <span className="text-ink-2">· contrat jusqu&apos;au {fmtDate(contract.end)}</span>}
            </div>
          </div>
          {last && (
            <div className="shrink-0 text-right">
              <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-3">Score {last.season}</div>
              <div className="text-[30px] font-bold leading-none tabular-nums" style={{ color: "var(--gold)" }}>
                {fmtScore(last.final)}
              </div>
              <div className="mt-0.5 text-[11px] font-semibold">
                {topPercent(last.role_percentile)} des {last.role}
                <span className="font-normal text-ink-3"> ({R.short})</span>
              </div>
              {world !== null && region !== "eu" && (
                <div className="text-[10px] text-ink-2">score mondial {fmtScore(world)} (échelle LEC)</div>
              )}
              {last.trend !== undefined && last.trend !== null && (
                <div className="text-[10px]" style={{ color: last.trend >= 0 ? "var(--good)" : "var(--critical)" }}>
                  {last.trend >= 0 ? "▲" : "▼"} {fmtScore(last.trend)}
                  <span className="text-ink-3"> vs {last.trend_prev ?? "saison précédente"}</span>
                </div>
              )}
            </div>
          )}
        </header>

        {/* Profil + points forts / faibles */}
        {profile && line && (
          <div className="grid grid-cols-[1fr_1.1fr] gap-4">
            <Block title={`Profil · ${line.league_code} ${line.season}`}>
              <div className="space-y-1">
                {profile.categories.map((c) => (
                  <div key={c.key} className="grid grid-cols-[6.2rem_1fr_2.6rem] items-center gap-2" title={c.hint}>
                    <span className="text-ink-2">{c.label}</span>
                    <div className="relative h-2.5 rounded-full bg-surface-2">
                      <div className="h-2.5 rounded-full" style={{ width: `${Math.max(3, c.pct * 100)}%`, background: pctColor(c.pct) }} />
                      <div className="absolute left-1/2 top-[-1px] h-3 w-px bg-ink-3" aria-hidden />
                    </div>
                    <span className="text-right tabular-nums font-semibold">{Math.round(c.pct * 100)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[9px] text-ink-3">
                Moyenne des percentiles face aux {line.peers.n} {line.role} de la {line.league_code} (50 = médiane).
              </p>
            </Block>
            <Block title="Points forts et points faibles">
              <ul className="space-y-0.5">
                {profile.strengths.map((s) => (
                  <li key={s.stat} className="flex gap-1.5">
                    <span style={{ color: "var(--good)" }}>▲</span>
                    <span>
                      {s.text} <span className="text-ink-3">({s.label} {s.value}, {topPercent(s.pct)})</span>
                    </span>
                  </li>
                ))}
                {profile.weaknesses.map((s) => (
                  <li key={s.stat} className="flex gap-1.5">
                    <span style={{ color: "var(--critical)" }}>▼</span>
                    <span>
                      {s.text} <span className="text-ink-3">({s.label} {s.value}, meilleur que {Math.round(s.pct * 100)} %)</span>
                    </span>
                  </li>
                ))}
                {!profile.strengths.length && !profile.weaknesses.length && <li className="text-ink-3">Profil équilibré, sans stat extrême.</li>}
              </ul>
            </Block>
          </div>
        )}

        {/* Stats face au poste */}
        {line && (
          <Block title={`Stats face aux ${line.role} · ${line.league_code} ${line.season} · ${line.team} · ${line.games} parties`}>
            <div className="grid grid-cols-2 gap-x-5 gap-y-0.5">
              {STATS.filter((s) => line[s] !== undefined).map((s) => {
                const peer = line.peers[s];
                return (
                  <div key={s} className="grid grid-cols-[7.4rem_3.4rem_1fr_3rem] items-center gap-1.5">
                    <span className="truncate text-ink-2">{STAT_LABELS[s]}</span>
                    <span className="text-right font-semibold tabular-nums">{fmtStat(s, line[s])}</span>
                    <div className="relative h-2 rounded-full bg-surface-2">
                      {peer && <div className="h-2 rounded-full" style={{ width: `${Math.max(3, peer.pct * 100)}%`, background: pctColor(peer.pct) }} />}
                      <div className="absolute left-1/2 top-[-1px] h-2.5 w-px bg-ink-3" aria-hidden />
                    </div>
                    <span className="text-right text-[10px] text-ink-3 tabular-nums">{peer ? fmtStat(s, peer.avg) : ""}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-0.5 text-[9px] text-ink-3">Barre : part des joueurs du poste qu&apos;il dépasse ; à droite, la moyenne du poste.</p>
          </Block>
        )}

        {/* Scores par saison */}
        {scores.length > 0 && (
          <Block title="Score de prospect par saison">
            <table className="w-full tabular-nums">
              <thead>
                <tr className="text-left text-[9px] uppercase tracking-wide text-ink-3">
                  <th className="font-medium">Saison</th>
                  <th className="font-medium">Équipe</th>
                  <th className="font-medium">Ligue</th>
                  <th className="text-right font-medium">Parties</th>
                  <th className="text-right font-medium">Win rate</th>
                  <th className="text-right font-medium">KDA</th>
                  <th className="text-right font-medium">Rang</th>
                  <th className="text-right font-medium">Score</th>
                  {region !== "eu" && <th className="text-right font-medium">Mondial</th>}
                </tr>
              </thead>
              <tbody>
                {scores.map((s) => {
                  const w = worldScore(s.final, region, s.season, s.tier);
                  return (
                    <tr key={`${s.season}-${s.role}`} className="border-t border-border">
                      <td className="py-0.5 font-semibold">{s.season}</td>
                      <td className="truncate">{s.team}</td>
                      <td>{s.league_code}</td>
                      <td className="text-right">{s.games}</td>
                      <td className="text-right">{fmtStat("winrate", s.winrate)}</td>
                      <td className="text-right">{fmtStat("kda", s.kda)}</td>
                      <td className="text-right">{topPercent(s.role_percentile)}</td>
                      <td className="text-right font-semibold">{fmtScore(s.final)}</td>
                      {region !== "eu" && <td className="text-right text-ink-2">{w !== null ? fmtScore(w) : "–"}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Block>
        )}

        {/* Lane @15 split par split */}
        {lane.length > 0 && (
          <Block title="Split par split · phase de lane et early game (Oracle's Elixir)">
            <table className="w-full tabular-nums">
              <thead>
                <tr className="text-left text-[9px] uppercase tracking-wide text-ink-3">
                  <th className="font-medium">Tournoi</th>
                  <th className="text-right font-medium">P.</th>
                  {SPLIT.map((k) => (
                    <th key={k} className="text-right font-medium">
                      {SPLIT_LABEL[k] ?? STAT_LABELS[k]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lane.map((e) => (
                  <tr key={`${e.tournament}-${e.date}`} className="border-t border-border">
                    <td className="max-w-[16rem] truncate py-0.5">{e.tournament}</td>
                    <td className="text-right">{e.games}</td>
                    {SPLIT.map((k) => {
                      const v = (e as unknown as Record<string, number | undefined>)[k];
                      const neg = ["csd15", "gd15", "xpd15"].includes(k) && v !== undefined && v < 0;
                      return (
                        <td key={k} className="text-right" style={neg ? { color: "var(--critical)" } : undefined}>
                          {v === undefined ? "–" : fmtStat(k, v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Block>
        )}

        <div className="grid grid-cols-2 gap-4">
          {/* Carrière */}
          {stints.length > 0 && (
            <Block title="Carrière">
              <ul className="space-y-0.5">
                {stints.map((s) => (
                  <li key={`${s.team}-${s.start}`} className="flex items-center gap-1.5">
                    <TeamLogo team={s.team} src={s.logo} size={13} />
                    <span className="truncate font-medium">{s.team}</span>
                    <span className="text-ink-3">{s.league_code}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-ink-3 tabular-nums">
                      {s.start.slice(0, 7).split("-").reverse().join("/")} → {s.end.slice(0, 7).split("-").reverse().join("/")} · {s.games} p.
                    </span>
                  </li>
                ))}
              </ul>
            </Block>
          )}
          <div className="space-y-3">
            {(titles.length > 0 || awards.length > 0) && (
              <Block title={`Palmarès · ${titles.length} titre${titles.length > 1 ? "s" : ""}`}>
                <ul className="space-y-0.5">
                  {titles.slice(-5).reverse().map((t) => (
                    <li key={`${t.tournament}-${t.date}`}>
                      🏆 {t.tournament} <span className="text-ink-3">({t.team})</span>
                    </li>
                  ))}
                  {awards.slice(-3).reverse().map((a, i) => (
                    <li key={i}>
                      ★ {a.award} <span className="text-ink-3">{a.tournament ?? a.league ?? ""}</span>
                    </li>
                  ))}
                </ul>
              </Block>
            )}
            {soloq && (
              <Block title="SoloQ">
                <div>
                  {soloq.soloq_riot_id} · {soloq.soloq_tier} {soloq.soloq_lp} LP
                  {soloq.soloq_rank ? ` · #${soloq.soloq_rank} EUW` : ""} · {soloq.soloq_games} parties
                  {soloq.soloq_winrate !== undefined && ` · ${Math.round(soloq.soloq_winrate * 100)} % de victoires`}
                </div>
              </Block>
            )}
            {sim && sim.list.length > 0 && (
              <Block title={`Profils similaires · ${sim.role} ${sim.season}`}>
                <ul className="space-y-0.5">
                  {sim.list.map(({ row, proximity }) => (
                    <li key={row.id} className="flex gap-1.5">
                      <span className="font-medium">{row.name.replace(/\s*\(.*\)$/, "")}</span>
                      <span className="truncate text-ink-3">
                        {row.current_team ?? row.team} · {row.league_code}
                        {row.age !== undefined && ` · ${row.age} ans`}
                      </span>
                      <span className="ml-auto shrink-0 tabular-nums text-ink-3">{proximity} %</span>
                      <span className="w-9 shrink-0 text-right font-semibold tabular-nums">{fmtScore(row.final)}</span>
                    </li>
                  ))}
                </ul>
              </Block>
            )}
          </div>
        </div>

        <Block title="Notes du scout">
          <ScoutNotes region={region} id={id} />
        </Block>

        <footer className="flex justify-between border-t border-border pt-1.5 text-[9px] text-ink-3">
          <span>
            LoL Scouting · fiche du {today} · données {meta.seasons[0]}–{meta.seasons.at(-1)} exportées le {meta.generated}
          </span>
          <span>Leaguepedia (CC BY-SA 3.0){meta.has_oe ? ", Oracle's Elixir" : ""}</span>
        </footer>
      </article>
      <p className="mx-auto mt-3 max-w-[210mm] text-xs text-ink-3 print:hidden">
        Lien de la fiche joueur : <a className="text-accent hover:underline" href={link(region, `/joueurs/${id}`)}>{link(region, `/joueurs/${id}`)}</a>
      </p>
    </div>
  );
}
