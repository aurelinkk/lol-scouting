import "server-only";
import { getMercato, getRankings, getRosters, hasRegion } from "@/lib/data";
import { link, playerLink, REGION_INFO, type Region, REGIONS, teamLink } from "@/lib/region";

/** Index de la recherche globale (une entrée par page, joueur, équipe) */
export interface SearchEntry {
  /** p = page, j = joueur, e = équipe, r = région */
  k: "p" | "j" | "e" | "r";
  /** texte affiché */
  t: string;
  /** détail (équipe, ligue, poste...) */
  d?: string;
  /** lien */
  u: string;
  /** région */
  r?: Region;
  /** photo / logo */
  i?: string;
  /** mots-clés supplémentaires (vrai nom, ancien nom...) */
  x?: string;
  /** importance (tri à score égal) */
  w?: number;
}

const PAGES: { path: string; label: string; hint: string; eu_only?: boolean; global?: boolean }[] = [
  { path: "/", label: "Indicateurs", hint: "accueil, meilleurs prospects, niveau des ligues" },
  { path: "/donnees", label: "Données", hint: "classement, tableau, filtres, stats" },
  { path: "/montees", label: "Montées", hint: "promotions, joueurs montés" },
  { path: "/rosters", label: "Rosters", hint: "mercato, effectifs, transferts, rumeurs" },
  { path: "/besoins", label: "Besoins", hint: "postes à pourvoir, imports, recrutement" },
  { path: "/ligues", label: "Ligues", hint: "niveau des ligues ERL, EMEA Masters", eu_only: true },
  { path: "/comparer", label: "Comparer", hint: "comparateur, radar, score mondial, niveau des régions", global: true },
  { path: "/ladder", label: "Ladder", hint: "soloQ EUW, challenger, grandmaster", eu_only: true },
  { path: "/analyses", label: "Analyses", hint: "analyse soloQ approfondie", eu_only: true },
];

export function buildSearchIndex(): SearchEntry[] {
  const out: SearchEntry[] = [];
  const regions = REGIONS.filter(hasRegion);
  for (const r of regions) {
    const R = REGION_INFO[r];
    out.push({ k: "r", t: R.name, d: `${R.top} · ${R.lower}`, u: link(r, "/"), r, x: `${R.short} ${R.top}`, w: 3 });
    for (const p of PAGES) {
      if (p.eu_only && r !== "eu") continue;
      if (p.global && r !== "eu") continue;
      out.push({
        k: "p",
        t: p.global || p.eu_only ? p.label : `${p.label} · ${R.short}`,
        d: p.hint,
        u: p.global || p.eu_only ? p.path : link(r, p.path),
        r: p.global ? undefined : r,
        w: 2,
      });
    }

    // Joueurs classés : ligne la plus récente (club, ligue, poste)
    const latest = new Map<string, ReturnType<typeof getRankings>[number]>();
    for (const row of getRankings(r)) {
      const cur = latest.get(row.id);
      if (!cur || row.season > cur.season || (row.season === cur.season && row.games > cur.games)) latest.set(row.id, row);
    }
    for (const row of latest.values()) {
      const m = row.name.match(/^(.*?)\s*\((.*)\)$/);
      out.push({
        k: "j",
        t: m ? m[1] : row.name,
        d: `${row.role} · ${row.current_team ?? row.team} · ${row.league_code} ${row.season}`,
        u: playerLink(r, row.id),
        r,
        i: row.tier === "LEC" ? row.photo : undefined, // photos : 1re division seulement (index plus léger)
        x: m ? m[2] : undefined,
        w: row.tier === "LEC" ? 1 : 0,
      });
    }

    // Équipes : mercato (saison à venir) puis effectifs des saisons passées
    const seen = new Set<string>();
    const mercato = getMercato(r);
    for (const t of mercato?.teams ?? []) {
      seen.add(t.team);
      out.push({ k: "e", t: t.team, d: `${t.league} · ${R.short}`, u: teamLink(r, t.team), r, i: t.logo, x: t.former_team ?? undefined, w: t.tier === "LEC" ? 2 : 1 });
    }
    const last = new Map<string, { league: string; season: number; logo?: string }>();
    for (const b of getRosters(r))
      for (const t of b.teams) {
        const cur = last.get(t.team);
        if (!cur || b.season >= cur.season) last.set(t.team, { league: b.league_code, season: b.season, logo: t.logo ?? undefined });
      }
    for (const [team, v] of last) {
      if (seen.has(team)) continue;
      out.push({ k: "e", t: team, d: `${v.league} ${v.season} · ${R.short}`, u: teamLink(r, team), r, i: v.logo, w: 0 });
    }
  }
  return out;
}
