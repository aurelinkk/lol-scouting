"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { type DeepJobView, fetchState, progress, tickDeep } from "@/lib/deep/client";

// Présent sur toutes les pages : fait avancer les analyses « deep » en tâche
// de fond (une tranche toutes les ~2 min, la limite de la clé Riot) et
// prévient quand un rapport est prêt.
const TICK_EVERY = 125_000;
const NOTIFIED = "deep:notified";

function notified(): string[] {
  try {
    return JSON.parse(localStorage.getItem(NOTIFIED) ?? "[]");
  } catch {
    return [];
  }
}

export default function DeepRunner() {
  const [active, setActive] = useState<DeepJobView[]>([]);
  const [toast, setToast] = useState<DeepJobView | null>(null);
  const lastTick = useRef(0);
  const known = useRef<Record<string, string>>({});

  const refresh = useCallback(async () => {
    try {
      const state = await fetchState();
      const running = state.jobs.filter((j) => j.status === "queued" || j.status === "running");
      setActive(running);
      // Notification : une analyse vue en cours est maintenant terminée
      const seen = notified();
      for (const j of state.jobs) {
        const before = known.current[j.id];
        if (j.status === "done" && before && before !== "done" && !seen.includes(j.id)) {
          setToast(j);
          try {
            localStorage.setItem(NOTIFIED, JSON.stringify([...seen, j.id].slice(-50)));
          } catch {
            /* ignore */
          }
        }
        known.current[j.id] = j.status;
      }
      if (running.length && state.riotKey && Date.now() - lastTick.current > TICK_EVERY) {
        lastTick.current = Date.now();
        await tickDeep();
        refresh();
      }
    } catch {
      /* API indisponible (ex : build local sans serveur) : on réessaie plus tard */
    }
  }, []);

  // Vérification fréquente seulement quand une analyse tourne (quota Upstash)
  const activeRef = useRef(false);
  activeRef.current = active.length > 0;
  useEffect(() => {
    refresh();
    let idle = 0;
    const timer = setInterval(() => {
      idle += 20;
      if (activeRef.current || idle >= 120) {
        idle = 0;
        refresh();
      }
    }, 20_000);
    const onChange = () => {
      lastTick.current = 0; // nouvelle demande : on lance une tranche tout de suite
      refresh();
    };
    window.addEventListener("deep:changed", onChange);
    return () => {
      clearInterval(timer);
      window.removeEventListener("deep:changed", onChange);
    };
  }, [refresh]);

  return (
    <>
      {active.length > 0 && (
        <Link
          href="/analyses"
          className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs shadow-lg hover:bg-surface-2"
          title="Analyses soloQ en cours (garde un onglet du site ouvert pour qu'elles avancent)"
        >
          <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: "var(--accent)" }} />
          {active[0].riotId} · {progress(active[0])}
          {active.length > 1 && <span className="text-ink-3">+{active.length - 1}</span>}
        </Link>
      )}
      {toast && (
        <div className="fixed bottom-16 right-4 z-40 max-w-xs card p-3 text-sm shadow-xl">
          <div className="font-semibold">Analyse terminée</div>
          <div className="text-ink-2">{toast.riotId}</div>
          <div className="mt-2 flex gap-3">
            <Link href={`/analyses/${toast.id}`} className="text-accent hover:underline" onClick={() => setToast(null)}>
              Voir le rapport
            </Link>
            <button className="text-ink-3 hover:text-ink" onClick={() => setToast(null)}>
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
}
