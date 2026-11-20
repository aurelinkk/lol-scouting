import { NextResponse } from "next/server";
import { getStore } from "@/lib/deep/store";
import { REGIONS } from "@/lib/region";
import { type Watchlist, watchKey } from "@/lib/watch";

// Liste de suivi partagée entre tous les visiteurs (Upstash)
export const dynamic = "force-dynamic";

const regionOf = (r: string | null) => ((REGIONS as string[]).includes(r ?? "") ? r! : null);

export async function GET(req: Request) {
  const region = regionOf(new URL(req.url).searchParams.get("region") ?? "eu");
  if (!region) return NextResponse.json({ error: "région inconnue" }, { status: 400 });
  return NextResponse.json({ list: (await getStore().get<Watchlist>(watchKey(region))) ?? {} });
}

/** { region, id, name, note?, remove? } : ajoute / modifie / retire un joueur */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { region?: string; id?: string; name?: string; note?: string; remove?: boolean }
    | null;
  const region = regionOf(body?.region ?? null);
  if (!region || !body?.id || typeof body.id !== "string" || body.id.length > 120)
    return NextResponse.json({ error: "requête invalide" }, { status: 400 });
  const store = getStore();
  const list = (await store.get<Watchlist>(watchKey(region))) ?? {};
  if (body.remove) delete list[body.id];
  else
    list[body.id] = {
      name: String(body.name ?? list[body.id]?.name ?? body.id).slice(0, 80),
      note: body.note !== undefined ? String(body.note).slice(0, 300) : list[body.id]?.note,
      added: list[body.id]?.added ?? Date.now(),
    };
  await store.set(watchKey(region), list);
  return NextResponse.json({ list });
}
