import { NextResponse } from "next/server";
import { getStore } from "@/lib/deep/store";
import { computeLiveChances, type LiveChances } from "@/lib/mercato/chances";
import { type Region, REGIONS } from "@/lib/region";

// Chances de montée et de maintien corrigées par le mercato en cours (voir lib/mercato/chances.ts)
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_AGE = 10 * 60 * 1000; // recalcul au plus toutes les 10 min (le mercato en ligne bouge toutes les heures)

export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = url.searchParams.get("region") ?? "eu";
  if (!(REGIONS as string[]).includes(r)) return NextResponse.json({ error: "région inconnue" }, { status: 400 });
  const region = r as Region;
  const store = getStore();
  const key = `chances:${region}`;
  let data = await store.get<LiveChances>(key).catch(() => null);
  if (!data || Date.now() - data.generated > MAX_AGE || url.searchParams.has("fresh")) {
    data = await computeLiveChances(region);
    if (data) await store.set(key, data).catch(() => {});
  }
  if (!data) return NextResponse.json({ error: "modèle absent" }, { status: 404 });
  const id = url.searchParams.get("id");
  if (id) return NextResponse.json({ generated: data.generated, up: data.up[id] ?? null, stay: data.stay[id] ?? null });
  // Liste : chances seulement (le détail par région est demandé joueur par joueur)
  const slim = (m: LiveChances["up"]) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [v.p, v.why]]));
  return NextResponse.json({ generated: data.generated, up: slim(data.up), stay: slim(data.stay) });
}
