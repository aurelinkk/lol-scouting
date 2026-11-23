import { NextResponse } from "next/server";
import { getStore } from "@/lib/deep/store";
import { sendWatchAlerts } from "@/lib/mercato/alerts";
import { sendModelAlerts } from "@/lib/alerts/model";
import { type LiveMercato, refreshMercato } from "@/lib/mercato/live";
import { type Region, REGIONS } from "@/lib/region";

// Mercato rafraîchi en ligne depuis Leaguepedia (bouton « Actualiser » de l'onglet Rosters)
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const key = (region: Region) => `mercato:live:${region}`;
const regionOf = (req: Request): Region | null => {
  const r = new URL(req.url).searchParams.get("region") ?? "eu";
  return (REGIONS as string[]).includes(r) ? (r as Region) : null;
};

/** Dernière version rafraîchie (partagée entre tous les visiteurs), ou null */
export async function GET(req: Request) {
  const region = regionOf(req);
  if (!region) return NextResponse.json({ error: "région inconnue" }, { status: 400 });
  const live = await getStore().get<LiveMercato>(key(region));
  return NextResponse.json({ live });
}

/** Rafraîchit depuis Leaguepedia (au plus une fois par minute et par région) */
export async function POST(req: Request) {
  const region = regionOf(req);
  if (!region) return NextResponse.json({ error: "région inconnue" }, { status: 400 });
  const store = getStore();
  if (!(await store.lock(`mercato:cooldown:${region}`, 60))) {
    return NextResponse.json({ live: await store.get<LiveMercato>(key(region)), cached: true });
  }
  try {
    const live = await refreshMercato(region);
    if (live) {
      await store.set(key(region), live);
      await sendWatchAlerts(store, live).catch(() => {});
    }
    // Alertes du modèle de montée (nouvelle version après un run_all)
    await sendModelAlerts(store, region).catch(() => {});
    return NextResponse.json({ live });
  } catch (e) {
    await store.unlock(`mercato:cooldown:${region}`);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
