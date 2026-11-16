import "server-only";
import { RateLimited, riot } from "./riot";
import { getStore } from "./store";

/**
 * Analyse soloQ « deep » d'un joueur : toutes ses parties classées de l'année.
 * Trop long pour une seule fonction Vercel (≈ 1 requête Riot par partie, 100
 * requêtes / 2 min) : on avance par tranches (`tick`), déclenchées par les
 * onglets ouverts du site. Tout l'état est dans le stockage (Upstash Redis).
 */

export type JobStatus = "queued" | "running" | "done" | "error";

export interface DeepJob {
  id: string;
  riotId: string;
  gameName: string;
  tagLine: string;
  puuid?: string;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  since: string;
  maxMatches: number;
  idsDone: boolean;
  total: number;
  processed: number;
  error?: string;
}

export interface GameRow {
  t: number; // début de partie (ms)
  role: string | null;
  champ: string;
  win: boolean;
  k: number;
  d: number;
  a: number;
  cs: number;
  gold: number;
  dmg: number;
  vis: number;
  min: number;
  kp: number;
  ds: number;
}

export interface Agg {
  games: number;
  winrate: number;
  kda: number;
  deaths: number;
  cs_min: number;
  gold_min: number;
  dpm: number;
  vision_min: number;
  kp: number;
  dmg_share: number;
}

export interface DeepReport {
  riotId: string;
  generatedAt: number;
  first: string | null;
  last: string | null;
  summary: Agg;
  roles: { role: string; games: number; share: number }[];
  months: ({ month: string } & Agg)[];
  champions: ({ champion: string } & Agg)[];
}

const K = {
  jobs: "deep:jobs",
  job: (id: string) => `deep:job:${id}`,
  ids: (id: string) => `deep:ids:${id}`,
  rows: (id: string) => `deep:rows:${id}`,
  report: (id: string) => `deep:report:${id}`,
  lock: "deep:tick",
  cooldown: "deep:cooldown",
};

const ROLE: Record<string, string> = { TOP: "Top", JUNGLE: "Jungle", MIDDLE: "Mid", BOTTOM: "Bot", UTILITY: "Support" };
const BUDGET = Number(process.env.DEEP_TICK_BUDGET ?? 80); // requêtes Riot par tranche

export async function listJobs(): Promise<DeepJob[]> {
  const store = getStore();
  const ids = (await store.get<string[]>(K.jobs)) ?? [];
  const jobs = await Promise.all(ids.map((id) => store.get<DeepJob>(K.job(id))));
  return jobs.filter((j): j is DeepJob => !!j);
}

export async function getJob(id: string) {
  const store = getStore();
  const [job, report] = await Promise.all([store.get<DeepJob>(K.job(id)), store.get<DeepReport>(K.report(id))]);
  return { job, report };
}

export async function createJob(riotId: string, maxMatches = 1000): Promise<DeepJob> {
  const [gameName, tagLine] = riotId.split("#").map((s) => s.trim());
  if (!gameName || !tagLine) throw new Error("Riot ID attendu sous la forme Pseudo#TAG");
  const store = getStore();
  const existing = (await listJobs()).find(
    (j) => j.riotId.toLowerCase() === `${gameName}#${tagLine}`.toLowerCase() && (j.status === "queued" || j.status === "running"),
  );
  if (existing) return existing;
  const now = Date.now();
  const job: DeepJob = {
    id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    riotId: `${gameName}#${tagLine}`,
    gameName,
    tagLine,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    since: `${new Date().getFullYear()}-01-01`,
    maxMatches: Math.min(Math.max(maxMatches, 20), 2000),
    idsDone: false,
    total: 0,
    processed: 0,
  };
  await store.set(K.job(job.id), job);
  const all = [job.id, ...((await store.get<string[]>(K.jobs)) ?? [])];
  // On garde les 30 dernières analyses
  for (const old of all.slice(30)) await deleteJob(old);
  await store.set(K.jobs, all.slice(0, 30));
  return job;
}

export async function deleteJob(id: string) {
  const store = getStore();
  await Promise.all([K.job(id), K.ids(id), K.rows(id), K.report(id)].map((k) => store.del(k)));
  await store.set(K.jobs, ((await store.get<string[]>(K.jobs)) ?? []).filter((x) => x !== id));
}

interface MatchDto {
  info: {
    gameStartTimestamp: number;
    gameDuration: number;
    participants: {
      puuid: string;
      teamId: number;
      teamPosition: string;
      championName: string;
      kills: number;
      deaths: number;
      assists: number;
      totalMinionsKilled: number;
      neutralMinionsKilled: number;
      goldEarned: number;
      totalDamageDealtToChampions: number;
      visionScore: number;
      win: boolean;
    }[];
  };
}

function toRow(m: MatchDto, puuid: string): GameRow | null {
  const minutes = m.info.gameDuration / 60;
  if (minutes < 10) return null; // remake
  const me = m.info.participants.find((p) => p.puuid === puuid);
  if (!me) return null;
  const team = m.info.participants.filter((p) => p.teamId === me.teamId);
  const teamKills = team.reduce((n, p) => n + p.kills, 0) || 1;
  const teamDmg = team.reduce((n, p) => n + p.totalDamageDealtToChampions, 0) || 1;
  return {
    t: m.info.gameStartTimestamp,
    role: ROLE[me.teamPosition] ?? null,
    champ: me.championName,
    win: me.win,
    k: me.kills,
    d: me.deaths,
    a: me.assists,
    cs: me.totalMinionsKilled + me.neutralMinionsKilled,
    gold: me.goldEarned,
    dmg: me.totalDamageDealtToChampions,
    vis: me.visionScore,
    min: minutes,
    kp: (me.kills + me.assists) / teamKills,
    ds: me.totalDamageDealtToChampions / teamDmg,
  };
}

/** Fait avancer la plus ancienne analyse en cours d'au plus BUDGET requêtes Riot. */
export async function tick(): Promise<{ ran: boolean; job?: DeepJob; reason?: string }> {
  const store = getStore();
  const cooldown = (await store.get<number>(K.cooldown)) ?? 0;
  if (cooldown > Date.now()) return { ran: false, reason: "pause demandée par Riot" };
  const job = (await listJobs())
    .filter((j) => j.status === "queued" || j.status === "running")
    .sort((a, b) => a.createdAt - b.createdAt)[0];
  if (!job) return { ran: false, reason: "aucune analyse en attente" };
  if (!(await store.lock(K.lock, 110))) return { ran: false, reason: "une tranche est déjà en cours" };

  let calls = 0;
  try {
    job.status = "running";
    if (!job.puuid) {
      const acc = await riot<{ puuid: string }>(
        `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(job.gameName)}/${encodeURIComponent(job.tagLine)}`,
      );
      calls++;
      if (!acc) throw new Error(`Riot ID introuvable : ${job.riotId}`);
      job.puuid = acc.puuid;
    }
    const ids = (await store.get<string[]>(K.ids(job.id))) ?? [];
    const startTime = Math.floor(new Date(job.since).getTime() / 1000);
    while (!job.idsDone && calls < BUDGET) {
      const count = Math.min(100, job.maxMatches - ids.length);
      const page =
        (await riot<string[]>(`/lol/match/v5/matches/by-puuid/${job.puuid}/ids`, {
          queue: 420,
          start: ids.length,
          count,
          startTime,
        })) ?? [];
      calls++;
      ids.push(...page);
      if (page.length < count || ids.length >= job.maxMatches) job.idsDone = true;
    }
    await store.set(K.ids(job.id), ids);
    job.total = ids.length;

    let batch: GameRow[] = [];
    while (job.idsDone && job.processed < job.total && calls < BUDGET) {
      const m = await riot<MatchDto>(`/lol/match/v5/matches/${ids[job.processed]}`);
      calls++;
      const row = m ? toRow(m, job.puuid!) : null;
      if (row) batch.push(row);
      job.processed++;
      if (batch.length >= 10) {
        await store.push(K.rows(job.id), batch);
        batch = [];
        job.updatedAt = Date.now();
        await store.set(K.job(job.id), job);
      }
    }
    await store.push(K.rows(job.id), batch);

    if (job.idsDone && job.processed >= job.total) {
      const rows = await store.range<GameRow>(K.rows(job.id));
      await store.set(K.report(job.id), buildReport(job.riotId, rows));
      job.status = "done";
    }
  } catch (e) {
    if (e instanceof RateLimited) {
      await store.set(K.cooldown, Date.now() + e.retryAfter * 1000);
    } else {
      job.status = "error";
      job.error = e instanceof Error ? e.message : String(e);
    }
  } finally {
    job.updatedAt = Date.now();
    await store.set(K.job(job.id), job);
    await store.unlock(K.lock);
  }
  return { ran: true, job };
}

function aggregate(rows: GameRow[]): Agg {
  const n = rows.length || 1;
  const sum = (f: (r: GameRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const minutes = sum((r) => r.min) || 1;
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return {
    games: rows.length,
    winrate: r3(sum((r) => (r.win ? 1 : 0)) / n),
    kda: r3((sum((r) => r.k) + sum((r) => r.a)) / Math.max(sum((r) => r.d), 1)),
    deaths: r3(sum((r) => r.d) / n),
    cs_min: r3(sum((r) => r.cs) / minutes),
    gold_min: r3(sum((r) => r.gold) / minutes),
    dpm: r3(sum((r) => r.dmg) / minutes),
    vision_min: r3(sum((r) => r.vis) / minutes),
    kp: r3(sum((r) => r.kp) / n),
    dmg_share: r3(sum((r) => r.ds) / n),
  };
}

export function buildReport(riotId: string, rows: GameRow[]): DeepReport {
  const sorted = [...rows].sort((a, b) => a.t - b.t);
  const group = <K extends string>(key: (r: GameRow) => K | null) => {
    const m = new Map<K, GameRow[]>();
    for (const r of sorted) {
      const k = key(r);
      if (k === null) continue;
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return m;
  };
  const byRole = group((r) => r.role);
  const byMonth = group((r) => new Date(r.t).toISOString().slice(0, 7));
  const byChamp = group((r) => r.champ);
  return {
    riotId,
    generatedAt: Date.now(),
    first: sorted.length ? new Date(sorted[0].t).toISOString().slice(0, 10) : null,
    last: sorted.length ? new Date(sorted[sorted.length - 1].t).toISOString().slice(0, 10) : null,
    summary: aggregate(sorted),
    roles: [...byRole.entries()]
      .map(([role, rs]) => ({ role, games: rs.length, share: Math.round((rs.length / sorted.length) * 1000) / 1000 }))
      .sort((a, b) => b.games - a.games),
    months: [...byMonth.entries()].map(([month, rs]) => ({ month, ...aggregate(rs) })),
    champions: [...byChamp.entries()]
      .map(([champion, rs]) => ({ champion, ...aggregate(rs) }))
      .sort((a, b) => b.games - a.games),
  };
}

/** Code d'accès optionnel (variable DEEP_ACCESS_CODE sur Vercel). */
export function checkAccess(req: Request): boolean {
  const code = process.env.DEEP_ACCESS_CODE;
  return !code || req.headers.get("x-access-code") === code;
}
