import "server-only";
import { getMercato, getPlayers, hasRegion } from "@/lib/data";
import { type Region, REGIONS } from "@/lib/region";

/**
 * Scoops Sheep Esports lus dans les titres de Google News (flux RSS public).
 * Le site de Sheep bloque les robots : on ne le contacte jamais. Même logique
 * que sheep_esports.py (export Python) : un titre reconnu (joueur connu + équipe
 * identifiée) devient une rumeur au format Leaguepedia (RosterRumors).
 */

const RSS = "https://news.google.com/rss/search";

const OTHER_GAMES =
  /\b(VCT|Valorant|CS2|Counter-Strike|Rocket League|Dota|Game Changers|Overwatch|Fortnite|Apex|Rainbow|R6|Call of Duty|PUBG|Mobile Legends|TFT|Teamfight|Marvel Rivals|Deadlock)\b/i;

const TEAM_ALIASES: Record<string, string> = {
  navi: "Natus Vincere", kc: "Karmine Corp", koi: "Movistar KOI", mkoi: "Movistar KOI",
  gx: "GIANTX", th: "Team Heretics", heretics: "Team Heretics", bds: "Team BDS",
  sk: "SK Gaming", vitality: "Team Vitality", vit: "Team Vitality", fnc: "Fnatic",
  g2: "G2 Esports", c9: "Cloud9", tl: "Team Liquid", liquid: "Team Liquid",
  fly: "FlyQuest", hle: "Hanwha Life Esports", hanwha: "Hanwha Life Esports",
  dk: "Dplus Kia", dplus: "Dplus Kia", kt: "KT Rolster", ns: "Nongshim RedForce",
  nongshim: "Nongshim RedForce", shopify: "Shopify Rebellion", sr: "Shopify Rebellion",
  drx: "Kiwoom DRX", fearx: "BNK FEARX", brion: "HANJIN BRION", soopers: "DN SOOPers",
  // LPL, LCP, CBLOL
  blg: "Bilibili Gaming",
  jdg: "JD Gaming",
  tes: "Top Esports",
  wbg: "Weibo Gaming",
  lng: "LNG Esports",
  nip: "Ninjas in Pyjamas.CN",
  edg: "EDward Gaming",
  ig: "Invictus Gaming",
  fpx: "FunPlus Phoenix",
  rng: "Royal Never Give Up",
  omg: "Oh My God",
  al: "Anyone's Legend",
  up: "Ultra Prime",
  lgd: "LGD Gaming",
  tt: "ThunderTalk Gaming",
  cfo: "CTBC Flying Oyster",
  gam: "GAM Esports",
  psg: "PSG Talon",
  shg: "Fukuoka SoftBank HAWKS gaming",
  dfm: "DetonatioN FocusMe",
  tsw: "Team Secret Whales",
  mvk: "MVK Esports",
  pain: "paiN Gaming",
  png: "paiN Gaming",
  loud: "LOUD",
  furia: "FURIA",
  red: "RED Canids",
  vks: "Vivo Keyd Stars",
  keyd: "Vivo Keyd Stars",
  fluxo: "Fluxo W7M",
  lev: "Leviatán",
  isg: "Isurus Estral",
};

const END = String.raw`(?=\s+(?:for|in|ahead|as|until|on|after|from|following|this|next)\b|\s*[,:;(]|\s+-\s|$)`;
const PRE = String.raw`(?:(?:is|are)\s+)?(?:(?:set|expected|poised|likely|close|about|tipped|ready|due)\s+to\s+|will\s+|to\s+)?`;
const PATTERNS: ["in" | "out", RegExp][] = [
  // joueur -> équipe
  ["in", new RegExp(String.raw`^(?<p>.+?)\s+` + PRE +
    String.raw`(?:join|joins|re-?sign(?:s)?\s+with|sign(?:s)?\s+with|stay(?:s)?\s+with|remain(?:s)?\s+with|extend(?:s)?\s+with|return(?:s)?\s+to|move(?:s)?\s+to|head(?:s)?\s+to|commit(?:s)?\s+to)\s+(?<t>.+?)` + END, "i")],
  ["in", new RegExp(String.raw`^(?<p>.+?)\s+reach(?:es)?\s+(?:an?\s+)?(?:[\w-]+\s+){0,3}(?:agreement|deal|terms)\s+with\s+(?<t>.+?)` + END, "i")],
  // équipe -> joueurs
  ["in", new RegExp(String.raw`^(?<t>.+?)\s+` + PRE +
    String.raw`(?:sign|signs|re-?sign|re-?signs|extend|extends|add|adds|acquire|acquires|bring(?:s)?\s+back|promote|promotes|recruit|recruits|welcome|welcomes|pick(?:s)?\s+up|lock(?:s)?\s+in)\s+(?<p>.+?)` +
    String.raw`(?=\s+(?:for|until|ahead|as|in|on|to|from|through|after)\b|\s+contracts?\b|\s*[,:;(]\s*(?!\s*\w+\s*(?:,|and\b))|$)`, "i")],
  // départs
  ["out", new RegExp(String.raw`^(?<p>.+?)\s+` + PRE +
    String.raw`(?:leave|leaves|depart|departs|part(?:s)?\s+ways\s+with|split(?:s)?\s+from|exit(?:s)?)\s+(?<t>.+?)` + END, "i")],
  ["out", new RegExp(String.raw`^(?<t>.+?)\s+` + PRE +
    String.raw`(?:part(?:s)?\s+ways\s+with|release(?:s)?|bench(?:es)?|drop(?:s)?)\s+(?<p>.+?)` + END, "i")],
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const short = (s: string) => s.replace(/\s*\(.*\)$/, "").trim();
const noSuffix = (s: string) => s.replace(/\b(esports?|gaming|team|club)\b/gi, "");

export function cleanTitle(title: string) {
  return title
    .replace(/\s+-\s+Sheep Esports\s*$/, "")
    .trim()
    .replace(/^(?:sources?|report|exclusive|breaking)\s*:\s*/i, "")
    .trim();
}

export function parseTitle(title: string): { direction: "in" | "out"; players: string[]; team: string } | null {
  if (OTHER_GAMES.test(title)) return null;
  const t = cleanTitle(title);
  for (const [direction, rx] of PATTERNS) {
    const m = t.match(rx);
    if (!m?.groups) continue;
    const players = m.groups.p
      .split(/,\s*|\s+and\s+|\s*&\s*/)
      .map((p) => p.trim().replace(/^['".]+|['".]+$/g, ""))
      .filter(Boolean);
    return { direction, players, team: m.groups.t.trim().replace(/^['".]+|['".]+$/g, "") };
  }
  return null;
}

type Hit = { name: string; role?: string; team?: string };

/** Joueurs et équipes connus, toutes régions ; l'effectif de la région analysée d'abord */
class Index {
  players = new Map<string, Hit[]>();
  teams = new Map<string, string>();

  constructor(region: Region) {
    const teams = new Set<string>();
    const add = (h: Hit, first = false) => {
      for (const key of new Set([h.name.toLowerCase(), short(h.name).toLowerCase()])) {
        const hits = this.players.get(key) ?? [];
        if (hits.some((x) => x.name === h.name)) continue;
        if (first) hits.unshift(h);
        else hits.push(h);
        this.players.set(key, hits);
      }
    };
    const m = getMercato(region);
    for (const t of m?.teams ?? []) {
      teams.add(t.team);
      if (t.former_team) teams.add(t.former_team);
      for (const s of t.slots) if (s.before) add({ name: s.before.name, role: s.role, team: t.team }, true);
    }
    for (const r of [region, ...REGIONS.filter((x) => x !== region)]) {
      if (!hasRegion(r)) continue;
      for (const t of getMercato(r)?.teams ?? []) teams.add(t.team);
      for (const p of Object.values(getPlayers(r))) {
        add({ name: p.name, role: p.role, team: p.team });
        if (p.team) teams.add(p.team);
      }
    }
    for (const t of [...teams].sort((a, b) => a.length - b.length)) {
      const base = t.replace(/\s*\(.*\)$/, "");
      for (const key of [norm(t), norm(base), norm(noSuffix(base))])
        if (key && !this.teams.has(key)) this.teams.set(key, t);
    }
  }

  player(text: string, team?: string): Hit | null {
    const words = text.trim().split(/\s+/);
    for (const cand of [text.trim(), words[words.length - 1]]) {
      const hits = this.players.get(cand.toLowerCase());
      if (hits?.length) return hits.find((h) => team && h.team === team) ?? hits[0];
    }
    return null;
  }

  team(text: string): string | null {
    const key = norm(text);
    return TEAM_ALIASES[key] ?? this.teams.get(key) ?? this.teams.get(norm(noSuffix(text))) ?? null;
  }
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");

export interface SheepNews { title: string; date: string; link: string }

export async function fetchSheepNews(window = "3d"): Promise<SheepNews[]> {
  const params = new URLSearchParams({ q: `site:sheepesports.com when:${window}`, hl: "en-US", gl: "US", ceid: "US:en" });
  const res = await fetch(`${RSS}?${params}`, {
    headers: { "User-Agent": "lol-scouting (outil de scouting privé)" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google News : HTTP ${res.status}`);
  const xml = await res.text();
  const out: SheepNews[] = [];
  for (const item of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const tag = (name: string) => decode(item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? "");
    const d = new Date(tag("pubDate"));
    if (isNaN(+d)) continue;
    out.push({ title: tag("title"), date: d.toISOString().slice(0, 10), link: tag("link") });
  }
  return out;
}

/** Lignes au format des rumeurs Leaguepedia (mêmes clés que la requête Cargo de live.ts) */
export function sheepRumors(news: SheepNews[], region: Region, since: string): Record<string, string>[] {
  const index = new Index(region);
  const rows: Record<string, string>[] = [];
  for (const n of news) {
    if (n.date < since) continue;
    const parsed = parseTitle(n.title);
    if (!parsed) continue;
    let team = index.team(parsed.team);
    let names = parsed.players;
    if (!team && names.length === 1 && index.team(names[0]) && index.player(parsed.team)) {
      // « Fnatic part ways with Razork » : équipe et joueur dans l'autre sens
      team = index.team(names[0]);
      names = [parsed.team];
    }
    if (!team) continue;
    for (const name of names) {
      const hit = index.player(name, team);
      if (!hit?.role) continue;
      const [ts, te] = parsed.direction === "in" ? [hit.team ?? "Unknown", team] : [team, "Free Agent"];
      rows.push({
        date: n.date, player: hit.name, ts, te, role: hit.role, status: "Rumor", nh: "0",
        src: "Sheep Esports", link: n.link, title: cleanTitle(n.title),
      });
    }
  }
  return rows;
}
