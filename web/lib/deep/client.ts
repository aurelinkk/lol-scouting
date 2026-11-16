"use client";

// Côté navigateur : appels à l'API des analyses « deep »

export interface DeepJobView {
  id: string;
  riotId: string;
  status: "queued" | "running" | "done" | "error";
  createdAt: number;
  updatedAt: number;
  idsDone: boolean;
  total: number;
  processed: number;
  maxMatches: number;
  error?: string;
}

export interface DeepState {
  jobs: DeepJobView[];
  persistent: boolean;
  riotKey: boolean;
  needsCode: boolean;
}

const CODE_KEY = "deep:accessCode";

export function getAccessCode(): string {
  try {
    return localStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAccessCode(code: string) {
  try {
    localStorage.setItem(CODE_KEY, code);
  } catch {
    /* navigation privée : on ne retient pas le code */
  }
}

const headers = () => ({ "content-type": "application/json", "x-access-code": getAccessCode() });

export async function fetchState(): Promise<DeepState> {
  const r = await fetch("/api/deep", { cache: "no-store" });
  if (!r.ok) throw new Error("API indisponible");
  return r.json();
}

export async function launchDeep(riotId: string, maxMatches = 1000): Promise<DeepJobView> {
  const r = await fetch("/api/deep", { method: "POST", headers: headers(), body: JSON.stringify({ riotId, maxMatches }) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Erreur");
  window.dispatchEvent(new Event("deep:changed"));
  return data.job;
}

export async function tickDeep() {
  const r = await fetch("/api/deep/tick", { method: "POST", headers: headers() });
  return r.json();
}

export async function deleteDeep(id: string) {
  await fetch(`/api/deep/${id}`, { method: "DELETE", headers: headers() });
  window.dispatchEvent(new Event("deep:changed"));
}

export function progress(job: DeepJobView): string {
  if (job.status === "done") return "terminé";
  if (job.status === "error") return "erreur";
  if (!job.idsDone) return "recherche des parties…";
  return `${job.processed}/${job.total} parties`;
}
