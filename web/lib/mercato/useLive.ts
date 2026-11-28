"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MercatoTeam } from "@/components/MercatoBoard";
import type { Region } from "@/lib/region";
import { isStale } from "./stale";

export interface LiveChange {
  date: string;
  text: string;
  url: string | null;
  official: boolean;
  league?: string;
  team?: string;
}
export interface LiveMercatoState {
  updatedAt: number;
  since?: string;
  mercato: { teams: MercatoTeam[]; undecided?: { player: string; id?: string; options: string[] }[]; generated?: string };
  changes: LiveChange[];
}

const cacheKey = (region: Region) => `mercato:live:${region}`;
const readCache = (region: Region): LiveMercatoState | null => {
  try {
    const raw = localStorage.getItem(cacheKey(region));
    return raw ? (JSON.parse(raw) as LiveMercatoState) : null;
  } catch {
    return null;
  }
};
const writeCache = (region: Region, live: LiveMercatoState) => {
  try {
    localStorage.setItem(cacheKey(region), JSON.stringify(live));
  } catch {
    // stockage plein ou bloqué : pas grave, la version partagée suffit
  }
};

/** Une seule mise à jour à la fois par région, même si plusieurs composants la demandent */
const pending = new Map<Region, Promise<LiveMercatoState | null>>();

/**
 * Mercato en direct d'une région (Rosters, Données, Besoins, page équipe) :
 *  1. tout de suite la dernière version vue dans ce navigateur ;
 *  2. puis la version partagée (Upstash), mise à jour toutes les heures par GitHub ;
 *  3. si elle date de plus d'AUTO_REFRESH_MS, mise à jour en arrière-plan.
 * Une version qui part d'un autre export que le mercato publié est ignorée.
 */
export function useLiveMercato(region: Region, generated?: string, { autoRefresh = true } = {}) {
  const [live, setLive] = useState<LiveMercatoState | null>(null);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const accept = useCallback(
    (l: LiveMercatoState | null | undefined) => {
      if (!l || l.mercato.generated !== generated || !mounted.current) return false;
      setLive((cur) => (cur && cur.updatedAt > l.updatedAt ? cur : l));
      writeCache(region, l);
      return true;
    },
    [region, generated],
  );

  const refresh = useCallback(
    async (background = false) => {
      setLoading(true);
      setAuto(background);
      setError(null);
      try {
        let p = pending.get(region);
        if (!p) {
          p = fetch(`/api/mercato?region=${region}`, { method: "POST" }).then(async (r) => {
            const d = await r.json();
            if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
            return (d.live ?? null) as LiveMercatoState | null;
          });
          pending.set(region, p);
          p.finally(() => pending.delete(region)).catch(() => {});
        }
        accept(await p);
      } catch (e) {
        if (!background) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (mounted.current) {
          setLoading(false);
          setAuto(false);
        }
      }
    },
    [region, accept],
  );

  // 1. cache du navigateur, avant le premier affichage (pas de retour à l'export)
  useLayoutEffect(() => {
    const cached = readCache(region);
    if (cached && cached.mercato.generated === generated) setLive(cached);
  }, [region, generated]);

  // 2-3. version partagée, puis mise à jour si elle est vieille
  useEffect(() => {
    mounted.current = true;
    fetch(`/api/mercato?region=${region}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        accept(d?.live);
        if (autoRefresh && generated && isStale(d?.live, generated)) refresh(true);
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
    };
  }, [region, generated, autoRefresh, accept, refresh]);

  return { live, loading, auto, error, refresh: () => refresh(false) };
}

/** Nouveautés déjà vues dans ce navigateur (pour ne mettre en avant que les vraies nouveautés) */
export function useSeenNews(region: Region) {
  const key = `mercato:seen:${region}`;
  const [seen, setSeen] = useState<Set<string> | null>(null);
  useLayoutEffect(() => {
    try {
      setSeen(new Set(JSON.parse(localStorage.getItem(key) ?? "[]") as string[]));
    } catch {
      setSeen(new Set());
    }
  }, [key]);
  const markSeen = useCallback(
    (keys: string[]) => {
      try {
        const all = new Set(JSON.parse(localStorage.getItem(key) ?? "[]") as string[]);
        keys.forEach((k) => all.add(k));
        localStorage.setItem(key, JSON.stringify([...all].slice(-2000)));
      } catch {
        // pas de stockage : tout reste « nouveau »
      }
    },
    [key],
  );
  return { seen, markSeen };
}
