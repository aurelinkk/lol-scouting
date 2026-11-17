"use client";

import { useState } from "react";
import { TeamLogo } from "./Images";
import { TIER_COLOR } from "@/lib/tiers";
import { type Region, tierName } from "@/lib/region";
import type { Career, CareerStint, CareerTitle } from "@/lib/types";

const TIER_ORDER = ["LEC", "ERL1", "ERL2"];

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function fmtMonth(iso: string) {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtDuration(days: number) {
  const months = Math.round(days / 30.4);
  if (months < 1) return `${days} j`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (!y) return `${m} mois`;
  return m ? `${y} an${y > 1 ? "s" : ""} ${m} mois` : `${y} an${y > 1 ? "s" : ""}`;
}

/* ------------------------------------------------------------------ */
/* Temps passé par niveau                                              */
/* ------------------------------------------------------------------ */
export function LevelSummary({ career, region = "eu" }: { career: Career; region?: Region }) {
  const levels = TIER_ORDER.filter((t) => career.levels[t]);
  if (!levels.length) return null;
  const emGames = career.stints.reduce((n, s) => n + (s.em_games ?? 0), 0);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {levels.map((t) => {
        const l = career.levels[t]!;
        return (
          <div key={t} className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: TIER_COLOR[t] }} />
              {tierName(t, region)}
            </div>
            <div className="mt-1 text-lg font-semibold">{fmtDuration(l.days)}</div>
            <div className="text-xs text-ink-3">{l.games} parties</div>
          </div>
        );
      })}
      {emGames > 0 && (
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: TIER_COLOR.EM }} />
            EMEA Masters
          </div>
          <div className="mt-1 text-lg font-semibold">{emGames} parties</div>
          <div className="text-xs text-ink-3">avec ses clubs d&apos;ERL</div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Frise chronologique des clubs                                      */
/* ------------------------------------------------------------------ */
export function CareerTimeline({ career, region = "eu" }: { career: Career; region?: Region }) {
  const [hover, setHover] = useState<number | null>(null);
  const stints = career.stints;
  if (!stints.length) return <p className="text-sm text-ink-3">Pas de parties dans nos données.</p>;

  const first = new Date(stints[0].start);
  const t0 = new Date(first.getFullYear(), 0, 1).getTime();
  const now = Date.now();
  const lastEnd = Math.max(...stints.map((s) => new Date(s.end).getTime()));
  const t1 = new Date(new Date(Math.max(now, lastEnd)).getFullYear() + 1, 0, 1).getTime();
  const x = (iso: string | number) => ((new Date(iso).getTime() - t0) / (t1 - t0)) * 100;
  const years: number[] = [];
  for (let y = new Date(t0).getFullYear(); y < new Date(t1).getFullYear(); y++) years.push(y);

  const titlesOf = (s: CareerStint): CareerTitle[] =>
    career.titles.filter((t) => t.team === s.team && t.date >= s.start.slice(0, 10) && t.date <= addDays(s.end, 30));

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-ink-2">
        {["LEC", "ERL1", "ERL2"].filter((t) => region === "eu" || career.stints.some((s) => s.tier === t)).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: TIER_COLOR[t] }} /> {tierName(t, region)}
          </span>
        ))}
        {career.stints.some((s) => s.tier === "OTHER") && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: TIER_COLOR.OTHER }} /> Autre région
          </span>
        )}
        <span className="flex items-center gap-1.5">🏆 titre</span>
      </div>

      <div className="relative">
        {/* Grille des années */}
        <div className="ml-0 grid grid-cols-[minmax(7rem,13rem)_1fr] gap-3">
          <div />
          <div className="relative h-5 text-[11px] text-ink-3">
            {years.map((y) => (
              <span key={y} className="absolute -translate-x-1/2" style={{ left: `${x(new Date(y, 6, 1).getTime())}%` }}>
                {y}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          {stints.map((s, i) => {
            const left = x(s.start);
            const width = Math.max(x(s.end) - left, 0.8);
            const titles = titlesOf(s);
            const active = hover === i;
            return (
              <div
                key={i}
                className="grid grid-cols-[minmax(7rem,13rem)_1fr] items-center gap-3 rounded-md px-1 py-1 hover:bg-surface-2"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <TeamLogo team={s.team} src={s.logo} size={28} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{s.team}</div>
                    <div className="text-xs text-ink-3">
                      {s.league_code} · {s.role}
                    </div>
                  </div>
                </div>
                <div className="relative h-8">
                  {years.slice(1).map((y) => (
                    <div
                      key={y}
                      className="absolute top-0 h-8 w-px"
                      style={{ left: `${x(new Date(y, 0, 1).getTime())}%`, background: "var(--grid)" }}
                    />
                  ))}
                  <div
                    className="absolute top-3 flex h-5 items-center overflow-hidden rounded px-1.5 text-[11px] font-semibold text-[#111]"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      background: TIER_COLOR[s.tier] ?? "var(--text-3)",
                      opacity: hover !== null && !active ? 0.5 : 1,
                    }}
                  >
                    <span className="truncate">
                      {s.league_code} · {s.games} p.
                    </span>
                  </div>
                  {titles.map((t) => (
                    <span
                      key={t.tournament}
                      className="absolute -top-0.5 -translate-x-1/2 text-xs leading-none"
                      style={{ left: `${x(t.date)}%` }}
                      title={t.tournament}
                    >
                      🏆
                    </span>
                  ))}
                  {active && (
                    <div
                      className="pointer-events-none absolute top-9 z-10 min-w-56 rounded-md border border-border bg-surface p-2 text-xs shadow-lg"
                      style={{ left: `${Math.min(left, 60)}%` }}
                    >
                      <div className="font-semibold">{s.team}</div>
                      <div className="text-ink-3">
                        {tierName(s.tier, region)} · {s.league_code} · {s.role}
                      </div>
                      <div>
                        {fmtMonth(s.start)} → {fmtMonth(s.end)}
                      </div>
                      <div>
                        {s.games} parties
                        {s.wins !== undefined ? ` · ${Math.round((100 * s.wins) / s.games)} % de victoires` : ""}
                        {s.em_games ? ` · ${s.em_games} p. d'EMEA Masters` : ""}
                      </div>
                      {titles.length > 0 && <div>🏆 {titles.map((t) => t.tournament).join(", ")}</div>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Palmarès                                                            */
/* ------------------------------------------------------------------ */
const AWARD_RANK = (a: string) =>
  /MVP|Most Valuable/i.test(a) ? 0 : /Rookie/i.test(a) ? 1 : /^All Pro/i.test(a) ? 2 : 3;

export function Trophies({ career }: { career: Career }) {
  const titles = [...career.titles].reverse();
  const awards = [...career.awards].sort(
    (a, b) => (b.season ?? 0) - (a.season ?? 0) || AWARD_RANK(a.award) - AWARD_RANK(b.award),
  );
  if (!titles.length && !awards.length)
    return <p className="text-sm text-ink-3">Pas de titre ni de récompense individuelle dans nos données.</p>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Titres ({titles.length})</h3>
        <ul className="space-y-1.5">
          {titles.map((t) => (
            <li key={t.tournament + t.team} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
              <span className="text-base" aria-hidden>
                🏆
              </span>
              <TeamLogo team={t.team} src={t.logo} size={20} />
              <span className="min-w-0 flex-1 truncate text-sm">{t.tournament}</span>
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-[#111]"
                style={{ background: TIER_COLOR[t.tier] ?? "var(--text-3)" }}
              >
                {t.league_code}
              </span>
            </li>
          ))}
          {!titles.length && <li className="text-sm text-ink-3">Aucun.</li>}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
          Récompenses individuelles ({awards.length})
        </h3>
        <ul className="space-y-1.5">
          {awards.map((a, i) => (
            <li key={i} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
              <span className="text-base" aria-hidden>
                {AWARD_RANK(a.award) === 0 ? "⭐" : "🎖️"}
              </span>
              <span className="text-sm font-medium">{a.award}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-ink-3">
                {a.tournament}
                {a.team ? ` · ${a.team}` : ""}
              </span>
            </li>
          ))}
          {!awards.length && <li className="text-sm text-ink-3">Aucune.</li>}
        </ul>
      </div>
    </div>
  );
}
