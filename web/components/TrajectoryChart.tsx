import Link from "next/link";
import { fmtScore } from "@/lib/format";
import { playerLink, type Region } from "@/lib/region";
import type { TrajMatch, TrajPoint } from "@/lib/trajectory";

const COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];
const short = (n: string) => n.replace(/\s*\(.*\)$/, "");

/** Courbe score / âge du joueur (doré) et de 3 montés passés à la trajectoire proche */
export default function TrajectoryChart({
  region,
  name,
  me,
  matches,
}: {
  region: Region;
  name: string;
  me: TrajPoint[];
  matches: TrajMatch[];
}) {
  const all = [...me, ...matches.flatMap((m) => m.points)];
  const ages = all.map((p) => p.age);
  const scores = all.map((p) => p.score);
  const x0 = Math.floor(Math.min(...ages) - 0.3);
  const x1 = Math.ceil(Math.max(...ages, ...matches.map((m) => m.upAge ?? 0)) + 0.3);
  const y0 = Math.floor(Math.min(...scores, 0) * 2) / 2;
  const y1 = Math.ceil(Math.max(...scores) * 2) / 2 + 0.25;
  const W = 640;
  const H = 240;
  const P = { l: 36, r: 12, t: 12, b: 28 };
  const X = (a: number) => P.l + ((a - x0) / (x1 - x0 || 1)) * (W - P.l - P.r);
  const Y = (s: number) => H - P.b - ((s - y0) / (y1 - y0 || 1)) * (H - P.t - P.b);
  const path = (pts: TrajPoint[]) => pts.map((p, i) => `${i ? "L" : "M"}${X(p.age).toFixed(1)},${Y(p.score).toFixed(1)}`).join(" ");
  const yTicks: number[] = [];
  for (let v = Math.ceil(y0); v <= y1; v += 1) yTicks.push(v);
  const xTicks: number[] = [];
  for (let a = x0; a <= x1; a += 1) xTicks.push(a);
  const best = matches[0];
  const lastMe = me[me.length - 1];
  return (
    <div className="space-y-3">
      {best && (
        <p className="text-sm text-ink-2">
          <b className="text-ink">{short(name)}</b> suit une courbe proche de celle de{" "}
          <Link href={playerLink(region, best.id)} className="font-semibold text-ink hover:underline">
            {short(best.name)}
          </Link>{" "}
          au même âge (écart moyen de {best.gap.toFixed(2)} point de score sur {best.common} saison{best.common > 1 ? "s" : ""}).{" "}
          {short(best.name)} est monté en 1re division en {best.upSeason}
          {best.upAge ? `, à ${Math.round(best.upAge)} ans` : ""}
          {best.upTeam ? ` (${best.upTeam})` : ""}.
          {lastMe && best.upAge !== null && lastMe.age < best.upAge && ` ${short(name)} a aujourd'hui ${lastMe.age.toFixed(1)} ans.`}
        </p>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-3xl" role="img" aria-label="Score selon l'âge">
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={Y(v)} y2={Y(v)} stroke="var(--grid)" />
            <text x={P.l - 6} y={Y(v) + 3} textAnchor="end" fontSize="10" fill="var(--text-3)">
              {v > 0 ? `+${v}` : v}
            </text>
          </g>
        ))}
        {xTicks.map((a) => (
          <text key={a} x={X(a)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--text-3)">
            {a} ans
          </text>
        ))}
        {matches.map((m, i) => (
          <g key={m.id}>
            <path d={path(m.points)} fill="none" stroke={COLORS[i]} strokeWidth="2" strokeOpacity="0.85" />
            {m.points.map((p) => (
              <circle key={p.season} cx={X(p.age)} cy={Y(p.score)} r="3" fill={COLORS[i]}>
                <title>{`${short(m.name)} · ${p.season} · ${p.league} · ${p.age.toFixed(1)} ans · ${fmtScore(p.score)}`}</title>
              </circle>
            ))}
            {m.upAge !== null && (
              <g>
                <line
                  x1={X(m.points[m.points.length - 1].age)}
                  y1={Y(m.points[m.points.length - 1].score)}
                  x2={X(m.upAge)}
                  y2={Y(m.points[m.points.length - 1].score) - 14}
                  stroke={COLORS[i]}
                  strokeDasharray="3 3"
                />
                <text x={X(m.upAge)} y={Y(m.points[m.points.length - 1].score) - 17} textAnchor="middle" fontSize="11" fill={COLORS[i]}>
                  ↑
                </text>
              </g>
            )}
          </g>
        ))}
        <path d={path(me)} fill="none" stroke="var(--gold)" strokeWidth="3" />
        {me.map((p) => (
          <circle key={p.season} cx={X(p.age)} cy={Y(p.score)} r="4.5" fill="var(--gold)" stroke="var(--surface)" strokeWidth="1.5">
            <title>{`${short(name)} · ${p.season} · ${p.league} · ${p.age.toFixed(1)} ans · ${fmtScore(p.score)}`}</title>
          </circle>
        ))}
      </svg>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <li className="flex items-center gap-1.5">
          <span className="h-1 w-4 rounded" style={{ background: "var(--gold)" }} />
          <b>{short(name)}</b>
        </li>
        {matches.map((m, i) => (
          <li key={m.id} className="flex items-center gap-1.5">
            <span className="h-1 w-4 rounded" style={{ background: COLORS[i] }} />
            <Link href={playerLink(region, m.id)} className="font-medium hover:underline">
              {short(m.name)}
            </Link>
            <span className="text-ink-3">
              {m.role} · ↑ {m.upSeason}
              {m.upTeam ? ` ${m.upTeam}` : ""} · écart {m.gap.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-ink-3">
        Score de chaque saison selon l&apos;âge en fin de saison. Courbes de couleur : joueurs de la région montés en 1re division
        (avant leur montée, ↑ = montée), choisis parce que leur score aux mêmes âges (à 7 mois près) est le plus proche, même
        poste en priorité.
      </p>
    </div>
  );
}
