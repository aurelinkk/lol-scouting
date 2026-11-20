"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  type DeepState,
  deleteDeep,
  fetchState,
  getAccessCode,
  launchDeep,
  progress,
  setAccessCode,
} from "@/lib/deep/client";

export default function AnalysesPage() {
  const [state, setState] = useState<DeepState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [riotId, setRiotId] = useState("");
  const [maxMatches, setMaxMatches] = useState(1000);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchState()
      .then(setState)
      .catch(() => setError("L'API des analyses ne répond pas."));
  }, []);

  useEffect(() => {
    setCode(getAccessCode());
    load();
    const t = setInterval(load, 15_000);
    window.addEventListener("deep:changed", load);
    return () => {
      clearInterval(t);
      window.removeEventListener("deep:changed", load);
    };
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setAccessCode(code);
      await launchDeep(riotId.trim(), maxMatches);
      setRiotId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const control = "rounded-md border border-border bg-surface px-2 py-1.5 text-sm";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Analyses soloQ</h1>
        <p className="text-sm text-ink-2">
          Analyse approfondie d&apos;un joueur ciblé : toutes ses parties classées de l&apos;année (évolution mois par
          mois, pool de champions, postes). Environ 20 minutes pour 1 000 parties (limite de la clé Riot) : tu peux
          continuer à naviguer, une notification apparaît quand le rapport est prêt.{" "}
          <strong>Garde un onglet du site ouvert</strong> (même sur téléphone) pour que l&apos;analyse avance.
        </p>
      </div>

      {state && (!state.persistent || !state.riotKey) && (
        <div className="card p-3 text-sm">
          <div className="font-semibold">Configuration Vercel à terminer</div>
          <ul className="mt-1 list-disc pl-5 text-ink-2">
            {!state.persistent && (
              <li>
                Ajouter une base <strong>Upstash Redis</strong> (Vercel → Storage / Marketplace → Upstash Redis →
                connecter au projet). Sans elle, les analyses sont perdues entre deux requêtes.
              </li>
            )}
            {!state.riotKey && (
              <li>
                Ajouter la variable secrète <code>RIOT_API_KEY</code> (Vercel → Settings → Environment Variables), puis
                redéployer.
              </li>
            )}
          </ul>
        </div>
      )}

      <form onSubmit={submit} className="flex flex-wrap items-end gap-3 card p-3">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-ink-3">
          Riot ID
          <input
            className={control}
            placeholder="Pseudo#TAG"
            value={riotId}
            onChange={(e) => setRiotId(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Parties max
          <select className={control} value={maxMatches} onChange={(e) => setMaxMatches(Number(e.target.value))}>
            <option value={200}>200 (~5 min)</option>
            <option value={500}>500 (~10 min)</option>
            <option value={1000}>1 000 (~20 min)</option>
            <option value={2000}>2 000 (~40 min)</option>
          </select>
        </label>
        {state?.needsCode && (
          <label className="flex flex-col gap-1 text-xs text-ink-3">
            Code d&apos;accès
            <input
              type="password"
              className={`${control} w-36`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
        )}
        <button
          type="submit"
          disabled={busy || !riotId.includes("#")}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Lancer l&apos;analyse
        </button>
      </form>
      {error && <p className="text-sm text-critical">{error}</p>}

      <section className="card">
        <h2 className="border-b border-border px-4 py-2 text-sm font-semibold">Analyses</h2>
        {!state && <p className="p-4 text-sm text-ink-3">Chargement…</p>}
        {state && !state.jobs.length && <p className="p-4 text-sm text-ink-3">Aucune analyse pour l&apos;instant.</p>}
        <ul className="divide-y divide-border">
          {state?.jobs.map((j) => {
            const pct = j.status === "done" ? 100 : j.total ? Math.round((100 * j.processed) / j.total) : 0;
            return (
              <li key={j.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-48 flex-1">
                  <div className="font-medium">{j.riotId}</div>
                  <div className="text-xs text-ink-3">
                    {progress(j)} · lancée le {new Date(j.createdAt).toLocaleString("fr-FR")}
                    {j.error && <span className="text-critical"> · {j.error}</span>}
                  </div>
                </div>
                <div className="h-2 w-40 rounded-full bg-surface-2" aria-label={`${pct} %`}>
                  <div
                    className="h-2 rounded-full"
                    style={{ width: `${pct}%`, background: j.status === "error" ? "var(--critical)" : "var(--accent)" }}
                  />
                </div>
                {j.status === "done" ? (
                  <Link href={`/analyses/${j.id}`} className="text-accent hover:underline">
                    Voir le rapport
                  </Link>
                ) : (
                  <span className="w-28 text-xs text-ink-3">{pct} %</span>
                )}
                <button
                  className="text-xs text-ink-3 hover:text-critical"
                  onClick={() => confirm(`Supprimer l'analyse de ${j.riotId} ?`) && deleteDeep(j.id)}
                >
                  Supprimer
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
