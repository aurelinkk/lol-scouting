import "server-only";
import type { CellState, MercatoCoach, MercatoPlayer, MercatoSlot, MercatoTeam } from "@/components/MercatoBoard";
import { getMercato, getPlayers, hasRegion, type Mercato } from "@/lib/data";
import { type Region, REGIONS } from "@/lib/region";
import { fetchSheepNews, sheepRumors } from "./sheep";

/**
 * Rafraîchissement du mercato en ligne (onglet Rosters, bouton « Actualiser »).
 *
 * Le mercato complet est calculé en Python (mercato.py) avec toutes les données
 * de matchs. Ici, on part du mercato publié et on lui applique les rumeurs
 * (Sheep Esports, X...) et transferts officiels parus sur Leaguepedia depuis sa
 * génération, plus les scoops Sheep Esports pas encore saisis sur Leaguepedia
 * (titres Google News, voir sheep.ts), avec les mêmes règles :
 *  - un transfert officiel (RosterChanges) = vert, une rumeur (RosterRumors) = bleu ;
 *  - plusieurs joueurs pour un même poste dans le même article = piste, pas un transfert ;
 *  - plusieurs destinations le même jour pour un joueur = piste non tranchée ;
 *  - un départ vers un club non suivi libère son poste ; la destination est notée.
 */

const API = "https://lol.fandom.com/api.php";
const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"];
const NOT_A_TEAM = new Set(["Free Agent", "Retired", "Inactive", "Unknown", "None", ""]);

type Row = Record<string, string>;

async function cargo(tables: string, fields: string, where: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    const params = new URLSearchParams({
      action: "cargoquery", format: "json", tables, fields, where, limit: "500", offset: String(offset),
    });
    const res = await fetch(`${API}?${params}`, {
      headers: { "User-Agent": "lol-scouting (outil de scouting privé)" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Leaguepedia : HTTP ${res.status}`);
    const data = (await res.json()) as { cargoquery?: { title: Row }[]; error?: { info: string } };
    if (data.error) throw new Error(`Leaguepedia : ${data.error.info}`);
    const rows = (data.cargoquery ?? []).map((r) => r.title);
    out.push(...rows);
    if (rows.length < 500) break;
  }
  return out;
}

const short = (name: string) => name.replace(/\s*\(.*\)$/, "").trim().toLowerCase();
const same = (a?: string | null, b?: string | null) =>
  !!a && !!b && (a.toLowerCase() === b.toLowerCase() || short(a) === short(b));
const roleOf = (r: string) => (ROLES.includes(r) ? r : /coach/i.test(r) ? "Coach" : null);
const urlOf = (v?: string) => {
  const m = v?.match(/https?:\/\/[^;\s]+/);
  return m ? m[0] : null;
};
const siteOf = (url: string | null, fallback: string) =>
  url?.includes("sheepesports") ? "Sheep Esports" : url && /x\.com|twitter/.test(url) ? "X" : fallback;

interface Event {
  date: string;
  official: boolean;
  kind: "Leave" | "Join" | "Stay" | "Out";
  player: string;
  team: string;
  role: string;
  source: string;
  url: string | null;
  dest?: string;
}

/** Index nom -> fiche (région, id) pour les nouveaux venus */
let nameIndex: Map<string, MercatoPlayer> | null = null;
function lookup(name: string, region: Region): MercatoPlayer {
  if (!nameIndex) {
    nameIndex = new Map();
    for (const r of [region, ...REGIONS.filter((x) => x !== region)]) {
      if (!hasRegion(r)) continue;
      for (const [id, p] of Object.entries(getPlayers(r))) {
        for (const key of [p.name.toLowerCase(), short(p.name)]) {
          if (!nameIndex.has(key)) nameIndex.set(key, { name: p.name, id, region: r });
        }
      }
    }
  }
  const hit = nameIndex.get(name.toLowerCase()) ?? nameIndex.get(short(name));
  if (!hit) return { name };
  return { name, id: hit.id, region: hit.region === region ? undefined : hit.region };
}

export interface LiveMercato {
  region: Region;
  updatedAt: number;
  since: string;
  mercato: Mercato;
  /** Nouveautés appliquées, la plus récente en premier */
  changes: { date: string; text: string; url: string | null; official: boolean }[];
}

export async function refreshMercato(region: Region): Promise<LiveMercato | null> {
  const base = getMercato(region);
  if (!base) return null;
  const m: Mercato = JSON.parse(JSON.stringify(base));
  // Depuis le jour de génération (inclus) : réappliquer les événements du jour
  // donne le même résultat, on ne rate donc rien
  const since = (base.generated ?? new Date(Date.now() - 2 * 86400e3).toISOString()).slice(0, 10);

  const [rumors, changes] = await Promise.all([
    cargo(
      "RosterRumors",
      "Date=date,Player=player,TeamStart=ts,TeamEnd=te,RoleEnd=role,Status=status,NotHappening=nh,SourceSite=src,SourceLink=link",
      `Date>='${since}'`,
    ),
    cargo(
      "RosterChanges",
      "Date_Sort=date,Player=player,Team=team,Direction=dir,Role=role,Source=ref",
      `Date_Sort>='${since}'`,
    ),
  ]);

  // Scoops Sheep Esports pas encore saisis sur Leaguepedia (titres Google News)
  try {
    const seen = new Set([
      ...rumors.map((r) => `${short(r.player)}|${r.te}`),
      ...changes.map((c) => `${short(c.player)}|${c.team}`),
    ]);
    const done = new Set<string>(); // déjà dans le mercato publié (export Python)
    for (const t of base.teams) for (const s of t.slots) if (s.url) done.add(s.url);
    for (const r of sheepRumors(await fetchSheepNews(), region, since)) {
      const key = `${short(r.player)}|${r.te === "Free Agent" ? r.ts : r.te}`;
      if (seen.has(key) || done.has(r.link)) continue;
      seen.add(key);
      rumors.push(r);
    }
  } catch {
    // Google News indisponible : Leaguepedia seul
  }

  const teamOf = (name: string) => m.teams.find((t) => t.team === name || t.former_team === name);
  const events: Event[] = [];
  for (const c of changes) {
    const role = roleOf(c.role);
    if (!role || !teamOf(c.team) || (c.dir !== "Join" && c.dir !== "Leave")) continue;
    const url = urlOf(c.ref);
    events.push({ date: c.date.slice(0, 10), official: true, kind: c.dir as "Join" | "Leave", player: c.player,
      team: teamOf(c.team)!.team, role, source: siteOf(url, "Leaguepedia"), url });
  }

  // Pistes : plusieurs joueurs pour un poste dans un même article, ou plusieurs
  // destinations le même jour pour un joueur
  const live = rumors.filter((r) => !["1", "true", "True"].includes(r.nh) && roleOf(r.role));
  const keyOf = (r: Row) => `${r.date.slice(0, 10)}|${r.te}|${roleOf(r.role)}|${r.link || r.src}`;
  const perSlot = new Map<string, Set<string>>();
  const perPlayerDay = new Map<string, Set<string>>();
  for (const r of live) {
    if (r.ts === r.te) continue;
    perSlot.set(keyOf(r), (perSlot.get(keyOf(r)) ?? new Set()).add(r.player));
    const pd = `${r.player}|${r.date.slice(0, 10)}`;
    perPlayerDay.set(pd, (perPlayerDay.get(pd) ?? new Set()).add(r.te));
  }
  const notes: { team: string; role: string; text: string }[] = [];
  for (const r of live) {
    const role = roleOf(r.role)!;
    const url = r.link?.startsWith("http") ? r.link : null;
    const official = r.status === "Confirmed";
    const shortlist = (perSlot.get(keyOf(r))?.size ?? 0) > 1;
    const dests = perPlayerDay.get(`${r.player}|${r.date.slice(0, 10)}`) ?? new Set();
    if (shortlist || (dests.size > 1 && r.ts !== r.te)) {
      const t = teamOf(r.te);
      const text = shortlist
        ? `piste : ${[...perSlot.get(keyOf(r))!].map((p) => p.replace(/\s*\(.*\)$/, "")).join(" ou ")} · ${r.src}`
        : `piste : ${r.player.replace(/\s*\(.*\)$/, "")} (aussi ${[...dests].filter((d) => d !== r.te).join(" / ")}) · ${r.src}`;
      if (t) notes.push({ team: t.team, role, text });
      continue;
    }
    const base = { date: r.date.slice(0, 10), official, player: r.player, role, source: r.src || "Leaguepedia", url };
    if (r.ts !== r.te && teamOf(r.ts)) events.push({ ...base, kind: "Leave", team: teamOf(r.ts)!.team, dest: r.te });
    if (teamOf(r.te)) events.push({ ...base, kind: r.ts === r.te ? "Stay" : "Join", team: teamOf(r.te)!.team });
    else if (r.ts !== r.te) events.push({ ...base, kind: "Out", team: r.te, dest: r.te });
  }
  // Ordre chronologique ; à date égale : rumeur avant officiel, départ avant arrivée
  const order = { Leave: 0, Out: 0, Stay: 1, Join: 1 };
  events.sort((a, b) => a.date.localeCompare(b.date) || +a.official - +b.official || order[a.kind] - order[b.kind]);

  const applied: LiveMercato["changes"] = []; // journal des événements (non affiché)
  // date de la dernière annonce qui a touché chaque case
  const dateOf = new Map<object, string>();
  let current: Event | null = null;
  const mark = (s: MercatoSlot | MercatoCoach) => {
    if (current) dateOf.set(s, current.date);
  };
  const status = (e: Event) => (e.official ? "confirmé" : "rumeur");

  const vacate = (t: MercatoTeam, s: MercatoSlot, e: Event, label: string) => {
    s.after = null;
    s.right = null;
    s.status = label;
    s.source = e.source;
    s.url = e.url;
    if (s.before && same(s.before.name, e.player)) {
      s.left = e.official ? "out" : "rumor_out";
      if (e.dest && !NOT_A_TEAM.has(e.dest) && e.dest !== t.team) s.to = { team: e.dest };
    }
    mark(s);
  };

  for (const e of events) {
    current = e;
    if (e.role === "Coach") {
      applyCoach(m, e, region, applied, dateOf);
      continue;
    }
    const st = status(e);
    if (e.kind === "Leave" || e.kind === "Out") {
      for (const t of m.teams) {
        if (e.kind === "Leave" && t.team !== e.team) continue;
        for (const s of t.slots) {
          if (s.after && same(s.after.name, e.player)) {
            vacate(t, s, e, `départ (${st})`);
            applied.push({ date: e.date, text: `${e.player} quitte ${t.team}${e.dest && !NOT_A_TEAM.has(e.dest) ? ` → ${e.dest}` : ""}`, url: e.url, official: e.official });
          } else if (!s.after && s.before && same(s.before.name, e.player)) {
            // poste déjà libéré : on garde l'annonce la plus récente (sans repasser un officiel en rumeur)
            if (s.status.includes("confirmé") && !e.official) continue;
            s.status = `départ (${st})`;
            s.url = e.url;
            s.source = e.source;
            s.left = e.official ? "out" : "rumor_out";
            if (e.dest && !NOT_A_TEAM.has(e.dest) && e.dest !== t.team) s.to = { team: e.dest };
            mark(s);
          }
        }
      }
      continue;
    }
    const t = m.teams.find((x) => x.team === e.team)!;
    const slot = t.slots.find((s) => s.role === e.role);
    if (!slot) continue;
    // un joueur ne peut être qu'à un seul endroit
    for (const ot of m.teams)
      for (const s of ot.slots)
        if (s !== slot && s.after && same(s.after.name, e.player)) vacate(ot, s, { ...e, dest: t.team }, `parti (${st})`);
    const stays = !!slot.before && same(slot.before.name, e.player);
    if (slot.after && same(slot.after.name, e.player) && slot.status.includes(st === "confirmé" ? "confirmé" : "rumeur")) continue;
    const previous = slot.after && !same(slot.after.name, e.player) ? slot.after.name : null;
    slot.after = stays ? slot.before : lookup(e.player, region);
    // comme mercato.py : « reste » seulement pour une rumeur de maintien
    slot.status = e.kind === "Stay" ? `reste (${st})` : st;
    slot.source = e.source;
    slot.url = e.url;
    slot.right = (e.official ? "in" : "rumor_in") as CellState;
    if (slot.before && !stays && !["out", "fa", "retired"].includes(slot.left ?? "")) slot.left = e.official ? "out" : "rumor_out";
    if (slot.options?.toLowerCase().includes(short(e.player))) slot.options = undefined;
    mark(slot);
    t.changed = true;
    m.undecided = (m.undecided ?? []).filter((u) => !same(u.player, e.player));
    applied.push({
      date: e.date,
      text: stays ? `${e.player} reste chez ${t.team}` : `${e.player} → ${t.team} (${e.role})${previous ? `, à la place de ${previous}` : ""}`,
      url: e.url,
      official: e.official,
    });
  }
  for (const n of notes) {
    const s = m.teams.find((t) => t.team === n.team)?.slots.find((x) => x.role === n.role);
    if (s && !(s.after && n.text.toLowerCase().includes(short(s.after.name)))) {
      s.options = n.text;
      mark(s);
    }
  }
  // Nouveautés = différences réelles avec le mercato publié (pas les étapes
  // intermédiaires : un départ puis une arrivée le même jour = prolongation)
  const out: LiveMercato["changes"] = [];
  const nameOf = (p?: MercatoPlayer | null) => (p ? p.name.replace(/\s*\(.*\)$/, "") : "");
  for (const t of m.teams) {
    const bt = base.teams.find((x) => x.team === t.team && x.league === t.league);
    for (const s of t.slots) {
      const bs = bt?.slots.find((x) => x.role === s.role);
      const changed = !bs || nameOf(bs.after) !== nameOf(s.after) || bs.status !== s.status;
      (s as { live?: boolean }).live = changed ? true : undefined;
      if (!changed) continue;
      const official = s.status.includes("confirmé");
      const text = s.after
        ? s.before && same(s.before.name, s.after.name)
          ? `${nameOf(s.after)} reste chez ${t.team}`
          : `${nameOf(s.after)} → ${t.team} (${s.role})${s.before ? `, à la place de ${nameOf(s.before)}` : ""}`
        : `${nameOf(s.before)} quitte ${t.team}${s.to?.team ? ` → ${s.to.team}` : ""}`;
      out.push({ date: dateOf.get(s) ?? since, text, url: s.url ?? null, official });
    }
    for (const c of t.coaches ?? []) {
      const bc = bt?.coaches?.find((x) => same(x.name, c.name));
      const changed = !bc || bc.change !== c.change || bc.state !== c.state;
      (c as { live?: boolean }).live = changed ? true : undefined;
      if (!changed) continue;
      const verb = c.change === "leave" ? `quitte ${t.team}` : c.change === "new" ? `→ ${t.team}` : `reste chez ${t.team}`;
      out.push({ date: dateOf.get(c) ?? since, text: `Coach ${nameOf(c)} ${verb}`, url: c.url ?? null, official: c.state === "in" || c.state === "out" });
    }
  }
  void applied;
  return {
    region,
    updatedAt: Date.now(),
    since,
    mercato: m,
    changes: out.sort((a, b) => b.date.localeCompare(a.date)),
  };
}

function applyCoach(
  m: Mercato,
  e: Event,
  region: Region,
  applied: LiveMercato["changes"],
  dateOf: Map<object, string>,
) {
  const st = e.official ? "confirmé" : "rumeur";
  const t = m.teams.find((x) => x.team === e.team);
  if (!t) return;
  t.coaches ??= [];
  const leave = (team: MercatoTeam) => {
    const c = (team.coaches ?? []).find((x) => same(x.name, e.player));
    if (!c) return;
    if (c.change === "new") team.coaches = team.coaches!.filter((x) => x !== c);
    else {
      Object.assign(c, { change: "leave", state: e.official ? "out" : "rumor_out", status: `départ (${st})`, url: e.url, rumor: !e.official });
      dateOf.set(c, e.date);
    }
  };
  if (e.kind === "Leave" || e.kind === "Out") {
    leave(t);
    applied.push({ date: e.date, text: `Coach ${e.player} quitte ${t.team}`, url: e.url, official: e.official });
    return;
  }
  for (const other of m.teams) if (other !== t) leave(other);
  const c = t.coaches.find((x) => same(x.name, e.player));
  const state = (e.official ? "in" : "rumor_in") as CellState;
  if (c) {
    Object.assign(c, { change: c.change === "leave" ? "stay" : c.change, state, status: st, url: e.url, rumor: !e.official });
    dateOf.set(c, e.date);
  }
  else {
    const added = { ...lookup(e.player, region), role: "Coach", change: "new", state, status: st, url: e.url, rumor: !e.official, source: e.source } as MercatoCoach;
    t.coaches.push(added);
    dateOf.set(added, e.date);
  }
  applied.push({ date: e.date, text: `Coach ${e.player} → ${t.team}`, url: e.url, official: e.official });
}
