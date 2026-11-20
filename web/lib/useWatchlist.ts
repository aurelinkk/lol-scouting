"use client";

import { useCallback, useEffect, useState } from "react";
import type { Region } from "@/lib/region";
import type { Watchlist } from "@/lib/watch";

/** Liste de suivi partagée de la région (lecture + modifications) */
export function useWatchlist(region: Region) {
  const [list, setList] = useState<Watchlist>({});
  useEffect(() => {
    fetch(`/api/watch?region=${region}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.list && setList(d.list))
      .catch(() => {});
  }, [region]);

  const update = useCallback(
    async (payload: { id: string; name?: string; note?: string; remove?: boolean }) => {
      // affichage immédiat, puis version du serveur
      setList((l) => {
        const next = { ...l };
        if (payload.remove) delete next[payload.id];
        else next[payload.id] = { name: payload.name ?? l[payload.id]?.name ?? payload.id, note: payload.note ?? l[payload.id]?.note, added: l[payload.id]?.added ?? Date.now() };
        return next;
      });
      const r = await fetch("/api/watch", { method: "POST", body: JSON.stringify({ region, ...payload }) });
      const d = r.ok ? await r.json() : null;
      if (d?.list) setList(d.list);
    },
    [region],
  );

  return {
    list,
    toggle: (id: string, name: string) => update(list[id] ? { id, remove: true } : { id, name }),
    setNote: (id: string, name: string, note: string) => update({ id, name, note }),
  };
}
