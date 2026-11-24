"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DeepButton from "./DeepButton";
import { ROLES } from "@/lib/types";
import { NativeSelect } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";

interface LadderRow {
  rank: number;
  riot_id: string;
  tier: string;
  lp: number;
  games: number;
  winrate?: number;
  hot_streak?: boolean;
  lp_7d?: number;
  games_7d?: number;
  lp_30d?: number;
  games_30d?: number;
  main_role?: string;
  main_role_share?: number;
  top_champions?: string;
  recent_games?: number;
  recent_winrate?: number;
  recent_kda?: number;
  recent_cs_min?: number;
  recent_dpm?: number;
  recent_kp?: number;
  peak_lp?: number;
  peak_date?: string;
  soloq_score?: number;
  soloq_role_pct?: number;
  standout?: boolean;
  pro?: string;
  pro_id?: string;
  pro_team?: string;
}

type SortKey =
  | "rank" | "lp" | "games" | "winrate" | "lp_7d" | "games_7d" | "lp_30d" | "games_30d"
  | "soloq_score" | "peak_lp" | "recent_kda" | "recent_dpm" | "recent_kp" | "recent_cs_min";

const TIER_LABEL: Record<string, string> = { CHALLENGER: "Chall", GRANDMASTER: "GM", MASTER: "Master" };

function signed(v?: number) {
  if (v === undefined || v === null) return "–";
  return `${v > 0 ? "+" : ""}${Math.round(v)}`;
}

export default function LadderTable() {
  const [data, setData] = useState<{ date: string; rows: LadderRow[] } | null>(null);
  const [error, setError] = useState(false);
  const [who, setWho] = useState<"nonpro" | "pro" | "all">("nonpro");
  const [role, setRole] = useState("");
  const [minGames, setMinGames] = useState("0");
  const [search, setSearch] = useState("");
  const [onlyStandout, setOnlyStandout] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "rank", desc: false });

  useEffect(() => {
    fetch("/data/ladder.json")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const min = Number(minGames) || 0;
    const out = data.rows.filter(
      (r) =>
        (who === "all" || (who === "pro" ? !!r.pro : !r.pro)) &&
        (!role || r.main_role === role) &&
        r.games >= min &&
        (!onlyStandout || r.standout) &&
        (!q || r.riot_id.toLowerCase().includes(q) || (r.pro ?? "").toLowerCase().includes(q)),
    );
    const dir = sort.desc ? -1 : 1;
    return out.sort((a, b) => {
      const va = a[sort.key];
      const vb = b[sort.key];
      if (va === undefined && vb === undefined) return 0;
      if (va === undefined) return 1;
      if (vb === undefined) return -1;
      return ((va as number) - (vb as number)) * dir;
    });
  }, [data, who, role, minGames, search, onlyStandout, sort]);

  if (error)
    return (
      <p className="text-sm text-ink-2">
        Pas encore de relevé soloQ. Lance <code>python scout.py soloq snapshot</code> puis <code>python scout.py export</code>.
      </p>
    );
  if (!data) return <p className="text-sm text-ink-3">Chargement…</p>;

  const control = "h-8 rounded-full border border-border bg-surface px-3 text-[13px] outline-none focus:border-accent";
  const header = (key: SortKey, label: string, title?: string) => (
    <th
      className="cursor-pointer select-none whitespace-nowrap px-2 py-2 text-right font-medium hover:text-ink"
      title={title}
      onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== "rank" }))}
    >
      {label}
      {sort.key === key ? (sort.desc ? " ↓" : " ↑") : ""}
    </th>
  );
  const hasProfiles = data.rows.some((r) => r.main_role);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 card p-3">
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Joueurs
          <NativeSelect value={who} onChange={(e) => setWho(e.target.value as typeof who)}>
            <option value="nonpro">Non-pros (à scouter)</option>
            <option value="pro">Pros reconnus</option>
            <option value="all">Tous</option>
          </NativeSelect>
        </label>
        {hasProfiles && (
          <label className="flex flex-col gap-1 text-xs text-ink-3">
            Poste principal
            <NativeSelect value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">Tous</option>
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </NativeSelect>
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Parties min (saison)
          <input
            type="number"
            min={0}
            className={`${control} w-24`}
            value={minGames}
            onChange={(e) => setMinGames(e.target.value)}
          />
        </label>
        {hasProfiles && (
          <label className="flex items-center gap-2 pb-2 text-sm text-ink-2" title="Top 5 % de son poste au score soloQ">
            <Checkbox checked={onlyStandout} onCheckedChange={(v) => setOnlyStandout(v === true)} />
            ⭐ Seulement ceux qui se démarquent
          </label>
        )}
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-ink-3">
          Recherche
          <input className={control} placeholder="Riot ID ou pro" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      <p className="text-xs text-ink-3">
        Relevé du {data.date} · {rows.length} joueurs · « 7 j » / « 30 j » = LP gagnés et parties jouées depuis les
        relevés précédents · Score = stats soloQ de l&apos;année comparées aux joueurs du même poste (⭐ = top 5 %).
      </p>

      <div className="overflow-x-auto card">
        <table className="tabular w-full whitespace-nowrap text-sm">
          <thead className="border-b border-border text-xs text-ink-3">
            <tr>
              {header("rank", "#", "Rang EUW")}
              <th className="px-2 py-2 text-left font-medium">Riot ID</th>
              <th className="px-2 py-2 text-left font-medium">Pro</th>
              <th className="px-2 py-2 text-left font-medium">Tier</th>
              {header("lp", "LP")}
              {header("games", "Parties")}
              {header("winrate", "WR")}
              {header("lp_7d", "LP 7 j")}
              {header("games_7d", "Parties 7 j", "Volume de jeu : qui grind")}
              {header("lp_30d", "LP 30 j")}
              {header("games_30d", "Parties 30 j")}
              {hasProfiles && <th className="px-2 py-2 text-left font-medium">Poste</th>}
              {hasProfiles && header("soloq_score", "Score", "Score soloQ : comparé aux joueurs du même poste (stats de l'année)")}
              {hasProfiles && header("peak_lp", "Pic LP", "Pic de LP depuis notre premier relevé")}
              {hasProfiles && header("recent_kda", "KDA")}
              {hasProfiles && header("recent_cs_min", "CS/m")}
              {hasProfiles && header("recent_dpm", "DMG/m")}
              {hasProfiles && header("recent_kp", "KP")}
              {hasProfiles && <th className="px-2 py-2 text-left font-medium">Champions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 300).map((r) => (
              <tr key={r.riot_id + r.rank} className="border-b border-border last:border-0 hover:bg-surface-2">
                <td className="px-2 py-1.5 text-right text-ink-3">{r.rank}</td>
                <td className="whitespace-nowrap px-2 py-1.5 font-medium">
                  <span className="mr-1.5">
                    <DeepButton riotId={r.riot_id} compact />
                  </span>
                  {r.riot_id}
                  {r.hot_streak && <span title="Série de victoires"> 🔥</span>}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5">
                  {r.pro_id ? (
                    <Link href={`/joueurs/${r.pro_id}`} className="text-accent hover:underline">
                      {r.pro}
                    </Link>
                  ) : (
                    <span className="text-ink-3">{r.pro ?? ""}</span>
                  )}
                  {r.pro_team && <span className="text-xs text-ink-3"> · {r.pro_team}</span>}
                </td>
                <td className="px-2 py-1.5 text-ink-2">{TIER_LABEL[r.tier] ?? r.tier}</td>
                <td className="px-2 py-1.5 text-right">{r.lp}</td>
                <td className="px-2 py-1.5 text-right">{r.games}</td>
                <td className="px-2 py-1.5 text-right">
                  {r.winrate !== undefined ? `${(r.winrate * 100).toFixed(1)} %` : "–"}
                </td>
                <td className="px-2 py-1.5 text-right">{signed(r.lp_7d)}</td>
                <td className="px-2 py-1.5 text-right">{signed(r.games_7d)}</td>
                <td className="px-2 py-1.5 text-right">{signed(r.lp_30d)}</td>
                <td className="px-2 py-1.5 text-right">{signed(r.games_30d)}</td>
                {hasProfiles && (
                  <td className="whitespace-nowrap px-2 py-1.5 text-ink-2">
                    {r.main_role ?? "–"}
                    {r.main_role_share ? (
                      <span className="text-xs text-ink-3"> {Math.round(r.main_role_share * 100)} %</span>
                    ) : null}
                  </td>
                )}
                {hasProfiles && (
                  <td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold">
                    {r.soloq_score !== undefined ? (
                      <span title={r.soloq_role_pct ? `top ${Math.max(1, Math.round((1 - r.soloq_role_pct) * 100))} % des ${r.main_role}` : ""}>
                        {r.standout && "⭐ "}
                        {r.soloq_score > 0 ? "+" : ""}
                        {r.soloq_score.toFixed(2)}
                      </span>
                    ) : (
                      "–"
                    )}
                  </td>
                )}
                {hasProfiles && (
                  <td className="px-2 py-1.5 text-right" title={r.peak_date ? `le ${r.peak_date}` : ""}>
                    {r.peak_lp ?? "–"}
                  </td>
                )}
                {hasProfiles && <td className="px-2 py-1.5 text-right">{r.recent_kda?.toFixed(2) ?? "–"}</td>}
                {hasProfiles && <td className="px-2 py-1.5 text-right">{r.recent_cs_min?.toFixed(1) ?? "–"}</td>}
                {hasProfiles && <td className="px-2 py-1.5 text-right">{r.recent_dpm ? Math.round(r.recent_dpm) : "–"}</td>}
                {hasProfiles && (
                  <td className="px-2 py-1.5 text-right">
                    {r.recent_kp !== undefined ? `${Math.round(r.recent_kp * 100)} %` : "–"}
                  </td>
                )}
                {hasProfiles && <td className="whitespace-nowrap px-2 py-1.5 text-ink-2">{r.top_champions ?? ""}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 300 && <p className="text-xs text-ink-3">300 premiers affichés : affine les filtres.</p>}
    </div>
  );
}
